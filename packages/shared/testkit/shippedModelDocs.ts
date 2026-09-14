/**
 * 出貨的 `content/models/*.json` —— 離線呼叫端問「這顆是不是替身」時的**模型文件來源**（GH#1250）。
 *
 * ⭐ `standInBody.isStandInModel` 只有一條規則（看模型文件的 glb），⛔ 沒有種子退路；
 * 不載 registry 的測試要嘛把這裡讀到的文件逐顆傳進去，要嘛 {@link registerShippedModelDocs}
 * 灌進 `Models` registry（走跟瀏覽器同一條查法）。忘了做 ⇒ 判準當場丟錯，⛔ 不會靜靜換規則。
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Models } from "../src/content/registries";
import type { ModelDoc } from "../src/content";

export const SHIPPED_CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../content");

/** id → 模型文件（不含 `_` 開頭的 sidecar）。讀不到任何一份 ⇒ 丟錯（⛔ 空表會讓每一個答案都變成「不是替身」）。 */
export function readShippedModelDocs(contentDir: string = SHIPPED_CONTENT_DIR): Map<string, ModelDoc> {
  const dir = join(contentDir, "models");
  const out = new Map<string, ModelDoc>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as ModelDoc;
    if (typeof doc.id === "string") out.set(doc.id, doc);
  }
  if (out.size === 0) throw new Error(`⛔ ${dir} 讀不到任何模型文件 —— 下面每一個替身判斷都會在量空氣`);
  return out;
}

/** 把出貨的模型文件灌進 `Models` registry；回傳顆數。 */
export function registerShippedModelDocs(contentDir: string = SHIPPED_CONTENT_DIR): number {
  const docs = readShippedModelDocs(contentDir);
  for (const doc of docs.values()) Models.register(doc);
  return docs.size;
}
