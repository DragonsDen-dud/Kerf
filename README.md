# Kerf — Material Take-Off

A cut-list, material-pricing and take-off tool that runs on an iPhone and on a
desktop PC, ported from the `Kerf_Cutting_Calulator_.xlsx` workbook
(sheet `BRATTON 1X1`).

It answers four questions, in the order they matter on a job:

1. **How much material do I buy?** — bars needed, cost, and where every inch
   goes (finished pieces, blade kerf, end trim, offcut drop).
2. **How do I cut each bar?** — a to-scale diagram and cut list per stock bar.
3. **What did I base that price on?** — every price keeps its receipt.
4. **How do I get it to someone?** — one tap to a PNG, CSV or JSON.

## The five screens

| Screen | What it is |
| --- | --- |
| **Job** | Job details, stock & saw settings, and the pieces to cut |
| **Estimate** | What to buy, what it costs, and the sums behind both |
| **Cut plan** | How to cut each bar, in order |
| **Materials** | Prices, and the proof behind each one |
| **Guide** | How every calculation works, in plain English |

Two levels of detail, switched on the Job screen:

- **Quick estimate** — one material, no mark-up machinery, fewest fields.
- **Detailed take-off** — many materials in one job, extras (labour, finishing,
  delivery), contingency, markup and tax.

Switching between them never loses data — quick estimate just costs the first
material and hides the rest.

## Showing the working

Every figure can be opened up to show how it was reached: the sum with the real
numbers substituted in, the answer, and one line on why it matters. The Guide
screen walks the whole method step by step using the numbers currently in the
job, and the exported report carries a "How these numbers were worked out"
section so the person receiving it can check the figures without the app.

All of that text comes from one module (`lib/explain.ts`), so the screens, the
report and the help can never drift from each other or from the engine.

## Pricing, and the proof behind it

The Materials screen stores each material once — name, category, default stock length,
kerf and end trim — and a full **price history**. Every price record carries:

- the amount and its basis (per bar / per foot / per metre / per inch),
- **where it came from**: written quote, past invoice, supplier website, phone
  call, trade counter, price list, or your own estimate,
- supplier, reference number (quote/invoice/SKU), the date it was quoted, a
  link, a free note,
- and optionally **a photo or PDF of the quote itself**.

That drives three things automatically:

- **Confidence.** A take-off can only claim the confidence of its weakest priced
  line — firm, indicative or assumed — and the report prints the matching
  caveat so an estimate is never mistaken for a firm quotation.
- **Staleness.** A price older than 90 days is flagged before the job goes out.
- **Citation.** The report prints a "Where the pricing came from" section, so
  the person receiving it can check the number without asking you.

Prices quoted per bar are re-scaled if the job is cut from a different stock
length, and per-length prices are charged across the **whole purchased bar**,
drop included — which is where per-foot mental maths usually goes wrong.

Attachments live in IndexedDB on the device; everything else is in
localStorage. Nothing is uploaded.

## The maths

Ported from the workbook's cutting engine (columns `P:U`) and Step 3 block
(`B39:B48`).

- Pieces are sorted longest-first, then packed into bars.
- **Every piece is charged one blade width**, including the last on a bar —
  this matches the workbook's `B43 = pieces × kerf`.
- Usable length per bar is `stock length − end trim`.
- A piece is impossible when `length + kerf > usable length`.

Two packing strategies, per line:

| Strategy | Behaviour | On the sample job |
| --- | --- | --- |
| **Optimised** (default) | First-fit-decreasing — back-fills earlier bars | **13 bars, 91.2% used** |
| **Match spreadsheet** | Next-fit-decreasing — one bar at a time | 14 bars, 84.6% used |

Both use an identical cost model, so "Match spreadsheet" reproduces the
workbook's figures cell-for-cell and Optimised is a strict improvement.
`tests/pack.test.ts` asserts the workbook's Step 3 values directly.

The workbook's limits (20 part rows, 200 pieces, 30 bars, one material) are all
gone.

## Length entry

Imperial fields accept the way lengths actually get written down:

```
45.5      45 1/2      45-1/2      1/2
3'        3' 6"       3ft 6in     20'      240"
```

Values display to the nearest 1/16". Millimetres are supported via the units
toggle (`1200`, `120cm`, `1.2m`); everything is stored internally in inches so
switching units never reinterprets an existing take-off.

## Exports

| Format | For |
| --- | --- |
| **PNG** | The snapshot — straight into the iOS share sheet or an email |
| **Cost CSV** | One row per line with the price evidence columns a buyer wants |
| **Cut list CSV** | One row per cut, for the saw |
| **JSON** | A versioned (`kerf.takeoff` v1) shape for another system to ingest |

The JSON is the intended seam for a project-tracking integration: it is flat,
versioned, and every priced row carries its source, so the receiving system
inherits the evidence rather than a bare number.

## Install it on an iPhone

Open the deployed URL in Safari → **Share** → **Add to Home Screen**. It then
launches full-screen with no browser chrome, and a service worker keeps it
working with no signal in a shop or yard.

This is a Progressive Web App, not an App Store binary — that is what "an
iPhone app hosted on Vercel" can be. On desktop it is the same URL, with a
sidebar instead of a tab bar and table layouts instead of stacked cards.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine, pricing, export and unit-parsing tests
npm run typecheck
npm run build
```

`e2e.mjs` drives the built app at both phone and desktop sizes, exercises the
pricing and export paths, and writes screenshots plus the exported PNG:

```bash
npm i -D playwright --no-save
npm run build && npm start -- -p 3210 &
OUT_DIR=/tmp/kerf-e2e node e2e.mjs
```

## Deploy

Pushed to GitHub and deployed on Vercel. Vercel auto-detects Next.js; no
environment variables and no backend are required.

## Layout

```
app/            Next.js App Router shell, metadata, PWA wiring
components/     The five screens, the export sheet, shared inputs
lib/types.ts    Domain model: Project, TakeoffLine, Material, PriceRecord
lib/pack.ts     The cutting-stock engine (the port of the workbook)
lib/pricing.ts  Costing, roll-up, confidence and staleness
lib/store.ts    Persistence, with migration from the pre-pricing release
lib/explain.ts  Plain-English explanations of every calculation
lib/report.ts   Canvas renderer for the shareable PNG
lib/exports.ts  CSV and versioned JSON
lib/attachments.ts  IndexedDB storage for proof-of-price files
tests/          Asserted against the workbook's own figures
```
