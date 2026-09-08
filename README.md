# Kerf — Material Take-Off

A cut-list, material-pricing and take-off tool that runs on an iPhone and on a
desktop PC, ported from the `Kerf_Cutting_Calulator_.xlsx` workbook
(sheet `BRATTON 1X1`).

It answers four questions, in the order they matter on a job:

1. **How much material do I buy?** — bars needed, cost, and where every inch
   goes (finished pieces, blade kerf, end trim, offcut drop).
2. **How do I cut each bar?** — a to-scale diagram and cut list per stock bar.
3. **What did I base that price on?** — every price keeps its receipt.
4. **How do I get it to someone?** — a detailed report for you, or a purchase
   list for whoever is buying.

## The screens

| Screen | What it is for |
| --- | --- |
| **Jobs** | Every job you have started — open one, start another, park the finished ones |
| **Take-off** | Enter the materials and the pieces to cut |
| **Costs** | What it comes to, and how that was worked out |
| **Export** | Build the purchase list or the take-off sheet |
| **Cut plan** | How to cut each bar, for the saw |
| **Materials** | Your prices, and the proof behind them |
| **Guide** | What every number on the screens means |

Each screen says what it is for in one line at the top. On a phone the first
four are the tab bar and the rest sit under **More**; on a desktop they are all
in the sidebar.

## Jobs, and keeping them

Every job is kept: name, client, reference, its own materials, cut list,
pricing and export settings. Jobs carry a status — enquiry, quoted, won,
ordered, done — can be searched by job, client or reference, duplicated as the
starting point for the next one, and archived rather than deleted.

**Phone and PC.** Turn on sync on one device, type the same code on the other,
and both share one library. Merging is per-record, newest edit wins, with
deletes recorded so a job deleted on one device does not come back from the
other; the job you are looking at never moves under you. `tests/library.test.ts`
covers the merge, including the case where a job is edited on one device after
being deleted on the other — the edit survives.

Sync needs a Vercel Blob store connected to the deployment. Without one the app
is device-local and says so; nothing else changes.

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

Blade loss and end trim are computed exactly but are not given rows of their
own on screen: on a real job they are a fraction of a percent, and listing them
separately buries the number that matters. They are rolled into **left over**
— the short end of each bar once nothing else will fit in it, which you have
paid for either way.

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

## The export screen

Export is a screen, not a dialog, and the preview on it **is** the finished
image — it is redrawn on every change, so ticking a box, typing a price or
editing the heading shows you the document immediately. Screenshot it or save
the PNG; either way you get what you are looking at.

The heading — job, client, reference, prepared by, and the note on the sheet —
is edited right there and stays with the job.

**Take-off report** — your full working. Every block switches on and off
independently: the headline, the key figures, the cost build-up, where the
prices came from, the calculations, the cutting diagrams, and an order summary
at the bottom. Everything off but the table gives a one-page price; everything
on gives the full working file.

**Purchase list** — what goes to whoever buys the material. It leads with the
**total footage to order**, then for each material shows every stock length
you might buy it in, side by side:

| Buy as | Qty | Total length | Waste | Each | Cost |
| --- | --- | --- | --- | --- | --- |
| 12 ft bars | 21 | 252 ft | 6% | $39.00 | $819.00 |
| 16 ft bars | 16 | 256 ft | 7% | $52.00 | $832.00 |
| **20 ft bars** ✓ | 13 | 260 ft | 9% | $65.00 | $845.00 |

Each length is a genuine re-pack of your cut list, not a scaled guess, so the
bar counts are real. The leanest option is marked **best value** — by least
material bought, or by cost once every option has a price.

Everything on it is switchable *before* it renders, with the sheet redrawing
live as you change it:

- which stock lengths your supplier might carry,
- an optional **cut to length** row for suppliers who cut to size,
- which option you are actually ordering, per material,
- a **price typed on the spot** (per foot, per metre or per bar) if you know it
  but have not saved it to your material library,
- whether to show costs, waste percentages and what each material gets cut
  into,
- a free note to the supplier.

Short lists are padded so a two-material order still reads as a finished sheet
rather than a thin strip at the top of a page.

## File formats

| Format | For |
| --- | --- |
| **PNG** | Either sheet — straight into the iOS share sheet or an email |
| **Purchase list CSV** | The chosen option per material, with the alternatives under it |
| **Cost CSV** | One row per line with the price evidence columns a buyer wants |
| **Cut list CSV** | One row per cut, for the saw |
| **JSON** | A versioned (`kerf.takeoff` v1) shape for another system to ingest, via `buildExport` |

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
lib/library.ts  The job library, and how two devices merge one
lib/sync.ts     Client half of sync; app/api/sync is the server half
lib/pack.ts     The cutting-stock engine (the port of the workbook)
lib/pricing.ts  Costing, roll-up, confidence and staleness
lib/store.ts    Persistence, with migration from the pre-pricing release
lib/explain.ts  Plain-English explanations of every calculation
lib/report.ts   Canvas renderer for the shareable PNG
lib/purchase.ts Buying options: re-packs the cut list at every stock length
lib/purchaseReport.ts  Canvas renderer for the purchase list
lib/exports.ts  CSV and versioned JSON
lib/attachments.ts  IndexedDB storage for proof-of-price files
tests/          Asserted against the workbook's own figures
```
