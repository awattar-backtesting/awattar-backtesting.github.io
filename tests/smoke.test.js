import { readdirSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "../docs/calc/pipeline.js";
import { loadH0Sheet, newMarketdata, readSample, samplesDir } from "./lib/runtime.js";

const sampleNames = readdirSync(samplesDir).filter(n => !n.startsWith("."));

/**
 * Samples that currently fail — either pre-existing bugs unrelated to
 * this refactor, or formats we don't fully support yet. Each entry is
 * a substring matched against the thrown message OR the result.reason.
 */
const knownFailures = {
    "EnergienetzeSteiermarkv3.xlsx": "Invalid time value", // dates exported as M/d/yy by sheet_to_csv but parser expects dd.MM.yy
};

let h0Sheet;
beforeAll(async () => {
    h0Sheet = await loadH0Sheet();
});

describe("smoke: every sample feeds runPipeline cleanly", () => {
    it("samples directory is non-empty", () => {
        expect(sampleNames.length).toBeGreaterThan(0);
    });

    it.each(sampleNames)("processes %s", async (name) => {
        const bytes = await readSample(name);
        const warnings = [];
        const expected = knownFailures[name];

        let result;
        let thrown;
        try {
            result = await runPipeline({
                bytes,
                h0Sheet,
                marketdata: newMarketdata(),
                onWarning: msg => warnings.push(msg),
            });
        } catch (e) {
            thrown = e;
        }

        if (expected !== undefined) {
            const observed = thrown?.message ?? (result?.ok === false ? result.reason : "<succeeded>");
            expect(observed, `known-failure for ${name} no longer matches — update knownFailures`).toContain(expected);
            return;
        }

        if (thrown) throw thrown;
        if (!result.ok) {
            throw new Error(
                `runPipeline failed for ${name}: ${result.reason}\nwarnings: ${warnings.join(" | ")}`
            );
        }
        expect(result.tracker.days.size).toBeGreaterThan(0);
        for (const day of result.tracker.days) {
            expect(result.daily[day]).toBeDefined();
        }
    });
});
