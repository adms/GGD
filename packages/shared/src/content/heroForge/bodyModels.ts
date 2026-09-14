import { zModelDoc } from "../schema/model";
import { MODEL_VERSION_PREFIX } from "../schema/championModelVersions";

/** One selection rule for the Editor catalog and Main's trusted importer. */
export function heroBodyModelIds(documents: Iterable<readonly [string, unknown]>): string[] {
  return heroBodyModels(documents).ids;
}

/**
 * ⭐ GH#1188：同一次掃描同時回答「哪些可以挑」（`ids`）與「哪些**還沒有任何英雄卡**認領」（`unclaimed`）。
 *
 * > owner 2026-09-11（逐字，`apps/editor/src/hero/catalog.test.ts` 引用）：「如果你遇到該角色**還沒有實作**
 * > 卻下載了模型 你**還是要放在後台跟編輯器的模型庫列表** **等待認領實作**」
 *
 * ⚠️ 認領看英雄卡的**整條身體鏈**：`modelKey` ＋ `modelVersions[].modelKey／sourceModelKey`。
 * ⛔ 只看 `modelKey` 會把「英雄已換上凍結版本（`version.body.*`）」的來源模型誤標成待認領
 * —— 量到（2026-09-15，出貨樹）：可挑 194 顆裡，只看 `modelKey` 算出 159 顆，看整條鏈是 112 顆。
 * ⚠️ `unclaimed ⊆ ids`：選不到的模型（FX／道具／停用）⛔ 不會被標成待認領。
 */
export function heroBodyModels(documents: Iterable<readonly [string, unknown]>): { ids: string[]; unclaimed: string[] } {
  const bound = new Set<string>(), claimed = new Set<string>();
  const models: Array<{ id: string; heroBody?: boolean }> = [];
  for (const [key, raw] of documents) {
    if (key.startsWith("champions/") && raw && typeof raw === "object") {
      const card = raw as { modelKey?: unknown; modelVersions?: unknown };
      if (typeof card.modelKey === "string") { bound.add(card.modelKey); claimed.add(card.modelKey); }
      if (Array.isArray(card.modelVersions)) for (const version of card.modelVersions as Array<Record<string, unknown> | null>) {
        for (const ref of [version?.modelKey, version?.sourceModelKey]) if (typeof ref === "string") claimed.add(ref);
      }
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
  const ids = [...new Set(models
    .filter((model) => !model.id.startsWith(MODEL_VERSION_PREFIX))
    .filter((model) => model.heroBody === true || (model.heroBody !== false && bound.has(model.id)))
    .map((model) => model.id))].sort();
  return { ids, unclaimed: ids.filter((id) => !claimed.has(id)) };
}
