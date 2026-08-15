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

export function luminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
