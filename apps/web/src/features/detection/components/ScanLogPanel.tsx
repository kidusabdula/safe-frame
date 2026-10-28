"use client";

import { useEffect, useState } from "react";
import { FolderCheck, FolderOpen, History, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, InfoTip } from "@/components/ui";
import {
  clearScanLog,
  disableFolderLogging,
  enableFolderLogging,
  folderLoggingSupported,
  getFolderLogState,
  reauthorizeFolderLogging,
  useScanLog,
  type FolderLogState,
} from "../lib/scanLog";

/**
 * Session test log. Every completed scan is captured locally (localStorage,
 * plus an optional user-granted folder) so a test run's results can be
 * reviewed afterwards without re-scanning — or read by tools outside the
 * browser. Nothing here ever leaves the device.
 */
export function ScanLogPanel() {
  const entries = useScanLog();
  const [folderState, setFolderState] = useState<FolderLogState>("off");

  useEffect(() => {
    void getFolderLogState().then(setFolderState);
  }, []);

  const toggleFolder = async () => {
    if (folderState === "on") {
      await disableFolderLogging();
      setFolderState("off");
      toast("Folder auto-save off.");
      return;
    }
    const next =
      folderState === "needs-permission"
        ? await reauthorizeFolderLogging()
        : await enableFolderLogging();
    setFolderState(next);
    if (next === "on") toast.success("Every scan now auto-saves a JSON file to that folder.");
  };

  if (entries.length === 0 && folderState !== "on" && folderState !== "needs-permission") {
    return null;
  }

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5">
        <History className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Scan log
        </p>
        <InfoTip
          wide
          text="The last 50 scans, kept in this browser only. Optionally auto-save each result as a JSON file to a local folder you choose — handy for test sessions."
        />
        <div className="ml-auto flex items-center gap-1">
          {folderLoggingSupported() && (
            <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => void toggleFolder()}>
              {folderState === "on" ? (
                <>
                  <FolderCheck className="size-3.5 text-success" /> Auto-saving
                </>
              ) : folderState === "needs-permission" ? (
                <>
                  <FolderOpen className="size-3.5 text-warning" /> Re-authorize folder
                </>
              ) : (
                <>
                  <FolderOpen className="size-3.5" /> Save to folder
                </>
              )}
            </Button>
          )}
          {entries.length > 0 && (
            <Button
              variant="ghost"
              className="min-h-9 px-2 text-xs"
              onClick={clearScanLog}
            >
              <Trash2 className="size-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      {entries.length > 0 && (
        <ul className="max-h-64 divide-y divide-border overflow-auto">
          {entries.map((entry) => {
            const flagged = entry.result.contains_inappropriate_content;
            return (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-2">
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                    flagged ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                  }`}
                >
                  {flagged ? <ShieldAlert className="size-4" /> : <ShieldCheck className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{entry.label}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {new Date(entry.at).toLocaleTimeString()} ·{" "}
                    {(entry.result.confidence * 100).toFixed(0)}% ·{" "}
                    {entry.result.flagged_segments.length} seg ·{" "}
                    {entry.result.processing.tier2_escalations} t2 ·{" "}
                    {entry.benchmark.backend ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Copy result for ${entry.label}`}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
                      toast.success("Log entry copied.");
                    } catch {
                      toast.error("Clipboard unavailable.");
                    }
                  }}
                  className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Copy
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
