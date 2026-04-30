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
    const month = Number(date.substring(4, 6));
    const day = Number(date.substring(6, 8));

    if (month <= 2 || (month <= 3 && day <= 20)) {
        return Zeitzone.Winter;
    } else if (month >= 11) {
        return Zeitzone.Winter;
    } else if ((month >= 6 && month <= 8) || (month == 5 && day >= 15) || (month == 9 && day <= 14)) {
        return Zeitzone.Sommer;
    }
    return Zeitzone.Uebergang;
}

export function computeSheetIndex(zeitzone, dayIndex) {
    /* layout:
     * B = Winter_Samstag
     * C = Winter_Sonntag
     * D = Winter_Werktag
     *
     * E = Sommer_Samstag
     * F = Sommer_Sonntag
     * G = Sommer_Werktag
     *
     * H = Übergang_Samstag
     * I = Übergang_Sonntag
     * J = Übergang_Werktag
     */
    switch (zeitzone) {
        case Zeitzone.Winter:
            if (dayIndex == 6) return 'B';
            if (dayIndex == 0) return 'C';
            return 'D';
        case Zeitzone.Sommer:
            if (dayIndex == 6) return 'E';
            if (dayIndex == 0) return 'F';
            return 'G';
        case Zeitzone.Uebergang:
            if (dayIndex == 6) return 'H';
            if (dayIndex == 0) return 'I';
            return 'J';
    }
}

export function computeH0Day(h0Sheet, day) {
    const zeitzone = computeZeitzone(day);
    const dayAsDate = new Date(day.substring(0, 4), day.substring(4, 6) - 1, day.substring(6, 8), day.substring(8, 10));
    const dayIndex = dayAsDate.getDay();  // 0 == Sonntag, 6 == Samstag

    var sheetIndex = computeSheetIndex(zeitzone, dayIndex);

    var h0DayProfile = new Array(24).fill(0);

    for (let i = 0; i < 24; i++) {
        // Werte in 15min Takte, startet in Zeile 4
        const offset = 4;

        for (let j = 0; j < 4; j++) {
            h0DayProfile[i] += h0Sheet['' + sheetIndex + (offset + i * 4 + j)].v;
        }
    }

    return h0DayProfile;
}
