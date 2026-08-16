import { isIgnoredFileName, isSupportedImage } from "../stamp/imageKinds";

export type ListedFile = {
  handle: FileSystemFileHandle;
  name: string;
  relativePath: string;
};

export function hasDirectoryPicker(): boolean {
  return typeof window.showDirectoryPicker === "function";
}

export async function listImages(
  dir: FileSystemDirectoryHandle,
  recursive: boolean,
): Promise<ListedFile[]> {
  const out: ListedFile[] = [];
  await walk(dir, "", recursive, out);
  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  recursive: boolean,
  out: ListedFile[],
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (isIgnoredFileName(name)) continue;
    if (handle.kind === "file") {
      const file = await handle.getFile();
      if (isSupportedImage(file)) {
        out.push({
          handle,
          name,
          relativePath: prefix ? `${prefix}/${name}` : name,
        });
      }
    } else if (recursive && handle.kind === "directory") {
      await walk(
        handle,
        prefix ? `${prefix}/${name}` : name,
        true,
        out,
      );
    }
  }
}

export async function ensureSubdir(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<FileSystemDirectoryHandle> {
  return dir.getDirectoryHandle(name, { create: true });
}

export async function writeJpeg(
  dir: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}
