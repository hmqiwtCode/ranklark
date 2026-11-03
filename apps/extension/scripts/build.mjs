// Bundles the extension into dist/ (dev, fixed ID via "key") or dist-store/ (no key, for Chrome Web Store upload).
// Extra dashboard origins allowed to auto-connect: DASHBOARD_ORIGINS="https://aso.example.com,https://x.dev"

import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

const root = `${path.dirname(new URL(import.meta.url).pathname)}/..`;
const store = process.argv.includes("--store");
const watch = process.argv.includes("--watch");
const out = path.join(root, store ? "dist-store" : "dist");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "icons"), { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(root, "static/manifest.json"), "utf8"));
manifest.version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const extra = (process.env.DASHBOARD_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((o) => `${o.replace(/\/$/, "")}/*`);
manifest.externally_connectable.matches.push(...extra);
if (!store) {
  // PUBLIC key only: pins the unpacked dev build to a stable ID so the dashboard can message it.
  // (The matching private key is only needed to pack a .crx and is never committed.)
  manifest.key = fs.readFileSync(path.join(root, "static/dev-manifest-key.txt"), "utf8").trim();
}
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
for (const f of ["popup.html", "popup.css"]) fs.copyFileSync(path.join(root, "static", f), path.join(out, f));
for (const f of fs.readdirSync(path.join(root, "static/icons")))
  fs.copyFileSync(path.join(root, "static/icons", f), path.join(out, "icons", f));

const common = {
  bundle: true,
  target: "chrome120",
  sourcemap: store ? false : "inline",
  minify: store,
  logLevel: "info",
  legalComments: "none",
};
const ctxs = await Promise.all([
  esbuild.context({
    ...common,
    entryPoints: [path.join(root, "src/background/index.ts")],
    outfile: path.join(out, "background.js"),
    format: "esm",
  }),
  esbuild.context({ ...common, entryPoints: [path.join(root, "src/popup/popup.ts")], outfile: path.join(out, "popup.js"), format: "iife" }),
]);
if (watch) {
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(ctxs.map((c) => c.rebuild()));
  await Promise.all(ctxs.map((c) => c.dispose()));
  console.log(`built ${path.relative(root, out)}/ (${store ? "store" : "dev"})`);
}
