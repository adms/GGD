/**
 * 面向量測的 CLI 外殼 —— ⭐ 給 `model_intake.py` 的第 ⑥ 項用（GH#1272）。
 *
 * ⭐ 量測本身**一行都不在這裡**：它住 `packages/shared/src/content/modelUpload/facing.ts`，
 * 與後台／編輯器匯入（`normalize.ts`）讀的是**同一份**（第〇·四守則：值只有一個住處）。
 * ⛔ 不要在 python 裡重寫一份 —— 那是第二個住處，而兩份量尺一定會各自漂，
 * ⚠️ 而且漂掉的症狀是「入庫說 OK、普查說側著走」這種**互相矛盾的綠燈**。
 * （同一個形狀的前例就在隔壁：`model_selection_keys.mts` 的檔頭。）
 *
 * 用法：`node --import tsx tools/w3x-import/model_facing.mts <content 目錄> <glb…>`
 * 輸出一行 JSON：`{ "<glb 絕對路徑>": { kind, requiredYawOffsetDeg, declaredYawOffsetDeg,
 *                                        mismatch, n, coherence, axial, docId, why } }`
 *
 * ⚠️ `declaredYawOffsetDeg` 是**出貨文件**那一格（`content/models/*.json` 的 `yawOffsetDeg`）。
 * ⛔ 文件沒宣告時回 `null`，⭐ 而**不是 0** —— 「沒有覆寫、走家族預設」與「明確填 0」
 * 是兩件事，混起來會讓 `imported.heropika` 那一族（刻意不覆寫）每一次都被報成不一致。
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { measureFacing } from "../../packages/shared/src/content/modelUpload/facing";
import type { GlbDocument } from "../../packages/shared/src/content/modelUpload/glb";

const [contentDir, ...files] = process.argv.slice(2);
if (!contentDir) throw new Error("要給 content 目錄（⛔ 不猜預設值：讀錯樹與讀到空樹長得一樣）");

/** 只讀 JSON 區段的最小 GLB 讀取器 —— ⛔ 不解碼幾何（量面向只要 `nodes`）。 */
function readGlbJson(file: string): Pick<GlbDocument, "nodes"> | null {
  const buf = readFileSync(file);
  if (buf.length < 12 || buf.readUInt32LE(0) !== 0x46546c67) return null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len))) as Pick<GlbDocument, "nodes">;
    }
    off += 8 + len;
    off += (4 - (off % 4)) % 4;
  }
  return null;
}

// 出貨文件的 `yawOffsetDeg`，以 .glb 的絕對路徑為鍵。
const declared = new Map<string, { id: string; yawOffsetDeg: number | null }>();
const modelsDir = join(contentDir, "models");
if (existsSync(modelsDir)) {
  for (const name of readdirSync(modelsDir).sort()) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(modelsDir, name), "utf8")) as { id?: unknown; glbPath?: unknown; yawOffsetDeg?: unknown };
    if (typeof doc.glbPath !== "string") continue;
    declared.set(resolve(contentDir, doc.glbPath), {
      id: typeof doc.id === "string" ? doc.id : name.slice(0, -5),
      yawOffsetDeg: typeof doc.yawOffsetDeg === "number" ? doc.yawOffsetDeg : null,
    });
  }
}

const out: Record<string, unknown> = {};
for (const file of files) {
  const abs = resolve(file);
  const doc = declared.get(abs);
  let json: Pick<GlbDocument, "nodes"> | null = null;
  try {
    json = readGlbJson(abs);
  } catch (error) {
    out[abs] = { kind: "unreadable", why: String((error as Error).message ?? error) };
    continue;
  }
  if (!json) { out[abs] = { kind: "unreadable", why: "不是 GLB 或沒有 JSON 區段" }; continue; }
  const verdict = measureFacing(json);
  const required = verdict.kind === "measured" ? verdict.requiredYawOffsetDeg : null;
  const declaredDeg = doc?.yawOffsetDeg ?? null;
  out[abs] = {
    kind: verdict.kind,
    docId: doc?.id ?? null,
    requiredYawOffsetDeg: required,
    declaredYawOffsetDeg: declaredDeg,
    // ⛔ 只有「文件真的宣告了一個角度」而且「量得出來」時才比 —— 見檔頭。
    mismatch: required !== null && declaredDeg !== null && required !== ((declaredDeg % 360) + 360) % 360,
    n: verdict.kind === "measured" ? verdict.chirality.n : verdict.kind === "few-pairs" || verdict.kind === "incoherent" ? verdict.n : null,
    coherence: verdict.kind === "measured" ? verdict.chirality.coherence : verdict.kind === "incoherent" ? verdict.coherence : null,
    axial: verdict.kind === "measured" ? verdict.axial : null,
  };
}
process.stdout.write(JSON.stringify(out));
