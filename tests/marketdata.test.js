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
});
