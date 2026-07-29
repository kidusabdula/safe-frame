import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import type { DetectionResult } from "@safeframe/core";
import {
  runDetectionMobile,
  type MobileProgress,
  type MobileTimelinePoint,
} from "../lib/runDetectionMobile";
import { colors, radius, spacing } from "../theme";
import { VerdictCard } from "../components/VerdictCard";
import { PayloadSheet } from "../components/PayloadSheet";

type Phase = "idle" | "running" | "done" | "cancelled" | "error";

export function DetectScreen() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<MobileProgress | null>(null);
  const [points, setPoints] = useState<MobileTimelinePoint[]>([]);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const pickAndRun = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: "video/*",
      copyToCacheDirectory: true,
    });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;

    setVideoName(asset.name);
    setPhase("running");
    setPoints([]);
    setResult(null);
    setError(null);
    cancelRef.current = false;

    try {
      const detection = await runDetectionMobile(
        asset.uri,
        {},
        (p) => setProgress(p),
        (point) => setPoints((prev) => [...prev, point]),
        () => cancelRef.current,
      );
      setResult(detection);
      setPhase("done");
    } catch (err) {
      if (err instanceof Error && err.message === "cancelled") {
        setPhase("cancelled");
      } else {
        setError(err instanceof Error ? err.message : "Detection failed");
        setPhase("error");
      }
    }
  }, []);

  const fraction =
    progress && progress.framesPlanned > 0
      ? progress.framesDone / progress.framesPlanned
      : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.logoBubble}>
          <Text style={{ fontSize: 20 }}>🛡️</Text>
        </View>
        <View>
          <Text style={styles.appName}>SafeFrame</Text>
          <Text style={styles.tagline}>Native on-device detection</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>offline-capable</Text>
        </View>
      </View>

      <Text style={styles.blurb}>
        Pick a video and a quantized ViT classifier scores sampled frames with
        the phone&apos;s own ONNX runtime — the same shared detection core as the
        web app. Nothing leaves this device; it works in airplane mode.
      </Text>

      {phase !== "running" && (
        <Pressable style={styles.primaryButton} onPress={() => void pickAndRun()}>
          <Text style={styles.primaryButtonText}>
            {phase === "idle" ? "Choose a video" : "Analyze another video"}
          </Text>
        </Pressable>
      )}

      {phase === "running" && progress && (
        <View style={styles.progressCard}>
          <Text style={styles.progressLabel}>
            {progress.phase === "loading-model"
              ? "Preparing the on-device model…"
              : progress.phase === "sampling"
                ? `Sampling frame @ ${progress.currentTimeS.toFixed(1)}s`
                : `Classifying @ ${progress.currentTimeS.toFixed(1)}s`}
          </Text>
          {progress.framesPlanned > 0 && (
            <Text style={styles.progressCount}>
              {progress.framesDone}/{progress.framesPlanned} frames
            </Text>
          )}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
          </View>
          <Pressable
            style={styles.cancelButton}
            onPress={() => {
              cancelRef.current = true;
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {points.length > 0 && (
        <View style={styles.sparkline}>
          {points.map((pt, i) => (
            <View
              key={i}
              style={[
                styles.sparkBar,
                {
                  height: Math.max(2, pt.p * 48),
                  backgroundColor:
                    pt.p >= 0.6 ? colors.danger : colors.primary,
                },
              ]}
            />
          ))}
        </View>
      )}

      {phase === "done" && result && (
        <View style={styles.results}>
          <VerdictCard result={result} />
          <PayloadSheet result={result} />
        </View>
      )}

      {phase === "cancelled" && (
        <Text style={styles.mutedNote}>
          Scan cancelled — pick a video to start again.
        </Text>
      )}

      {phase === "error" && error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      )}

      {videoName && phase !== "idle" && (
        <Text style={styles.fileName} numberOfLines={1}>
          {videoName}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing(5),
    paddingTop: spacing(16),
    gap: spacing(5),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  logoBubble: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  appName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "700",
  },
  tagline: {
    color: colors.mutedForeground,
    fontSize: 12,
  },
  badge: {
    marginLeft: "auto",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
  },
  badgeText: {
    color: colors.mutedForeground,
    fontSize: 11,
  },
  blurb: {
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: radius.control,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: colors.primaryForeground,
    fontSize: 15,
    fontWeight: "600",
  },
  progressCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(3),
  },
  progressLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  progressCount: {
    color: colors.mutedForeground,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  cancelButton: {
    minHeight: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  sparkline: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: 52,
    paddingHorizontal: spacing(1),
  },
  sparkBar: {
    flex: 1,
    maxWidth: 8,
    borderRadius: 2,
  },
  results: {
    gap: spacing(4),
  },
  mutedNote: {
    color: colors.mutedForeground,
    fontSize: 13,
    textAlign: "center",
  },
  errorCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.card,
    padding: spacing(4),
    gap: spacing(1.5),
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  errorBody: {
    color: colors.foreground,
    fontSize: 12,
    lineHeight: 18,
  },
  fileName: {
    color: colors.mutedForeground,
    fontSize: 11,
    textAlign: "center",
  },
});
