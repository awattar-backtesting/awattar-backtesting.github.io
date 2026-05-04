/*
 * Time-slot constants for the calc layer.
 *
 * Today the data layer aggregates everything into hourly buckets, so a
 * "day" has 24 slots indexed 0..23. The eventual move to 15-minute
 * granularity will flip SLOTS_PER_DAY to 96 and switch slotOfTimestamp
 * to return floor(minutes / 15) + hour * 4. Centralizing the constant
 * + helper here means the rest of the calc layer doesn't need to care.
 */

export const SLOTS_PER_DAY = 24;

export function slotOfTimestamp(ts) {
    return ts.getHours();
}
