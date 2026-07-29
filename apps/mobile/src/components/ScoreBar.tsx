import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme";

interface ScoreBarProps {
  label: string;
  value: number;
  danger?: boolean;
}

export function ScoreBar({ label, value, danger = false }: ScoreBarProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(value * 100)}%`,
              backgroundColor: danger ? colors.danger : colors.success,
            },
          ]}
        />
      </View>
      <Text style={styles.value}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
  },
  label: {
    width: 64,
    color: colors.mutedForeground,
    fontSize: 12,
    textTransform: "capitalize",
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
  value: {
    width: 40,
    textAlign: "right",
    color: colors.mutedForeground,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
});
