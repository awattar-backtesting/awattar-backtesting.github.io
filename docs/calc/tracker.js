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
        var res = netzbetreiber.processEntry(entry);
        if (res === null) {
            return false;
        }
        var hour = format(res.timestamp, "H");
        var fullday = format(res.timestamp, "yyyyMMdd");
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
        var entries = Object.entries(this.data);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (Object.keys(e[1]).length < 2) {
                this.days.delete(e[0]);
                delete this.data[e[0]];
            }
        }
    }
}
