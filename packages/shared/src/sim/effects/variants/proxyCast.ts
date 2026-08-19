/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { AbilityId } from "../../../ids";
import type { CastableSlot } from "../../intents";

export interface ProxyCastVariant {
  /**
   * ⭐ S5【代放】—— 一支技能**施放另一支技能**（80-04 赤兔咆哮「攻擊時有
   * 20% 使出弒鬼神」）。
   *
   * 今天這一族只能靠**手抄一份 payload**：80-04 帶著 `spawnProjectile` +
   * damage `[10,20,30]`，而 80-02 弒鬼神本人是同一個 projectileId + damage
   * `[150,250,350,0,0]` —— 同一支技能的兩份 payload，數字**已經不一樣了**。
   *
   * ⚠️ `content/templates/expand.ts` 的 `"proxy-cast"` 是一個**模板家族名**，
   * 不是這個 kind（它自己的檔頭寫著「這裡不召喚任何東西」，展開結果只有
   * `damage` + 選配 `applyStatus`）。對外契約要把這件事講清楚，否則同一個字
   * 會撒第三次謊。
   *
   * ⛔ **終止性是這個 kind 的正確性義務，不是選配**：
   * `EffectContext.proxyDepth` 嚴格遞增，閘門是 `proxyDepth > maxDepth →
   * return`，上界由 Zod 夾在 `PROXY_MAX_CHAIN_DEPTH`。上界 + 嚴格遞增 ⇒
   * 鏈長有限 ⇒ 一定終止。這個證明的形狀與 `effects/damage.ts` 的
   * `reflectDepth` 逐字相同 —— ⛔ 不要發明第二套。
   */
  kind: "proxyCast";
  /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
  shape: "single" | "circle";
  radius?: number;
  side?: "allies" | "enemies";
  maxTargets?: number;
  /** 代放**我自己的哪一格**。與 {@link abilityId} **恰好填一個**（schema 擋）。 */
  slot?: CastableSlot;
  /** 代放**哪一支具名技能**（軟參照）。與 {@link slot} 恰好填一個。 */
  abilityId?: AbilityId;
  /**
   * 代放要不要付代價。省略 = `"none"`（不扣魔、不轉冷卻）。
   *
   * ⚠️ 預設的理由是可檢查的：80-04 的「攻擊時有 20% 使出弒鬼神」是每次普攻都
   * 可能觸發的 proc；若它燒掉 80-02 那 35 秒的冷卻，這支大絕就會**自己刪掉
   * 自己的 W**，而畫面上只看得到「W 一直是灰的」。三個值全做，讓 owner 改一格
   * 下拉就能翻案。
   *
   * ⚠️ `"mana"` / `"manaAndCooldown"` 走的是 `castAbility` **同一排閘**
   *（魔力／沉默／暈眩／擊倒／暴走）—— ⛔ 不可以在 handler 裡自己再寫一次
   * 那些 if，那是兩份會分岔的判斷。副作用要說在明處：`castAbility` 有一道
   * 「已在吟唱中就拒絕」，所以代放一支有 `castTimeSec` 的技能會在施法者正在
   * 吟唱時被拒 —— 那是**正確**的（一個人不能同時吟唱兩招）。
   */
  payCosts?: "none" | "mana" | "manaAndCooldown";
  /** 代放要不要看那一格真按鈕的冷卻。省略 = `false`。⛔ 與 {@link payCosts} 是兩個問題。 */
  respectCooldown?: boolean;
  /** rank 0（沒點那一招）時什麼都不發生。省略 = `true`。 */
  requireLearned?: boolean;
  /** 用哪一階施放。省略 = `"casterRank"`（玩家的投資）。 */
  rankMode?: "casterRank" | "fixed";
  /** `rankMode: "fixed"` 的那一階。 */
  fixedRank?: number;
  /** 目標從哪來。省略 = `"inherit"`（沿用觸發事件的 targets/point/direction）。 */
  targetMode?: "inherit" | "reresolve";
  /**
   * 代放鏈最多再往下幾層。省略 = **0**（A 代放 B，B 自己的 `proxyCast` 直接
   * 被擋）—— 逐字沿用 `damage.incomingPct.maxChainDepth` 的預設與理由。
   * 上界 `PROXY_MAX_CHAIN_DEPTH`。
   */
  maxDepth?: number;
  /**
   * ⭐ 第一守則（2026-08-10）—— `payCosts:"none"` 要不要發 `onAbilityCast` /
   * `onAbilityHit`。省略 = **false** = 今天的行為（那條路直接 `runEffects`，
   * 繞過 `castAbility`，所以兩個事件從來不發）。
   *
   * ⛔ 在這一格出現之前，「不發」是一個**沒有欄位的選擇** —— 而
   * 「代放算不算一次施法」是設計偏好不是引擎事實：80-04 那種每次普攻都可能
   * 觸發的 proc 不該再觸發一輪「施法時」被動，但「大絕結束後自動再放一次 Q」
   * 會希望它算數。
   *
   * ⚠️ 打開它之後遞迴由既有的深度計數擋（{@link maxDepth} +
   * `proxyStackDepth`），⛔ 不是靠這一格關著。`"mana"` / `"manaAndCooldown"`
   * 走 `castAbility`，兩個事件本來就會發，所以這一格對它們沒有作用。
   */
  emitCastEvents?: boolean;
}
