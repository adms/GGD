/**
 * `applyStatus` — attach / refresh a status marker (CC, combo window, …).
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { recordCc } from "../stats/matchStats";
import { refusesControl } from "./invulnerable";
import { Statuses } from "../content/registry";

export const applyStatusEffect: EffectKindSpec<"applyStatus"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const expiresAtTick = world.tick + Math.round(e.duration / world.dt);
    // hard/soft CC (stun/root/slow) applied to an enemy scores ccAppliedTicks
    const isCc =
      e.stun === true || e.root === true || (e.moveSpeedMult !== undefined && e.moveSpeedMult < 1);
    // `applyTo: "self"` is the COMBO-WINDOW form: the marker belongs on the
    // caster even though the ability's own targeting resolved enemies (07-02
    // 者、皆、陣 is unit-targeted and still sets udg_MoonCombo, j:34438).
    const subjects = e.applyTo === "self" ? [ctx.caster] : ctx.targets;
    for (const target of subjects) {
      const st = world.status.get(target);
      if (!st) continue;
      // ── 免控 (GH#289 lane P3) ────────────────────────────────────────────
      // THE ONLY LINE lane P3 adds outside its own files, and it is here rather
      // than at the four CC READ sites (movementHold / abilitySystem /
      // CastResolveSystem / BasicAttackSystem) on purpose: refusing the ATTACH
      // makes every one of those consumers correct without any of them knowing
      // immunity exists — which is also how WC3 models it (the spell simply
      // fails to affect the unit).
      //
      // Two deliberate narrowings:
      //   · only `isCc` — a combo WINDOW / marker is not control, so a 免控
      //     buff must never eat 蒼月潮's own `moon-combo` marker (that would
      //     silently delete 07-03 列、在、前's bonus damage);
      //   · only when the subject is NOT the caster — WC3 immunity refuses the
      //     ENEMY's spells; a self-applied marker or self-root is your own.
      if (isCc && target !== ctx.caster && refusesControl(world, target)) {
        // ② the player must SEE the refusal, not just not-be-stunned.
        world.emit("immuneControl", { target, source: ctx.caster, statusId: e.statusId, origin: ctx.origin });
        continue;
      }
      // refresh rule: same status id + origin replaces (no stacking in skeleton)
      const existing = st.effects.find(
        (s) => s.statusId === e.statusId && s.sourceId === ctx.origin,
      );
      let addedTicks = 0;
      if (existing) {
        addedTicks = Math.max(0, expiresAtTick - existing.expiresAtTick);
        existing.expiresAtTick = Math.max(existing.expiresAtTick, expiresAtTick);
      } else {
        addedTicks = Math.max(0, expiresAtTick - world.tick);
        st.effects.push({
          statusId: e.statusId,
          sourceId: ctx.origin,
          expiresAtTick,
          moveSpeedMult: e.moveSpeedMult,
          root: e.root,
          stun: e.stun,
          missChance: e.missChance,
          // 暴走 (59-00). 它跟著 status 一起到期,所以「永久失去方向盤」在結構上
          // 不可能發生 —— 見 components.ts 的 `StatusEffect.berserk`。
          berserk: e.berserk,
          // 增益還是減益 —— A4b(#278) 把這條線接上。
          // ⛔ 不從 `moveSpeedMult` 之類的欄位猜:1.3 的加速與 0.7 的減速在結構上
          // 一模一樣。答案住在 `status-effect@1` 文件裡(14/14 都填了),
          // 而 sim 透過 `Statuses` 登錄表讀它。查不到 = undefined = 有方向的
          // 淨化拔不到它(`clearPools.polarityPasses`:「不知道」不當成「是」)。
          polarity: Statuses.tryGet(e.statusId)?.polarity,
          // C4 睡眠 —— 受傷即提早解除這一筆（`sim/statusBreak.ts`）。
          // C1 沉默 / C2 混亂（#278）。
          silenced: e.silenced,
          targetsAllies: e.targetsAllies,
          breakOnDamage: e.breakOnDamage,
          breakOnDamageMin: e.breakOnDamageMin,
          // 【重創】A6 —— 三格獨立（治療 / 吸血係數 / 自然回復）。
          healingTakenMult: e.healingTakenMult,
          lifestealMult: e.lifestealMult,
          regenMult: e.regenMult,
        });
      }
      if (isCc) recordCc(world, ctx.caster, target, addedTicks);
      // 被暈眩的那一刻 (勇者小呆 08-00 龍紋記憶). Emitted, NOT dispatched: firing
      // `fireHooks` from here would close the import ring
      // applyStatus → hooks → effectRunner → effectRegistry → applyStatus, which
      // effectRegistry.ts's own header warns about (the bite is not a compile
      // error, it is an `undefined` handler under the wrong bundler order). So
      // this is a plain event and `systems/CcHookSystem.ts` turns it into the
      // `onStunned` hook, one step later in the same tick.
      //
      // ONLY when a stun actually ATTACHED: a refreshed stun does not re-trigger
      // (`existing` branch above sets no new marker, and re-firing would let a
      // chain-stun re-double 小呆's attributes every tick).
      if (e.stun === true && !existing) {
        world.pendingStunHooks.push({ victim: target, source: ctx.caster });
        world.emit("stunApplied", { target, source: ctx.caster, statusId: e.statusId, origin: ctx.origin });
      }
    }
  },
};
