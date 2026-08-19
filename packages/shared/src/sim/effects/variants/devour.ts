/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectDef } from "../effect";

export interface DevourVariant {
  /**
   * 【吞噬】—— 處決 + 等值回復（owner 2026-08-05，初號機 EX）。
   * 行為與「為什麼走傷害佇列 / 為什麼要穿盾」見 `sim/effects/devour.ts` 檔頭。
   */
  kind: "devour";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /** 逐階處決線：`hp <= maxHp × 這一格`。owner 的 3/5/7/9% = `[0.03,0.05,0.07,0.09]`。 */
  thresholdPctOfMax: number[];
  /** 回復「吞下去的生命」的幾成。省略 = 1（＝owner 的「回復等值生命」）。 */
  healPct?: number;
  /** 吞得掉誰。省略 = `"champion"`（owner 文案的「敵方**英雄**單位」）。 */
  victim?: "champion" | "any";
  /**
   * 致死量要不要把當下的護盾一起算進去。省略 = **true**。
   * ⛔ false 的話一個帶盾的目標「進了處決線但吞不死」，而卡上寫著即死。
   */
  throughShields?: boolean;
  /**
   * ⭐ S9a —— **真的吞掉之後**才跑的那一段（92-03「每吞噬一名敵人 +1 AP，永久」）。
   * 缺席 = 沒有後續 = 今天。
   *
   * ⛔ 「用 `onKill` 代替」不成立：`onKill` 的三個發射點都是
   * `fireHooks(world, killer, "onKill", id)` —— **沒有 abilitySlot、沒有
   * incoming**，所以「吞噬殺掉的」與「普攻殺掉的」在 hook 端**分不出來**，
   * 掛上去會變成「任何擊殺都 +1 AP」。
   * ⛔ 「掛同一組門檻的第二個效果」也不成立：那對**沒有**越過處決線的目標
   * 也會跑（見這個 kind 的守衛突變）。
   *
   * ⚠️ **觸發時刻是「處決線通過、致死量已排進 `world.damageQueue`」的那一刻**，
   * 不是「屍體確認了」。一個帶【免死】的目標（52-00 十二道試煉）會被吞噬打到
   * 卻活下來，而這一段已經跑過。⛔ 沒有做成 `emitOn: "committed" |
   * "confirmedKill"`：後者要一份 `world.pendingDevourConfirm` + 一支排在
   * `deathSystem` 之後的系統，而今天**沒有任何一張卡**要求那個語意 ——
   * 一個只有一半值真的會動的欄位是失敗形態②。
   */
  onDevour?: EffectDef[];
  /**
   * ⭐ S9a —— 一次施放吞掉三個人時，{@link onDevour} 跑幾次。
   * · `"victim"`（省略 = 這個）—— 每個**真的被吞掉**的人各跑一次
   *   （92-03「每吞噬一名 +1 AP」）。
   * · `"cast"` —— 只要有人被吞掉就跑一次（「吞噬成功後回滿魔」那一類）。
   * ⚠️ 預設對 `shape: "single"`（出貨唯一形狀）兩者**完全等價**，也就是預設值
   * 不替任何人做決定。
   */
  onDevourPer?: "victim" | "cast";
}
