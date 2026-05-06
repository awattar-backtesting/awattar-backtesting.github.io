import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { repriceBucket, tariffCostForBucket, bucketPriceCentsAt } from "../docs/calc/fanout.js";
import { Tarif } from "../docs/tariffs.js";

/**
 * Unit tests for the per-tariff fan-out: synthetic buckets + a stub
 * marketdata so the math is exact and independent of the cache layer.
 */

function makeBucket(slots) {
    let kwh = new Decimal(0), h0NormKwh = new Decimal(0);
    let priceCents = new Decimal(0), h0NormPriceCents = new Decimal(0);
    for (const s of slots) {
        kwh = kwh.plus(s.kwh);
        h0NormKwh = h0NormKwh.plus(s.h0Kwh);
        priceCents = priceCents.plus(s.priceCents);
        h0NormPriceCents = h0NormPriceCents.plus(s.h0Kwh.times(s.priceCents.dividedBy(s.kwh)));
    }
    return { day: slots[0]?.day, kwh, h0NormKwh, priceCents, h0NormPriceCents, slots };
}

function makeMarketdata({ data60 = {}, data15 = {} } = {}) {
    return {
        pricesFor(day, source) {
            return source === "quarter-hourly" ? data15[day] : data60[day];
        },
    };
}

function passthroughTarif(meta) {
    return new Tarif(
        meta,
        function (price /* kwh, opts */) { return price; },
    );
}

describe("repriceBucket", () => {
    it("returns the input bucket unchanged for an hourly-only tariff", () => {
        const slots = [
            { day: "20240115", slot: 0, kwh: new Decimal(2), h0Kwh: new Decimal(0.1), priceCents: new Decimal(20) },
            { day: "20240115", slot: 1, kwh: new Decimal(2), h0Kwh: new Decimal(0.1), priceCents: new Decimal(20) },
        ];
        const bucket = makeBucket(slots);
        const tarif = passthroughTarif({ id: "x", priceSource: "hourly" });
        const md = makeMarketdata();

        const out = repriceBucket(bucket, tarif, md);
        expect(out).toBe(bucket); // referential identity confirms the fast path
    });

    it("uses prices15[slot] for a quarter-hourly tariff after the go-live", () => {
        // 2025-12-01 is post-go-live. Two quarters of hour 0 (slots 0 + 1).
        const day = "20251201";
        const slots = [
            { day, slot: 0, kwh: new Decimal(2), h0Kwh: new Decimal(0.1), priceCents: new Decimal(2 * 10) },
            { day, slot: 1, kwh: new Decimal(2), h0Kwh: new Decimal(0.1), priceCents: new Decimal(2 * 10) },
        ];
        const bucket = makeBucket(slots);
        const tarif = passthroughTarif({ id: "qh", priceSource: "quarter-hourly" });

        // hourly price = 10 (used by the bucket default), 15-min prices differ per quarter
        const md = makeMarketdata({
            data60: { [day]: new Array(24).fill(10) },
            data15: { [day]: [7, 13, ...new Array(94).fill(0)] },
        });

        const out = repriceBucket(bucket, tarif, md);
        // priceCents = 2·7 + 2·13 = 40 (vs. the 40 hourly default — same total here, but the per-slot prices differ)
        expect(out.priceCents.toString()).toBe("40");
        expect(out.slots[0].priceCents.toString()).toBe("14");
        expect(out.slots[1].priceCents.toString()).toBe("26");
        // Untouched fields propagate through.
        expect(out.kwh).toBe(bucket.kwh);
        expect(out.h0NormKwh).toBe(bucket.h0NormKwh);
        // h0NormPriceCents = 0.1·7 + 0.1·13 = 2.0
        expect(out.h0NormPriceCents.toFixed(2)).toBe("2.00");
    });

    it("clamps to hourly for slots before the 2025-10-01 go-live even if declared quarter-hourly", () => {
        const day = "20240115"; // pre-go-live
        const slots = [
            { day, slot: 0, kwh: new Decimal(1), h0Kwh: new Decimal(0.0), priceCents: new Decimal(10) },
        ];
        const bucket = makeBucket(slots);
        const tarif = passthroughTarif({ id: "qh", priceSource: "quarter-hourly" });
        const md = makeMarketdata(); // no data needed — the fast path applies
        expect(repriceBucket(bucket, tarif, md)).toBe(bucket);
    });

    it("respects per-slot switchover for a tariff that flips mid-bucket", () => {
        // Slot A: 2025-09-30 (pre-go-live → hourly).
        // Slot B: 2025-10-01 (post-go-live → quarter-hourly per declaration).
        const slotA = { day: "20250930", slot: 4, kwh: new Decimal(1), h0Kwh: new Decimal(0), priceCents: new Decimal(8) };
        const slotB = { day: "20251001", slot: 4, kwh: new Decimal(1), h0Kwh: new Decimal(0), priceCents: new Decimal(8) };
        const bucket = makeBucket([slotA, slotB]);
        const tarif = passthroughTarif({
            id: "switch",
            priceSource: { before: "hourly", from: "20251001", then: "quarter-hourly" },
        });
        const md = makeMarketdata({
            data60: {
                "20250930": new Array(24).fill(8),
                "20251001": new Array(24).fill(8),
            },
            data15: {
                "20251001": new Array(96).fill(20), // distinct from hourly
            },
        });

        const out = repriceBucket(bucket, tarif, md);
        // Slot A prices at hourly[1] = 8; slot B prices at 15min[4] = 20.
        expect(out.slots[0].priceCents.toString()).toBe("8");
        expect(out.slots[1].priceCents.toString()).toBe("20");
        expect(out.priceCents.toString()).toBe("28");
    });

    it("falls back to hourly per-slot and reports missing 15-min data via onMissingSource", () => {
        const day = "20251201";
        const slots = [
            { day, slot: 0, kwh: new Decimal(1), h0Kwh: new Decimal(0), priceCents: new Decimal(10) },
            { day, slot: 1, kwh: new Decimal(1), h0Kwh: new Decimal(0), priceCents: new Decimal(10) },
        ];
        const bucket = makeBucket(slots);
        const tarif = passthroughTarif({ id: "qh", priceSource: "quarter-hourly" });
        const md = makeMarketdata({ data60: { [day]: new Array(24).fill(10) } }); // no data15
        const reported = [];
        const out = repriceBucket(bucket, tarif, md, {
            onMissingSource: (d, src) => reported.push([d, src]),
        });
        // Both slots fall back to hourly[0] = 10; total = 20.
        expect(out.priceCents.toString()).toBe("20");
        // Reported once per (day, source), even across multiple slots on the same day.
        expect(reported).toEqual([[day, "quarter-hourly"]]);
    });

    it("returns null when even the hourly fallback has no data", () => {
        const day = "20251201";
        const slots = [
            { day, slot: 0, kwh: new Decimal(1), h0Kwh: new Decimal(0), priceCents: new Decimal(10) },
        ];
        const bucket = makeBucket(slots);
        const tarif = passthroughTarif({ id: "qh", priceSource: "quarter-hourly" });
        const md = makeMarketdata(); // neither data60 nor data15
        expect(repriceBucket(bucket, tarif, md)).toBeNull();
    });
});

describe("bucketPriceCentsAt", () => {
    const day = "20251201";
    const slots = [
        { day, slot: 0, kwh: new Decimal(2), h0Kwh: new Decimal(0), priceCents: new Decimal(20) },
        { day, slot: 1, kwh: new Decimal(2), h0Kwh: new Decimal(0), priceCents: new Decimal(20) },
    ];
    const bucket = makeBucket(slots);

    it("returns the precomputed hourly priceCents for source=hourly", () => {
        const md = makeMarketdata({ data60: { [day]: new Array(24).fill(99) } });
        // Hourly fast path: helper does not look at marketdata, returns the bucket's value.
        expect(bucketPriceCentsAt(bucket, "hourly", md)).toBe(bucket.priceCents);
    });

    it("recomputes against prices15[slot] for source=quarter-hourly", () => {
        const md = makeMarketdata({
            data15: { [day]: [7, 13, ...new Array(94).fill(0)] },
        });
        // 2·7 + 2·13 = 40
        expect(bucketPriceCentsAt(bucket, "quarter-hourly", md).toString()).toBe("40");
    });

    it("returns null when 15-min data is missing for any slot's day", () => {
        const md = makeMarketdata({ data60: { [day]: new Array(24).fill(10) } });
        expect(bucketPriceCentsAt(bucket, "quarter-hourly", md)).toBeNull();
    });
});

describe("tariffCostForBucket", () => {
    it("forwards repriced price/kwh/slots into tarif.calculate", () => {
        const day = "20251201";
        const slots = [
            { day, slot: 0, kwh: new Decimal(2), h0Kwh: new Decimal(0), priceCents: new Decimal(20) },
        ];
        const bucket = makeBucket(slots);
        const tarif = new Tarif(
            { id: "qh", priceSource: "quarter-hourly" },
            function (price, kwh /* opts */) { return price.plus(kwh); },
        );
        const md = makeMarketdata({
            data60: { [day]: new Array(24).fill(10) },
            data15: { [day]: new Array(96).fill(13) },
        });
        const out = tariffCostForBucket(bucket, tarif, md);
        // price = 2·13 = 26; kwh = 2; total = 28
        expect(out.toString()).toBe("28");
    });

    it("returns null when the underlying repricing returns null", () => {
        const day = "20251201";
        const slots = [
            { day, slot: 0, kwh: new Decimal(1), h0Kwh: new Decimal(0), priceCents: new Decimal(10) },
        ];
        const bucket = makeBucket(slots);
        const tarif = passthroughTarif({ id: "qh", priceSource: "quarter-hourly" });
        const md = makeMarketdata(); // no data60 OR data15
        expect(tariffCostForBucket(bucket, tarif, md)).toBeNull();
    });
});
