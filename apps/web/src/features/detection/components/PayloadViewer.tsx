"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Download } from "lucide-react";
import { toast } from "sonner";
import type { DetectionResult } from "@safeframe/core";
import { Card } from "@/components/ui";

export function PayloadViewer({ result }: { result: DetectionResult }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(true);
  const json = useMemo(() => JSON.stringify(result, jsonRound, 2), [result]);
  const highlighted = useMemo(() => highlightJson(json), [json]);

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safeframe-result-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 items-center gap-1.5 rounded-lg text-xs font-medium tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown
            className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          Result payload
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Download payload JSON"
            onClick={download}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Download className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Copy payload JSON"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(json);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                toast.error("Clipboard unavailable in this context.");
              }
            }}
            className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            {copied ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {open && (
        <pre
          tabIndex={0}
          aria-label="Verdict payload JSON"
          className="max-h-80 overflow-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground"
        >
          {highlighted}
        </pre>
      )}
    </Card>
  );
}

/** Trim float noise for display/copy — the in-memory result keeps full precision. */
function jsonRound(_key: string, value: unknown): unknown {
  return typeof value === "number" && !Number.isInteger(value)
    ? Number(value.toFixed(4))
    : value;
}

const TOKEN =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)|(true|false|null)/g;

/**
 * ~20-line JSON syntax tint using semantic tokens — a highlighting library
 * would be a dependency for one <pre> block.
 */
function highlightJson(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of json.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(json.slice(last, idx));
    const [full = "", str, colon, num, kw] = m;
    if (str !== undefined) {
      out.push(
        <span key={key++} className={colon ? "text-primary" : "text-success"}>
          {str}
        </span>,
      );
      if (colon) out.push(colon);
    } else if (num !== undefined) {
      out.push(
        <span key={key++} className="text-accent">
          {num}
        </span>,
      );
    } else if (kw !== undefined) {
      out.push(
        <span key={key++} className="font-semibold text-warning">
          {kw}
        </span>,
      );
    } else {
      out.push(full);
    }
    last = idx + full.length;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}
