export type IoMode = "pc" | "phone";

export function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function ioModeFromQuery(): IoMode | null {
  const value = new URLSearchParams(location.search).get("io");
  if (value === "pc" || value === "phone") return value;
  return null;
}

export function defaultIoMode(hasFolderPicker: boolean): IoMode {
  const fromQuery = ioModeFromQuery();
  if (fromQuery) return fromQuery;
  if (isIosDevice()) return "phone";
  return hasFolderPicker ? "pc" : "phone";
}
