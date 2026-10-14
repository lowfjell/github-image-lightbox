// Opens a real GitHub readme with the built extension and saves the screenshots used in README.md.
// Usage: bun run build && node scripts/demo.mjs [url]
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://github.com/sharkdp/bat";
const extension = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const docs = fileURLToPath(new URL("../docs", import.meta.url));
await mkdir(docs, { recursive: true });

const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: !process.env.HEADED,
  viewport: { width: 1280, height: 800 },
  colorScheme: "dark",
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });

// The largest readme image makes the clearest demo.
const images = await page.locator(".markdown-body a[target=_blank] > img").evaluateAll((imgs) =>
  imgs
    .map((img, i) => ({ i, area: img.naturalWidth * img.naturalHeight, alt: img.alt }))
    .sort((a, b) => b.area - a.area),
);
if (!images.length) throw new Error(`no readme images found on ${url}`);
await page.locator(".markdown-body a[target=_blank] > img").nth(images[0].i).click();

const host = page.locator("#github-image-lightbox");
await host.locator(".image.ready").waitFor();
await page.waitForTimeout(300);
const counter = await host.locator(".counter").textContent();
console.log(`opened "${images[0].alt}" (${counter || "single image"}) on ${url}`);
await page.screenshot({ path: `${docs}/fitted.png` });

await page.mouse.move(700, 380);
await page.mouse.wheel(0, -500);
await page.waitForTimeout(300);
console.log(`zoomed to ${await host.locator(".zoom").textContent()}`);
await page.screenshot({ path: `${docs}/zoomed.png` });

await context.close();
