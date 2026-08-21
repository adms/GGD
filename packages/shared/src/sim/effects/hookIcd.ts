/**
 * 一條 hook 的**內部冷卻**記帳 —— 讀寫兩側共用的那一份算術。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼是一支獨立的葉子檔，而不是掛在 `effects/hooks.ts` 上
 *
 * `effects/modifyCooldown.ts`（S3：「反彈成功 → 立即重置那條 120 秒的觸發器」）
 * 要寫的正是 `fireHooks` 讀的那一格。它們必須共用**同一個** sentinel 與**同一條**
 * 換算，否則「重置」與「還在冷卻」會用兩把尺量同一件事。
 *
 * ⛔ 但 `modifyCooldown` **不可以** import `effects/hooks.ts`：那會關上
 *
 *     modifyCooldown → hooks → effectRunner → effectRegistry → modifyCooldown
 *
 * 而 `effectRegistry.ts` 的檔頭指名這個危害**不是編譯錯誤** —— 是某個打包順序下
 * 一個執行期 `undefined` 的 handler，也就是整張效果表在某一份 build 裡靜默消失
 *（`systems/ReflectHookSystem.ts` 與 `systems/CcHookSystem.ts` 各為同一個危害
 * 存在過一次）。這支只 import **型別**，所以它是那條鏈的葉子，兩邊都接得上。
 */
import type { SimWorld } from "../SimWorld";
import type { HookDef, ModifierSource } from "../stats/modifiers";
// ⚠️ 值 import（⛔ 不是 type-only）。`cooldownRules.ts` 是一片**沒有 import 的
// 葉子**（只有型別與純算術），所以它接不上 effectRegistry 那條環 —— 檔頭那段
// 「這支只 import 型別」講的是**危害**（執行期 undefined 的 handler），不是一條
// 「一律不准 import 值」的規矩。
import { applyHookCooldownFloor } from "../cooldownRules";

/**
 * 「這一格從來沒發動過」的 sentinel。夠負,所以 `world.tick - NEVER_FIRED`
 * 一定大於任何 `icdTicks`(上界 `HOOK_INTERNAL_COOLDOWN_MAX_SEC` = 300 秒
 * = 9,000 tick)。與 `hookLastFired` 的初值是**同一個常數**,不是兩個抄過來的
 * 字面值 —— 兩份 sentinel 分歧的那一天,per-slot 的第一次觸發會跟 source 的
 * 不一樣,而那個差別只在某一張卡上看得到。
 *
 * ⭐ S3 之後它多了第二個消費者:`modifyCooldown{mode:"reset"}` 把那一格寫回
 * 這個值 —— 「重置」的定義因此**逐字等於**「從來沒發動過」,而不是第二種說法。
 */
export const NEVER_FIRED = -1e9;

/**
 * 這條 hook 的內部冷卻換算成幾個 tick，`0` = 沒有內部冷卻。
 *
 * `combatEnv.itemCooldown` (#189) scales this and ONLY this, and only for an
 * ITEM source —— 那個旋鈕在後台叫「道具冷卻」，把英雄被動 / 增益卡 / 靈氣的 ICD
 * 一起縮短會是一個不做它名字寫的事的數字。
 *
 * ⚠️ 讀側（`fireHooks` 的閘）與寫側（`modifyCooldown` 的 `basis:"base"` 分母）
 * 走**同一個呼叫**。兩份就會有兩種「這條 hook 的冷卻是幾秒」，而它們分歧的那一天，
 * 一件道具上的「縮短 50%」會縮掉一個跟畫面上不同的量。
 */
export function hookIcdTicks(world: SimWorld, src: ModifierSource, hook: HookDef): number {
  if (!hook.internalCooldown) return 0;
  const factor = src.kind === "item" ? world.combatEnv.itemCooldown : 1;
  // ⭐ GH#489 —— 觸發器地板（`config.cooldown-rules@1.hookMinSeconds`，出貨 **0
  // ＝ 沒有地板**，所以這一行對每一份既有內容與每一份既有錄影是逐位元的 no-op）。
  //
  // ⚠️ 位置在**乘完 `itemCooldown` 之後**，與 `applyCooldownFloor` 對技能冷卻的
  // 規矩逐字相同（那一支的檔頭：「地板是最後一步」）。放在中間會讓「道具冷卻 ×2」
  // 可以把已經觸底的觸發器再推回地板之上 —— 那讀起來像 bug。
  //
  // ⚠️ 這裡夾的是**實際秒**。⛔ 不要拿 `combatEnv.cooldown`（技能冷卻倍率）來
  // 乘它：那一格乘的是**卡面秒**，而 `internalCooldown` 從第一天起就是實際秒。
  // 兩把尺量同一件事正是 GH#489 那個 5 倍陷阱本身。
  const seconds = applyHookCooldownFloor(world.cooldownRules, hook.internalCooldown * factor);
  return Math.round(seconds / world.dt);
}

/**
 * ⭐ 一份來源的 `hooks` 陣列**被換掉**時，跟著它作廢的**每一本**位置索引帳。
 *
 * ── 為什麼是一個函式而不是四行 ────────────────────────────────────────────
 * 這四本帳全部以 `hooks[hi]` 的**位置**索引，所以陣列一換，第 hi 格記的就不再是
 * 第 hi 條 hook 的事。在這支存在之前，唯一的換陣列站點（`aura/aura.ts` 的
 * rank-up / 換裝）只清了**前兩本**（`hookLastFired` / `hookLastFiredBySlot`），
 * 而 S6 那兩本（`hookFireCount` / `hookFireCountByTarget`）是後來加的、沒有人回來
 * 補這一行 —— 於是一次靈氣 rank-up 會把某一條 hook 的額度**錯記到另一條頭上**：
 * 陣列變短時它把用掉的「下一次普攻」還給玩家，陣列重排時它讓一條全新的 hook
 * 一次都發不出來。⛔ 兩個方向的症狀都是「這張卡好像有時候壞掉」，而全套測試是綠的。
 *
 * ⚠️ 所以第五本帳出現的那一天，改的是**這裡**，不是去每一個換陣列的站點各補一行
 * （CLAUDE.md 第零守則⑨：N 個同型 = 1 個模板）。今天全 repo 只有 `aura.ts` 一處真的
 * 在**原地**換 `hooks`；其餘（`syncAbilityPassives` / `attachToggleWhileOn` /
 * `applyBuff` / `itemModifierSource`）都是 detach + attach 一個**全新物件**，
 * 四本帳本來就不存在。`syncItemSources` 只覆寫 `modifiers`，碰不到 `hooks`。
 *
 * ⛔ 語意是**作廢**（＝額度重新開始），不是「照 key 搬過去」。理由是它必須和
 * 隔壁那兩本一致：`hookLastFired` 從第一天起就在 rank-up 時歸零（一次升級會刷新
 * 內部冷卻），四本帳用兩種不同的存活規則才是真正難查的那種缺陷。
 */
export function invalidateHookLedgers(src: ModifierSource): void {
  src.hookLastFired = undefined;
  src.hookLastFiredBySlot = undefined;
  src.hookFireCount = undefined;
  src.hookFireCountByTarget = undefined;
}
