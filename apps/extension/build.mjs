import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Bundles the extension with esbuild rather than Next or Metro.
 *
 * Both entry points are IIFEs: a content script has no module loader, and the
 * inference frame is loaded by a plain <script> tag so its CSP stays as narrow
 * as possible. `dist/` is what you load unpacked in the browser.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "src");
const OUT = path.join(HERE, "dist");

const watch = process.argv.includes("--watch");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/**
 * NSFWJS ships three model variants and reaches them through dynamic import().
 * In IIFE format esbuild cannot code-split, so it inlines all of them — which
 * meant a 39 MB bundle, 29 MB of it Inception-V3 weights for a model this
 * extension never loads. We only ever call load("MobileNetV2"), so the other
 * two variants' weight files resolve to a stub that throws if it is ever
 * reached. Bundle drops to a few MB and nothing lazy is lost.
 *
 * @type {import("esbuild").Plugin}
 */
const dropUnusedModels = {
  name: "drop-unused-nsfw-models",
  setup(pluginBuild) {
    const unused = /models[\\/](inception_v3|mobilenet_v2_mid)[\\/].*\.min\.js$/;
    pluginBuild.onResolve({ filter: unused }, (args) => ({
      path: args.path,
      namespace: "nsfw-stub",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "nsfw-stub" }, () => ({
      contents:
        "export default null; export const modelJson = null; export const weightBundles = [];",
      loader: "js",
    }));
  },
};

/** @type {import("esbuild").BuildOptions} */
const shared = {
  bundle: true,
  format: "iife",
  plugins: [dropUnusedModels],
  target: ["chrome114"],
  platform: "browser",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
  legalComments: "none",
};

function copyStatic() {
  cpSync(path.join(HERE, "manifest.json"), path.join(OUT, "manifest.json"));
  cpSync(path.join(SRC, "sandbox.html"), path.join(OUT, "sandbox.html"));
}

const targets = [
  { entryPoints: [path.join(SRC, "content.ts")], outfile: path.join(OUT, "content.js") },
  { entryPoints: [path.join(SRC, "sandbox.ts")], outfile: path.join(OUT, "sandbox.js") },
];

if (watch) {
  for (const target of targets) {
    const ctx = await context({ ...shared, ...target });
    await ctx.watch();
  }
  copyStatic();
  console.log(`[safeframe-ext] watching → ${OUT}`);
} else {
  await Promise.all(targets.map((target) => build({ ...shared, ...target })));
  copyStatic();
  console.log(`[safeframe-ext] built → ${OUT}`);
}
