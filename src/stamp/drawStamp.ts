import { applyBrightness, parseHex, punchSaturation, rgba } from "./color";
import { fontById } from "./fonts";
import { toDsegGlyphs } from "./formatDate";
import type { DateStampStyle, StampOptions, StampPosition } from "./types";

type Ctx2d = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function anchor(
  position: StampPosition,
  w: number,
  h: number,
  padX: number,
  padY: number,
) {
  switch (position) {
    case "bottom-right":
      return { x: w - padX, y: h - padY, align: "right" as const, baseline: "bottom" as const };
    case "bottom-left":
      return { x: padX, y: h - padY, align: "left" as const, baseline: "bottom" as const };
    case "top-right":
      return { x: w - padX, y: padY, align: "right" as const, baseline: "top" as const };
    case "top-left":
      return { x: padX, y: padY, align: "left" as const, baseline: "top" as const };
  }
}

function stampPadding(imageWidth: number, imageHeight: number, fontSize: number) {
  const inset = fontSize * 0.55;
  const landscape = imageWidth > imageHeight;
  return {
    padX: Math.round(inset * 4.5),
    padY: Math.round(inset * (landscape ? 4.5 : 3)),
  };
}

function regionLuma(ctx: Ctx2d, x: number, y: number, w: number, h: number): number {
  try {
    const rx = Math.max(0, Math.floor(x));
    const ry = Math.max(0, Math.floor(y));
    const rw = Math.max(1, Math.floor(w));
    const rh = Math.max(1, Math.floor(h));
    const data = ctx.getImageData(rx, ry, rw, rh).data;
    let sum = 0;
    const step = 16 * 4;
    let n = 0;
    for (let i = 0; i < data.length; i += step) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n += 1;
    }
    return n ? sum / n / 255 : 0.5;
  } catch {
    return 0.5;
  }
}

export function resolveStampColor(
  style: DateStampStyle,
  backdropLuma: number,
): string {
  let hex = applyBrightness(style.color, style.brightness);
  if (style.autoContrast) {
    hex = backdropLuma > 0.55 ? style.autoDark : backdropLuma < 0.28 ? style.autoLight : hex;
  }
  return punchSaturation(hex, glowStage(style, backdropLuma).sat);
}

function drawApostrophe(
  ctx: Ctx2d,
  right: number,
  y: number,
  fontSize: number,
  baseline: CanvasTextBaseline,
): void {
  const tickW = Math.max(2, fontSize * 0.12);
  const tickH = fontSize * 0.38;
  const top =
    baseline === "top" ? y : baseline === "bottom" ? y - fontSize : y - fontSize * 0.8;
  ctx.beginPath();
  ctx.roundRect(right - tickW, top, tickW, tickH, tickW * 0.35);
  ctx.fill();
}

function drawGlyphs(
  ctx: Ctx2d,
  text: string,
  body: string,
  x: number,
  y: number,
  fontSize: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
  useDseg: boolean,
): void {
  if (useDseg && text.startsWith("'")) {
    const bodyWidth = ctx.measureText(body).width;
    const tickGap = fontSize * 0.18;
    const tickW = Math.max(2, fontSize * 0.12);
    if (align === "right") {
      ctx.fillText(body, x, y);
      drawApostrophe(ctx, x - bodyWidth - tickGap, y, fontSize, baseline);
    } else {
      ctx.fillText(body, x + tickW + tickGap, y);
      drawApostrophe(ctx, x + tickW, y, fontSize, baseline);
    }
    return;
  }
  ctx.fillText(body, x, y);
}

function blurRadius(style: DateStampStyle, fontSize: number): number {
  const t = Math.max(0, Math.min(5, style.bloomRadiusPx)) / 24;
  return t * fontSize * 0.32;
}

function blurAlpha(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  rgb: { r: number; g: number; b: number },
): void {
  const r = Math.max(1, Math.round(radius));
  let src = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = data[i * 4 + 3];

  const pass = (horizontal: boolean) => {
    const dst = new Float32Array(w * h);
    const n = r * 2 + 1;
    if (horizontal) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const xx = Math.min(w - 1, Math.max(0, x + k));
            sum += src[y * w + xx];
          }
          dst[y * w + x] = sum / n;
        }
      }
    } else {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const yy = Math.min(h - 1, Math.max(0, y + k));
            sum += src[yy * w + x];
          }
          dst[y * w + x] = sum / n;
        }
      }
    }
    src = dst;
  };

  pass(true);
  pass(false);
  pass(true);
  pass(false);

  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    data[p] = rgb.r;
    data[p + 1] = rgb.g;
    data[p + 2] = rgb.b;
    data[p + 3] = src[i];
  }
}

function glyphBox(
  ctx: Ctx2d,
  x: number,
  y: number,
  fontSize: number,
  text: string,
  body: string,
  align: CanvasTextAlign,
  useDseg: boolean,
): { left: number; top: number; right: number; bottom: number } {
  const m = ctx.measureText(body);
  const left = x - (m.actualBoundingBoxLeft || (align === "right" ? m.width : 0));
  const right = x + (m.actualBoundingBoxRight || (align === "right" ? 0 : m.width));
  const top = y - (m.actualBoundingBoxAscent || fontSize);
  const bottom = y + (m.actualBoundingBoxDescent || fontSize * 0.25);
  const tick = useDseg && text.startsWith("'") ? Math.max(2, fontSize * 0.12) + fontSize * 0.18 : 0;
  return {
    left: left - (align === "right" ? tick : 0),
    right: right + (align === "left" ? tick : 0),
    top,
    bottom,
  };
}

/** 0 = darkest … 4 = palest. Glow stays full; extra orange ink ramps up. */
function glowStageIndex(luma: number): 0 | 1 | 2 | 3 | 4 {
  if (luma < 0.22) return 0;
  if (luma < 0.4) return 1;
  if (luma < 0.56) return 2;
  if (luma < 0.72) return 3;
  return 4;
}

function glowStage(style: DateStampStyle, luma: number): { screen: number; ink: number; sat: number } {
  const sat = [0, 0.15, 0.35, 0.65, 1] as const;
  const i = glowStageIndex(luma);
  const stage = style.glowStages[i] ?? { screen: 1, ink: 0 };
  return {
    screen: Math.max(0, Math.min(1, stage.screen)),
    ink: Math.max(0, Math.min(1, stage.ink)),
    sat: sat[i],
  };
}

function drawStampPasses(
  ctx: Ctx2d,
  screen: number,
  ink: number,
  paint: () => void,
): void {
  ctx.save();
  ctx.filter = "none";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (screen > 0) {
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = screen;
    paint();
  }
  if (ink > 0) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = ink;
    paint();
  }
  ctx.restore();
}

function paintStamp(
  ctx: Ctx2d,
  color: string,
  style: DateStampStyle,
  fontSize: number,
  x: number,
  y: number,
  align: CanvasTextAlign,
  baseline: CanvasTextBaseline,
  text: string,
  body: string,
  useDseg: boolean,
  backdropLuma: number,
): void {
  const fill = rgba(color, style.opacity);
  const radius = blurRadius(style, fontSize);
  const { screen, ink } = glowStage(style, backdropLuma);
  const drawDirect = () => {
    ctx.fillStyle = fill;
    drawGlyphs(ctx, text, body, x, y, fontSize, align, baseline, useDseg);
  };

  if (radius < 0.35) {
    drawStampPasses(ctx, screen, ink, drawDirect);
    return;
  }

  const box = glyphBox(ctx, x, y, fontSize, text, body, align, useDseg);
  const pad = Math.ceil(radius * 3) + 8;
  const lx = Math.floor(box.left) - pad;
  const ly = Math.floor(box.top) - pad;
  const lw = Math.max(8, Math.ceil(box.right - box.left) + pad * 2);
  const lh = Math.max(8, Math.ceil(box.bottom - box.top) + pad * 2);

  const layer = new OffscreenCanvas(lw, lh);
  const lctx = layer.getContext("2d", { willReadFrequently: true });
  if (!lctx) {
    drawStampPasses(ctx, screen, ink, drawDirect);
    return;
  }
  lctx.setTransform(1, 0, 0, 1, -lx, -ly);
  lctx.font = ctx.font;
  lctx.textAlign = align;
  lctx.textBaseline = baseline;
  lctx.fillStyle = fill;
  drawGlyphs(lctx, text, body, x, y, fontSize, align, baseline, useDseg);

  try {
    const pixels = lctx.getImageData(0, 0, lw, lh);
    blurAlpha(pixels.data, lw, lh, radius, parseHex(color));
    lctx.putImageData(pixels, 0, 0);
  } catch {
    // keep the unblurred layer if pixels cannot be read
  }

  drawStampPasses(ctx, screen, ink, () => {
    ctx.drawImage(layer, lx, ly);
  });
}

export function stampFocusRect(
  imageWidth: number,
  imageHeight: number,
  options: StampOptions,
): { x: number; y: number; width: number; height: number } {
  const w = imageWidth;
  const h = imageHeight;
  const shortSide = Math.min(w, h);
  const fontSize = Math.max(12, Math.round(shortSide * options.scale));
  const { padX, padY } = stampPadding(w, h, fontSize);
  const { x, y, align, baseline } = anchor(options.position, w, h, padX, padY);
  const radius = blurRadius(options.stampStyle, fontSize);
  const cropW = fontSize * 8.8 + radius * 6;
  const cropH = fontSize * 2.3 + radius * 6;
  const left = align === "right" ? x - cropW + fontSize * 0.4 : x - fontSize * 0.4;
  const top = baseline === "bottom" ? y - cropH + fontSize * 0.3 : y - fontSize * 0.3;
  const sx = Math.max(0, Math.min(w - 1, Math.floor(left)));
  const sy = Math.max(0, Math.min(h - 1, Math.floor(top)));
  return {
    x: sx,
    y: sy,
    width: Math.max(1, Math.min(w - sx, Math.ceil(cropW))),
    height: Math.max(1, Math.min(h - sy, Math.ceil(cropH))),
  };
}

export function stampOnCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  ctx: Ctx2d,
  bitmap: ImageBitmap,
  text: string,
  options: StampOptions,
): void {
  const w = bitmap.width;
  const h = bitmap.height;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(bitmap, 0, 0);

  const shortSide = Math.min(w, h);
  const fontSize = Math.max(12, Math.round(shortSide * options.scale));
  const { padX, padY } = stampPadding(w, h, fontSize);
  const font = fontById(options.fontId);
  ctx.font = `400 ${fontSize}px "${font.family}"`;
  const { x, y, align, baseline } = anchor(options.position, w, h, padX, padY);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  const sampleW = fontSize * 8;
  const sampleH = fontSize * 1.4;
  const sx = align === "right" ? x - sampleW : x;
  const sy = baseline === "bottom" ? y - sampleH : y;
  const luma = regionLuma(
    ctx,
    Math.min(w - 4, Math.max(0, sx)),
    Math.min(h - 4, Math.max(0, sy)),
    Math.min(sampleW, w),
    Math.min(sampleH, h),
  );
  const color = resolveStampColor(options.stampStyle, luma);

  const useDseg = font.id === "dseg7";
  const body = useDseg ? toDsegGlyphs(text) : text;
  paintStamp(
    ctx,
    color,
    options.stampStyle,
    fontSize,
    x,
    y,
    align,
    baseline,
    text,
    body,
    useDseg,
    luma,
  );
}
