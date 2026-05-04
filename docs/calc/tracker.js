import { format } from "date-fns";
import Decimal from "decimal.js";

/**
 * Accumulates per-day, per-hour kWh totals from a stream of provider
 * entries. Pure: no network, no DOM. Marketdata fetching is the
 * caller's responsibility (iterate `tracker.days` after ingestion).
 */
export class Tracker {
    data = {}
    days = new Set();

    addEntry(netzbetreiber, entry) {
        const res = netzbetreiber.processEntry(entry);
        if (res === null) {
            return false;
        }
        const hour = res.timestamp.getHours();
        const fullday = format(res.timestamp, "yyyyMMdd");
        this.days.add(fullday);

        if (!(fullday in this.data)) {
            this.data[fullday] = {};
        }
        if (!(hour in this.data[fullday])) {
            this.data[fullday][hour] = new Decimal(0.0);
        }
        this.data[fullday][hour] = this.data[fullday][hour].plus(new Decimal(res.usage));
        return true;
    }

    postProcess() {
        /* remove incomplete entries, e.g. if 15-interval is not activated some
         * Netzbetreiber put one entry for each day. This kind of data is not
         * useful for our purpose. */
        for (const [day, hours] of Object.entries(this.data)) {
            if (Object.keys(hours).length < 2) {
                this.days.delete(day);
                delete this.data[day];
            }
        }
    }
}
