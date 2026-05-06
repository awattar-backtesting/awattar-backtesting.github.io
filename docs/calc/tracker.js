import { format } from "date-fns";
import Decimal from "decimal.js";
import { slotOfTimestamp } from "./slots.js";

/**
 * Accumulates per-day, per-quarter-hour kWh totals from a stream of
 * provider entries. Pure: no network, no DOM. Marketdata fetching is
 * the caller's responsibility (iterate `tracker.days` after ingestion).
 *
 * Slots are 15-minute buckets keyed 0..95. Providers that emit hourly
 * entries (slotDurationMin=60) get fanned across four consecutive
 * quarters with their kWh divided evenly so the resulting per-day
 * profile fills all 96 slots and h0Norm comparisons stay exact.
 */
export class Tracker {
    data = {}
    days = new Set();

    addEntry(netzbetreiber, entry) {
        const res = netzbetreiber.processEntry(entry);
        if (res === null) {
            return false;
        }
        const startSlot = slotOfTimestamp(res.timestamp);
        const fullday = format(res.timestamp, "yyyyMMdd");
        this.days.add(fullday);

        if (!(fullday in this.data)) {
            this.data[fullday] = {};
        }

        const slotsCovered = (res.slotDurationMin ?? 15) / 15;
        const usagePerSlot = new Decimal(res.usage).dividedBy(slotsCovered);
        for (let i = 0; i < slotsCovered; i++) {
            const slot = startSlot + i;
            if (!(slot in this.data[fullday])) {
                this.data[fullday][slot] = new Decimal(0.0);
            }
            this.data[fullday][slot] = this.data[fullday][slot].plus(usagePerSlot);
        }
        return true;
    }

    postProcess() {
        /* remove incomplete entries, e.g. if 15-interval is not activated some
         * Netzbetreiber put one entry for each day. This kind of data is not
         * useful for our purpose. */
        for (const [day, slots] of Object.entries(this.data)) {
            if (Object.keys(slots).length < 2) {
                this.days.delete(day);
                delete this.data[day];
            }
        }
    }
}
