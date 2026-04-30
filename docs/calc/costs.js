import Decimal from "decimal.js";
import { computeH0Day } from "./h0.js";

/**
 * Pure cost aggregation. Given a populated Tracker and Marketdata
 * plus the H0 worksheet, returns per-day and per-month rollups:
 *
 *   {
 *     daily:   { "20241015": { priceCents, kwh, h0NormPriceCents, h0NormKwh } },
 *     monthly: { "202410":   { priceCents, kwh, h0NormPriceCents, h0NormKwh } },
 *   }
 *
 * All numeric values are Decimal instances. priceCents is the raw
 * EPEX cost in cents (no tariff fees applied — caller layers tariffs
 * on top of the totals).
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

        Object.keys(usages).forEach(hour => {
            const dUsage = usages[hour];
            const dPrice = new Decimal(prices[hour]);

            sumPrice = sumPrice.plus(dUsage.times(dPrice));
            sumKwh = sumKwh.plus(dUsage);

            const h0KwhInHour = new Decimal(h0DayProfile[hour]);
            sumH0NormKwh = sumH0NormKwh.plus(h0KwhInHour);
            sumH0NormPrice = sumH0NormPrice.plus(h0KwhInHour.times(prices[hour]));
        });

        addInto(daily[day], sumPrice, sumKwh, sumH0NormPrice, sumH0NormKwh);
        addInto(monthly[monthKey], sumPrice, sumKwh, sumH0NormPrice, sumH0NormKwh);
    }

    return { daily, monthly };
}

function bucket() {
    return {
        priceCents: new Decimal(0.0),
        kwh: new Decimal(0.0),
        h0NormPriceCents: new Decimal(0.0),
        h0NormKwh: new Decimal(0.0),
    };
}

function addInto(b, price, kwh, h0Price, h0Kwh) {
    b.priceCents = b.priceCents.plus(price);
    b.kwh = b.kwh.plus(kwh);
    b.h0NormPriceCents = b.h0NormPriceCents.plus(h0Price);
    b.h0NormKwh = b.h0NormKwh.plus(h0Kwh);
}
