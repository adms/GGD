/**
 * 對戰錄影政策 —— `config.replay@1` 的解析器與**出貨預設**。
 *
 * owner 2026-08-02：「請幫我預設打開，就算玩到一半就離開也應該有 replay 才對」
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 缺文件 = 出貨預設，而且出貨預設是「**開著**」
 * ---------------------------------------------------------------------------
 * `replayPolicyFromDoc(undefined)` 回 `DEFAULT_REPLAY_POLICY`，也就是
 * `enabled: true`。這個方向是刻意的，而且是這個模組唯一真正重要的決定：
 * 一份讀不到／壞掉的內容文件**不可以**變成「這台機器從此不錄影」。#170 的教訓
 * 是靜默失敗沒有人會發現，而「內容載入失敗 ⇒ 錄影自動關掉」正是那個形狀的
 * 完美復刻 —— 遊戲照打、後台照開、回放列表永遠是空的。
 *
 * 所以 fail-open：拿不到文件就照出貨值錄。要關掉錄影必須是有人**明確**在
 * `content/config/replay.json`（或後台）把 `enabled` 寫成 false。
 *
 * ---------------------------------------------------------------------------
 * 為什麼是「逐格夾」而不是「整份丟掉」
 * ---------------------------------------------------------------------------
 * 一份文件裡的 `flushIntervalMs` 打錯不該連帶讓 `enabled` 失效。所以這裡逐格
 * 讀、逐格夾在 Zod 宣告的同一組上下界裡，壞的那一格退回出貨值，其它照用。
 * 上下界**兩端都有**（CLAUDE.md 2026-07-29：`validateField` 只檢查 `min`，
 * 所以 500 打成 5000 會過後台）。
 */
import type { ConfigReplayDoc } from "./schema/config";

export interface ReplayPolicy {
  /** 要不要錄影。出貨 true。 */
  enabled: boolean;
  /** 緩衝行多久交給檔案串流一次（毫秒）。出貨 500。 */
  flushIntervalMs: number;
  /** 磁碟上最多留幾份錄影。出貨 200。 */
  retainMaxFiles: number;
  /** 超過幾天一律刪掉。出貨 30。 */
  retainMaxAgeDays: number;
}

/**
 * 出貨預設。**這不是「出貨的那一份」** —— 出貨的那一份是
 * `content/config/replay.json`，而 `shippedReplayPolicy.test.ts` 比對兩者，
 * 所以任何一邊改了另一邊沒改就會紅（失敗形態 ⑤：被測的不是出貨的那個）。
 */
export const DEFAULT_REPLAY_POLICY: ReplayPolicy = {
  enabled: true,
  flushIntervalMs: 500,
  retainMaxFiles: 200,
  retainMaxAgeDays: 30,
};

/** 逐格的合法帶，和 `zConfigReplayDoc` 宣告的完全一樣。 */
export const REPLAY_POLICY_BOUNDS = {
  flushIntervalMs: [50, 10_000],
  retainMaxFiles: [1, 5_000],
  retainMaxAgeDays: [1, 3_650],
} as const;

function clampInt(raw: unknown, [lo, hi]: readonly [number, number], def: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return def;
  return Math.min(hi, Math.max(lo, Math.round(raw)));
}

/**
 * 把 `config.replay@1` 解析成政策。`undefined` / 壞文件 → 出貨預設（開著）。
 *
 * 刻意收 `unknown`：呼叫端拿到的是 `Configs.tryGet("replay")`，它的型別是
 * 「某一份 config 文件」，而在這裡再要求呼叫端自己先判別 schema tag 只會讓那段
 * 判別在每一個呼叫端各寫一次。
 */
export function replayPolicyFromDoc(doc: unknown): ReplayPolicy {
  const d = doc as Partial<ConfigReplayDoc> | undefined | null;
  if (!d || typeof d !== "object" || d.schema !== "config.replay@1") {
    return { ...DEFAULT_REPLAY_POLICY };
  }
  return {
    // 只有明確的 `false` 才關。缺欄位／型別不對 → 照出貨值錄（fail-open）。
    enabled: d.enabled === false ? false : true,
    flushIntervalMs: clampInt(
      d.flushIntervalMs,
      REPLAY_POLICY_BOUNDS.flushIntervalMs,
      DEFAULT_REPLAY_POLICY.flushIntervalMs,
    ),
    retainMaxFiles: clampInt(
      d.retainMaxFiles,
      REPLAY_POLICY_BOUNDS.retainMaxFiles,
      DEFAULT_REPLAY_POLICY.retainMaxFiles,
    ),
    retainMaxAgeDays: clampInt(
      d.retainMaxAgeDays,
      REPLAY_POLICY_BOUNDS.retainMaxAgeDays,
      DEFAULT_REPLAY_POLICY.retainMaxAgeDays,
    ),
  };
}
