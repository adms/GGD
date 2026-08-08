/**
 * `applyStatus` — attach / refresh a status marker (CC, combo window, …).
 *
 * Moved out of the effectRunner switch by GH#289; body unchanged.
 */
import type { EffectKindSpec } from "./effectKind";
import { recordCc } from "../stats/matchStats";
import { refusesControl } from "./invulnerable";
import { Statuses } from "../content/registry";
import { clampMarkCount } from "../markLimits";

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
      /** 這一次施加**真的把層數推高了**嗎 —— 見下面 `statusApplied` 那一段。 */
      let stacksGrew = false;
      if (existing) {
        addedTicks = Math.max(0, expiresAtTick - existing.expiresAtTick);
        existing.expiresAtTick = Math.max(existing.expiresAtTick, expiresAtTick);
        /**
         * ⭐ 層數累加（GH#301-5）。
         *
         * ⛔ **只有作者明寫 `stacks` 的那些卡才累加。** 沒寫 = 這不是一支疊層的
         * 狀態 = 續期就只是續期，跟這一行之前逐字相同。這個條件不是保守，它是
         * 相容性本身：出貨的 28 份狀態沒有一份寫了 `stacks`，無條件累加會讓
         * 每一次重複施加的【暈眩】【減速】默默變成 2 層、3 層 —— 沒有人會在
         * 畫面上看出來，但任何一顆問層數的條件葉從此對它們全部說謊。
         *
         * 上界走 `clampMarkCount`（`sim/markLimits.ts`，同一份表、同一個夾取），
         * ⛔ 不抄字面值 999：schema 的 `.max(MARK_MAX_COUNT)` 擋的是**一次施加**
         * 寫得太大，這裡擋的是**累加**爬過頭，兩道守的是同一個上界。
         */
        if (e.stacks !== undefined) {
          const before = existing.stacks ?? 1;
          existing.stacks = clampMarkCount(before + e.stacks);
          stacksGrew = existing.stacks > before;
        }
      } else {
        addedTicks = Math.max(0, expiresAtTick - world.tick);
        st.effects.push({
          statusId: e.statusId,
          sourceId: ctx.origin,
          expiresAtTick,
          // ⭐ 層數（GH#301-5）。作者沒寫 = `undefined`，讀取端一律當 1
          // （`statusStacks`）。⛔ 這裡**不要**寫 `e.stacks ?? 1`：那會讓 28 份
          // 出貨狀態全部長出一格「1」，然後「這一份有沒有在疊層」就永遠分不出來，
          // 而上面那道「沒寫就不累加」的相容性閘會失去它的判準。
          stacks: e.stacks !== undefined ? clampMarkCount(e.stacks) : undefined,
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
      // 【狀態被套用的當下】(GH#300) —— `systems/WorldHookSystem.ts` 把它轉成
      // `onStatusApplied`。emit 而不是 `fireHooks`，理由與下面那個 `stunApplied`
      // 逐字相同（import 環）。
      //
      // ⛔ **續期不重觸發**。少了這道閘，一支每 tick 續期的減速會讓「狀態掛上時
      // 獲得 X」每秒發 30 次 —— 與 `onStunned` 當初窄化的理由一模一樣。
      // ⛔ 也在免控那道 `continue` **之後**：被免控拒絕掛上的那一筆不算套用成功，
      // 否則「敵人中了狀態就追加」會在對方完全免疫時照樣發動。
      //
      // ─────────────────────────────────────────────────────────────────────
      // ⭐ 決策點（B×D 交互，2026-08-09 整合時裁決）：**疊上第 2 層算不算「被套用」？**
      //
      // 算 —— 但只有**層數真的長高**的那一次算，純續期不算。三種寫法都試過：
      //
      //   ① 只有第一次算（`!existing`）：`stacks` 從此只有第一層看得見，
      //      「疊到 N 層引爆」這種卡**寫不出來** —— 而那正是 owner 在 #299 第 8 條
      //      要層數的理由（「會連動技能 ID 或狀態疊層」）。做了一個數字卻沒有任何
      //      時刻可以掛在上面，就是失敗形態②。
      //   ② 每一次施加都算：把上面那道「續期不重觸發」的閘整個拆掉，
      //      一支每 tick 續期的減速又會每秒發 30 次。
      //   ③（選這個）**新掛上** ∪ **層數真的增加**。
      //
      // ⭐ ③ 為什麼在相容性上是安全的：`stacksGrew` 只可能在作者**明寫了
      // `stacks`** 的卡上為真（上面那個 `e.stacks !== undefined` 閘），而出貨的
      // 28 份狀態沒有一份寫 —— 所以既有內容一次都不會多發一則。
      // ⭐ 而且它用的是 `> before` 而不是「有沒有寫 stacks」：夾到上限（999）
      // 之後再疊不會發，因為那一刻身上的層數**沒有變**，而這則事件說的是
      // 「這個人身上的層數變了」，不是「有人又打了一發」。
      if (!existing || stacksGrew) {
        world.emit("statusApplied", { target, source: ctx.caster, statusId: e.statusId, origin: ctx.origin });
      }
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
