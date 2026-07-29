"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FileVideo, Upload } from "lucide-react";
import { toast } from "sonner";

const ACCEPTED = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];

export function UploadDropzone({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        toast.error("That doesn't look like a video file.");
        return;
      }
      if (!ACCEPTED.includes(file.type)) {
        toast.warning(
          `“${file.type}” may not decode in this browser — trying anyway.`,
        );
      }
      onFile(file);
    },
    [onFile],
  );

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files[0]);
      }}
      className={`group flex min-h-56 w-full flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed p-8 text-center transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
        dragging
          ? "border-primary bg-chart-area"
          : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      <span
        className={`flex size-14 items-center justify-center rounded-2xl border border-border bg-surface-elevated text-muted-foreground transition-transform group-hover:scale-105 ${
          dragging ? "text-primary" : ""
        }`}
      >
        {dragging ? <FileVideo className="size-6" /> : <Upload className="size-6" />}
      </span>
      <span className="space-y-1">
        <span className="block text-sm font-medium text-foreground">
          Drop a video here, or tap to choose
        </span>
        <span className="block text-xs text-muted-foreground">
          Analyzed entirely on this device — the file is never uploaded anywhere.
        </span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </motion.button>
  );
}
