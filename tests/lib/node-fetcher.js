import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Filesystem-backed Marketdata fetcher. Reads pre-populated JSON
 * blobs from `cacheDirs[source]/<unixStampMs>` (the same files the
 * browser loads at /cache60/ or /cache15/). Throws if a day is not
 * in the cache — tests should not depend on live API calls.
 */
export function createNodeFetcher(cacheDirs) {
    // Back-compat: callers passing a single string get hourly only.
    const dirs = typeof cacheDirs === "string"
        ? { hourly: cacheDirs }
        : cacheDirs;
    return async function fetchFromCache(unixStamp, source = "hourly") {
        const dir = dirs[source];
        if (!dir) throw new Error(`No cache directory configured for source "${source}"`);
        const path = join(dir, String(unixStamp));
        return await readFile(path, "utf-8");
    };
}
