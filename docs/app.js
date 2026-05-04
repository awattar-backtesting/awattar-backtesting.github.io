import { format, parse } from "date-fns";
import Decimal from "decimal.js";
import * as XLSX from "xlsx";
import {
    awattar_neu,
    smartcontrol_neu,
    steirerstrom,
    spotty_direkt,
    naturstrom_spot_stunde_ii,
    oekostrom_spot,
    smartcontrol_sunny,
    awattar_sunny_spot_60,
    naturstrom_marktpreis_spot_25,
    wels_strom_sonnenstrom_spot,
    PROVIDER_COLORS,
    makeCustomTarif,
} from "./tariffs.js";
import { Marketdata, createBrowserFetcher } from "./marketdata.js";
import { runPipeline } from "./calc/pipeline.js";

const CONSUMPTION_PROVIDERS = [awattar_neu, smartcontrol_neu, steirerstrom, spotty_direkt, naturstrom_spot_stunde_ii, oekostrom_spot];
const FEEDIN_PROVIDERS = [smartcontrol_sunny, awattar_sunny_spot_60, naturstrom_marktpreis_spot_25, wels_strom_sonnenstrom_spot];

const SAMPLE_HOURLY_PRICES = Array.from({ length: 24 }, (_, h) => {
    const base = 8 + 4 * Math.sin((h - 6) * Math.PI / 12);
    const noise = (Math.sin(h * 17.3) - 0.5) * 6;
    return Math.max(-2, base + noise);
});
const SAMPLE_HOURLY_CONS = Array.from({ length: 24 }, (_, h) => {
    const morning = Math.exp(-0.5 * ((h - 8) / 1.5) ** 2) * 0.9;
    const evening = Math.exp(-0.5 * ((h - 19) / 2) ** 2) * 1.2;
    return Math.max(0.05, 0.15 + morning + evening);
});

const state = {
    providers: CONSUMPTION_PROVIDERS.slice(),
    selectedIds: new Set(),
    view: "monthly",
    dateKey: null,
    chartDay: null,
    feedin: false,
    tracker: null,
    marketdata: null,
    daily: null,
    monthly: null,
    sections: { providers: true, custom: false },
};

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const els = {
    datePrev: $("datePrev"),
    dateNext: $("dateNext"),
    dateLabel: $("dateLabel"),
    datePopup: $("datePopup"),
    uploadBtn: $("uploadBtn"),
    uploadBtnLabel: $("uploadBtnLabel"),
    fileInput: $("fileInput"),
    helpBtn: $("helpBtn"),
    openHelp: $("openHelp"),
    closeHelp: $("closeHelp"),
    helpModal: $("helpModal"),
    warningHolder: $("warningHolder"),
    tableContainer: $("tableContainer"),
    tableTitle: $("tableTitle"),
    tableSub: $("tableSub"),
    chartTitle: $("chartTitle"),
    chartInfo: $("chartInfo"),
    chartWrap: $("chartWrap"),
    providersList: $("providersList"),
    toggleProviders: $("toggleProviders"),
    toggleCustom: $("toggleCustom"),
    customForm: $("customForm"),
    customTariffForm: $("customTariffForm"),
    viewBtns: document.querySelectorAll(".view-btn"),
    sidebarToggles: document.querySelectorAll("[data-toggle]"),
    menuBtn: $("menuBtn"),
    sidebar: $("sidebar"),
    sidebarBackdrop: $("sidebarBackdrop"),
    chartArea: $("chartArea"),
    chartResizeHandle: $("chartResizeHandle"),
};

// ── Marketdata cache (preserved from original) ──────────────────────────────
function loadAwattarCache() {
    const a = new Marketdata(createBrowserFetcher(displayWarning));
    const cache = localStorage.getItem("awattarCache");
    if (cache === null) return a;
    const cached = JSON.parse(cache);
    if (cached.version !== a.version) return a;
    a.data = cached.data;
    return a;
}
function storeAwattarCache(a) {
    localStorage.setItem("awattarCache", JSON.stringify({ version: a.version, data: a.data }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n, dp = 2) {
    if (n === null || n === undefined || (typeof n === "number" && Number.isNaN(n))) return "—";
    if (typeof n === "object" && typeof n.toFixed === "function") return n.toFixed(dp);
    return Number(n).toFixed(dp);
}
function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function isLeap(y) { return ((y % 4 === 0) && (y % 100 !== 0)) || (y % 400 === 0); }
function daysInMonth(y, m) {
    if ([1, 3, 5, 7, 8, 10, 12].includes(m)) return 31;
    if (m === 2) return isLeap(y) ? 29 : 28;
    return 30;
}
function monthlyFeeFactorFor(yyyyMM) {
    const y = parseInt(yyyyMM.slice(0, 4), 10);
    const m = parseInt(yyyyMM.slice(4, 6), 10);
    const dpy = isLeap(y) ? 366 : 365;
    return 12 * daysInMonth(y, m) / dpy;
}

function makeNetzbetreiberLabel(name) {
    return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Sidebar rendering ───────────────────────────────────────────────────────
function providerTotalEur(p) {
    const buckets = state.monthly;
    if (!buckets) return null;
    let sum = new Decimal(0);
    for (const key of Object.keys(buckets)) {
        const b = buckets[key];
        sum = sum.plus(p.calculate(b.priceCents, b.kwh, true, monthlyFeeFactorFor(key)));
    }
    return sum.dividedBy(100);
}

// Picks a default selection of providers:
//   ≤4 providers → all of them
//   >4 providers → the cheapest, the most expensive, and 2 random others
//                  (falls back to 4 random if no monthly data is loaded yet)
function pickDefaultSelection() {
    const providers = state.providers;
    if (providers.length <= 4) {
        return new Set(providers.map((p) => p.meta.id));
    }
    const indices = providers.map((_, i) => i);
    const picked = new Set();
    if (state.monthly) {
        const totals = providers.map((p) => Number(providerTotalEur(p)));
        let minIdx = 0, maxIdx = 0;
        totals.forEach((v, i) => {
            if (v < totals[minIdx]) minIdx = i;
            if (v > totals[maxIdx]) maxIdx = i;
        });
        picked.add(minIdx);
        picked.add(maxIdx);
    }
    const rest = indices.filter((i) => !picked.has(i));
    for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    rest.slice(0, 4 - picked.size).forEach((i) => picked.add(i));
    return new Set([...picked].map((i) => providers[i].meta.id));
}

function renderSidebar() {
    const wrap = els.providersList;
    const totals = state.monthly ? state.providers.map(providerTotalEur) : null;
    let cheapestIdx = -1, dearestIdx = -1;
    if (totals && totals.length > 1) {
        let cheapest = null, dearest = null;
        totals.forEach((t, i) => {
            if (t === null) return;
            const v = Number(t);
            if (cheapest === null || v < cheapest) { cheapest = v; cheapestIdx = i; }
            if (dearest === null || v > dearest) { dearest = v; dearestIdx = i; }
        });
        if (cheapestIdx === dearestIdx) dearestIdx = -1;
    }
    const items = state.providers.map((p, i) => {
        const m = p.meta;
        const selected = state.selectedIds.has(m.id);
        const markupBits = [];
        if (m.markupPct !== 0) markupBits.push(`${m.markupPct > 0 ? "+" : ""}${m.markupPct}%`);
        if (m.addFixedGross !== 0) markupBits.push(`${m.addFixedGross > 0 ? "+" : ""}${m.addFixedGross.toFixed(2)} ct/kWh`);
        markupBits.push(`${m.baseMonthly.toFixed(2)} €/Mon.`);
        const meta = markupBits.join(" · ");
        const linkHTML = m.url
            ? `<a class="provider-link" href="${escapeHTML(m.url)}" target="_blank" rel="noopener noreferrer" title="Tarifblatt öffnen">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7M21 3l-9 9M19 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6"/></svg>
              </a>`
            : "";
        let totalHTML = "";
        if (totals) {
            const t = totals[i];
            const cls = i === cheapestIdx ? " best" : (i === dearestIdx ? " worst" : "");
            totalHTML = `<div class="provider-total${cls}">${t === null ? "—" : `${t.toFixed(0)} €`}</div>`;
        }
        return `
            <div class="provider-card${selected ? " selected" : ""}${m.isCustom ? " has-remove" : ""}" data-id="${escapeHTML(m.id)}">
                <span class="provider-color-dot" style="background:${m.color}"></span>
                <span class="provider-toggle${selected ? " on" : ""}"></span>
                <div class="provider-info">
                    <div class="provider-name${selected ? " selected" : ""}">${escapeHTML(m.shortName)}${linkHTML}${m.isCustom ? '<span class="tag-custom">Custom</span>' : ""}</div>
                    <div class="provider-meta">${escapeHTML(meta)}</div>
                </div>
                ${totalHTML}
                ${m.isCustom ? `<button class="provider-remove" data-remove="${escapeHTML(m.id)}" title="Entfernen">×</button>` : ""}
            </div>`;
    }).join("");
    const counter = `<div class="provider-counter">${state.selectedIds.size} von ${state.providers.length} gewählt</div>`;
    wrap.innerHTML = items + counter;

    wrap.querySelectorAll(".provider-card").forEach((el) => {
        el.addEventListener("click", (e) => {
            if (e.target.closest("[data-remove], a")) return;
            toggleProvider(el.dataset.id);
        });
    });
    wrap.querySelectorAll("[data-remove]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            removeProvider(btn.dataset.remove);
        });
    });
}

function toggleProvider(id) {
    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
    renderSidebar();
    renderTable();
}

function removeProvider(id) {
    state.providers = state.providers.filter((p) => p.meta.id !== id);
    state.selectedIds.delete(id);
    renderSidebar();
    renderTable();
}

function addCustomProvider(form) {
    const data = new FormData(form);
    const num = (k, fallback) => {
        const v = parseFloat(data.get(k));
        return Number.isFinite(v) ? v : fallback;
    };
    const name = String(data.get("name") || "Mein Tarif").trim() || "Mein Tarif";
    const markupPct = num("markupPct", 0);
    const addFixed = num("addFixed", 0);
    const baseMonthly = num("baseMonthly", 0);
    const vat = num("vat", 20);

    const id = "custom_" + Date.now();
    const usedColors = new Set(state.providers.map((p) => p.meta.color));
    const color = PROVIDER_COLORS.find((c) => !usedColors.has(c)) || PROVIDER_COLORS[state.providers.length % PROVIDER_COLORS.length];
    const t = makeCustomTarif({ id, name, markupPct, addFixed, baseMonthly, vat, color });
    state.providers.push(t);
    state.selectedIds.add(id);
    state.sections.custom = false;
    renderSidebar();
    renderTable();
    syncSectionToggles();
}

// ── Comparison table ────────────────────────────────────────────────────────
function renderTable() {
    const buckets = state.view === "monthly" ? state.monthly : state.daily;
    const fmtKey = state.view === "monthly" ? "yyyyMM" : "yyyyMMdd";
    const fmtOut = state.view === "monthly" ? "yyyy-MM" : "yyyy-MM-dd";
    const includeMonthlyFee = state.view === "monthly";

    els.tableTitle.textContent = state.feedin
        ? (state.view === "monthly" ? "Einspeisung monatlich" : "Einspeisung täglich")
        : (state.view === "monthly" ? "Energiekosten monatlich" : "Energiekosten täglich");
    els.tableSub.textContent = state.feedin ? "netto" : "inkl. 20% MwSt.";

    if (!buckets || state.selectedIds.size === 0) {
        const text = !buckets
            ? "Lade deine Verbrauchsdaten, um die Übersicht zu sehen."
            : "Wähle mindestens einen Anbieter aus der Sidebar.";
        els.tableContainer.innerHTML = `<div class="empty-state"><div class="empty-icon">⚡</div><div class="empty-text">${text}</div></div>`;
        return;
    }

    const selected = state.providers.filter((p) => state.selectedIds.has(p.meta.id));
    const keys = Object.keys(buckets).sort();

    // Pre-compute provider costs per key
    const computed = {};
    for (const k of keys) {
        const b = buckets[k];
        const factor = state.view === "monthly" ? monthlyFeeFactorFor(k) : 1;
        computed[k] = {};
        for (const p of selected) {
            const cents = p.calculate(b.priceCents, b.kwh, includeMonthlyFee, factor);
            computed[k][p.meta.id] = cents;
        }
    }
    // Totals: for monthly view, sum the per-row gross. For daily view, the per-row
    // costs exclude the monthly base fee, so totals are computed from monthly
    // buckets so the user sees a realistic period total.
    const totals = {};
    if (state.view === "monthly") {
        for (const p of selected) {
            let sum = new Decimal(0);
            for (const k of keys) sum = sum.plus(computed[k][p.meta.id]);
            totals[p.meta.id] = sum;
        }
    } else {
        const mb = state.monthly || {};
        for (const p of selected) {
            let sum = new Decimal(0);
            for (const mk of Object.keys(mb)) {
                const b = mb[mk];
                sum = sum.plus(p.calculate(b.priceCents, b.kwh, true, monthlyFeeFactorFor(mk)));
            }
            totals[p.meta.id] = sum;
        }
    }

    const headerProviderCols = selected.map((p) => {
        const m = p.meta;
        const bits = [];
        if (m.markupPct !== 0) bits.push(`${m.markupPct > 0 ? "+" : ""}${m.markupPct}%`);
        if (m.addFixedGross !== 0) bits.push(`${m.addFixedGross > 0 ? "+" : ""}${m.addFixedGross.toFixed(2)}ct`);
        bits.push(`${m.baseMonthly.toFixed(2)}€/mo`);
        return `<th class="num">
            <div class="provider-col-header">
                <div class="provider-col-name-row">
                    <span class="provider-col-dot" style="background:${m.color}"></span>
                    <span class="provider-col-name">${escapeHTML(m.shortName)}${m.isCustom ? '<span class="tag-custom">Custom</span>' : ""}</span>
                </div>
                <div class="provider-col-markup">${escapeHTML(bits.join(" "))}</div>
            </div>
        </th>`;
    }).join("");

    const bodyRows = keys.map((k) => {
        const b = buckets[k];
        const dateOut = format(parse(k, fmtKey, new Date()), fmtOut);
        const energyKwh = Number(b.kwh);
        const epexAvg = b.kwh.equals(0) ? 0 : Number(b.priceCents.dividedBy(b.kwh));
        const h0Avg = b.h0NormKwh && !b.h0NormKwh.equals(0) ? Number(b.h0NormPriceCents.dividedBy(b.h0NormKwh)) : null;
        const h0Diff = h0Avg !== null ? epexAvg - h0Avg : null;

        const costs = computed[k];
        const grossNumbers = selected.map((p) => Number(costs[p.meta.id]));
        const best = Math.min(...grossNumbers);

        const providerCells = selected.map((p, i) => {
            const cents = costs[p.meta.id];
            const grossEur = Number(cents) / 100;
            const avgCt = b.kwh.equals(0) ? 0 : Number(cents.dividedBy(b.kwh));
            const isBest = grossNumbers[i] === best && selected.length > 1;
            const cls = isBest ? "best-cell" : "";
            return `<td class="num">
                <div class="cost-cell">
                    <span class="cost-gross ${cls}">
                        ${fmtNum(grossEur, 2)} €${isBest ? '<span class="best-indicator"></span>' : ""}
                    </span>
                    <span class="cost-cent">${fmtNum(avgCt, 2)} ct/kWh</span>
                </div>
            </td>`;
        }).join("");

        const h0Cell = h0Avg === null
            ? `<td class="num td-price">—</td>`
            : `<td class="num td-price">
                ${fmtNum(h0Avg, 2)} ct/kWh
                <span class="h0-diff ${h0Diff < 0 ? "diff-good" : "diff-bad"}">(${h0Diff > 0 ? "+" : ""}${fmtNum(h0Diff, 2)})</span>
              </td>`;

        return `<tr>
            <td class="td-month">${escapeHTML(dateOut)}</td>
            <td class="num td-energy">${fmtNum(energyKwh, 0)} kWh</td>
            <td class="num td-price">${fmtNum(epexAvg, 2)} ct/kWh</td>
            ${state.feedin ? "" : h0Cell}
            ${providerCells}
        </tr>`;
    }).join("");

    const totalsRow = `<tr class="totals-row">
        <td colspan="${state.feedin ? 3 : 4}" style="font-family:'DM Sans';font-weight:600;font-size:12px;">Gesamt${state.view === "daily" ? " (Monatssummen inkl. Grundpreis)" : ""}</td>
        ${selected.map((p) => {
            const cents = totals[p.meta.id];
            const grossEur = Number(cents) / 100;
            return `<td class="num">
                <div class="cost-cell">
                    <span class="cost-gross">${fmtNum(grossEur, 2)} €</span>
                </div>
            </td>`;
        }).join("")}
    </tr>`;

    els.tableContainer.innerHTML = `
        <table class="compare">
            <thead>
                <tr>
                    <th>${state.view === "monthly" ? "Monat" : "Datum"}</th>
                    <th class="num">Energie</th>
                    <th class="num">EPEX Ø</th>
                    ${state.feedin ? "" : '<th class="num">H0 Ø</th>'}
                    ${headerProviderCols}
                </tr>
            </thead>
            <tbody>
                ${bodyRows}
                ${totalsRow}
            </tbody>
        </table>`;
}

// ── Hourly chart ────────────────────────────────────────────────────────────
function renderChart() {
    const wrap = els.chartWrap;
    const sample = !state.tracker;

    ensureChartDay();

    let prices, consumption, priceBox, daysCount;
    let priceMin, priceMax, consMax;
    if (sample) {
        prices = SAMPLE_HOURLY_PRICES;
        consumption = SAMPLE_HOURLY_CONS;
        priceBox = null;
        daysCount = 0;
        priceMin = Math.min(...prices, 0);
        priceMax = Math.max(...prices, 0.1);
        consMax = Math.max(...consumption, 0.1);
    } else {
        const { chartDays, axisDays } = chartDayScope();
        const r = aggregateHourly(chartDays);
        prices = r.prices; consumption = r.consumption;
        priceBox = r.priceBox; daysCount = chartDays.length;
        const ab = axisBounds(axisDays);
        priceMin = Math.min(ab.priceMin, 0);
        priceMax = Math.max(ab.priceMax, 0.1);
        consMax = Math.max(ab.consMax, 0.1);
    }
    const showBox = priceBox && state.view === "monthly" && state.chartDay === null && daysCount >= 2;
    const priceRange = (priceMax - priceMin) || 1;

    els.chartTitle.textContent = "EPEX SPOT — Stündliche Preise";
    const avgPrice = prices.reduce((s, v) => s + v, 0) / prices.length;
    els.chartInfo.textContent = `Ø ${avgPrice.toFixed(2)} ct/kWh`;

    const yAxisLeft = [priceMax, (priceMax + priceMin) / 2, priceMin];
    const yAxisRight = [consMax, consMax / 2, 0];
    const zeroTopPct = (priceMax / priceRange) * 100;

    const toPct = (v) => ((v - priceMin) / priceRange) * 85 + 8;
    const clampPct = (v) => Math.max(0, Math.min(100, v));
    const bars = prices.map((p, i) => {
        const heightPct = toPct(p);
        const isNeg = p < 0;
        let boxHTML = "";
        let priceTooltip = `⚡ Ø ${p.toFixed(2)} ct/kWh`;
        const stats = showBox ? priceBox[i] : null;
        if (stats) {
            const q1 = clampPct(toPct(stats.q1));
            const q3 = clampPct(toPct(stats.q3));
            const med = clampPct(toPct(stats.median));
            const wl = clampPct(toPct(stats.whiskerLow));
            const wh = clampPct(toPct(stats.whiskerHigh));
            const outliersHTML = stats.outliers.map((v) => {
                const yp = clampPct(toPct(v));
                return `<div class="bp-outlier" style="bottom:${yp.toFixed(2)}%"></div>`;
            }).join("");
            boxHTML = `<div class="chart-bar-boxplot">
                <div class="bp-whisker" style="bottom:${wl.toFixed(2)}%; height:${Math.max(0, q1 - wl).toFixed(2)}%"></div>
                <div class="bp-whisker" style="bottom:${q3.toFixed(2)}%; height:${Math.max(0, wh - q3).toFixed(2)}%"></div>
                <div class="bp-cap" style="bottom:${wl.toFixed(2)}%"></div>
                <div class="bp-cap" style="bottom:${wh.toFixed(2)}%"></div>
                <div class="bp-box" style="bottom:${q1.toFixed(2)}%; height:${Math.max(0.5, q3 - q1).toFixed(2)}%"></div>
                <div class="bp-median" style="bottom:${med.toFixed(2)}%"></div>
                ${outliersHTML}
            </div>`;
            priceTooltip =
                `⚡ Ø ${p.toFixed(2)} ct/kWh<br>` +
                `Median ${stats.median.toFixed(2)} · IQR [${stats.q1.toFixed(2)}, ${stats.q3.toFixed(2)}]<br>` +
                `Whiskers [${stats.whiskerLow.toFixed(2)}, ${stats.whiskerHigh.toFixed(2)}]` +
                (stats.outliers.length ? ` · ${stats.outliers.length} Ausreißer` : "");
        }
        return `
            <div class="chart-bar-wrap">
                <div class="chart-bar ${isNeg ? "neg" : "pos"}" style="height:${heightPct}%"></div>
                ${boxHTML}
                <div class="chart-tooltip">
                    <span class="tooltip-title">${i}:00–${i + 1}:00</span><br>
                    <span class="tooltip-price">${priceTooltip}</span><br>
                    <span class="tooltip-cons">~ ${consumption[i].toFixed(2)} kWh</span>
                </div>
            </div>`;
    }).join("");

    const polyline = consumption.map((c, i) => {
        const x = ((i + 0.5) / 24) * 100;
        const y = (1 - (c / consMax) * 0.85) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");

    const dots = consumption.map((c, i) => {
        const x = ((i + 0.5) / 24) * 100;
        const y = (1 - (c / consMax) * 0.85) * 100;
        return `<circle cx="${x.toFixed(2)}%" cy="${y.toFixed(2)}%" r="3" fill="oklch(62% 0.18 260)" stroke="white" stroke-width="1" />`;
    }).join("");

    const xLabels = [0, 4, 8, 12, 16, 20, 24].map((h) => {
        let style;
        if (h === 0) style = "left:0; transform:none";
        else if (h === 24) style = "left:auto; right:0; transform:none";
        else style = `left:${(h / 24) * 100}%`;
        return `<span class="chart-x-label" style="${style}">${h}h</span>`;
    }).join("");

    wrap.innerHTML = `
        ${sample ? `<div class="chart-placeholder">⚠ Beispieldaten — lade CSV für echte Werte</div>` : ""}
        <div class="chart-row">
            <div class="chart-axis chart-axis-left">
                ${yAxisLeft.map((v) => `<span>${v.toFixed(1)}</span>`).join("")}
            </div>
            <div class="chart-canvas">
                ${priceMin < 0 ? `<div class="chart-zero-line" style="top:${zeroTopPct}%"></div>` : ""}
                <div class="chart-bars">${bars}</div>
                <svg class="chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline points="${polyline}" fill="none" stroke="oklch(62% 0.18 260)" stroke-width="1.5"
                              stroke-linejoin="round" stroke-linecap="round" opacity="0.9"
                              vector-effect="non-scaling-stroke" />
                </svg>
                <svg class="chart-svg" style="overflow:visible">
                    ${dots}
                </svg>
            </div>
            <div class="chart-axis chart-axis-right">
                ${yAxisRight.map((v) => `<span>${v.toFixed(1)}</span>`).join("")}
            </div>
        </div>
        <div class="chart-x-row">${xLabels}</div>
        <div class="chart-legend">
            <span class="chart-legend-item"><span class="chart-legend-swatch-bar"></span>EPEX SPOT (ct/kWh)</span>
            <span class="chart-legend-item"><span class="chart-legend-swatch-line"></span>Verbrauch (kWh)</span>
            ${showBox ? `<span class="chart-legend-item"><span class="chart-legend-swatch-stddev"></span>Box plot über ${daysCount} Tage</span>` : ""}
        </div>`;
}

function formatDateKey(key) {
    if (key.length === 6) return format(parse(key, "yyyyMM", new Date()), "yyyy-MM");
    return format(parse(key, "yyyyMMdd", new Date()), "yyyy-MM-dd");
}

function chartDayScope() {
    // Returns { chartDays, axisDays }
    // - chartDays: days the bars/line cover (one day if chartDay is selected)
    // - axisDays: days that define the y-axis range, kept stable across day-nav
    const tracker = state.tracker;
    const monthKey = (state.view === "monthly")
        ? state.dateKey
        : (state.dateKey || "").slice(0, 6);
    const monthDays = [];
    for (const d of tracker.days) if (d.startsWith(monthKey)) monthDays.push(d);

    let chartDays;
    if (state.view === "monthly") {
        chartDays = state.chartDay && tracker.days.has(state.chartDay)
            ? [state.chartDay]
            : monthDays;
    } else {
        chartDays = tracker.days.has(state.dateKey) ? [state.dateKey] : [];
    }
    const axisDays = monthDays.length ? monthDays : chartDays;
    return { chartDays, axisDays };
}

function axisBounds(days) {
    // Min/max raw hourly values across the given days — used for stable axis
    // labels while the user navigates between days within the same month.
    const tracker = state.tracker;
    const md = state.marketdata;
    let priceMin = Infinity, priceMax = -Infinity, consMax = -Infinity;
    for (const d of days) {
        const usages = tracker.data[d];
        const prices = md.data[d];
        if (!usages || !prices) continue;
        for (let h = 0; h < 24; h++) {
            const u = usages[h];
            const p = prices[h];
            if (p !== undefined) {
                const pn = Number(p);
                if (pn < priceMin) priceMin = pn;
                if (pn > priceMax) priceMax = pn;
            }
            if (u !== undefined) {
                const un = Number(u);
                if (un > consMax) consMax = un;
            }
        }
    }
    if (!Number.isFinite(priceMin)) priceMin = 0;
    if (!Number.isFinite(priceMax)) priceMax = 0.1;
    if (!Number.isFinite(consMax)) consMax = 0.1;
    return { priceMin, priceMax, consMax };
}

function aggregateHourly(days) {
    const tracker = state.tracker;
    const md = state.marketdata;
    const pricesPerHour = Array.from({ length: 24 }, () => []);
    const consPerHour = Array.from({ length: 24 }, () => []);
    for (const d of days) {
        const usages = tracker.data[d];
        const prices = md.data[d];
        if (!usages || !prices) continue;
        for (let h = 0; h < 24; h++) {
            const u = usages[h];
            const p = prices[h];
            if (u !== undefined) consPerHour[h].push(Number(u));
            if (p !== undefined) pricesPerHour[h].push(Number(p));
        }
    }
    const mean = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    const quantile = (sorted, q) => {
        const pos = q * (sorted.length - 1);
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
    };
    const boxStats = (arr) => {
        if (arr.length < 2) return null;
        const sorted = [...arr].sort((a, b) => a - b);
        const q1 = quantile(sorted, 0.25);
        const median = quantile(sorted, 0.5);
        const q3 = quantile(sorted, 0.75);
        const iqr = q3 - q1;
        const lowBound = q1 - 1.5 * iqr;
        const highBound = q3 + 1.5 * iqr;
        const within = sorted.filter((v) => v >= lowBound && v <= highBound);
        const outliers = sorted.filter((v) => v < lowBound || v > highBound);
        return {
            q1, median, q3,
            whiskerLow: within[0],
            whiskerHigh: within[within.length - 1],
            outliers,
        };
    };
    const prices = pricesPerHour.map(mean);
    const priceBox = pricesPerHour.map(boxStats);
    const consumption = consPerHour.map(mean);
    return { prices, priceBox, consumption, days };
}

// ── Date nav ────────────────────────────────────────────────────────────────
function availableKeys() {
    const buckets = state.view === "monthly" ? state.monthly : state.daily;
    if (!buckets) return [];
    return Object.keys(buckets).sort();
}
function ensureDateKey() {
    const keys = availableKeys();
    if (keys.length === 0) { state.dateKey = null; return; }
    if (!keys.includes(state.dateKey)) state.dateKey = keys[0];
}
function ensureChartDay() {
    if (state.view === "daily") {
        state.chartDay = null;
        return;
    }
    if (state.chartDay) {
        const days = trackerDaysInMonth(state.dateKey);
        if (!days.includes(state.chartDay)) state.chartDay = null;
    }
}

// ── Unified date nav ────────────────────────────────────────────────────────
function trackerDaysInMonth(monthKey) {
    if (!state.tracker || !monthKey) return [];
    return [...state.tracker.days].sort().filter((d) => d.startsWith(monthKey));
}
function dateNavStep(delta) {
    // Step the displayed unit. In monthly view: month if no day drilled,
    // otherwise day with cross-month wrap. In daily view: day.
    if (state.view === "daily") {
        const keys = availableKeys();
        if (keys.length === 0) return;
        const idx = keys.indexOf(state.dateKey);
        const next = Math.max(0, Math.min(keys.length - 1, idx + delta));
        state.dateKey = keys[next];
    } else if (state.chartDay === null) {
        const keys = availableKeys();
        if (keys.length === 0) return;
        const idx = keys.indexOf(state.dateKey);
        const next = Math.max(0, Math.min(keys.length - 1, idx + delta));
        state.dateKey = keys[next];
    } else {
        // Monthly view, drilled into a day → step day, jump month at the edge.
        const allDays = state.tracker ? [...state.tracker.days].sort() : [];
        const idx = allDays.indexOf(state.chartDay);
        const next = idx + delta;
        if (idx < 0 || next < 0 || next >= allDays.length) {
            // Off the end of available data → exit day mode.
            state.chartDay = null;
        } else {
            state.chartDay = allDays[next];
            const newMonth = state.chartDay.slice(0, 6);
            if (newMonth !== state.dateKey) state.dateKey = newMonth;
        }
    }
    renderDateNav();
    renderTable();
    renderChart();
}
function dateNavCanStep(delta) {
    if (!state.tracker || !state.dateKey) return false;
    if (state.view === "daily" || state.chartDay === null) {
        const keys = availableKeys();
        const idx = keys.indexOf(state.dateKey);
        const next = idx + delta;
        return next >= 0 && next < keys.length;
    }
    const allDays = [...state.tracker.days].sort();
    const idx = allDays.indexOf(state.chartDay);
    const next = idx + delta;
    return next >= 0 && next < allDays.length;
}
function renderDateNav() {
    if (!state.dateKey) {
        els.dateLabel.textContent = "—";
        els.dateLabel.classList.remove("day-mode");
        els.datePrev.disabled = true;
        els.dateNext.disabled = true;
        return;
    }
    const showingDay = state.chartDay || (state.view === "daily" ? state.dateKey : null);
    els.dateLabel.textContent = showingDay ? formatDateKey(showingDay) : formatDateKey(state.dateKey);
    els.dateLabel.classList.toggle("day-mode", !!state.chartDay);
    els.datePrev.disabled = !dateNavCanStep(-1);
    els.dateNext.disabled = !dateNavCanStep(1);
}

// ── Date popup ──────────────────────────────────────────────────────────────
function openDatePopup() {
    if (!state.tracker) return;
    renderDatePopup();
    const popup = els.datePopup;
    popup.classList.remove("hidden");
    const r = els.dateLabel.getBoundingClientRect();
    // Show below the label by default; flip above if not enough room.
    const popupHeight = Math.min(window.innerHeight * 0.6, 480);
    const below = r.bottom + 6;
    const top = (below + popupHeight > window.innerHeight - 8)
        ? Math.max(8, r.top - popupHeight - 6)
        : below;
    const popupWidth = popup.getBoundingClientRect().width || 280;
    let left = r.left + r.width / 2 - popupWidth / 2;
    left = Math.max(8, Math.min(window.innerWidth - popupWidth - 8, left));
    popup.style.top = top + "px";
    popup.style.left = left + "px";
}
function closeDatePopup() {
    els.datePopup.classList.add("hidden");
}
function renderDatePopup() {
    const tracker = state.tracker;
    if (!tracker) {
        els.datePopup.innerHTML = `<div class="date-popup-empty">Keine Daten geladen</div>`;
        return;
    }
    const allDays = [...tracker.days].sort();
    const months = [...new Set(allDays.map((d) => d.slice(0, 6)))];
    const isDaily = state.view === "daily";
    const currentMonth = state.dateKey && state.dateKey.length >= 6 ? state.dateKey.slice(0, 6) : null;
    const currentDay = state.chartDay || (isDaily ? state.dateKey : null);

    const html = months.map((m) => {
        const days = allDays.filter((d) => d.startsWith(m));
        const cls = ["date-popup-month-name"];
        if (m === currentMonth && !currentDay) cls.push("current");
        if (m === currentMonth) cls.push("active");
        const dom = days[0] ? new Date(parseInt(days[0].slice(0, 4)), parseInt(days[0].slice(4, 6)) - 1, 1) : null;
        const monthLabel = dom ? format(dom, "MMM yyyy") : m;
        const firstWeekday = dom ? (new Date(parseInt(m.slice(0, 4)), parseInt(m.slice(4, 6)) - 1, 1).getDay() + 6) % 7 : 0;
        const dayCells = [];
        for (let i = 0; i < firstWeekday; i++) dayCells.push(`<span class="date-popup-day empty"></span>`);
        for (const d of days) {
            const dnum = parseInt(d.slice(6, 8), 10);
            const isCurrent = d === currentDay;
            dayCells.push(`<button class="date-popup-day${isCurrent ? " current" : ""}" data-day="${d}">${dnum}</button>`);
        }
        const monthAction = isDaily ? "" : `data-month="${m}"`;
        const monthBtn = isDaily
            ? `<span class="date-popup-month-name">${escapeHTML(monthLabel)}</span>`
            : `<button class="${cls.join(" ")}" ${monthAction} title="Ganzer Monat">${escapeHTML(monthLabel)}</button>`;
        return `<div class="date-popup-month">
            <div class="date-popup-month-row">${monthBtn}</div>
            <div class="date-popup-days">${dayCells.join("")}</div>
        </div>`;
    }).join("");

    els.datePopup.innerHTML = html || `<div class="date-popup-empty">Keine Tage verfügbar</div>`;
}
function pickFromPopup(target) {
    const monthBtn = target.closest("[data-month]");
    if (monthBtn) {
        state.dateKey = monthBtn.dataset.month;
        state.chartDay = null;
        closeDatePopup();
        renderDateNav();
        renderTable();
        renderChart();
        return;
    }
    const dayBtn = target.closest("[data-day]");
    if (dayBtn) {
        const day = dayBtn.dataset.day;
        if (state.view === "daily") {
            state.dateKey = day;
            state.chartDay = null;
        } else {
            state.dateKey = day.slice(0, 6);
            state.chartDay = day;
        }
        closeDatePopup();
        renderDateNav();
        renderTable();
        renderChart();
    }
}

// ── Sections / view toggle ──────────────────────────────────────────────────
function syncSectionToggles() {
    els.toggleProviders.classList.toggle("open", state.sections.providers);
    els.toggleCustom.classList.toggle("open", state.sections.custom);
    els.providersList.style.display = state.sections.providers ? "block" : "none";
    els.customForm.style.display = state.sections.custom ? "block" : "none";
}

function setView(view) {
    if (view === state.view) return;
    state.view = view;
    document.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    // adjust dateKey to match new granularity
    if (view === "monthly" && state.dateKey && state.dateKey.length > 6) {
        state.dateKey = state.dateKey.slice(0, 6);
    } else if (view === "daily" && state.dateKey && state.dateKey.length === 6) {
        const candidate = availableKeys().find((d) => d.startsWith(state.dateKey));
        if (candidate) state.dateKey = candidate;
    }
    state.chartDay = null;
    ensureDateKey();
    renderDateNav();
    renderTable();
    renderChart();
}

// ── Upload pipeline ─────────────────────────────────────────────────────────
function displayWarning(msg) {
    console.warn("Backtesting warning:", msg);
    els.warningHolder.textContent = msg;
    els.warningHolder.classList.add("show");
}
function clearWarning() {
    els.warningHolder.textContent = "";
    els.warningHolder.classList.remove("show");
}

async function handleUpload(file) {
    clearWarning();
    const bytes = await file.arrayBuffer();

    const lastprofile_array = await (await fetch("./lastprofile.xls")).arrayBuffer();
    const lastprofile_sheets = XLSX.read(lastprofile_array);
    const h0Sheet = lastprofile_sheets.Sheets[lastprofile_sheets.SheetNames[0]];

    const marketdata = loadAwattarCache();
    const result = await runPipeline({ bytes, h0Sheet, marketdata, onWarning: displayWarning });
    if (!result.ok) {
        if (result.reason === "unknown netzbetreiber") {
            console.log("sample row:", result.sample);
            displayWarning("Netzbetreiber für Upload unbekannt — siehe Konsole für Beispieldaten.");
        }
        return;
    }
    storeAwattarCache(marketdata);

    const previousCustom = state.providers.filter((p) => p.meta.isCustom);
    const previousCustomIds = new Set(previousCustom.map((p) => p.meta.id));

    state.tracker = result.tracker;
    state.marketdata = marketdata;
    state.daily = result.daily;
    state.monthly = result.monthly;
    state.feedin = result.feedin;
    state.providers = (result.feedin ? FEEDIN_PROVIDERS : CONSUMPTION_PROVIDERS).slice().concat(previousCustom);
    state.selectedIds = new Set([...pickDefaultSelection(), ...previousCustomIds]);
    state.dateKey = null;
    state.chartDay = null;
    ensureDateKey();
    els.uploadBtn.classList.add("upload-active");
    els.uploadBtnLabel.textContent = "Andere Datei laden";

    renderDateNav();
    renderSidebar();
    renderTable();
    renderChart();
}

// ── Wire events ─────────────────────────────────────────────────────────────
function init() {
    // Sidebar sections
    els.sidebarToggles.forEach((el) => {
        el.addEventListener("click", () => {
            const key = el.dataset.toggle;
            state.sections[key] = !state.sections[key];
            syncSectionToggles();
        });
    });
    syncSectionToggles();

    // Date nav (chart header)
    els.datePrev.addEventListener("click", () => dateNavStep(-1));
    els.dateNext.addEventListener("click", () => dateNavStep(1));
    els.dateLabel.addEventListener("click", () => {
        if (els.datePopup.classList.contains("hidden")) openDatePopup();
        else closeDatePopup();
    });
    els.datePopup.addEventListener("click", (e) => pickFromPopup(e.target));
    document.addEventListener("click", (e) => {
        if (els.datePopup.classList.contains("hidden")) return;
        if (els.datePopup.contains(e.target) || els.dateLabel.contains(e.target)) return;
        closeDatePopup();
    });
    window.addEventListener("resize", () => closeDatePopup());

    // Upload
    els.uploadBtn.addEventListener("click", () => els.fileInput.click());
    els.fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) handleUpload(file);
    });

    // View toggle
    document.querySelectorAll(".view-btn").forEach((b) => {
        b.addEventListener("click", () => setView(b.dataset.view));
    });

    // Custom tariff submit
    els.customTariffForm.addEventListener("submit", (e) => {
        e.preventDefault();
        addCustomProvider(e.target);
    });

    // Help modal
    const openModal = () => els.helpModal.classList.add("show");
    const closeModal = () => els.helpModal.classList.remove("show");
    els.helpBtn.addEventListener("click", openModal);
    els.openHelp.addEventListener("click", openModal);
    els.closeHelp.addEventListener("click", closeModal);
    els.helpModal.addEventListener("click", (e) => {
        if (e.target === els.helpModal) closeModal();
    });

    // Mobile sidebar drawer
    const openSidebar = () => {
        els.sidebar.classList.add("open");
        els.sidebarBackdrop.classList.add("show");
    };
    const closeSidebar = () => {
        els.sidebar.classList.remove("open");
        els.sidebarBackdrop.classList.remove("show");
    };
    els.menuBtn.addEventListener("click", openSidebar);
    els.sidebarBackdrop.addEventListener("click", closeSidebar);
    window.addEventListener("resize", () => {
        if (window.innerWidth > 768) closeSidebar();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeModal();
            closeSidebar();
            closeDatePopup();
        }
    });

    setupChartResize();

    // Initial render
    state.selectedIds = pickDefaultSelection();
    renderSidebar();
    renderTable();
    renderChart();
    renderDateNav();
}

function setupChartResize() {
    const handle = els.chartResizeHandle;
    const area = els.chartArea;
    if (!handle || !area) return;

    const onPointerMove = (e) => {
        const delta = e.clientY - handle._startY;
        const next = Math.max(160, handle._startH - delta);
        area.style.height = next + "px";
    };
    const onPointerUp = (e) => {
        handle.classList.remove("dragging");
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onPointerMove);
        handle.removeEventListener("pointerup", onPointerUp);
        document.body.style.userSelect = "";
    };
    handle.addEventListener("pointerdown", (e) => {
        handle._startY = e.clientY;
        handle._startH = area.getBoundingClientRect().height;
        handle.setPointerCapture(e.pointerId);
        handle.classList.add("dragging");
        document.body.style.userSelect = "none";
        handle.addEventListener("pointermove", onPointerMove);
        handle.addEventListener("pointerup", onPointerUp);
        e.preventDefault();
    });
}

document.addEventListener("DOMContentLoaded", init);
