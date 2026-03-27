/**
 * Polynomial regression using the method of least squares.
 * Solves the normal equations: (Vᵀ·V)·a = Vᵀ·y
 * where V is the Vandermonde matrix of the x values.
 */

export interface RegressionResult {
  coefficients: number[]; // [a0, a1, a2, ...] for a0 + a1*x + a2*x² + ...
  degree: number;
  r2: number; // coefficient of determination
  equation: string;
}

export interface ParsedSeries {
  name: string;
  x: number[];
  y: number[];
}

/**
 * Parse a multi-series CSV where sections are separated by blank lines.
 * Each section may start with an optional name line (single non-numeric value).
 * Falls back gracefully to a single series for regular CSVs.
 */
export function parseMultiCSV(csv: string): ParsedSeries[] {
  const sections = csv.split(/\n[ \t]*\n/).map((s) => s.trim()).filter(Boolean);
  const results: ParsedSeries[] = [];

  for (const section of sections) {
    const lines = section.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) continue;

    // First line is a name if it has no delimiter and is not numeric
    let name = `Series ${results.length + 1}`;
    const first = lines[0].trim();
    const firstParts = first.split(/[,;]/);
    const firstIsNumeric =
      firstParts.length >= 2 &&
      !isNaN(parseFloat(firstParts[0])) &&
      !isNaN(parseFloat(firstParts[1]));
    const firstIsSingleNonNumeric =
      firstParts.length === 1 && isNaN(parseFloat(first));

    if (firstIsSingleNonNumeric && !firstIsNumeric) {
      name = first.replace(/^[#\-*\s]+/, "").trim() || name;
    }

    try {
      const { x, y } = parseCSV(section); // parseCSV already skips non-numeric rows
      if (x.length > 0) results.push({ name, x, y });
    } catch {
      // skip invalid sections
    }
  }

  if (!results.length) throw new Error("No valid data found in the CSV.");
  return results;
}

/**
 * Parse a CSV string into arrays of x and y numbers.
 * Supports comma and semicolon delimiters; skips header rows.
 */
export function parseCSV(csv: string): { x: number[]; y: number[] } {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  const x: number[] = [];
  const y: number[] = [];

  for (const line of lines) {
    const parts = line.split(/[,;]/).map((p) => p.trim());
    if (parts.length < 2) continue;

    const xVal = parseFloat(parts[0]);
    const yVal = parseFloat(parts[1]);

    if (isNaN(xVal) || isNaN(yVal)) continue; // skip header / non-numeric
    x.push(xVal);
    y.push(yVal);
  }

  if (x.length === 0) {
    throw new Error("No valid numeric data found in the CSV.");
  }

  return { x, y };
}

/**
 * Fit a polynomial of the given degree to (x, y) data.
 */
export function fitPolynomial(
  x: number[],
  y: number[],
  degree: number
): RegressionResult {
  if (x.length !== y.length) throw new Error("x and y must have the same length.");
  if (x.length < degree + 1) {
    throw new Error(
      `Need at least ${degree + 1} data points to fit a degree-${degree} polynomial.`
    );
  }

  const n = x.length;
  const d = degree + 1; // number of coefficients

  // Build Vandermonde matrix V (n × d)
  const V: number[][] = x.map((xi) =>
    Array.from({ length: d }, (_, j) => Math.pow(xi, j))
  );

  // Compute VᵀV (d × d) and Vᵀy (d × 1)
  const VtV: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  const Vty: number[] = new Array<number>(d).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      Vty[j] += V[i][j] * y[i];
      for (let k = 0; k < d; k++) {
        VtV[j][k] += V[i][j] * V[i][k];
      }
    }
  }

  // Solve VᵀV · a = Vᵀy using Gaussian elimination with partial pivoting
  const coefficients = gaussianElimination(VtV, Vty);

  // Compute R²
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yPred = coefficients.reduce((s, c, j) => s + c * Math.pow(x[i], j), 0);
    ssTot += (y[i] - yMean) ** 2;
    ssRes += (y[i] - yPred) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return {
    coefficients,
    degree,
    r2,
    equation: formatEquation(coefficients),
  };
}

/**
 * Gaussian elimination with partial pivoting.
 * Solves A·x = b and returns x.
 */
function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix [A | b]
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];

    if (Math.abs(M[col][col]) < 1e-12) {
      throw new Error(
        "Matrix is singular — try a lower polynomial degree or add more data points."
      );
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  // Back-substitution
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= M[i][j] * x[j];
    }
    x[i] /= M[i][i];
  }
  return x;
}

/**
 * Find the optimal polynomial degree for the given data using adjusted R².
 * Tries degrees from 1 to min(maxDeg, n-2) and returns the degree that
 * maximises adjusted R² (penalises unnecessary complexity).
 */
export function findOptimalDegree(x: number[], y: number[], maxDeg: number = 20): number {
  const n = x.length;
  const limit = Math.min(maxDeg, n - 2); // need at least 1 residual degree of freedom
  if (limit < 1) return 1;

  let bestDeg = 1;
  let bestAdjR2 = -Infinity;

  for (let d = 1; d <= limit; d++) {
    try {
      const res = fitPolynomial(x, y, d);
      const p = d + 1; // number of fitted coefficients
      // Adjusted R² = 1 - (SSres / (n-p)) / (SStot / (n-1))
      const adjR2 = 1 - (1 - res.r2) * (n - 1) / (n - p);
      if (adjR2 > bestAdjR2) {
        bestAdjR2 = adjR2;
        bestDeg = d;
      }
    } catch {
      break;
    }
  }
  return bestDeg;
}

/**
 * Format coefficients into a human-readable polynomial string.
 * e.g.  3.00x² - 1.50x + 0.50
 */
export function formatEquation(coefficients: number[]): string {
  const terms: string[] = [];

  for (let i = coefficients.length - 1; i >= 0; i--) {
    const c = coefficients[i];
    if (Math.abs(c) < 1e-10) continue;

    const absC = Math.abs(c);
    const sign = c < 0 ? "-" : "+";
    const coefStr = Number.isInteger(absC) ? absC.toString() : absC.toPrecision(6);

    let term: string;
    if (i === 0) {
      term = coefStr;
    } else if (i === 1) {
      term = absC === 1 ? "x" : `${coefStr}x`;
    } else {
      term = absC === 1 ? `x^${i}` : `${coefStr}x^${i}`;
    }

    if (terms.length === 0) {
      terms.push(c < 0 ? `-${term}` : term);
    } else {
      terms.push(`${sign} ${term}`);
    }
  }

  return terms.length === 0 ? "0" : `y = ${terms.join(" ")}`;
}
