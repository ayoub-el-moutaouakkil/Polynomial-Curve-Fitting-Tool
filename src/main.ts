import { parseMultiCSV, fitPolynomial } from "./polynomial";

// ── Types & constants ─────────────────────────────────────────────────────────
interface FitSeries {
  name: string;
  x: number[];
  y: number[];
  coefficients: number[];
  r2: number;
  equation: string;
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
  const xSpan = xMax - xMin || 1;
  const xLo = xMin - xSpan * 0.05;
  const xHi = xMax + xSpan * 0.05;

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
const dropZone    = document.getElementById("drop-zone")    as HTMLDivElement;
const fileInput   = document.getElementById("file-input")   as HTMLInputElement;
const fileNameEl  = document.getElementById("file-name")    as HTMLParagraphElement;
const degreeInput = document.getElementById("degree")       as HTMLInputElement;
const degreeValue = document.getElementById("degree-value") as HTMLSpanElement;
const seriesCard  = document.getElementById("series-card")  as HTMLDivElement;
const seriesTbody = document.getElementById("series-tbody") as HTMLTableSectionElement;
const coeffCard   = document.getElementById("coeff-card")   as HTMLDivElement;
const coeffContent= document.getElementById("coeff-content")as HTMLDivElement;
const errorEl     = document.getElementById("error")        as HTMLParagraphElement;
const statusBadge  = document.getElementById("status-badge")   as HTMLDivElement;
const helpBtn      = document.getElementById("help-btn")        as HTMLButtonElement;
const guideOverlay = document.getElementById("guide-overlay")   as HTMLDivElement;
const guideClose   = document.getElementById("guide-close")     as HTMLButtonElement;

let currentCSV: string | null = null;

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

// ── Degree slider ─────────────────────────────────────────────────────────────
degreeInput.addEventListener("input", () => {
  degreeValue.textContent = degreeInput.value;
  if (currentCSV) runFit(currentCSV);
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
    runFit(currentCSV);
  };
  reader.readAsText(file);
}

function runFit(csv: string): void {
  clearError();
  try {
    const parsed = parseMultiCSV(csv);
    const degree = parseInt(degreeInput.value, 10);

    // Preserve visibility when re-fitting (e.g. degree change)
    const prevVis = new Map(allSeries.map((s) => [s.name, s.visible]));

    allSeries = parsed.map((s, i) => {
      const result = fitPolynomial(s.x, s.y, degree);
      return {
        name: s.name,
        x: s.x,
        y: s.y,
        coefficients: result.coefficients,
        r2: result.r2,
        equation: result.equation,
        visible: prevVis.get(s.name) ?? true,
        color: COLORS[i % COLORS.length],
      };
    });

    renderSeriesTable();
    renderCoeffTables();
    seriesCard.classList.remove("hidden");
    coeffCard.classList.remove("hidden");
    setStatus(`${allSeries.length} series · Degree ${degree}`, "status-ready");
    drawChart(allSeries);
  } catch (err) {
    showError((err as Error).message);
    seriesCard.classList.add("hidden");
    coeffCard.classList.add("hidden");
    allSeries = [];
    setStatus("Error", "status-error");
    drawEmptyChart();
  }
}

function toggleSeries(idx: number): void {
  allSeries[idx].visible = !allSeries[idx].visible;
  renderSeriesTable();
  drawChart(allSeries);
}

function renderSeriesTable(): void {
  seriesTbody.innerHTML = "";
  allSeries.forEach((s, i) => {
    const r2Class = s.r2 >= 0.99 ? "r2-good" : s.r2 >= 0.90 ? "r2-ok" : "r2-poor";
    const tr = document.createElement("tr");
    tr.className = `series-row${s.visible ? "" : " series-off"}`;
    tr.title = s.visible ? "Click to hide" : "Click to show";
    tr.innerHTML = `
      <td><span class="series-dot" style="background:${s.color}"></span></td>
      <td class="series-name">${s.name}</td>
      <td class="series-eq">${s.equation}</td>
      <td class="series-r2 ${r2Class}">${s.r2.toFixed(4)}</td>
      <td class="series-n">${s.x.length}</td>
      <td>
        <button class="eye-btn" title="${s.visible ? "Hide" : "Show"}">
          ${s.visible
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
          }
        </button>
      </td>`;
    tr.addEventListener("click", () => toggleSeries(i));
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
        ${s.name}
      </div>
      <table>
        <thead><tr><th>Coeff.</th><th>Term</th><th>Value</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    coeffContent.appendChild(group);
  }
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
