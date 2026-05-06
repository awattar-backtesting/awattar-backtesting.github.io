/*
 * Time-slot constants for the calc layer.
 *
 * The data layer keeps consumption at 15-minute granularity end-to-end:
 * a day has 96 slots indexed 0..95 (q = hour*4 + floor(min/15)). Hourly
 * EPEX prices are 24 entries per day; cost code that pairs a tracker
 * quarter with an hourly price reads `prices[Math.floor(slot/4)]`.
 *
 * H0 standard-load profiles in lastprofile.xls are natively 15-min, so
 * computeH0Day reads one row per slot.
 */

export const SLOTS_PER_DAY = 96;
export const HOURS_PER_DAY = 24;
export const SLOTS_PER_HOUR = SLOTS_PER_DAY / HOURS_PER_DAY;

export function slotOfTimestamp(ts) {
    return ts.getHours() * SLOTS_PER_HOUR + Math.floor(ts.getMinutes() / 15);
}

export function hourOfSlot(slot) {
    return Math.floor(slot / SLOTS_PER_HOUR);
}
