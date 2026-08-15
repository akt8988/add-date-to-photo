import JSZip from "jszip";
import { isIosDevice } from "../device";

export async function downloadZip(files: Array<{ name: string; blob: Blob }>, zipName: string): Promise<void> {
  const zip = new JSZip();
  const used = new Map<string, number>();
  for (const item of files) {
    let name = item.name;
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    if (n > 0) {
      const stem = name.replace(/\.jpg$/i, "");
      name = `${stem}-${n}.jpg`;
    }
    zip.file(name, item.blob);
  }
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "STORE",
  });
  const file = new File([blob], zipName, { type: "application/zip" });
  if (isIosDevice() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: zipName });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
