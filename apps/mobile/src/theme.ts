/**
 * Semantic color tokens — single source of truth for the mobile UI.
 * React Native cannot parse oklch(); these are the sRGB renderings of the
 * same dark-theme palette the web app defines in globals.css. Components
 * reference tokens only, never literal colors.
 */
export const colors = {
  background: "#14161c",
  surface: "#1c1f27",
  surfaceElevated: "#232733",
  border: "#2e3342",
  borderStrong: "#434a5e",
  muted: "#272b37",
  mutedForeground: "#9aa1b4",
  foreground: "#e8eaf0",
  primary: "#7a87f2",
  primaryForeground: "#12142b",
  accent: "#5fc4dc",
  success: "#4ec98c",
  successSoft: "rgba(78, 201, 140, 0.14)",
  warning: "#e5b455",
  warningSoft: "rgba(229, 180, 85, 0.15)",
  danger: "#e5695b",
  dangerSoft: "rgba(229, 105, 91, 0.16)",
} as const;

export const radius = {
  card: 16,
  control: 12,
} as const;

export const spacing = (n: number): number => n * 4;
