import { parse, parseISO } from "https://cdn.skypack.dev/date-fns@2.16.1";

export class Netzbetreiber {
    name = "name";
    descriptorUsage = "usage";
    descriptorTimestamp = "timestamp";
    descriptorTimesub = "timesub";
    dateFormatString = "foo";
    feedin = false;

    constructor(name, descriptorUsage, descriptorTimestamp, descriptorTimeSub, dateFormatString, usageParser, otherFields, shouldSkip, fixupTimestamp, feedin = false) {
        this.name = name;
        this.descriptorUsage = descriptorUsage;
        this.descriptorTimestamp = descriptorTimestamp;
        this.descriptorTimeSub = descriptorTimeSub;
        this.dateFormatString = dateFormatString;
        this.usageParser = usageParser;
        this.otherFields = otherFields;
        this.shouldSkip = shouldSkip;
        this.fixupTimestamp = fixupTimestamp;
        this.feedin = feedin
    }

    matchUsage(entry) {
        if (this.descriptorUsage[0] === '!') {
            /* fuzzy check as we don't know the exact column name */
            var desc = this.descriptorUsage.substring(1);
            var entries = Object.keys(entry);
            for (var e in entries) {
                if (entries[e].includes(desc)) {
                    return entries[e];
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
        for (var e in this.otherFields) {
            if (!(this.otherFields[e] in entry)) {
                return false;
            }
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

        var valueTimestamp = entry[this.descriptorTimestamp];
        if (this.descriptorTimeSub !== null) {
            valueTimestamp += " " + entry[this.descriptorTimeSub];
        }
        var parsedTimestamp = null;
        if (this.dateFormatString === "parseISO") {
            parsedTimestamp = parseISO(valueTimestamp);
        } else {
            parsedTimestamp = parse(valueTimestamp, this.dateFormatString, new Date())
        }

        var valueUsage = entry[this.matchUsage(entry)];
        if (valueUsage === "" || valueUsage === undefined) {
            return null;
        }
        var parsedUsage = this.usageParser(valueUsage);

        if (this.fixupTimestamp) {
            /* most Netzbetreiber specify the start date, for some it's ambigious and only obvious by looking at the first and last entry of a single day export, e.g.
             * > Messzeitpunkt;Gemessener Verbrauch (kWh);Ersatzwert;
             * > 10.11.2023 00:15;0,228000;;
             * > 10.11.2023 00:30;0,197000;;
             * > [...]
             * > 10.11.2023 23:45;0,214000;;
             * > 11.11.2023 00:00;0,397000;;
            */
            var MS_PER_MINUTE = 60000;
            parsedTimestamp = new Date(parsedTimestamp - 15 * MS_PER_MINUTE);
        }

        return {
            timestamp: parsedTimestamp,
            usage: parsedUsage,
        }
    }
};

export const NetzNOEEinspeiser = new Netzbetreiber("NetzNÖ", "Gemessene Menge (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), null, null, true, true);

export const NetzNOEEinspeiser2 = new Netzbetreiber("NetzNÖ", "Einspeisung (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), null, null, true, true);

export const NetzNOEVerbrauchv3EEG = new Netzbetreiber("NetzNÖ", "Restnetzbezug (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Eigendeckung (kWh)", "Verbrauch (kWh)", ], null, true);

export const NetzNOEVerbrauch = new Netzbetreiber("NetzNÖ", "Gemessener Verbrauch (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ersatzwert"], null, true);

export const NetzNOEVerbrauchv2 = new Netzbetreiber("NetzNÖ", "Verbrauch (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Qualität"], null, true);

export const NetzNOEVerbrauchv3 = new Netzbetreiber("NetzNÖ", "Verbrauch (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), [], null, true);

export const NetzOOE = new Netzbetreiber("NetzOÖ", "kWh", "Datum", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["kW", "Status"], null, false);

export const NetzBurgenland = new Netzbetreiber("Netz Burgenland", "Verbrauch (kWh) - Gesamtverbrauch", "Start", null, " dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ende"], null, false);

export const NetzBurgenlandv2 = new Netzbetreiber("Netz Burgenland V2", "Verbrauch (in kWh)", "Startdatum", "Startuhrzeit", "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), [/*" Status", */"Enddatum", "Enduhrzeit"], null, false);

export const KaerntenNetz = new Netzbetreiber("KaerntenNetz", "kWh", "Datum", "Zeit", "dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Status"], null, false);

export const EbnerStrom = new Netzbetreiber("EbnerStrom", "Wert (kWh)", "Zeitstempel String", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage);
}), ["Angezeigter Zeitraum"], (function (row) {
    var valueObiscode = row["Obiscode"];
    return valueObiscode !== "1.8.0";
}), true);

export const WienerNetze = new Netzbetreiber("WienerNetze", "!Verbrauch [kWh]", "Datum", "Zeit von", "dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Zeit bis"], null, false);

export const SalzburgNetz = new Netzbetreiber("SalzburgNetz", "!kWh)", "Datum und Uhrzeit", null, "yyyy-MM-dd HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Status"], null, false);

export const LinzAG = new Netzbetreiber("LinzAG", "Energiemenge in kWh", "Datum von", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ersatzwert"], null, false);

export const StromnetzGraz = new Netzbetreiber("StromnetzGraz", "Verbrauch Gesamt - 1.8.0", "Ablesezeitpunkt", null, "parseISO", (function (usage) {
    return parseFloat(usage);
}), ["Zaehlerstand Gesamt - 1.8.0", "Verbrauch Gesamt - 1.8.0", "Status Gesamt - 1.8.0", "Zaehlerstand Hochtarif - 1.8.1", "Verbrauch Hochtarif - 1.8.1", "Status Hochtarif - 1.8.1", "Zaehlerstand Niedertarif - 1.8.2", "Verbrauch Niedertarif - 1.8.2", "Status Niedertarif - 1.8.2"], null, false);

export const EnergienetzeSteiermark = new Netzbetreiber("EnergieNetzeSteiermark", "Verbrauch", "Verbrauchszeitraum Beginn", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Anlagennummer","Tarif","Verbrauchszeitraum Ende","Einheit","Messwert: VAL...gemessen, EST...rechnerisch ermittelt"], null, false);

export const EnergienetzeSteiermarkLeistung = new Netzbetreiber("EnergienetzeSteiermarkLeistung", "Wert", "Statistikzeitraum Beginn", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Anlagennummer","Tarif","Statistikzeitraum Ende","Einheit","Messwert: VAL...gemessen, EST...rechnerisch ermittelt"], null, false);

export const VorarlbergNetz = new Netzbetreiber("VorarlbergNetz", "Messwert in kWh", "Beginn der Messreihe", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ende der Messreihe"], null, false);

export const Tinetz = new Netzbetreiber("TINETZ", "VALUE2", "DATE_FROM2", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["DATE_FROM", "DATE_TO"], null, false);

export const StadtwerkeKlagenfurt = new Netzbetreiber("Stadtwerke Klagenfurt", "Verbrauch", "DatumUhrzeit", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Typ", "Anlage", "OBIS-Code", "Einheit"], null, false);

export const IKB = new Netzbetreiber("IKB", "!AT005100", "Datum", null, "dd.MM.yyyy HH:mm",  (function (usage) {
    return parseFloat(usage);
}), [], null, true);

export const ClamStrom = new Netzbetreiber("ClamStrom", "Vorschub (kWh) - Verbrauch", "Start", null, " dd.MM.yyyy HH:mm:ss",  (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ende", "Zählerstand (kWh) - Verbrauch"], null, false);
