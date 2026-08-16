/** Canvas JPEG has no EXIF. Inject DateTimeOriginal so galleries keep the shot time. */

export async function jpegWithShotDate(jpeg: Blob, shot: Date): Promise<Blob> {
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return jpeg;
  }
  const app1 = buildExifApp1(shot);
  const merged = insertApp1(bytes, app1);
  const copy = merged.buffer.slice(
    merged.byteOffset,
    merged.byteOffset + merged.byteLength,
  ) as ArrayBuffer;
  return new Blob([copy], { type: "image/jpeg" });
}

function formatExifDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}:${p(date.getMonth() + 1)}:${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

function buildExifApp1(shot: Date): Uint8Array {
  const dateStr = formatExifDate(shot);
  const dateBytes = new Uint8Array(20);
  for (let i = 0; i < 19; i++) dateBytes[i] = dateStr.charCodeAt(i);
  dateBytes[19] = 0;

  const ifd0Offset = 8;
  const dateTimeOffset = 50;
  const exifIfdOffset = 70;
  const originalOffset = 100;
  const digitizedOffset = 120;
  const tiffLen = 140;

  const tiff = new Uint8Array(tiffLen);
  const view = new DataView(tiff.buffer);
  tiff[0] = 0x49;
  tiff[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifd0Offset, true);

  view.setUint16(ifd0Offset, 3, true);
  writeIfdEntry(view, ifd0Offset + 2, 0x0112, 3, 1, 1);
  writeIfdEntry(view, ifd0Offset + 14, 0x0132, 2, 20, dateTimeOffset);
  writeIfdEntry(view, ifd0Offset + 26, 0x8769, 4, 1, exifIfdOffset);
  view.setUint32(ifd0Offset + 38, 0, true);
  tiff.set(dateBytes, dateTimeOffset);

  view.setUint16(exifIfdOffset, 2, true);
  writeIfdEntry(view, exifIfdOffset + 2, 0x9003, 2, 20, originalOffset);
  writeIfdEntry(view, exifIfdOffset + 14, 0x9004, 2, 20, digitizedOffset);
  view.setUint32(exifIfdOffset + 26, 0, true);
  tiff.set(dateBytes, originalOffset);
  tiff.set(dateBytes, digitizedOffset);

  const header = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const length = 2 + header.length + tiff.length;
  const app1 = new Uint8Array(2 + length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1[2] = (length >> 8) & 0xff;
  app1[3] = length & 0xff;
  app1.set(header, 4);
  app1.set(tiff, 10);
  return app1;
}

function writeIfdEntry(
  view: DataView,
  offset: number,
  tag: number,
  type: number,
  count: number,
  valueOrOffset: number,
): void {
  view.setUint16(offset, tag, true);
  view.setUint16(offset + 2, type, true);
  view.setUint32(offset + 4, count, true);
  view.setUint32(offset + 8, valueOrOffset, true);
}

function insertApp1(jpeg: Uint8Array, app1: Uint8Array): Uint8Array {
  let i = 2;
  if (jpeg[i] === 0xff && jpeg[i + 1] === 0xe0 && jpeg.length >= i + 4) {
    const len = (jpeg[i + 2] << 8) | jpeg[i + 3];
    i += 2 + len;
  }
  const out = new Uint8Array(jpeg.length + app1.length);
  out.set(jpeg.subarray(0, i), 0);
  out.set(app1, i);
  out.set(jpeg.subarray(i), i + app1.length);
  return out;
}
