// Builds dist/chrome and dist/firefox, plus store zips and a source zip for addons.mozilla.org review.
import { zipSync } from "fflate";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import pkg from "../package.json";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");

const manifest = {
  manifest_version: 3,
  name: "GitHub Image Lightbox",
  version: pkg.version,
  description: pkg.description,
  icons: { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" },
  permissions: ["storage"],
  content_scripts: [
    { matches: ["https://github.com/*", "https://gist.github.com/*"], js: ["content.js"], run_at: "document_idle" },
  ],
  options_ui: { page: "options.html", open_in_tab: false },
};

const targets = {
  chrome: manifest,
  firefox: {
    ...manifest,
    browser_specific_settings: {
      gecko: {
        id: "github-image-lightbox@lowfjell",
        strict_min_version: "142.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  },
};

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

async function zip(dir: string, paths: string[], out: string): Promise<void> {
  const entries: Record<string, Uint8Array> = {};
  for (const path of paths) entries[relative(dir, path)] = new Uint8Array(await readFile(path));
  await writeFile(out, zipSync(entries, { level: 9 }));
}

await rm(dist, { recursive: true, force: true });

for (const [target, targetManifest] of Object.entries(targets)) {
  const out = join(dist, target);
  const result = await Bun.build({
    entrypoints: [join(root, "src/content.ts"), join(root, "src/options.ts")],
    outdir: out,
    format: "iife",
    target: "browser",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  await cp(join(root, "src/options.html"), join(out, "options.html"));
  await mkdir(join(out, "icons"), { recursive: true });
  for (const size of [16, 32, 48, 128]) await cp(join(root, `icons/${size}.png`), join(out, `icons/${size}.png`));
  await writeFile(join(out, "manifest.json"), JSON.stringify(targetManifest, null, 2) + "\n");
  await zip(out, await files(out), join(dist, `github-image-lightbox-${target}-${pkg.version}.zip`));
  console.log(`built dist/${target}`);
}

const sources = ["package.json", "bun.lock", "tsconfig.json", "README.md", "LICENSE"].map((f) => join(root, f));
for (const dir of ["src", "scripts", "icons"]) sources.push(...(await files(join(root, dir))));
await zip(root, sources, join(dist, `github-image-lightbox-source-${pkg.version}.zip`));
console.log("built source zip");
