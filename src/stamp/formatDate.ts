import type { DateSource } from "./types";

function pad2Space(n: number): string {
  return String(n).padStart(2, " ");
}

/** e.g. 2026-08-15 → `'26  8 15` (1桁の十の位は半角スペース) */
export function formatStampDate(date: Date): string {
  const yy = date.getFullYear() % 100;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `'${pad2Space(yy)} ${pad2Space(m)} ${pad2Space(d)}`;
}

/** DSEG7 has no `'`, and space is narrower than a digit. `!` is a blank 7-seg cell. */
export function toDsegGlyphs(cameraText: string): string {
  const body = cameraText.startsWith("'") ? cameraText.slice(1) : cameraText;
  const year = body.slice(0, 2).replaceAll(" ", "!");
  const month = body.slice(3, 5).replaceAll(" ", "!");
  const day = body.slice(6, 8).replaceAll(" ", "!");
  return `${year} ${month} ${day}`;
}

export function parseExifDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string") return null;
  const m = value.match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (m) {
    const dt = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateSourceLabel(source: DateSource): string {
  switch (source) {
    case "exif":
      return "撮影日時（EXIF）";
    case "filename":
      return "ファイル名（未対応）";
    case "mtime":
      return "ファイル更新日（未対応）";
    case "manual":
      return "手動日付（未対応）";
  }
}
