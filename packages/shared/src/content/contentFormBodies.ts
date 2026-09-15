/**
 * contentFormBodies —— 「這是變身態的身體嗎」的**內容側**答案（GH#1258 ⑤）。
 *
 * ── 為什麼 `championForms.isTransformedBody` 不夠 ──────────────────────────
 * 那一支查的是**手寫**的 `CHAMPION_FORM_PAIRS`（26 對 w3x `Eme1/Emeu` 事實）。
 * 新批次的變身（例：梅普露 `b2-maple` ↔ `b2-maple-alt-9769eb88b85b`）只宣告在
 * 英雄卡的 `transform` 上 —— 後台 `apps/admin/src/curationTransform.ts:53`、
 * 平台 `apps/platform/internal/curation/transformevict.go`、sim 的
 * `ChampionFormSystem`（讀 `counterpartId`）都已經讀它 ⇒ 只有客戶端與遊戲伺服器的
 * 可選判斷還停在手寫表，於是平台連不上（NO_FILTER / bypass）時梅普露的變身態
 * 被當成一位獨立英雄。
 *
 * ⭐ 規則是**兩頭的聯集**（形態⑫：兩頭都要走）：
 *   手寫表說是變身態（w3x 證據，含 6 對已經沒有卡的） **或** 內容卡宣告的一對
 * ⇒ 新增一對內容宣告的變身**不必改任何手寫表**就會被擋。
 *
 * ── 「內容卡宣告的一對」住在哪 ─────────────────────────────────────────────
 * ⭐ `voiceFormSharing.contentFormPairs`（⛔ 不在這裡再寫一份判斷）：**兩張卡互相指著對方**，
 * 一張 `role: "base"`、一張 `role: "alternate"`。
 * ⚠️ 2026-09-15 更正（GH#1258 審查）：這一支第一版只看**單邊** `role === "alternate"` ——
 * 那是「內容卡宣告的變身配對」的第三個住處，而且語意與 `contentFormPairs`（要求雙向互指）不一致。
 * 出貨內容 21 對全部雙向互指（2026-09-15 量過），所以收成一處不改變任何一位的答案；
 * 單邊宣告是資料錯誤，⛔ 不是擋人（或換成本體）的理由。
 * 同一個判準的其他讀者：`statNormalization.withInheritedOrigin`（出身繼承）、
 * `apps/admin/src/curationReset.ts`（重設預覽的變身態分類）。
 *
 * ── 純度 ────────────────────────────────────────────────────────────────
 * 讀 `Champions` registry（CALL TIME），只取**這一位與它指到的那一位**兩張卡（O(1)，⛔ 不掃整份名冊）。
 * registry 沒填時一律回「不是 / 沒有本體」—— 與手寫表取聯集的呼叫端因此在純單元測試裡行為完全不變。
 */
import { Champions } from "../sim/content/registry";
import type { ChampionId } from "../ids";
import { contentFormPairs, type ContentFormPair } from "./voiceFormSharing";

/** 這一位參與的內容宣告配對（兩張卡都在 registry 且互相指著對方）；沒有 ⇒ null。 */
function contentPairOf(id: string): ContentFormPair | null {
  const self = Champions.tryGet(id as ChampionId);
  const other = self?.transform?.counterpartId;
  const counterpart = typeof other === "string" ? Champions.tryGet(other as ChampionId) : undefined;
  if (!self || !counterpart) return null;
  return contentFormPairs([self, counterpart])[0] ?? null;
}

/** 內容卡宣告的變身態嗎（雙向互指的一對裡 `alternate` 那一半）。 */
export function isContentAlternateBody(id: string): boolean {
  return contentPairOf(id)?.alternateId === id;
}

/** 內容卡宣告的變身態 → 它的本體 id；不是 ⇒ null。 */
export function contentAlternateBaseOf(id: string): string | null {
  const pair = contentPairOf(id);
  return pair?.alternateId === id ? pair.baseId : null;
}
