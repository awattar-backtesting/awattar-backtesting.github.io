import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Filesystem-backed Marketdata fetcher. Reads pre-populated JSON
 * blobs from `cacheDir/<unixStampMs>` (the same files the browser
 * loads at /cache60/). Throws if a day is not in the cache — tests
 * should not depend on live aWATTar API calls.
 */
export function createNodeFetcher(cacheDir) {
    return async function fetchFromCache(unixStamp) {
        const path = join(cacheDir, String(unixStamp));
        return await readFile(path, "utf-8");
    };
}
