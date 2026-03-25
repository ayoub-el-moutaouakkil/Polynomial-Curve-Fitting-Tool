import { describe, it, expect } from "vitest";
import { parseCSV, fitPolynomial, formatEquation } from "../src/polynomial";

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
    expect(() => parseCSV("x,y\nfoo,bar")).toThrow();
  });
});

describe("fitPolynomial", () => {
  it("fits a degree-1 polynomial (linear)", () => {
    // y = 2x + 1
    const x = [0, 1, 2, 3, 4];
    const y = [1, 3, 5, 7, 9];
    const result = fitPolynomial(x, y, 1);
    expect(result.coefficients[0]).toBeCloseTo(1, 5); // intercept
    expect(result.coefficients[1]).toBeCloseTo(2, 5); // slope
    expect(result.r2).toBeCloseTo(1, 5);
  });

  it("fits a degree-2 polynomial (quadratic)", () => {
    // y = x² - 2x + 3
    const x = [-2, -1, 0, 1, 2, 3];
    const y = x.map((xi) => xi ** 2 - 2 * xi + 3);
    const result = fitPolynomial(x, y, 2);
    expect(result.coefficients[0]).toBeCloseTo(3, 4);
    expect(result.coefficients[1]).toBeCloseTo(-2, 4);
    expect(result.coefficients[2]).toBeCloseTo(1, 4);
    expect(result.r2).toBeCloseTo(1, 4);
  });

  it("fits a degree-3 polynomial (cubic)", () => {
    // y = 2x³ - x + 5
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
    expect(() => fitPolynomial([1, 2], [1, 2], 3)).toThrow();
  });
});

describe("formatEquation", () => {
  it("formats a linear equation", () => {
    expect(formatEquation([1, 2])).toBe("y = 2x + 1");
  });

  it("formats a quadratic with negative coefficients", () => {
    const eq = formatEquation([3, -2, 1]);
    expect(eq).toBe("y = x^2 - 2x + 3");
  });

  it("skips zero coefficients", () => {
    const eq = formatEquation([0, 0, 1]);
    expect(eq).toBe("y = x^2");
  });
});
