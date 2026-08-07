# Kerf — Material Cut List

An iPhone-installable cut list calculator, ported from the
`Kerf_Cutting_Calulator_.xlsx` workbook (sheet `BRATTON 1X1`).

It answers three questions, in the order they matter on a job:

1. **How much material do I buy?** — bars needed, cost, and exactly where the
   material goes (finished pieces, blade kerf, end trim, offcut drop).
2. **How do I cut each bar?** — a to-scale diagram and cut list for every stock
   bar, with identical bars grouped together.
3. **How do I show my boss?** — a one-tap PNG snapshot straight into the iOS
   share sheet.

## Install it on an iPhone

Open the deployed URL in Safari → **Share** → **Add to Home Screen**. It then
launches full-screen with no browser chrome, and a service worker keeps it
working with no signal in a shop or yard. Jobs are saved on the device.

This is a Progressive Web App, not an App Store binary — that is what "an
iPhone app hosted on Vercel" can be. Nothing is installed from the store and
nothing is uploaded: the whole calculator runs on the phone.

## The maths

Ported from the workbook's cutting engine (columns `P:U`) and Step 3 block
(`B39:B48`).

- Pieces are sorted longest-first, then packed into bars.
- **Every piece is charged one blade width**, including the last on a bar —
  this matches the workbook's `B43 = pieces x kerf`.
- Usable length per bar is `stock length − end trim`.
- A piece is impossible when `length + kerf > usable length`.

Two packing strategies:

| Strategy | Behaviour | On the sample job |
| --- | --- | --- |
| **Optimised** (default) | First-fit-decreasing — back-fills earlier bars | **13 bars, 91.2% used** |
| **Match spreadsheet** | Next-fit-decreasing — cuts strictly in order, one bar at a time | 14 bars, 84.6% used |

Both use the identical cost model, so "Match spreadsheet" reproduces the
workbook's figures cell-for-cell and Optimised is a strict improvement.
`tests/pack.test.ts` asserts the workbook's Step 3 values directly.

The workbook's limits (20 part rows, 200 pieces, 30 bars) do not apply here.

## Length entry

Imperial fields accept the way lengths actually get written down:

```
45.5      45 1/2      45-1/2      1/2
3'        3' 6"       3ft 6in     20'      240"
```

Values are displayed rounded to the nearest 1/16". Millimetres are supported
via the units toggle (`1200`, `120cm`, `1.2m`); everything is stored internally
in inches so switching units never reinterprets an existing cut list.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine + unit-parsing tests
npm run typecheck
npm run build
```

`e2e.mjs` drives the built app in an iPhone-sized Chromium, exercises all three
functions and writes the exported PNG to `$OUT_DIR`:

```bash
npm run build && npm start -- -p 3210 &
OUT_DIR=/tmp/kerf-e2e node e2e.mjs
```

## Deploy

Pushed to GitHub and deployed on Vercel. Vercel auto-detects Next.js; no
environment variables and no backend are required. Every push to the default
branch ships to production, and every other branch gets a preview URL.

## Layout

```
app/         Next.js App Router shell, metadata, PWA wiring
components/  The three screens, the share sheet, shared inputs
lib/pack.ts  The cutting-stock engine (the port of the workbook)
lib/units.ts Length parsing and imperial formatting
lib/report.ts Canvas renderer for the shareable PNG
tests/       Engine tests, asserted against the workbook's own figures
```
