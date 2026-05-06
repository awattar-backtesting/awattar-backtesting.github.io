import { describe, it, expect, beforeAll } from "vitest";
import Decimal from "decimal.js";
import { Tracker } from "../docs/calc/tracker.js";
import { aggregateCosts } from "../docs/calc/costs.js";
import { repriceBucket } from "../docs/calc/fanout.js";
import { Tarif } from "../docs/tariffs.js";
import { hourOfSlot, SLOTS_PER_DAY } from "../docs/calc/slots.js";
import { loadH0Sheet, newMarketdata } from "./lib/runtime.js";

/**
 * Real-data smoke test: validates that for a single post-2025-10-01 day
 *
 *   - the hourly and 15-min EPEX auctions deliver materially different
 *     bills under a synthetic non-flat consumption profile,
 *   - the per-tariff fan-out picks the right product per tariff and the
 *     resulting totals match an independent slot-by-slot recomputation.
 *
 * Catches regressions where the fan-out silently routes both products
 * through the same price array (e.g. a back-compat alias that defeats
 * the abstraction). Synthesising consumption keeps the test independent
 * of any provider sample and isolates the price-source axis.
 */

const DAY = "20251215";

function loadAt(d) {
    return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00+01:00`);
}

/* Build 96 quarter consumptions with strong within-hour variation so the
 * hourly vs. 15-min totals diverge regardless of the actual price shape. */
function syntheticConsumption() {
    return Array.from({ length: SLOTS_PER_DAY }, (_, q) => {
        const insideHour = q % 4;          // 0..3
        const ramp = (insideHour + 1) / 4; // 0.25..1.0
        return new Decimal(ramp * 0.5);    // 0.125 .. 0.5 kWh
    });
}

function makeTrackerForDay(day, kwhPerSlot) {
    const data = { [day]: {} };
    for (let q = 0; q < SLOTS_PER_DAY; q++) data[day][q] = kwhPerSlot[q];
    return { days: new Set([day]), data };
}

const passthroughTarif = (priceSource) => new Tarif(
    { id: `t_${priceSource}`, priceSource },
    function (price /* kwh, opts */) { return price; },
);

let h0Sheet, marketdata, prices60, prices15;

beforeAll(async () => {
    h0Sheet = await loadH0Sheet();
    marketdata = newMarketdata();
    await marketdata.addDay(DAY);
    prices60 = marketdata.pricesFor(DAY, "hourly");
    prices15 = marketdata.pricesFor(DAY, "quarter-hourly");
});

describe("real-data fan-out", () => {
    it(`${DAY}: cache60 has 24 entries and cache15 has 96`, () => {
        expect(prices60).toBeDefined();
        expect(prices60.length).toBe(24);
        expect(prices15).toBeDefined();
        expect(prices15.length).toBe(96);
    });

    it(`${DAY}: per-quarter prices vary within at least one hour`, () => {
        // Sanity check: the 15-min array isn't just the hourly array repeated 4×.
        // Empirically the AT day-ahead 15-min auction's within-hour mean tracks
        // the hourly index closely (Δ < 0.01 ct/kWh on most cached days), but
        // the per-quarter values do differ — that's what makes the fan-out
        // matter for non-flat consumption.
        let anyVariance = false;
        for (let h = 0; h < 24; h++) {
            const a = Number(prices15[h * 4]);
            for (let q = 1; q < 4; q++) {
                if (Math.abs(Number(prices15[h * 4 + q]) - a) > 0.05) { anyVariance = true; break; }
            }
            if (anyVariance) break;
        }
        expect(anyVariance).toBe(true);
    });

    it("repriceBucket totals match an independent slot-by-slot recomputation", () => {
        const cons = syntheticConsumption();
        const tracker = makeTrackerForDay(DAY, cons);
        const { daily } = aggregateCosts(tracker, marketdata, h0Sheet);
        const bucket = daily[DAY];

        const hourly = repriceBucket(bucket, passthroughTarif("hourly"), marketdata);
        const qh     = repriceBucket(bucket, passthroughTarif("quarter-hourly"), marketdata);

        let expectedHourly = new Decimal(0);
        let expectedQh = new Decimal(0);
        for (let q = 0; q < SLOTS_PER_DAY; q++) {
            expectedHourly = expectedHourly.plus(cons[q].times(prices60[hourOfSlot(q)]));
            expectedQh = expectedQh.plus(cons[q].times(prices15[q]));
        }
        expect(hourly.priceCents.toFixed(6)).toBe(expectedHourly.toFixed(6));
        expect(qh.priceCents.toFixed(6)).toBe(expectedQh.toFixed(6));
    });

    it("hourly and quarter-hourly bills differ for non-flat consumption", () => {
        const cons = syntheticConsumption();
        const tracker = makeTrackerForDay(DAY, cons);
        const { daily } = aggregateCosts(tracker, marketdata, h0Sheet);
        const bucket = daily[DAY];

        const hourly = repriceBucket(bucket, passthroughTarif("hourly"), marketdata);
        const qh     = repriceBucket(bucket, passthroughTarif("quarter-hourly"), marketdata);

        // Don't pin the magnitude (depends on real prices), just assert the
        // two products produce a non-trivially different bill — proves the
        // fan-out isn't aliasing them to the same array.
        const diffCt = Math.abs(Number(hourly.priceCents.minus(qh.priceCents)));
        expect(diffCt).toBeGreaterThan(0.01);
    });
});
