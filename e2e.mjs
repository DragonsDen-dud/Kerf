/**
 * Smoke test: drives the real app in an iPhone-sized browser, checks the three
 * headline functions, and saves the exported PNG for inspection.
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";

const OUT = process.env.OUT_DIR || "/tmp/kerf-e2e";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({
  ...devices["iPhone 14 Pro"],
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const url = process.env.BASE_URL || "http://localhost:3210";
await page.goto(url, { waitUntil: "networkidle" });

// --- Function 1: material requirements -------------------------------------
await page.waitForSelector("text=BUY");
const banner = await page.locator("header").innerText();
console.log("HEADER:", banner.replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/1-estimate.png` });

// --- Function 2: per-bar breakdown -----------------------------------------
await page.getByRole("button", { name: "Layout" }).click();
await page.waitForSelector("text=distinct pattern");
const layout = await page.locator("main").innerText();
console.log("LAYOUT (first 260):", layout.slice(0, 260).replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/2-layout.png` });

// --- Job tab ---------------------------------------------------------------
await page.getByRole("button", { name: "Job" }).click();
await page.waitForSelector("#stock-length");

// Shop-notation entry must be accepted.
await page.fill("#stock-length", "24'");
await page.locator("#stock-length").blur();
await page.waitForTimeout(200);
const stockValue = await page.inputValue("#stock-length");
console.log("STOCK after typing 24':", stockValue);
if (stockValue !== "288") throw new Error(`expected 288, got ${stockValue}`);

// Put it back and check the sequential strategy matches the workbook.
await page.fill("#stock-length", "240");
await page.locator("#stock-length").blur();
await page.getByRole("button", { name: "Match spreadsheet" }).click();
await page.waitForTimeout(300);
const sequential = await page.locator("header").innerText();
console.log("SEQUENTIAL:", sequential.replace(/\n/g, " | "));
if (!sequential.includes("BUY 14 BARS")) throw new Error("sequential should need 14 bars");

await page.getByRole("button", { name: "Optimised" }).click();
await page.waitForTimeout(300);
const optimised = await page.locator("header").innerText();
if (!optimised.includes("BUY 13 BARS")) throw new Error("optimised should need 13 bars");
console.log("OPTIMISED:", optimised.replace(/\n/g, " | "));
await page.screenshot({ path: `${OUT}/3-job.png` });

// --- Function 3: PNG export ------------------------------------------------
await page.getByRole("button", { name: "PNG" }).click();
await page.waitForSelector('img[alt="Cut list snapshot"]', { timeout: 15000 });
await page.waitForTimeout(400);

const src = await page.getAttribute('img[alt="Cut list snapshot"]', "src");
if (!src?.startsWith("data:image/png;base64,")) throw new Error("PNG was not produced");
const buffer = Buffer.from(src.split(",")[1], "base64");
fs.writeFileSync(`${OUT}/4-report.png`, buffer);
console.log("REPORT PNG:", (buffer.length / 1024).toFixed(0), "KB");
await page.screenshot({ path: `${OUT}/5-share-sheet.png` });

// --- Persistence -----------------------------------------------------------
await page.getByRole("button", { name: "Done" }).click();
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("text=BUY 13 BARS");
console.log("PERSISTED: job survived a reload");

if (errors.length) {
  console.error("CONSOLE ERRORS:\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No console errors.");
}

await browser.close();
