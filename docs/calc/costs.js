import Decimal from "decimal.js";
import { computeH0Day } from "./h0.js";
import { hourOfSlot } from "./slots.js";

/**
 * Pure cost aggregation. Given a populated Tracker and Marketdata
 * plus the H0 worksheet, returns per-day and per-month rollups:
 *
 *   daily:   { "20241015": { day, kwh, h0NormKwh, priceCents,
 *                            h0NormPriceCents, slots } }
 *   monthly: { "202410":   { days, kwh, h0NormKwh, priceCents,
 *                            h0NormPriceCents, slots } }
 *
 * `slots` is the raw per-quarter-hour breakdown
 *   [{ day, slot, kwh, h0Kwh, priceCents }, ...]
 * carrying enough metadata for a per-tariff fan-out to recompute
 * priceCents at any chosen price source (hourly vs. 15-min) — the
 * `day`/`slot` keys index back into marketdata.pricesFor(day, source).
 *
 * Bucket-level priceCents and h0NormPriceCents are the hourly-source
 * defaults: priceCents = Σ usage·prices60[hourOfSlot(q)],
 * h0NormPriceCents = Σ h0Kwh·prices60[hourOfSlot(q)]. Tariffs that
 * always bill against the hourly auction (incl. all pre-2025-10-01
 * billing) use these as-is; tariffs that switch to the 15-min source
 * recompute from `slots` + the 15-min cache.
 *
 * Tracker keys are 15-min slots (0..95). Slots present in
 * `tracker.data[day]` drive the iteration: missing slots contribute
 * nothing to either the actual or H0-normalized sums. Tracker's
 * postProcess() drops days with fewer than two slot entries.
 */
export function aggregateCosts(tracker, marketdata, h0Sheet) {
    const monthly = {};
    const daily = {};

    const days = Array.from(tracker.days);
    for (let idx = 0; idx < days.length; idx++) {
        const day = days[idx];
        const monthKey = day.substring(0, 6);

        if (!(day in daily)) {
            daily[day] = bucket({ day });
        }
        if (!(monthKey in monthly)) {
            monthly[monthKey] = bucket({ days: [] });
        }

        const usages = tracker.data[day];
        const prices = marketdata.data[day];
        const h0DayProfile = computeH0Day(h0Sheet, day);

        let sumPrice = new Decimal(0.0);
        let sumKwh = new Decimal(0.0);
        let sumH0NormPrice = new Decimal(0.0);
        let sumH0NormKwh = new Decimal(0.0);
        const slotsThisDay = [];

        Object.keys(usages).forEach(slotKey => {
            const slot = Number(slotKey);
            const dUsage = usages[slotKey];
            const hour = hourOfSlot(slot);
            const dPrice = new Decimal(prices[hour]);
            const slotPrice = dUsage.times(dPrice);
            const h0KwhInSlot = new Decimal(h0DayProfile[slot]);

            sumPrice = sumPrice.plus(slotPrice);
            sumKwh = sumKwh.plus(dUsage);
            sumH0NormKwh = sumH0NormKwh.plus(h0KwhInSlot);
            sumH0NormPrice = sumH0NormPrice.plus(h0KwhInSlot.times(dPrice));

            slotsThisDay.push({
                day,
                slot,
                kwh: dUsage,
                h0Kwh: h0KwhInSlot,
                priceCents: slotPrice,
            });
        });

        addInto(daily[day], sumPrice, sumKwh, sumH0NormPrice, sumH0NormKwh, slotsThisDay);
        addInto(monthly[monthKey], sumPrice, sumKwh, sumH0NormPrice, sumH0NormKwh, slotsThisDay);
        monthly[monthKey].days.push(day);
    }

    for (const m of Object.values(monthly)) {
        m.days.sort();
    }

    return { daily, monthly };
}

function bucket(extra) {
    return {
        priceCents: new Decimal(0.0),
        kwh: new Decimal(0.0),
        h0NormPriceCents: new Decimal(0.0),
        h0NormKwh: new Decimal(0.0),
        slots: [],
        ...extra,
    };
}

function addInto(b, price, kwh, h0Price, h0Kwh, slots) {
    b.priceCents = b.priceCents.plus(price);
    b.kwh = b.kwh.plus(kwh);
    b.h0NormPriceCents = b.h0NormPriceCents.plus(h0Price);
    b.h0NormKwh = b.h0NormKwh.plus(h0Kwh);
    for (const s of slots) b.slots.push(s);
}
