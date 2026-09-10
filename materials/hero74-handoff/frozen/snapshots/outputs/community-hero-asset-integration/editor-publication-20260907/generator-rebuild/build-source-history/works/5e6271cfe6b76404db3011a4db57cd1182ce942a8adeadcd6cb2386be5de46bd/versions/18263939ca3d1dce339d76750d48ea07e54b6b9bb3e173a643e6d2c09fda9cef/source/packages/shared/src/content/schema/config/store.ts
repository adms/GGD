import { z } from "zod";
import { zId } from "../common";

/**
 * Store config: the FLAT 藍水晶 champion unlock price + match placement rewards.
 *
 * Owner, 2026-07-30:「所有英雄藍水晶都是統一價，新上架預設也是一樣價格」. This
 * replaced a 53-entry `championPrices` map whose only real content was "300, 41
 * times, and 0 twelve times" — a maintenance liability that made FORGETTING a
 * line mean GIVING THE CHAMPION AWAY (an absent price reads as free on both the
 * client and the server). Under the flat model an unlisted champion costs
 * `championUnlockCost`, so onboarding a hero needs no store edit at all.
 */
export const zConfigStoreDoc = z
  .object({
    id: zId,
    schema: z.literal("config.store@1"),
    /**
     * The 藍水晶 price of ONE champion unlock — the same number for every
     * champion that is not on `freeChampionIds`. Upper bound is a typo guard,
     * not a balance opinion: 1,000,000 is already ~4,300 first-place matches.
     */
    championUnlockCost: z.number().int().min(0).max(1_000_000),
    /**
     * The champions that cost NOTHING — the free starter roster every new
     * account is seeded with. Emptying it is legal (the owner may want a fully
     * uniform store); see the note in apps/platform/internal/wallet/catalog.go
     * for what a new account then faces.
     */
    freeChampionIds: z.array(zId),
    /**
     * 多人比賽的藍水晶獎勵 —— owner 2026-08-17（逐字）：
     *
     *   「只要有**兩真人(N≥2)**參加，**不論哪個陣營**都可以，
     *     所有玩家都 **(N+1) 倍**，所以**最大 13 倍**」
     *   「120 × 13 (MAX)、120 × 3 (N=2)、120 (N=1)」
     *
     * 倍率 = `N >= minHumans ? N + offset : 1`，再夾在 `maxMultiplier` 上；
     * **N 是整場 lobby 的真人座位數，⛔ 不分隊**（沙發客算人頭但沒帳號可領）。
     * 實作在 `apps/platform/internal/wallet/meta.go` 的 `CrystalMultiplier`，
     * 結算在 `internal/gamelink/callback.go`。
     *
     * ⚠️ 缺欄位 ⇒ 出貨值（`DEFAULT_CRYSTAL_REWARDS`）。整塊 `.optional()` 是
     * **必要的**：線上耐久 override 是 2026-08-17 之前存的，沒有這一格，而
     * `.strict()` 會讓整份 config 被拒 → 內容載入整份失敗 → 退回骨架英雄。
     *
     * ⚠️ 每一格**上下界都有**。GH#277 的教訓：只檢查 min 會讓 13 打成 130
     * 靜靜過去，而 130 倍是一場對戰付掉 56 隻英雄的解鎖價。
     */
    crystalRewards: z
      .object({
        /** 名次基礎值 —— 一個人打 bot 的實拿數（1 = 冠軍，已含吃雞加倍） */
        base: z
          .object({
            place1: z.number().int().min(0).max(100_000),
            place2: z.number().int().min(0).max(100_000),
            place3: z.number().int().min(0).max(100_000),
            place4: z.number().int().min(0).max(100_000),
          })
          .strict()
          .optional(),
        /** 開始給倍率的真人門檻（出貨 2 = owner 的「兩真人」） */
        minHumans: z.number().int().min(1).max(12).optional(),
        /** 加在真人數上得到倍率（出貨 1 = owner 的 N+1） */
        offset: z.number().int().min(0).max(12).optional(),
        /** 倍率上限（出貨 13 = owner 的「最大 13 倍」） */
        maxMultiplier: z.number().int().min(1).max(50).optional(),
      })
      .strict()
      .optional(),
    /** M COIN granted per final team placement (1 = winner) */
    mcoinRewards: z
      .object({
        placement1: z.number().int().min(0),
        placement2: z.number().int().min(0),
        placement3: z.number().int().min(0),
        placement4: z.number().int().min(0),
      })
      .strict(),
    /**
     * 隨機選角（🎲）在**擁有權讀不到**的時候該怎麼辦 —— owner 2026-08-02：
     *「隨機選角的時候，只能隨機到自己有解鎖的角色」。
     *
     * 這是一個**決策點**，不是一個數字，所以它是一個欄位而不是一行程式碼裡的
     * `if`。它只在一種狀態下有意義：客戶端**有登入 session、但錢包/目錄讀不到**
     * （平台故障、請求逾時，或選角開頭那段還在載入的視窗）。三種狀態的分工：
     *
     *   · 讀得到擁有權 → 一律只抽 `owned ∩ whitelist`，本欄位管不到。
     *   · 沒有 session（本機 `pnpm dev` / LAN 直連，根本沒有帳號）→ 一律照抽，
     *     本欄位也管不到：沒有「自己」就沒有「自己解鎖的角色」，而伺服器對這種
     *     座位同樣是 fail-open（apps/game-server/src/curation/ownership.ts），
     *     擋掉只會讓 🎲 在開發機上變成一顆死按鈕。
     *   · 有 session 但擁有權讀不到 → **就是這一欄**。
     *
     * `"block"`（出貨預設，owner 明說的那個）：不抽，按鈕停用並說明原因。寧可
     * 讓 🎲 暫時不能用，也不要抽出一隻玩家沒解鎖的英雄 —— 平台故障時伺服器那
     * 道擁有權閘同樣拿不到名單而 fail-open，所以那一抽是真的會打進場的。
     * `"whitelist"`：照抽全白名單（2026-08-02 之前的行為），代價是平台故障期間
     * 🎲 會抽到沒解鎖的英雄。
     *
     * 缺欄位 ⇒ `"block"`（見 DEFAULT_RANDOM_PICK_OWNERSHIP）。
     */
    randomPickOwnership: z.enum(["block", "whitelist"]).optional(),
  })
  .strict();

/** 缺 `randomPickOwnership` 時的語意 —— owner 的「只能隨機到有解鎖的」。 */
export const DEFAULT_RANDOM_PICK_OWNERSHIP = "block" as const;

/** 擁有權讀不到時 🎲 的兩種模式（`config.store@1.randomPickOwnership`）。 */
export type RandomPickOwnershipMode = "block" | "whitelist";

/**
 * 缺 `crystalRewards`（或缺其中一格）時的出貨值 —— 與
 * `content/config/store.json` 及 `apps/platform/internal/wallet/meta.go` 的
 * `DefaultCrystalRules()` 是同一組數字。
 */
export const DEFAULT_CRYSTAL_REWARDS = {
  base: { place1: 120, place2: 45, place3: 35, place4: 30 },
  minHumans: 2,
  offset: 1,
  maxMultiplier: 13,
} as const;

/**
 * 倍率的唯一算式（owner 2026-08-17：`N >= minHumans ? N + offset : 1`，夾在
 * `maxMultiplier`）。後台那一頁用它畫「1 人 / 2 人 / 12 人各拿多少」的推導列，
 * ⛔ 不要在畫面上另外手算一次 —— 那就是第二份會漂走的算式。
 */
export function crystalMultiplier(
  humans: number,
  rules: { minHumans: number; offset: number; maxMultiplier: number },
): number {
  if (rules.minHumans <= 0 || humans < rules.minHumans) return 1;
  return Math.max(1, Math.min(humans + rules.offset, rules.maxMultiplier));
}
export type ConfigStoreDoc = z.infer<typeof zConfigStoreDoc>;
