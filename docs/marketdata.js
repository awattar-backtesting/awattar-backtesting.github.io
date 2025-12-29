import { parse } from "https://cdn.skypack.dev/date-fns@2.16.1";

export class Marketdata {
    data = {}

    /* bump if format changes */
    version = "2023-12-29_v2";

    async addDay(fullday) {
        if (fullday in this.data) {
            // console.log("cache hit for ", fullday);
            return;
        }
        this.data[fullday] = "requesting"

        var date = parse(fullday, "yyyyMMdd", new Date());
        var unixStamp = date.getTime();

        const response = await fetchAwattarMarketdata(unixStamp); 
        const d = await response.json();
        var i = 0;

        this.data[fullday] = []
        for (i = 0; i < d['data'].length; i++) {
            this.data[fullday][i]       = new Decimal(d['data'][i].marketprice).dividedBy(10).toFixed(3);
        }
    }
}

export function genMarketdata() {
    return new Marketdata();
}

async function fetchAwattarMarketdata(unixStamp) {
    /* try cache popluated at github.io first */
    var response;
    try {
        response = await fetch('/cache60/' + unixStamp)
    } catch (error) { }
    if (response && response.ok) {
        return response;
    }


    /* otherwise try aWATTar API, be gentle */

    // cannot access 'x-retry-in' header from response as CORS headers are not returned on failures from Awattar
    var waitForRetryMillis = 10000;

    var retryFetch = 0;
    do {
        try {
            response = await fetch('https://api.awattar.at/v1/marketdata?start=' + unixStamp)
        } catch (error) {
            console.log("Requested failed; will retry to get Awattar market data:", error);
            displayWarning("Failed to obtain market data from aWATTar, initiating retry. Please wait a few seconds.");
            retryFetch++;
        }
        if (response && response.ok || retryFetch > 10) {
            return response;
        } // else
        if (retryFetch > 0) {
            await sleep (waitForRetryMillis);
        }
    } while (retryFetch > 0);
}

function sleep (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}
