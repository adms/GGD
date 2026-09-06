/**
 * 🧩 GH#990 —— 從**磁碟**讀 `content/vfx-subtypes/` 與 `content/vfx-scripts/` 並展開。
 *
 * ⚠️ 只給 node 側（測試／`tools/`）用 —— 它 import `node:fs`，⛔ 客戶端不要 import 這一檔
 * （客戶端走 `./expand` ＋ `VfxSubtypes` 登錄表）。
 *
 * 為什麼存在：好幾支守衛（`vfxScriptNoDoubleDraw` · `vfxNotSpawnedTwice` · `scriptSegmentDrops`…）
 * 直接 `readFileSync` 出貨 script 再讀 `segments[]`。script 改成呼叫式之後，那些掃描
 * 若仍讀原始 JSON 就會**靜默變瞎**（呼叫段沒有 `modelKey`／`vfxId`）——
 * ⭐ 一條靠缺陷才綠的守衛（CLAUDE.md 失敗形態⑩）。它們改讀這裡的展開結果。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { VfxScriptDoc, VfxScriptSegment } from "../schema/vfxScript";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";
import { expandVfxScriptEntries, type ExpandOptions, type VfxSubtypeResolver } from "./expand";

const jsonFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json") && f !== "_index.json")
        .sort()
    : [];

/** `content/vfx-subtypes/*.json`（原始 JSON，⛔ 沒有過 schema —— 守衛自己去 parse）。 */
export function readVfxSubtypesDir(dir: string): VfxSubtypeDoc[] {
  return jsonFiles(dir).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as VfxSubtypeDoc);
}

/** 以一個目錄當查表來源的 resolver。 */
export function vfxSubtypeResolverFromDir(dir: string): VfxSubtypeResolver {
  const byId = new Map(readVfxSubtypesDir(dir).map((d) => [d.id, d]));
  return (id) => byId.get(id);
}

/** 讀一支 script 檔並展開；`raw` 是磁碟上的樣子（可能含 call），`segments` 是播放器看到的。 */
export function readVfxScriptExpanded(
  scriptPath: string,
  resolve: VfxSubtypeResolver,
  opts: Omit<ExpandOptions, "scriptId"> = {},
): { raw: VfxScriptDoc; segments: VfxScriptSegment[] } {
  const raw = JSON.parse(readFileSync(scriptPath, "utf8")) as VfxScriptDoc;
  return { raw, segments: expandVfxScriptEntries(raw.segments, resolve, { ...opts, scriptId: raw.id }) };
}

/**
 * ⭐ 一次讀整個 `content/vfx-scripts/`（展開後）。`contentDir` ＝ repo 的 `content/`。
 * 回傳依檔名排序，⛔ 不含 `_index.json`。
 */
export function readAllVfxScriptsExpanded(
  contentDir: string,
  opts: Omit<ExpandOptions, "scriptId"> = {},
): { file: string; raw: VfxScriptDoc; segments: VfxScriptSegment[] }[] {
  const scriptsDir = join(contentDir, "vfx-scripts");
  const resolve = vfxSubtypeResolverFromDir(join(contentDir, "vfx-subtypes"));
  return jsonFiles(scriptsDir).map((file) => ({ file, ...readVfxScriptExpanded(join(scriptsDir, file), resolve, opts) }));
}
