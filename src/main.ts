import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { defaultIoMode, ioModeFromQuery, isIosDevice, type IoMode } from "./device";
import { ensureSubdir, hasDirectoryPicker, listImages, writeJpeg } from "./fs/folder";
import { jobsFromFiles, type JobFile } from "./fs/jobs";
import {
  PHONE_ZIP_MAX_FILES,
  purgeOpfsZips,
  releaseZipFile,
  shareOrDownload,
  StreamingZip,
} from "./fs/zip";
import { parseHex, toHex } from "./stamp/color";
import { cloneStyle } from "./stamp/dateStampStyle";
import { stampFocusRect } from "./stamp/drawStamp";
import { FONTS } from "./stamp/fonts";
import { dateSourceLabel } from "./stamp/formatDate";
import { defaultOptions } from "./stamp/options";
import { StampWorkerPool } from "./stamp/pool";
import type { DateSource, StampOptions, StampPosition } from "./stamp/types";

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
} else {
  void navigator.serviceWorker?.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
}

type InputKind = "folder" | "photos";

const NO_DATE_FOLDER = "日付情報なし";

const options: StampOptions = defaultOptions();
let ioMode: IoMode = defaultIoMode(hasDirectoryPicker());
let inputKind: InputKind = ioMode === "pc" ? "folder" : "photos";
let onLanding = true;
let inputDir: FileSystemDirectoryHandle | null = null;
let outputDir: FileSystemDirectoryHandle | null = null;
let jobs: JobFile[] = [];
let previewObjectUrl: string | null = null;
let previewZoomUrl: string | null = null;
let running = false;
let previewTimer = 0;
let previewGen = 0;
let pendingZipShares: File[] = [];
const pool = new StampWorkerPool(isIosDevice() ? 1 : 2);
const PREVIEW_MAX_EDGE = 1600;
const IOS_RECYCLE_EVERY = 10;

const app = document.querySelector<HTMLDivElement>("#app")!;
const style = options.stampStyle;
const rgb0 = parseHex(style.color);

app.innerHTML = `
  <div class="phone-hero" id="hero">
    <button type="button" id="add-date" class="add-date-btn">Add date</button>
    <input id="pick-photos" class="file-cover sr-file" type="file" accept="image/*" multiple />
    <div id="source-chooser" class="source-modal" hidden>
      <button type="button" id="choose-back" class="source-modal-backdrop" aria-label="Close"></button>
      <div class="source-modal-card" role="dialog" aria-modal="true">
        <button type="button" id="choose-close" class="source-close" aria-label="Close">×</button>
        <div class="source-row">
          <button type="button" id="choose-folder" class="source-btn">Select folder</button>
          <button type="button" id="choose-photos" class="source-btn">Select photos</button>
        </div>
      </div>
    </div>
  </div>

  <div id="pick-waiting" class="pick-waiting" hidden>
    <button type="button" id="pick-waiting-back" class="pick-waiting-backdrop" aria-label="閉じる"></button>
    <div class="pick-waiting-card" role="status" aria-live="polite">
      <span class="pick-waiting-spinner" aria-hidden="true"></span>
      <p class="pick-waiting-title">写真を受け取っています…</p>
      <p class="pick-waiting-note">iCloud 上の写真はダウンロードに時間がかかることがあります。枚数が多いときは、そのままお待ちください。</p>
    </div>
  </div>

  <header class="workspace-bar">
    <button type="button" id="home" class="home-btn" aria-label="トップへ戻る" title="トップへ戻る">Add date</button>
  </header>

  <section class="grid">
    <div class="panel panel-io">
      <h2>入力</h2>
      <div data-input="folder">
        <h3 class="io-sub">フォルダ</h3>
        <p id="in-label" class="io-value">未選択</p>
        <label class="check">
          <input type="checkbox" id="recursive" />
          サブフォルダも含める
        </label>
      </div>
      <div data-input="photos">
        <h3 class="io-sub">写真</h3>
        <p id="photo-summary" class="io-value">未選択</p>
      </div>
      <p id="count" class="muted">画像 0 枚</p>

      <h2 class="io-heading">出力</h2>
      <div data-io="pc">
        <div class="row">
          <button type="button" id="pick-out">出力フォルダを選ぶ</button>
          <span id="out-label" class="muted">未選択</span>
        </div>
        <p class="hint">入力とは別のフォルダへ書き出します。原本はそのまま残ります。日付が取れない写真は「日付情報なし」フォルダへコピーします。</p>
      </div>
      <div data-io="phone">
        <p class="hint">実行すると、日付入り写真の ZIP を保存します。原本はそのまま残ります。日付が取れない写真は ZIP 内の「日付情報なし」フォルダへ入れます。枚数が多いときは ZIP が分かれます。</p>
      </div>
    </div>

    <div class="panel panel-stamp">
      <label class="date-source-row">
        日付の取り方
        <select id="date-source">
          <option value="exif" selected>${dateSourceLabel("exif")}</option>
          <option value="filename" disabled>${dateSourceLabel("filename")}</option>
          <option value="mtime" disabled>${dateSourceLabel("mtime")}</option>
          <option value="manual">${dateSourceLabel("manual")}</option>
        </select>
      </label>
      <label class="manual-date-row is-locked" id="manual-date-row">
        日付
        <input type="date" id="manual-date" value="${todayIso()}" disabled />
      </label>
      <label class="date-format-row">
        書式
        <select id="date-format">
          <option value="'YY M D" selected>'26  8 15</option>
        </select>
      </label>
      <label>
        位置
        <select id="position">
          <option value="bottom-right" selected>右下</option>
          <option value="bottom-left">左下</option>
          <option value="top-right">右上</option>
          <option value="top-left">左上</option>
        </select>
      </label>
      <label>
        フォント
        <select id="font">${FONTS.map((f) => `<option value="${f.id}">${f.name}</option>`).join("")}</select>
      </label>
      <div class="color-mix">
        <button type="button" id="color-open" class="color-swatch-btn">
          色
          <span class="color-swatch" id="color-swatch" style="background:${style.color}"></span>
        </button>
      </div>
      <div id="color-chooser" class="source-modal color-modal" hidden>
        <button type="button" id="color-back" class="source-modal-backdrop" aria-label="Close"></button>
        <div class="source-modal-card color-modal-card" role="dialog" aria-modal="true" aria-labelledby="color-title">
          <button type="button" id="color-close" class="source-close" aria-label="Close">×</button>
          <p id="color-title" class="color-modal-title">Color</p>
          <div class="preview-frame preview-zoom-frame color-preview-frame">
            <img id="color-zoom" alt="日付の拡大" hidden />
            <p id="color-zoom-empty" class="muted">日付部分を拡大して表示します</p>
          </div>
          <label>
            R <span id="r-val">${rgb0.r}</span>
            <input type="range" id="color-r" min="0" max="255" step="1" value="${rgb0.r}" />
          </label>
          <label>
            G <span id="g-val">${rgb0.g}</span>
            <input type="range" id="color-g" min="0" max="255" step="1" value="${rgb0.g}" />
          </label>
          <label>
            B <span id="b-val">${rgb0.b}</span>
            <input type="range" id="color-b" min="0" max="255" step="1" value="${rgb0.b}" />
          </label>
        </div>
      </div>
      <label>
        不透明度 <span id="opacity-val">${Math.round(style.opacity * 100)}%</span>
        <input type="range" id="opacity" min="0" max="100" step="1" value="${Math.round(style.opacity * 100)}" />
      </label>
      <label>
        にじみ（輪郭のぼかし） <span id="bloom-val">${style.bloomRadiusPx.toFixed(1)}</span>
        <input type="range" id="bloom" min="0" max="5" step="0.1" value="${style.bloomRadiusPx}" />
      </label>
      <label>
        明るさ補正 <span id="bright-val">${style.brightness}</span>
        <input type="range" id="brightness" min="-20" max="20" step="1" value="${style.brightness}" />
      </label>
      <label class="check">
        <input type="checkbox" id="auto-contrast" />
        自動コントラスト補正
      </label>
      <label>
        大きさ <input type="range" id="scale" min="0.018" max="0.08" step="0.001" value="${options.scale}" />
      </label>
    </div>

    <div class="panel preview-panel">
      <div class="preview-frame">
        <img id="preview" alt="プレビュー" hidden />
        <p id="preview-empty" class="muted">写真を選ぶと先頭の1枚を表示します</p>
      </div>
      <div class="preview-frame preview-zoom-frame">
        <img id="preview-zoom" alt="日付の拡大" hidden />
        <p id="preview-zoom-empty" class="muted">日付部分を拡大して表示します</p>
      </div>
      <p id="preview-meta" class="muted">画像 0 枚</p>
    </div>
  </section>

  <section class="run-bar">
    <div class="run-wrap">
      <button type="button" id="run" class="primary" disabled>実行</button>
      <span id="run-hint" class="run-hint" hidden>出力先を選んでください</span>
    </div>
    <div class="progress">
      <progress id="bar" value="0" max="1"></progress>
      <span id="status">待機中</span>
    </div>
  </section>
`;

const el = {
  home: $("#home"),
  pickOut: $("#pick-out"),
  inLabel: $("#in-label"),
  outLabel: $("#out-label"),
  photoSummary: $("#photo-summary"),
  pickPhotos: $("#pick-photos") as HTMLInputElement,
  hero: $("#hero"),
  addDate: $("#add-date"),
  pickWaiting: $("#pick-waiting"),
  pickWaitingBack: $("#pick-waiting-back"),
  chooser: $("#source-chooser"),
  chooseFolder: $("#choose-folder"),
  choosePhotos: $("#choose-photos"),
  chooseBack: $("#choose-back"),
  chooseClose: $("#choose-close"),
  recursive: $("#recursive") as HTMLInputElement,
  count: $("#count"),
  dateSource: $("#date-source") as HTMLSelectElement,
  manualDate: $("#manual-date") as HTMLInputElement,
  manualDateRow: $("#manual-date-row"),
  dateFormat: $("#date-format") as HTMLSelectElement,
  position: $("#position") as HTMLSelectElement,
  font: $("#font") as HTMLSelectElement,
  colorR: $("#color-r") as HTMLInputElement,
  colorG: $("#color-g") as HTMLInputElement,
  colorB: $("#color-b") as HTMLInputElement,
  colorSwatch: $("#color-swatch"),
  colorOpen: $("#color-open"),
  colorChooser: $("#color-chooser"),
  colorBack: $("#color-back"),
  colorClose: $("#color-close"),
  rVal: $("#r-val"),
  gVal: $("#g-val"),
  bVal: $("#b-val"),
  opacity: $("#opacity") as HTMLInputElement,
  opacityVal: $("#opacity-val"),
  bloom: $("#bloom") as HTMLInputElement,
  bloomVal: $("#bloom-val"),
  brightness: $("#brightness") as HTMLInputElement,
  brightVal: $("#bright-val"),
  autoContrast: $("#auto-contrast") as HTMLInputElement,
  scale: $("#scale") as HTMLInputElement,
  preview: $("#preview") as HTMLImageElement,
  previewEmpty: $("#preview-empty"),
  previewZoom: $("#preview-zoom") as HTMLImageElement,
  previewZoomEmpty: $("#preview-zoom-empty"),
  colorZoom: $("#color-zoom") as HTMLImageElement,
  colorZoomEmpty: $("#color-zoom-empty"),
  previewMeta: $("#preview-meta"),
  run: $("#run") as HTMLButtonElement,
  runHint: $("#run-hint"),
  bar: $("#bar") as HTMLProgressElement,
  status: $("#status"),
};

function $(id: string): HTMLElement {
  const node = document.querySelector(id);
  if (!node) throw new Error(`missing ${id}`);
  return node as HTMLElement;
}

function showLandingStart(): void {
  el.chooser.hidden = true;
}

function showPickWaiting(): void {
  el.pickWaiting.hidden = false;
}

function hidePickWaiting(): void {
  el.pickWaiting.hidden = true;
}

function showLandingChoose(): void {
  el.chooser.hidden = false;
}

function applyMode(): void {
  document.body.dataset.io = ioMode;
  document.body.dataset.input = inputKind;
  document.body.classList.toggle("landing", onLanding);
  if (onLanding) showLandingStart();
  void updateRunEnabled();
}

function setCountLabel(text: string): void {
  el.count.textContent = text;
  el.previewMeta.textContent = text;
}

function goHome(): void {
  onLanding = true;
  jobs = [];
  inputDir = null;
  outputDir = null;
  hidePickWaiting();
  el.inLabel.textContent = "未選択";
  el.outLabel.textContent = "未選択";
  el.photoSummary.textContent = "未選択";
  setCountLabel("画像 0 枚");
  pendingZipShares = [];
  void purgeOpfsZips();
  el.run.textContent = "実行";
  el.status.textContent = "待機中";
  el.pickPhotos.value = "";
  applyMode();
  void refreshPreview();
}

el.home.addEventListener("click", () => {
  goHome();
});

el.pickOut.addEventListener("click", () => {
  void pickPcOutput();
});

el.recursive.addEventListener("change", () => {
  void refreshFolderList();
});

el.addDate.addEventListener("click", () => {
  if (ioMode === "phone") {
    showPickWaiting();
    el.pickPhotos.click();
    return;
  }
  showLandingChoose();
});
el.chooseBack.addEventListener("click", () => {
  showLandingStart();
});
el.chooseClose.addEventListener("click", () => {
  showLandingStart();
});
el.chooseFolder.addEventListener("click", () => {
  if (!hasDirectoryPicker()) {
    el.status.textContent = "フォルダ選択に非対応です。Chrome / Edge を使ってください。";
    return;
  }
  ioMode = "pc";
  inputKind = "folder";
  void pickPcInput({ promptOutput: true });
});
el.choosePhotos.addEventListener("click", () => {
  showPickWaiting();
  el.pickPhotos.click();
});
el.pickWaitingBack.addEventListener("click", () => {
  hidePickWaiting();
});
function showColorChooser(): void {
  el.colorChooser.hidden = false;
  void refreshPreview();
}

function hideColorChooser(): void {
  el.colorChooser.hidden = true;
}

el.colorOpen.addEventListener("click", () => {
  showColorChooser();
});
el.colorBack.addEventListener("click", () => {
  hideColorChooser();
});
el.colorClose.addEventListener("click", () => {
  hideColorChooser();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.colorChooser.hidden) {
    hideColorChooser();
  }
});

el.pickPhotos.addEventListener("change", () => {
  hidePickWaiting();
  const list = el.pickPhotos.files;
  if (!list?.length) return;
  el.status.textContent = `${list.length} 枚を読み込み中…`;
  const selected = Array.from(list);
  window.setTimeout(() => {
    showLandingStart();
    inputDir = null;
    inputKind = "photos";
    const forced = ioModeFromQuery();
    ioMode = forced ?? (hasDirectoryPicker() && !isIosDevice() ? "pc" : "phone");
    jobs = jobsFromFiles(selected);
    onLanding = false;
    el.photoSummary.textContent = photoSummary(selected);
    setCountLabel(`画像 ${jobs.length} 枚`);
    applyMode();
    if (ioMode === "pc" && !outputDir) {
      el.status.textContent =
        "オリジナル画像を守るため、オリジナル画像とは別のフォルダを選んでください。";
    } else {
      el.status.textContent = "待機中";
    }
    void updateRunEnabled();
    void refreshPreview();
  }, 0);
});
el.pickPhotos.addEventListener("cancel", () => {
  hidePickWaiting();
});

for (const input of [
  el.dateSource,
  el.manualDate,
  el.dateFormat,
  el.position,
  el.font,
  el.colorR,
  el.colorG,
  el.colorB,
  el.opacity,
  el.bloom,
  el.brightness,
  el.autoContrast,
  el.scale,
]) {
  input.addEventListener("change", () => {
    readOptions();
    schedulePreview();
  });
  input.addEventListener("input", () => {
    readOptions();
    schedulePreview();
  });
}

el.run.addEventListener("click", () => {
  if (pendingZipShares.length) {
    void shareNextZip();
    return;
  }
  void runBatch();
});

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function syncManualDateRow(): void {
  const manual = el.dateSource.value === "manual";
  el.manualDate.disabled = !manual;
  el.manualDateRow.classList.toggle("is-locked", !manual);
}

function readOptions(): void {
  options.dateSource = el.dateSource.value as DateSource;
  options.manualDate = el.manualDate.value;
  options.dateFormat = el.dateFormat.value;
  syncManualDateRow();
  options.position = el.position.value as StampPosition;
  options.fontId = el.font.value;
  options.scale = Number(el.scale.value);
  const rgb = {
    r: Number(el.colorR.value),
    g: Number(el.colorG.value),
    b: Number(el.colorB.value),
  };
  const color = toHex(rgb);
  options.stampStyle = cloneStyle({
    ...options.stampStyle,
    color,
    opacity: Number(el.opacity.value) / 100,
    bloomRadiusPx: Number(el.bloom.value),
    brightness: Number(el.brightness.value),
    autoContrast: el.autoContrast.checked,
  });
  el.rVal.textContent = String(rgb.r);
  el.gVal.textContent = String(rgb.g);
  el.bVal.textContent = String(rgb.b);
  el.colorSwatch.style.background = color;
  el.opacityVal.textContent = `${el.opacity.value}%`;
  el.bloomVal.textContent = Number(el.bloom.value).toFixed(1);
  el.brightVal.textContent = String(el.brightness.value);
}

async function pickPcInput(opts?: { promptOutput?: boolean }): Promise<void> {
  if (!hasDirectoryPicker()) {
    el.status.textContent = "フォルダ選択に非対応です。Chrome / Edge を使ってください。";
    return;
  }
  try {
    const dir = await window.showDirectoryPicker({ mode: "read" });
    inputDir = dir;
    el.inLabel.textContent = dir.name;
    onLanding = false;
    await refreshFolderList();
    applyMode();
    if (opts?.promptOutput && !outputDir) {
      el.status.textContent =
        "オリジナル画像を守るため、オリジナル画像とは別のフォルダを選んでください。";
    }
  } catch (err) {
    if (isAbort(err)) return;
    el.status.textContent = pickerErrorMessage(err);
  }
}

async function pickPcOutput(): Promise<void> {
  if (!hasDirectoryPicker()) return;
  try {
    const dir = await window.showDirectoryPicker({ mode: "readwrite" });
    outputDir = dir;
    el.outLabel.textContent = dir.name;
    el.status.textContent = "待機中";
    await updateRunEnabled();
  } catch (err) {
    if (isAbort(err)) return;
    el.status.textContent = pickerErrorMessage(err);
  }
}

async function refreshFolderList(): Promise<void> {
  if (!inputDir) return;
  const listed = await listImages(inputDir, el.recursive.checked);
  jobs = listed.map((item) => ({
    name: item.name,
    relativePath: item.relativePath,
    getFile: () => item.handle.getFile(),
  }));
  setCountLabel(`画像 ${jobs.length} 枚（JPEG / PNG / WebP / HEIC）`);
  await refreshPreview();
  await updateRunEnabled();
}

function schedulePreview(): void {
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    void refreshPreview();
  }, 180);
}

function clearPreviewUrls(): void {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  if (previewZoomUrl) {
    URL.revokeObjectURL(previewZoomUrl);
    previewZoomUrl = null;
  }
}

function hideZoomPreview(message: string): void {
  for (const img of [el.previewZoom, el.colorZoom]) {
    img.hidden = true;
    img.removeAttribute("src");
  }
  el.previewZoomEmpty.hidden = false;
  el.previewZoomEmpty.textContent = message;
  el.colorZoomEmpty.hidden = false;
  el.colorZoomEmpty.textContent = message;
}

function showZoomImages(url: string): void {
  for (const img of [el.previewZoom, el.colorZoom]) {
    img.src = url;
    img.hidden = false;
  }
  el.previewZoomEmpty.hidden = true;
  el.colorZoomEmpty.hidden = true;
}

async function sampleBackdropFile(): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1067;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("preview canvas");
  }
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => {
      if (next) resolve(next);
      else reject(new Error("preview jpeg"));
    }, "image/jpeg", 0.85);
  });
  return new File([blob], "color-preview.jpg", { type: "image/jpeg" });
}

async function refreshPreview(): Promise<void> {
  if (running) return;
  const gen = ++previewGen;
  const stampOptions = { ...options, stampStyle: cloneStyle(options.stampStyle) };
  const previewJob = {
    id: 0,
    options: stampOptions,
    maxEdge: PREVIEW_MAX_EDGE,
  };

  if (!jobs[0]) {
    try {
      const file = await sampleBackdropFile();
      const result = await pool.run({
        ...previewJob,
        file,
        fileName: file.name,
        lastModified: Date.now(),
      });
      if (gen !== previewGen) return;
      el.preview.hidden = true;
      el.previewEmpty.hidden = false;
      el.previewEmpty.textContent = "写真を選ぶと先頭の1枚を表示します";
      if (result.ok) {
        await showZoomPreview(result.blob, stampOptions, gen);
      } else {
        hideZoomPreview("日付の拡大を作れませんでした");
      }
    } catch {
      if (gen !== previewGen) return;
      hideZoomPreview("日付の拡大を作れませんでした");
    }
    return;
  }

  const file = await jobs[0].getFile();
  if (gen !== previewGen) return;
  const result = await pool.run({
    ...previewJob,
    file,
    fileName: file.name,
    lastModified: file.lastModified,
  });
  if (gen !== previewGen) return;
  el.previewEmpty.hidden = true;
  if (result.ok) {
    clearPreviewUrls();
    previewObjectUrl = URL.createObjectURL(result.blob);
    el.preview.src = previewObjectUrl;
    el.preview.hidden = false;
    await showZoomPreview(result.blob, stampOptions, gen);
  } else {
    el.preview.hidden = true;
    el.previewEmpty.hidden = false;
    el.previewEmpty.textContent = `${jobs[0].name}: ${result.message}`;
    hideZoomPreview("日付部分を拡大して表示します");
  }
}

async function showZoomPreview(
  blob: Blob,
  stampOptions: StampOptions,
  gen: number,
): Promise<void> {
  const bitmap = await createImageBitmap(blob);
  if (gen !== previewGen) {
    bitmap.close();
    return;
  }
  const rect = stampFocusRect(bitmap.width, bitmap.height, stampOptions);
  const zoom = Math.max(2.5, Math.min(6, 720 / rect.width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(rect.width * zoom));
  canvas.height = Math.max(1, Math.round(rect.height * zoom));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    hideZoomPreview("拡大プレビューを作れませんでした");
    return;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  const crop = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.85);
  });
  if (gen !== previewGen) return;
  if (!crop) {
    hideZoomPreview("拡大プレビューを作れませんでした");
    return;
  }
  if (previewZoomUrl) {
    URL.revokeObjectURL(previewZoomUrl);
    previewZoomUrl = null;
  }
  previewZoomUrl = URL.createObjectURL(crop);
  showZoomImages(previewZoomUrl);
}

async function updateRunEnabled(): Promise<void> {
  if (pendingZipShares.length) {
    el.run.disabled = running;
    el.runHint.hidden = true;
    return;
  }
  if (ioMode === "phone") {
    el.run.disabled = running || jobs.length === 0;
    el.runHint.hidden = true;
    return;
  }
  const same =
    inputDir && outputDir ? await inputDir.isSameEntry(outputDir) : false;
  el.run.disabled = running || !outputDir || jobs.length === 0 || same;
  el.runHint.hidden = Boolean(outputDir);
  if (same) {
    el.status.textContent =
      "上書き防止のため、入力と出力は別フォルダを選んでください。";
  }
}

async function runBatch(): Promise<void> {
  if (jobs.length === 0 || running) return;
  if (ioMode === "pc") {
    if (!outputDir) return;
    if (inputDir && (await inputDir.isSameEntry(outputDir))) {
      el.status.textContent = "入力と出力が同じフォルダです。";
      return;
    }
  }

  running = true;
  el.run.disabled = true;
  el.bar.max = jobs.length;
  el.bar.value = 0;

  let done = 0;
  let ok = 0;
  const skipped: string[] = [];
  const failed: string[] = [];
  const phone = ioMode === "phone";
  const zipTotal = phone ? Math.ceil(jobs.length / PHONE_ZIP_MAX_FILES) : 0;
  let zip = phone ? new StreamingZip(phoneZipName(1, zipTotal)) : null;
  const readyZips: File[] = [];
  const usedNames = new Map<string, number>();
  const usedNoDateNames = new Map<string, number>();
  let noDateDir: FileSystemDirectoryHandle | null = null;
  const limit = phone || isIosDevice() ? 1 : 2;
  let batchError: unknown;

  try {
    await mapPool(jobs, limit, async (item, index) => {
      const file = await item.getFile();
      const result = await pool.run({
        id: index,
        file,
        fileName: file.name,
        lastModified: file.lastModified,
        options: { ...options, stampStyle: cloneStyle(options.stampStyle) },
      });
      if (isIosDevice()) pool.recycleEvery(IOS_RECYCLE_EVERY);
      if (result.ok) {
        const name = uniqueName(result.outputName, item.relativePath, index, usedNames);
        if (ioMode === "pc") {
          await writeJpeg(outputDir!, name, result.blob);
        } else if (zip) {
          await zip.add(name, result.blob);
          if (zip.count >= PHONE_ZIP_MAX_FILES && index < jobs.length - 1) {
            el.status.textContent = `ZIP ${readyZips.length + 1} を閉じています…`;
            readyZips.push(await zip.closeToFile());
            zip = new StreamingZip(phoneZipName(readyZips.length + 1, zipTotal));
          }
        }
        ok += 1;
      } else if (result.reason === "no-date") {
        const name = uniqueName(file.name, item.relativePath, index, usedNoDateNames);
        if (ioMode === "pc") {
          noDateDir ??= await ensureSubdir(outputDir!, NO_DATE_FOLDER);
          await writeJpeg(noDateDir, name, file);
        } else if (zip) {
          await zip.add(`${NO_DATE_FOLDER}/${name}`, file);
          if (zip.count >= PHONE_ZIP_MAX_FILES && index < jobs.length - 1) {
            el.status.textContent = `ZIP ${readyZips.length + 1} を閉じています…`;
            readyZips.push(await zip.closeToFile());
            zip = new StreamingZip(phoneZipName(readyZips.length + 1, zipTotal));
          }
        }
        skipped.push(`${item.name}: ${result.message}`);
      } else {
        failed.push(`${item.name}: ${result.message}`);
      }
      done += 1;
      el.bar.value = done;
      el.status.textContent = `${done} / ${jobs.length}（成功 ${ok}）`;
      await yieldUi();
    });

    if (zip && zip.count > 0) {
      el.status.textContent = "ZIP を作成しています…";
      readyZips.push(await zip.closeToFile());
      zip = null;
    }

    el.pickPhotos.value = "";

    if (readyZips.length) {
      const first = readyZips.shift()!;
      el.status.textContent =
        readyZips.length > 0
          ? `ZIP 1 / ${readyZips.length + 1} を保存…`
          : "ZIP を保存…";
      const outcome = await shareOrDownload(first);
      if (outcome !== "cancelled") {
        pendingZipShares = readyZips;
        forgetSavedZip(first, outcome);
      } else {
        pendingZipShares = [first, ...readyZips];
      }
      el.run.textContent = pendingZipShares.length
        ? `次の ZIP を保存（残り ${pendingZipShares.length}）`
        : "実行";
    }
  } catch (err) {
    batchError = err;
    if (zip) await zip.discard();
    el.status.textContent =
      err instanceof Error ? err.message : `処理に失敗しました: ${String(err)}`;
  } finally {
    running = false;
    await updateRunEnabled();
  }

  if (batchError) return;

  const summary = `完了: 成功 ${ok} / 日付なし ${skipped.length} / 失敗 ${failed.length}`;
  if (pendingZipShares.length) {
    el.status.textContent = `${summary}。続きの ZIP を保存してください。`;
  } else {
    el.status.textContent =
      ioMode === "phone" && ok > 0
        ? `${summary}。共有シートから「ファイル」に保存できます。`
        : summary;
  }
}

async function shareNextZip(): Promise<void> {
  const file = pendingZipShares[0];
  if (!file || running) return;
  running = true;
  el.run.disabled = true;
  el.status.textContent = `${file.name} を保存…`;
  try {
    const outcome = await shareOrDownload(file);
    if (outcome !== "cancelled") {
      pendingZipShares.shift();
      forgetSavedZip(file, outcome);
    }
  } finally {
    running = false;
    if (pendingZipShares.length) {
      el.run.textContent = `次の ZIP を保存（残り ${pendingZipShares.length}）`;
      el.status.textContent = `残り ${pendingZipShares.length} 個の ZIP があります。`;
    } else {
      el.run.textContent = "実行";
      el.status.textContent = "ZIP の保存が終わりました。共有シートから「ファイル」に保存できます。";
    }
    await updateRunEnabled();
  }
}

function forgetSavedZip(file: File, outcome: "shared" | "saved"): void {
  const delayMs = outcome === "saved" ? 30_000 : 0;
  void (async () => {
    await releaseZipFile(file, delayMs);
    if (pendingZipShares.length === 0) {
      await purgeOpfsZips();
    }
  })();
}

function phoneZipName(part: number, total: number): string {
  const stamp = new Date();
  const day = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}`;
  if (total <= 1) return `dated-photos-${day}.zip`;
  return `dated-photos-${day}-part${part}.zip`;
}

function yieldUi(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function uniqueName(
  outputName: string,
  relativePath: string,
  index: number,
  used: Map<string, number>,
): string {
  let name: string;
  if (ioMode === "phone") {
    const padded = String(index + 1).padStart(4, "0");
    name = `${padded}-${outputName}`;
  } else if (relativePath.includes("/")) {
    const safe = relativePath.replaceAll("/", "__").replace(/\.[^.]+$/, "");
    name = `${safe}.jpg`;
  } else {
    name = outputName;
  }
  const stem = name.replace(/\.[^.]+$/, "");
  const ext = name.slice(stem.length) || ".jpg";
  let candidate = name;
  let n = 0;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  used.set(candidate, 1);
  return candidate;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

function photoSummary(files: File[]): string {
  if (files.length === 0) return "未選択";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} ほか ${files.length - 1} 枚`;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function pickerErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === "SecurityError") {
    return "フォルダ選択はボタンを押した直後にだけ開けます。「出力フォルダを選ぶ」を押してください。";
  }
  return String(err);
}

if (ioMode === "pc" && !hasDirectoryPicker()) {
  ioMode = "phone";
}
syncManualDateRow();
applyMode();
void purgeOpfsZips();
