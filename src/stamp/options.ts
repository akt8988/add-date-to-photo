import type { StampOptions } from "./types";
import { cloneStyle, CLASSIC_AMBER_DATE_BACK } from "./dateStampStyle";

export const defaultOptions = (): StampOptions => ({
  dateSource: "exif",
  dateFormat: "'YY M D",
  position: "bottom-right",
  fontId: "segment7",
  scale: 0.032,
  jpegQuality: 0.92,
  stampStyle: cloneStyle(CLASSIC_AMBER_DATE_BACK),
});
