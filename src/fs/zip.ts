import { isIosDevice } from "../device";
import { crc32 } from "./crc32";

/** iPhone では 50 枚前後が安定していたので、ZIP はこれ以下に分割する */
export const PHONE_ZIP_MAX_FILES = 40;

type ZipEntry = {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
};

type ZipSink = {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
  toFile(): Promise<File>;
};

const OPFS_ZIP_PREFIX = "dated-photos-";

export class StreamingZip {
  private offset = 0;
  private entries: ZipEntry[] = [];
  private used = new Map<string, number>();
  private sink: ZipSink | null = null;
  private readonly zipName: string;

  constructor(zipName: string) {
    this.zipName = zipName;
  }

  get count(): number {
    return this.entries.length;
  }

  async add(name: string, blob: Blob): Promise<void> {
    if (!this.sink) this.sink = await openZipSink(this.zipName);
    const unique = uniqueZipName(name, this.used);
    const data = new Uint8Array(await blob.arrayBuffer());
    const nameBytes = new TextEncoder().encode(unique);
    const crc = crc32(data);
    const local = localFileHeader(nameBytes, crc, data.length);
    await this.sink.write(local);
    await this.sink.write(data);
    this.entries.push({ nameBytes, crc, size: data.length, offset: this.offset });
    this.offset += local.byteLength + data.byteLength;
  }

  async closeToFile(): Promise<File> {
    if (!this.sink) this.sink = await openZipSink(this.zipName);
    const central: Uint8Array[] = [];
    let centralSize = 0;
    for (const entry of this.entries) {
      const rec = centralDirectoryHeader(entry);
      central.push(rec);
      centralSize += rec.byteLength;
    }
    for (const rec of central) {
      await this.sink.write(rec);
    }
    await this.sink.write(endOfCentralDirectory(this.entries.length, centralSize, this.offset));
    await this.sink.close();
    const file = await this.sink.toFile();
    this.sink = null;
    this.entries = [];
    this.offset = 0;
    this.used.clear();
    return file;
  }

  async discard(): Promise<void> {
    try {
      await this.sink?.close();
    } catch {
      // ignore incomplete writes
    }
    this.sink = null;
    this.entries = [];
    this.offset = 0;
    this.used.clear();
    await removeOpfsZip(this.zipName);
  }
}

export async function releaseZipFile(file: File, delayMs = 0): Promise<void> {
  if (delayMs > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }
  await removeOpfsZip(file.name);
}

export async function purgeOpfsZips(keep: ReadonlySet<string> = new Set()): Promise<void> {
  if (!navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const stale: string[] = [];
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== "file") continue;
      if (!name.startsWith(OPFS_ZIP_PREFIX) || !name.toLowerCase().endsWith(".zip")) continue;
      if (keep.has(name)) continue;
      stale.push(name);
    }
    for (const name of stale) {
      await removeOpfsZip(name);
    }
  } catch {
    // OPFS may be unavailable in private browsing
  }
}

async function removeOpfsZip(name: string): Promise<void> {
  if (!navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(name);
  } catch {
    // already gone or memory-backed zip
  }
}

export async function shareOrDownload(file: File): Promise<"shared" | "saved" | "cancelled"> {
  if (isIosDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "saved";
}

async function openZipSink(zipName: string): Promise<ZipSink> {
  const opfs = await tryOpfsSink(zipName);
  if (opfs) return opfs;
  return memorySink(zipName);
}

async function tryOpfsSink(zipName: string): Promise<ZipSink | null> {
  if (!navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(zipName, { create: true });
    const writable = await handle.createWritable();
    return {
      write: async (data) => {
        await writable.write(new Blob([data.buffer as ArrayBuffer]));
      },
      close: () => writable.close(),
      toFile: () => handle.getFile(),
    };
  } catch {
    return null;
  }
}

function memorySink(zipName: string): ZipSink {
  const parts: BlobPart[] = [];
  return {
    async write(data) {
      parts.push(new Blob([data.buffer as ArrayBuffer]));
    },
    async close() {},
    async toFile() {
      return new File(parts, zipName, { type: "application/zip" });
    },
  };
}

function uniqueZipName(name: string, used: Map<string, number>): string {
  const n = used.get(name) ?? 0;
  used.set(name, n + 1);
  if (n === 0) return name;
  const slash = name.lastIndexOf("/");
  const dir = slash >= 0 ? name.slice(0, slash + 1) : "";
  const base = slash >= 0 ? name.slice(slash + 1) : name;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  return `${dir}${stem}-${n}${ext}`;
}

function localFileHeader(nameBytes: Uint8Array, crc: number, size: number): Uint8Array {
  const buf = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  writeDosDateTime(view, 10, new Date());
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  buf.set(nameBytes, 30);
  return buf;
}

function centralDirectoryHeader(entry: ZipEntry): Uint8Array {
  const buf = new Uint8Array(46 + entry.nameBytes.length);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  writeDosDateTime(view, 12, new Date());
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.size, true);
  view.setUint32(24, entry.size, true);
  view.setUint16(28, entry.nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.offset, true);
  buf.set(entry.nameBytes, 46);
  return buf;
}

function endOfCentralDirectory(count: number, centralSize: number, centralOffset: number): Uint8Array {
  const buf = new Uint8Array(22);
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return buf;
}

function writeDosDateTime(view: DataView, offset: number, date: Date): void {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  view.setUint16(offset, time, true);
  view.setUint16(offset + 2, day, true);
}
