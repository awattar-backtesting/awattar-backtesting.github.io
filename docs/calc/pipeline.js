import * as XLSX from "xlsx";
import Papa from "papaparse";
import { stripPlain, stripXls } from "./preprocess.js";
import { Tracker } from "./tracker.js";
import { aggregateCosts } from "./costs.js";
import { listOfNetzbetreiber } from "../netzbetreiber.js";

/**
 * End-to-end orchestration of a single upload: bytes in, cost
 * aggregations out. No DOM, no global fetch — every effectful
 * dependency is passed in.
 *
 * Inputs:
 *   bytes       — ArrayBuffer / Uint8Array / Buffer of the original upload
 *   h0Sheet     — already-loaded H0 worksheet (lastprofile.xls)
 *   marketdata  — Marketdata instance; the caller wires its fetcher
 *   onWarning   — invoked with a string for surfaced warnings
 *
 * Resolves to either
 *   { ok: false, reason, sample? }
 *   { ok: true, tracker, marketdata, daily, monthly, netzbetreiber, feedin }
 */
export async function runPipeline({ bytes, h0Sheet, marketdata, onWarning = () => {} }) {
    const stripped = stripPlain(bytes, onWarning);
    if (stripped === null) {
        return { ok: false, reason: "stripPlain rejected the upload" };
    }

    const xls = stripXls(XLSX.read(new Uint8Array(stripped), { raw: 'true' }));
    const csv = XLSX.utils.sheet_to_csv(xls.Sheets[xls.SheetNames[0]]);

    const parsed = await new Promise(resolve => {
        Papa.parse(csv, { header: true, complete: resolve });
    });
    const rows = parsed.data;
    if (!rows || rows.length === 0 || (rows.length === 1 && Object.keys(rows[0]).length <= 1)) {
        onWarning("Die hochgeladene CSV-Datei ist leer oder enthält keine gültigen Daten.");
        return { ok: false, reason: "empty or invalid CSV" };
    }

    const netzbetreiber = pickNetzbetreiber(rows[0]);
    if (netzbetreiber === null) {
        onWarning("Netzbetreiber fuer Upload unbekannt, check console");
        return { ok: false, reason: "unknown netzbetreiber", sample: rows[0] };
    }

    const tracker = new Tracker();
    for (let i = 0; i < rows.length; i++) {
        tracker.addEntry(netzbetreiber, rows[i]);
    }
    tracker.postProcess();

    if (tracker.days.size === 0) {
        onWarning("Keine gültigen 15-Minuten-Verbrauchsdaten in der Datei gefunden. Bitte prüfen Sie die Datei.");
        return { ok: false, reason: "no valid 15-min data" };
    }

    await Promise.all(Array.from(tracker.days).map(d => marketdata.addDay(d)));

    const { daily, monthly } = aggregateCosts(tracker, marketdata, h0Sheet);

    return {
        ok: true,
        tracker,
        marketdata,
        daily,
        monthly,
        netzbetreiber,
        feedin: netzbetreiber.feedin,
    };
}

function pickNetzbetreiber(sample) {
    for (const betreiber of listOfNetzbetreiber) {
        if (betreiber.probe(sample)) {
            return betreiber;
        }
    }
    return null;
}
