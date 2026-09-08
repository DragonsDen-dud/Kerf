/**
 * Smoke test: drives the real app at phone and desktop sizes, exercises the
 * job library, take-off, pricing and export paths, and saves screenshots plus
 * the exported PNGs for inspection.
 *
 * Needs playwright: `npm i -D playwright --no-save`.
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";

const OUT = process.env.OUT_DIR || "/tmp/kerf-e2e";
const BASE = process.env.BASE_URL || "http://localhost:3210";
const CHROME =
  process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const problems = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

async function newPage(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => problems.push(`pageerror: ${error}`));
  page.on("console", (m) => {
    // The sync probe answers 501 when no blob store is connected. That is a
    // supported state, not a fault.
    const text = m.text();
    if (m.type() === "error" && !text.includes("501")) problems.push(`console: ${text}`);
  });
  return page;
}

/* ------------------------------------------------------------------- phone */

{
  const context = await browser.newContext({
    ...devices["iPhone 14 Pro"],
    isMobile: true,
    hasTouch: true,
  });
  const page = await newPage(context);
  await page.goto(BASE, { waitUntil: "networkidle" });

  // The app opens on the job library.
  await page.waitForSelector("text=Your jobs");
  const jobs = await page.locator("main").innerText();
  check(jobs.includes("BRATTON 1X1"), "expected the sample job in the list");
  check(jobs.includes("$630.50"), "expected the priced total on the job card");
  check(/phone and pc/i.test(jobs), "expected the sync panel");
  await page.screenshot({ path: `${OUT}/phone-1-jobs.png` });

  // The tab bar must be reachable without scrolling to the end of the page.
  const phoneTabs = page.locator("nav.lg\\:hidden");
  const tab = phoneTabs.locator("button", { hasText: "Costs" });
  const box = await tab.boundingBox();
  check(box !== null && box.y < 900, `tab bar off-screen at y=${box?.y}`);

  await tab.click();
  await page.waitForSelector("main >> text=Bars to buy");
  const costs = await page.locator("main").innerText();
  check(costs.includes("Left over"), "the material breakdown should say 'Left over'");
  check(!costs.includes("Lost to the blade"), "the blade row should be gone");
  check(!costs.includes("Lost to end trim"), "the end-trim row should be gone");
  await page.screenshot({ path: `${OUT}/phone-2-costs.png` });

  // "More" holds the screens that are not part of daily use.
  await phoneTabs.locator("button", { hasText: "More" }).click();
  await page.waitForSelector("text=The rest of the app");
  await page.locator("main button", { hasText: "Materials" }).click();
  await page.waitForSelector("text=Materials and prices");
  const hoard = await page.locator("main").innerText();
  check(hoard.includes("Written quote"), "expected the price citation in Materials");
  check(hoard.includes("Q-10432"), "expected the quote reference in Materials");
  await page.screenshot({ path: `${OUT}/phone-3-materials.png` });

  // Export renders the purchase list first — the sheet that matters most.
  await phoneTabs.locator("button", { hasText: "Export" }).click();
  await page.waitForSelector("img[alt='Purchase list']", { timeout: 20000 });
  await page.waitForTimeout(500);
  const src = await page.getAttribute("img[alt='Purchase list']", "src");
  check(src?.startsWith("data:image/png;base64,"), "purchase list PNG was not produced");
  fs.writeFileSync(`${OUT}/purchase-list.png`, Buffer.from(src.split(",")[1], "base64"));
  await page.screenshot({ path: `${OUT}/phone-4-export.png` });

  await context.close();
}

/* ----------------------------------------------------------------- desktop */

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await newPage(context);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Your jobs");

  // The sidebar replaces the tab bar above the lg breakpoint.
  check(await page.locator("aside nav").isVisible(), "desktop sidebar should be visible");
  check(!(await page.locator("nav.lg\\:hidden").isVisible()), "phone tabs should be hidden");
  await page.screenshot({ path: `${OUT}/desktop-1-jobs.png` });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(overflow <= 0, `desktop page overflows horizontally by ${overflow}px`);

  /* --- the job library ---------------------------------------------------- */

  await page.locator("main button", { hasText: "+ New job" }).click();
  await page.waitForSelector("#job-name");
  await page.fill("#job-name", "SECOND JOB");
  await page.waitForTimeout(400);

  await page.locator("aside nav button", { hasText: "Jobs" }).click();
  await page.waitForSelector("text=Your jobs");
  let list = await page.locator("main").innerText();
  check(list.includes("SECOND JOB"), "a new job should appear in the library");
  check(list.includes("BRATTON 1X1"), "the first job should still be there");

  // Search narrows the list.
  await page.fill("input[aria-label='Search jobs']", "bratton");
  await page.waitForTimeout(300);
  list = await page.locator("main").innerText();
  check(!list.includes("SECOND JOB"), "search should filter out non-matching jobs");
  await page.fill("input[aria-label='Search jobs']", "");
  await page.waitForTimeout(300);

  // Archiving parks a job without losing it.
  await page.locator("li", { hasText: "SECOND JOB" }).locator("button", { hasText: "Archive" }).click();
  await page.waitForTimeout(300);
  list = await page.locator("main").innerText();
  check(!list.includes("SECOND JOB"), "archived jobs should drop out of the list");
  check(/Show 1 archived job/.test(list), "expected the archived-jobs toggle");
  await page.screenshot({ path: `${OUT}/desktop-2-library.png` });

  /* --- take-off ----------------------------------------------------------- */

  await page.locator("li", { hasText: "BRATTON 1X1" }).locator("button", { hasText: "Open" }).click();
  await page.waitForSelector("#job-name");

  await page.locator("button", { hasText: "Quick estimate" }).first().click();
  await page.waitForTimeout(300);
  await page.locator("button", { hasText: "Detailed take-off" }).first().click();
  await page.waitForTimeout(300);

  await page.fill("#pct-markup", "10");
  await page.waitForTimeout(400);
  const header = await page.locator("header").innerText();
  check(header.includes("$693.55"), `expected $693.55 with 10% markup, got: ${header}`);

  // A second line proves the multi-material take-off, and gives the
  // collapse-all control something to act on.
  await page.locator("button", { hasText: "+ Add material" }).first().click();
  await page.waitForTimeout(400);
  check(
    (await page.locator("select[id^='mat-']").count()) === 2,
    "expected two material blocks",
  );

  // Material blocks collapse to a summary.
  await page.locator("button", { hasText: "Collapse all" }).click();
  await page.waitForTimeout(400);
  const summary = await page.locator("main").innerText();
  for (const label of ["NEEDED", "TO BUY", "STOCK LENGTH", "PIECES TO CUT"]) {
    check(summary.includes(label), `collapsed summary should show ${label}`);
  }
  check(
    (await page.locator("select[id^='mat-']").count()) === 0,
    "collapsing should hide the material editors",
  );
  await page.screenshot({ path: `${OUT}/desktop-3-takeoff.png` });
  await page.locator("button", { hasText: "Expand all" }).click();
  await page.waitForTimeout(300);
  check(
    (await page.locator("select[id^='mat-']").count()) === 2,
    "expand all should bring the editors back",
  );

  /* --- export ------------------------------------------------------------- */

  await page.locator("aside nav button", { hasText: "Export" }).click();
  await page.waitForSelector("img[alt='Purchase list']", { timeout: 20000 });
  await page.waitForTimeout(600);

  // Both sheets are offered up front, not hidden behind a step.
  const sheets = await page.locator("main").innerText();
  check(sheets.includes("Purchase list"), "expected the purchase list option");
  check(sheets.includes("Take-off report"), "expected the take-off report option");

  const before = await page.getAttribute("img[alt='Purchase list']", "src");
  check(before?.startsWith("data:image/png;base64,"), "purchase list PNG was not produced");

  // Editing the heading reaches the sheet.
  await page.fill("#export-client", "Guido");
  await page.waitForTimeout(900);
  const withClient = await page.getAttribute("img[alt='Purchase list']", "src");
  check(withClient !== before, "typing a client should redraw the sheet");

  // Ticking a length option redraws it too.
  await page.locator("label", { hasText: "Also offer" }).click();
  await page.waitForTimeout(900);
  const toggled = await page.getAttribute("img[alt='Purchase list']", "src");
  check(toggled !== withClient, "the sheet should redraw when an option is toggled");

  // Your own wording replaces the banner, and the banner can go entirely.
  await page.fill("#purchase-headline", "Please quote and confirm lead time");
  await page.waitForTimeout(900);
  const written = await page.getAttribute("img[alt='Purchase list']", "src");
  check(written !== toggled, "typing a banner headline should redraw the sheet");

  await page.locator("label", { hasText: "Banner across the top" }).click();
  await page.waitForTimeout(900);
  const noBanner = await page.getAttribute("img[alt='Purchase list']", "src");
  check(noBanner !== written, "hiding the banner should redraw the sheet");
  check(
    (await page.locator("#purchase-headline").count()) === 0,
    "the wording box should go away with the banner",
  );
  await page.locator("label", { hasText: "Banner across the top" }).click();
  await page.waitForTimeout(900);

  // A price typed here must reach the sheet.
  await page.locator("input[aria-label^='Price for']").first().fill("3.25");
  await page.waitForTimeout(900);
  const priced = await page.getAttribute("img[alt='Purchase list']", "src");
  check(priced !== toggled, "the sheet should redraw when a price is typed");
  await page.screenshot({ path: `${OUT}/desktop-4-purchase.png` });

  // The take-off report and its block switches.
  await page.locator("button", { hasText: "Take-off report" }).first().click();
  await page.waitForSelector("img[alt='Take-off report']", { timeout: 20000 });
  await page.waitForTimeout(700);
  const report = await page.getAttribute("img[alt='Take-off report']", "src");
  fs.writeFileSync(`${OUT}/takeoff-report.png`, Buffer.from(report.split(",")[1], "base64"));

  const switches = await page.locator("main").innerText();
  for (const label of [
    "Banner across the top",
    "Key figures",
    "Cost build-up",
    "Where the prices came from",
    "The calculations",
    "Cutting diagrams",
    "Order summary at the bottom",
  ]) {
    check(switches.includes(label), `expected a switch for ${label}`);
  }

  // The take-off banner takes custom wording the same way.
  await page.fill("#takeoff-headline", "Budget estimate, not a quotation");
  await page.waitForTimeout(900);
  const reworded = await page.getAttribute("img[alt='Take-off report']", "src");
  check(reworded !== report, "typing a take-off headline should redraw the sheet");

  await page.locator("label", { hasText: "Cutting diagrams" }).click();
  await page.waitForTimeout(900);
  const trimmed = await page.getAttribute("img[alt='Take-off report']", "src");
  check(trimmed !== reworded, "turning off the diagrams should redraw a shorter sheet");
  check(trimmed.length < report.length, "the sheet without diagrams should be smaller");
  await page.screenshot({ path: `${OUT}/desktop-5-report.png` });

  /* --- the rest ----------------------------------------------------------- */

  await page.locator("aside nav button", { hasText: "Cut plan" }).click();
  await page.waitForSelector("text=Bar 3");

  await page.locator("aside nav button", { hasText: "Guide" }).click();
  await page.waitForSelector("text=How this works");
  const guide = await page.locator("main").innerText();
  check(guide.includes("Utilisation"), "guide should explain utilisation");
  check(/\d+ bars × \$/.test(guide), "guide should show the money sum");

  await context.close();
}

/* ------------------------------------------------------------- persistence */

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await newPage(context);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Your jobs");

  await page.locator("main button", { hasText: "+ New job" }).click();
  await page.waitForSelector("#job-name");
  await page.fill("#job-name", "PERSISTED JOB");
  await page.waitForTimeout(500);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=Your jobs");
  const list = await page.locator("main").innerText();
  check(list.includes("PERSISTED JOB"), "a job should survive a reload");
  check(list.includes("BRATTON 1X1"), "and so should the others");
  console.log("PERSISTED: the job library survived a reload");
  await context.close();
}

await browser.close();

if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
