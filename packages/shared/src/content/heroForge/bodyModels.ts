import { zModelDoc } from "../schema/model";
import { MODEL_VERSION_PREFIX } from "../schema/championModelVersions";

/** One selection rule for the Editor catalog and Main's trusted importer. */
export function heroBodyModelIds(documents: Iterable<readonly [string, unknown]>): string[] {
  const bound = new Set<string>();
  const models: Array<{ id: string; heroBody?: boolean }> = [];
  for (const [key, raw] of documents) {
    if (key.startsWith("champions/") && raw && typeof raw === "object" && "modelKey" in raw && typeof raw.modelKey === "string") {
      bound.add(raw.modelKey);
    } else if (key.startsWith("models/")) {
      const parsed = zModelDoc.safeParse(raw);
      if (parsed.success && key === `models/${parsed.data.id}`) models.push(parsed.data);
    }
  }
  // ⛔⛔ 凍結版本（`version.body.*`）**不是可挑的身體**。
  //
  // `ModelVersions.freeze()` 把來源位元組**逐位元組**複製成一份不可變的快照，
  // 檔名就是它的 sha256，而 `modelVersions.ts` 的 `verify()` 拿那個雜湊比對它。
  // ⇒ ⭐ 它是「某支英雄在某個時間點的身體」這個**歷史事實**，
  //   ⛔ 不是「一顆可以拿去給新英雄用的模型」。
  //
  // ⚠️ 而它們**每一顆都在 `bound` 裡**（英雄卡的 `modelKey` 指的就是它）
  // ⇒ 上面那條 `bound.has(model.id)` 會**全部放行** —— 這不是漏寫，
  //   是規則寫對了、而 `bound` 的成員在 2026-09 之後換了一種東西。
  //
  // ⭐ 量到的（2026-09-11）：編輯器清單 261 筆裡 **45 筆是凍結版本**，
  //   而後台下拉早就濾掉了（`apps/admin/src/contentApi.ts` 的
  //   `!entry.id.startsWith("version.body.")`）⇒ ⛔ **兩個面對同一個問題答案不同**。
  //   這一行讓它們一致。
  return [...new Set(models
    .filter((model) => !model.id.startsWith(MODEL_VERSION_PREFIX))
    .filter((model) => model.heroBody === true || (model.heroBody !== false && bound.has(model.id)))
    .map((model) => model.id))].sort();
}
