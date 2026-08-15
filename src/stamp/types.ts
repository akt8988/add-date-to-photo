export type DateSource = "exif" | "filename" | "mtime" | "manual";

export type StampPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export type DateStampStyle = {
  presetName: string;
  color: string;
  opacity: number;
  bloomRadiusPx: number;
  brightness: number;
  autoContrast: boolean;
  colorMin: string;
  colorMax: string;
  autoDark: string;
  autoLight: string;
};

export type StampOptions = {
  dateSource: DateSource;
  dateFormat: string;
  position: StampPosition;
  fontId: string;
  scale: number;
  jpegQuality: number;
  stampStyle: DateStampStyle;
  manualDate?: string;
};

export type FontDef = {
  id: string;
  name: string;
  file: string;
  family: string;
};

export type ProcessRequest = {
  id: number;
  file: File;
  fileName: string;
  lastModified: number;
  options: StampOptions;
};

export type ProcessSuccess = {
  id: number;
  ok: true;
  blob: Blob;
  outputName: string;
  dateText: string;
};

export type ProcessFailure = {
  id: number;
  ok: false;
  reason: "no-date" | "decode" | "error";
  message: string;
};

export type ProcessResult = ProcessSuccess | ProcessFailure;
