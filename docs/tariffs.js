import Decimal from "decimal.js";

const EINSPEISUNG = true;

/**
 * UI palette in the same order tariffs are listed; rotated for the
 * Einspeisung set. Mirrors PROVIDER_COLORS in the redesign brief.
 */
export const PROVIDER_COLORS = [
    'oklch(58% 0.18 145)',  // green
    'oklch(62% 0.18 260)',  // blue
    'oklch(65% 0.18 45)',   // amber
    'oklch(60% 0.18 320)',  // purple
    'oklch(60% 0.18 190)',  // teal
    'oklch(60% 0.18 20)',   // red-orange
];

export class Tarif {
    name = "name";
    tarifflink = "link";
    descripton = "timestamp";
    descripton_day = "timestamp";
    grundgebuehr_ct = 0;
    calculate = null;
    einspeise = false;

    /**
     * UI metadata used by the sidebar/table — set after construction
     * via `withMeta()`. Custom user tariffs share the same shape.
     *
     *   id            stable identifier (e.g. "awattar")
     *   shortName     name for sidebar/header
     *   color         provider dot/accent color (oklch string)
     *   markupPct     spot-price markup, % (display only — calc is
     *                 done by `calculate`)
     *   addFixedGross extra ct/kWh, gross (display only)
     *   baseMonthly   €/month, gross
     *   vat           VAT %
     *   isCustom      true for user-defined tariffs
     */
    meta = null;

    constructor(name, tarifflink, description, description_day, grundgebuehr_ct, calculate, einspeise = false) {
        this.name = name;
        this.tarifflink = tarifflink;
        this.description = description;
        this.description_day = description_day;
        this.grundgebuehr_ct = grundgebuehr_ct;
        this.calculate = calculate;
        this.einspeise = einspeise;
    }

    withMeta(meta) {
        this.meta = meta;
        return this;
    }
}

/**
 * Custom tariff entered via the sidebar form. Uses the simplified
 * formula from the design brief:
 *   effective = spot × (1 + markupPct/100) + addFixed   (net ct/kWh)
 *   gross     = energy × effective × (1 + vat/100) + base × (1+vat/100)
 *
 * `addFixed` is treated as net — VAT is layered on at the end so the
 * displayed €/Mon. matches what users typically read off tariff sheets.
 */
export function makeCustomTarif({ id, name, markupPct, addFixed, baseMonthly, vat, color }) {
    const t = new Tarif(
        name,
        "#",
        `+${markupPct}% +${addFixed}ct/kWh<br/>+${baseMonthly.toFixed(2)} EUR Grundpreis<br/>inkl. ${vat}% USt.`,
        `+${markupPct}% +${addFixed}ct/kWh`,
        Math.round(baseMonthly * 100 * (1 + vat / 100)),
        function (price, kwh, include_monthly_fee, monthly_fee_factor) {
            const factor = 1 + markupPct / 100;
            const vatFactor = 1 + vat / 100;
            let amount = price.times(factor).plus(kwh.times(addFixed)).times(vatFactor);
            if (include_monthly_fee) {
                amount = amount.plus(this.grundgebuehr_ct * monthly_fee_factor);
            }
            return amount;
        }
    );
    return t.withMeta({
        id,
        shortName: name,
        color,
        markupPct,
        addFixedGross: addFixed * (1 + vat / 100),
        baseMonthly,
        vat,
        isCustom: true,
    });
}

export const awattar_neu = new Tarif (
    "aWATTar HOURLY ab 2023/07",
    "https://web.archive.org/web/20230903185216/https://api.awattar.at/v1/templates/bba9e568-777c-43a7-b181-79de2188439f/content?accept-override=application/pdf",
    "+3% + 1.80ct/kWh<br/>+5,75 EUR Grundpreis<br/>inkl. 20% USt.",
    "+3% + 1.80ct/kWh",
    575,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let factor = price < 0 ? 1 - 0.03 : 1 + 0.03;
        let amount = price.times(factor).plus(kwh.times(1.5)).times(1.2);
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct*monthly_fee_factor);
        return amount;
    })
).withMeta({
    id: "awattar",
    shortName: "aWATTar HOURLY",
    color: PROVIDER_COLORS[0],
    markupPct: 3,
    addFixedGross: 1.80,
    baseMonthly: 5.75,
    vat: 20,
});

export const smartcontrol_neu = new Tarif (
    "smartCONTROL ab 2023/10",
    "https://web.archive.org/web/20231103201719/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartCONTROL.pdf",
    "+1.44ct/kWh<br/>+2,99 EUR Grundpreis<br/>inkl. 20% USt.",
    "+1.44ct/kWh",
    299,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let amount = price.plus(kwh.times(1.2)).times(1.2);
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    })
).withMeta({
    id: "smartcontrol",
    shortName: "smartCONTROL",
    color: PROVIDER_COLORS[1],
    markupPct: 0,
    addFixedGross: 1.44,
    baseMonthly: 2.99,
    vat: 20,
});
    
export const steirerstrom = new Tarif (
    "SteirerStrom Smart",
    "https://web.archive.org/web/20231103201559/https://www.e-steiermark.com/fileadmin/user_upload/downloads/E-Steiermark_Tarifblatt_Privatkunden_SteirerStrom_Smart.pdf",
    "+1.44ct/kWh<br/>+3,82 EUR Grundpreis<br/>inkl. 20% USt.",
    "+1.44ct/kWh",
    382,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let amount = price.plus(kwh.times(1.2)).times(1.2);
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    }) // +1.44ct/kWh inkl. 20% USt. = 1.2 * 1.2
).withMeta({
    id: "steirerstrom",
    shortName: "Steirer Strom Smart",
    color: PROVIDER_COLORS[2],
    markupPct: 0,
    addFixedGross: 1.44,
    baseMonthly: 3.82,
    vat: 20,
});

export const spotty_direkt = new Tarif (
    "Spotty Direkt",
    "https://web.archive.org/web/20240212135551/https://static1.squarespace.com/static/5a5381aff9a61ed1f688abc6/t/65c315875cde300de6287a2a/1707283847731/Spotty+Direkt+-+Smart.pdf",
    "+2.15 ct/kWh<br/>2,40 EUR Grundpreis<br/>inkl. 20% USt.",
    "+2.15 ct/kWh",
    240,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        // +1.49ct/kWh +0.3ct/kWh (Stromnachweis) exkl. 20% USt.
        let amount = price.plus(kwh.times(1.49 + 0.3)).times(1.2);
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    })
).withMeta({
    id: "spotty",
    shortName: "Spotty Direkt",
    color: PROVIDER_COLORS[3],
    markupPct: 0,
    addFixedGross: 2.15,
    baseMonthly: 2.40,
    vat: 20,
});

export const naturstrom_spot_stunde_ii = new Tarif(
    "Naturstrom SPOT Stunde II",
    "https://aae.at/wp-content/uploads/2024/10/Preisblatt_Naturstrom_SPOT_Stunde_II_p.pdf",
    "+1.56 ct/kWh<br/>+2,16  EUR Grundpreis<br/>inkl. 20% USt.",
    "+1.56 ct/kWh",
    216, // Grundgebühr in Cent (2.16 EUR converted to cents)
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        // Calculate the total cost
        let amount = price.plus(kwh.times(1.3)).times(1.2); // 1.30 ct/kWh and 20% VAT
        if (include_monthly_fee) {
            amount = amount.plus(this.grundgebuehr_ct);
        }
        return amount;
    })
).withMeta({
    id: "naturstrom",
    shortName: "Naturstrom SPOT",
    color: PROVIDER_COLORS[4],
    markupPct: 0,
    addFixedGross: 1.56,
    baseMonthly: 2.16,
    vat: 20,
});

export const oekostrom_spot = new Tarif(
    "Ökostrom Spot+",
    "https://oekostrom.at/wp-content/uploads/joules_tariff_files/78-0_1.1.Produktblatt_oekospotV1_.pdf",
    "+1.80 ct/kWh<br/>+2,16  EUR Grundpreis<br/>inkl. 20% USt.",
    "+1.80 ct/kWh",
    216,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let amount = price.plus(kwh.times(1.5)).times(1.2);
        if (include_monthly_fee) {
            amount = amount.plus(this.grundgebuehr_ct);
        }
        return amount;
    })
).withMeta({
    id: "oekostrom",
    shortName: "Ökostrom Spot+",
    color: PROVIDER_COLORS[5],
    markupPct: 0,
    addFixedGross: 1.80,
    baseMonthly: 2.16,
    vat: 20,
});
/* EINSPEISUNG */

export const smartcontrol_sunny = new Tarif (
    "smartENERGY SUNHOURLY",
    "https://web.archive.org/web/20231103201559/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartSUNHOURLY.pdf",
    "-20%<br/>kein Grundpreis",
    "-20%",
    0,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        return price.times(0.8);
        if (include_monthly_fee) {
            amount = amount.minus(this.grundgebuehr_ct);
        }
    }),
    EINSPEISUNG
).withMeta({
    id: "smartcontrol_sunny",
    shortName: "smartENERGY SUNHOURLY",
    color: PROVIDER_COLORS[0],
    markupPct: -20,
    addFixedGross: 0,
    baseMonthly: 0,
    vat: 20,
    feedin: true,
});

export const awattar_sunny_spot_60 = new Tarif (
    "aWATTar Sunny Spot 60",
    "https://api.awattar.at/v1/templates/21331573-7a91-46ef-97da-60a5dcd6295a/content?accept-override=application/pdf",
    "-19%<br/>-5,75 EUR Grundpreis<br/>inkl. 20% USt",
    "-19%",
    575,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let amount = price.times(1 - 0.19);
        if (include_monthly_fee) {
            amount = amount.minus(this.grundgebuehr_ct);
        }
        return amount;
    }),
    EINSPEISUNG
).withMeta({
    id: "awattar_sunny",
    shortName: "aWATTar Sunny Spot 60",
    color: PROVIDER_COLORS[1],
    markupPct: -19,
    addFixedGross: 0,
    baseMonthly: -5.75,
    vat: 20,
    feedin: true,
});

export const naturstrom_marktpreis_spot_25 = new Tarif (
    "Naturstrom Marktpreis SPOT 25",
    "https://aae.at/wp-content/uploads/2025/10/Sammelmappe_Einspeisung_SPOT_25.pdf",
    "-1.55 ct/kWh<br/>-5,40 EUR Grundpreis<br/>inkl. 20% USt",
    "-1.55 ct/kWh",
    540,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let amount = price.minus(kwh.times(1.55));
        if (include_monthly_fee) {
            amount = amount.minus(this.grundgebuehr_ct);
        }
        return amount;
    }),
    EINSPEISUNG
).withMeta({
    id: "naturstrom_sunny",
    shortName: "Naturstrom Marktpreis SPOT 25",
    color: PROVIDER_COLORS[2],
    markupPct: 0,
    addFixedGross: -1.55,
    baseMonthly: -5.40,
    vat: 20,
    feedin: true,
});

export const wels_strom_sonnenstrom_spot = new Tarif (
    "Wels Strom Sonnenstrom SPOT",
    "https://www.eww.at/fileadmin/user_upload/downloads/strom/tarife/einspeisetarife/Wels-Strom-Preisblatt-Einspeisetarife.pdf",
    "-15%<br/>-1,80 EUR Grundpreis<br/>inkl. 20% USt",
    "-15%",
    180,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let amount = price.times(1 - 0.15);
        if (include_monthly_fee) {
            amount = amount.minus(this.grundgebuehr_ct);
        }
        return amount;
    }),
    EINSPEISUNG
).withMeta({
    id: "wels_sunny",
    shortName: "Wels Strom Sonnenstrom SPOT",
    color: PROVIDER_COLORS[3],
    markupPct: -15,
    addFixedGross: 0,
    baseMonthly: -1.80,
    vat: 20,
    feedin: true,
});

export const energie_steiermark_sonnenstrom_spot = new Tarif (
    "Energie Steiermark Sonnenstrom SPOT",
    "https://www.e-steiermark.com/fileadmin/user_upload/downloads/E-Steiermark_Tarifblatt_SonnenStrom_Spot.pdf",
    "-20%, min. -1,2 ct/kWh<br/>kein Grundpreis",
    "-20%, min. -1,2 ct/kWh",
    0,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        // TODO: we need to calculate the fee based on each EPEX hour.
        let amount = new Decimal(Math.max(price.times(1 - 0.2), price.minus(kwh.times(1.2))));
        if (include_monthly_fee) {
            amount = amount.minus(this.grundgebuehr_ct);
        }
        return amount;
    }),
    EINSPEISUNG
).withMeta({
    id: "esteiermark_sunny",
    shortName: "Energie Steiermark Sonnenstrom SPOT",
    color: PROVIDER_COLORS[4],
    markupPct: -20,
    addFixedGross: 0,
    baseMonthly: 0,
    vat: 20,
    feedin: true,
});
