import Link from "next/link";
import {
  ArrowRight,
  Braces,
  Cpu,
  EyeOff,
  Film,
  Gauge,
  Layers,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

const PIPELINE = [
  {
    icon: Film,
    title: "Sample",
    body: "Seek-based frame extraction at ~1 fps, densifying around anything suspicious — a 10-minute video means hundreds of frames, not eighteen thousand.",
  },
  {
    icon: Layers,
    title: "Classify",
    body: "A 4 MB MobileNet screens every frame; only borderline frames escalate to a quantized ViT running in a Web Worker. Big-model accuracy, small-model cost.",
  },
  {
    icon: Gauge,
    title: "Aggregate",
    body: "Scores flow through a smoothed sliding window with hysteresis, producing flagged segments with timestamps — not just a yes/no.",
  },
  {
    icon: EyeOff,
    title: "Respond",
    body: "On a flag: instant blur, pause, and a calm replacement card with a parent gate. Five response modes, all switchable live.",
  },
];

export function Landing() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" />
          </span>
          <p className="text-sm font-semibold tracking-tight text-foreground">
            SafeFrame
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/architecture"
            className="hidden min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Architecture
          </Link>
          <Link
            href="/detect"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Open the tool <ArrowRight className="size-4" />
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="py-16 text-center sm:py-24">
          <div className="mx-auto max-w-2xl space-y-6">
            <Badge className="mx-auto">
              <WifiOff className="size-3" /> No server · no uploads · works offline
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
              Video safety that never leaves the device
            </h1>
            <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
              SafeFrame detects inappropriate video content with a two-tier ML
              cascade running entirely in your browser — from low-end phones to
              high-end desktops. Because a kids-safety product should never ship
              a child&apos;s screen to a server.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href="/detect"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Try it on a video <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/architecture"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-6 text-sm font-semibold text-foreground transition-colors hover:border-border-strong"
              >
                How it works
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-3 py-1">Two-tier ML cascade</span>
              <span className="rounded-full border border-border px-3 py-1">Installable PWA · offline after first visit</span>
              <span className="rounded-full border border-border px-3 py-1">Timestamped segment map</span>
              <span className="rounded-full border border-border px-3 py-1">Low-end to high-end devices</span>
            </div>
          </div>
        </section>

        {/* Pipeline */}
        <section id="how" className="scroll-mt-6 py-12">
          <h2
            className="reveal mb-8 text-center text-2xl font-semibold tracking-tight text-foreground"
          >
            How it works
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PIPELINE.map((step, i) => (
              <div key={step.title} className="reveal">
                <Card className="h-full space-y-3 p-5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-chart-area text-primary">
                    <step.icon className="size-5" />
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    <span className="mr-2 text-muted-foreground">{i + 1}</span>
                    {step.title}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </Card>
              </div>
            ))}
          </div>
        </section>

        {/* The models */}
        <section className="py-12">
          <h2
            className="reveal mb-2 text-center text-2xl font-semibold tracking-tight text-foreground"
          >
            The models doing the work
          </h2>
          <p
            className="reveal mx-auto mb-8 max-w-xl text-center text-sm leading-relaxed text-muted-foreground"
          >
            Two open image classifiers, downloaded once and run by your own
            browser — never on a server. The small one screens everything; the
            big one is only consulted when the small one isn&apos;t sure.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="reveal">
              <Card className="h-full space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    Tier 1 · MobileNetV2
                  </p>
                  <Badge>screens every frame</Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  A ~3.5M-parameter convolutional network (NSFWJS build),
                  trained to score frames across five classes: porn, hentai,
                  sexy, neutral, drawing. Ships inside the app — about 4 MB,
                  zero download, works offline from the first visit.
                </p>
                <p className="text-xs text-muted-foreground/80">
                  Runtime: TensorFlow.js · WebGL with WASM fallback
                </p>
              </Card>
            </div>
            <div className="reveal">
              <Card className="h-full space-y-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    Tier 2 · Vision Transformer
                  </p>
                  <Badge>verifies borderline frames</Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  An ~86M-parameter ViT-base NSFW detector (AdamCodd, open
                  weights) — roughly 25× larger, consulted only on frames the
                  screener can&apos;t call confidently, up to 40 per video.
                  Fetched once on capable devices, then cached; low-end devices
                  never download it at all.
                </p>
                <p className="text-xs text-muted-foreground">
                  Runtime: Transformers.js / ONNX · WebGPU with WASM fallback ·
                  runs in a Web Worker
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* Privacy story */}
        <section className="py-12">
          <div className="reveal">
            <Card className="space-y-4 p-6 sm:p-8">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                The privacy story is the architecture
              </h2>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                There is no backend in this product — not a small one, none. No
                database, no API routes, no telemetry. Model weights are cached
                by your browser so the second visit works fully offline. The
                honest consequence: some cross-origin URLs can&apos;t be analyzed,
                and we tell you so instead of quietly routing your video
                through a proxy.
              </p>
              <div className="grid gap-3 pt-2 sm:grid-cols-3">
                <div className="flex items-center gap-2.5 text-sm text-foreground">
                  <Cpu className="size-4 shrink-0 text-accent" /> All inference on-device
                </div>
                <div className="flex items-center gap-2.5 text-sm text-foreground">
                  <Braces className="size-4 shrink-0 text-accent" /> Schema-validated verdict JSON
                </div>
                <div className="flex items-center gap-2.5 text-sm text-foreground">
                  <Smartphone className="size-4 shrink-0 text-accent" /> Scales from low-end to high-end devices
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 text-center">
          <div className="reveal space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              See it work on your own video
            </h2>
            <p className="text-sm text-muted-foreground">
              Pre-scan for a full segment map, or turn on live guard and watch
              it react in real time.
            </p>
            <Link
              href="/detect"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            >
              Open SafeFrame <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        SafeFrame — a client-side detection prototype. Your video never leaves
        this device.
      </footer>
    </div>
  );
}
