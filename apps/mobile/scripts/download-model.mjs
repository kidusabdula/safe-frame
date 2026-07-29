// Downloads the quantized ViT NSFW ONNX model (~85 MB) from Hugging Face
// into assets/models/ so Metro bundles it into the APK. The binary is
// git-ignored — run this once before building:
//
//   pnpm --filter @safeframe/mobile download-model
//
// This is a BUILD-TIME download. At runtime the app makes no network calls.
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MODEL_URL =
  "https://huggingface.co/AdamCodd/vit-base-nsfw-detector/resolve/main/onnx/model_quantized.onnx";

const here = dirname(fileURLToPath(import.meta.url));
const dest = join(here, "..", "assets", "models", "vit-nsfw-int8.onnx");

if (existsSync(dest) && statSync(dest).size > 10_000_000) {
  console.log(`[download-model] already present: ${dest}`);
  process.exit(0);
}

mkdirSync(dirname(dest), { recursive: true });
console.log(`[download-model] fetching ${MODEL_URL}`);
const response = await fetch(MODEL_URL);
if (!response.ok || !response.body) {
  console.error(`[download-model] failed: HTTP ${response.status}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
const mb = (statSync(dest).size / (1024 * 1024)).toFixed(1);
console.log(`[download-model] saved ${mb} MB → ${dest}`);
