import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { spotty_direkt } from "../docs/tariffs.js";

describe("Spotty Smart Active tariff", () => {
    it("uses the 2025-10 tariff sheet fees without Stromherkunftsnachweis", () => {
        const epexNetCents = new Decimal(1000);
        const kwh = new Decimal(100);

        expect(spotty_direkt.meta.addFixedGross).toBe(1.79);
        expect(spotty_direkt.meta.baseMonthly).toBe(2.40);

        const amount = spotty_direkt.calculate(epexNetCents, kwh, { includeMonthlyFee: true });
        // 1000 ct EPEX net × 1.2 USt. + 100 kWh × 1.79 ct gross service fee + 240 ct base fee.
        expect(amount.toFixed(2)).toBe("1619.00");
    });
});
