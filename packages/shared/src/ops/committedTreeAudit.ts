/**
 * ⭐ 「只讀 git」那一族閘的**量尺** —— GH#1172（索引↔樹）與 GH#1180（bundle↔來源）共用。
 *
 * 住在獨立模組是為了讓探針／腳本也能 import（⛔ 從 .test.ts import 會把 vitest 拉進來）。
 * 輸入永遠是 `exportContentAt(rev)` 匯出的目錄 —— ⛔ 不是工作區（併行 lane 讓它永遠是髒的）。
 *
 * ⚠️ 為什麼 bundle 那一支比的是**雜湊**、⛔ 不是深比對 doc：
 *   builder 對舊格式的來源（例如早期的 `models/imported.*`）會**正規化**再內嵌 ⇒ 拿新版 builder
 *   對舊來源重建的 bundle，內嵌 doc ≠ 原始檔而它並沒有過期。⭐ builder 記在 `_index.json` 與
 *   bundle entry 裡的 `hash` 是 `hashDoc(它讀到的 doc)`；對 git 裡的來源重算同一個函式，
 *   相等 ⇒ 產物跟上了，不等 ⇒ 來源改了而產物沒重建 —— 這才是 GH#1180 的定義。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { hashDoc } from "../content/hash";

interface IndexDoc { collection?: string; hash?: string; entries: Array<{ id: string; path: string; hash: string }> }
interface Bundle { contentVersion?: string; collections: Record<string, { hash?: string; entries: Array<{ id: string; hash: string; doc: unknown }> }> }

export interface IndexAudit {
  /** 索引指名、樹裡沒有（方向①）—— 502 那一類（platform 開機讀不到檔）。 */
  missingFromTree: string[];
  /** 樹裡有、索引沒有（方向②）—— 上架了而玩家拿不到。 */
  missingFromIndex: string[];
  collections: number;
}

/** 掃一棵已匯出的 content/：每一個帶 `_index.json` 的目錄就是一個集合。⭐ 兩個方向都走（形態⑫）。 */
export function auditIndexes(content: string): IndexAudit {
  const missingFromTree: string[] = [];
  const missingFromIndex: string[] = [];
  let collections = 0;
  for (const coll of readdirSync(content).sort()) {
    const dir = join(content, coll);
    const idxPath = join(dir, "_index.json");
    if (!statSync(dir).isDirectory() || !existsSync(idxPath)) continue;
    collections++;
    const idx = JSON.parse(readFileSync(idxPath, "utf8")) as IndexDoc;
    const indexed = new Set<string>();
    for (const e of idx.entries) {
      indexed.add(e.path);
      if (!existsSync(join(content, e.path))) missingFromTree.push(`${e.path}  ← ${coll}/_index.json 指名它`);
    }
    // 方向②：集合目錄**第一層**的 *.json（⛔ 不含 `_` 開頭的產物、⛔ 不進子目錄）
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const rel = `${coll}/${f}`;
      if (!indexed.has(rel)) missingFromIndex.push(`${rel}  ← 樹裡有、${coll}/_index.json 沒有`);
    }
  }
  return { missingFromTree, missingFromIndex, collections };
}

export interface BundleAudit {
  /** `coll/id —— 為什麼` */
  stale: string[];
  entries: number;
  contentVersion?: string;
}

/** 對 git 樹裡的來源重算 `hashDoc`，和 commit 進去的 bundle／索引記的雜湊比。 */
export function auditBundle(content: string): BundleAudit {
  const bundle = JSON.parse(readFileSync(join(content, "bundle.json"), "utf8")) as Bundle;
  const stale: string[] = [];
  let entries = 0;
  for (const [coll, c] of Object.entries(bundle.collections)) {
    const idxPath = join(content, coll, "_index.json");
    if (!existsSync(idxPath)) continue;
    const idx = new Map((JSON.parse(readFileSync(idxPath, "utf8")) as IndexDoc).entries.map((e) => [e.id, e]));
    for (const e of c.entries) {
      entries++;
      const ie = idx.get(e.id);
      if (!ie) { stale.push(`${coll}/${e.id} —— bundle 有、_index.json 沒有`); continue; }
      const src = join(content, ie.path);
      if (!existsSync(src)) { stale.push(`${coll}/${e.id} —— 來源檔 ${ie.path} 不在樹裡`); continue; }
      const h = hashDoc(JSON.parse(readFileSync(src, "utf8")));
      if (h !== e.hash || h !== ie.hash) {
        stale.push(`${coll}/${e.id} —— 來源 ${ie.path} 的 hashDoc=${h}，bundle 記 ${e.hash}、索引記 ${ie.hash}（來源改了而產物沒重建）`);
      }
    }
  }
  return { stale, entries, contentVersion: bundle.contentVersion };
}
