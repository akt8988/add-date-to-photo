export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  return {
    r: Number.parseInt(n.slice(0, 2), 16),
    g: Number.parseInt(n.slice(2, 4), 16),
    b: Number.parseInt(n.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const ch = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function applyBrightness(hex: string, brightness: number): string {
  const rgb = parseHex(hex);
  const t = brightness / 20;
  if (t >= 0) return toHex(mixRgb(rgb, { r: 255, g: 174, b: 80 }, t * 0.55));
  return toHex(mixRgb(rgb, { r: 160, g: 70, b: 16 }, -t * 0.55));
}

export function clampAmber(hex: string, minHex: string, maxHex: string): string {
  const c = parseHex(hex);
  const lo = parseHex(minHex);
  const hi = parseHex(maxHex);
  return toHex({
    r: Math.min(hi.r, Math.max(lo.r, c.r)),
    g: Math.min(hi.g, Math.max(lo.g, c.g)),
    b: Math.min(hi.b, Math.max(lo.b, c.b)),
  });
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const n = Math.round(l * 255);
    return { r: n, g: n, b: n };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/** Keep hue; raise saturation a little so orange holds up on pale backdrops. */
export function punchSaturation(hex: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount));
  if (t === 0) return hex;
  const { r, g, b } = parseHex(hex);
  const hsl = rgbToHsl(r / 255, g / 255, b / 255);
  return toHex(
    hslToRgb(hsl.h, Math.min(1, hsl.s + t * 0.1), Math.max(0, hsl.l - t * 0.015)),
  );
}

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
