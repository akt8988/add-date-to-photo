import { heicTo } from "heic-to";
import { isHeicFile } from "./imageKinds";

export async function fileToBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch (err) {
      if (isHeicFile(file)) {
        return heicTo({ blob: file, type: "bitmap" });
      }
      throw err;
    }
  }
}
