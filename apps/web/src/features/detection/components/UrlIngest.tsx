"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui";

export function UrlIngest({ onUrl }: { onUrl: (url: string) => void }) {
  const [value, setValue] = useState("");

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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.06 }}
      className="space-y-3"
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="url"
            inputMode="url"
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
      <p className="text-xs leading-relaxed text-muted-foreground">
        Direct video-file URLs only. The host must allow cross-origin reads —
        if it doesn&apos;t, we&apos;ll tell you honestly instead of quietly proxying
        through a server (there is no server).
      </p>
    </motion.div>
  );
}
