"use client";

import { useId, useState } from "react";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";

export function UrlIngest({ onUrl }: { onUrl: (url: string) => void }) {
  const [value, setValue] = useState("");
  const hintId = useId();

  const submit = () => {
    let parsed: URL;
    try {
      parsed = new URL(value.trim());
    } catch {
      toast.error("That isn't a valid URL.");
      return;
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      toast.error("Only http(s) video URLs are supported.");
      return;
    }
    onUrl(parsed.toString());
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="url"
            inputMode="url"
            aria-label="Video URL"
            aria-describedby={hintId}
            placeholder="https://example.com/video.mp4"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="min-h-11 w-full rounded-xl border border-border bg-surface py-2 pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          />
        </div>
        <Button variant="outline" onClick={submit} disabled={!value.trim()}>
          Analyze
        </Button>
      </div>
      <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
        Direct video-file URLs only. The host must allow cross-origin reads —
        if it doesn&apos;t, we&apos;ll tell you honestly instead of quietly proxying
        through a server (there is no server).
      </p>
    </div>
  );
}
