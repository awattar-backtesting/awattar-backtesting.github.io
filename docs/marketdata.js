import { parse } from "date-fns";
import Decimal from "decimal.js";
import { QUARTER_HOURLY_AUCTION_GO_LIVE } from "./tariffs.js";

/**
 * Holds EPEX SPOT day-ahead prices indexed by `yyyyMMdd`. Two parallel
 * maps because the hourly auction (cache60) and the quarter-hourly
 * auction (cache15) clear independently — averaging four 15-min prices
 * does NOT reproduce the hourly index, so a tariff that bills against
 * the hourly product needs the hourly data verbatim, and vice versa.
 *
 *   data60[day]  Decimal[24]    always populated
 *   data15[day]  Decimal[96]    populated only for day >= 2025-10-01
 *
 * Fetching is pluggable via `fetcher(unixStampMs, source) -> string`,
 * where `source` is "hourly" or "quarter-hourly". The same class works
 * in the browser (HTTP fetch against /cache60 or /cache15) and in Node
 * (filesystem reads).
 */
export class Marketdata {
    /* localStorage cache key — bump when the stored shape of `data` changes. */
    static version = "2026-05-06_v3";

    data60 = {};
    data15 = {};
    version = Marketdata.version;

    constructor(fetcher) {
        this.fetcher = fetcher;
    }

    /* Back-compat read alias. costs.js still reads `.data[day]` directly
     * for hourly prices; keep that working until the per-tariff fan-out
     * lands and consumers switch to `pricesFor(day, source)`. */
    get data() {
        return this.data60;
    }

    async addDay(fullday) {
        const tasks = [];
        if (!(fullday in this.data60)) {
            tasks.push(this._fetchInto(fullday, "hourly", this.data60));
        }
        if (fullday >= QUARTER_HOURLY_AUCTION_GO_LIVE && !(fullday in this.data15)) {
            // Quarter-hourly is best-effort: in the browser the upstream
            // (energy-charts.info) is blocked by CORS so the cache is the
            // only source. A miss falls through to repriceBucket's per-slot
            // fallback to hourly with an onMissingSource warning.
            tasks.push(this._fetchInto(fullday, "quarter-hourly", this.data15).catch(() => {}));
        }
        await Promise.all(tasks);
    }

    async _fetchInto(fullday, source, target) {
        target[fullday] = "requesting";
        try {
            const date = parse(fullday, "yyyyMMdd", new Date());
            const unixStamp = date.getTime();
            const jsonText = await this.fetcher(unixStamp, source);
            const d = JSON.parse(jsonText);
            target[fullday] = d.data.map(slot => new Decimal(slot.marketprice).dividedBy(10).toFixed(3));
        } catch (err) {
            delete target[fullday];
            throw err;
        }
    }

    /**
     * Return the price array for `fullday` under the requested EPEX
     * auction product. Returns undefined when the day hasn't been
     * fetched yet or the requested source is unavailable for that day
     * (e.g. quarter-hourly before 2025-10-01). Callers should treat
     * undefined as "no data" and decide whether to fall back to the
     * hourly product.
     */
    pricesFor(fullday, source) {
        const target = source === "quarter-hourly" ? this.data15 : this.data60;
        return target[fullday];
    }
}

/**
 * Browser fetcher: tries the local cache directory first, with the live
 * upstream as a fallback for the hourly product. `onWarning` is called
 * when a retry is triggered. Returns the response body as a JSON string.
 *
 *   "hourly"          → /cache60 then api.awattar.at (CORS-friendly)
 *   "quarter-hourly"  → /cache15 only — energy-charts.info pins
 *                       Access-Control-Allow-Origin to its own subdomain
 *                       so a browser fetch is impossible. Cache misses
 *                       throw and the caller (Marketdata.addDay) lets the
 *                       per-slot fallback in repriceBucket degrade to the
 *                       hourly product for that day.
 */
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;
const FETCH_TIMEOUT_MS = 15000;

export function createBrowserFetcher(onWarning = () => {}) {
    return async function fetchMarketdata(unixStamp, source = "hourly") {
        const cacheDir = source === "quarter-hourly" ? "/cache15/" : "/cache60/";
        try {
            const cached = await fetchWithTimeout(cacheDir + unixStamp);
            if (cached.ok) return await cached.text();
        } catch { /* fall through */ }

        if (source === "quarter-hourly") {
            throw new Error(`No 15-min cache entry for unix ${unixStamp}`);
        }
        return await fetchAwattar(unixStamp, onWarning);
    };
}

async function fetchAwattar(unixStamp, onWarning) {
    // aWATTar omits CORS headers on failures so we cannot read 'x-retry-in' to back off precisely.
    const url = 'https://api.awattar.at/v1/marketdata?start=' + unixStamp;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAY_MS);
        try {
            const response = await fetchWithTimeout(url);
            if (response.ok) return await response.text();
        } catch (error) {
            console.log("Request failed; will retry to get Awattar market data:", error);
        }
        onWarning("Failed to obtain market data from aWATTar, initiating retry. Please wait a few seconds.");
    }
    throw new Error(`aWATTar marketdata fetch failed after ${MAX_RETRIES} retries`);
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}
