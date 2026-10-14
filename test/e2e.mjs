// Loads dist/chrome into Chromium and drives it on a fake github.com page that copies GitHub's markdown markup.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const extension = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const fixture = await readFile(new URL("./fixtures/readme.html", import.meta.url), "utf8");
const results = fileURLToPath(new URL("../test-results", import.meta.url));
await mkdir(results, { recursive: true });

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: !process.env.HEADED,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

// Draw the test images in the browser so the repo needs no binary fixtures.
const painter = await context.newPage();
async function paint(width, height, label, color) {
  await painter.setViewportSize({ width, height });
  await painter.setContent(
    `<body style="margin:0;display:grid;place-items:center;height:100vh;background:${color};font:bold ${height / 4}px sans-serif;color:#fff">${label}</body>`,
  );
  return painter.screenshot();
}
const images = {
  "shot-1.png": await paint(1600, 900, "1", "#2f6f4f"),
  "camo-2": await paint(900, 1400, "2", "#6f2f5f"),
  "asset-3": await paint(640, 360, "3", "#2f4f6f"),
  "badge.png": await paint(90, 20, "ci", "#3fb950"),
};
await painter.close();

await context.route(/^https:\/\/(github\.com|camo\.githubusercontent\.com)\//, (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/lowfjell/demo") {
    return route.fulfill({ contentType: "text/html", body: fixture });
  }
  const name = Object.keys(images).find((key) => url.pathname.endsWith(key));
  if (name) return route.fulfill({ contentType: "image/png", body: images[name] });
  return route.fulfill({ status: 404, body: "" });
});

const page = await context.newPage();
await page.goto("https://github.com/lowfjell/demo");
await page.waitForFunction(() => [...document.images].every((img) => img.complete));

const host = page.locator("#github-image-lightbox");
const stage = host.locator(".stage");
const counter = host.locator(".counter");
const scale = async () => Number(await stage.getAttribute("data-scale"));
const lastClickPrevented = () => page.evaluate(() => window.lastClickPrevented);
const passed = [];
async function check(name, fn) {
  await fn();
  passed.push(name);
  console.log(`ok - ${name}`);
}

await check("content script loads", async () => {
  await page.getByAltText("First screenshot").click();
  await host.waitFor({ timeout: 5000 });
});

await check("opens on the clicked image, fitted to the viewport", async () => {
  assert.equal(await counter.textContent(), "1 / 3");
  assert.equal(await stage.getAttribute("data-index"), "0");
  // (1280 - 96) / 1600
  assert.ok(Math.abs((await scale()) - 0.74) < 0.01, `scale ${await scale()}`);
  assert.equal(await page.evaluate(() => document.body.inert), true);
  await page.screenshot({ path: `${results}/open.png` });
});

await check("arrow keys step through the readme's images and wrap", async () => {
  await page.keyboard.press("ArrowRight");
  assert.equal(await counter.textContent(), "2 / 3");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.equal(await counter.textContent(), "1 / 3");
  await page.keyboard.press("ArrowLeft");
  assert.equal(await counter.textContent(), "3 / 3");
  await page.keyboard.press("ArrowRight");
});

await check("GitHub's own shortcuts don't fire while open", async () => {
  await page.keyboard.press("s");
  assert.equal(await page.evaluate(() => window.pageKeydowns), 0);
});

await check("wheel zooms in, 0 resets to fit", async () => {
  const fit = await scale();
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -300);
  await page.waitForFunction((f) => Number(document.querySelector("#github-image-lightbox").shadowRoot.querySelector(".stage").dataset.scale) > f, fit);
  await page.keyboard.press("0");
  assert.equal(await scale(), fit);
});

await check("a plain click on the image doesn't close it", async () => {
  await page.mouse.click(640, 400);
  assert.equal(await host.count(), 1);
});

await check("double-click toggles actual pixels", async () => {
  await page.mouse.dblclick(640, 400);
  assert.equal(await scale(), 1);
  await page.mouse.dblclick(640, 400);
  assert.ok((await scale()) < 1);
});

await check("drag pans a zoomed image and doesn't close it", async () => {
  await page.mouse.dblclick(640, 400);
  const before = await host.locator(".image").evaluate((img) => img.style.transform);
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(500, 300, { steps: 5 });
  await page.mouse.up();
  const after = await host.locator(".image").evaluate((img) => img.style.transform);
  assert.notEqual(after, before);
  assert.equal(await host.count(), 1);
});

await check("Esc closes and gives focus back to the link", async () => {
  await page.keyboard.press("Escape");
  assert.equal(await host.count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.querySelector("img")?.alt), "First screenshot");
  assert.equal(await page.evaluate(() => document.body.inert), false);
  assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
});

await check("clicking the backdrop closes", async () => {
  await page.getByAltText("Third screenshot").click();
  assert.equal(await counter.textContent(), "3 / 3");
  await page.mouse.click(20, 780);
  assert.equal(await host.count(), 0);
});

await check("badges and ordinary links are left alone", async () => {
  await page.getByAltText("CI status").click();
  assert.equal(await lastClickPrevented(), false);
  await page.getByAltText("Build badge").click();
  assert.equal(await lastClickPrevented(), false);
  assert.equal(await host.count(), 0);
});

await check("ctrl-click keeps opening the image in a new tab", async () => {
  await page.getByAltText("First screenshot").click({ modifiers: ["Control"] });
  assert.equal(await lastClickPrevented(), false);
  assert.equal(await host.count(), 0);
});

await context.close();
console.log(`\n${passed.length} checks passed`);
