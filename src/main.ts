import { parseMultiCSV, fitPolynomial, findOptimalDegree } from "./polynomial";

// ── Types & constants ─────────────────────────────────────────────────────────
interface FitSeries {
  name: string;
  x: number[];
  y: number[];
  coefficients: number[];
  r2: number;
  equation: string;
  optimalDegree: number;
  visible: boolean;
  color: string;
}

const COLORS = [
  "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
  "#06b6d4", "#84cc16", "#6366f1", "#e11d48",
  "#0ea5e9", "#a16207", "#7c3aed", "#059669",
  "#b45309", "#1d4ed8", "#be185d", "#0891b2",
];

let allSeries: FitSeries[] = [];
// Cache optimal degree per series so it isn't recomputed on every slider move
const optDegCache = new Map<string, number>();

// ── Chart helpers ─────────────────────────────────────────────────────────────
function evalPoly(coeffs: number[], x: number): number {
  return coeffs.reduce((sum, c, i) => sum + c * Math.pow(x, i), 0);
}

function fmtAxis(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1e4 || Math.abs(n) < 0.01) return n.toExponential(1);
  return parseFloat(n.toPrecision(3)).toString();
}

function setupCanvas(): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
  const canvas = document.getElementById("chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (!W || !H) return null;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
  return { ctx, W, H };
}

const PAD = { top: 24, right: 24, bottom: 42, left: 62 };

function drawGrid(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  xLo: number, xHi: number, yLo: number, yHi: number,
  toX: (x: number) => number, toY: (y: number) => number,
): void {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const GRID = 5;
  ctx.font = `11px 'Source Code Pro', monospace`;

  for (let i = 0; i <= GRID; i++) {
    const gx = xLo + (i / GRID) * (xHi - xLo);
    const gy = yLo + (i / GRID) * (yHi - yLo);
    const cx = toX(gx);
    const cy = toY(gy);

    ctx.strokeStyle = "#e8edf4"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke();

    ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
    ctx.fillText(fmtAxis(gx), cx, PAD.top + plotH + 16);
    ctx.fillStyle = "#94a3b8"; ctx.textAlign = "right";
    ctx.fillText(fmtAxis(gy), PAD.left - 7, cy + 4);
  }

  ctx.setLineDash([4, 4]); ctx.strokeStyle = "#c8d4e0"; ctx.lineWidth = 1;
  if (xLo <= 0 && xHi >= 0) { const cx = toX(0); ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke(); }
  if (yLo <= 0 && yHi >= 0) { const cy = toY(0); ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke(); }
  ctx.setLineDash([]);

  ctx.strokeStyle = "#dde3ec"; ctx.lineWidth = 1;
  ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);
}

function drawEmptyChart(): void {
  const res = setupCanvas();
  if (!res) return;
  const { ctx, W, H } = res;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f1f5f9"; ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

  ctx.strokeStyle = "#e8edf4"; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const cx = PAD.left + (i / 5) * plotW;
    const cy = PAD.top + (i / 5) * plotH;
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke();
  }
  ctx.strokeStyle = "#dde3ec"; ctx.lineWidth = 1;
  ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

  const cx = PAD.left + plotW / 2;
  const cy = PAD.top + plotH / 2;
  ctx.font = `500 13px 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
  ctx.fillText("Upload a CSV file to visualize the curve", cx, cy - 6);
  ctx.font = `11px 'Source Code Pro', monospace`;
  ctx.fillStyle = "#b8c5d4";
  ctx.fillText("Separate series with blank lines · add a name above each section", cx, cy + 14);
}

function drawChart(series: FitSeries[]): void {
  const visible = series.filter((s) => s.visible);
  if (!visible.length) { drawEmptyChart(); return; }

  const res = setupCanvas();
  if (!res) return;
  const { ctx, W, H } = res;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Combined x range
  const allXArr = visible.flatMap((s) => s.x);
  const xMin = Math.min(...allXArr);
  const xMax = Math.max(...allXArr);
  const xLo = xMin;
  const xHi = xMax === xMin ? xMin + 1 : xMax;

  // Combined y range (data + all curves)
  const STEPS = 300;
  const allYArr: number[] = visible.flatMap((s) => s.y);
  for (const s of visible) {
    for (let i = 0; i <= STEPS; i++) {
      allYArr.push(evalPoly(s.coefficients, xLo + (i / STEPS) * (xHi - xLo)));
    }
  }
  const yMin = Math.min(...allYArr);
  const yMax = Math.max(...allYArr);
  const ySpan = yMax - yMin || 1;
  const yLo = yMin - ySpan * 0.08;
  const yHi = yMax + ySpan * 0.08;

  const toX = (x: number) => PAD.left + ((x - xLo) / (xHi - xLo)) * plotW;
  const toY = (y: number) => PAD.top + ((yHi - y) / (yHi - yLo)) * plotH;

  ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f1f5f9"; ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

  drawGrid(ctx, W, H, xLo, xHi, yLo, yHi, toX, toY);

  // Draw curves then points (curves first so points appear on top)
  for (const s of visible) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const cx = toX(xLo + (i / STEPS) * (xHi - xLo));
      const cy = toY(evalPoly(s.coefficients, xLo + (i / STEPS) * (xHi - xLo)));
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }
  for (const s of visible) {
    for (let i = 0; i < s.x.length; i++) {
      ctx.beginPath();
      ctx.arc(toX(s.x[i]), toY(s.y[i]), 4.5, 0, Math.PI * 2);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // In-chart legend (top-left, max 6 entries)
  const MAX_LEGEND = 6;
  const shown = visible.slice(0, MAX_LEGEND);
  const overflow = visible.length - shown.length;
  const lx = PAD.left + 10;
  let ly = PAD.top + 10;
  const lineH = 18;
  ctx.font = `11px 'Source Code Pro', monospace`;

  const legendW = Math.max(...shown.map((s) => ctx.measureText(s.name).width), 80) + 32;
  const legendH = lineH * shown.length + (overflow ? lineH : 0) + 10;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(lx - 6, ly - 6, legendW + 12, legendH);
  ctx.strokeStyle = "#dde3ec"; ctx.lineWidth = 1;
  ctx.strokeRect(lx - 6, ly - 6, legendW + 12, legendH);

  for (const s of shown) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lx, ly + 6); ctx.lineTo(lx + 18, ly + 6); ctx.stroke();
    ctx.fillStyle = "#475569"; ctx.textAlign = "left";
    ctx.fillText(s.name, lx + 24, ly + 10);
    ly += lineH;
  }
  if (overflow > 0) {
    ctx.fillStyle = "#94a3b8"; ctx.textAlign = "left";
    ctx.fillText(`+${overflow} more…`, lx + 24, ly + 10);
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone      = document.getElementById("drop-zone")      as HTMLDivElement;
const fileInput     = document.getElementById("file-input")     as HTMLInputElement;
const fileNameEl    = document.getElementById("file-name")      as HTMLParagraphElement;
const seriesCard    = document.getElementById("series-card")    as HTMLDivElement;
const seriesTbody   = document.getElementById("series-tbody")   as HTMLTableSectionElement;
const coeffCard     = document.getElementById("coeff-card")     as HTMLDivElement;
const coeffContent  = document.getElementById("coeff-content")  as HTMLDivElement;
const errorEl       = document.getElementById("error")          as HTMLParagraphElement;
const statusBadge   = document.getElementById("status-badge")   as HTMLDivElement;
const helpBtn       = document.getElementById("help-btn")       as HTMLButtonElement;
const guideOverlay  = document.getElementById("guide-overlay")  as HTMLDivElement;
const guideClose    = document.getElementById("guide-close")    as HTMLButtonElement;
const curveControls = document.getElementById("curve-controls") as HTMLDivElement;
const pdfBtn        = document.getElementById("pdf-btn")        as HTMLButtonElement;
const printView     = document.getElementById("print-view")     as HTMLDivElement;

let currentCSV: string | null = null;

// ── PDF export helpers ────────────────────────────────────────────────────────
function renderSeriesToDataURL(s: FitSeries): string {
  const W = 600, H = 280;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const xLo = Math.min(...s.x);
  const xHi = Math.max(...s.x) === xLo ? xLo + 1 : Math.max(...s.x);

  const STEPS = 300;
  const allY: number[] = [...s.y];
  for (let i = 0; i <= STEPS; i++) allY.push(evalPoly(s.coefficients, xLo + (i / STEPS) * (xHi - xLo)));
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const ySpan = yMax - yMin || 1;
  const yLo = yMin - ySpan * 0.08;
  const yHi = yMax + ySpan * 0.08;

  const toX = (x: number) => PAD.left + ((x - xLo) / (xHi - xLo)) * (W - PAD.left - PAD.right);
  const toY = (y: number) => PAD.top + ((yHi - y) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

  ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f1f5f9"; ctx.fillRect(PAD.left, PAD.top, W - PAD.left - PAD.right, H - PAD.top - PAD.bottom);
  drawGrid(ctx, W, H, xLo, xHi, yLo, yHi, toX, toY);

  ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const cx = toX(xLo + (i / STEPS) * (xHi - xLo));
    const cy = toY(evalPoly(s.coefficients, xLo + (i / STEPS) * (xHi - xLo)));
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  }
  ctx.stroke();

  for (let i = 0; i < s.x.length; i++) {
    ctx.beginPath();
    ctx.arc(toX(s.x[i]), toY(s.y[i]), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();
  }

  return canvas.toDataURL("image/png");
}

// ── PDF export ────────────────────────────────────────────────────────────────
pdfBtn.addEventListener("click", () => {
  printView.innerHTML = `
    <div class="print-doc-header">
      <h1>Polynomial Curve Fitting Report</h1>
      <p>Generated ${new Date().toLocaleString()} &nbsp;·&nbsp; ${allSeries.length} series</p>
    </div>
    ${allSeries.map((s) => {
      const r2Color = s.r2 >= 0.99 ? "#16a34a" : s.r2 >= 0.90 ? "#b45309" : "#dc2626";
      const coeffRows = s.coefficients.map((c, i) =>
        `<tr><td>a<sub>${i}</sub></td><td>x<sup>${i}</sup></td><td>${c.toPrecision(8)}</td></tr>`
      ).join("");
      return `
        <div class="print-series" style="--series-color:${s.color}">
          <div class="print-series-name">${escapeHTML(s.name)}</div>
          <div class="print-equation">${escapeHTML(s.equation)}</div>
          <div class="print-meta">
            <span>R² <strong style="color:${r2Color}">${s.r2.toFixed(6)}</strong></span>
            <span>Degree <strong>${s.optimalDegree}</strong></span>
            <span>Points <strong>${s.x.length}</strong></span>
          </div>
          <img src="${renderSeriesToDataURL(s)}" class="print-chart-img" />
          <div class="print-coeff-title">Coefficients</div>
          <table class="print-coeff-table">
            <thead><tr><th>Coeff.</th><th>Term</th><th>Value</th></tr></thead>
            <tbody>${coeffRows}</tbody>
          </table>
        </div>`;
    }).join("")}`;
  window.print();
});

// ── Guide modal ───────────────────────────────────────────────────────────────
helpBtn.addEventListener("click", () => guideOverlay.classList.remove("hidden"));
guideClose.addEventListener("click", () => guideOverlay.classList.add("hidden"));
guideOverlay.addEventListener("click", (e) => {
  if (e.target === guideOverlay) guideOverlay.classList.add("hidden");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") guideOverlay.classList.add("hidden");
});

// ── Init ──────────────────────────────────────────────────────────────────────
requestAnimationFrame(drawEmptyChart);

let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (allSeries.length) drawChart(allSeries);
    else drawEmptyChart();
  }, 80);
});

// ── File input ────────────────────────────────────────────────────────────────
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) readFile(file);
});

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file) readFile(file);
});

// ── Core logic ────────────────────────────────────────────────────────────────
function readFile(file: File): void {
  if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
    showError("Please upload a .csv file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentCSV = e.target?.result as string;
    fileNameEl.textContent = `📄 ${file.name}`;
    fileNameEl.classList.remove("hidden");
    optDegCache.clear();
    runFit(currentCSV);
  };
  reader.readAsText(file);
}

function runFit(csv: string): void {
  clearError();
  try {
    const parsed = parseMultiCSV(csv);
    const prevVis = new Map(allSeries.map((s) => [s.name, s.visible]));

    allSeries = parsed.map((s, i) => {
      if (!optDegCache.has(s.name)) {
        optDegCache.set(s.name, findOptimalDegree(s.x, s.y));
      }
      const optDeg = optDegCache.get(s.name)!;
      const result = fitPolynomial(s.x, s.y, optDeg);
      return {
        name: s.name,
        x: s.x,
        y: s.y,
        coefficients: result.coefficients,
        r2: result.r2,
        equation: result.equation,
        optimalDegree: result.coefficients.reduce((m, c, i) => Math.abs(c) >= 1e-10 ? i : m, 0),
        visible: prevVis.get(s.name) ?? true,
        color: COLORS[i % COLORS.length],
      };
    });

    renderCurveButtons();
    renderSeriesTable();
    renderCoeffTables();
    seriesCard.classList.remove("hidden");
    coeffCard.classList.remove("hidden");
    setStatus(`${allSeries.length} series`, "status-ready");
    pdfBtn.classList.remove("hidden");
    drawChart(allSeries);
  } catch (err) {
    showError((err as Error).message);
    seriesCard.classList.add("hidden");
    coeffCard.classList.add("hidden");
    curveControls.classList.add("hidden");
    pdfBtn.classList.add("hidden");
    allSeries = [];
    setStatus("Error", "status-error");
    drawEmptyChart();
  }
}

function toggleSeries(idx: number): void {
  allSeries[idx].visible = !allSeries[idx].visible;
  renderCurveButtons();
  renderSeriesTable();
  drawChart(allSeries);
}

function renderCurveButtons(): void {
  curveControls.innerHTML = "";
  if (!allSeries.length) { curveControls.classList.add("hidden"); return; }
  curveControls.classList.remove("hidden");
  allSeries.forEach((s, i) => {
    const btn = document.createElement("button");
    btn.className = `curve-toggle-btn${s.visible ? " active" : ""}`;
    btn.style.setProperty("--series-color", s.color);
    btn.textContent = s.name;
    btn.title = `Degree ${s.optimalDegree} · R²=${s.r2.toFixed(4)}`;
    btn.addEventListener("click", () => toggleSeries(i));
    curveControls.appendChild(btn);
  });
}

function renderSeriesTable(): void {
  seriesTbody.innerHTML = "";
  allSeries.forEach((s) => {
    const r2Class = s.r2 >= 0.99 ? "r2-good" : s.r2 >= 0.90 ? "r2-ok" : "r2-poor";
    const tr = document.createElement("tr");
    tr.className = `series-row${s.visible ? "" : " series-off"}`;
    tr.innerHTML = `
      <td><span class="series-dot" style="background:${s.color}"></span></td>
      <td class="series-name">${escapeHTML(s.name)}</td>
      <td class="series-eq">${escapeHTML(s.equation)}</td>
      <td class="series-r2 ${r2Class}">${s.r2.toFixed(4)}</td>
      <td class="series-n">${s.x.length}</td>
      <td><span class="opt-deg-badge" title="Optimal degree (adjusted R²)">${s.optimalDegree}</span></td>`;
    seriesTbody.appendChild(tr);
  });
}

function renderCoeffTables(): void {
  coeffContent.innerHTML = "";
  for (const s of allSeries) {
    const group = document.createElement("div");
    group.className = "coeff-group";
    const rows = s.coefficients.map((c, i) =>
      `<tr><td>a<sub>${i}</sub></td><td>x<sup>${i}</sup></td><td>${c.toPrecision(8)}</td></tr>`
    ).join("");
    group.innerHTML = `
      <div class="coeff-group-header">
        <span class="series-dot" style="background:${s.color}"></span>
        ${escapeHTML(s.name)}
      </div>
      <table>
        <thead><tr><th>Coeff.</th><th>Term</th><th>Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    coeffContent.appendChild(group);
  }
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(text: string, cls: string): void {
  statusBadge.textContent = text;
  statusBadge.className = `status-badge ${cls}`;
}
function showError(msg: string): void {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}
function clearError(): void {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}
