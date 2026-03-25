import { parseCSV, fitPolynomial } from "./polynomial";

// ── Chart ────────────────────────────────────────────────────────────────────
function evalPoly(coeffs: number[], x: number): number {
  return coeffs.reduce((sum, c, i) => sum + c * Math.pow(x, i), 0);
}

function fmtAxis(n: number): string {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1e4 || (Math.abs(n) < 0.01)) return n.toExponential(1);
  return parseFloat(n.toPrecision(3)).toString();
}

function drawChart(xData: number[], yData: number[], coeffs: number[]): void {
  const canvas = document.getElementById("chart") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);

  const PAD = { top: 20, right: 20, bottom: 38, left: 58 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // x range with 5% padding
  const xMin = Math.min(...xData);
  const xMax = Math.max(...xData);
  const xSpan = xMax - xMin || 1;
  const xLo = xMin - xSpan * 0.05;
  const xHi = xMax + xSpan * 0.05;

  // Sample the curve
  const STEPS = 300;
  const curveY: number[] = [];
  for (let i = 0; i <= STEPS; i++) {
    curveY.push(evalPoly(coeffs, xLo + (i / STEPS) * (xHi - xLo)));
  }

  // y range
  const allY = [...yData, ...curveY];
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const ySpan = yMax - yMin || 1;
  const yLo = yMin - ySpan * 0.08;
  const yHi = yMax + ySpan * 0.08;

  const toX = (x: number) => PAD.left + ((x - xLo) / (xHi - xLo)) * plotW;
  const toY = (y: number) => PAD.top + ((yHi - y) / (yHi - yLo)) * plotH;

  // Background
  ctx.fillStyle = "#f0f4fa";
  ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

  // Grid
  const GRID = 5;
  ctx.strokeStyle = "#d0d4db";
  ctx.lineWidth = 1;
  ctx.font = `11px 'Source Code Pro', monospace`;

  for (let i = 0; i <= GRID; i++) {
    const gx = xLo + (i / GRID) * (xHi - xLo);
    const gy = yLo + (i / GRID) * (yHi - yLo);
    const cx = toX(gx);
    const cy = toY(gy);

    ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
    ctx.fillStyle = "#5a6070"; ctx.textAlign = "center";
    ctx.fillText(fmtAxis(gx), cx, PAD.top + plotH + 14);

    ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke();
    ctx.fillStyle = "#5a6070"; ctx.textAlign = "right";
    ctx.fillText(fmtAxis(gy), PAD.left - 6, cy + 4);
  }

  // Zero axes (dashed)
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#9ba5b4";
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
  ctx.strokeStyle = "#b0b8c6";
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

  // Fitted curve
  ctx.strokeStyle = "#1a4f8a";
  ctx.lineWidth = 2;
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
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#e05c2a";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Legend
  const lx = PAD.left + 10;
  const ly = PAD.top + 10;
  ctx.font = `11px 'Source Code Pro', monospace`;

  ctx.strokeStyle = "#1a4f8a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(lx, ly + 5); ctx.lineTo(lx + 20, ly + 5); ctx.stroke();
  ctx.fillStyle = "#1a4f8a"; ctx.textAlign = "left";
  ctx.fillText("fitted curve", lx + 26, ly + 9);

  ctx.beginPath(); ctx.arc(lx + 10, ly + 22, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#e05c2a"; ctx.fill();
  ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#5a6070"; ctx.textAlign = "left";
  ctx.fillText("data points", lx + 26, ly + 26);
}

// ── DOM refs ────────────────────────────────────────────────────────────────
const dropZone = document.getElementById("drop-zone") as HTMLDivElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const degreeInput = document.getElementById("degree") as HTMLInputElement;
const degreeValue = document.getElementById("degree-value") as HTMLSpanElement;
const resultBox = document.getElementById("result") as HTMLDivElement;
const equationEl = document.getElementById("equation") as HTMLParagraphElement;
const r2El = document.getElementById("r2") as HTMLParagraphElement;
const coeffTable = document.getElementById("coeff-table") as HTMLTableElement;
const errorEl = document.getElementById("error") as HTMLParagraphElement;

let currentCSV: string | null = null;

// ── Degree slider ────────────────────────────────────────────────────────────
degreeInput.addEventListener("input", () => {
  degreeValue.textContent = degreeInput.value;
  if (currentCSV) runFit(currentCSV);
});

// ── File input ───────────────────────────────────────────────────────────────
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) readFile(file);
});

// ── Drag & drop ──────────────────────────────────────────────────────────────
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer?.files[0];
  if (file) readFile(file);
});

// ── Core logic ───────────────────────────────────────────────────────────────
function readFile(file: File): void {
  if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
    showError("Please upload a .csv file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentCSV = e.target?.result as string;
    dropZone.querySelector("p")!.textContent = `Loaded: ${file.name}`;
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

    equationEl.textContent = result.equation;
    r2El.textContent = `R² = ${result.r2.toFixed(6)}`;

    // Populate coefficient table
    const tbody = coeffTable.querySelector("tbody")!;
    tbody.innerHTML = "";
    result.coefficients.forEach((c, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>a<sub>${i}</sub></td><td>x<sup>${i}</sup></td><td>${c.toPrecision(8)}</td>`;
      tbody.appendChild(tr);
    });

    resultBox.classList.remove("hidden");
    drawChart(x, y, result.coefficients);
  } catch (err) {
    showError((err as Error).message);
    resultBox.classList.add("hidden");
  }
}

function showError(msg: string): void {
  errorEl.textContent = msg;
  errorEl.classList.remove("hidden");
}

function clearError(): void {
  errorEl.textContent = "";
  errorEl.classList.add("hidden");
}
