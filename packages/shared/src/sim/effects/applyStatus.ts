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
    //
    // ⭐ 恐懼**算** CC，而它上面那位鄰居 `berserk` 刻意不算 —— 兩者的差別不是
    // 「有多硬」，是**誰授權的**（`sim/fear.ts` 決策 3）：
    //   · 暴走是自我增益帶 downside，所以一個魔免 buff 不該讓初號機自己的暴走
    //     落不到自己身上；
    //   · 恐懼是**敵人塞過來的**純減益，而且比同一行裡已經算 CC 的
    //     `moveSpeedMult < 1` 更徹底地拿走控制權。免控擋得掉 30% 減速卻擋不掉
    //     「這 3 秒你不能操作」，那個組合對玩家無法解釋。
    // 加在這一行（而不是四個 CC 讀取點）換到兩件事：免控會拒絕**掛上**並發
    // `immuneControl` 讓玩家看見，而且恐懼的時間會進 `ccAppliedTicks` 戰績。
    const isCc =
      e.stun === true ||
      e.root === true ||
      e.feared === true ||
      (e.moveSpeedMult !== undefined && e.moveSpeedMult < 1);
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
          // 恐懼 —— 暴走的鏡像（`sim/fear.ts`）。同樣跟著 status 到期,所以
          // 「永久嚇到不能玩」在結構上不可能發生。
          feared: e.feared,
          // 增益還是減益 —— A4b(#278) 把這條線接上。
          // ⛔ 不從 `moveSpeedMult` 之類的欄位猜:1.3 的加速與 0.7 的減速在結構上
          // 一模一樣。答案住在 `status-effect@1` 文件裡(14/14 都填了),
          // 而 sim 透過 `Statuses` 登錄表讀它。查不到 = undefined = 有方向的
          // 淨化拔不到它(`clearPools.polarityPasses`:「不知道」不當成「是」)。
          polarity: Statuses.tryGet(e.statusId)?.polarity,
          // 可不可以被淨化拔掉 —— GH#295。缺席時 `clearPools` 讀
          // `dispelRules.statusDefaultDispellable`（出貨 true），所以這一格是
          // 「作者明講不可驅散」的**唯一**寫法。不寫這一行 = schema 收得下、
          // 後台畫得出來、而引擎永遠讀不到（失敗形態 ②）。
          dispellable: e.dispellable,
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
