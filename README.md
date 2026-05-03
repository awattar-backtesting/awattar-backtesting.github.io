# [awattar-backtesting.github.io](https://awattar-backtesting.github.io)
A tool to visualize your electricity usage with aWATTar

# Run Locally
Just start [index.html](docs\index.html), but make sure to allow CORS from local machine.
Therefore you either run your own webserver or just start chrome with disabled web security:
`chrome.exe --user-data-dir="C://Chrome dev session" --disable-web-security`

# Calc export tariffs
Export tariffs are automatically detected if the data is provided accordingly by the network operator.

## Netz OÖ
Change the line
> "Date";"kWh";"kW";"Status";

to
> "Date";"Feed-in kWh";"kW";"Status";

to use the feed-in data.

# Tests

The calculation pipeline runs in Node as well as in the browser, which lets us
test it without a headless browser.

```
npm ci
npm test          # one-shot
npm run test:watch
```

CI runs the same suite via `.github/workflows/test.yml`.

## Layout

- `docs/calc/pipeline.js` — `runPipeline({ bytes, h0Sheet, marketdata, onWarning })`
  is the single entry point: bytes in, aggregated `daily` / `monthly` buckets out.
  Pure orchestration; the only side-effecting dependency is `marketdata.addDay`,
  which is injected by the caller.
- `docs/marketdata.js` — `Marketdata` takes a pluggable fetcher. The browser
  uses `createBrowserFetcher` (HTTP `/cache60/...` then aWATTar API fallback).
- `tests/lib/node-fetcher.js` — Node-side fetcher; reads `docs/cache60/<ts>` from
  the filesystem. Tests never hit the live aWATTar API.
- `tests/lib/runtime.js` — shared fixtures: `loadH0Sheet()`, `newMarketdata()`,
  `readSample(name)`, plus the `samplesDir` / `cacheDir` paths.

## Test suites

**`tests/smoke.test.js`** — runs every file in `samples/` through `runPipeline`
and asserts each one resolves with `ok: true` and produces at least one day of
aggregated output. Samples that currently fail are tracked in the `knownFailures`
map; entries there must continue to fail with the documented message — if a
known failure starts succeeding, the test fails so the entry can be removed.

**`tests/golden.test.js`** — locks down byte-for-byte aggregation output for a
handful of representative samples covering distinct preprocessing paths
(provider preamble stripping, plain CSV, TINETZ date normalization, einspeisung
/ feedin, binary `.xls`, `.xlsx` with `stripXls` fixups). `Decimal` values are
formatted to fixed precision so the snapshots are stable across platforms.
Refresh after intentional changes with `npx vitest run -u`.

## Adding a new sample

1. Drop the file into `samples/`.
2. `npm test` — the smoke suite picks it up automatically.
3. If it fails for a real reason, fix the parser; if it exposes a pre-existing
   bug you don't want to fix yet, add it to `knownFailures` in `smoke.test.js`
   with a substring of the error/reason message.
4. Optional: add it to `goldenSamples` in `golden.test.js` if it covers a code
   path no other golden touches, and run `npx vitest run -u`.
