import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as XLSX from "xlsx";
import { Marketdata } from "../../docs/marketdata.js";
import { createNodeFetcher } from "./node-fetcher.js";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "..", "..");
export const samplesDir = resolve(repoRoot, "samples");
export const cacheDir = resolve(repoRoot, "docs", "cache60");

let h0SheetCache = null;

/** Loads docs/lastprofile.xls once and caches the first worksheet. */
export async function loadH0Sheet() {
    if (h0SheetCache !== null) return h0SheetCache;
    const buf = await readFile(resolve(repoRoot, "docs", "lastprofile.xls"));
    const wb = XLSX.read(buf);
    h0SheetCache = wb.Sheets[wb.SheetNames[0]];
    return h0SheetCache;
}

/** Fresh Marketdata instance reading from docs/cache60/. */
export function newMarketdata() {
    return new Marketdata(createNodeFetcher(cacheDir));
}

/** Read a sample file from samples/ as a Buffer. */
export async function readSample(name) {
    return await readFile(resolve(samplesDir, name));
}
