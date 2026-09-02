/**
 * ⭐⭐ **動作脈衝的詞彙表 —— 唯一住處**（GH#940 的地基）。
 *
 * owner 2026-09-02（逐字，這條 lane 的分工）：
 * > **Main 的責任是「製作積木、提供事件與預設解析規則」**；
 * > Editor 負責用積木拼成技能成品。
 *
 * ⛔⛔ **在此之前這個聯集手抄在五個住處**，而其中只有一個是真的 type：
 *
 * | 住處 | 形狀 |
 * |---|---|
 * | `apps/client/src/render/anim/AnimationStateMachine.ts` | `type AnimPulse`（⭐ 真的那個） |
 * | `apps/client/src/game/appBridges.ts` | 手打字面值 **×3** |
 * | `apps/client/src/vfx/VfxSystem.ts` | 手打字面值 |
 * | `apps/client/src/vfx/VfxScriptPlayer.ts` | 手打字面值 |
 * | `packages/shared/src/content/schema/vfxScript.ts` | `z.enum([...])` 手打 |
 *
 * ⇒ ⭐ **加一塊動作積木漏改任一處，⛔ 不會有任何 tsc 紅** ——
 * 那是第〇·七守則點名的「**一行接線**」病，
 * ⭐ 而它的正解是讓那幾行**自動推導**，⛔ 不是拆檔。
 *
 * ### ⭐ 為什麼住在 `packages/shared`，⛔ 不是 client
 *
 * `content/schema/vfxScript.ts` 的 `z.enum` 是這五個住處之一，
 * ⛔ 而 shared **不可以** import client。⇒ 唯一能同時服務兩邊的住處在這裡。
 * 客戶端那一份（`AnimationStateMachine.ts`）改成**門面**（re-export），
 * ⭐ 所以既有的 100+ 個 import 端一個都不用動（`config.ts` 拆檔的第 1 個必要條件）。
 *
 * ### ⚠️ 這**不是** `AnimState`
 *
 * `AnimState`（idle｜run｜attack｜cast｜hurt｜death）是**狀態機的格子**；
 * `AnimPulse` 是**外面打進來的一次性脈衝**。前者含 `idle`/`run`/`death`
 * （由移動與死亡驅動，⛔ 沒有人「pulse 一個 idle」）⇒ 兩者刻意不同。
 *
 * ### ⭐ 加一塊新的動作積木要做什麼
 *
 * 1. 在 `ANIM_PULSES` 加一格（⭐ **只有這裡**）
 * 2. 在 `PULSE_MS` 給它一個窗 —— ⭐ `Record<AnimPulse, number>` 會**逼 tsc 紅**
 * 3. 客戶端的狀態機給它一個 `AnimState` 對應（同樣是 `Record` ⇒ 紅）
 * 4. ⚠️ **素材可能沒有**：264 顆出貨 `.glb` 的動畫名普查裡
 *    `dodge`／`dash`／`leap`／`teleport`／`guard`／`revive`／`berserk` **全部是 0 位元組**，
 *    而 **49/152 隻英雄六個狀態播的是同一條剪輯**
 *    ⇒ ⭐ 新積木**必須帶降級路徑**，⛔ 不可以假設宣告了就播得出來。
 */

/**
 * ⭐ 出貨的脈衝詞彙 —— **順序有意義**（`z.enum` 的錯誤訊息會照這個順序列）。
 *
 * ⚠️ `as const` 是承重的：少了它 `z.enum()` 收不到字面值型別，
 * 而 `Record<AnimPulse, number>` 會退化成 `Record<string, number>`
 * ⇒ ⭐ 上面第 2 步那個「會逼 tsc 紅」的保證就沒有了。
 */
export const ANIM_PULSES = ["attack", "cast", "hurt"] as const;

export type AnimPulse = (typeof ANIM_PULSES)[number];

/**
 * 每一塊脈衝預設佔用的剪輯窗（毫秒）。
 *
 * ⭐ `Record<AnimPulse, number>` ⇒ 在 `ANIM_PULSES` 加一格而忘了給窗 ⇒ **tsc 紅**。
 * ⚠️ 這幾個數字是**行為**（一次揮擊看起來多長），⛔ 不是平衡數值
 * ⇒ 它們留在程式裡是對的（第二守則：守衛驗機制，⛔ 不驗數字）。
 */
export const PULSE_MS: Record<AnimPulse, number> = {
  attack: 350,
  cast: 450,
  hurt: 250,
};

/** ⭐ 執行期的收窄 —— 給讀**外部 JSON／網路訊息**的地方用。 */
export function isAnimPulse(v: unknown): v is AnimPulse {
  return typeof v === "string" && (ANIM_PULSES as readonly string[]).includes(v);
}

/**
 * ⭐⭐ **狀態格的詞彙表** —— 同一個病的**上一層**。
 *
 * ⛔ 2026-09-02 掃出貨原始碼量到：這六格手抄在**六個住處**
 * （`voxel/clips.ts` 的 `CLIP_STATES` · `AnimationStateMachine.ts` 的 `AnimState` ·
 * `championModelAudition.ts` 的 `ANIM_STATES` · `blizzardOverlay.ts` 的行內陣列 ·
 * `WhirlwindFx.ts` 的 `WhirlwindState` · `apps/editor/preview3d/clips.ts` 的
 * **第二個** `CLIP_STATES`）。
 *
 * ⭐ **唯一住處是 `voxel/clips.ts` 的 `CLIP_STATES`**，⛔ 不是這裡 ——
 * 那一份與 `zClipMap` 的 `.strict()` 綁在一起（「`clipMapFor()` 因此是
 * TOTAL by construction」），⭐ 那個綁定是**承重的**，把它搬走只會弄丟它。
 * ⇒ 這裡只做**轉出**，讓 client / editor 有一個跟脈衝同一個門的入口。
 *
 * ⚠️ **狀態 ≠ 脈衝**：狀態含 `idle`／`run`／`death`（由移動與死亡驅動），
 * ⛔ 沒有人「pulse 一個 idle」。兩者刻意是不同的詞彙表。
 */
export { CLIP_STATES as ANIM_STATES, type ClipState as AnimState } from "../voxel/clips";
