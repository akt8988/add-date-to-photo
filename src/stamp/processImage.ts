import { fileToBitmap } from "./decodeImage";
import { jpegOutputName } from "./imageKinds";
import { stampOnCanvas } from "./drawStamp";
import { readExifDate } from "./exifDate";
import { ensureFontLoaded, fontById } from "./fonts";
import { formatStampDate, parseManualDate } from "./formatDate";
import type { ProcessFailure, ProcessRequest, ProcessResult } from "./types";

export async function processImage(req: ProcessRequest): Promise<ProcessResult> {
  const { file, options, id } = req;

  let shot: Date | null = null;
  if (options.dateSource === "exif") {
    shot = await readExifDate(file);
    if (!shot) {
      return fail(id, "no-date", "撮影日時が取れませんでした");
    }
  } else if (options.dateSource === "manual") {
    shot = parseManualDate(options.manualDate);
    if (!shot) {
      return fail(id, "no-date", "日付を入力してください");
    }
  } else {
    return fail(id, "error", "この日付ソースはまだ未対応です");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await fileToBitmap(file);
    bitmap = await maybeDownscale(bitmap, req.maxEdge);
  } catch (err) {
    return fail(id, "decode", err instanceof Error ? err.message : "画像を開けませんでした");
  }

  try {
    await ensureFontLoaded(fontById(options.fontId));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return fail(id, "error", "Canvas を初期化できませんでした");
    }
    const dateText = formatStampDate(shot);
    stampOnCanvas(canvas, ctx, bitmap, dateText, options);
    bitmap.close();
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: options.jpegQuality,
    });
    return {
      id,
      ok: true,
      blob,
      outputName: jpegOutputName(req.fileName),
      dateText,
    };
  } catch (err) {
    bitmap.close();
    return fail(id, "error", err instanceof Error ? err.message : "印字に失敗しました");
  }
}

async function maybeDownscale(bitmap: ImageBitmap, maxEdge?: number): Promise<ImageBitmap> {
  if (!maxEdge) return bitmap;
  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (longEdge <= maxEdge) return bitmap;
  const scale = maxEdge / longEdge;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return bitmap;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  if (typeof canvas.transferToImageBitmap === "function") {
    return canvas.transferToImageBitmap();
  }
  return createImageBitmap(canvas);
}

function fail(
  id: number,
  reason: ProcessFailure["reason"],
  message: string,
): ProcessFailure {
  return { id, ok: false, reason, message };
}
