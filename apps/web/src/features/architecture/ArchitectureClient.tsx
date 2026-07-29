"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, ScanEye, ShieldCheck } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  CascadeDecision,
  ComparisonTable,
  DeviceTiers,
  FallbackChains,
  ModelCards,
  OfflineStory,
  PipelineFlow,
} from "./components/Diagrams";
import { ScoringPlayground } from "./components/ScoringPlayground";

interface SectionDef {
  id: string;
  title: string;
}

const SECTIONS: SectionDef[] = [
  { id: "problem", title: "The problem" },
  { id: "approach", title: "Why classifiers, not LLMs" },
  { id: "pipeline", title: "Pipeline" },
  { id: "cascade", title: "The two-tier cascade" },
  { id: "fallbacks", title: "Fallback chains" },
  { id: "scoring", title: "Scoring & decisions" },
  { id: "devices", title: "Device tiering" },
  { id: "models", title: "The models" },
  { id: "offline", title: "Offline & caching" },
  { id: "alternatives", title: "Alternatives considered" },
  { id: "response", title: "Responding to a detection" },
  { id: "production", title: "Path to production" },
  { id: "limits", title: "Known limitations" },
];

export function ArchitectureClient() {
  const [active, setActive] = useState(SECTIONS[0]!.id);

  // Highlight the section currently in view so the nav doubles as a progress
  // indicator while walking through the page on a call.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <Link
          href="/"
          aria-label="SafeFrame home"
          className="group flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-105">
            <ShieldCheck className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold tracking-tight text-foreground">
              SafeFrame
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Architecture
            </span>
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/detect"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:border-border-strong"
          >
            <ScanEye className="size-4" /> Open the detector
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-3xl space-y-3 py-6"
      >
        <Badge>
          <ArrowLeft className="size-3" /> Design document
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          How SafeFrame decides
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          A video goes in; a verdict comes out; nothing leaves the device. This
          page is the reasoning behind that sentence — the pipeline, the two
          models and why those two, the fallback chains that keep a scan alive
          when something fails, and the tradeoffs taken on purpose. Everything
          described here is running in the tab you are reading it in.
        </p>
      </motion.div>

      <div className="grid gap-8 pb-16 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav
          aria-label="Sections"
          className="top-6 hidden h-fit lg:sticky lg:block"
        >
          <ol className="space-y-0.5 border-l border-border">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`-ml-px flex items-baseline gap-2 border-l-2 py-1.5 pl-3 text-xs transition-colors ${
                    active === s.id
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="tabular-nums opacity-50">{i + 1}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-10">
          <Section id="problem" title="The problem">
            <P>
              Accept a video by upload or URL, decide whether it contains
              inappropriate visual content, and return a verdict with a
              confidence. The governing constraint is that all of it runs in the
              browser: no inference API, no server-side processing, no telemetry.
              The production target is a mobile browser on hardware that may be
              several years old.
            </P>
            <P>
              That constraint is the product, not an obstacle. A kids-safety
              browser cannot ship children&apos;s screen content to a server — it
              fails on privacy, on legal exposure, on offline reliability, on
              latency, and on per-user cost. So the architecture treats
              &ldquo;no backend&rdquo; as a property to prove rather than a
              limitation to route around. There is no database and no server
              component anywhere in this system. The only things persisted are
              model weights in the Cache API and preferences in localStorage,
              both on the user&apos;s own machine.
            </P>
            <Callout>
              A useful test of the claim: put the device in airplane mode after
              the first visit and scan a local file. It still works, because
              there was never anything on the other end of a wire to call.
            </Callout>
          </Section>

          <Section id="approach" title="Why image classifiers, not a vision LLM">
            <P>
              Deciding whether a frame contains nudity is an image-classification
              problem, and it has purpose-built open models measured in
              megabytes. A multimodal LLM can also answer the question, but the
              smallest usable vision-language models are hundreds of megabytes to
              gigabytes, take seconds per frame on a phone, and drain a battery
              doing it. Against the constraints that actually matter here — compute,
              memory, battery, device variability — they lose on every one.
            </P>
            <P>
              There is a second, quieter reason. A classifier returns a
              calibrated probability per class, which is what makes smoothing,
              hysteresis, thresholds and a tunable precision/recall posture
              possible. A generative model returns text you then have to parse
              and cannot easily calibrate. For a safety decision that a parent
              may need to adjust, the numeric output is the more honest interface.
            </P>
          </Section>

          <Section id="pipeline" title="The pipeline">
            <P>
              Six stages, each chosen so the expensive work happens as rarely and
              as cheaply as possible.
            </P>
            <PipelineFlow />
            <div className="space-y-3 pt-1">
              <Detail label="Sampling">
                A hidden video element is seeked programmatically rather than
                played, which runs faster than real time and decodes no audio.
                Baseline is one frame per second; when a frame lands in the
                uncertain band the sampler densifies locally — the surrounding
                couple of seconds at 2 fps — so a short flash next to a hit is not
                missed. Ten minutes of video becomes a few hundred classified
                frames instead of eighteen thousand.
              </Detail>
              <Detail label="Preprocess">
                Every frame is drawn down to 224×224 before any model sees it,
                because that is the models&apos; native input size. This is the
                single largest performance win in the system: classifying a
                native-resolution frame would cost orders of magnitude more for
                no accuracy gain whatsoever.
              </Detail>
              <Detail label="Threading">
                Tier-2 inference runs in a Web Worker, so the heavy path never
                blocks the main thread. The sampling loop yields to the event loop
                between frames, which is why progress, the timeline and the cancel
                button stay responsive for the whole scan — the benchmark panel
                counts long tasks over 50 ms so that claim is measured rather than
                asserted.
              </Detail>
            </div>
          </Section>

          <Section id="cascade" title="The two-tier cascade">
            <P>
              Every sampled frame is scored by the cheap model. That score routes
              the frame into one of three bands, and only the middle band costs
              anything more.
            </P>
            <CascadeDecision />
            <Callout tone="danger">
              <strong className="font-semibold">
                One rule earned the hard way:
              </strong>{" "}
              Tier 2 arbitrates, it does not overwrite. An earlier build simply
              replaced the screener&apos;s score with the verifier&apos;s, which
              handed the verifier a unilateral veto — and videos containing real
              explicit footage started coming back clean, because their frames
              happened to fall inside the escalation band. The scores are now
              blended, with a floor at the screener&apos;s explicit-class score:
              the verifier may overrule &ldquo;this looks suggestive&rdquo;, but it
              may not overrule &ldquo;this is explicit&rdquo;.
            </Callout>
          </Section>

          <Section id="fallbacks" title="Fallback chains">
            <P>
              Nothing in this system has a single point of failure. Four
              independent chains degrade rather than break, and all four are in
              the shipped code rather than in a plan for later.
            </P>
            <FallbackChains />
          </Section>

          <Section id="scoring" title="Scoring and the decision layer">
            <P>
              A per-frame score is combined from the classifier&apos;s classes as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                p = clamp(porn + hentai + sexy × 0.4)
              </code>
              . The ×0.4 weight is a deliberate policy choice, not a tuning
              artefact: it makes it arithmetically impossible for swimwear alone
              to flag a video at default thresholds, which is the single most
              common false positive in this domain.
            </P>
            <P>
              Frame scores then feed two independent decision paths. An
              EWMA-smoothed series with hysteresis draws segment boundaries — it
              ignores single-frame spikes, which is exactly what you want for
              deciding <em>where</em> content starts and stops. But smoothing also
              damps short events, so a second pass looks at the raw series and
              treats a sustained run of over-threshold frames as evidence in its
              own right. Either path can flag a video; both produce segments, so
              the verdict and the timeline can never disagree on screen.
            </P>
            <Card className="p-4">
              <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Try it — this widget runs the shipped aggregator
              </p>
              <ScoringPlayground />
            </Card>
          </Section>

          <Section id="devices" title="Device tiering">
            <P>
              The same build serves a low-end phone and a high-end desktop. It
              does that by deciding, before it downloads anything large, what this
              particular device can actually sustain.
            </P>
            <DeviceTiers />
          </Section>

          <Section id="models" title="The models">
            <P>
              Two open models, chosen for complementary reasons: one small enough
              to run on everything, one accurate enough to be worth asking when
              the first is unsure.
            </P>
            <ModelCards />
            <Callout>
              <strong className="font-semibold">On quantization:</strong>{" "}
              int8 weights are roughly a quarter the size of fp32 for a small
              accuracy cost, which is normally an easy trade on a mobile network.
              The caveat is that quantized operators are not equally supported
              across execution providers — see the execution-provider chain above
              for what that cost us in practice.
            </Callout>
          </Section>

          <Section id="offline" title="Offline behaviour and caching">
            <P>
              Model weights are the only meaningful bytes this app moves, so where
              and when they move is a design decision rather than an
              implementation detail.
            </P>
            <OfflineStory />
          </Section>

          <Section id="alternatives" title="Alternatives considered">
            <P>
              The cascade is the load-bearing decision, so here is what it was
              chosen over and why.
            </P>
            <ComparisonTable
              headers={["Approach", "Accuracy", "Cost on low-end hardware", "Verdict"]}
              rows={[
                {
                  cells: [
                    "Single small model",
                    "Weakest — confuses skin tone and swimwear more often",
                    "Best",
                    "Rejected as the only mode; the accuracy ceiling is too low for a safety product. It survives as the low-tier path, where it is the only honest option.",
                  ],
                },
                {
                  cells: [
                    "Single large model",
                    "Strong",
                    "Unacceptable — tens of MB to download and seconds per frame under WASM on old phones",
                    "Rejected: fails the low-end constraint outright.",
                  ],
                },
                {
                  cells: [
                    "Parallel ensemble",
                    "Strongest on paper",
                    "Worst — pays the large-model cost on every single frame",
                    "Rejected: roughly doubles compute for a marginal gain over the cascade, and directly contradicts the resource budget a mobile target imposes.",
                  ],
                },
                {
                  cells: [
                    "Adaptive cascade",
                    "Near-ensemble — the big model sees exactly the frames where it changes the answer",
                    "Pays the Tier-2 cost only on the borderline fraction",
                    "Chosen. Multi-model robustness at a fraction of multi-model cost, and it degrades by device tier instead of failing.",
                  ],
                  chosen: true,
                },
              ]}
            />
            <Callout tone="warning">
              <strong className="font-semibold">What the cascade costs:</strong>{" "}
              two models to version and tune instead of one; a routing band that
              itself needs calibration; and a pathological video where most frames
              are borderline approaches ensemble cost — which is why there is a
              per-video escalation budget, after which Tier-1 verdicts apply.
            </Callout>
          </Section>

          <Section id="response" title="Responding to a detection">
            <P>
              Detection is only half the problem. The recommended default for
              a child audience is a composite response: blur the frame within one
              animation tick, pause playback, and cover the stage with a calm
              replacement card that offers an adult-gated way to continue. Blur
              alone leaves audio playing. Pause alone leaves the offending frame
              on screen. Hiding the player entirely reads as breakage to a child.
              The combination is what avoids all three failures.
            </P>
            <ComparisonTable
              headers={["Response", "Experience", "Technical cost", "Verdict"]}
              rows={[
                {
                  cells: [
                    "Blur",
                    "Content instantly unreadable; the screen does not appear broken",
                    "One GPU-composited CSS filter",
                    "Core of the default, but combine with pause — audio keeps playing otherwise.",
                  ],
                },
                {
                  cells: [
                    "Pause",
                    "Stops progression immediately",
                    "Trivial",
                    "Necessary and insufficient: the flagged frame stays visible.",
                  ],
                },
                {
                  cells: [
                    "Hide the player",
                    "Strongest block, but jarring and context-destroying",
                    "Trivial",
                    "Kept as a strict-mode option.",
                  ],
                },
                {
                  cells: [
                    "Replacement card",
                    "Best for a child — explains calmly and offers a path forward",
                    "Trivial",
                    "Part of the default composite.",
                  ],
                },
                {
                  cells: [
                    "Region blur",
                    "Most graceful — the rest of the scene stays watchable",
                    "Needs localization, not classification: several times the compute, and a miss shows exactly the wrong pixels",
                    "The right long-term ambition, the wrong default for low-end hardware. Roadmap, not shipped.",
                  ],
                },
                {
                  cells: [
                    "Skip the segment",
                    "The video 'just works'",
                    "Needs a pre-scan segment map, which we have",
                    "A strong second mode once segment boundaries have earned trust; it can silently remove context.",
                  ],
                },
              ]}
            />
            <Callout>
              The parent gate is scoped to one detection, deliberately. Approving
              a flagged moment must not disarm the guard for the rest of the
              video, so the override expires with the episode that prompted it and
              the next detection gates again.
            </Callout>
          </Section>

          <Section id="production" title="Path to production on mobile">
            <P>
              The pipeline ports as-is; what changes underneath it is the runtime.
              Inference moves to ONNX Runtime Mobile, Core ML or NNAPI for a large
              throughput and battery improvement — the Expo app in this repo
              already demonstrates that path with on-device ONNX inference and no
              network access at all.
            </P>
            <P>
              Beyond the runtime: distil the verifier toward MobileViT or
              EfficientNet-Lite scale so mid-tier devices can afford it, add heads
              for violence and gore, and curate a labelled evaluation set so
              thresholds can be set per age band from measured
              precision/recall rather than judgement. And in a kids browser, the
              detector belongs in the engine rather than in a page: hooking the
              render pipeline removes the CORS problem entirely and scores every
              media surface uniformly.
            </P>
          </Section>

          <Section id="limits" title="Known limitations">
            <ul className="space-y-2">
              {[
                "URLs whose host sends no CORS headers cannot be analyzed client-side. A proxy would fix it and would also break the central promise, so the app explains the situation instead. File upload always works, and an in-engine deployment does not have the problem at all.",
                "DRM and encrypted-media streams are out of reach for any client-side approach — the decoder deliberately yields no readable frames.",
                "Scope is sexual content. Violence, gore and drug imagery are not detected; that is an additional classifier head on the same pipeline, not a redesign.",
                "Sampling can miss a sub-second flash between samples. Densification narrows the window but does not close it; cheap scene-change detection is the production mitigation.",
                "Skin-heavy but safe content — beaches, swimwear, medical footage — remains the hardest negative. The ×0.4 weighting and the verifier both push against it, and a real product needs curated thresholds per age band.",
                "The live guard is Tier-1 only, by design: it favours latency over accuracy, so it is more prone to false positives than a pre-scan. A pre-scan is the higher-assurance path.",
                "Audio is not analyzed at all.",
                "Sustained processing on older hardware throttles thermally, which is why the low tier samples at half rate rather than trying to keep up.",
              ].map((item) => (
                <li
                  key={item}
                  className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground"
                >
                  <span
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong"
                    aria-hidden
                  />
                  {item}
                </li>
              ))}
            </ul>
          </Section>

          <div className="rounded-card border border-border bg-surface p-5 text-center">
            <p className="text-sm text-muted-foreground">
              Everything on this page is running locally right now.
            </p>
            <Link
              href="/detect"
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <ScanEye className="size-4" /> Scan a video
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Local presentational helpers ────────────────────────────────────── */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function Callout({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "bg-muted text-muted-foreground",
    warning: "bg-warning-soft text-foreground/80",
    danger: "bg-danger-soft text-foreground/80",
  }[tone];
  return (
    <div className={`rounded-xl p-4 text-sm leading-relaxed ${toneClass}`}>
      {children}
    </div>
  );
}
