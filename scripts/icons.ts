// Renders icons/icon.svg to the PNG sizes the manifest lists. Run once after editing the SVG.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const svg = await readFile(join(root, "icons/icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();

for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: join(root, `icons/${size}.png`), omitBackground: true });
}

await browser.close();
