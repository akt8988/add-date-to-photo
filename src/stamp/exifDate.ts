import exifr from "exifr";
import { parseExifDate } from "./formatDate";

export async function readExifDate(file: File): Promise<Date | null> {
  try {
    const data = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "DateTimeDigitized", "CreateDate", "DateTime"],
      translateKeys: true,
      reviveValues: true,
    });
    if (!data) return null;
    return (
      parseExifDate(data.DateTimeOriginal) ??
      parseExifDate(data.DateTimeDigitized) ??
      parseExifDate(data.CreateDate) ??
      parseExifDate(data.DateTime)
    );
  } catch {
    return null;
  }
}
