import { parse } from "date-fns";
import Decimal from "decimal.js";

/**
 * Holds aWATTar EPEX SPOT market prices indexed by `yyyyMMdd`. The
 * actual fetching is pluggable via a `fetcher(unixStampMs) -> string`
 * function, so the same class works in the browser (HTTP fetch) and
 * in Node (filesystem reads against docs/cache60/).
 */
export class Marketdata {
    data = {}

    /* bump if format changes */
    version = "2023-12-29_v2";

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
export function createBrowserFetcher(onWarning = () => {}) {
    return async function fetchAwattarMarketdata(unixStamp) {
        var response;
        try {
            response = await fetch('/cache60/' + unixStamp);
        } catch (error) { /* fall through */ }
        if (response && response.ok) {
            return await response.text();
        }

        // Otherwise try aWATTar API, be gentle.
        // Cannot read 'x-retry-in' header from response: aWATTar omits
        // CORS headers on failures.
        var waitForRetryMillis = 10000;
        var retryFetch = 0;
        do {
            try {
                response = await fetch('https://api.awattar.at/v1/marketdata?start=' + unixStamp);
            } catch (error) {
                console.log("Requested failed; will retry to get Awattar market data:", error);
                onWarning("Failed to obtain market data from aWATTar, initiating retry. Please wait a few seconds.");
                retryFetch++;
            }
            if ((response && response.ok) || retryFetch > 10) {
                return await response.text();
            }
            if (retryFetch > 0) {
                await sleep(waitForRetryMillis);
            }
        } while (retryFetch > 0);
    };
}

function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}
