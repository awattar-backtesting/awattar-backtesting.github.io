import * as XLSX from "xlsx";
import { parse } from "date-fns";

/*
 * H0 Standardlastprofil lookup against the Energie-Control workbook
 * (lastprofile.xls). Pure functions; the workbook sheet is passed in.
 */

export const Zeitzone = {
    Sommer: 0,
    Winter: 1,
    Uebergang: 2,
};

export function computeZeitzone(date) {
    /*
     * Ein Jahreslastprofil besteht aus drei Zeitzonen,
     * → Winter: 1.11.-20.03.,
     * → Sommer: 15.05.-14.09. und
     * → Übergang: 21.03.-14.05. bzw. 15.09.-31.10
     */
    const month = date.getMonth() + 1;
    const day = date.getDate();

    if (month <= 2 || (month <= 3 && day <= 20)) {
        return Zeitzone.Winter;
    } else if (month >= 11) {
        return Zeitzone.Winter;
    } else if ((month >= 6 && month <= 8) || (month === 5 && day >= 15) || (month === 9 && day <= 14)) {
        return Zeitzone.Sommer;
    }
    return Zeitzone.Uebergang;
}

export function computeSheetColumn(zeitzone, dayIndex) {
    /* layout (0-based column indices):
     *  1 = Winter_Samstag        (B)
     *  2 = Winter_Sonntag        (C)
     *  3 = Winter_Werktag        (D)
     *
     *  4 = Sommer_Samstag        (E)
     *  5 = Sommer_Sonntag        (F)
     *  6 = Sommer_Werktag        (G)
     *
     *  7 = Übergang_Samstag      (H)
     *  8 = Übergang_Sonntag      (I)
     *  9 = Übergang_Werktag      (J)
     */
    const base = { [Zeitzone.Winter]: 1, [Zeitzone.Sommer]: 4, [Zeitzone.Uebergang]: 7 }[zeitzone];
    if (dayIndex === 6) return base;       // Samstag
    if (dayIndex === 0) return base + 1;   // Sonntag
    return base + 2;                       // Werktag
}

export function computeH0Day(h0Sheet, day) {
    const dayAsDate = parse(day, "yyyyMMdd", new Date());
    const zeitzone = computeZeitzone(dayAsDate);
    const dayIndex = dayAsDate.getDay();  // 0 == Sonntag, 6 == Samstag

    const col = computeSheetColumn(zeitzone, dayIndex);
    const h0DayProfile = new Array(24).fill(0);

    // Werte in 15min Takte, Datenstart in Zeile 4 (zero-indexed: Zeile 3)
    const rowOffset = 3;
    for (let i = 0; i < 24; i++) {
        for (let j = 0; j < 4; j++) {
            const addr = XLSX.utils.encode_cell({ c: col, r: rowOffset + i * 4 + j });
            h0DayProfile[i] += h0Sheet[addr].v;
        }
    }

    return h0DayProfile;
}
