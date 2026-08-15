const HEIC_EXT = /\.(heic|heif)$/i;

export function isHeicFile(file: File): boolean {
  if (HEIC_EXT.test(file.name)) return true;
  return file.type === "image/heic" || file.type === "image/heif";
}

export function isSupportedImage(file: File): boolean {
  if (isHeicFile(file)) return true;
  return (
    /\.(jpe?g|png|webp)$/i.test(file.name) ||
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp"
  );
}

export function jpegOutputName(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "");
  return `${base}.jpg`;
}
