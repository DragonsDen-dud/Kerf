/**
 * Smoke test: drives the real app at phone and desktop sizes, exercises the
 * take-off / pricing / export paths, and saves screenshots plus the exported
 * PNG for inspection.
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
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
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

  // The Scales tab lands first and is already priced from the sample material.
  await page.waitForSelector("main >> text=Bars to buy");
  const header = await page.locator("header").innerText();
  console.log("PHONE HEADER:", header.replace(/\n/g, " | "));
  check(header.includes("13"), "expected 13 bars in the phone header");
  check(header.includes("$630.50"), "expected the priced total (13 x $48.50)");
  await page.screenshot({ path: `${OUT}/phone-1-scales.png` });

  // The tab bar must be reachable without scrolling to the end of the page.
  const phoneTabs = page.locator("nav.lg\\:hidden");
  const tab = phoneTabs.locator("button", { hasText: "Cut plan" });
  const box = await tab.boundingBox();
  check(box !== null && box.y < 900, `tab bar off-screen at y=${box?.y}`);

  await tab.click();
  await page.waitForSelector("text=distinct pattern, text=patterns", { timeout: 5000 }).catch(() => {});
  await page.waitForSelector("text=Bar 3");
  await page.screenshot({ path: `${OUT}/phone-2-talons.png` });

  await phoneTabs.locator("button", { hasText: "Materials" }).click();
  await page.waitForSelector("text=Materials and prices");
  const hoard = await page.locator("main").innerText();
  check(hoard.includes("Written quote"), "expected the price citation in Materials");
  check(hoard.includes("Q-10432"), "expected the quote reference in Materials");
  console.log("PHONE MATERIALS:", hoard.slice(0, 180).replace(/\n/g, " | "));
  await page.screenshot({ path: `${OUT}/phone-3-hoard.png` });

  // Export path.
  await page.locator("header button", { hasText: "Export" }).click();
  await page.waitForSelector('img[alt="Take-off snapshot"]', { timeout: 20000 });
  await page.waitForTimeout(400);
  const src = await page.getAttribute('img[alt="Take-off snapshot"]', "src");
  check(src?.startsWith("data:image/png;base64,"), "PNG was not produced");
  const buffer = Buffer.from(src.split(",")[1], "base64");
  fs.writeFileSync(`${OUT}/report-detailed.png`, buffer);
  console.log("REPORT PNG:", (buffer.length / 1024).toFixed(0), "KB");
  await context.close();
}

/* ----------------------------------------------------------------- desktop */

{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await newPage(context);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("main >> text=Bars to buy");

  // The sidebar replaces the tab bar above the lg breakpoint.
  check(await page.locator("aside nav").isVisible(), "desktop sidebar should be visible");
  const phoneNav = page.locator("nav.lg\\:hidden");
  check(!(await phoneNav.isVisible()), "phone tab bar should be hidden on desktop");
  await page.screenshot({ path: `${OUT}/desktop-1-scales.png` });

  // No horizontal overflow at desktop width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(overflow <= 0, `desktop page overflows horizontally by ${overflow}px`);

  await page.locator("aside nav button", { hasText: "Job" }).click();
  await page.waitForSelector("#job-name");

  // Quick vs detailed mode switching.
  await page.locator("button", { hasText: "Quick estimate" }).first().click();
  await page.waitForTimeout(300);
  let banner = await page.locator("header").innerText();
  console.log("QUICK:", banner.replace(/\n/g, " | "));
  check(banner.includes("$630.50"), "quick mode should still cost the first line");

  await page.locator("button", { hasText: "Detailed take-off" }).first().click();
  await page.waitForTimeout(300);

  // Markup flows through to the headline.
  await page.fill("#pct-markup", "10");
  await page.waitForTimeout(300);
  banner = await page.locator("header").innerText();
  console.log("WITH MARKUP:", banner.replace(/\n/g, " | "));
  check(banner.includes("$693.55"), `expected $693.55 with 10% markup, got: ${banner}`);

  // A second line proves the multi-material take-off.
  await page.locator("button", { hasText: "+ Add material" }).first().click();
  await page.waitForTimeout(300);
  const lineCount = await page.locator("select[id^='mat-']").count();
  check(lineCount === 2, `expected 2 lines, found ${lineCount}`);
  await page.screenshot({ path: `${OUT}/desktop-2-den.png` });

  await page.locator("aside nav button", { hasText: "Cut plan" }).click();
  await page.waitForSelector("text=Bar 3");
  await page.screenshot({ path: `${OUT}/desktop-3-talons.png` });

  await page.locator("aside nav button", { hasText: "Materials" }).click();
  await page.waitForSelector("text=Materials and prices");
  await page.locator("button", { hasText: "+ Add material" }).last().click();
  await page.waitForSelector("#mat-name");
  await page.screenshot({ path: `${OUT}/desktop-4-hoard-editor.png` });
  await page.locator("button", { hasText: "Close" }).click();

  // --- Purchase list export ------------------------------------------------
  await page.locator("header button", { hasText: "Export" }).click();
  await page.waitForSelector("button:has-text('Purchase list')");
  await page.locator("button", { hasText: "Purchase list" }).first().click();
  await page.waitForSelector("img[alt='Purchase list']", { timeout: 20000 });
  await page.waitForTimeout(500);

  const before = await page.getAttribute("img[alt='Purchase list']", "src");
  check(before?.startsWith("data:image/png;base64,"), "purchase list PNG was not produced");
  fs.writeFileSync(
    `${OUT}/purchase-list.png`,
    Buffer.from(before.split(",")[1], "base64"),
  );

  const panel = await page.locator("div.lg\\:overflow-y-auto").innerText();
  check(/\d+ ft bars/.test(panel), "expected length options in the purchase panel");
  check(/best value/i.test(panel), "expected a best-value recommendation");
  console.log("PURCHASE:", panel.slice(0, 150).replace(/\n/g, " | "));

  // Ticking an option must change the rendered sheet.
  await page.locator("label", { hasText: "Also offer" }).click();
  await page.waitForTimeout(800);
  const after = await page.getAttribute("img[alt='Purchase list']", "src");
  check(after !== before, "the sheet should redraw when an option is toggled");

  // A price typed here must reach the sheet.
  await page.locator("input[aria-label^='Price for']").first().fill("3.25");
  await page.waitForTimeout(900);
  const priced = await page.getAttribute("img[alt='Purchase list']", "src");
  check(priced !== after, "the sheet should redraw when a price is typed");
  await page.screenshot({ path: `${OUT}/desktop-6-purchase.png` });

  await page.locator("button", { hasText: "Close" }).click();
  await page.waitForTimeout(300);

  await page.locator("aside nav button", { hasText: "Guide" }).click();
  await page.waitForSelector("text=How this works");
  const guide = await page.locator("main").innerText();
  check(guide.includes("Utilisation"), "guide should explain utilisation");
  check(guide.includes("blade"), "guide should explain the blade width");
  check(/\d+ bars × \$/.test(guide), `guide should show the money sum, got: ${guide.slice(0, 200)}`);
  await page.screenshot({ path: `${OUT}/desktop-5-guide.png` });

  await context.close();
}

/* ------------------------------------------------------------- persistence */

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await newPage(context);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("main >> text=Bars to buy");
  await page.locator("aside nav button", { hasText: "Job" }).click();
  await page.fill("#job-name", "PERSISTED JOB");
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("text=PERSISTED JOB");
  console.log("PERSISTED: take-off survived a reload");
  await context.close();
}

await browser.close();

if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
