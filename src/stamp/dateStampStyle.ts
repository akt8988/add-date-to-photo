import type { DateStampStyle } from "./types";

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
};

export function cloneStyle(style: DateStampStyle): DateStampStyle {
  return { ...style };
}
