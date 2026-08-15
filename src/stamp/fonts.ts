import type { FontDef } from "./types";

/** Add a file under /public/fonts and an entry here to offer another font. */
export const FONTS: FontDef[] = [
  {
    id: "segment7",
    name: "Segment7",
    file: "Segment7Standard.otf",
    family: "StampSegment7",
  },
  {
    id: "dseg7",
    name: "DSEG7",
    file: "DSEG7Classic-Regular.woff2",
    family: "StampDseg7",
  },
  {
    id: "gothic",
    name: "ゴシック",
    file: "NotoSans-latin-400.woff2",
    family: "StampGothic",
  },
  {
    id: "mono",
    name: "等幅",
    file: "SourceCodePro-latin-400.woff2",
    family: "StampMono",
  },
  {
    id: "hand",
    name: "手書き風",
    file: "Caveat-latin-400.woff2",
    family: "StampHand",
  },
];

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

const loaded = new Set<string>();

export async function ensureFontLoaded(font: FontDef): Promise<void> {
  if (loaded.has(font.id)) return;
  const url = new URL(`${import.meta.env.BASE_URL}fonts/${font.file}`, self.location.href).href;
  const face = new FontFace(font.family, `url(${url})`, { weight: "400" });
  await face.load();
  self.fonts.add(face);
  loaded.add(font.id);
}
