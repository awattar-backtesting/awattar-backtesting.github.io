#!/usr/bin/env node
/*
 * Regenerates docs/vendor/* from node_modules.
 *
 * Run `npm install` first, then `node scripts/vendor.mjs`. The output is
 * committed into the repo so the deployed site does not need a build step.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const vendorDir = resolve(root, "docs/vendor");

mkdirSync(vendorDir, { recursive: true });

function bundle(entry, outFile) {
    execFileSync(
        "npx",
        ["esbuild", "--bundle", "--format=esm", `--outfile=${outFile}`, entry],
        { cwd: root, stdio: "inherit" }
    );
}

console.log("vendoring date-fns...");
bundle(
    resolve(root, "node_modules/date-fns/esm/index.js"),
    resolve(vendorDir, "date-fns.mjs")
);

console.log("vendoring papaparse...");
bundle(
    resolve(here, "papaparse-entry.mjs"),
    resolve(vendorDir, "papaparse.mjs")
);

console.log("vendoring decimal.js...");
copyFileSync(
    resolve(root, "node_modules/decimal.js/decimal.mjs"),
    resolve(vendorDir, "decimal.mjs")
);

console.log("vendoring xlsx...");
copyFileSync(
    resolve(root, "node_modules/xlsx/xlsx.mjs"),
    resolve(vendorDir, "xlsx.mjs")
);

console.log("done.");
