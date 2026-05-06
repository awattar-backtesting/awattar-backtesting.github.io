import Decimal from "decimal.js";
import { hourOfSlot } from "./slots.js";

/**
 * Reprice a (daily or monthly) bucket against a single tariff's auction
 * selection. The bucket from aggregateCosts carries raw 15-min consumption
 * plus an hourly-source priceCents/h0NormPriceCents default; this wrapper
 * walks `bucket.slots` and substitutes each slot's price with the auction
 * the tariff has declared for that slot's calendar day:
 *
 *   tarif.priceSourceFor(slot.day) === "hourly"          → prices60[hourOfSlot(slot)]
 *   tarif.priceSourceFor(slot.day) === "quarter-hourly"  → prices15[slot]
 *
 * Mixed-source months — a tariff that switches mid-month — are handled
 * slot-by-slot, so the switchover boundary lands exactly on the configured
 * date with no averaging across products. The hourly fast path returns the
 * input bucket unchanged; the input `bucket.slots` are never mutated.
 *
 * If a slot's declared source has no data in marketdata, we fall back to
 * the hourly source for just that slot and report the (day, source) pair
 * via `onMissingSource(day, source)` (deduped per call). When the hourly
 * source itself is also missing for a slot, the function returns null so
 * the caller can decide what to do.
 */
export function repriceBucket(bucket, tarif, marketdata, { onMissingSource } = {}) {
    let allHourly = true;
    for (const s of bucket.slots) {
        if (tarif.priceSourceFor(s.day) !== "hourly") { allHourly = false; break; }
    }
    if (allHourly) return bucket;

    let priceCents = new Decimal(0);
    let h0NormPriceCents = new Decimal(0);
    const slots = new Array(bucket.slots.length);
    const reported = new Set();
    for (let i = 0; i < bucket.slots.length; i++) {
        const s = bucket.slots[i];
        let source = tarif.priceSourceFor(s.day);
        let prices = marketdata.pricesFor(s.day, source);
        if (!prices && source !== "hourly") {
            const key = `${s.day}:${source}`;
            if (!reported.has(key)) {
                reported.add(key);
                if (onMissingSource) onMissingSource(s.day, source);
            }
            source = "hourly";
            prices = marketdata.pricesFor(s.day, "hourly");
        }
        if (!prices) return null;
        const idx = source === "quarter-hourly" ? s.slot : hourOfSlot(s.slot);
        const dPrice = new Decimal(prices[idx]);
        const slotPrice = s.kwh.times(dPrice);
        const h0SlotPrice = s.h0Kwh.times(dPrice);
        priceCents = priceCents.plus(slotPrice);
        h0NormPriceCents = h0NormPriceCents.plus(h0SlotPrice);
        slots[i] = { ...s, priceCents: slotPrice };
    }
    return { ...bucket, priceCents, h0NormPriceCents, slots };
}

/**
 * Convenience wrapper used at every tariff-cost call site: reprice the
 * bucket for the tariff, then invoke its calculate(). Returns null when
 * repriceBucket couldn't resolve required prices. `onMissingSource`
 * forwards the per-slot fallback notification (see repriceBucket).
 */
export function tariffCostForBucket(bucket, tarif, marketdata, opts = {}) {
    const { onMissingSource, ...calcOpts } = opts;
    const repriced = repriceBucket(bucket, tarif, marketdata, { onMissingSource });
    if (repriced === null) return null;
    return tarif.calculate(repriced.priceCents, repriced.kwh, { ...calcOpts, slots: repriced.slots });
}
