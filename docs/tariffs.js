export class Tarif {
    name = "name";
    tarifflink = "link";
    descripton = "timestamp";
    descripton_day = "timestamp";
    grundgebuehr_ct = 0;
    calculate = null;
    einspeise = false;

    constructor(name, tarifflink, description, description_day, grundgebuehr_ct, calculate, einspeise = false) {
        this.name = name;
        this.tarifflink = tarifflink;
        this.description = description;
        this.description_day = description_day;
        this.grundgebuehr_ct = grundgebuehr_ct;
        this.calculate = calculate;
        this.einspeise = einspeise;
    }
}

export const awattar_alt = new Tarif (
    "aWATTar HOURLY alt", 
    "https://web.archive.org/web/20230316213722/https://api.awattar.at/v1/templates/1126e217-aa97-4d3e-9fdf-93cd73f04d3f/content?accept-override=application/pdf", 
    "+3% Aufschlag<br/>+5,75 EUR Grundpreis<br/>inkl. 20% USt.",
    "+3% Aufschlag",
    575,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let factor = price < 0 ? 1 - 0.03 : 1 + 0.03;
        let amount = price.times(factor).times(1.2); 
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct*monthly_fee_factor);
        return amount;
    })
);

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
);

export const smartcontrol_alt = new Tarif (
    "smartCONTROL alt", 
    "https://web.archive.org/web/20230605223615/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartCONTROL.pdf", 
    "+1.44ct/kWh<br/>+4,99 EUR Grundpreis<br/>inkl. 20% USt.", 
    "+1.44ct/kWh",
    499,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) { 
        let amount = price.plus(kwh.times(1.2)).times(1.2); 
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    })
);
    
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
);
    
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
);

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
);

export const naturstrom_spot_stunde_ii = new Tarif(
    "Naturstrom SPOT Stunde II",
    "https://aae.at/wp-content/uploads/2024/10/Preisblatt_Naturstrom_SPOT_Stunde_II_p.pdf",
    "+1.56 ct/kWh<br/>+2,16  EUR Grundpreis<br/>inkl. 20% USt.",
    "+1.56 ct/kWh",
    216, // Grundgebühr in Cent (2.16 EUR converted to cents)
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        // Calculate the total cost
        let amount = price.plus(kwh.times(1.3)).times(1.2); // 1.30 ct/kWh and 20% VAT
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    })
);

export const oekostrom_spot = new Tarif(
    "Ökostrom Spot+",
    "https://oekostrom.at/wp-content/uploads/joules_tariff_files/78-0_1.1.Produktblatt_oekospotV1_.pdf",
    "+1.80 ct/kWh<br/>+2,16  EUR Grundpreis<br/>inkl. 20% USt.",
    "+1.80 ct/kWh",
    216,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) {
        let amount = price.plus(kwh.times(1.5)).times(1.2); 
        if (include_monthly_fee) amount = amount.plus(this.grundgebuehr_ct);
        return amount;
    })
);
/* EINSPEISUNG */

export const smartcontrol_sunny = new Tarif (
    "smartENERGY SUNHOURLY", 
    "https://web.archive.org/web/20231103201559/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartSUNHOURLY.pdf", 
    "-20%<br/>kein Grundpreis", 
    "-20%", 
    0,
    (function (price, kwh, include_monthly_fee, monthly_fee_factor) { 
        return price.times(0.8); 
    }),
    true
);
