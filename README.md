# SafeFrame

**Fully client-side video content detection.** Upload a video (or paste a URL) and a two-tier ML cascade samples and classifies frames — entirely in your browser. You get a verdict payload, a per-frame score timeline, and a live response layer (blur / pause / replace / skip) suitable for a kids-safety browser.

🔗 **Live: [safeframe-livid.vercel.app](https://safeframe-livid.vercel.app)** — installable as a PWA; works offline after the first visit.
📐 **Interactive architecture walkthrough: [/architecture](https://safeframe-livid.vercel.app/architecture)** — the design rationale as a live page, including a widget that runs the real scoring code.

> **There is no server.** No database, no API routes, no telemetry, no analytics, no external inference. The deploy artifact is a static export; the only network traffic at runtime is (a) the one-time Tier-2 model download on capable devices and (b) video URLs you explicitly provide. Frames never leave the device — that isn't a limitation of the prototype, it's the point: a kids-safety browser cannot ship children's screen content to a server.

---

## Contents

[Repository map](#repository-map) · [Setup](#setup) · [Using the app](#using-the-app) · [Architecture](#architecture) · [The models](#the-models) · [Tradeoffs & alternatives](#tradeoffs-and-alternatives-considered) · [Responding to a detection](#responding-to-a-detection) · [The API](#the-api) · [Measured performance](#measured-performance) · [Limitations](#limitations-and-edge-cases) · [Path to production](#path-to-production-on-mobile) · [Mobile app](#mobile-app) · [Browser extension](#browser-extension) · [Test URLs](#cors-readable-test-urls)

## Repository map

```
safe-frame/
├── packages/core          # Platform-agnostic domain (pure TS, no DOM/RN imports)
│   └── src/
│       ├── schema.ts      # Zod payload + config schemas — THE source of truth
│       ├── scoring.ts     # class-score combination, cascade routing, tier fusion
│       ├── aggregate.ts   # EWMA window + hysteresis + sustained-evidence pass
│       ├── deviceTier.ts  # low/mid/high device-tier policy
│       └── __tests__/     # vitest suite (38 tests) + offline replay harness
├── apps/web               # Next.js 16 (App Router), static export, PWA
│   └── src/features/
│       ├── detection/     # runDetection (the API), tier adapters, worker, UI
│       └── architecture/  # the /architecture walkthrough page
├── apps/mobile            # Expo + onnxruntime-react-native (native path)
│   └── src/               # same core pipeline, bundled int8 ViT, offline-capable
└── apps/extension         # Manifest V3 live guard for any <video> on any site
    └── src/               # content script + hidden inference frame
```

All three apps consume `@safeframe/core` — the payload schema, scoring, aggregation and tier policy exist exactly once, so they *cannot* drift apart. Core is pure TypeScript with no DOM, React or React Native import, which is precisely why a browser-extension content script can reuse it unchanged.

## Setup

Prerequisites: Node ≥ 20, pnpm ≥ 9 (`corepack enable`).

```bash
pnpm install
pnpm dev          # → http://localhost:3000
```

```bash
pnpm test         # vitest on packages/core (38 tests)
pnpm typecheck    # strict TS across the workspace
pnpm build        # static export → apps/web/out (proof no server is involved)
```

There is nothing else to configure: no API keys, no environment variables, no services. The Tier-1 model ships inside the npm dependency, so a fresh clone detects offline on first run.

### Deploy

The build is a plain static export, so any static host works (`npx serve apps/web/out`). For Vercel, deploy the prebuilt output rather than letting the platform build — the remote builder runs `npm install`, which can't resolve this repo's `workspace:*` protocol:

```bash
pnpm build
cd apps/web/out && npx vercel deploy --prod
```

## Using the app

1. Open the app (Chrome recommended; installable as a PWA — after the first visit it works offline).
2. Drop a video file, or paste a direct video URL. [Verified CORS-readable URLs are listed below](#cors-readable-test-urls). If a URL's host blocks cross-origin reads, the app explains why instead of failing silently — proxying through a server would defeat the product.
3. **The player mounts hard-blurred.** Nothing legible is shown before it has been checked, not even a thumbnail. You then choose **Pre-scan** for certainty or **Watch with live guard** for immediacy. (Settings → *Strict: never show unscanned frames* goes further and refuses to create a video element at all until a verdict exists.)
4. **Pre-scan** runs the cascade and renders the verdict, category breakdown, flagged-segment map, score timeline, and the JSON payload.
5. Press play on a flagged video to see the response layer. Switch modes (composite / blur / pause / hide / skip) and drag thresholds live in **Settings**. The adult override is scoped to a single detection — approving one flagged moment never disarms the guard for the rest of the video.
6. **Live guard** (the toggle beside *Pre-scan video*) scores frames during playback instead — the way an embedded browser engine would run it. Tier-1 only by design: latency over accuracy.
7. The **benchmark panel** shows resolved device tier, chosen backend, model load times, throughput and frame-latency percentiles — measured on your device, never estimated.

### Tuning against captured scans

The scan log can auto-save every result — including **per-frame class scores and the raw Tier-2 probability** — as JSON to a folder you pick (Chromium's File System Access API; entirely local). Point it at the git-ignored `test-logs/`, then replay those scans offline under different thresholds:

```bash
SAFEFRAME_LOGS=./test-logs pnpm --filter @safeframe/core test replay
```

It re-derives each frame's score from the stored class distribution, so `tier2Weight`, `flagThreshold`, `sexyWeight` and the evidence parameters can all be swept without a browser, a model, or the original video. Skips silently when no logs are present.

---

## Architecture

### Problem framing

Accept a video by upload or URL, decide whether it contains inappropriate visual content, return a verdict plus confidence — with everything running locally in the browser, no inference API and no server-side processing. The production target is a mobile browser on hardware that may be several years old.

That constraint is treated as the product rather than an obstacle. A kids-safety browser cannot ship a child's screen to a server: it fails on privacy, legal exposure, offline reliability, latency and per-user cost simultaneously. So there is no database and no server component anywhere in this system. The only persistence is model weights in the Cache API and preferences in localStorage, both on the user's own machine.

### Why image classifiers, not a vision LLM

Deciding whether a frame contains nudity is an image-classification problem, and purpose-built open models for it are measured in megabytes. A multimodal LLM can answer the same question, but the smallest usable vision-language models are hundreds of megabytes to gigabytes, take seconds per frame on a phone, and drain a battery doing it — losing on compute, memory, battery and device variability at once.

A second reason matters more: a classifier returns a calibrated probability per class, which is what makes smoothing, hysteresis, thresholds and a tunable precision/recall posture possible. A generative model returns text you must parse and cannot easily calibrate. For a safety decision a parent may need to adjust, the numeric output is the more honest interface.

### Pipeline

```
INGEST ──▶ SAMPLE ──▶ PREPROCESS ──▶ CLASSIFY ──▶ AGGREGATE ──▶ RESPOND
file/URL   seek-based  downscale to   Tier 1 all   EWMA + hyst-   verdict JSON
object     adaptive    224×224 RGB    Tier 2 on    eresis + raw   + UI guard
URL        fps                        borderline   evidence       (blur/pause)
```

**Ingest.** File upload creates an object URL — fully local, any size, no network. URL ingestion fetches with CORS; if the host sends no CORS headers the canvas is tainted and frames can't be read, which the UI states honestly rather than proxying.

**Sampling.** A hidden `<video>` is seeked programmatically (`seek → seeked → drawImage`), which runs faster than real-time playback and decodes no audio. Baseline 1 fps; low-tier devices drop to 0.5. When a frame lands in the uncertain band the sampler **densifies locally** — the surrounding ±2 s at 2 fps — so short flashes near a hit aren't missed. Ten minutes of video becomes a few hundred classified frames, not eighteen thousand.

**Preprocess.** Frames are drawn to a canvas at 224×224, the models' native input, so full-resolution pixels never move. This is the single largest performance win in the system.

**Aggregate.** See [the decision layer](#the-decision-layer) below.

**Threading.** Tier-2 inference runs in a **Web Worker**, so the heavy path never touches the main thread. The sampling loop yields between frames, which is why progress, the timeline and cancellation stay responsive throughout — the benchmark panel counts long tasks over 50 ms so that claim is measured rather than asserted.

### The two-tier cascade

Every sampled frame is scored by Tier 1. That score routes the frame:

| Tier-1 score `p` | Action |
|---|---|
| `p < 0.35` | Accept as safe. No further work — this is most of a normal video. |
| `0.35 ≤ p < 0.75` | **Borderline** → escalate to Tier 2, if the device tier permits and the per-video budget allows. The two opinions are then **fused** (below). |
| `p ≥ 0.75` | Flag directly. Tier 1 is already confident; the big model would buy nothing. |

`p = clamp01(porn + hentai + sexy × 0.4)`. The ×0.4 weight is a deliberate policy choice, not a tuned constant: it makes it arithmetically impossible for swimwear alone to cross the flag threshold at default settings, which is the most common false positive in this domain.

The escalation band *is* the design. Narrow it and you have a single-model system; widen it to everything and you've paid for an ensemble. The point is to spend the expensive model only where it changes the answer.

#### Tier 2 arbitrates; it does not overwrite

An earlier build assigned the Tier-2 score directly, replacing Tier-1's. That is wrong, and live testing proved it: it hands the verifier a **unilateral veto**, so frames whose Tier-1 score happened to land inside the escalation band could be pulled *below* the flag line — and videos containing real explicit footage came back clean. The tell was in the data: every incorrect verdict came from a scan with a high escalation count, while every scan where Tier 1 was confident enough to skip escalation was correct.

The rule that replaced it (`fuseTierScores`, `packages/core/src/scoring.ts`):

```
blend = tier2Weight · p_tier2 + (1 − tier2Weight) · p_tier1    // tier2Weight = 0.65
p     = clamp01( max(blend, scores.porn) )
```

- **Blend, don't replace** — Tier 2 dominates, because it is the more accurate model, but neither tier can erase the other.
- **Floor at the explicit-class score** — `porn` is the one unambiguous, photographic, full-weight class. Tier 2 may overrule *"this looks suggestive"*; it may not overrule *"this is explicit"*.

`sexy` is excluded from the floor so swimwear still cannot self-flag. `hentai` is excluded because NSFWJS assigns animation high `hentai`/`drawing` scores and flooring on it would resurrect a cartoon false positive — `hentai` keeps full weight inside the score combination, so confident animated content still flags via the ≥0.75 path.

**The generalisable lesson:** in a cascade, *"the better model wins"* is not the same rule as *"the better model decides alone."* A verifier introduced to suppress false positives will suppress true positives too unless something bounds it.

### The decision layer

Per-frame scores feed an EWMA-smoothed 5-sample window. A flagged **segment** opens when the smoothed score crosses 0.60 and closes when it falls below 0.40 — hysteresis prevents flicker at the boundary, and segment starts are backdated to the earliest in-window hot frame so onsets aren't clipped by smoothing lag.

There are **two independent paths to a positive verdict**, and the second exists because the first was insufficient. Smoothing is the right instrument for deciding *where* content begins and ends — it ignores single-frame spikes — but the wrong instrument for deciding *whether* content is present, because it also damps short events. A 3-second explicit insert surrounded by safe footage peaks around 0.57 smoothed against a 0.60 threshold, and so reported clean. So a second pass reads the **raw** series and treats a sustained run of over-threshold frames (≥3 frames or ≥1.5 s) as evidence in its own right, synthesising a segment for it. Either path can flag a video; both produce segments, so the verdict, the segment list and the timeline can never disagree on screen.

`confidence` is the greater of the peak smoothed score and the peak of any qualifying evidence run, attenuated by a minimum-frames rule so a 2-frame video can't produce an overconfident verdict. Taking the greater of the two isn't tidiness: reporting the smoothed peak alone could show a *flagged* video with a confidence below its own flag threshold, which reads as a bug to anyone looking at the card.

The `/architecture` page has an interactive version of this — presets for each scenario (sustained, short insert, single spike, swimwear, boundary flicker) with live threshold sliders, running the shipped aggregator rather than a mock.

### Fallback chains

Nothing here has a single point of failure. Four chains degrade rather than break, and all four are in shipped code:

1. **Model cascade** — MobileNetV2 on every frame → ViT on borderline frames only → Tier-1 verdicts once the per-video escalation budget is spent.
2. **Execution provider** — Tier 2: WebGPU/fp16 → WebGPU/fp32 → WASM/int8. Tier 1: WebGL → WASM.
3. **Graceful degradation** — Tier-2 worker dies mid-scan → finish on Tier 1 rather than fail. Low-tier device → Tier 2 never downloaded at all.
4. **Capability detection** — `requestVideoFrameCallback` → `timeupdate`; `OffscreenCanvas` → hidden canvas; File System Access → localStorage; CORS-readable URL → honest guidance to upload.

#### Why chain 2's ordering is load-bearing

Quantization is usually a clean trade: int8 weights are ~¼ the size of fp32 for a small accuracy cost. The trap is that **quantized operator support is per-backend, not universal** — and when it's missing the failure mode is not an exception. Running the int8 ViT on the WebGPU execution provider produced *silent numeric garbage*: safe frames scoring 0.99 nsfw, nothing logged anywhere.

What surfaced it was arithmetic, not a test. A swimwear clip returned 0.9926, which is **impossible** from Tier 1 — `sexy` is down-weighted by 0.4 and mathematically cannot reach the flag threshold alone — so the number had to originate in Tier 2. Re-running the identical model with identical quantization on CPU returned the correct answer, isolating the fault to the execution provider rather than the model or the label mapping.

Hence float weights on WebGPU, int8 reserved for WASM where it's both correct and the bandwidth win it was designed to be. **A silent numerical failure is more dangerous than a crash**, because only one of the two tells you.

### Device tiering

Static hints only *propose* a tier; a live 5-frame micro-benchmark on the actual hardware confirms it before anything large is downloaded. `navigator.deviceMemory` alone is unreliable — coarse, capped, and a phone can report four cores while thermally throttling.

| Tier | Signals | Sampling | Cascade | Bytes over the wire |
|---|---|---|---|---|
| **High** | WebGPU present, ≥8 GB, fast bench | 1 fps + densify | Tier 1 + Tier 2 on WebGPU | ~4 MB now, ViT lazily on first borderline frame |
| **Mid** | Anything not High or Low (no WebGPU, <8 GB, or bench >50 ms) | 1 fps + densify | Tier 1 + Tier 2 (WebGPU if present, else WASM), same 40-frame budget | ~4 MB now, ViT only if genuinely needed |
| **Low** | <4 GB, ≤2 cores, or bench >150 ms | 0.5 fps + densify | **Tier 1 only** | ~4 MB, total, ever |

One build serves low-end and high-end hardware alike, degrading accuracy gracefully instead of degrading responsiveness.

---

## The models

| | **Tier 1 — screener** | **Tier 2 — verifier** |
|---|---|---|
| Model | MobileNetV2 NSFW | ViT-base NSFW detector |
| Source | NSFWJS (open weights, **bundled in the npm package**) | `AdamCodd/vit-base-nsfw-detector` via Transformers.js |
| Parameters | ≈3.5 M | ≈86 M |
| Weights | ≈4 MB quantized | 84 MB int8 · 164 MB fp16 · 329 MB fp32 |
| Output | 5 classes: drawing · hentai · neutral · porn · sexy | 2 classes: sfw · nsfw |
| Runtime | TensorFlow.js — WebGL, WASM fallback | ONNX Runtime Web — WebGPU, WASM fallback, in a Web Worker |
| Network | **None.** Ships with the app, so it works offline from the first visit. | Fetched lazily on the first borderline frame, then persisted in the Cache API. Never fetched at all on a low-tier device. |

### Why this is the right pairing for mobile

- **The screener is small enough to be unconditional.** At ~4 MB and single-digit-to-low-tens of milliseconds per frame, it can run on every sampled frame of every device in the fleet, including hardware several years old. Because it's bundled rather than downloaded, there is no cold-start network dependency at all.
- **The verifier is only ever conditional.** It's fetched on demand, cached after once, and gated by device tier — so the accuracy ceiling rises on capable hardware without imposing an 84 MB download on a phone that can't use it.
- **Both are 224×224 image classifiers**, which is the shape mobile NPUs and Core ML / NNAPI accelerate best. The same weights port to ONNX Runtime Mobile without redesign — `apps/mobile` already demonstrates exactly that.
- **Quantization is the mobile lever**, and the cascade means it's applied where it pays: the big model is the one worth shrinking, and it's the one that isn't on the critical path.

### Offline and caching

1. **First visit** — app shell and the 4 MB screener arrive together. The screener is a bundled asset, not a fetch, so there's no separate model download and no cold-start network dependency.
2. **First borderline frame** — only now is the ViT requested, and only on mid/high tiers. A video that's obviously safe or obviously explicit never triggers it, so most scans cost zero extra bytes.
3. **Every visit after** — weights come from the Cache API and the shell from the service worker, so detection runs with the radio off. (The service worker deliberately never evicts the model bucket, so a shell-cache version bump can't cost you an 84 MB re-download.)

---

## Tradeoffs and alternatives considered

| Approach | Accuracy | Cost on low-end hardware | Verdict |
|---|---|---|---|
| **Single small model** | Weakest — confuses skin tone and swimwear more often | Best | Rejected as the only mode: accuracy ceiling too low for a safety product. Survives as the low-tier path, where it's the only honest option. |
| **Single large model** | Strong | Unacceptable — tens of MB to download, seconds per frame under WASM on old phones | Rejected: fails the low-end constraint outright. |
| **Parallel ensemble** | Strongest on paper | Worst — pays the large-model cost on 100% of frames | Rejected: roughly doubles compute for a marginal gain over the cascade, and contradicts the resource budget a mobile target imposes. |
| **Adaptive cascade** ✅ | Near-ensemble — the big model sees exactly the frames where it changes the outcome | Pays Tier-2 cost only on the borderline fraction | **Chosen.** Multi-model robustness at a fraction of multi-model cost, and it degrades by device tier instead of failing. |

**What the cascade costs (honest accounting):** two models to version and threshold-tune instead of one; a routing band that itself needs calibration; and a pathological video where most frames are borderline approaches ensemble cost — mitigated by the per-video escalation budget, after which Tier-1 verdicts apply.

**Other paths not taken:** a server-side proxy for CORS-blocked URLs (reintroduces the server the design exists to avoid); region-level blur instead of whole-frame (needs localization rather than classification — several times the compute, and a localization miss shows exactly the wrong pixels); scene-change-triggered sampling (a genuine improvement, listed under the production path rather than shipped).

---

## Responding to a detection

**Recommended default for a child audience: blur + pause + a calm replacement card, with adult-gated dismissal.** On a flag the frame blurs within one animation tick (GPU-composited CSS filter, effectively free), playback pauses, and a non-alarming card covers the stage with a press-and-hold parent gate to continue. No scary iconography, no flash of content, no dead end.

| Response | Experience | Technical cost | Verdict |
|---|---|---|---|
| **Blur** | Content instantly unreadable; screen doesn't appear broken | One GPU-composited CSS filter | Core of the default — but blur alone leaves audio playing, so combine with pause. |
| **Pause** | Stops progression immediately | Trivial | Necessary and insufficient: the flagged frame stays on screen. |
| **Hide player** | Strongest block | Trivial | Jarring for a child, destroys context. Kept as a strict-mode option. |
| **Replacement card** | Best for a child — explains calmly, offers a path | Trivial | Part of the default composite. |
| **Region blur** | Most graceful — rest of the scene stays watchable | Needs localization: several times the compute, and a miss shows the wrong pixels | Right long-term ambition, wrong V1 default for low-end hardware. |
| **Skip segment** | Video "just works" | Needs a pre-scan segment map (we have one) | Strong *second* mode once segment boundaries have earned trust; can silently remove context. |

All modes ship as switchable options so the difference is felt rather than argued.

**Two operating modes:** *Pre-scan* (analyse before playback — verdict and segment map up front, the high-assurance mode a parent wants, and the only one with genuinely zero exposure) and *Live guard* (score during playback via `requestVideoFrameCallback`, the way a browser engine would actually run it).

**The parent gate is scoped to one detection, deliberately.** Approving a flagged moment must not disarm the guard for the rest of the video, so the override expires with the episode that prompted it and the next detection gates again.

---

## The API

There are no HTTP endpoints. The product's API is one function:

```ts
import { runDetection } from "@/features/detection";

const result = await runDetection(videoElement, config, deps, callbacks, signal);
```

- `config` — `DetectionConfig` (thresholds, sampling rate, cascade budget, fusion weight, response/run mode). Zod-validated; all fields have documented defaults.
- `deps` — the Tier-1 adapter, optional Tier-2 worker client (`null` on low-tier devices), and resolved device tier.
- `callbacks` — `onProgress` (phase, throughput, current timestamp) and `onFrame` (per-frame score for live UIs).
- `signal` — an `AbortSignal`; cancellation is instant.

It resolves to a `DetectionResult`, validated against the shared Zod schema. `contains_inappropriate_content` and `confidence` are the core verdict; every other field adds detail:

```jsonc
{
  "contains_inappropriate_content": true,   // core verdict
  "confidence": 0.87,                       // core verdict — 0–1
  "categories": { "porn": 0.91, "hentai": 0.03, "sexy": 0.44, "neutral": 0.96, "drawing": 0.02 },
  "flagged_segments": [                     // timestamped, so the player can act on them
    { "start_s": 34.0, "end_s": 41.5, "peak_score": 0.91, "dominant_category": "porn" }
  ],
  "frames_analyzed": 78,
  "video_duration_s": 63.2,
  "processing": { "total_ms": 5410, "avg_frame_latency_ms": 38, "p95_frame_latency_ms": 71, "sampling_fps": 1, "tier2_escalations": 6 },
  "engine": { "tier1_model": "mobilenet-v2-nsfw@quant", "tier2_model": "vit-nsfw-int8", "backend": "webgpu", "device_tier": "high" }
}
```

The shape is defined once as a Zod schema in shared code, and the UI, the mobile app and the extension all derive from it — the payload physically cannot drift between platforms.

## Deliberate Design Decisions

- **No TanStack Query / Redux.** There is no server state anywhere in this product; the processing lifecycle is a local reducer state machine (`useDetectionEngine`). A server-cache library would be cargo culting.
- **No auth / roles.** Nothing to protect: no accounts, no data leaves the device, no server exists.
- **No chart library.** The score timeline is hand-rolled SVG; a charting dependency would dominate the bundle for one component.
- **Tier 1 is bundled, not fetched.** The baseline detector requires zero network, ever.
- **CORS failures are surfaced, not proxied.** A proxy would silently reintroduce the server the whole design exists to avoid.
- **No test media in the repo.** Detection quality is verified against local test sets that are never committed.

## Measured performance

Recorded from real hardware only. The in-app benchmark panel reports live measurements per scan and renders `—` for anything unmeasured. No cross-device figures are published yet; they will be added only once measured on real devices.

Method: run the same clips through a pre-scan with default settings on each device and read the values from the benchmark panel, which measures them in-process (`performance.now()` per frame, `PerformanceObserver` for long tasks, `performance.memory` where available).

## Limitations and edge cases

- **CORS-restricted URLs** can't be analysed client-side, by design — no server proxy. File upload always works, and an in-engine deployment doesn't have the problem.
- **DRM / EME streams** yield no readable frames to canvas. No client-side detector can inspect them; the extension detects the all-black case and reports it rather than declaring everything safe.
- **Scope is sexual content** — not violence, gore or drug imagery. Category expansion is an additional classifier head on the same pipeline, not a redesign.
- **Sampling can miss sub-second flashes** between samples. Densification narrows the window but doesn't close it; cheap scene-change detection is the production mitigation.
- **Skin-heavy safe content** (beaches, swimwear, medical) is the hardest negative. The `sexy` down-weighting and the verifier both push against it; a real product needs curated threshold profiles per age band.
- **The live guard is Tier-1 only**, deliberately trading accuracy for latency, so it's more false-positive-prone than a pre-scan. Pre-scan is the higher-assurance path.
- **Audio is not analysed** at all, and there is **no temporal model** — frames are judged independently, so a sequence that is only inappropriate in context reads as innocent frames.
- **Thresholds are reasoned, not fitted.** They follow from the score arithmetic and real test clips, but there is no labelled evaluation set, so this project cannot quote a precision/recall figure. That is the largest honest gap, and the replay harness exists so it can be closed with data rather than guesswork.
- **Sustained processing on older hardware throttles thermally**, which is why the low tier samples at half rate rather than trying to keep up.

## Path to production on mobile

1. **Same architecture, native runtimes.** The pipeline (sample → preprocess → cascade → aggregate) ports as-is; inference moves to ONNX Runtime Mobile / Core ML / NNAPI for a large throughput and battery improvement. `apps/mobile` already demonstrates this with on-device ONNX inference and no network access.
2. **Evaluation before further tuning.** A labelled eval set with precision/recall curves per age band. This is the first thing to build, and it's what would turn the current reasoned thresholds into fitted ones.
3. **Model work.** Distil the verifier toward MobileViT / EfficientNet-Lite scale so mid-tier devices can afford it; add violence and gore heads.
4. **Engine integration.** In a kids browser, detection hooks the render pipeline rather than a page — no CORS constraints, no `<video>` gymnastics, every media surface scored uniformly. `apps/extension` is a working proof of this step.
5. **Temporal modelling** over frame embeddings, so context across frames counts.
6. **WebCodecs** in place of seek-based sampling, for a faster and more predictable decode path; and WebNN / NPU delegation as it lands.

---

## Mobile app

The Expo app runs the same `packages/core` pipeline with **native on-device ONNX inference** (quantized ViT bundled as an asset). It works in airplane mode.

> ⚠️ Native module (`onnxruntime-react-native`) — **Expo Go will not work.** Use a dev build or the APK flow below.

```bash
cd apps/mobile

# Cloud build — no Android SDK needed. The model binary is fetched on the
# build server by the eas-build-post-install hook, so nothing large is
# committed or uploaded.
npx eas-cli build --platform android --profile preview

# — or entirely locally (needs Android SDK + JDK 17) —
pnpm --filter @safeframe/mobile download-model     # one-time, ~84 MB
npx expo prebuild --platform android && cd android && ./gradlew assembleRelease
# APK → android/app/build/outputs/apk/release/app-release.apk
```

Install: download the APK from the EAS build page (or copy the local one across) and open it, allowing "install unknown apps" — or `adb install app-release.apk`.

For hot-reload development against the native module, build the `development` profile once (`npx eas-cli build --platform android --profile development`), install it, then run `pnpm --filter @safeframe/mobile start`.

Mobile-specific tradeoffs: pre-scan only (no live guard), the platform thumbnailer is slower per frame than the browser's seek path, and the APK is large because the model ships inside it — production would fetch and cache on first run. Device tier comes from a live micro-benchmark of the actual model, since React Native has no `navigator` hints to consult.

## Browser extension

Asking a user to upload a file is a demo affordance. The product shape is *guard whatever is already playing* — which is what `apps/extension` does: a Manifest V3 content script that finds every `<video>` in the top-level page of any http(s) site (players under 160 px are skipped), samples it, and blurs + pauses + explains on a detection. Same `@safeframe/core`, third consumer, unchanged.

```bash
pnpm --filter @safeframe/extension build     # → apps/extension/dist
```

Then in Chrome or Edge: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `apps/extension/dist`. Open any page with a video; the guard attaches automatically and shows a status chip on the player.

**Design notes**

- Inference runs in a **hidden extension-page iframe**, not an MV3 offscreen document. Offscreen documents are reached via `chrome.runtime` messaging, which is **JSON-serialized** — a 224×224×4 pixel buffer would become a ~200 000-element JSON array per sampled frame. `postMessage` to an iframe uses structured clone, so the `ArrayBuffer` transfers zero-copy. The iframe also inherits the *extension's* CSP (`'wasm-unsafe-eval'`), so the ML runtime loads on sites whose own CSP would refuse it.
- The build drops NSFWJS's unused Inception-V3 and MobileNetV2-Mid weights, which IIFE bundling would otherwise inline: **39 MB → 4.5 MB**. The content script deep-imports core's pure modules to keep Zod out of a script injected on every page: **330 KB → ~11 KB**.
- One inference frame per tab, not per iframe. Injecting into every frame meant each grabbing its own WebGL context, and browsers cap those at roughly 16 per process — which a heavy host page can exhaust on its own.

**Honest limits**

| Limit | Detail |
|---|---|
| Reactive, not preemptive | A detection lands within one ~400 ms sample interval, so a flagged frame is briefly visible. Zero exposure needs a full-file pre-scan, which streaming does not allow. This is the central tradeoff of guarding live playback. |
| DRM / EME video | Reads back as black frames by design — no client-side detector can inspect it. The guard reports the case rather than reporting everything safe. |
| Chrome for Android | No extension support at all. Firefox Android and Safari iOS (via an app wrapper) do support Web Extensions. |

**The real conclusion:** a kids-safety browser *is* the WebView host. This logic belongs in the browser shell as a native content-guard module — no CORS constraints, no extension APIs to work around, uniform coverage of every media surface. The extension's value is proving the core is portable enough to live there.

---

## CORS-readable test URLs

Client-side frame analysis needs `Access-Control-Allow-Origin` on the media response itself, or `canvas.getImageData()` throws. Each URL below was verified with a ranged `GET` returning HTTP 206 **and** `access-control-allow-origin: *` on the actual bytes. All are freely licensed Wikimedia Commons files served as 480p VP9/WebM.

**Animation / cartoon — hard negatives (should come back clean)**
```
https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm/Caminandes_3_-_Llamigos_-_Blender_Animated_Short.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/a/a2/Elephants_Dream_(2006).webm/Elephants_Dream_(2006).webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/6/64/Sintel_excerpt.ogv
```

**Scenery — clean baseline** (Toronto Skyline is 7 s: the fastest smoke test)
```
https://upload.wikimedia.org/wikipedia/commons/transcoded/9/94/Toronto_Skyline.webm/Toronto_Skyline.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f9/Staircase_Falls_timelapse_Yosemite_CA_2023-07-13_07-23-07_1.webm/Staircase_Falls_timelapse_Yosemite_CA_2023-07-13_07-23-07_1.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f5/Aerial_views_of_New_Orleans.webm/Aerial_views_of_New_Orleans.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/7/75/Relaxing_Drone_Flight_Over_Delaware_in_4K_60fps_-_DJI_Mini_4_Pro.webm/Relaxing_Drone_Flight_Over_Delaware_in_4K_60fps_-_DJI_Mini_4_Pro.webm.480p.vp9.webm
```

**People / talking head — clean, with faces and skin**
```
https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f9/Tarun_speaking_01.webm/Tarun_speaking_01.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/4/49/Wikipedia_20_-_Jimmy.webm/Wikipedia_20_-_Jimmy.webm.480p.vp9.webm
```

**Dance / performance — the genuinely borderline category.** Skin, motion and costume: where Tier-1 escalates to Tier-2 and where the ×0.4 down-weight earns its keep. Expect elevated `sexy`, escalations climbing in the benchmark panel, and **no flag** at default thresholds.
```
https://upload.wikimedia.org/wikipedia/commons/transcoded/0/01/Tanjavur_Dance_01.webm/Tanjavur_Dance_01.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/9/9d/Bharatanatyam_at_Sri_Raghavendra_Swamy_Mutt%2C_RR_Nagar_(2024)_03.webm/Bharatanatyam_at_Sri_Raghavendra_Swamy_Mutt%2C_RR_Nagar_(2024)_03.webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/f/fc/Princess_Rajah_dance_-_Louisiana_Purchase_Exposition_(1904).webm/Princess_Rajah_dance_-_Louisiana_Purchase_Exposition_(1904).webm.480p.vp9.webm
https://upload.wikimedia.org/wikipedia/commons/transcoded/7/7c/David_Dawson's_new_ballet_rehearsal_of_Timelapse_(Mnemosyne)_at_Dutch_National_Ballet.webm/David_Dawson's_new_ballet_rehearsal_of_Timelapse_(Mnemosyne)_at_Dutch_National_Ballet.webm.480p.vp9.webm
```

**Long-form — throughput and budget behaviour** (14:48)
```
https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f1/Sintel_movie_4K.webm/Sintel_movie_4K.webm.480p.vp9.webm
```

To see the CORS explainer, paste an ordinary web *page* URL rather than a direct media file. Note that `upload.wikimedia.org` rate-limits aggressive automated access (HTTP 429) while still returning `ACAO: *`, so throttling shouldn't be mistaken for a CORS failure.

---

## License

Model weights retain their upstream licenses (NSFWJS / `AdamCodd/vit-base-nsfw-detector`). Test media is never committed to this repository.
