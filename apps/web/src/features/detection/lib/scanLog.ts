"use client";

/**
 * Scan-result capture. Two layers, both strictly local (zero backend):
 *
 * 1. Always: a localStorage ring buffer of the last 50 completed scans —
 *    powers the in-app "Scan log" panel.
 * 2. Optional (Chromium): the File System Access API. The user picks a
 *    folder once (e.g. the repo's git-ignored `test-logs/`), the handle is
 *    persisted in IndexedDB, and every finished scan auto-writes a JSON
 *    file there. This exists so scan results from a test session can be
 *    reviewed by tooling outside the browser without any server.
 */
import { useSyncExternalStore } from "react";
import type { DetectionConfig, DetectionResult } from "@safeframe/core";

export interface ScanBenchmarkSnapshot {
  tier: string | null;
  backend: string | null;
  tier1LoadMs: number | null;
  tier2LoadMs: number | null;
  microBenchMs: number | null;
  longTaskCount: number;
  memoryMb: number | null;
}

/**
 * One classified frame, as written to the folder copy. This is the raw material
 * for offline replay: with the Tier-1 distribution and the raw Tier-2
 * probability per frame, thresholds and fusion weights can be re-evaluated
 * against a real scan instead of being guessed from aggregate maxima.
 */
export interface ScanFrame {
  t: number;
  p: number;
  w: number;
  tier2: number | null;
  porn: number;
  hentai: number;
  sexy: number;
  neutral: number;
  drawing: number;
}

export interface ScanLogEntry {
  id: string;
  at: string; // ISO timestamp
  label: string;
  sourceKind: "file" | "url";
  config: DetectionConfig;
  result: DetectionResult;
  benchmark: ScanBenchmarkSnapshot;
  /**
   * Per-frame detail. Written to the folder copy only — the localStorage ring
   * buffer drops it, since 50 scans × hundreds of frames would compete with the
   * 5 MB quota for no benefit to the in-app panel.
   */
  frames?: ScanFrame[];
}

const STORAGE_KEY = "safeframe.scanlog.v1";
const MAX_ENTRIES = 50;

/* ── localStorage ring buffer ─────────────────────────────────────────── */

function readScanLog(): ScanLogEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScanLogEntry[]) : [];
  } catch {
    return [];
  }
}

/*
 * Components read the log through useScanLog(), an external store over the
 * ring buffer: the prerendered page and hydration see an empty log, then the
 * browser's copy, and every append or clear re-renders every reader.
 */
const NO_ENTRIES: ScanLogEntry[] = [];
const listeners = new Set<() => void>();
let snapshot: ScanLogEntry[] | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ScanLogEntry[] {
  snapshot ??= readScanLog();
  return snapshot;
}

function publish(entries: ScanLogEntry[]): void {
  snapshot = entries;
  for (const listener of listeners) listener();
}

export function useScanLog(): ScanLogEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => NO_ENTRIES);
}

export async function appendScanLog(entry: ScanLogEntry): Promise<void> {
  // The ring buffer keeps the summary; per-frame detail goes to the folder copy.
  const entries = [{ ...entry, frames: undefined }, ...getSnapshot()].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota/private-mode failures degrade to folder-only capture.
  }
  publish(entries);
  await writeEntryToFolder(entry);
}

export function clearScanLog(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  publish(NO_ENTRIES);
}

/* ── File System Access auto-save (Chromium only) ─────────────────────── */

/** Permission methods are shipped in Chromium but absent from lib.dom. */
interface PermissionedDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
}

export type FolderLogState = "unsupported" | "off" | "needs-permission" | "on";

const IDB_NAME = "safeframe";
const IDB_STORE = "fs-handles";
const IDB_KEY = "scan-log-dir";

let dirHandle: PermissionedDirectoryHandle | null = null;

export function folderLoggingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function"
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

async function idbPut(value: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    if (value === null) tx.objectStore(IDB_STORE).delete(IDB_KEY);
    else tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
  db.close();
}

async function idbGet(): Promise<PermissionedDirectoryHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<PermissionedDirectoryHandle | null>(
      (resolve, reject) => {
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () =>
          resolve((req.result as PermissionedDirectoryHandle | undefined) ?? null);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
      },
    );
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function getFolderLogState(): Promise<FolderLogState> {
  if (!folderLoggingSupported()) return "unsupported";
  dirHandle ??= await idbGet();
  if (!dirHandle) return "off";
  const perm = (await dirHandle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  return perm === "granted" ? "on" : "needs-permission";
}

/** Must be called from a user gesture (button click). */
export async function enableFolderLogging(): Promise<FolderLogState> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return "unsupported";
  try {
    const handle = (await picker.call(window, {
      id: "safeframe-scan-logs",
      mode: "readwrite",
    })) as PermissionedDirectoryHandle;
    dirHandle = handle;
    await idbPut(handle);
    return "on";
  } catch {
    return dirHandle ? "on" : "off"; // user dismissed the picker
  }
}

/** Must be called from a user gesture — re-grants a persisted handle. */
export async function reauthorizeFolderLogging(): Promise<FolderLogState> {
  dirHandle ??= await idbGet();
  if (!dirHandle) return "off";
  const perm = await dirHandle.requestPermission?.({ mode: "readwrite" });
  return perm === "granted" ? "on" : "needs-permission";
}

export async function disableFolderLogging(): Promise<void> {
  dirHandle = null;
  await idbPut(null);
}

async function writeEntryToFolder(entry: ScanLogEntry): Promise<void> {
  if ((await getFolderLogState()) !== "on" || !dirHandle) return;
  try {
    const stamp = entry.at.replace(/[:.]/g, "-");
    const slug = entry.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const name = `scan-${stamp}${slug ? `-${slug}` : ""}.json`;
    const file = await dirHandle.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(entry, null, 2));
    await writable.close();
  } catch {
    // Folder writes are best-effort; the localStorage copy still exists.
  }
}
