# Polynomial Curve Fitting

> Least-squares polynomial regression from CSV data — live at **[polynomialcurvefitting.app](https://polynomialcurvefitting.app)**

---

## Features

- **Automatic optimal degree detection** — the app finds the best polynomial degree for each series using adjusted R²
- **Multi-series support** — load up to 20 curves from a single CSV file
- **Interactive curve toggle** — show/hide individual curves with one click
- **Live R² feedback** — colour-coded fit quality (green / orange / red)
- **Coefficient table** — exact polynomial coefficients with 8 significant figures
- **PDF export** — generate a report with each curve's chart, equation, R², and coefficients on a separate page
- **No backend** — fully client-side, your data never leaves your browser

---

## Live Demo

**[polynomialcurvefitting.app](https://polynomialcurvefitting.app)**

---

## User Guide

### 1. Prepare your CSV file

The app accepts `.csv` files with two columns: `x` and `y`.

```
x,y
0,1.2
1,3.5
2,6.8
3,11.1
4,16.4
```

- Comma `,` or semicolon `;` as delimiter
- Optional header row (automatically skipped)
- At least 2 data points required

### 2. Load your data

Drag & drop your `.csv` file onto the drop zone, or click **"Click to browse"**.

### 3. Read the results

Once loaded, the app displays:

| Column | Description |
|--------|-------------|
| **Name** | Series name (from CSV or auto-generated) |
| **Equation** | Fitted polynomial equation |
| **R²** | Goodness of fit (0 to 1) |
| **N pts** | Number of data points |
| **Opt. deg** | Optimal polynomial degree (adjusted R²) |

### 4. Toggle curves

Click any **curve button** above the chart to show or hide individual series.

### 5. Export as PDF

Click the **Export PDF** button in the top-right corner to generate a report. The browser's print dialog will open — choose **Save as PDF**.

Each curve gets its own section in the report, containing:

- The fitted curve chart (data points + polynomial curve)
- The polynomial equation
- R², polynomial degree, and number of data points
- Full coefficients table (8 significant figures)

### 6. Understanding R²

| Value | Colour | Meaning |
|-------|--------|---------|
| ≥ 0.99 | 🟢 Green | Excellent fit |
| ≥ 0.90 | 🟠 Orange | Good fit |
| < 0.90 | 🔴 Red | Poor fit — data may be noisy |

---

## CSV Format Examples

### Single series

```csv
x,y
0,0.5
1,2.1
2,4.9
3,9.2
4,15.8
5,24.1
```

### Multiple series (separated by a blank line)

```csv
Series A
x,y
0,1.0
1,3.8
2,8.1
3,14.2
4,22.0

Series B
x,y
0,5.0
1,4.2
2,3.8
3,3.9
4,4.5
5,5.6
```

### Real-world example — Silicon resistivity vs temperature

```csv
Si
T,rho
200,3.2
250,2.1
300,1.5
350,1.1
400,0.85
450,0.67
500,0.54
```

---

## Example Results

### Quadratic fit (degree 2)

```
y = 1.02x² + 0.98x + 0.51
R² = 0.9994
```

---

## Tech Stack

| Tool | Role |
|------|------|
| TypeScript | Core logic & polynomial math |
| Vite | Build tool |
| Vitest | Unit tests |
| Canvas API | Chart rendering |
| GitHub Actions | CI/CD |
| GitHub Pages | Hosting |
| Cloudflare | DNS & proxy |

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

---

## How It Works

The app uses **least-squares regression** via the normal equations:

```
(VᵀV) · a = Vᵀy
```

Where `V` is the Vandermonde matrix of the x values. The system is solved using **Gaussian elimination with partial pivoting**.

The optimal degree is selected by maximising the **adjusted R²**:

```
adjusted R² = 1 - (1 - R²) × (n - 1) / (n - p)
```

Where `n` is the number of data points and `p` is the number of coefficients.

---

© 2026 Ayoub El Moutaouakkil. All rights reserved.

Built by **Ayoub El Moutaouakkil** — [elmoutaouakkilayoub00@gmail.com](mailto:elmoutaouakkilayoub00@gmail.com)
