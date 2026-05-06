import Decimal from "decimal.js";
import { computeH0Day } from "./h0.js";
import { hourOfSlot } from "./slots.js";

/**
 * Pure cost aggregation. Given a populated Tracker and Marketdata
 * plus the H0 worksheet, returns per-day and per-month rollups:
 *
 *   {
 *     daily:   { "20241015": { priceCents, kwh, h0NormPriceCents, h0NormKwh, slots } },
 *     monthly: { "202410":   { priceCents, kwh, h0NormPriceCents, h0NormKwh, slots } },
 *   }
 *
 * All numeric values are Decimal instances. priceCents is the raw
 * EPEX cost in cents (no tariff fees applied — caller layers tariffs
 * on top of the totals). `slots` is the per-quarter-hour breakdown
 * `[{ priceCents, kwh }, ...]` retained so non-linear tariffs (e.g.
 * a per-hour cap) can re-evaluate against the raw slots instead of
 * the daily/monthly aggregates.
 *
 * Tracker keys are 15-min slots (0..95). EPEX prices in `marketdata.data`
 * are still hourly (24 entries), so a tracker quarter q reads
 * `prices[hourOfSlot(q)]` — four consecutive quarters share one price.
 * The per-tariff fan-out (separate layer) decides whether to bill
 * against this hourly source or the 15-min auction; this aggregation
 * stays at the source granularity.
 *
 * Slots present in `tracker.data[day]` drive the iteration: missing
 * slots contribute nothing to either the actual or H0-normalized
 * sums, so a partial day is summed against itself only. Tracker's
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
            daily[day] = bucket();
        }
        if (!(monthKey in monthly)) {
            monthly[monthKey] = bucket();
        }

        const usages = tracker.data[day];
        const prices = marketdata.data[day];
        const h0DayProfile = computeH0Day(h0Sheet, day);

        let sumPrice = new Decimal(0.0);
        let sumKwh = new Decimal(0.0);
        let sumH0NormPrice = new Decimal(0.0);
        let sumH0NormKwh = new Decimal(0.0);
        const slotsThisDay = [];

        Object.keys(usages).forEach(slot => {
            const dUsage = usages[slot];
            const hour = hourOfSlot(Number(slot));
            const dPrice = new Decimal(prices[hour]);
            const slotPrice = dUsage.times(dPrice);

            sumPrice = sumPrice.plus(slotPrice);
            sumKwh = sumKwh.plus(dUsage);
            slotsThisDay.push({ priceCents: slotPrice, kwh: dUsage });

            const h0KwhInSlot = new Decimal(h0DayProfile[slot]);
            sumH0NormKwh = sumH0NormKwh.plus(h0KwhInSlot);
            sumH0NormPrice = sumH0NormPrice.plus(h0KwhInSlot.times(prices[hour]));
        });

        addInto(daily[day], sumPrice, sumKwh, sumH0NormPrice, sumH0NormKwh, slotsThisDay);
        addInto(monthly[monthKey], sumPrice, sumKwh, sumH0NormPrice, sumH0NormKwh, slotsThisDay);
    }

    return { daily, monthly };
}

function bucket() {
    return {
        priceCents: new Decimal(0.0),
        kwh: new Decimal(0.0),
        h0NormPriceCents: new Decimal(0.0),
        h0NormKwh: new Decimal(0.0),
        slots: [],
    };
}

function addInto(b, price, kwh, h0Price, h0Kwh, slots) {
    b.priceCents = b.priceCents.plus(price);
    b.kwh = b.kwh.plus(kwh);
    b.h0NormPriceCents = b.h0NormPriceCents.plus(h0Price);
    b.h0NormKwh = b.h0NormKwh.plus(h0Kwh);
    for (const s of slots) b.slots.push(s);
}
