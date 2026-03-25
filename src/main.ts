import { parseCSV, fitPolynomial } from "./polynomial";

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
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  xLo: number, xHi: number,
  yLo: number, yHi: number,
  toX: (x: number) => number,
  toY: (y: number) => number,
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

    ctx.strokeStyle = "#e8edf4";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke();

    ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center";
    ctx.fillText(fmtAxis(gx), cx, PAD.top + plotH + 16);
    ctx.fillStyle = "#94a3b8"; ctx.textAlign = "right";
    ctx.fillText(fmtAxis(gy), PAD.left - 7, cy + 4);
  }

  // Zero axes
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#c8d4e0";
  ctx.lineWidth = 1;
  if (xLo <= 0 && xHi >= 0) {
    const cx = toX(0);
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
  }
  if (yLo <= 0 && yHi >= 0) {
    const cy = toY(0);
    ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Border
  ctx.strokeStyle = "#dde3ec";
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);
}

function drawEmptyChart(): void {
  const res = setupCanvas();
  if (!res) return;
  const { ctx, W, H } = res;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

  const toX = (x: number) => PAD.left + x * plotW;
  const toY = (y: number) => PAD.top + y * plotH;

  // Faint grid
  ctx.strokeStyle = "#e8edf4";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const cx = toX(i / 5);
    const cy = toY(i / 5);
    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke();
  }

  ctx.strokeStyle = "#dde3ec";
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

  // Center message
  const cx = PAD.left + plotW / 2;
  const cy = PAD.top + plotH / 2;
  ctx.font = `500 13px 'Inter', system-ui, sans-serif`;
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "center";
  ctx.fillText("Upload a CSV file to visualize the curve", cx, cy - 6);
  ctx.font = `11px 'Source Code Pro', monospace`;
  ctx.fillStyle = "#b8c5d4";
  ctx.fillText("x, y  ·  comma or semicolon delimited", cx, cy + 14);
}

function drawChart(xData: number[], yData: number[], coeffs: number[]): void {
  const res = setupCanvas();
  if (!res) return;
  const { ctx, W, H } = res;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const xMin = Math.min(...xData);
  const xMax = Math.max(...xData);
  const xSpan = xMax - xMin || 1;
  const xLo = xMin - xSpan * 0.05;
  const xHi = xMax + xSpan * 0.05;

  const STEPS = 300;
  const curveY: number[] = [];
  for (let i = 0; i <= STEPS; i++) {
    curveY.push(evalPoly(coeffs, xLo + (i / STEPS) * (xHi - xLo)));
  }

  const allY = [...yData, ...curveY];
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const ySpan = yMax - yMin || 1;
  const yLo = yMin - ySpan * 0.08;
  const yHi = yMax + ySpan * 0.08;

  const toX = (x: number) => PAD.left + ((x - xLo) / (xHi - xLo)) * plotW;
  const toY = (y: number) => PAD.top + ((yHi - y) / (yHi - yLo)) * plotH;

  // Background
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

  drawGrid(ctx, W, H, xLo, xHi, yLo, yHi, toX, toY);

  // Curve
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (let i = 0; i <= STEPS; i++) {
    const cx = toX(xLo + (i / STEPS) * (xHi - xLo));
    const cy = toY(curveY[i]);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  }
  ctx.stroke();

  // Data points
  for (let i = 0; i < xData.length; i++) {
    const cx = toX(xData[i]);
    const cy = toY(yData[i]);
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#f97316";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone     = document.getElementById("drop-zone")    as HTMLDivElement;
const fileInput    = document.getElementById("file-input")   as HTMLInputElement;
const fileNameEl   = document.getElementById("file-name")    as HTMLParagraphElement;
const degreeInput  = document.getElementById("degree")       as HTMLInputElement;
const degreeValue  = document.getElementById("degree-value") as HTMLSpanElement;
const equationEl   = document.getElementById("equation")     as HTMLParagraphElement;
const r2El         = document.getElementById("r2")           as HTMLParagraphElement;
const nPointsEl    = document.getElementById("n-points")     as HTMLParagraphElement;
const coeffCard    = document.getElementById("coeff-card")   as HTMLDivElement;
const coeffTable   = document.getElementById("coeff-table")  as HTMLTableElement;
const errorEl      = document.getElementById("error")        as HTMLParagraphElement;
const statusBadge  = document.getElementById("status-badge") as HTMLDivElement;
const legendEl     = document.getElementById("legend")       as HTMLDivElement;

let currentCSV: string | null = null;
let lastX: number[] = [];
let lastY: number[] = [];
let lastCoeffs: number[] = [];

// ── Init ──────────────────────────────────────────────────────────────────────
requestAnimationFrame(drawEmptyChart);

// Redraw on resize
let resizeTimer: ReturnType<typeof setTimeout>;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (lastCoeffs.length) drawChart(lastX, lastY, lastCoeffs);
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

// ── Drag & drop ───────────────────────────────────────────────────────────────
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
    const { x, y } = parseCSV(csv);
    const degree = parseInt(degreeInput.value, 10);
    const result = fitPolynomial(x, y, degree);

    lastX = x;
    lastY = y;
    lastCoeffs = result.coefficients;

    equationEl.textContent = result.equation;

    const r2 = result.r2;
    r2El.textContent = r2.toFixed(6);
    r2El.className = "stat-value " + (r2 >= 0.99 ? "r2-good" : r2 >= 0.90 ? "r2-ok" : "r2-poor");

    nPointsEl.textContent = String(x.length);
    nPointsEl.className = "stat-value";

    setStatus(`Degree ${degree} · R² ${r2.toFixed(4)}`, "status-ready");

    const tbody = coeffTable.querySelector("tbody")!;
    tbody.innerHTML = "";
    result.coefficients.forEach((c, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>a<sub>${i}</sub></td><td>x<sup>${i}</sup></td><td>${c.toPrecision(8)}</td>`;
      tbody.appendChild(tr);
    });

    coeffCard.classList.remove("hidden");
    legendEl.classList.remove("hidden");
    drawChart(x, y, result.coefficients);
  } catch (err) {
    showError((err as Error).message);
    coeffCard.classList.add("hidden");
    legendEl.classList.add("hidden");
    lastCoeffs = [];
    setStatus("Error", "status-error");
    drawEmptyChart();
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
