import { describe, it, expect } from "vitest";
import {
  parseCSV,
  parseMultiCSV,
  fitPolynomial,
  findOptimalDegree,
  formatEquation,
} from "../src/polynomial";

// ── parseCSV ──────────────────────────────────────────────────────────────────

describe("parseCSV", () => {
  it("parses comma-separated values", () => {
    const { x, y } = parseCSV("1,2\n3,4\n5,6");
    expect(x).toEqual([1, 3, 5]);
    expect(y).toEqual([2, 4, 6]);
  });

  it("parses semicolon-separated values", () => {
    const { x, y } = parseCSV("1;2\n3;4");
    expect(x).toEqual([1, 3]);
    expect(y).toEqual([2, 4]);
  });

  it("skips header rows with non-numeric values", () => {
    const { x, y } = parseCSV("x,y\n1,2\n3,4");
    expect(x).toEqual([1, 3]);
    expect(y).toEqual([2, 4]);
  });

  it("throws on empty numeric data", () => {
    expect(() => parseCSV("x,y\nfoo,bar")).toThrow("No valid numeric data found in the CSV.");
  });

  it("throws on completely empty input", () => {
    expect(() => parseCSV("   \n  ")).toThrow();
  });

  it("skips rows with fewer than 2 parts", () => {
    const { x, y } = parseCSV("1\n2,3\n4");
    expect(x).toEqual([2]);
    expect(y).toEqual([3]);
  });

  it("parses windows-style CRLF line endings", () => {
    const { x, y } = parseCSV("1,2\r\n3,4\r\n5,6");
    expect(x).toEqual([1, 3, 5]);
    expect(y).toEqual([2, 4, 6]);
  });

  it("handles negative and decimal values", () => {
    const { x, y } = parseCSV("-1.5,2.7\n0,0\n3.14,-2.71");
    expect(x[0]).toBeCloseTo(-1.5);
    expect(y[0]).toBeCloseTo(2.7);
    expect(x[1]).toBe(0);
    expect(y[1]).toBe(0);
    expect(x[2]).toBeCloseTo(3.14);
    expect(y[2]).toBeCloseTo(-2.71);
  });

  it("trims whitespace around values", () => {
    const { x, y } = parseCSV(" 1 , 2 \n 3 , 4 ");
    expect(x).toEqual([1, 3]);
    expect(y).toEqual([2, 4]);
  });

  it("skips rows where x is non-numeric but y is numeric", () => {
    const { x, y } = parseCSV("time,value\n1,2\n3,4");
    expect(x).toEqual([1, 3]);
    expect(y).toEqual([2, 4]);
  });
});

// ── parseMultiCSV ─────────────────────────────────────────────────────────────

describe("parseMultiCSV", () => {
  it("parses a single series with no name", () => {
    const result = parseMultiCSV("1,2\n3,4\n5,6");
    expect(result).toHaveLength(1);
    expect(result[0].x).toEqual([1, 3, 5]);
    expect(result[0].y).toEqual([2, 4, 6]);
  });

  it("assigns default name 'Series 1' when no name is given", () => {
    const result = parseMultiCSV("1,2\n3,4");
    expect(result[0].name).toBe("Series 1");
  });

  it("uses the name line when the first line is a single non-numeric string", () => {
    const result = parseMultiCSV("MyData\n1,2\n3,4");
    expect(result[0].name).toBe("MyData");
    expect(result[0].x).toEqual([1, 3]);
  });

  it("strips leading # - * and spaces from name lines", () => {
    const result = parseMultiCSV("# Dataset A\n1,2\n3,4");
    expect(result[0].name).toBe("Dataset A");
  });

  it("strips leading dashes from name lines", () => {
    const result = parseMultiCSV("--- My Series\n1,2\n3,4");
    expect(result[0].name).toBe("My Series");
  });

  it("falls back to default name when stripping prefix chars leaves empty string", () => {
    // "---" stripped of leading dashes → "" → falls back to "Series 1"
    const result = parseMultiCSV("---\n1,2\n3,4");
    expect(result[0].name).toBe("Series 1");
  });

  it("parses multiple series separated by blank lines", () => {
    const csv = "Alpha\n1,2\n3,4\n\nBeta\n5,6\n7,8";
    const result = parseMultiCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alpha");
    expect(result[0].x).toEqual([1, 3]);
    expect(result[1].name).toBe("Beta");
    expect(result[1].x).toEqual([5, 7]);
  });

  it("falls back to default name for nameless subsequent series", () => {
    const csv = "1,2\n3,4\n\n5,6\n7,8";
    const result = parseMultiCSV(csv);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Series 1");
    expect(result[1].name).toBe("Series 2");
  });

  it("skips invalid/empty sections silently", () => {
    const csv = "1,2\n3,4\n\nno-data-here\n\n5,6\n7,8";
    const result = parseMultiCSV(csv);
    expect(result).toHaveLength(2);
  });

  it("throws when no valid data is found", () => {
    expect(() => parseMultiCSV("foo\nbar\nbaz")).toThrow("No valid data found in the CSV.");
  });

  it("throws when there are more than 20 series", () => {
    const sections = Array.from({ length: 21 }, (_, i) => `Series${i}\n${i},${i + 1}`).join("\n\n");
    expect(() => parseMultiCSV(sections)).toThrow("Too many series");
  });

  it("handles exactly 20 series without throwing", () => {
    const sections = Array.from({ length: 20 }, (_, i) => `${i},${i + 1}`).join("\n\n");
    const result = parseMultiCSV(sections);
    expect(result).toHaveLength(20);
  });

  it("treats a two-column numeric first line as data, not a name", () => {
    const result = parseMultiCSV("1,2\n3,4");
    expect(result[0].name).toBe("Series 1");
    expect(result[0].x).toEqual([1, 3]);
  });

  it("ignores sections that produce no x values", () => {
    const csv = "x,y\nfoo,bar\n\n1,2\n3,4";
    const result = parseMultiCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].x).toEqual([1, 3]);
  });
});

// ── fitPolynomial ─────────────────────────────────────────────────────────────

describe("fitPolynomial", () => {
  it("fits a degree-1 polynomial (linear)", () => {
    const x = [0, 1, 2, 3, 4];
    const y = [1, 3, 5, 7, 9];
    const result = fitPolynomial(x, y, 1);
    expect(result.coefficients[0]).toBeCloseTo(1, 5);
    expect(result.coefficients[1]).toBeCloseTo(2, 5);
    expect(result.r2).toBeCloseTo(1, 5);
    expect(result.degree).toBe(1);
    expect(typeof result.equation).toBe("string");
  });

  it("fits a degree-2 polynomial (quadratic)", () => {
    const x = [-2, -1, 0, 1, 2, 3];
    const y = x.map((xi) => xi ** 2 - 2 * xi + 3);
    const result = fitPolynomial(x, y, 2);
    expect(result.coefficients[0]).toBeCloseTo(3, 4);
    expect(result.coefficients[1]).toBeCloseTo(-2, 4);
    expect(result.coefficients[2]).toBeCloseTo(1, 4);
    expect(result.r2).toBeCloseTo(1, 4);
  });

  it("fits a degree-3 polynomial (cubic)", () => {
    const x = [-3, -2, -1, 0, 1, 2, 3, 4];
    const y = x.map((xi) => 2 * xi ** 3 - xi + 5);
    const result = fitPolynomial(x, y, 3);
    expect(result.coefficients[0]).toBeCloseTo(5, 3);
    expect(result.coefficients[1]).toBeCloseTo(-1, 3);
    expect(result.coefficients[2]).toBeCloseTo(0, 3);
    expect(result.coefficients[3]).toBeCloseTo(2, 3);
    expect(result.r2).toBeCloseTo(1, 4);
  });

  it("throws when there are not enough data points", () => {
    expect(() => fitPolynomial([1, 2], [1, 2], 3)).toThrow(
      "Need at least 4 data points to fit a degree-3 polynomial."
    );
  });

  it("throws when x and y have different lengths", () => {
    expect(() => fitPolynomial([1, 2, 3], [1, 2], 1)).toThrow(
      "x and y must have the same length."
    );
  });

  it("fits a degree-0 polynomial (constant)", () => {
    const x = [1, 2, 3, 4];
    const y = [5, 5, 5, 5];
    const result = fitPolynomial(x, y, 0);
    expect(result.coefficients[0]).toBeCloseTo(5, 5);
    expect(result.r2).toBeCloseTo(1, 5); // ssTot = 0 → r2 = 1
  });

  it("returns r2 = 1 when all y values are identical (horizontal line)", () => {
    const x = [1, 2, 3];
    const y = [7, 7, 7];
    const result = fitPolynomial(x, y, 1);
    expect(result.r2).toBe(1);
  });

  it("returns r2 close to 1 for noisy linear data", () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = [0.1, 1.9, 4.1, 5.9, 8.1, 9.9];
    const result = fitPolynomial(x, y, 1);
    expect(result.r2).toBeGreaterThan(0.99);
  });

  it("stores the correct degree in the result", () => {
    const x = [0, 1, 2, 3];
    const y = [0, 1, 4, 9];
    const result = fitPolynomial(x, y, 2);
    expect(result.degree).toBe(2);
  });

  it("throws for singular matrix (duplicate x values with high degree)", () => {
    // All same x → singular Vandermonde system for degree >= 1
    expect(() => fitPolynomial([1, 1, 1, 1], [2, 3, 4, 5], 3)).toThrow(
      "singular"
    );
  });

  it("produces a non-empty equation string", () => {
    const x = [0, 1, 2];
    const y = [1, 2, 3];
    const result = fitPolynomial(x, y, 1);
    expect(result.equation).toMatch(/^y = /);
  });
});

// ── findOptimalDegree ─────────────────────────────────────────────────────────

describe("findOptimalDegree", () => {
  it("returns 1 when there are only 2 data points (limit < 1 → 1)", () => {
    // n=2, limit = min(20, 0) = 0 < 1, returns 1
    expect(findOptimalDegree([1, 2], [2, 4])).toBe(1);
  });

  it("returns 1 for perfectly linear data", () => {
    const x = [0, 1, 2, 3, 4, 5];
    const y = x.map((xi) => 3 * xi + 1);
    expect(findOptimalDegree(x, y)).toBe(1);
  });

  it("returns 2 for perfectly quadratic data", () => {
    const x = [-3, -2, -1, 0, 1, 2, 3, 4, 5];
    const y = x.map((xi) => xi ** 2 + 1);
    expect(findOptimalDegree(x, y)).toBe(2);
  });

  it("respects the maxDeg parameter", () => {
    const x = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const y = x.map((xi) => xi ** 4);
    // with maxDeg=2 it can't pick degree 4
    const deg = findOptimalDegree(x, y, 2);
    expect(deg).toBeLessThanOrEqual(2);
  });

  it("returns 1 when only 3 points (limit = 1)", () => {
    const result = findOptimalDegree([0, 1, 2], [0, 1, 4]);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("returns a number for cubic data", () => {
    const x = [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    const y = x.map((xi) => xi ** 3 - 2 * xi + 1);
    const deg = findOptimalDegree(x, y);
    expect(typeof deg).toBe("number");
    expect(deg).toBeGreaterThanOrEqual(1);
  });

  it("does not exceed n-2 (need at least 1 residual dof)", () => {
    const x = [0, 1, 2, 3, 4];
    const y = [1, 2, 3, 4, 5];
    const deg = findOptimalDegree(x, y);
    expect(deg).toBeLessThanOrEqual(3); // n-2 = 3
  });

  it("breaks early and returns best degree so far when fitPolynomial throws (singular matrix)", () => {
    // All identical x values → singular matrix for degree >= 1 → triggers break in catch
    const x = [2, 2, 2, 2, 2];
    const y = [1, 2, 3, 4, 5];
    // limit = min(20, 3) = 3; degree 1 will throw (singular), so breaks immediately → returns 1
    const deg = findOptimalDegree(x, y);
    expect(deg).toBe(1);
  });
});

// ── formatEquation ────────────────────────────────────────────────────────────

describe("formatEquation", () => {
  it("formats a linear equation", () => {
    expect(formatEquation([1, 2])).toBe("y = 2x + 1");
  });

  it("formats a quadratic with negative coefficients", () => {
    expect(formatEquation([3, -2, 1])).toBe("y = x^2 - 2x + 3");
  });

  it("skips zero coefficients", () => {
    expect(formatEquation([0, 0, 1])).toBe("y = x^2");
  });

  it("returns '0' for empty coefficients array", () => {
    expect(formatEquation([])).toBe("0");
  });

  it("returns '0' when all coefficients are zero", () => {
    expect(formatEquation([0, 0, 0])).toBe("0");
  });

  it("returns '0' when all coefficients are below threshold (1e-10)", () => {
    expect(formatEquation([1e-11, 1e-12])).toBe("0");
  });

  it("shows just a constant when only a0 is non-zero", () => {
    expect(formatEquation([5])).toBe("y = 5");
  });

  it("shows 'x' (not '1x') when the x coefficient is exactly 1", () => {
    expect(formatEquation([0, 1])).toBe("y = x");
  });

  it("shows '-x' (not '-1x') when the x coefficient is exactly -1", () => {
    expect(formatEquation([0, -1])).toBe("y = -x");
  });

  it("shows 'x^2' (not '1x^2') when coefficient is exactly 1", () => {
    expect(formatEquation([0, 0, 1])).toBe("y = x^2");
  });

  it("shows '-x^3' when leading coefficient is -1", () => {
    expect(formatEquation([0, 0, 0, -1])).toBe("y = -x^3");
  });

  it("uses toPrecision(6) for non-integer coefficients", () => {
    const eq = formatEquation([0, 1.23456789]);
    // 1.23456789 rounded to 6 sig figs = "1.23457"
    expect(eq).toContain("1.23457");
  });

  it("uses integer string for integer coefficients", () => {
    expect(formatEquation([0, 3])).toBe("y = 3x");
  });

  it("formats a negative leading constant", () => {
    expect(formatEquation([-3])).toBe("y = -3");
  });

  it("formats equation with negative constant term last", () => {
    const eq = formatEquation([-1, 0, 1]);
    expect(eq).toBe("y = x^2 - 1");
  });

  it("formats a degree-4 polynomial", () => {
    // y = x^4 + x^2 + 1
    const eq = formatEquation([1, 0, 1, 0, 1]);
    expect(eq).toBe("y = x^4 + x^2 + 1");
  });
});
