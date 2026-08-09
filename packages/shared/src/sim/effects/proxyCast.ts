/**
 * `proxyCast` —— ⭐ S5【代放】：一支技能**施放另一支技能**。
 *
 * 擋住 80-04 赤兔咆哮「攻擊時有 20% 機率使出**弒鬼神**」。今天這一族只能靠
 * **手抄一份 payload**：80-04 帶著 `spawnProjectile` + damage `[10,20,30]`，
 * 而 80-02 弒鬼神本人是同一個 projectileId + damage `[150,250,350,0,0]` ——
 * 同一支技能的兩份 payload，**數字已經不一樣了**。抄一份的代價不是重複，
 * 是兩份會各自腐爛，而畫面上看不出是哪一份在跑。
 *
 * ⚠️ `content/templates/expand.ts` 的 `"proxy-cast"` 是一個**模板家族名**不是
 * 這個 kind（它自己的檔頭寫著「這裡不召喚任何東西」，展開結果只有 `damage`
 * ＋選配 `applyStatus`）。同一個字已經指過兩件事，不要讓它指第三件。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① ⛔ 終止性是這個 kind 的**正確性義務**，不是選配
 *
 * 形狀逐字沿用 `combat/damage.ts` 的 `reflectDepth`：**嚴格遞增的深度 + 一個
 * 有界的上限 ⇒ 鏈長有限 ⇒ 一定終止**。⛔ 不要發明第二套。
 *
 * 深度有**兩個載體**，而兩個都是必要的：
 *
 *   · {@link EffectContext.proxyDepth} —— `payCosts: "none"` 那條路。深度騎在
 *     ctx 上（一次執行的性質，不是世界的性質），所以同一 tick 兩支技能各自
 *     代放不會被算成同一條鏈。
 *   · {@link proxyStackDepth} —— `payCosts: "mana"` / `"manaAndCooldown"` 那條
 *     路。⚠️ 它必須存在，因為 `castAbility` 內部的 `runEffects` **不帶**
 *     `proxyDepth`（它是每一個既有呼叫點都不用改的那個保證的另一面），所以
 *     A 代放 B、B 的效果再代放 A 會把 ctx 上的深度**歸零** —— 兩支 manaCost 0
 *     的技能就是一個不會回來的 `world.step()`，而那不是一個看得出來的錯誤。
 *     它是**呼叫堆疊**的深度：`try/finally` 嚴格配對地進出，所以它是這一次
 *     同步呼叫的純粹性質，不跨 tick、不跨世界、不進 digest。
 *
 * 閘門讀兩者的**最大值**，所以混著走的鏈也停得下來。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ② `payCosts` 的兩條路，以及為什麼不在這裡重寫一次那些閘
 *
 *   · `"none"`（預設）→ 直接 `runEffects` 目標技能的 `effects`。
 *   · `"mana"` / `"manaAndCooldown"` → **走 `castAbility` 的同一排閘**
 *     （魔力／沉默／暈眩／擊倒／暴走／學過沒有／已在吟唱）。⛔ 不可以在這裡
 *     自己再寫一次那些 if：那是兩份保證會分岔的判斷，而編輯器上看起來一樣。
 *
 * ⭐ `"mana"` 與 `"manaAndCooldown"` 的差別只有**一行**：前者在 `castAbility`
 * 回 ok 之後把那一格的冷卻**還原**回代放前的值。⛔ 不是「跳過付冷卻」——
 * 跳過就得在 `castAbility` 裡開一個參數，而那條路上的每一個呼叫點都要跟著改。
 *
 * ⚠️ 預設 `"none"` 的理由是可檢查的：80-04 是每次普攻都可能觸發的 proc；若它
 * 燒掉 80-02 那 35 秒的冷卻，這支大絕就會**自己刪掉自己的 W**，而畫面上只看得
 * 到「W 一直是灰的」。三個值全做，owner 改一格下拉就能翻案（第一守則）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ③ ⭐ `emitCastEvents`（2026-08-10）——「代放算不算一次施法」是**一格欄位**
 *
 * `payCosts:"none"` 那條路直接 `runEffects`、繞過 `castAbility`，所以
 * `onAbilityCast` / `onAbilityHit` **從來不發**。那是刻意的（避免代放無限遞迴
 * 觸發），但在這一格出現之前它是一個**沒有欄位的選擇** —— 而第一守則說
 * 「這裡選 A 還是 B」就該是一格：80-04 那種每次普攻都可能觸發的 proc 不該再
 * 觸發一輪「施法時」被動，但一支「大絕結束後自動再放一次 Q」的卡片會希望它算數。
 *
 * 預設 = `false` = **今天的行為**（既有內容逐位元不變）。
 * ⛔ 打開它之後遞迴由**既有的深度計數**擋，不是靠這一格關著：`fireHooks` 開的是
 * 全新的 `EffectContext`（不帶 `proxyDepth`），所以發事件的那一段必須自己把
 * {@link proxyStackDepth} 推上去 —— 少了那一行，A 的施法事件觸發 B、B 再代放 A
 * 就是一個不會回來的 `world.step()`，而且不會有任何錯誤訊息。
 */
import type { AbilityId, EntityId } from "../../ids";
import type { CastTarget, CastableSlot } from "../intents";
import type { EffectKindSpec } from "./effectKind";
import type { AbilitiesComp, AbilityInstance } from "../stats/statsComp";
import { Abilities } from "../content/registry";
import { abilityInstanceFor } from "../abilities/innateActive";
import { castAbility } from "../abilities/abilitySystem";
import { runEffects } from "./effectRunner";
import { fireHooks } from "./hooks";
import { shapeTargets } from "./shapeTargets";
import { CASTABLE_SLOTS } from "../intents";
import { PROXY_MAX_CHAIN_DEPTH } from "./kindLimits";

/**
 * 目前**呼叫堆疊**上有幾層代放（檔頭①的第二個載體）。
 *
 * ⛔ 這不是「世界狀態」：它由 `try/finally` 嚴格配對地進出同一次同步呼叫，
 * 迴圈結束時必定回到 0，從不跨 tick、不進 `digest()`、不被序列化。
 * ⛔ 也不要把它「順手」搬進 `SimWorld` —— 那會讓同一 tick 兩條互不相干的鏈
 * 互相扣對方的額度（`EffectContext.proxyDepth` 檔頭上的同一個論證）。
 */
let proxyStackDepth = 0;

/** 這一次代放要用哪一格 slot / 哪一支技能 / 第幾階。 */
function resolveProxyTarget(
  ab: AbilitiesComp,
  slot: CastableSlot | undefined,
  abilityId: AbilityId | undefined,
): { slot?: CastableSlot; inst?: AbilityInstance; abilityId?: AbilityId } {
  if (slot !== undefined) {
    const inst = abilityInstanceFor(ab, slot);
    return {
      slot,
      ...(inst ? { inst, abilityId: inst.abilityId } : {}),
    };
  }
  if (abilityId === undefined) return {};
  // ⚠️ 軟參照：`abilityId` 指的可能是施法者**沒有**的技能（那時 `inst` 缺席，
  // 由 `requireLearned` 決定要不要繼續）。⛔ 不掃 registry 找「誰有這支」——
  // 代放的主詞永遠是施法者自己。
  for (const s of CASTABLE_SLOTS) {
    const inst = abilityInstanceFor(ab, s);
    if (inst && inst.abilityId === abilityId) return { slot: s, inst, abilityId };
  }
  return { abilityId };
}

/** 把「我們解出來的目標」翻譯成 `castAbility` 要的那一種 `CastTarget`。 */
function castTargetFor(
  castType: string,
  targets: EntityId[],
  point: { x: number; z: number } | undefined,
  direction: { x: number; z: number } | undefined,
  selfPos: { x: number; z: number } | undefined,
  facing: { x: number; z: number } | undefined,
): CastTarget | undefined {
  switch (castType) {
    case "self":
      return { type: "self" };
    case "targeted":
      return targets[0] !== undefined ? { type: "entity", entityId: targets[0] } : undefined;
    case "ground": {
      const p = point ?? selfPos;
      return p ? { type: "point", point: { x: p.x, z: p.z } } : undefined;
    }
    default: {
      // skillshot / dash — 方向；沒有方向就用自己現在的面向（「往前放」）。
      const d = direction ?? facing;
      return d ? { type: "dir", dir: { x: d.x, z: d.z } } : undefined;
    }
  }
}

export const proxyCastEffect: EffectKindSpec<"proxyCast"> = {
  apply(e, ctx) {
    const { world } = ctx;

    // ⭐ 終止性閘門（檔頭①）。上界由 Zod 夾在 PROXY_MAX_CHAIN_DEPTH，這裡再夾
    // 一次是因為 handler 也吃得到未經 Zod 的執行期物件（測試夾具、模板展開）。
    const depth = Math.max(ctx.proxyDepth ?? 0, proxyStackDepth);
    if (depth > Math.min(e.maxDepth ?? 0, PROXY_MAX_CHAIN_DEPTH)) return;

    const ab = world.abilities.get(ctx.caster);
    if (!ab) return;

    const found = resolveProxyTarget(ab, e.slot, e.abilityId);
    const abilityId = found.abilityId;
    if (abilityId === undefined) return;
    const def = Abilities.tryGet(abilityId);
    // ⛔ 軟參照解析不到 = 什麼都不發生。`Abilities.get` 會丟，而一份指到已下架
    // 技能的卡片不該讓整場比賽掛掉。
    if (!def) return;

    const learnedRank = found.inst?.rank ?? 0;
    if ((e.requireLearned ?? true) && learnedRank <= 0) return;
    const rank =
      e.rankMode === "fixed"
        ? Math.max(1, Math.floor(e.fixedRank ?? 1))
        : Math.max(1, learnedRank);

    // 目標：預設沿用觸發這一次的那一組（80-04 的「攻擊時」＝ 打到誰就對誰放）。
    const targets = (e.targetMode ?? "inherit") === "reresolve" ? shapeTargets(e, ctx) : ctx.targets;

    if ((e.payCosts ?? "none") === "none") {
      runEffects(def.effects, {
        world,
        caster: ctx.caster,
        rank,
        targets,
        ...(ctx.point !== undefined ? { point: ctx.point } : {}),
        ...(ctx.direction !== undefined ? { direction: ctx.direction } : {}),
        // provenance 是**被代放的那一支**，不是代放它的那一支 —— 傷害面板、
        // `damageSource: "ability"` 的判定、擊殺歸屬讀的都是這個字串。
        origin: `ability:${abilityId}`,
        ...(found.slot !== undefined ? { abilitySlot: found.slot } : {}),
        proxyDepth: depth + 1,
        rng: world.rng,
      });
      // ⭐ 檔頭③ —— 「這一次代放算不算一次施法」是**一格欄位**，預設是今天的行為。
      // 順序與 `castAbility` 逐字相同（effects 先跑完，事件才發），否則一條
      // 「施法時 +攻速」的被動會在這一發的傷害結算**之後**才生效。
      if (e.emitCastEvents === true) {
        // ⛔ 深度**必須**在這裡也扣：`fireHooks` 開的是全新的 `EffectContext`
        // （不帶 `proxyDepth`），所以 A 的施法事件觸發 B、B 又代放 A 會把 ctx 上的
        // 深度歸零 —— 那是一個不會回來的 `world.step()`，而且不會有任何錯誤訊息。
        // 這正是 `proxyStackDepth` 存在的理由（檔頭①的第二個載體），⛔ 不要另發明。
        proxyStackDepth = depth + 1;
        try {
          fireHooks(world, ctx.caster, "onAbilityCast", targets[0], found.slot);
          for (const hitId of targets) {
            if (hitId !== ctx.caster) fireHooks(world, ctx.caster, "onAbilityHit", hitId, found.slot);
          }
        } finally {
          proxyStackDepth = depth;
        }
      }
      return;
    }

    // ── 付代價那一條路：走 `castAbility` 的同一排閘（檔頭②）────────────────
    const slot = found.slot;
    const inst = found.inst;
    if (slot === undefined || inst === undefined) return;

    const t = world.transform.get(ctx.caster);
    const target = castTargetFor(
      def.castType,
      targets,
      ctx.point,
      ctx.direction,
      t?.pos,
      t?.facing,
    );
    if (!target) return;

    const cdBefore = inst.cooldownRemainingTicks;
    // `respectCooldown` 與 `payCosts` 是**兩個問題**：「要不要付」與「要不要看」。
    // 省略 = 不看 = 一個 proc 不會因為玩家剛按過那顆按鈕就啞掉。
    if (!(e.respectCooldown ?? false)) inst.cooldownRemainingTicks = 0;

    proxyStackDepth = depth + 1;
    let result;
    try {
      result = castAbility(world, ctx.caster, slot, target);
    } finally {
      proxyStackDepth = depth;
    }

    // `"mana"` = 扣魔但**不燒冷卻**；被拒（沒魔／沉默／暈眩／吟唱中）一律還原。
    if (result !== "ok" || e.payCosts === "mana") inst.cooldownRemainingTicks = cdBefore;
  },
};
