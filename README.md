# SafeFrame

**Fully client-side video content detection.** Upload a video (or paste a URL) and a two-tier ML cascade samples and classifies frames — entirely in your browser. You get a verdict payload, a per-frame score timeline, and a live response demo (blur / pause / replace / skip) suitable for a kids-safety browser.

🔗 **Live demo: [safeframe-livid.vercel.app](https://safeframe-livid.vercel.app)** — installable as a PWA; works offline after the first visit.

> **There is no server.** No database, no API routes, no telemetry, no analytics, no external inference. The deploy artifact is a static export; the only network traffic at runtime is (a) the one-time Tier-2 model download on capable devices and (b) video URLs you explicitly provide. Frames never leave the device — that isn't a limitation of this prototype, it's the point: a kids-safety browser cannot ship children's screen content to a server.

The full design rationale lives in [`docs/architecture-overview.md`](docs/architecture-overview.md) — pipeline, model choice, the cascade tradeoff table, response-mode analysis, limitations, and the path to production.

---

## Repository map

```
safe-frame/
├── packages/core          # Platform-agnostic domain (pure TS, no DOM/RN imports)
│   └── src/
│       ├── schema.ts      # Zod payload + config schemas — THE source of truth
│       ├── scoring.ts     # class-score combination, cascade routing zones
│       ├── aggregate.ts   # EWMA sliding window + hysteresis segment builder
│       ├── deviceTier.ts  # low/mid/high device-tier policy
│       └── __tests__/     # vitest suite (hysteresis, guards, ordering)
├── apps/web               # Next.js 16 (App Router), static export, PWA
│   └── src/features/detection/
│       ├── lib/           # runDetection (the API), tier1/tier2 adapters, sampler
│       ├── workers/       # Tier-2 ONNX ViT in a Web Worker
│       ├── hooks/         # useDetectionEngine reducer state machine, live guard
│       └── components/    # dropzone, timeline, verdict, overlay, settings…
├── apps/mobile            # Expo + onnxruntime-react-native (native path)
│   └── src/               # same core pipeline, bundled int8 ViT, offline-capable
└── apps/extension         # Manifest V3 live guard for any <video> on any site
    └── src/               # content script + hidden inference frame
```

All three apps consume `@safeframe/core` — the payload schema, scoring, aggregation, and tier policy exist exactly once, so they *cannot* drift apart. Core is pure TypeScript with no DOM, React or React Native import, which is precisely why a content script can reuse it unchanged.

## Quick start (web)

Prerequisites: Node ≥ 20, pnpm ≥ 9 (`corepack enable`).

```bash
pnpm install
pnpm dev          # → http://localhost:3000
```

Run the core test suite and typechecks:

```bash
pnpm test         # vitest on packages/core
pnpm typecheck    # strict TS across the workspace
```

Production build (static export — proof no server is involved):

```bash
pnpm build        # → apps/web/out (plain static files)
```

### Deploy (Vercel)

```bash
cd apps/web
npx vercel deploy --prod
```

Vercel auto-detects Next.js; the export produces static output only. Any static host works (`npx serve apps/web/out` locally).

### Using the app

1. Open the app (Chrome recommended; it's installable as a PWA — after the first visit it works offline).
2. Drop a video file, or paste a direct video URL. **[`docs/test-urls.md`](docs/test-urls.md) has 18 verified CORS-readable URLs** across categories (animation, scenery, talking heads, dance, long-form) if you'd rather not hunt for one. If a URL's host blocks cross-origin reads, the app explains why instead of failing silently — proxying through a server would defeat the product.
3. **The player mounts hard-blurred.** Nothing legible is shown before it has been checked, not even a thumbnail. You then choose: **Pre-scan** for certainty, or **Watch with live guard** for immediacy. (Settings → *Strict: never show unscanned frames* goes further and refuses to create a video element at all until a verdict exists.)
4. **Pre-scan** runs the cascade and renders the verdict, category breakdown, flagged-segment map, score timeline, and the JSON payload (copy button).
5. Press play with a flagged video to see the response layer; switch modes (composite / blur / pause / hide / skip) and drag thresholds live in **Settings**. The adult override is scoped to a single detection — approving one flagged moment never disarms the guard for the rest of the video.
6. **Live guard** (the toggle next to *Pre-scan video*) scores frames during playback instead — the way an embedded browser engine would run it. It is Tier-1 only by design: latency over accuracy.
7. The **benchmark panel** shows the resolved device tier, chosen backend, model load times, throughput, and frame-latency percentiles — measured on your device, never estimated.
8. `/architecture` is a full interactive walkthrough of the design, including a widget that runs the real scoring code.

### Tuning against captured scans (no re-testing by hand)

The scan log can auto-save every result — including **per-frame class scores and the raw Tier-2 probability** — as JSON to a folder you pick (Chromium; File System Access API, entirely local). Point it at the git-ignored `test-logs/`, then replay those scans offline under different thresholds:

```bash
SAFEFRAME_LOGS=./test-logs pnpm --filter @safeframe/core test replay
```

It re-derives each frame's score from the stored class distribution, so `tier2Weight`, `flagThreshold`, `sexyWeight` and the evidence parameters can all be swept without a browser, a model, or the original video. It skips silently when no logs are present.

## Mobile app

The Expo app runs the same `packages/core` pipeline with **native on-device ONNX inference** (quantized ViT bundled as an asset). It works in airplane mode.

> ⚠️ Native module (`onnxruntime-react-native`) — **Expo Go will not work.** Use a dev build or the APK flow below.

```bash
cd apps/mobile

# Cloud build — no Android SDK needed. The model binary is fetched on the
# build server by the eas-build-post-install hook, so nothing large is
# committed or uploaded.
npx eas-cli build --platform android --profile preview

# — or, entirely locally (needs Android SDK + JDK 17) —
pnpm --filter @safeframe/mobile download-model     # one-time, ~84 MB
npx expo prebuild --platform android && cd android && ./gradlew assembleRelease
# APK → android/app/build/outputs/apk/release/app-release.apk
```

Install: download the APK from the EAS build page (or copy the local one to the phone) and open it, allowing "install unknown apps" — or `adb install app-release.apk`.

For hot-reload development against the native module, build the `development` profile once (`npx eas-cli build --platform android --profile development`), install it, then run `pnpm --filter @safeframe/mobile start`.

## Browser extension

Asking a user to upload a file is a demo affordance. The product shape is *guard whatever is already playing* — which is what `apps/extension` does: a Manifest V3 content script that finds every `<video>` on any site, samples it, and blurs + pauses + explains on a detection. Same `@safeframe/core`, third consumer, unchanged.

```bash
pnpm --filter @safeframe/extension build     # → apps/extension/dist
```

Then in Chrome or Edge: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `apps/extension/dist`. Open any page with a video; the guard attaches automatically.

**Design notes**

- Inference runs in a **hidden extension-page iframe**, not an MV3 offscreen document. Offscreen documents are reached via `chrome.runtime` messaging, which is **JSON-serialized** — a 224×224×4 pixel buffer would become a ~200 000-element JSON array per sampled frame. `postMessage` to an iframe uses structured clone, so the `ArrayBuffer` transfers zero-copy. The iframe also inherits the *extension's* CSP (`'wasm-unsafe-eval'`), so the ML runtime loads on sites whose own CSP would refuse it.
- The build drops NSFWJS's unused Inception-V3 and MobileNetV2-Mid weights, which IIFE bundling would otherwise inline: **39 MB → 4.5 MB**. The content script deep-imports core's pure modules to keep Zod out of a script injected on every page: **330 KB → 8 KB**.

**Honest limits**

| Limit | Detail |
|---|---|
| Reactive, not preemptive | A detection lands within one ~400 ms sample interval, so a flagged frame is briefly visible. Zero exposure needs a full-file pre-scan, which streaming does not allow. |
| DRM / EME video | Reads back as black frames by design — no client-side detector can inspect it. The guard detects the all-black case and says so rather than reporting everything safe. |
| Chrome for Android | No extension support at all. Firefox Android and Safari iOS (via an app wrapper) do support Web Extensions. |

The real conclusion is in [`docs/architecture-overview.md` §12](docs/architecture-overview.md): a kids-safety browser *is* the WebView host, so this belongs in the browser shell as a native content-guard module. The extension proves the core is portable enough to go there.

## The API

There are no HTTP endpoints. The product's API is one function:

```ts
import { runDetection } from "@/features/detection";

const result = await runDetection(videoElement, config, deps, callbacks, signal);
```

- `config` — `DetectionConfig` (thresholds, sampling rate, cascade budget, response/run mode). Zod-validated; all fields have documented defaults.
- `deps` — the Tier-1 adapter, optional Tier-2 worker client (`null` on low-tier devices), and resolved device tier.
- `callbacks` — `onProgress` (phase, throughput, current timestamp) and `onFrame` (per-frame score for live UIs).
- `signal` — an `AbortSignal`; cancellation is instant.

It resolves to a `DetectionResult`, validated against the shared Zod schema:

```jsonc
{
  "contains_inappropriate_content": true,   // core verdict
  "confidence": 0.87,                       // peak windowed score, 0–1
  "categories": { "porn": 0.91, "hentai": 0.03, "sexy": 0.44, "neutral": 0.96, "drawing": 0.02 },
  "flagged_segments": [
    { "start_s": 34.0, "end_s": 41.5, "peak_score": 0.91, "dominant_category": "porn" }
  ],
  "frames_analyzed": 78,
  "video_duration_s": 63.2,
  "processing": { "total_ms": 5410, "avg_frame_latency_ms": 38, "p95_frame_latency_ms": 71, "sampling_fps": 1, "tier2_escalations": 6 },
  "engine": { "tier1_model": "mobilenet-v2-nsfw@quant", "tier2_model": "vit-nsfw-int8", "backend": "webgpu", "device_tier": "high" }
}
```

## Deliberate design decisions

- **No TanStack Query / Redux.** There is no server state anywhere in this product; the processing lifecycle is a local reducer state machine (`useDetectionEngine`). Adding a server-cache library would be cargo culting.
- **No auth / roles / tiers.** Nothing to protect: no accounts, no data leaves the device, no server exists.
- **No chart library.** The score timeline is ~100 lines of hand-rolled SVG; a charting dependency would dominate the bundle for one component.
- **Tier 1 is bundled, not fetched.** nsfwjs ships its MobileNetV2 weights inside the npm package, so the baseline detector requires zero network — ever.
- **CORS failures are surfaced, not proxied.** A proxy would silently reintroduce the server the whole design exists to avoid.
- **No test media in the repo.** Detection quality is verified against local test sets that are never committed.

## Measured performance

Benchmarks are recorded from real hardware only — the in-app benchmark panel reports live measurements, and the table below is filled from the three-device ladder (2016 Galaxy S7 Edge → Galaxy S25 Ultra → desktop Chrome). Empty cells are pending measurement, never estimated.

| Metric | Desktop (Win11/Chrome) | Galaxy S25 Ultra (Chrome) | Galaxy S7 Edge (Chrome) |
|---|---|---|---|
| Device tier detected | | | |
| Backend (T1 / T2) | | | (T2 disabled) |
| Model load, cold / warm | | | |
| Sampling rate | | | |
| Frames/sec throughput | | | |
| Frame latency p50 / p95 | | | |
| 60 s test video: wall-clock | | | |
| Tier-2 escalations | | | 0 |
| UI long-tasks during run | | | |

## Limitations

See [`docs/architecture-overview.md`](docs/architecture-overview.md) §10 for the honest list: CORS-restricted URLs, DRM/HLS streams, sexual-content-only scope (no violence/gore heads yet), sub-second flash risk between samples, skin-heavy false-positive profile, and old-device thermal behavior — plus the production path that addresses each.
