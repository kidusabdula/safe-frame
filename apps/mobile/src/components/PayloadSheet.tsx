import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import type { DetectionResult } from "@safeframe/core";
import { colors, radius, spacing } from "../theme";

export function PayloadSheet({ result }: { result: DetectionResult }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(
    result,
    (_k, v: unknown) =>
      typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(4)) : v,
    2,
  );

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerText}>View payload JSON</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Result payload</Text>
              <Pressable
                style={styles.copyButton}
                onPress={async () => {
                  await Clipboard.setStringAsync(json);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <Text style={styles.copyText}>{copied ? "Copied ✓" : "Copy"}</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.scroll}>
              <Text style={styles.json}>{json}</Text>
            </ScrollView>
            <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minHeight: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  triggerText: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "80%",
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(4),
    gap: spacing(3),
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  copyButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(3),
  },
  copyText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "500",
  },
  scroll: {
    flexGrow: 0,
  },
  json: {
    color: colors.foreground,
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 17,
  },
  closeButton: {
    minHeight: 44,
    borderRadius: radius.control,
    backgroundColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: "500",
  },
});
