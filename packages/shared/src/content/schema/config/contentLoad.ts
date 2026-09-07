import { z } from "zod";

// ---------------------------------------------------------------- #326 ----
/**
 * ⭐【`config.content-load@1`】—— 一份壞文件要不要殺掉整份內容（GH#326）。
 *
 * owner 2026-08-14：
 * > 「遊戲主程式應該要把**全有全無**的這種奇怪機制改掉，應該改為**不同部分各自
 * >  check 載入成功**」「**quarantine（隔離壞的、好的照跑）當預設**」
 *
 * ── 為什麼這是一格欄位而不是一行程式 ──────────────────────────────────
 * `loader.ts` 從來就**逐份**收集錯誤（每一份壞的都記下 collection/id/Zod issue），
 * 只是最後一行把整批丟掉。所以「全有全無」是一個**政策**不是結構限制 ——
 * 而政策就是第一守則講的決策點：⛔ 不可以再寫死一個。
 *
 * ⚠️ 代價已經發生過兩次（2026-08-01、08-02）：四份 config 文件的 schema tag 不在
 * 已部署映像的 Zod union 裡 → 內容載入**整份**失敗 → 退回 2 隻骨架英雄 →
 * 選人畫面空掉。**而網站看起來完全正常。** 隔離之後那次的結果會是「少四份設定」。
 */
export const CONTENT_LOAD_DOC_ID = "content-load";

/** 一份壞文件的處置。 */
export const zContentLoadPolicy = z.enum(["quarantine", "fail-closed"]);
export type ContentLoadPolicy = z.infer<typeof zContentLoadPolicy>;

/** `maxQuarantined` 的上下界 —— ⚠️ 上界不是只有下界（第一守則）。 */
export const CONTENT_LOAD_MAX_QUARANTINED_MIN = 0;
export const CONTENT_LOAD_MAX_QUARANTINED_MAX = 5_000;

export const DEFAULT_CONTENT_LOAD = {
  policy: "quarantine" as ContentLoadPolicy,
  cascadeDanglingRefs: true,
  maxQuarantined: 50,
};

export const zConfigContentLoadDoc = z
  .object({
    id: z.literal(CONTENT_LOAD_DOC_ID),
    schema: z.literal("config.content-load@1"),
    note: z.string().optional(),
    /**
     * `quarantine`（出貨）= 壞的那幾份不進登錄表，其餘照常載入。
     * `fail-closed` = 舊行為，任何一份壞掉整份失敗（→ 客戶端 fail-open 退骨架）。
     *
     * ⚠️ 照第〇·六守則「測試只做預設啟動的那一邊」——**只測 quarantine**，
     * `fail-closed` 那條路是為了能回頭而存在的，⛔ 不寫測試。
     */
    policy: zContentLoadPolicy.describe(
      "@zh 一份壞文件的處置\n" +
      "@note `quarantine`（出貨）= 壞的那幾份不進登錄表，其餘照常載入。`fail-closed` = 舊行為，任何一份壞掉整份失敗。⚠️ 舊行為在客戶端的樣子不是錯誤畫面，是**悄悄退回 2 隻骨架英雄** —— 那正是 owner 要廢掉它的理由。\n" +
      "@opt quarantine quarantine（隔離壞的、好的照跑）\n" +
      "@opt fail-closed fail-closed（舊行為：一份壞掉整份失敗）",
    ),
    /**
     * 隔離會不會**傳染**：文件 A 硬參照到被隔離的 B，A 要不要也被隔離。
     *
     * ⭐ true（出貨）擋的是**半個世界** —— 英雄載進來、他的 Q 沒載進來 = 一格
     * 空技能，而且沒有人會發現（CLAUDE.md 失敗形態②）。寧可少一隻英雄，
     * ⛔ 不要一隻壞掉的英雄。
     */
    cascadeDanglingRefs: z.boolean().describe(
      "@zh 隔離會不會傳染\n" +
      "@note 文件 A 硬參照到被隔離的 B 時，A 要不要也被隔離。⭐ 開著（出貨）擋的是**半個世界**：英雄載進來、他的 Q 沒載進來 = 一格空技能，而且沒有人會發現。寧可少一隻英雄，⛔ 不要一隻壞掉的英雄。關掉的話那些斷掉的參照會降級成警告，文件留著。",
    ),
    /**
     * 隔離超過幾份就**退回 fail-closed**。出貨 50。
     *
     * ⚠️ 這一格是 quarantine 的安全閥：「少四份設定」與「內容整份跟映像不相容」
     * 是兩件事，而後者隔離出來的結果是一個**空的遊戲**——那比誠實地退回骨架更糟，
     * 因為骨架至少會讓 `/healthz` 的 `content.ok` 變 false。
     *
     * 0 = 完全不容忍（等於 fail-closed）。上界 5000 ≈ 出貨文件總數，
     * 設到那裡等於「無論如何都不要整份失敗」。
     */
    maxQuarantined: z
      .number()
      .int()
      .min(CONTENT_LOAD_MAX_QUARANTINED_MIN)
      .max(CONTENT_LOAD_MAX_QUARANTINED_MAX).describe(
      "@zh 隔離上限（超過就退回全有全無）\n" +
      "@note 隔離超過幾份就改用 `fail-closed`。出貨 **{{出貨值}}**。⚠️ 這是 quarantine 的安全閥：「少四份設定」與「內容整份跟這個映像不相容」是兩件事，而後者隔離出來的結果是一個**空的遊戲** —— 那比誠實地退回骨架更糟，因為骨架至少會讓 `/healthz` 的 `content.ok` 變 false。填 0 ＝ 完全不容忍（等於 fail-closed）。",
    ),
  })
  .strict();

export const DEFAULT_CONTENT_LOAD_DOC = {
  id: CONTENT_LOAD_DOC_ID,
  schema: "config.content-load@1",
  policy: DEFAULT_CONTENT_LOAD.policy,
  cascadeDanglingRefs: DEFAULT_CONTENT_LOAD.cascadeDanglingRefs,
  maxQuarantined: DEFAULT_CONTENT_LOAD.maxQuarantined,
} as const;

export type ConfigContentLoadDoc = z.infer<typeof zConfigContentLoadDoc>;
