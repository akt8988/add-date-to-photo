import type { StampOptions } from "./types";
import { cloneStyle, CLASSIC_AMBER_DATE_BACK } from "./dateStampStyle";

export const defaultOptions = (): StampOptions => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    dateSource: "exif",
    dateFormat: "'YY M D",
    position: "bottom-right",
    fontId: "segment7",
    scale: 0.032,
    jpegQuality: 0.92,
    stampStyle: cloneStyle(CLASSIC_AMBER_DATE_BACK),
    manualDate: `${y}-${m}-${day}`,
  };
};
