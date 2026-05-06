import { parse, parseISO } from "date-fns";

/**
 * Provider configuration. Construct with an options object:
 *
 *   new Netzbetreiber({
 *     name, descriptorUsage, descriptorTimestamp, dateFormatString,
 *     usageParser,                      // (string) => number
 *     descriptorTimeSub,                // null | column name to concat with timestamp
 *     otherFields,                      // [] | required column names for probe()
 *     shouldSkip,                       // null | (entry) => boolean
 *     fixupTimestamp,                   // false | true (subtract 15min from start date)
 *     feedin,                           // false | true (Einspeisung tariff)
 *     endDescriptorTimestamp,           // null | column name; used to drop non-15min entries
 *     slotDurationMin,                  // 15 (default) | 60; KWG-style hourly providers set 60
 *                                       //   so the tracker can fan one entry across four quarters
 *     preprocessDateString,             // identity | (string) => string
 *   })
 */
export class Netzbetreiber {
    constructor({
        name,
        descriptorUsage,
        descriptorTimestamp,
        dateFormatString,
        usageParser,
        descriptorTimeSub = null,
        otherFields = [],
        shouldSkip = null,
        fixupTimestamp = false,
        feedin = false,
        endDescriptorTimestamp = null,
        slotDurationMin = 15,
        preprocessDateString = (date) => date,
    }) {
        Object.assign(this, {
            name,
            descriptorUsage,
            descriptorTimestamp,
            descriptorTimeSub,
            dateFormatString,
            usageParser,
            otherFields,
            shouldSkip,
            fixupTimestamp,
            feedin,
            endDescriptorTimestamp,
            slotDurationMin,
            preprocessDateString,
        });
    }

    matchUsage(entry) {
        if (this.descriptorUsage[0] === '!') {
            /* fuzzy check as we don't know the exact column name */
            const desc = this.descriptorUsage.substring(1);
            for (const key of Object.keys(entry)) {
                if (key.includes(desc)) {
                    return key;
                }
            }
        } else {
            if (this.descriptorUsage in entry) {
                return this.descriptorUsage;
            }
        }
        return null;
    }

    probe(entry) {
        if (this.matchUsage(entry) === null) {
            return false;
        }
        if (!(this.descriptorTimestamp in entry)) {
            return false;
        }
        for (const field of this.otherFields) {
            if (!(field in entry)) {
                return false;
            }
        }
        if ('Datum' in entry && this.preprocessDateString(entry.Datum) === null) {
            return false;
        }
        return true;
    }

    processEntry(entry) {
        if (!this.probe(entry)) {
            return null;
        }
        if (this.shouldSkip !== null && this.shouldSkip(entry)) {
            return null;
        }

        let valueTimestamp = entry[this.descriptorTimestamp];
        if (this.descriptorTimeSub !== null) {
            valueTimestamp += " " + entry[this.descriptorTimeSub];
        }

        valueTimestamp = this.preprocessDateString(valueTimestamp);

        let parsedTimestamp;
        if (this.dateFormatString === "parseISO") {
            parsedTimestamp = parseISO(valueTimestamp);
        } else {
            parsedTimestamp = parse(valueTimestamp, this.dateFormatString, new Date());
        }

        const valueUsage = entry[this.matchUsage(entry)];
        if (valueUsage === "" || valueUsage === undefined) {
            return null;
        }
        const parsedUsage = this.usageParser(valueUsage);

        const MS_PER_MINUTE = 60000;
        if (this.fixupTimestamp) {
            /* most Netzbetreiber specify the start date, for some it's ambigious and only obvious by looking at the first and last entry of a single day export, e.g.
             * > Messzeitpunkt;Gemessener Verbrauch (kWh);Ersatzwert;
             * > 10.11.2023 00:15;0,228000;;
             * > 10.11.2023 00:30;0,197000;;
             * > [...]
             * > 10.11.2023 23:45;0,214000;;
             * > 11.11.2023 00:00;0,397000;;
             *
             * Subtract a full slot's worth of minutes so the resulting
             * timestamp lands at the slot's start (the tracker fans
             * 60-min entries into four 15-min slots from there).
             */
            parsedTimestamp = new Date(parsedTimestamp - this.slotDurationMin * MS_PER_MINUTE);
        }

        if (this.endDescriptorTimestamp !== null) {
            /* some Netzbetreiber mix the dataset with per-day consumption entries interleaved. Filter them */
            const endValueTimestamp = entry[this.endDescriptorTimestamp];

            let endParsedTimestamp;
            if (this.dateFormatString === "parseISO") {
                endParsedTimestamp = parseISO(endValueTimestamp);
            } else {
                endParsedTimestamp = parse(endValueTimestamp, this.dateFormatString, new Date());
            }

            if ((endParsedTimestamp - parsedTimestamp) > 15 * MS_PER_MINUTE) {
                /* not a 15min entry, ignore it */
                return null;
            }
        }

        return {
            timestamp: parsedTimestamp,
            usage: parsedUsage,
            slotDurationMin: this.slotDurationMin,
        };
    }
}

const parseGermanFloat = (usage) => parseFloat(usage.replace(",", "."));
const parsePlainFloat = (usage) => parseFloat(usage);

export const NetzNOEEinspeiser = new Netzbetreiber({
    name: "NetzNÖ",
    descriptorUsage: "Gemessene Menge (kWh)",
    descriptorTimestamp: "Messzeitpunkt",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    fixupTimestamp: true,
    feedin: true,
});

export const NetzNOEEinspeiser2 = new Netzbetreiber({
    name: "NetzNÖ",
    descriptorUsage: "Einspeisung (kWh)",
    descriptorTimestamp: "Messzeitpunkt",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    fixupTimestamp: true,
    feedin: true,
});

export const NetzNOEVerbrauchv3EEG = new Netzbetreiber({
    name: "NetzNÖ",
    descriptorUsage: "Restnetzbezug (kWh)",
    descriptorTimestamp: "Messzeitpunkt",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Eigendeckung (kWh)", "Verbrauch (kWh)"],
    fixupTimestamp: true,
});

export const NetzNOEVerbrauch = new Netzbetreiber({
    name: "NetzNÖ",
    descriptorUsage: "Gemessener Verbrauch (kWh)",
    descriptorTimestamp: "Messzeitpunkt",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Ersatzwert"],
    fixupTimestamp: true,
});

export const NetzNOEVerbrauchv2 = new Netzbetreiber({
    name: "NetzNÖ",
    descriptorUsage: "Verbrauch (kWh)",
    descriptorTimestamp: "Messzeitpunkt",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Qualität"],
    fixupTimestamp: true,
});

export const NetzNOEVerbrauchv3 = new Netzbetreiber({
    name: "NetzNÖ",
    descriptorUsage: "Verbrauch (kWh)",
    descriptorTimestamp: "Messzeitpunkt",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    fixupTimestamp: true,
});

export const NetzOOE = new Netzbetreiber({
    name: "NetzOÖ",
    descriptorUsage: "kWh",
    descriptorTimestamp: "Datum",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["kW", "Status"],
});

export const NetzOOEEinspeiser = new Netzbetreiber({
    name: "NetzOÖ",
    descriptorUsage: "Einspeisung kWh",
    descriptorTimestamp: "Datum",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["kW", "Status"],
    feedin: true,
});

export const NetzBurgenland = new Netzbetreiber({
    name: "Netz Burgenland",
    descriptorUsage: "Verbrauch (kWh) - Gesamtverbrauch",
    descriptorTimestamp: "Start",
    dateFormatString: " dd.MM.yyyy HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Ende"],
});

export const NetzBurgenlandv2 = new Netzbetreiber({
    name: "Netz Burgenland V2",
    descriptorUsage: "Verbrauch (in kWh)",
    descriptorTimestamp: "Startdatum",
    descriptorTimeSub: "Startuhrzeit",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: [/*" Status", */"Enddatum", "Enduhrzeit"],
});

export const KaerntenNetz = new Netzbetreiber({
    name: "KaerntenNetz",
    descriptorUsage: "kWh",
    descriptorTimestamp: "Datum",
    descriptorTimeSub: "Zeit",
    dateFormatString: "dd.MM.yyyy HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Status"],
});

export const KaerntenNetz2025 = new Netzbetreiber({
    name: "KaerntenNetz2025",
    descriptorUsage: "Wert",
    descriptorTimestamp: "Startdatum",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Startdatum", "Enddatum", "Zählpunktbezeichnung", "OBIS", "OBIS Kurzbeschreibung", "Wert", "Einheit"],
});

export const EbnerStrom = new Netzbetreiber({
    name: "EbnerStrom",
    descriptorUsage: "Wert (kWh)",
    descriptorTimestamp: "Zeitstempel String",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parsePlainFloat,
    otherFields: ["Angezeigter Zeitraum"],
    shouldSkip: (row) => row["Obiscode"] !== "1.8.0",
    fixupTimestamp: true,
});

export const WienerNetze = new Netzbetreiber({
    name: "WienerNetze",
    descriptorUsage: "!Verbrauch [kWh]",
    descriptorTimestamp: "Datum",
    descriptorTimeSub: "Zeit von",
    dateFormatString: "dd.MM.yyyy HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Zeit bis"],
});

export const WienerNetzeEcontrol = new Netzbetreiber({
    name: "WienerNetze E-Control",
    descriptorUsage: "!Verbrauch [kWh]",
    descriptorTimestamp: "Ende Ablesezeitraum",
    dateFormatString: "parseISO",
    usageParser: parseGermanFloat,
    otherFields: ["Messintervall"],
});

export const WienerNetzeEinspeiser = new Netzbetreiber({
    name: "WienerNetze",
    descriptorUsage: "!Einspeiser [kWh]",
    descriptorTimestamp: "Datum",
    descriptorTimeSub: "Zeit von",
    dateFormatString: "dd.MM.yyyy HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Zeit bis"],
    feedin: true,
});

export const SalzburgNetz = new Netzbetreiber({
    name: "SalzburgNetz",
    descriptorUsage: "!kWh)",
    descriptorTimestamp: "Datum und Uhrzeit",
    dateFormatString: "yyyy-MM-dd HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Status"],
});

export const SalzburgNetzv4 = new Netzbetreiber({
    name: "SalzburgNetz V4",
    descriptorUsage: "!Restverbrauch",
    descriptorTimestamp: "Datum",
    dateFormatString: "dd.MM.yyyy HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Status"],
});

// v1: "Energiemenge in kWh"
// v2: "Verbrauch in kWh"
// otherwise the same.
export const LinzAG = new Netzbetreiber({
    name: "LinzAG",
    descriptorUsage: "!in kWh",
    descriptorTimestamp: "Datum von",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Ersatzwert"],
});

export const StromnetzGraz = new Netzbetreiber({
    name: "StromnetzGraz",
    descriptorUsage: "Verbrauch Einheitstarif",
    descriptorTimestamp: "Ablesezeitpunkt",
    dateFormatString: "parseISO",
    usageParser: parsePlainFloat,
    otherFields: ["Zaehlerstand Einheitstarif", "Zaehlerstand Hochtarif", "Zaehlerstand Niedertarif", "Verbrauch Hochtarif", "Verbrauch Niedertarif"],
});

export const StromnetzGrazv2 = new Netzbetreiber({
    name: "StromnetzGraz V2",
    descriptorUsage: "Verbrauch Gesamt - 1.8.0",
    descriptorTimestamp: "Ablesezeitpunkt",
    dateFormatString: "parseISO",
    usageParser: parsePlainFloat,
    otherFields: ["Zaehlerstand Gesamt - 1.8.0", "Zaehlerstand Hochtarif - 1.8.1", "Zaehlerstand Niedertarif - 1.8.2", "Verbrauch Hochtarif - 1.8.1", "Verbrauch Niedertarif - 1.8.2"],
});

export const EnergienetzeSteiermark = new Netzbetreiber({
    name: "EnergieNetzeSteiermark",
    descriptorUsage: "Verbrauch",
    descriptorTimestamp: "Verbrauchszeitraum Beginn",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Anlagennummer", "Tarif", "Verbrauchszeitraum Ende", "Einheit", "Messwert: VAL...gemessen, EST...rechnerisch ermittelt"],
});

export const EnergienetzeSteiermarkLeistung = new Netzbetreiber({
    name: "EnergienetzeSteiermarkLeistung",
    descriptorUsage: "Wert",
    descriptorTimestamp: "Statistikzeitraum Beginn",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Anlagennummer", "Tarif", "Statistikzeitraum Ende", "Einheit", "Messwert: VAL...gemessen, EST...rechnerisch ermittelt"],
});

export const EnergienetzeSteiermarkv3 = new Netzbetreiber({
    name: "EnergienetzeSteiermarkv3",
    descriptorUsage: "Leistung",
    descriptorTimestamp: "Leistungszeitraum Beginn",
    dateFormatString: "dd.MM.yy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Anlagennummer", "Tarif", "Leistungszeitraum Ende", "Einheit", "Messwert: VAL...gemessen, EST...rechnerisch ermittelt"],
});

export const VorarlbergNetz = new Netzbetreiber({
    name: "VorarlbergNetz",
    descriptorUsage: "Messwert in kWh",
    descriptorTimestamp: "Beginn der Messreihe",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Ende der Messreihe"],
});

export const Tinetz = new Netzbetreiber({
    name: "TINETZ",
    descriptorUsage: "VALUE2",
    descriptorTimestamp: "DATE_FROM2",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["DATE_FROM", "DATE_TO"],
});

export const StadtwerkeKlagenfurt = new Netzbetreiber({
    name: "Stadtwerke Klagenfurt",
    descriptorUsage: "Verbrauch",
    descriptorTimestamp: "DatumUhrzeit",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    otherFields: ["Typ", "Anlage", "OBIS-Code", "Einheit"],
});

export const StadtwerkeKufstein = new Netzbetreiber({
    name: "Stadtwerke Kufstein",
    descriptorUsage: "!AT005140",
    descriptorTimestamp: "Datum",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parsePlainFloat,
    // date column contains a range, which is not parseable; drop end-date after dash
    preprocessDateString: (dateStr) => dateStr.split("-")[0],
});

export const IKB = new Netzbetreiber({
    name: "IKB",
    descriptorUsage: "!AT005100",
    descriptorTimestamp: "Datum",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parsePlainFloat,
    fixupTimestamp: true,
});

export const ClamStrom = new Netzbetreiber({
    name: "ClamStrom",
    descriptorUsage: "Vorschub (kWh) - Verbrauch",
    descriptorTimestamp: "Start",
    dateFormatString: " dd.MM.yyyy HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Ende", "Zählerstand (kWh) - Verbrauch"],
});

export const EWWWels = new Netzbetreiber({
    name: "eww Wels",
    descriptorUsage: "!Netztarif",
    descriptorTimestamp: "BeginDate",
    dateFormatString: "yyyy-MM-dd HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Status", "EndDate", "Unit"],
    endDescriptorTimestamp: "EndDate",
});

export const EWWWelsv2 = new Netzbetreiber({
    name: "eww Wels V2",
    descriptorUsage: "!Restnetzbezug",
    descriptorTimestamp: "BeginDate",
    dateFormatString: "yyyy-MM-dd HH:mm:ss",
    usageParser: parseGermanFloat,
    otherFields: ["Status", "EndDate", "Unit"],
    endDescriptorTimestamp: "EndDate",
});

export const KWG = new Netzbetreiber({
    name: "NetzKWG",
    descriptorUsage: "Daten 1",
    descriptorTimestamp: "Datum",
    dateFormatString: "dd.MM.yyyy HH:mm",
    usageParser: parseGermanFloat,
    fixupTimestamp: true,
    slotDurationMin: 60,
});

/**
 * Registry consumed by `pickNetzbetreiber` in pipeline.js. Order matches
 * historical declaration order so probing behavior is unchanged.
 */
export const listOfNetzbetreiber = [
    NetzNOEEinspeiser,
    NetzNOEEinspeiser2,
    NetzNOEVerbrauchv3EEG,
    NetzNOEVerbrauch,
    NetzNOEVerbrauchv2,
    NetzNOEVerbrauchv3,
    NetzOOE,
    NetzOOEEinspeiser,
    NetzBurgenland,
    NetzBurgenlandv2,
    KaerntenNetz,
    KaerntenNetz2025,
    EbnerStrom,
    WienerNetze,
    WienerNetzeEcontrol,
    WienerNetzeEinspeiser,
    SalzburgNetz,
    SalzburgNetzv4,
    LinzAG,
    StromnetzGraz,
    StromnetzGrazv2,
    EnergienetzeSteiermark,
    EnergienetzeSteiermarkLeistung,
    EnergienetzeSteiermarkv3,
    VorarlbergNetz,
    Tinetz,
    StadtwerkeKlagenfurt,
    StadtwerkeKufstein,
    IKB,
    ClamStrom,
    EWWWels,
    EWWWelsv2,
    KWG,
];
