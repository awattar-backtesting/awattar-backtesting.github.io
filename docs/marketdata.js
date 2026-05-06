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
            tasks.push(this._fetchInto(fullday, "quarter-hourly", this.data15));
        }
        await Promise.all(tasks);
    }

    async _fetchInto(fullday, source, target) {
        target[fullday] = "requesting";
        const date = parse(fullday, "yyyyMMdd", new Date());
        const unixStamp = date.getTime();
        const jsonText = await this.fetcher(unixStamp, source);
        const d = JSON.parse(jsonText);
        target[fullday] = d.data.map(slot => new Decimal(slot.marketprice).dividedBy(10).toFixed(3));
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
 * Browser fetcher: tries the local cache directory first, then falls
 * back to the live API with retries. `onWarning` is called when a
 * retry is triggered. Returns the response body as a JSON string.
 *
 * Two API endpoints, picked by `source`:
 *   "hourly"          → /cache60 then api.awattar.at
 *   "quarter-hourly"  → /cache15 then api.energy-charts.info (AT bzn)
 *
 * energy-charts returns a different payload shape; we normalize to the
 * awattar shape so the rest of the loader stays format-agnostic, the
 * same way build-cache.py does for the on-disk cache.
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
        } catch { /* fall through to live API */ }

        if (source === "quarter-hourly") {
            return await fetchEnergyCharts(unixStamp, onWarning);
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

async function fetchEnergyCharts(unixStamp, onWarning) {
    const day = new Date(unixStamp).toISOString().slice(0, 10);
    const url = `https://api.energy-charts.info/price?bzn=AT&start=${day}`;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAY_MS);
        try {
            const response = await fetchWithTimeout(url);
            if (response.ok) return normalizeEnergyCharts(await response.json());
        } catch (error) {
            console.log("Request failed; will retry to get energy-charts market data:", error);
        }
        onWarning("Failed to obtain 15-min market data from energy-charts.info, initiating retry. Please wait a few seconds.");
    }
    throw new Error(`energy-charts marketdata fetch failed after ${MAX_RETRIES} retries`);
}

function normalizeEnergyCharts(raw) {
    // 15-min responses have ~96 entries (92..100 with DST); hourly fallback
    // would have ~24. We only call this for "quarter-hourly" so it should
    // always be 96-ish, but the threshold copes with either.
    const slotMinutes = raw.price.length < 26 ? 60 : 15;
    const data = raw.price.map((price, i) => {
        const ts = raw.unix_seconds[i];
        return {
            start_timestamp: ts * 1000,
            end_timestamp: (ts + slotMinutes * 60) * 1000,
            marketprice: price,
            unit: raw.unit,
        };
    });
    return JSON.stringify({ license_info: raw.license_info, data });
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
