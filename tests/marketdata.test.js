import { describe, it, expect } from "vitest";
import { Marketdata } from "../docs/marketdata.js";
import { createNodeFetcher } from "./lib/node-fetcher.js";
import { cacheDir, cacheDir15 } from "./lib/runtime.js";

/*
 * Verify Marketdata loads both auction products for a post-go-live day
 * (2025-10-01 has both cache60 and cache15 entries) and only the hourly
 * product for a pre-go-live day.
 */

function newMarketdataWithBothCaches() {
    return new Marketdata(createNodeFetcher({
        hourly: cacheDir,
        "quarter-hourly": cacheDir15,
    }));
}

describe("Marketdata.addDay", () => {
    it("loads both hourly and quarter-hourly for 2025-10-01", async () => {
        const md = newMarketdataWithBothCaches();
        await md.addDay("20251001");

        const hourly = md.pricesFor("20251001", "hourly");
        const quarterly = md.pricesFor("20251001", "quarter-hourly");

        expect(Array.isArray(hourly)).toBe(true);
        expect(hourly.length).toBe(24);
        expect(Array.isArray(quarterly)).toBe(true);
        expect(quarterly.length).toBe(96);
    });

    it("loads only hourly for pre-go-live days", async () => {
        const md = newMarketdataWithBothCaches();
        await md.addDay("20250930");

        expect(md.pricesFor("20250930", "hourly")).toBeDefined();
        expect(md.pricesFor("20250930", "quarter-hourly")).toBeUndefined();
    });

    it("preserves the .data back-compat alias for hourly", async () => {
        const md = newMarketdataWithBothCaches();
        await md.addDay("20250930");
        expect(md.data["20250930"]).toBe(md.data60["20250930"]);
    });

    /*
     * Spring DST (2026-03-29): Europe/Vienna jumps 01:59 → 03:00, so the
     * local day has 23 hours / 92 quarter-hour slots. The upstream cache
     * stores 24 hourly / 92 quarter-hourly entries with timestamps that
     * are dense in UTC but sparse in local time. The price arrays must
     * be aligned to local slot indices so callers indexing by
     * `slotOfTimestamp(localTs)` or `localTs.getHours()` get the right
     * price (or undefined for the non-existent 02:00 hour) rather than
     * silently mispriced or out-of-bounds values.
     *
     * Regression coverage for the crash reported in #78:
     *   Uncaught Error: [DecimalError] Invalid argument: undefined
     *     at repriceBucket (fanout.js:51) → prices15[s.slot] for s.slot=95
     */
    describe("spring DST 2026-03-29", () => {
        it("aligns quarter-hourly prices to local slot indices (length 96)", async () => {
            const md = newMarketdataWithBothCaches();
            await md.addDay("20260329");
            const prices = md.pricesFor("20260329", "quarter-hourly");

            expect(Array.isArray(prices)).toBe(true);
            expect(prices.length).toBe(96);
            // Regression: previously prices was the upstream cache's dense
            // 92-entry array and prices[95] was undefined → repriceBucket
            // crashed with "Invalid argument: undefined".
            for (let i = 0; i <= 95; i++) expect(prices[i]).toBeDefined();
        });

        it("aligns hourly prices to local hour indices (length 24)", async () => {
            const md = newMarketdataWithBothCaches();
            await md.addDay("20260329");
            const prices = md.pricesFor("20260329", "hourly");

            expect(Array.isArray(prices)).toBe(true);
            expect(prices.length).toBe(24);
            for (let i = 0; i <= 23; i++) expect(prices[i]).toBeDefined();
        });

        it("does not leak the next day's 00:00 entry into hourly slot 23", async () => {
            // The cache file lists a 24th hourly entry at next-day 00:00 (the
            // upstream API returns a fixed-stride UTC window). Under dense
            // indexing this leaked into prices[23], so the 23:00 hour was
            // billed against the wrong day's price.
            const md = newMarketdataWithBothCaches();
            await md.addDay("20260329");
            await md.addDay("20260330");
            const dstPrices = md.pricesFor("20260329", "hourly");
            const nextPrices = md.pricesFor("20260330", "hourly");
            expect(dstPrices[23]).not.toBe(nextPrices[0]);
        });
    });
});
