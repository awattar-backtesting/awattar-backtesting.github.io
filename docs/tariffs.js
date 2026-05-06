import Decimal from "decimal.js";

export const PROVIDER_COLORS = [
    'oklch(58% 0.18 145)',  // green
    'oklch(62% 0.18 260)',  // blue
    'oklch(65% 0.18 45)',   // amber
    'oklch(60% 0.18 320)',  // purple
    'oklch(60% 0.18 190)',  // teal
    'oklch(60% 0.18 20)',   // red-orange
];

/**
 * A tariff. `meta` is the single source of truth for both display and math:
 *
 *   id            stable identifier (e.g. "awattar")
 *   name          full marketing name
 *   shortName     compact name used in sidebar / table headers
 *   url           link to the tariff sheet / source
 *   color         provider dot / accent color (oklch string)
 *   markupPct     spot-price markup, % (display only — math is in `calculate`)
 *   addFixedGross extra ct/kWh, gross (display only)
 *   baseMonthly   €/month, gross. Signed: negative on feed-in tariffs to
 *                 indicate a deduction from earnings.
 *   vat           VAT %
 *   einspeise     true for feed-in tariffs
 *   isCustom      true for user-defined tariffs
 *   priceSource   which EPEX day-ahead auction to bill against. The hourly
 *                 product (cache60) and the 15-minute product (cache15)
 *                 clear independently — averaging four 15-min prices does
 *                 NOT reproduce the hourly index. Allowed shapes:
 *                   "hourly"         constant
 *                   "quarter-hourly" constant
 *                   { before, from, then }   switchover; `from` is a
 *                                            yyyymmdd string and is the
 *                                            first day billed under `then`.
 *                 Days before 2025-10-01 are clamped to "hourly" because
 *                 only the hourly auction existed pre-go-live.
 *
 * `calculate(price, kwh, opts)` computes the gross/net amount in cents for
 * a (price, kwh) pair. `opts`:
 *
 *   includeMonthlyFee   include this.grundgebuehr_ct (display rolls up base fee)
 *   monthlyFeeFactor    fraction of the month covered (1.0 = full month)
 *   slots               optional per-slot breakdown for tariffs whose math
 *                       is non-linear in (price, kwh). Each entry is
 *                       { priceCents, kwh } for one tariff-aligned slot.
 *
 * Inside `calculate`, `this.grundgebuehr_ct` resolves to the gross fee in
 * cents (always positive magnitude), so feed-in closures keep subtracting
 * it directly while consumption closures add it.
 */
export const QUARTER_HOURLY_AUCTION_GO_LIVE = "20251001";

export class Tarif {
    constructor(meta, calculate) {
        this.meta = meta;
        this.calculate = calculate;
    }
    get grundgebuehr_ct() {
        return Math.round(Math.abs(this.meta.baseMonthly) * 100);
    }
    get einspeise() {
        return !!this.meta.einspeise;
    }
    /**
     * Resolve the EPEX auction product this tariff bills against on `yyyymmdd`.
     * Days before the 15-min auction's go-live date are clamped to "hourly"
     * because the quarter-hourly product didn't exist yet, regardless of the
     * tariff's declaration. Tariffs without a declaration default to "hourly"
     * (matches the legacy behavior).
     */
    priceSourceFor(yyyymmdd) {
        const declared = this._declaredSource(yyyymmdd);
        if (yyyymmdd < QUARTER_HOURLY_AUCTION_GO_LIVE) return "hourly";
        return declared;
    }
    _declaredSource(yyyymmdd) {
        const s = this.meta.priceSource;
        if (s === undefined) return "hourly";
        if (typeof s === "string") return s;
        return yyyymmdd < s.from ? s.before : s.then;
    }
}

/**
 * Custom tariff entered via the sidebar form. All form values are gross.
 *   effective ct/kWh = spot × (1 + markupPct/100) × (1 + vat/100) + addFixed
 *   total            = energy × effective + baseMonthly (gross)
 */
export function makeCustomTarif({ id, name, markupPct, addFixed, baseMonthly, vat, color }) {
    return new Tarif(
        {
            id,
            name,
            shortName: name,
            url: null,
            color,
            markupPct,
            addFixedGross: addFixed,
            baseMonthly,
            vat,
            einspeise: false,
            isCustom: true,
            priceSource: "hourly",
        },
        function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
            const factor = 1 + markupPct / 100;
            const vatFactor = 1 + vat / 100;
            let amount = price.times(factor).times(vatFactor).plus(kwh.times(addFixed));
            if (includeMonthlyFee) {
                amount = amount.plus(this.grundgebuehr_ct * monthlyFeeFactor);
            }
            return amount;
        }
    );
}

export const awattar_neu = new Tarif(
    {
        id: "awattar",
        name: "aWATTar HOURLY ab 2023/07",
        shortName: "aWATTar HOURLY",
        url: "https://web.archive.org/web/20230903185216/https://api.awattar.at/v1/templates/bba9e568-777c-43a7-b181-79de2188439f/content?accept-override=application/pdf",
        color: PROVIDER_COLORS[0],
        markupPct: 3,
        addFixedGross: 1.80,
        baseMonthly: 5.75,
        vat: 20,
        priceSource: "hourly",
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        const factor = price < 0 ? 1 - 0.03 : 1 + 0.03;
        let amount = price.times(factor).plus(kwh.times(1.5)).times(1.2);
        if (includeMonthlyFee) amount = amount.plus(this.grundgebuehr_ct * monthlyFeeFactor);
        return amount;
    }
);

export const smartcontrol_neu = new Tarif(
    {
        id: "smartcontrol",
        name: "smartCONTROL ab 2023/10",
        shortName: "smartCONTROL",
        url: "https://web.archive.org/web/20231103201719/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartCONTROL.pdf",
        color: PROVIDER_COLORS[1],
        markupPct: 0,
        addFixedGross: 1.44,
        baseMonthly: 2.99,
        vat: 20,
        priceSource: "hourly", // TODO: verify against current Produktblatt
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        let amount = price.plus(kwh.times(1.2)).times(1.2);
        if (includeMonthlyFee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    }
);

export const steirerstrom = new Tarif(
    {
        id: "steirerstrom",
        name: "SteirerStrom Smart",
        shortName: "Steirer Strom Smart",
        url: "https://web.archive.org/web/20231103201559/https://www.e-steiermark.com/fileadmin/user_upload/downloads/E-Steiermark_Tarifblatt_Privatkunden_SteirerStrom_Smart.pdf",
        color: PROVIDER_COLORS[2],
        markupPct: 0,
        addFixedGross: 1.44,
        baseMonthly: 3.82,
        vat: 20,
        priceSource: "hourly", // TODO: verify against current Produktblatt
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        let amount = price.plus(kwh.times(1.2)).times(1.2);
        if (includeMonthlyFee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    }
);

export const spotty_direkt = new Tarif(
    {
        id: "spotty",
        name: "Spotty Direkt",
        shortName: "Spotty Direkt",
        url: "https://web.archive.org/web/20240212135551/https://static1.squarespace.com/static/5a5381aff9a61ed1f688abc6/t/65c315875cde300de6287a2a/1707283847731/Spotty+Direkt+-+Smart.pdf",
        color: PROVIDER_COLORS[3],
        markupPct: 0,
        addFixedGross: 2.15,
        baseMonthly: 2.40,
        vat: 20,
        priceSource: { before: "hourly", from: "20251001", then: "quarter-hourly" },
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        // +1.49ct/kWh +0.3ct/kWh (Stromnachweis) exkl. 20% USt.
        let amount = price.plus(kwh.times(1.49 + 0.3)).times(1.2);
        if (includeMonthlyFee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    }
);

export const naturstrom_spot_stunde_ii = new Tarif(
    {
        id: "naturstrom",
        name: "Naturstrom SPOT Stunde II",
        shortName: "Naturstrom SPOT",
        url: "https://aae.at/wp-content/uploads/2024/10/Preisblatt_Naturstrom_SPOT_Stunde_II_p.pdf",
        color: PROVIDER_COLORS[4],
        markupPct: 0,
        addFixedGross: 1.56,
        baseMonthly: 2.16,
        vat: 20,
        priceSource: "hourly", // name implies hourly is permanent — verify
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        let amount = price.plus(kwh.times(1.3)).times(1.2);
        if (includeMonthlyFee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    }
);

export const oekostrom_spot = new Tarif(
    {
        id: "oekostrom",
        name: "oeko Spot+",
        shortName: "oeko Spot+",
        url: "https://hub.oekostrom.at/uploads/documents/aefd9a843240e42f5cf4282326e97581.pdf",
        color: PROVIDER_COLORS[5],
        markupPct: 0,
        addFixedGross: 1.80,
        baseMonthly: 2.16,
        vat: 20,
        priceSource: { before: "hourly", from: "20251001", then: "quarter-hourly" },
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        let amount = price.plus(kwh.times(1.5)).times(1.2);
        if (includeMonthlyFee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    }
);

/* EINSPEISUNG */

export const smartcontrol_sunny = new Tarif(
    {
        id: "smartcontrol_sunny",
        name: "smartENERGY SUNHOURLY",
        shortName: "smartENERGY SUNHOURLY",
        url: "https://web.archive.org/web/20231103201559/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartSUNHOURLY.pdf",
        color: PROVIDER_COLORS[0],
        markupPct: -20,
        addFixedGross: 0,
        baseMonthly: 0,
        vat: 20,
        einspeise: true,
        priceSource: "hourly", // TODO: verify against current Produktblatt
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        return price.times(0.8);
    }
);

export const awattar_sunny_spot_60 = new Tarif(
    {
        id: "awattar_sunny",
        name: "aWATTar Sunny Spot 60",
        shortName: "aWATTar Sunny Spot 60",
        url: "https://api.awattar.at/v1/templates/21331573-7a91-46ef-97da-60a5dcd6295a/content?accept-override=application/pdf",
        color: PROVIDER_COLORS[1],
        markupPct: -19,
        addFixedGross: 0,
        baseMonthly: -5.75,
        vat: 20,
        einspeise: true,
        priceSource: "hourly", // "_60" in product name pins it to hourly auction
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        let amount = price.times(1 - 0.19);
        if (includeMonthlyFee) amount = amount.minus(this.grundgebuehr_ct);
        return amount;
    }
);

export const naturstrom_marktpreis_spot_25 = new Tarif(
    {
        id: "naturstrom_sunny",
        name: "Naturstrom Marktpreis SPOT 25",
        shortName: "Naturstrom Marktpreis SPOT 25",
        url: "https://aae.at/wp-content/uploads/2025/10/Sammelmappe_Einspeisung_SPOT_25.pdf",
        color: PROVIDER_COLORS[2],
        markupPct: 0,
        addFixedGross: -1.55,
        baseMonthly: -5.40,
        vat: 20,
        einspeise: true,
        priceSource: "hourly", // TODO: verify against current Produktblatt
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        let amount = price.minus(kwh.times(1.55));
        if (includeMonthlyFee) amount = amount.minus(this.grundgebuehr_ct);
        return amount;
    }
);

export const wels_strom_sonnenstrom_spot = new Tarif(
    {
        id: "wels_sunny",
        name: "Wels Strom Sonnenstrom SPOT",
        shortName: "Wels Strom Sonnenstrom SPOT",
        url: "https://www.eww.at/fileadmin/user_upload/downloads/strom/tarife/einspeisetarife/Wels-Strom-Preisblatt-Einspeisetarife.pdf",
        color: PROVIDER_COLORS[3],
        markupPct: -15,
        addFixedGross: 0,
        baseMonthly: -1.80,
        vat: 20,
        einspeise: true,
        priceSource: "hourly", // TODO: verify against current Produktblatt
    },
    function (price, kwh, { includeMonthlyFee = false, monthlyFeeFactor = 1 } = {}) {
        let amount = price.times(1 - 0.15);
        if (includeMonthlyFee) amount = amount.minus(this.grundgebuehr_ct);
        return amount;
    }
);

export const energie_steiermark_sonnenstrom_spot = new Tarif(
    {
        id: "esteiermark_sunny",
        name: "Energie Steiermark Sonnenstrom SPOT",
        shortName: "Energie Steiermark Sonnenstrom SPOT",
        url: "https://www.e-steiermark.com/fileadmin/user_upload/downloads/E-Steiermark_Tarifblatt_SonnenStrom_Spot.pdf",
        color: PROVIDER_COLORS[4],
        markupPct: -20,
        addFixedGross: 0,
        baseMonthly: 0,
        vat: 20,
        einspeise: true,
        priceSource: "hourly", // TODO: verify against current Produktblatt
    },
    function (price, kwh, { includeMonthlyFee = false, slots } = {}) {
        // Cap is per EPEX hour: amount_h = max(0.8·price_h, price_h − 1.2·kwh_h).
        // When `slots` is supplied (per-EPEX-hour breakdown) we evaluate the cap
        // hour by hour and sum; otherwise fall back to the aggregated form,
        // which over-estimates because the max() is applied to totals.
        let amount;
        if (slots && slots.length > 0) {
            amount = slots.reduce(
                (acc, s) => acc.plus(Decimal.max(s.priceCents.times(1 - 0.2), s.priceCents.minus(s.kwh.times(1.2)))),
                new Decimal(0),
            );
        } else {
            amount = Decimal.max(price.times(1 - 0.2), price.minus(kwh.times(1.2)));
        }
        if (includeMonthlyFee) amount = amount.minus(this.grundgebuehr_ct);
        return amount;
    }
);
