/**
 * ⭐⭐ GH#966 —— **icon 轉檔規則的唯一住處**（第〇·四守則）。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────────
 * 128² · q90 · `cwebp` 這三件事只住在 `tools/icon-gen/convert-webp.mjs` 裡，
 * ⭐ 而 #966 要讓 **content-api 也轉一次同樣的檔**。
 * ⇒ ⛔ 抄第二份的症狀是「**編輯器預覽看到的圖 ≠ 遊戲裡的圖**」，
 *   ⚠️ 而**沒有任何東西會紅** —— 兩邊各自都跑得起來。
 * ⇒ ⭐ 所以 CLI 與 API **import 同一支**，改 quality 兩邊一起變。
 *
 * ── ⭐ 這一支刻意**不**引入任何影像函式庫 ──────────────────────────────────
 * `sniffImageHeader()` 只讀**檔頭**（PNG 的 IHDR／WebP 的 VP8 chunk／JPEG 的 SOFn），
 * ⛔ 一個像素都不解碼。理由是安全，⛔ 不是效能：
 *
 * ⚠️ ⭐ **圖片解壓炸彈** —— 一張宣稱 65535×65535 的 PNG 檔頭只有 24 bytes，
 * 壓縮後可能只有幾 KB（`checkZipSafety` 的壓縮比、entry 大小**全部過**），
 * ⛔ 而 `cwebp` 真的去 decode 它就是 12 GB 的記憶體。
 * ⇒ ⭐ 判準必須在 **decode 之前**問「你的檔頭說你有多大」，
 *   ⛔ 而不是「解開來看看多大」。
 *
 * ⚠️ 這與 zip bomb 是**不同的威脅面**：zip 那一層量的是**位元組**，
 * 這一層量的是**像素**。⛔ 一層擋不到另一層。
 */

/**
 * ⭐ 出貨的 icon 規格。**這是唯一住處** —— `tools/icon-gen/convert-webp.ts` 與
 * `apps/content-api` 都 import 它。
 *
 * ⚠️ 128 的出處是量到的，⛔ 不是挑的：全 app 顯示 icon 最大的地方是登入跑馬燈的
 * 頭像 **54 CSS px**（DPR 2 ⇒ 108 device px）⇒ 128² 在每一個使用點都還是過取樣。
 */
export const ICON_ENCODE = Object.freeze({
  /** 輸出邊長（正方）。 */
  edge: 128,
  /** `cwebp -q`。 */
  quality: 90,
});

/** 出貨 icon 落在 `content/` 底下的哪裡（⛔ 注意是 `icons` 複數 —— 既有慣例）。 */
export const ICON_OUTPUT_DIR = "assets/icons";

export type IconFormat = "png" | "webp" | "jpeg";

export interface IconHeader {
  readonly format: IconFormat;
  /** 由**位元組**推出來的 mime，⛔ 不是宣稱的那一格。 */
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

const MIME_OF: Readonly<Record<IconFormat, string>> = Object.freeze({
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
});

/** 副檔名 → 格式。⛔ 這只是**宣稱**，真相由 `sniffImageHeader()` 決定。 */
export const ICON_EXTENSIONS: Readonly<Record<string, IconFormat>> = Object.freeze({
  png: "png",
  webp: "webp",
  jpg: "jpeg",
  jpeg: "jpeg",
});

export const iconMimeOf = (f: IconFormat): string => MIME_OF[f];

const u32be = (b: Uint8Array, off: number): number =>
  ((b[off]! << 24) >>> 0) + (b[off + 1]! << 16) + (b[off + 2]! << 8) + b[off + 3]!;
const u16be = (b: Uint8Array, off: number): number => (b[off]! << 8) + b[off + 1]!;
const u16le = (b: Uint8Array, off: number): number => b[off]! + (b[off + 1]! << 8);
const u24le = (b: Uint8Array, off: number): number =>
  b[off]! + (b[off + 1]! << 8) + (b[off + 2]! << 16);
const ascii = (b: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...Array.from(b.subarray(from, to)));

/** PNG：magic ＋ 第一個 chunk 必須是 IHDR，長寬在 bytes 16..24。 */
function pngHeader(b: Uint8Array): IconHeader | null {
  if (b.length < 24) return null;
  if (u32be(b, 0) !== 0x89504e47 || u32be(b, 4) !== 0x0d0a1a0a) return null;
  if (ascii(b, 12, 16) !== "IHDR") return null;
  return { format: "png", mime: MIME_OF.png, width: u32be(b, 16), height: u32be(b, 20) };
}

/**
 * WebP：`RIFF....WEBP` ＋ 三種 chunk。
 * ⚠️ 三種的長寬**住在不同位置且用不同的位元寬度** —— ⛔ 統一用一個 offset 會讀出垃圾。
 */
function webpHeader(b: Uint8Array): IconHeader | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 12) !== "WEBP") return null;
  const chunk = ascii(b, 12, 16);
  const mk = (width: number, height: number): IconHeader => ({
    format: "webp",
    mime: MIME_OF.webp,
    width,
    height,
  });
  if (chunk === "VP8 ") {
    // 有損：3 bytes frame tag ＋ 3 bytes sync code(9D 01 2A) ⇒ 長寬各 14 bit。
    if (b.length < 30 || b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return mk(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    // 無損：signature 0x2f，接著 14+14 bit（各 −1）。
    if (b[20] !== 0x2f) return null;
    const bits = u16le(b, 21) + (b[23]! << 16) + (b[24]! << 24);
    return mk((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") {
    // 擴充：canvas 長寬是 24-bit LE（各 −1）。
    if (b.length < 30) return null;
    return mk(u24le(b, 24) + 1, u24le(b, 27) + 1);
  }
  return null;
}

/**
 * JPEG：走 marker 串到 SOFn。
 * ⚠️ ⭐ SOF 有 **16 個**（C0…CF），而 **C4/C8/CC 不是**（DHT／JPG／DAC）——
 * ⛔ 只認 `FFC0` 會把 progressive JPEG（`FFC2`）讀成「認不出來」。
 */
function jpegHeader(b: Uint8Array): IconHeader | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < b.length) {
    if (b[off] !== 0xff) return null;
    const marker = b[off + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const len = u16be(b, off + 2);
    if (len < 2) return null;
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return {
        format: "jpeg",
        mime: MIME_OF.jpeg,
        height: u16be(b, off + 5),
        width: u16be(b, off + 7),
      };
    }
    off += 2 + len;
  }
  return null;
}

/**
 * ⭐⭐ **magic bytes ＋ 檔頭長寬**，⛔ 一個像素都不 decode。
 * 認不出來回 `null` —— ⭐ 呼叫端必須把 `null` 當成**拒絕**，⛔ 不是「當作 PNG 試試看」。
 */
export function sniffImageHeader(bytes: Uint8Array): IconHeader | null {
  return pngHeader(bytes) ?? webpHeader(bytes) ?? jpegHeader(bytes);
}

/** ⭐ `tools/icon-gen` 的選檔仍然只要 PNG 長寬 —— 保留一支窄的門面。 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const h = pngHeader(bytes);
  return h === null ? null : { width: h.width, height: h.height };
}

export interface EncodeIconOptions {
  readonly edge?: number;
  readonly quality?: number;
  /**
   * ⭐ 保留透明背景（`cwebp` 的**預設行為**）。
   * ⚠️ 剝掉 alpha 會讓設計師做不出舊 w3x 那種去背風格 —— 出貨 119 份 legacy PNG
   * 正是靠 alpha 疊在技能格上。⇒ 預設 `true`。
   */
  readonly preserveAlpha?: boolean;
  /** 測試注入用；預設真的跑 `cwebp`。 */
  readonly run?: (args: readonly string[]) => void;
}

export class IconEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IconEncodeError";
  }
}
/**
 * ⚠️⚠️ ⭐ **這個檔刻意不 import 任何 `node:` 模組。**
 *
 * ── 📏 為什麼（2026-09-04 實際打壞了客戶端）──────────────────────────────
 * `schema/config/iconUpload.ts` 從這裡拿 `ICON_ENCODE`，⭐ 而 **config schema 是
 * 客戶端會載入的東西** ⇒ 它把整個檔一起拉進瀏覽器的 import 圖
 * ⇒ vite 對 `node:child_process` 只能 externalize ⇒ ⛔ **首次繪製就擲例外**：
 *
 *     Module "node:child_process" has been externalized for browser compatibility.
 *     Cannot access "node:child_process.execFileSync" in client code.
 *
 * ⚠️ 而它壞的**不只是驗收頁** —— 真的遊戲客戶端也是一樣的錯（實測）。
 *
 * ⇒ ⭐ **常數與純函式住這裡**（瀏覽器、sim、產生器、content-api 都讀得到），
 *   ⭐ **真的去跑 `cwebp` 的那一支住 `encodeIconNode.ts`**（只有 Node 側 import）。
 * ⛔ 這**不是**把知識拆成兩份（第〇·四）：`ICON_ENCODE`（128² · q90）仍然只有
 *   一個住處 —— 分開的是**執行環境**，⛔ 不是那份知識。
 */
