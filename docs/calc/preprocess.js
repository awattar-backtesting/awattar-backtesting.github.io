import * as XLSX from "xlsx";

function bufferToString(buf) {
    return new Uint8Array(buf)
        .reduce((data, byte) => data + String.fromCharCode(byte), '');
}

function decodeUTF16LE(buf) {
    return new TextDecoder('utf-16le').decode(buf);
}

function stringToBuffer(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

/**
 * Preprocess a raw upload (ArrayBuffer) by stripping provider-specific
 * preambles or fixing up known quirks. Returns a normalized ArrayBuffer
 * suitable for XLSX.read, or null when the data should be rejected.
 *
 * `onWarning(message)` is called for soft warnings; the caller decides
 * whether/how to surface them. A return value of null means the caller
 * should stop processing this upload (a fatal warning will have been
 * emitted via onWarning).
 */
export function stripPlain(buf, onWarning = () => {}) {
    var input = bufferToString(buf);
    // Kaernten Netz
    //
    // v1:
    // > Kundennummer;XXXXXX
    // > Kundenname;YYYYYYYY
    // > ZP-Nummer;ATXXXXX00XXXX0000XX0XXX0XXXXXXXXX
    // > Beginn;01.01.2020
    // > Ende;29.03.2023
    // > Energierichtung;Netzbezug
    // >
    // >
    // > Datum;Zeit;kWh;Status
    //
    //
    // v2:
    // > Kundennummer;12345678;;
    // > Kundenname;Mustermann Max;;
    // > ZP-Nummer;AT0070000XXXX10000000000000XXXXXX;;
    // > Beginn;27.03.2024;;
    // > Ende;01.05.2024;;
    // > Energierichtung;Verbrauch gemessen;;
    // > ;;;
    // > ;;;
    // > Datum;Zeit;kWh;Status
    //
    if (input.includes("Kundennummer") && input.includes("Kundenname") && input.includes("ZP-Nummer") && input.includes("Energierichtung")) {
        if (!input.includes("Netzbezug") && !input.includes("Verbrauch gemessen")) {
            onWarning("Falsche Daten (Einspeisepunkt?). Bitte Bezug waehlen");
            return null;
        }
        return stringToBuffer(input.split("\n").slice(8).join("\n"));
    }

    // VorarlbergNetz
    // > Vertragskonto;XXXXXXXXXXXX
    // > Zählpunkt;ATXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    var input16le = decodeUTF16LE(buf);
    if (input16le.includes("Vertragskonto;") && input16le.includes("Zählpunkt;")) {
        return stringToBuffer(input16le.split("\n").slice(3).join("\n"));
    }

    // Stromnetz Graz v2
    if (input.includes("Lieferrichtung: Bezug;;;;;;;;;") && input.includes("Verbrauch Hochtarif - 1.8.1") && input.includes("Verbrauch Niedertarif - 1.8.2")) {
        return stringToBuffer(input.split("\n").slice(1).join("\n"));
    }

    // NetzBurgenland V2
    // > Zählpunktbezeichnung;Kennzahl;Zählernummer;Exportiere ab;Exportiere bis;Exportiere ab;Exportiere bis
    // > AT0090000000000000000000000049656;1-1:1.9.0 P.01;;01.08.2023;31.08.2023;00:00;00:00
    // [.. data for bezug ..]
    // > Zählpunktbezeichnung;Kennzahl;Zählernummer;Exportiere ab;Exportiere bis;Exportiere ab;Exportiere bis
    // > AT0090000000000000000000000049656;1-1:1.9.0 P.01;;01.08.2023;31.08.2023;00:00;00:00
    // [.. data for einspeisung ..]
    function isBurgenlandv2Header(s) {
        if (!s.includes("hlpunktbezeichnung")) {
            return false;
        }
        if (!s.includes("Kennzahl")) {
            return false;
        }
        if (!s.includes("hlernummer")) {
            return false;
        }
        if (!s.includes("Exportiere ab")) {
            return false;
        }
        return s.includes("Exportiere bis");
    }

    if (isBurgenlandv2Header(input)) {
        var result = [];

        // drop first two lines
        var lines = input.split("\n").slice(2);

        for (let i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (isBurgenlandv2Header(line)) {
                // second header found, drop lines from here on.
                return stringToBuffer(result.join("\n"));
            }
            result.push(line);
        }

        // v3, yet another format discovered in the wild
        return stringToBuffer(result.join("\n"));
    }

    // > PLZ Ort, Adresse [Zählpunktnummer];;;PLZ Ort, Adresse [Zählpunktnummer];;
    // > Zählpunktnummer;;;Zählpunktnummer;;
    // > Strom - Wirkenergie (kWh);;;Strom - Wirkenergie (kWh);;
    // > kWh;;;kWh;;
    // > DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE
    function isTinetz(s) {
        return s.includes("DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE");
    }

    if (isTinetz(input)) {
        var lines = input.split("\n");
        var s = lines.slice(4).join("\n");
        var lastLine = lines.slice(-2)[0];

        /* check if 15min values are on the left or right side (the CSV export also contains daily usages) */
        if (lastLine.startsWith(";;;")) {
            s = s.replace("DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE", "DATE_FROM;DATE_TO;VALUE;DATE_FROM2;DATE_TO2;VALUE2");
        } else {
            s = s.replace("DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE", "DATE_FROM2;DATE_TO2;VALUE2;DATE_FROM;DATE_TO;VALUE");
            if (!lastLine.endsWith(";;;")) {
                onWarning("why tho TINETZ?!? Please report...");
            }
        }

        /* normalize date format (= remove seconds) */
        var t = s.replace(/ (\d\d:\d\d):00;/gm, " $1;");

        return stringToBuffer(t);
    }

    // everything else
    return buf;
}

function ec(r, c) {
    return XLSX.utils.encode_cell({ r: r, c: c });
}

function delete_row(ws, row_index) {
    var variable = XLSX.utils.decode_range(ws["!ref"]);
    for (var R = row_index; R < variable.e.r; ++R) {
        for (var C = variable.s.c; C <= variable.e.c; ++C) {
            ws[ec(R, C)] = ws[ec(R + 1, C)];
        }
    }
    variable.e.r--;
    ws['!ref'] = XLSX.utils.encode_range(variable.s, variable.e);
    return ws;
}

function update_sheet_range(ws) {
    var range = { s: { r: 20000000, c: 20000000 }, e: { r: 0, c: 0 } };
    Object.keys(ws).filter(function (x) { return x.charAt(0) != "!"; }).map(XLSX.utils.decode_cell).forEach(function (x) {
        range.s.c = Math.min(range.s.c, x.c); range.s.r = Math.min(range.s.r, x.r);
        range.e.c = Math.max(range.e.c, x.c); range.e.r = Math.max(range.e.r, x.r);
    });
    ws['!ref'] = XLSX.utils.encode_range(range);
}

/**
 * Apply provider-specific fixups to an XLSX workbook. Mutates and
 * returns the workbook. Pure: no DOM, no I/O.
 */
export function stripXls(xls) {
    var first_ws = xls.Sheets[xls.SheetNames[0]];
    // Ebner Strom
    // > Zeitstempel String	Obiscode	Wert (kWh)	Angezeigter Zeitraum
    // > Zählpunkt: AT0034600000000000000000XXYYYZZZZ
    // > 01.03.2023 00:15	1.8.0	0,28	01.03.2023 - 31.03.2023
    // > 01.03.2023 00:15	2.8.0	0	01.03.2023 - 31.03.2023
    if (first_ws.A1.v.includes("Zeitstempel String") && first_ws.A2.v.includes("hlpunkt")) {
        /* fixup broken XLS, so that [!ref] is set correctly */
        update_sheet_range(first_ws);
        /* delete "Zaehlpunkt" row, it confuses the CSV parser */
        delete_row(first_ws, 1);
    }

    // kwg.at
    // > Lastprofil
    // > Daten 1:  Verbrauch lt. Messung IME
    // > Datum  Daten 1
    if (first_ws.A1.v.includes("Lastprofil") && first_ws.A2.v.includes("Daten 1:  Verbrauch lt. Messung IME")) {
        delete_row(first_ws, 0);
        /* after deleting first row, the second row jumps up; so we need to delete again row 0 to actually delete the second row */
        delete_row(first_ws, 0);
    }
    return xls;
}
