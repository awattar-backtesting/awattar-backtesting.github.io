import { parse } from "date-fns";
import Decimal from "decimal.js";

/**
 * Holds aWATTar EPEX SPOT market prices indexed by `yyyyMMdd`. The
 * actual fetching is pluggable via a `fetcher(unixStampMs) -> string`
 * function, so the same class works in the browser (HTTP fetch) and
 * in Node (filesystem reads against docs/cache60/).
 */
export class Marketdata {
    /* localStorage cache key — bump when the stored shape of `data` changes. */
    static version = "2023-12-29_v2";

    data = {};
    version = Marketdata.version;

    constructor(fetcher) {
        this.fetcher = fetcher;
    }

    async addDay(fullday) {
        if (fullday in this.data) {
            return;
        }
        this.data[fullday] = "requesting";

        var date = parse(fullday, "yyyyMMdd", new Date());
        var unixStamp = date.getTime();

        const jsonText = await this.fetcher(unixStamp);
        const d = JSON.parse(jsonText);

        this.data[fullday] = [];
        for (var i = 0; i < d.data.length; i++) {
            this.data[fullday][i] = new Decimal(d.data[i].marketprice).dividedBy(10).toFixed(3);
        }
    }
}

/**
 * Browser fetcher: tries the local /cache60/ first, then falls back to
 * the aWATTar API with retries. `onWarning` is called when a retry is
 * triggered. Returns the response body as a JSON string.
 */
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 10000;

export function createBrowserFetcher(onWarning = () => {}) {
    return async function fetchAwattarMarketdata(unixStamp) {
        try {
            const cached = await fetch('/cache60/' + unixStamp);
            if (cached.ok) return await cached.text();
        } catch { /* fall through to live API */ }

        // aWATTar API fallback. Be gentle: aWATTar omits CORS headers on
        // failures so we cannot read 'x-retry-in' to back off precisely.
        const url = 'https://api.awattar.at/v1/marketdata?start=' + unixStamp;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) {
                await sleep(RETRY_DELAY_MS);
            }
            try {
                const response = await fetch(url);
                if (response.ok) return await response.text();
            } catch (error) {
                console.log("Request failed; will retry to get Awattar market data:", error);
            }
            onWarning("Failed to obtain market data from aWATTar, initiating retry. Please wait a few seconds.");
        }
        throw new Error(`aWATTar marketdata fetch failed after ${MAX_RETRIES} retries`);
    };
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}
