/**
 * 出貨內容樹的**單次載入**夾具 —— 測試用，⛔ 不出貨。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼存在（量到的，⛔ 不是假設）
 * ─────────────────────────────────────────────────────────────────────────────
 * `packages/shared` 有 66 支測試各自打
 *
 *     await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()
 *
 * 而那一行是 **1 份 manifest + 14 份 `_index.json` + 1,712 份文件 = 1,727 次
 * `readFile`**。另外還有 50+ 支測試自己抄了一份 `readdirSync + readFileSync` 的
 * `docs(collection)` helper（同一段程式碼在 repo 裡有 20 份以上的複本）。
 *
 * 量到的（2026-08-23，M-series，暖快取）：
 *
 *   | 路徑                                   | 冷 (第一次) | 暖    |
 *   |----------------------------------------|------------|-------|
 *   | `ContentLoader` + `FsContentSource`    | 347 ms     | 200 ms|
 *   | `ContentLoader` + 本檔的 bundle 來源    | 115 ms     |  74 ms|
 *
 * ⚠️ vitest 的預設是 `isolate: true` + forks pool ⇒ **每一支測試檔一個全新
 * 行程**（實測：三支探針測試拿到三個不同 pid，`globalThis` 不共用）。
 * ⇒ 省的是「每一個行程的第一次」那一份，⛔ 不是「整套只做一次」。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 誰**不可以**改用這一支
 * ─────────────────────────────────────────────────────────────────────────────
 * 判準（owner 2026-08-23）：
 *
 *   驗的是**打包器 / 索引 / 版控** → 它必須讀**檔案樹**
 *   驗的是**內容本身**             → 它讀 bundle
 *
 * 所以這三支**永遠**留在檔案樹上，⛔ 不要「順手」改過來：
 *   · `shippedBundleIsCurrent.test.ts`        —— 它的工作就是抓「bundle 過期」
 *   · `shippedBundleHasTrackedSources.test.ts`—— 它的工作就是抓「來源沒進版控」
 *   · `bundle.test.ts`                        —— 它在 `cpSync` 的 temp 樹上重建打包器
 * 改掉任何一支 = 把 2026-08-01 與 08-02 兩次生產事故的閘拆了。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ 過期的 bundle 不會讓測試說謊 —— 它只會讓測試變慢
 * ─────────────────────────────────────────────────────────────────────────────
 * `icons.test.ts` 的檔頭記著一條真的限制：「索引只有主 session 會跑
 * `content:build` 重建，測試在重建前後都必須是綠的」。而併行 lane 的規則
 * ⛔ 禁止 lane 自己跑 `content:build` ⇒ 一個剛編過 `content/` 的 lane 手上的
 * bundle **一定**是舊的。
 *
 * ⇒ 這裡**不是** fail-open，也不是 fail-loud，而是 **fail-slow**，兩段（見
 * `bundleMatchesSources()`）：① 11 ms 的 mtime 掃描列出**嫌疑名單**，
 * ② 嫌疑的那幾份**真的讀出來比 `hashDoc`**。
 * 全部對得上 → 走 bundle（快）；有一份對不上 → **自動退回讀檔案樹**（慢，但相同）。
 *
 * ⚠️ ②**不是**多餘的：2026-08-23 量到另一條 lane 的產生器把兩份 config
 * **原樣重寫**（`git status` 乾淨，位元組一個都沒變），mtime 卻往前跳
 * ⇒ 純 mtime 的判準會讓整批測試**永遠**走慢路，而且從外面完全看不出來。
 *
 * ⚠️ 這與 CLAUDE.md 罵的那種 fail-open **不同型**：那一種退回的是**別的語意**
 * （骨架英雄 / 沒錄到影），這一種退回的是**同一份資料的另一條讀法**。
 * 唯一會漂的東西是 wall-clock，而 `shippedContent.test.ts` 逐份比對
 * 兩條路的輸出，所以「同一份資料」不是一句散文。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 文件物件是**共用**的
 * ─────────────────────────────────────────────────────────────────────────────
 * `shippedDocs()` 回傳的是記憶體裡那一份（跟出貨的 `BundleContentSource` 一樣，
 * 它也是把 `entry.doc` 直接交出去）。同一支測試檔裡改了它，後面的 `it()` 會看到。
 * ⛔ 不要改；要改就自己 `structuredClone`。
 * （`ContentLoader` 那條路不受影響 —— zod `.parse()` 本來就回新物件。）
 *
 * ⚠️ 還有一個**唯一**的差別：bundle 是用 `stableStringify` 序列化的，所以從
 * bundle 讀回來的文件**鍵是排序過的**，磁碟上的則是作者寫的順序（`-0` 也會變 `0`，
 * 見 `bundle.ts` 檔頭）。內容定址系統從第一天起就把兩者當成同一份文件
 * （`hashDoc` 也走 `stableStringify`），出貨的瀏覽器端拿到的也正是排序過的那一份。
 * ⛔ 但如果某支測試真的依賴**作者寫的鍵序**（例：拿 `Object.keys()[0]` 當「第一個
 * 欄位」），它就不可以改用這一支 —— 那是一個檔案格式的斷言，不是內容斷言。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTENT_BUNDLE_FILE,
  indexFromBundle,
  manifestFromBundle,
  parseContentBundle,
  type ContentBundle,
} from "../bundle";
import { hashDoc } from "../hash";
import { FsContentSource } from "../node/FsContentSource";
import { COLLECTION_NAMES, type CollectionName } from "../schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "../types";

/** repo 根的 `content/` —— 出貨的那一棵樹。 */
export const SHIPPED_CONTENT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content",
);

/** 一份文件在檔案樹上的樣子：`<collection>/<id>.json`，`_` 開頭的不是文件。 */
function isDocFile(name: string): boolean {
  return name.endsWith(".json") && !name.startsWith("_");
}

/**
 * bundle 裡的內容，跟磁碟上的來源檔是不是同一份？**兩段**，⛔ 不是一段。
 *
 * ① **mtime 掃描**（1,712 次 `statSync`，量到 11 ms，⛔ 不讀內容也不 parse）
 *    ⛔ 只看目錄的 mtime 不夠 —— 就地改一份 JSON 不會動到目錄的 mtime。
 *
 * ② ⭐ **可疑的那幾份，真的讀出來比雜湊**
 *    ⚠️ 這一段是量出來才加的：2026-08-23 另一條 lane 的產生器把兩份 config
 *    **原樣重寫**（`git status` 乾淨，位元組一個都沒變），mtime 卻往前跳了
 *    —— 於是純 mtime 的判準把 bundle 判成過期，整批測試永遠走慢路。
 *    ⇒ mtime 只當**便宜的嫌疑名單**，判決由 `hashDoc` 下（那正是 bundle 自己
 *    記在 `entry.hash` 裡的那個雜湊）。嫌疑名單通常是 0–5 份，⛔ 不是 1,712 份。
 *
 * ⇒ 「假過期」被治好，而「真過期」仍然一定會被抓到（雜湊對不上 / 多一份 / 少一份）。
 */
function bundleMatchesSources(): boolean {
  let bundleMs: number;
  try {
    bundleMs = statSync(join(SHIPPED_CONTENT_DIR, CONTENT_BUNDLE_FILE)).mtimeMs;
  } catch {
    return false; // 連 bundle 都沒有 ⇒ 只能讀樹
  }
  const suspects: Array<{ collection: CollectionName; id: string; path: string }> = [];
  for (const collection of COLLECTION_NAMES) {
    const dir = join(SHIPPED_CONTENT_DIR, collection);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue; // 這個集合沒有目錄（合法：空集合）
    }
    for (const name of names) {
      if (!isDocFile(name)) continue;
      const path = join(dir, name);
      if (statSync(path).mtimeMs > bundleMs) {
        suspects.push({ collection, id: name.slice(0, -".json".length), path });
        // 嫌疑一多就別再問了 —— 那多半是真的重建過，讀樹比較快。
        if (suspects.length > 32) return false;
      }
    }
  }
  if (suspects.length === 0) return true;
  let bundle: ContentBundle;
  try {
    bundle = shippedBundle();
  } catch {
    return false; // bundle 讀不動 / 格式不認得 ⇒ 讀樹
  }
  for (const s of suspects) {
    const entry = bundle.collections[s.collection]?.entries.find((e) => e.id === s.id);
    if (entry === undefined) return false; // 新增的文件還沒進 bundle
    try {
      if (hashDoc(JSON.parse(readFileSync(s.path, "utf8")) as object) !== entry.hash) return false;
    } catch {
      return false;
    }
  }
  return true;
}

let freshCache: boolean | null = null;
/**
 * 這個行程要走 bundle 還是檔案樹？（memoized —— 一個行程只掃一次）
 *
 * 匯出是給 `shippedContent.test.ts` 用的：它要能問「現在走的是哪一條」。
 */
export function shippedBundleIsFresh(): boolean {
  if (freshCache === null) freshCache = bundleMatchesSources();
  return freshCache;
}

let bundleCache: ContentBundle | null = null;
function shippedBundle(): ContentBundle {
  if (bundleCache === null) {
    const raw = readFileSync(join(SHIPPED_CONTENT_DIR, CONTENT_BUNDLE_FILE), "utf8");
    bundleCache = parseContentBundle(JSON.parse(raw) as unknown);
  }
  return bundleCache;
}

/** 檔案樹那一條路：`<collection>/*.json`，依**檔名**排序（＝舊 helper 的順序）。 */
function docsFromTree(collection: CollectionName): Array<{ id: string; doc: unknown }> {
  const dir = join(SHIPPED_CONTENT_DIR, collection);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter(isDocFile)
    .sort()
    .map((name) => ({
      id: name.slice(0, -".json".length),
      doc: JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown,
    }));
}

/** bundle 那一條路。⚠️ 依**檔名**排序，跟 `docsFromTree` 對齊（bundle 自己是依 id）。 */
function docsFromBundle(collection: CollectionName): Array<{ id: string; doc: unknown }> {
  const col = shippedBundle().collections[collection];
  if (!col) return [];
  return col.entries
    .map((e) => ({ id: e.id, doc: e.doc }))
    .sort((a, b) => (`${a.id}.json` < `${b.id}.json` ? -1 : 1));
}

const docsCache = new Map<CollectionName, Array<{ id: string; doc: unknown }>>();
function entriesOf(collection: CollectionName): Array<{ id: string; doc: unknown }> {
  let hit = docsCache.get(collection);
  if (hit === undefined) {
    hit = shippedBundleIsFresh() ? docsFromBundle(collection) : docsFromTree(collection);
    docsCache.set(collection, hit);
  }
  return hit;
}

/**
 * 一個集合裡出貨的每一份文件，依**檔名**排序（＝ `readdirSync(...).sort()` 的順序）。
 *
 * ⛔ 回傳的物件是共用的（見檔頭）—— 要改先自己 clone。
 */
export function shippedDocs<T = Record<string, unknown>>(collection: CollectionName): T[] {
  return entriesOf(collection).map((e) => e.doc) as T[];
}

/** 同上，但帶著檔名 —— 給那些用「哪一個檔壞了」當失敗訊息的測試。 */
export function shippedDocFiles<T = Record<string, unknown>>(
  collection: CollectionName,
): Array<{ file: string; doc: T }> {
  return entriesOf(collection).map((e) => ({ file: `${e.id}.json`, doc: e.doc as T }));
}

/** `id → doc`。 */
export function shippedDocMap<T = Record<string, unknown>>(
  collection: CollectionName,
): Map<string, T> {
  return new Map(entriesOf(collection).map((e) => [e.id, e.doc as T]));
}

/** 記憶體 `ContentSource` —— `readManifest` / `readIndex` / `readObject` 都不碰磁碟。 */
class ShippedBundleSource implements ContentSource {
  private readonly byId = new Map<CollectionName, Map<string, unknown>>();

  async readManifest(): Promise<Manifest> {
    return manifestFromBundle(shippedBundle());
  }

  async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    const bundle = shippedBundle();
    if (!bundle.collections[collection]) {
      return { collection, hash: "0".repeat(12), entries: [] };
    }
    return indexFromBundle(bundle, collection);
  }

  async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
    let map = this.byId.get(collection);
    if (map === undefined) {
      map = new Map(entriesOf(collection).map((e) => [e.id, e.doc]));
      this.byId.set(collection, map);
    }
    if (!map.has(entry.id)) throw new Error(`shipped fixture: ${collection}/${entry.id} 不存在`);
    return map.get(entry.id);
  }
}

let sourceCache: ContentSource | null = null;

/**
 * ⭐ 檔案樹那一條路的來源 —— `_index.json` 先跟**真的目錄**對帳（GH#688 Phase 5）。
 *
 * `_index.json` 與 `bundle.json` 是**同一支產生器的兩份產物**，而這個夾具的
 * 存在理由就是「bundle 過期時退回讀樹」。⛔ 但舊的退路 `FsContentSource` 讀的
 * 索引**還是那個產物** —— 於是併行批次裡新增一份文件（產物由主 session 統一
 * 重生成，CLAUDE.md 併行鎖）會讓退路也看不見它，硬參照它的每一份文件被
 * 隔離連坐（量到的：09-04 綁上兩份新 model doc ⇒ 悟空整隻被隔離 ⇒
 * ~20 支引用他的測試在 sync 之前全紅）。⇒ 退路要對齊 `docsFromTree` 的語意：
 * **目錄是真相** —— 索引缺的檔補上、索引多的（已刪的）拿掉。
 * ⭐ 自我過期：`content:build` 落地後索引與目錄一致，這一段是 no-op。
 */
class WorkingTreeFsSource extends FsContentSource {
  override async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    let idx: CollectionIndex;
    try {
      idx = await super.readIndex(collection);
    } catch {
      idx = { collection, hash: "0".repeat(12), entries: [] };
    }
    const dir = join(SHIPPED_CONTENT_DIR, collection);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return idx;
    }
    const onDisk = new Set(names.filter(isDocFile));
    const entries: IndexEntry[] = idx.entries.filter((e) => onDisk.has(`${e.id}.json`));
    const listed = new Set(entries.map((e) => e.id));
    for (const name of [...onDisk].sort()) {
      const id = name.slice(0, -".json".length);
      if (listed.has(id)) continue;
      entries.push({
        id,
        path: `${collection}/${name}`,
        hash: hashDoc(JSON.parse(readFileSync(join(dir, name), "utf8")) as object),
        size: statSync(join(dir, name)).size,
      });
    }
    return { ...idx, entries };
  }
}

/**
 * `new FsContentSource(dir)` 的 drop-in 替身。
 *
 * ⭐ `rootDir` 不是出貨那棵樹時（temp 樹、`_legacy/`、夾具樹）**原封不動退回
 * `FsContentSource`** —— 所以 `bundle.test.ts` 那種在 `cpSync` 樹上跑的測試
 * 就算改用這個名字，行為也逐位元組不變。
 */
export function shippedContentSource(rootDir: string = SHIPPED_CONTENT_DIR): ContentSource {
  if (resolve(rootDir) !== SHIPPED_CONTENT_DIR) return new FsContentSource(rootDir);
  if (!shippedBundleIsFresh()) return new WorkingTreeFsSource(SHIPPED_CONTENT_DIR);
  if (sourceCache === null) sourceCache = new ShippedBundleSource();
  return sourceCache;
}

/** 測試專用：把這個行程的記憶忘掉（`shippedContent.test.ts` 要比對兩條路）。 */
export function __resetShippedContentCache(): void {
  freshCache = null;
  bundleCache = null;
  sourceCache = null;
  docsCache.clear();
}

/** 測試專用：⛔ 強制走檔案樹那一條路（比對用）。 */
export function __docsFromTreeForTest(collection: CollectionName): Array<{
  id: string;
  doc: unknown;
}> {
  return docsFromTree(collection);
}
