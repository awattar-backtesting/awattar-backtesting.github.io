import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "../docs/calc/pipeline.js";
import { loadH0Sheet, newMarketdata, readSample } from "./lib/runtime.js";

/**
 * Representative samples chosen for distinct code paths:
 *   - KaerntenNetz.csv:         provider preamble stripped by stripPlain
 *   - NetzNOE.csv:              plain CSV passthrough
 *   - tinetz.csv:               TINETZ preamble + date-format normalization
 *   - wienernetze-einspeisung.csv: einspeisung (feedin) path
 *   - netzooe.xls:              binary .xls format (XLSX.read native parse)
 *   - kwg-at.xlsx:              .xlsx with provider-specific stripXls fixup
 */
const goldenSamples = [
    "KaerntenNetz.csv",
    "NetzNOE.csv",
    "tinetz.csv",
    "wienernetze-einspeisung.csv",
    "netzooe.xls",
    "kwg-at.xlsx",
];

let h0Sheet;
beforeAll(async () => {
    h0Sheet = await loadH0Sheet();
});

describe("golden snapshots", () => {
    it.each(goldenSamples)("%s aggregation is stable", async (name) => {
        const bytes = await readSample(name);
        const result = await runPipeline({
            bytes,
            h0Sheet,
            marketdata: newMarketdata(),
        });
        if (!result.ok) throw new Error(`runPipeline failed: ${result.reason}`);

        expect(snapshotBuckets(result)).toMatchSnapshot();
    });
});

/**
 * Convert the raw runPipeline result to a stable, deterministic shape:
 *   - Decimals → fixed strings (kwh: 6 dp, prices: 4 dp)
 *   - keys sorted ascending
 *   - includes feedin flag and netzbetreiber name for traceability
 */
function snapshotBuckets(result) {
    return {
        netzbetreiber: result.netzbetreiber.name,
        feedin: result.feedin,
        days: Array.from(result.tracker.days).sort(),
        daily: bucketsToFixed(result.daily),
        monthly: bucketsToFixed(result.monthly),
    };
}

function bucketsToFixed(buckets) {
    const out = {};
    for (const key of Object.keys(buckets).sort()) {
        const b = buckets[key];
        out[key] = {
            priceCents: b.priceCents.toFixed(4),
            kwh: b.kwh.toFixed(6),
            h0NormPriceCents: b.h0NormPriceCents.toFixed(4),
            h0NormKwh: b.h0NormKwh.toFixed(6),
        };
    }
    return out;
}
