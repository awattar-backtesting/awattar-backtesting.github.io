import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import Decimal from "decimal.js";
import { aggregateCosts } from "../docs/calc/costs.js";
import { SLOTS_PER_DAY } from "../docs/calc/slots.js";

/**
 * Synthetic fixtures isolate aggregateCosts from the CSV/XLSX
 * pipeline: we build a tracker, a marketdata-shape stub, and a
 * minimal h0Sheet directly. This pins the math (priceCents = Σ
 * usage·price, h0NormKwh = Σ h0Profile, etc.) without depending on
 * any provider sample.
 */

const QUARTERS_PER_SLOT = 96 / SLOTS_PER_DAY;

/**
 * Build an XLSX-style sheet with a constant value in every relevant
 * row of the requested zone/day-type column. computeH0Day reads
 * cells [c=col, r=3..3+95]; we populate exactly those 96 cells.
 */
function makeH0Sheet(col, valuePerQuarter) {
    const sheet = {};
    for (let r = 3; r < 3 + 96; r++) {
        const addr = XLSX.utils.encode_cell({ c: col, r });
        sheet[addr] = { v: valuePerQuarter, t: "n" };
    }
    sheet["!ref"] = XLSX.utils.encode_range(
        { c: 0, r: 0 },
        { c: col, r: 3 + 96 },
    );
    return sheet;
}

function makeTracker(days, usagePerSlot) {
    const data = {};
    for (const day of days) {
        data[day] = {};
        for (let s = 0; s < SLOTS_PER_DAY; s++) {
            data[day][s] = new Decimal(usagePerSlot);
        }
    }
    return { days: new Set(days), data };
}

function makeMarketdata(days, pricePerSlot) {
    const data = {};
    for (const day of days) {
        data[day] = new Array(SLOTS_PER_DAY).fill(pricePerSlot);
    }
    return { data };
}

describe("aggregateCosts", () => {
    it("sums usage·price and h0-normalized values for a single Werktag", () => {
        // 2024-01-15 is a Monday in Winter → col D (index 3)
        const day = "20240115";
        const h0Sheet = makeH0Sheet(3, 0.01);
        const tracker = makeTracker([day], 1.0);
        const marketdata = makeMarketdata([day], 10);

        const { daily, monthly } = aggregateCosts(tracker, marketdata, h0Sheet);

        expect(Object.keys(daily)).toEqual([day]);
        expect(Object.keys(monthly)).toEqual(["202401"]);

        const expectedH0Slot = 0.01 * QUARTERS_PER_SLOT;
        const expectedH0Kwh = expectedH0Slot * SLOTS_PER_DAY;

        const d = daily[day];
        expect(d.priceCents.toString()).toBe("240");
        expect(d.kwh.toString()).toBe("24");
        expect(d.h0NormKwh.toFixed(6)).toBe(new Decimal(expectedH0Kwh).toFixed(6));
        expect(d.h0NormPriceCents.toFixed(6)).toBe(new Decimal(expectedH0Kwh * 10).toFixed(6));

        const m = monthly["202401"];
        expect(m.priceCents.toString()).toBe(d.priceCents.toString());
        expect(m.kwh.toString()).toBe(d.kwh.toString());
    });

    it("rolls multiple days within a month into the monthly bucket", () => {
        // 2024-01-15 Monday (Werktag), 2024-01-20 Saturday (Samstag) — both Winter.
        // Different sheet columns, but we populate both for simplicity.
        const days = ["20240115", "20240120"];
        const h0Sheet = {};
        // Werktag (col D = 3) and Samstag (col B = 1)
        Object.assign(h0Sheet, makeH0Sheet(3, 0.01));
        Object.assign(h0Sheet, makeH0Sheet(1, 0.02));

        const tracker = makeTracker(days, 2.0);
        const marketdata = makeMarketdata(days, 5);

        const { daily, monthly } = aggregateCosts(tracker, marketdata, h0Sheet);

        expect(Object.keys(daily).sort()).toEqual(days);
        expect(Object.keys(monthly)).toEqual(["202401"]);

        const sumPrice = daily["20240115"].priceCents.plus(daily["20240120"].priceCents);
        const sumKwh = daily["20240115"].kwh.plus(daily["20240120"].kwh);
        expect(monthly["202401"].priceCents.toString()).toBe(sumPrice.toString());
        expect(monthly["202401"].kwh.toString()).toBe(sumKwh.toString());

        // Each day: 24 slots × 2 kWh × 5 cents = 240 cents
        expect(daily["20240115"].priceCents.toString()).toBe("240");
        expect(daily["20240120"].priceCents.toString()).toBe("240");
    });

    it("groups across month boundaries into separate monthly buckets", () => {
        // 2024-01-31 Wed (Werktag, Winter), 2024-02-01 Thu (Werktag, Winter)
        const days = ["20240131", "20240201"];
        const h0Sheet = makeH0Sheet(3, 0.01);
        const tracker = makeTracker(days, 1.0);
        const marketdata = makeMarketdata(days, 10);

        const { daily, monthly } = aggregateCosts(tracker, marketdata, h0Sheet);

        expect(Object.keys(monthly).sort()).toEqual(["202401", "202402"]);
        expect(monthly["202401"].priceCents.toString()).toBe(daily["20240131"].priceCents.toString());
        expect(monthly["202402"].priceCents.toString()).toBe(daily["20240201"].priceCents.toString());
    });

    it("only sums hours present in tracker.data (partial days)", () => {
        const day = "20240115";
        const h0Sheet = makeH0Sheet(3, 0.01);
        // Only hours 8 and 9 present
        const tracker = {
            days: new Set([day]),
            data: { [day]: { 8: new Decimal(1.0), 9: new Decimal(1.0) } },
        };
        const marketdata = makeMarketdata([day], 10);

        const { daily } = aggregateCosts(tracker, marketdata, h0Sheet);
        expect(daily[day].kwh.toString()).toBe("2");
        expect(daily[day].priceCents.toString()).toBe("20");

        // h0NormKwh sums only the two hours present
        const expectedH0Kwh = (0.01 * QUARTERS_PER_SLOT) * 2;
        expect(daily[day].h0NormKwh.toFixed(6)).toBe(new Decimal(expectedH0Kwh).toFixed(6));
    });
});
