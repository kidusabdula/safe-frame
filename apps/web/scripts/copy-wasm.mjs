// Copies the TF.js WASM backend binaries into public/ so the WASM fallback
// is served same-origin (self-hosted — no CDN dependency at runtime).
// Resolved through Node rather than a fixed path: the root .npmrc hoists
// node_modules (needed by the Expo app), so a fresh install puts the package
// at the repo root, not under apps/web.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const src = join(
  dirname(require.resolve("@tensorflow/tfjs-backend-wasm/package.json")),
  "dist",
);
const dest = join(here, "..", "public", "tfjs-wasm");

mkdirSync(dest, { recursive: true });
let copied = 0;
for (const file of readdirSync(src)) {
  if (file.endsWith(".wasm")) {
    copyFileSync(join(src, file), join(dest, file));
    copied++;
  }
}
if (copied === 0) {
  console.error(`[copy-wasm] no .wasm files found in ${src}`);
  process.exit(1);
}
console.log(`[copy-wasm] ${copied} wasm binaries → public/tfjs-wasm`);
