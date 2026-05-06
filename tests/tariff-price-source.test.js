import { describe, it, expect } from "vitest";
import { Tarif, QUARTER_HOURLY_AUCTION_GO_LIVE } from "../docs/tariffs.js";

/*
 * priceSourceFor() decides which EPEX day-ahead product the tariff bills
 * against on a given day. The 15-min auction went live 2025-10-01; the
 * resolver clamps everything earlier to "hourly" regardless of the
 * tariff's declaration because there's no 15-min product to bill against.
 */

const noopCalculate = () => null;

function makeTarif(priceSource) {
    return new Tarif({ priceSource }, noopCalculate);
}

describe("Tarif.priceSourceFor", () => {
    it("defaults to 'hourly' when priceSource is undefined", () => {
        const t = new Tarif({}, noopCalculate);
        expect(t.priceSourceFor("20240101")).toBe("hourly");
        expect(t.priceSourceFor("20260101")).toBe("hourly");
    });

    it("returns a constant string verbatim post-go-live", () => {
        expect(makeTarif("hourly").priceSourceFor("20260101")).toBe("hourly");
        expect(makeTarif("quarter-hourly").priceSourceFor("20260101")).toBe("quarter-hourly");
    });

    it("clamps quarter-hourly to hourly before the go-live date", () => {
        const t = makeTarif("quarter-hourly");
        expect(t.priceSourceFor("20240101")).toBe("hourly");
        expect(t.priceSourceFor("20250930")).toBe("hourly");
        expect(t.priceSourceFor(QUARTER_HOURLY_AUCTION_GO_LIVE)).toBe("quarter-hourly");
    });

    it("honors a switchover declaration with inclusive `from`", () => {
        const t = makeTarif({ before: "hourly", from: "20251001", then: "quarter-hourly" });
        expect(t.priceSourceFor("20250930")).toBe("hourly");
        expect(t.priceSourceFor("20251001")).toBe("quarter-hourly");
        expect(t.priceSourceFor("20260101")).toBe("quarter-hourly");
    });

    it("clamps switchovers whose `from` is before go-live", () => {
        const t = makeTarif({ before: "hourly", from: "20240101", then: "quarter-hourly" });
        expect(t.priceSourceFor("20230101")).toBe("hourly");
        expect(t.priceSourceFor("20240601")).toBe("hourly");
        expect(t.priceSourceFor("20250930")).toBe("hourly");
        expect(t.priceSourceFor("20251001")).toBe("quarter-hourly");
    });

    it("uses lexicographic yyyymmdd ordering across month/year boundaries", () => {
        const t = makeTarif({ before: "hourly", from: "20251001", then: "quarter-hourly" });
        expect(t.priceSourceFor("20250131")).toBe("hourly");
        expect(t.priceSourceFor("20251231")).toBe("quarter-hourly");
        expect(t.priceSourceFor("20260229")).toBe("quarter-hourly");
    });
});
