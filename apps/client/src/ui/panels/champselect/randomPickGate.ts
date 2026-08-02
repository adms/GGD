/**
 * randomPickGate — 🎲 隨機選角的擁有權閘。
 *
 * owner 2026-08-02:「**隨機選角的時候，只能隨機到自己有解鎖的角色**」。
 *
 * ── 這個檔案為什麼存在（#201 的閘沒有壞，它只是掛錯地方）─────────────────────
 * ChampSelectPanel 早就有一行 `if (meta.available) pool = selectableIdsByOwnership(...)`。
 * 問題出在 `meta.available` 是一個**布林**，而它其實蓋住了兩種完全不同的世界：
 *
 *   · 根本沒有帳號（本機 `pnpm dev` / LAN 直連，`api.hasSession` 是 false）
 *   · 有帳號，但錢包讀不到（平台故障、逾時，或選角剛開場那段還在載入）
 *
 * 第一種照抽是對的：沒有「自己」就沒有「自己解鎖的角色」，而且伺服器對這種座位
 * 同樣 fail-open（`apps/game-server/src/curation/ownership.ts` 的檔頭明說是刻意
 * 的），擋掉只會讓 🎲 在開發機上變成死按鈕。
 * 第二種照抽是錯的，而且是**真的會打進場**的錯：平台故障時 `MatchRoom` 拿到的
 * 每個座位也沒有 `owned` 陣列，`Ownership.fromSeats` 不會登記它，於是
 * `MatchController.selectChampion` 的 `not-owned` 拒絕**同樣失效**。兩層閘在同一
 * 個故障下一起消失 —— 客戶端不是多餘的第二道鎖，它是那個當下唯一的一道。
 *
 * ⚠️ 而且「把那個 `if` 拿掉」修不好它。`meta.available` 是 false 的時候
 * `meta.prices` 是**空 Map**，`lockStateOf` 對沒有價格的英雄一律回 "free"，所以
 * 無條件套 `selectableIdsByOwnership` 會原封不動回傳整個白名單 —— 一個看起來有
 * 修、實際上什麼都沒改的補丁（失敗形態 ③）。閘必須建在「擁有權可不可見」上，
 * 不是建在「把擁有權過濾器叫下去」上。
 *
 * ── 決策點做成後台欄位 ─────────────────────────────────────────────────────
 * 「擁有權讀不到的時候 🎲 該怎麼辦」是一個決策，不是一個數字，所以它是
 * `config/store.json` 的 `randomPickOwnership`（後台 → 商店經濟）：
 *
 *   "block"（出貨預設，owner 明說的那個）—— 不抽，🎲 停用並說明原因。
 *   "whitelist" —— 照抽白名單（2026-08-02 之前的行為），留給 owner 在他寧可
 *                  「按鈕永遠能按」的時候切回去。
 *
 * 預設選 block 的代價講清楚：平台掛掉的那段時間，登入中的玩家 🎲 按不動（手動
 * 點選不受影響，那條路仍然是最後寫入者勝 + 伺服器裁決）。這是刻意的取捨 ——
 * owner 的句子沒有例外子句。
 */
import { Configs, DEFAULT_RANDOM_PICK_OWNERSHIP, type RandomPickOwnershipMode } from "@ggd/shared/content";
import { selectableIdsByOwnership, type OwnershipVisibility, type PriceMap } from "./walletMeta";

export { type RandomPickOwnershipMode };

/** 出貨值 —— 與 `content/config/store.json` 的 `randomPickOwnership` 對齊。 */
export const SHIPPED_RANDOM_PICK_OWNERSHIP: RandomPickOwnershipMode = DEFAULT_RANDOM_PICK_OWNERSHIP;

/**
 * 讀 `config.store@1.randomPickOwnership`。
 *
 * 在 CALL TIME 讀（不是模組載入時），因為 `Configs` 是 bootContent 灌進去的，而
 * 後台覆蓋層的那一份也走同一個註冊表（見 `content/clientOverlay.test.ts`）——
 * 模組載入時讀會永遠拿到空的註冊表。缺欄位／壞值一律回出貨預設。
 */
export function randomPickOwnershipMode(
  readDoc: () => unknown = () => Configs.tryGet("store"),
): RandomPickOwnershipMode {
  const doc = readDoc();
  if (!doc || typeof doc !== "object") return SHIPPED_RANDOM_PICK_OWNERSHIP;
  const raw = (doc as Record<string, unknown>).randomPickOwnership;
  return raw === "whitelist" || raw === "block" ? raw : SHIPPED_RANDOM_PICK_OWNERSHIP;
}

/** 🎲 這一次能不能抽，不能的話是為什麼。 */
export type RandomPickPlan =
  | { kind: "draw"; pool: readonly string[] }
  /** 有帳號但擁有權讀不到，而模式是 "block" */
  | { kind: "blocked"; reason: "ownership-unknown" }
  /** 擁有權讀得到，但交集之後一隻都不剩（白名單全是沒解鎖的） */
  | { kind: "blocked"; reason: "none-unlocked" };

export interface RandomPickInput {
  /** 白名單（且未下架）之後的英雄 id —— 抽籤的上游母體 */
  whitelisted: readonly string[];
  /** 這個客戶端對擁有權知道多少 */
  ownership: OwnershipVisibility;
  /** 目錄價格表（`ownership !== "known"` 時是空的） */
  prices: PriceMap;
  /** 帳號已擁有的英雄（`ownership !== "known"` 時是空的） */
  owned: ReadonlySet<string>;
  /** 後台的決策欄位 */
  mode: RandomPickOwnershipMode;
}

/**
 * 決定 🎲 這一次抽什麼 —— 純函式，這裡就是 owner 那句話的唯一落點。
 *
 * · known     → 只抽 `owned ∩ whitelist`。空的話 blocked（**不是**退回白名單）：
 *               退回去就等於「沒解鎖也抽得到」，正是要禁的那件事。
 * · anonymous → 抽整個白名單。沒有帳號就沒有擁有權可言，伺服器同樣不擋。
 * · unknown   → 看 `mode`：block（預設）就不抽，whitelist 就照抽。
 */
export function planRandomPick(input: RandomPickInput): RandomPickPlan {
  if (input.ownership === "anonymous") return { kind: "draw", pool: input.whitelisted };
  if (input.ownership === "unknown") {
    return input.mode === "whitelist"
      ? { kind: "draw", pool: input.whitelisted }
      : { kind: "blocked", reason: "ownership-unknown" };
  }
  const pool = selectableIdsByOwnership(input.whitelisted, input.prices, input.owned);
  return pool.length > 0 ? { kind: "draw", pool } : { kind: "blocked", reason: "none-unlocked" };
}

/**
 * 被擋下來時要跟玩家說的話。**一定要說**：一顆按了沒反應的 🎲 和一顆壞掉的 🎲
 * 在畫面上長得一模一樣，而這一版刻意讓它在平台故障時不能用，所以沉默等於把
 * 「我們在保護你的帳號」演成「這個遊戲壞了」。
 */
export function randomPickBlockedHint(reason: "ownership-unknown" | "none-unlocked"): string {
  return reason === "ownership-unknown"
    ? "連不上帳號資料，暫時無法隨機選角（避免抽到你還沒解鎖的英雄）。請直接點選英雄，或稍後再試。"
    : "你目前沒有已解鎖的英雄可以隨機。先用藍水晶解鎖一位，或直接點選免費英雄。";
}
