// Copies the TF.js WASM backend binaries into public/ so the WASM fallback
// is served same-origin (self-hosted — no CDN dependency at runtime).
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(
  here,
  "..",
  "node_modules",
  "@tensorflow",
  "tfjs-backend-wasm",
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
console.log(`[copy-wasm] ${copied} wasm binaries → public/tfjs-wasm`);
