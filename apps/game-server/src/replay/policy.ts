/**
 * 這台 shard 現在生效的錄影政策 —— `config.replay@1` 的**唯一**讀取點。
 *
 * owner 2026-08-02：「請幫我預設打開，就算玩到一半就離開也應該有 replay 才對」
 *
 * ---------------------------------------------------------------------------
 * 為什麼要有這一層（而不是各處自己 `Configs.tryGet("replay")`）
 * ---------------------------------------------------------------------------
 * 這份文件有四個消費端在三個不同的時間點讀它：開機（保留量）、開場
 * （enabled）、錄影中（flush 間隔）。四個各自解析就是四份會 drift 的
 * 「缺文件怎麼辦」知識，而這份文件缺檔時的正確答案（**照錄**）恰好是最反直覺
 * 的那一個 —— 只要有一個消費端寫成「讀不到就別錄」，錄影就會在內容載入失敗的
 * 那台機器上靜默消失，也就是 #170 的形狀重演一次。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 什麼時候生效（誠實版）
 * ---------------------------------------------------------------------------
 * `Configs` 是**開機時**載入的內容登錄表（combat-env / base-bonus 才有 TTL
 * 快取）。所以後台或 `content/` 改了這份文件，要**重啟 game shard** 才生效，
 * 和 `config.stat-caps@1` 同一個狀態。這裡不假裝它是「下一場生效」——
 * 那句謊話正是 #278 修掉的東西。
 *
 * 環境變數 `GGD_REPLAY_ENABLED` 存在時**壓過內容**（`0`/`false` 關、其它開）。
 * 那是給「這台機器就是不要錄」的 ops 逃生門用的：內容樹是所有 shard 共用的
 * 一份，而這個決定是逐台的。
 */
import { Configs, replayPolicyFromDoc, type ReplayPolicy } from "@ggd/shared/content";

export type { ReplayPolicy };

/** 讀出目前生效的政策（內容文件 → 出貨預設，再讓 env 壓過 `enabled`）。 */
export function replayPolicy(): ReplayPolicy {
  const p = replayPolicyFromDoc(Configs.tryGet("replay"));
  const env = process.env.GGD_REPLAY_ENABLED;
  if (env !== undefined && env !== "") {
    p.enabled = env !== "0" && env.toLowerCase() !== "false";
  }
  return p;
}

/** 這台 shard 現在要不要錄影。 */
export function replayRecordingEnabled(): boolean {
  return replayPolicy().enabled;
}
