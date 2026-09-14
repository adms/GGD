/**
 * contentFormBodies —— 「這是變身態的身體嗎」的**內容側**答案（GH#1258 ⑤）。
 *
 * ── 為什麼 `championForms.isTransformedBody` 不夠 ──────────────────────────
 * 那一支查的是**手寫**的 `CHAMPION_FORM_PAIRS`（26 對 w3x `Eme1/Emeu` 事實）。
 * 新批次的變身（例：梅普露 `b2-maple` ↔ `b2-maple-alt-9769eb88b85b`）只宣告在
 * 英雄卡的 `transform.role` 上 —— 後台 `apps/admin/src/curationTransform.ts:53`、
 * 平台 `apps/platform/internal/curation/transformevict.go`、sim 的
 * `ChampionFormSystem`（讀 `counterpartId`）都已經讀它 ⇒ 只有客戶端與遊戲伺服器的
 * 可選判斷還停在手寫表，於是平台連不上（NO_FILTER / bypass）時梅普露的變身態
 * 被當成一位獨立英雄。
 *
 * ⭐ 規則是**兩頭的聯集**（形態⑫：兩頭都要走）：
 *   手寫表說是變身態（w3x 證據，含 6 對已經沒有卡的） **或** 內容卡 `transform.role === "alternate"`
 * ⇒ 新增一位 `role: alternate` 的英雄**不必改任何手寫表**就會被擋。
 *
 * ── 純度 ────────────────────────────────────────────────────────────────
 * 讀 `Champions` registry（CALL TIME）。registry 沒填時一律回「不是 / 沒有本體」——
 * 與手寫表取聯集的呼叫端因此在純單元測試裡行為完全不變。
 */
import { Champions } from "../sim/content/registry";
import type { ChampionId } from "../ids";

/** The `transform.role` value that marks a body a player may not pick on its own. */
export const CONTENT_TRANSFORM_ROLE_ALTERNATE = "alternate";

/** 內容卡宣告 `transform.role === "alternate"` 嗎（registry 沒這位 ⇒ false）。 */
export function isContentAlternateBody(id: string): boolean {
  return Champions.tryGet(id as ChampionId)?.transform?.role === CONTENT_TRANSFORM_ROLE_ALTERNATE;
}

/**
 * 內容卡宣告的變身態 → 它的本體 id；不是內容宣告的變身態、或沒寫 `counterpartId` ⇒ null。
 * ⚠️ 本體必須真的在 registry 裡 —— 指向一份不存在的卡不是「換成本體」的理由。
 */
export function contentAlternateBaseOf(id: string): string | null {
  const t = Champions.tryGet(id as ChampionId)?.transform;
  if (t?.role !== CONTENT_TRANSFORM_ROLE_ALTERNATE || typeof t.counterpartId !== "string") return null;
  return Champions.tryGet(t.counterpartId) ? String(t.counterpartId) : null;
}
