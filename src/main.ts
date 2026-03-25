import { parseCSV, fitPolynomial } from "./polynomial";

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
