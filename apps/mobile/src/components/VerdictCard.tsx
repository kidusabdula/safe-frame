import { StyleSheet, Text, View } from "react-native";
import type { DetectionResult } from "@safeframe/core";
import { colors, radius, spacing } from "../theme";
import { ScoreBar } from "./ScoreBar";

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function VerdictCard({ result }: { result: DetectionResult }) {
  const flagged = result.contains_inappropriate_content;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View
          style={[
            styles.iconBubble,
            { backgroundColor: flagged ? colors.dangerSoft : colors.successSoft },
          ]}
        >
          <Text style={{ fontSize: 22 }}>{flagged ? "⚠️" : "🛡️"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {flagged ? "Inappropriate content detected" : "No inappropriate content found"}
          </Text>
          <Text style={styles.subtitle}>
            Confidence {Math.round(result.confidence * 100)}% ·{" "}
            {result.frames_analyzed} frames ·{" "}
            {(result.processing.total_ms / 1000).toFixed(1)}s on-device
          </Text>
        </View>
      </View>

      <View style={styles.bars}>
        <ScoreBar label="nsfw" value={result.categories.porn} danger />
        <ScoreBar label="neutral" value={result.categories.neutral} />
      </View>

      {result.flagged_segments.length > 0 && (
        <View style={styles.segments}>
          <Text style={styles.segmentsHeading}>Flagged segments</Text>
          <View style={styles.segmentChips}>
            {result.flagged_segments.map((seg, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>
                  {formatTime(seg.start_s)}–{formatTime(seg.end_s)} · peak{" "}
                  {Math.round(seg.peak_score * 100)}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={styles.engineRow}>
        <Text style={styles.engineText}>
          {result.engine.backend} · tier {result.engine.device_tier} ·{" "}
          {result.engine.tier1_model}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(5),
    gap: spacing(4),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "600",
  },
  subtitle: {
    color: colors.mutedForeground,
    fontSize: 12,
    marginTop: 2,
  },
  bars: {
    gap: spacing(2),
  },
  segments: {
    gap: spacing(2),
  },
  segmentsHeading: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  segmentChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing(2),
  },
  chip: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1.5),
  },
  chipText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  engineRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(3),
  },
  engineText: {
    color: colors.mutedForeground,
    fontSize: 11,
  },
});
