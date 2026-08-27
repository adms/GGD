/**
 * textureDedup — 🎽 **同一張貼圖被上傳 N 次**（GH#382 的真兇 · 連帶 GH#614 / #770）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 量到的事實（⛔ 不是推理）
 * ---------------------------------------------------------------------------
 * KayKit 的 `dungeon_texture`（**一張 15.4 KB 的 1024² PNG**）被**內嵌進 12 份
 * 出貨 prop**：`banner_shield_{blue,green,red,yellow}` · `barrel_small` · `chest`
 * · `crates_stacked` · `floor_tile_{large,small}` · `pillar` · `torch` ·
 * `torch_mounted`。每一份解碼成 RGBA8+mipmap 是 **5.33 MB**，而每一張戰鬥地圖用得到
 * 其中 6–10 件 ⇒ ⭐ **一張圖 32–53 MB 的重複 VRAM**，而 `model-budget` 的上限是 48 MB。
 *
 * ⇒ ⭐ 這正是 `tools/model-budget/baseline.json` 裡 **13 個場景的 `vramBytes`
 * 被記成「已接受」** 的原因。⛔ 它們不是「地標分母算錯」（那是 #382 票上的推測，
 * 而分母只影響 6 筆 **model** 列，⛔ 一筆 scene 列都動不到）——
 * 它們是**一個客戶端缺陷被寫進了預算，然後被棘輪收成「現實」**。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 為什麼 Babylon 自己沒有幫我們去重（逐行讀 7.54.3 的原始碼，⛔ 不是印象）
 * ---------------------------------------------------------------------------
 * Babylon **有** URL 去重：`BaseTexture._getFromCache()` 掃
 * `engine.getLoadedTexturesCache()`，比對 `url` / `generateMipMaps` /
 * `samplingMode` / `invertY` / `_useSRGBBuffer`，命中就 `incrementReferences()`
 * 並且**完全不上傳**（`Materials/Textures/baseTexture.js:499`）。
 *
 * ⚠️ 但 glTF 載入器餵給它的 URL 是**每一份 .glb 各自唯一**的：
 *
 * ```js
 * // @babylonjs/loaders/glTF/2.0/glTFLoader.js:1948
 * const name = image.uri || `${this._fileName}#image${image.index}`;
 * const dataUrl = `data:${this._uniqueRootUrl}${name}`;
 * ```
 *
 * ⇒ `data:/content/assets/models/props/pillar.glb#image0` 與
 *   `data:/content/assets/models/props/torch.glb#image0`
 *   是**兩個字串**，於是逐位元組相同的那張圖 **命中不了**，⇒ 12 次上傳。
 *
 * ⭐ 這一支就是把「字串比對」換成「**內容比對**」：載完之後用**我們自己算的
 * 圖片內容摘要**當鑰匙，把第 2…N 份的 `InternalTexture` 換成第 1 份的，
 * 走的是 Babylon 自己那條 `incrementReferences()` / 引用計數 `dispose()` 契約。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼共用的是 `InternalTexture` 而**不是** `Texture`
 * ---------------------------------------------------------------------------
 * ⛔ 共用 `Texture` 物件要走遍每一種材質插槽（albedo / bump / metallic /
 * emissive / opacity / lightmap…）去改指標 —— **漏掉一格 = 那張圖變黑**，
 * 而且漏掉哪一格不會有任何東西紅。
 *
 * ⭐ 共用 `InternalTexture` 是**外科手術**：每個 `Texture` 物件原封不動留在原本的
 * 材質上（`uScale` / `wrapU` / `coordinatesIndex` / `hasAlpha` 全部各自獨立），
 * 只有底下那塊 GPU 記憶體變成同一塊。⚠️ 這正是 `_getFromCache()` 命中時做的事，
 * ⛔ 不是我發明的招式。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 生命週期：註冊表**綁在 Scene 上**，⛔ 不是 engine
 * ---------------------------------------------------------------------------
 * `IntermissionScene` 每一回合建一個**全新的 Scene**。註冊表若綁 engine，第 2 回合的
 * 材質會指到第 1 回合**已經被 dispose 的** InternalTexture ⇒ ⭐ **整片變黑**。
 * ⇒ `WeakMap<Scene, …>`。而**同一個 Scene 之內** `AssetManager` 的 container 快取
 * **從不驅逐**（那支檔頭逐字寫著 "No LRU, no eviction: that is deliberate"）
 * ⇒ 正典那一份的壽命 ⩾ 借用它的每一份。
 *
 * ---------------------------------------------------------------------------
 * 🔁 一鍵 rollback（第一守則：我自己挑的，就要留一格可以回頭）
 * ---------------------------------------------------------------------------
 * ⚠️ 後台三個住處（`content/config` + Zod + admin）**不在這條 lane 的柵欄內**，
 * 所以這一格先落在客戶端可及的地方，⛔ 不是沒有開關：
 *   · `localStorage["ggd.textureDedup"] = "off"` ⇒ 重整後就是舊行為
 *   · console：`__ggdTextureDedup(false)` ⇒ 之後載入的模型不再共用
 * ⭐ 出貨預設 **on**（第〇·六守則：優先權大的更新後預設啟動）。
 * ⭐ 後續要補的三住處後台格子見報告。
 */
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";

/** localStorage 的一鍵回頭。⛔ 值是 `"off"` 才關 —— 打錯字一律當成「開」。 */
export const TEXTURE_DEDUP_STORAGE_KEY = "ggd.textureDedup";

let enabled = true;

/** 出貨預設 on。⛔ 關掉只是回到舊行為（每份 .glb 各自上傳），不會壞。 */
export function textureDedupEnabled(): boolean {
  return enabled;
}

export function setTextureDedupEnabled(next: boolean): void {
  enabled = next;
}

/**
 * 開機時讀一次 localStorage 的逃生口，並掛上 `__ggdTextureDedup()`。
 * ⚠️ 讀不到 storage（SSR / 隱私模式）**不是錯誤** —— 維持出貨預設。
 */
let initialised = false;
export function initTextureDedup(storage?: Pick<Storage, "getItem">): void {
  if (initialised && !storage) return;
  initialised = true;
  try {
    const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : undefined);
    if (store?.getItem(TEXTURE_DEDUP_STORAGE_KEY) === "off") enabled = false;
  } catch {
    /* storage 被擋掉 —— 維持預設 */
  }
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g === "object") {
    g.__ggdTextureDedup = (on?: boolean): TextureDedupStats => {
      if (typeof on === "boolean") setTextureDedupEnabled(on);
      return textureDedupStats();
    };
  }
}

export interface TextureDedupStats {
  enabled: boolean;
  /** 第 2…N 份被換成正典的次數 ＝ **省下來的上傳數**。 */
  shared: number;
  /** 註冊成正典的張數（＝真正唯一的圖片數）。 */
  canonical: number;
  /**
   * ⛔ 認不出來所以**沒有**去重的張數（`image.uri` 型、`.gltf` 分支、URL 不合格式）。
   * ⭐ 這一格存在是因為「fail-open 沒錯，**靜默**才是缺陷」——
   * 去重整個失效時它會是一個大數字，⛔ 不是一片安靜的 0。
   */
  skipped: number;
  /** 省下來的 GPU 位元組（RGBA8 + mipmap，`w×h×4×4/3`）。 */
  bytesSaved: number;
}

let shared = 0;
let canonical = 0;
let skipped = 0;
let bytesSaved = 0;

export function textureDedupStats(): TextureDedupStats {
  return { enabled, shared, canonical, skipped, bytesSaved };
}

/** 測試用 —— 出貨從不需要。 */
export function resetTextureDedupStats(): void {
  shared = 0;
  canonical = 0;
  skipped = 0;
  bytesSaved = 0;
}

// ---------------------------------------------------------------------------
// GLB 的圖片內容摘要
// ---------------------------------------------------------------------------

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/**
 * FNV-1a，兩個不同偏移量湊成 64 bit。
 *
 * ⛔ 刻意**不用** `crypto.subtle` —— 它是**非同步**的，而且只在 secure context
 * 才有；在載入路徑上換一個 await 是拿正確性換一個我們不需要的雜湊強度。
 * ⭐ 鑰匙裡另外**帶著長度與 mimeType**，所以碰撞要同時撞長度、mimeType 與兩條
 * FNV —— 而全案的圖片總數是**兩位數**。
 */
function digestOf(bytes: Uint8Array, from: number, to: number): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = from; i < to; i++) {
    const v = bytes[i]!;
    a = Math.imul(a ^ v, 0x01000193) >>> 0;
    b = Math.imul(b ^ v, 0x811c9dc5) >>> 0;
  }
  return `${a.toString(36)}${b.toString(36)}:${to - from}`;
}

/**
 * 逐 glTF **image 索引**算內容摘要。回傳的陣列與 `images[]` **同索引**，
 * 沒有 `bufferView` 的（外部 uri）留空字串。
 *
 * ⭐ 索引對齊是這一支能成立的關鍵：載入器把圖片索引寫進 `texture.url` 的
 * `#imageN` 尾巴，那就是我們把 Babylon 的貼圖接回自己的摘要的**唯一 join key**
 * （⛔ 不是靠 `name`，也⛔ 不是靠順序猜）。
 */
export function glbImageDigests(bytes: Uint8Array): string[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) return [];
  let off = 12;
  let json: Record<string, unknown> | null = null;
  let binFrom = -1;
  while (off + 8 <= bytes.byteLength) {
    const len = view.getUint32(off, true);
    const type = view.getUint32(off + 4, true);
    const from = off + 8;
    if (from + len > bytes.byteLength) break;
    if (type === CHUNK_JSON && json === null) {
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(from, from + len))) as Record<
        string,
        unknown
      >;
    } else if (type === CHUNK_BIN && binFrom < 0) {
      binFrom = from;
    }
    off = from + len;
  }
  if (!json || binFrom < 0) return [];
  const images = (json.images as { bufferView?: number; mimeType?: string }[] | undefined) ?? [];
  const views =
    (json.bufferViews as { byteOffset?: number; byteLength: number }[] | undefined) ?? [];
  return images.map((im) => {
    if (im.bufferView === undefined) return "";
    const v = views[im.bufferView];
    if (!v) return "";
    const start = binFrom + (v.byteOffset ?? 0);
    const end = start + v.byteLength;
    if (end > bytes.byteLength) return "";
    return `${im.mimeType ?? "?"}|${digestOf(bytes, start, end)}`;
  });
}

// ---------------------------------------------------------------------------
// 去重本體
// ---------------------------------------------------------------------------

/** 逐 Scene 一張表 —— ⛔ 不可以跨 Scene（見檔頭的「整片變黑」）。 */
const registries = new WeakMap<Scene, Map<string, BaseTexture>>();

/** `data:<rootUrl><file>.glb#image7` ⇒ `7`。認不出來就是認不出來，⛔ 不猜。 */
const IMAGE_INDEX_RE = /#image(\d+)$/;

/**
 * ⚠️ 鑰匙裡的四個旗標**逐字對到** `BaseTexture._getFromCache()` 比對的那幾格
 * （`baseTexture.js:499`）—— 多一格會白白少共用，少一格會把兩塊**設定不同**的
 * GPU 記憶體當成同一塊。⛔ 不要憑感覺加減。
 */
function signatureOf(digest: string, it: Record<string, unknown>): string {
  return [
    digest,
    it.generateMipMaps === true ? 1 : 0,
    String(it.samplingMode ?? ""),
    it.invertY === true ? 1 : 0,
    it._useSRGBBuffer === true ? 1 : 0,
  ].join("|");
}

/**
 * 讓這個 container 的貼圖與同一個 Scene 裡**內容相同**的貼圖共用同一塊 GPU 記憶體。
 * 回傳這一次共用掉幾張。
 *
 * ⚠️ 這支**永遠不擲例外**：去重失敗的正確結果是「多用一點 VRAM」，
 * ⛔ 不是「模型載不進來」。但失敗會記進 `skipped` —— ⛔ 靜默才是缺陷。
 */
export function shareDuplicateTextures(
  scene: Scene,
  container: AssetContainer,
  digests: readonly string[],
): number {
  if (!enabled || digests.length === 0) return 0;
  let reg = registries.get(scene);
  if (!reg) {
    reg = new Map();
    registries.set(scene, reg);
  }
  let n = 0;
  for (const tex of container.textures ?? []) {
    try {
      const m = IMAGE_INDEX_RE.exec(String((tex as { url?: string }).url ?? ""));
      const idx = m ? Number(m[1]) : -1;
      const digest = idx >= 0 ? digests[idx] : undefined;
      if (!digest) {
        skipped++;
        continue;
      }
      const mine = tex.getInternalTexture?.();
      if (!mine) {
        skipped++;
        continue;
      }
      const key = signatureOf(digest, mine as unknown as Record<string, unknown>);
      const prior = reg.get(key);
      const theirs = prior?.getInternalTexture?.();
      if (!prior || !theirs) {
        reg.set(key, tex);
        canonical++;
        continue;
      }
      if (theirs === mine) continue; // 已經是同一塊（Babylon 自己命中過了）
      // ⭐ 先 increment 再 dispose —— 反過來會讓引用數短暫歸零而釋放掉 GPU 資源。
      theirs.incrementReferences();
      (tex as unknown as { _texture: unknown })._texture = theirs;
      const w = mine.width || 0;
      const h = mine.height || 0;
      mine.dispose(); // 引用計數 —— 只有數到 0 才真的釋放
      bytesSaved += Math.round(w * h * 4 * (4 / 3));
      shared++;
      n++;
    } catch {
      skipped++; // ⛔ 一張圖去重失敗，⛔ 不可以帶走整個模型
    }
  }
  return n;
}
