import type { DateStampStyle, GlowStage } from "./types";

export const GLOW_STAGE_LABELS = [
  "1 かなり暗い",
  "2 やや暗い",
  "3 中間",
  "4 やや明るい",
  "5 かなり白い",
] as const;

export const DEFAULT_GLOW_STAGES: GlowStage[] = [
  { screen: 1, ink: 0 },
  { screen: 1, ink: 0.1 },
  { screen: 1, ink: 0.2 },
  { screen: 1, ink: 0.4 },
  { screen: 1, ink: 0.5 },
];

export const CLASSIC_AMBER_DATE_BACK: DateStampStyle = {
  presetName: "Classic Amber Date Back",
  color: "#EF6B00",
  opacity: 0.88,
  bloomRadiusPx: 1.2,
  brightness: 0,
  autoContrast: false,
  colorMin: "#D85A00",
  colorMax: "#FF8A20",
  autoDark: "#C86A30",
  autoLight: "#F0A060",
  glowStages: DEFAULT_GLOW_STAGES.map((s) => ({ ...s })),
};

export function cloneStyle(style: DateStampStyle): DateStampStyle {
  return {
    ...style,
    glowStages: (style.glowStages ?? DEFAULT_GLOW_STAGES).map((s) => ({ ...s })),
  };
}
