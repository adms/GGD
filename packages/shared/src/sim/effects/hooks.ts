/**
 * Hook dispatch — event-driven effects from ModifierSources (champion passives,
 * item passives, augments). Hooks run inline at emit time; any damage they
 * produce goes into the damage queue (resolved by combatResolveSystem's bounded
 * multi-pass drain), keeping ordering deterministic.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { HookDef, HookEvent } from "../stats/modifiers";
import { liveAttribute } from "../stats/attrSources";
import { runEffects } from "./effectRunner";
import type { CastableSlot } from "../intents";
import { requirementScale, scaleEffects } from "../content/requirement";
import { evaluateCondition } from "../content/condition";
import type { TriggerDamage } from "./effect";
import { originInScope } from "../combat/damageTypeOverride";

/**
 * 全隊作用域 —— every CHAMPION on `owner`'s team, ALIVE OR DEAD, owner included,
 * in ascending entity-id order. THE resolution of `HookDef.target: "allies"`
 * (天生牙 godie-i031's 「我方所有英雄」/「我們全部英雄」); the membership rules and
 * why the dead are in it are argued on that field in `stats/modifiers.ts`.
 *
 * ⚠️ SORTED. `world.champion` is a Map, and `sim/purity.test.ts` bans relying on
 * its iteration order: without the sort, 「哪一個隊友先被治療」 (and therefore who
 * gets the last point of an overheal-clamped heal) would depend on spawn order.
 *
 * A body with no `TeamComp` — the client's prediction shadow world, a bare test
 * entity — has no team, so it gets an EMPTY list rather than "everybody". An
 * empty target list makes every effect kind a no-op, which is the correct
 * reading of 「我方」 for someone who is on no side.
 */
export function alliedChampions(world: SimWorld, owner: EntityId): EntityId[] {
  const team = world.team.get(owner);
  if (!team) return [];
  const out: EntityId[] = [];
  for (const [id] of world.champion) {
    if (world.team.get(id)?.teamId !== team.teamId) continue;
    out.push(id);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * `HookDef.victim` 的閘 —— 「那個實體符不符合這條 hook 要的身分」。
 *
 * 純函式,**沒有 rng、沒有時鐘**,所以它可以(而且必須)坐在 ICD 閘與機率骰
 * 之前:被它擋掉的一發不可以燒掉持有者的冷卻,也不可以動到 seed。
 *
 * ── 三個「比隊伍」的成員(批 1)──────────────────────────────────────────
 * `world.team.get()` 回 `undefined` 時**一律不通過**。這不是保守的隨手選擇,
 * 是與 {@link alliedChampions} 同向的一條政策:客戶端的預測影子世界裡的身體
 * 沒有 `TeamComp`,而「不知道你站哪一邊」若被讀成「你是敵人」,預測端就會跑出
 * 一份伺服器沒有的觸發 —— 那是一個玩家看得到、而且只在網路上出現的分歧。
 *
 * ── `mobsCountAsEnemy` 只動 `"enemyChampion"` ────────────────────────────
 * `"allyChampion"` 不受影響(殭屍永遠不是隊友);`"enemy"` 本來就收。
 * 全域覆寫存在的理由與它為什麼不是單一布林,見 `sim/augmentEnemyFilter.ts`。
 */
function victimPasses(
  world: SimWorld,
  owner: EntityId,
  victim: HookDef["victim"],
  target: EntityId,
): boolean {
  switch (victim) {
    // Positive tests on BOTH sides: a neutral that is neither (a guardian,
    // a flower) matches neither filter, which is the honest reading of the
    // field name.
    case "mob":
      return world.mob.has(target);
    case "champion":
      return world.champion.has(target);
    case "enemyChampion":
      // ⚠️ `sameTeam(...) !== false` → `=== false` 是 `"champion"` 與
      // `"enemyChampion"` 的**全部**差別。拿掉隊伍比較,13 個寫著「敵方英雄」
      // 的 hook 位置會被隊友的身體觸發,而畫面上跟正常一模一樣。
      return (
        sameTeam(world, owner, target) === false &&
        (world.champion.has(target) ||
          (world.augmentEnemyFilter.mobsCountAsEnemy && world.mob.has(target)))
      );
    case "allyChampion":
      return sameTeam(world, owner, target) === true && world.champion.has(target);
    case "enemy":
      return sameTeam(world, owner, target) === false;
    default:
      return true;
  }
}

/**
 * 兩個身體同不同隊 —— `undefined` = **至少一邊沒有 `TeamComp`**,也就是
 * 「不知道」,而不是「不同隊」。
 *
 * 三個呼叫端都拿 `=== true` / `=== false` 比,所以「不知道」對三個成員一律
 * 是不通過。這個三態是刻意的:寫成 boolean 的話,客戶端預測影子世界裡那些
 * 沒有隊伍的身體會被歸進「不同隊」= 敵人,於是預測端跑出一份伺服器沒有的
 * 觸發。方向與 {@link alliedChampions}(沒有隊伍 → 空名單)一致。
 */
function sameTeam(world: SimWorld, a: EntityId, b: EntityId): boolean | undefined {
  const ta = world.team.get(a);
  const tb = world.team.get(b);
  if (!ta || !tb) return undefined;
  return ta.teamId === tb.teamId;
}

/**
 * `HookDef.damageSource` 的閘 —— 「觸發這一次的那一發封包是什麼來路」。
 *
 * ⛔ `"ability"` / `"other"` 走 `combat/damageTypeOverride.ts` 的
 * {@link originInScope},**不是**第二份 `startsWith("ability:")`。兩份就會有
 * 兩種「什麼算技能傷害」,而它們分歧的那一天,惡夢魔王碎片(`scope:"ability"`)
 * 與這個欄位會對同一發封包給出不同的答案。
 */
function damageSourcePasses(want: NonNullable<HookDef["damageSource"]>, origin: string): boolean {
  const isBasic = originInScope(origin, "basic");
  switch (want) {
    case "basic":
      return isBasic;
    case "nonBasic":
      return !isBasic;
    case "ability":
      return originInScope(origin, "ability");
    case "other":
      return !isBasic && !originInScope(origin, "ability");
    default:
      return true;
  }
}

/**
 * 這條 hook 這一次的內部冷卻該記在哪一格 —— `internalCooldownScope` 的全部。
 *
 * `"source"`(省略 = 這一個)回 `hookLastFired[hi]`,也就是這個欄位出現之前
 * 每一份文件走的那一格。`"perAbilitySlot"` 回該槽位自己的一格,而**沒有槽位的
 * 事件**(`onDamageDealt` / `onBasicAttack` / `onInterval` …)共用 `""` 那一格
 * —— 那正是欄位說明裡寫的「退化成全域」。
 */
const ICD_NO_SLOT_KEY = "";

/**
 * 「這一格從來沒發動過」的 sentinel。夠負,所以 `world.tick - NEVER_FIRED`
 * 一定大於任何 `icdTicks`(上界 `HOOK_INTERNAL_COOLDOWN_MAX_SEC` = 300 秒
 * = 9,000 tick)。與 `hookLastFired` 的初值是**同一個常數**,不是兩個抄過來的
 * 字面值 —— 兩份 sentinel 分歧的那一天,per-slot 的第一次觸發會跟 source 的
 * 不一樣,而那個差別只在某一張卡上看得到。
 */
const NEVER_FIRED = -1e9;

/**
 * 這個 hook 這一次的觸發門檻,`undefined` = 不用抽(必定通過)。
 *
 * ONE draw or ZERO draws, exactly as before this function existed:
 *   · 兩個欄位都沒有 → `undefined` → 不抽(今天絕大多數 hook)
 *   · `chance` → 那個常數(每一份既有文件走這條,值與位置都沒變)
 *   · `chanceFrom` → `clamp(三圍 × coeff, min, max)`
 *
 * ⚠️ 讀不到三圍的身體(不是英雄)回 `min` 而不是 `max`:一件掛在部隊或召喚物
 * 身上的武器沒有敏捷可言,而在資料缺席時發最大獎是這一族最容易出的錯。
 *
 * PURE —— 沒有 rng(骰子在呼叫端),沒有時鐘。所以每個複本算出同一個門檻。
 */
function hookProcChance(world: SimWorld, owner: EntityId, hook: HookDef): number | undefined {
  const from = hook.chanceFrom;
  if (from === undefined) return hook.chance;
  const live = liveAttribute(world, owner, from.attr, from.basis ?? "total");
  if (live === null) return from.min;
  return Math.min(from.max, Math.max(from.min, live * from.coeff));
}

export function fireHooks(
  world: SimWorld,
  owner: EntityId,
  event: HookEvent,
  target?: EntityId,
  abilitySlot?: CastableSlot,
  /**
   * 觸發這一次的那一發傷害 —— 只有 `combatResolveSystem` 的兩個呼叫點會傳
   * (`onDamageDealt` / `onDamageTaken`,同一發封包的兩個視角)。
   *
   * 它一路傳進 `EffectContext.incoming`,是 `damage.incomingPct`(反彈)唯一的
   * 資料來源:`zScaling` 只讀得到 CASTER 的屬性表,「剛剛那一下的 200%」在此之前
   * 完全寫不出來。順便也是 `HookDef.damageSource`(普攻/非普攻)的資料來源。
   */
  incoming?: TriggerDamage,
): void {
  const sc = world.stats.get(owner);
  if (!sc) return;
  const ownerHp = world.health.get(owner);
  if (ownerHp && !ownerHp.alive) return;

  for (const src of sc.sources) {
    if (!src.hooks) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    if (!src.hookLastFired) src.hookLastFired = new Array(src.hooks.length).fill(NEVER_FIRED);

    for (let hi = 0; hi < src.hooks.length; hi++) {
      const hook = src.hooks[hi]!;
      if (hook.on !== event) continue;
      if (hook.abilitySlot && hook.abilitySlot !== abilitySlot) continue;
      // #244 — WHAT died / was hit. Absent or "any" = no filter, so every
      // pre-#244 hook is untouched. An entity-less event never filters.
      //
      // 批 1 (2026-08-04) 把 union 從「是什麼」加寬到「站在哪一邊」
      // (enemyChampion / allyChampion / enemy),判斷搬進 `victimPasses`。
      // ⛔ 位置一個字都沒動 —— 它必須留在 ICD 閘與機率骰**之前**(理由與下方
      // `requires` 那一段完全相同:被擋掉的一發不可以燒 ICD、不可以動 seed)。
      if (hook.victim !== undefined && hook.victim !== "any" && target !== undefined) {
        if (!victimPasses(world, owner, hook.victim, target)) continue;
      }

      // [反彈] 「普通攻擊」 過濾 —— owner 的文案是「反彈**普通攻擊**傷害 200%」,
      // 而在這之前 `onDamageTaken` 分不出普攻、技能與 DoT。
      //
      // 位置:緊跟著 `victim`,因為它跟 `victim` 是同一類東西 —— 「這一則事件
      // 是什麼」的過濾,rng-FREE,而且**在內部冷卻閘與機率骰之前**。理由與
      // `requires` 完全相同(見下方那一段):被這條擋掉的一發不可以燒掉持有者的
      // ICD、也不可以動到 seed,否則每一次被技能打到都會偷偷推進亂數流,
      // 而那一發根本不可能觸發。
      //
      // 沒有封包 = 不通過(跟 `victim` 相反,理由見 `HookDef.damageSource`)。
      if (hook.damageSource !== undefined && hook.damageSource !== "any") {
        if (incoming === undefined) continue;
        if (!damageSourcePasses(hook.damageSource, incoming.origin)) continue;
      }

      // B2 (2026-08-05) —— 「那一發是什麼型別 / 是不是暴擊」。
      //
      // ⛔ 位置與 `damageSource` 完全相同,而且理由**一個字都沒變**:這兩條是
      // 「這一則事件是什麼」的過濾,rng-FREE,必須在**內部冷卻閘與機率骰之前**。
      // 搬到骰子後面 = 被擋掉的一發也抽了籤 = 每一次被非暴擊打到都偷偷推進亂數流,
      // 而那一發根本不可能觸發 —— 那是一條只有 `world.rng.state` 前後比對才看得見
      // 的決定性缺陷,錄影會在幾百 tick 之後才對不起來。
      //
      // 沒有封包 = 不通過(同 `damageSource`):「沒有傷害」不可能是一發魔法傷害,
      // 也不可能是一次暴擊。載入時 `refineHookDamageContext` 已經擋掉把它們掛到
      // 無傷害事件上的文件,所以正常內容碰不到這一行。
      if (hook.damageType !== undefined && hook.damageType !== "any") {
        if (incoming === undefined) continue;
        if (incoming.type !== hook.damageType) continue;
      }
      if (hook.damageCrit !== undefined && hook.damageCrit !== "any") {
        if (incoming === undefined) continue;
        if (incoming.crit !== (hook.damageCrit === "crit")) continue;
      }

      // 職業限定閘 (owner 2026-07-30: 近戰專用擴散 / 法師保命 / 坦克衝刺 /
      // 射手百分比傷害). See sim/content/requirement.ts for the axes and why
      // `role` is not one of them.
      //
      // EVALUATED AGAINST `owner`, WHICH IS ALSO THE FIX FOR AURAS. `owner` is
      // whoever CARRIES this source — the item holder for an item passive, and
      // the ALLY STANDING IN THE RADIUS for a hook projected by an `auras`
      // block (auraSystem attaches the payload to the recipient's own
      // `sources`). So one field spells both 「近戰專用」 and 「周圍的近戰友軍」.
      //
      // ORDER IS LOAD-BEARING: this runs BEFORE the internal-cooldown gate and
      // BEFORE the proc roll, so a BLOCKED clause costs its carrier nothing —
      // no ICD burned, no `world.rng` draw consumed. Gating after the roll would
      // make a melee-only proc silently eat the rng stream on every ranged
      // champion's attack, which is both a wasted proc and a determinism trap
      // for anyone reasoning about the seed. `scale` is a pure function of world
      // state, so every replica takes the identical branch.
      //
      // Absent `requires` → scale 1 → both lines below are exact no-ops, which
      // is why no pre-existing hook changes behaviour.
      const scale = requirementScale(world, owner, hook.requires);
      if (scale === 0) continue;

      // Internal cooldown.
      //
      // `combatEnv.itemCooldown` (#189) scales this and ONLY this, and only for
      // an ITEM source: owner asked for 道具冷卻 to be tunable independently of
      // the ability `cooldown` factor, which multiplies ability cast cooldowns
      // in abilities/abilitySystem.ts and has never touched an item.
      //
      // The kind check is what keeps the knob honest — champion passives,
      // augments, auras and timed buffs all reach this same line, and scaling
      // their ICDs from a factor labelled 道具冷卻 in the console would be a
      // number that does not do what it says. Shipped at 1.0, so every existing
      // hook keeps its exact pre-#189 cadence.
      //
      // `internalCooldownScope` (批 1, 決策點 1-4) 只換**記在哪一格**,不換
      // 上面任何一句:省略 = `"source"` = `hookLastFired[hi]`,也就是這個欄位
      // 出現之前每一份文件走的那一格,所以既有節奏一個 tick 都沒動。
      const perSlot = hook.internalCooldownScope === "perAbilitySlot";
      const slotKey = abilitySlot ?? ICD_NO_SLOT_KEY;
      if (hook.internalCooldown) {
        const factor = src.kind === "item" ? world.combatEnv.itemCooldown : 1;
        const icdTicks = Math.round((hook.internalCooldown * factor) / world.dt);
        const last = perSlot
          ? (src.hookLastFiredBySlot?.[hi]?.get(slotKey) ?? NEVER_FIRED)
          : src.hookLastFired[hi]!;
        if (world.tick - last < icdTicks) continue;
      }
      // proc chance (WC3 Hbh1/Ocr1/War1 …) — seeded rng, so a replay of the
      // same seed rolls identically. A failed roll leaves the ICD clock alone.
      //
      // ⚠️ `chanceFrom`(朗基努斯之槍「(總敏捷)% 機率」)佔的是**同一個抽籤位置**,
      // 而且照樣只抽一次:動的是**門檻**,不是抽的次數或時機。所以每一份既有
      // 文件的亂數流一個位元都沒動 —— 這正是 `sim/content/condition.ts`
      // DECISION 1 要保住的性質。兩個欄位互斥(schema 在載入時擋),所以
      // 「相乘還是取代」這個沒有正確答案的問題不會出現。
      const procChance = hookProcChance(world, owner, hook);
      if (procChance !== undefined && !world.rng.chance(procChance)) continue;

      // 觸發條件 (owner 2026-07-30 「on-attack by condition」). See
      // sim/content/condition.ts — the whole model, both determinism decisions
      // and the human-readable renderer live there.
      //
      // ORDER, AND WHY IT IS HERE AND NOT ANYWHERE ELSE:
      //
      //   · AFTER the `requires` class gate and AFTER the internal-cooldown
      //     gate, because both of those are rng-FREE and a condition tree is
      //     not. A melee-only clause on a ranged champion, or a clause still on
      //     cooldown, must cost that carrier nothing — no draw, no stream
      //     movement — for the same reason `requires` is gated before the proc
      //     roll: otherwise every ranged champion's every swing silently
      //     advances the seed on a proc that can never fire.
      //   · AFTER the legacy `chance` roll, so the WC3 proc column keeps its
      //     exact pre-existing draw position and every ported passive's stream
      //     is byte-identical to before this field existed. A condition tree
      //     draws AFTER it, never before.
      //   · BEFORE `hookLastFired`, so a condition that does not hold does NOT
      //     burn the internal cooldown — the same WC3 semantics a failed proc
      //     roll already has ("a failed proc does not consume the cooldown").
      //
      // `target` is passed through as the condition's 敵人 subject: absent on an
      // entity-less event, where every `subject:"target"` leaf reads FALSE by
      // design (condition.ts DECISION 2).
      if (!evaluateCondition(world, hook.condition, { self: owner, ...(target !== undefined ? { target } : {}) })) {
        continue;
      }
      // 記帳。`"source"` 那一格**永遠**寫,連 `perAbilitySlot` 也寫 —— 這樣
      // 一條 hook 從 per-slot 改回 source(後台切一格)不會拿到一份空的歷史,
      // 而且 `hookLastFired` 仍是「這條 hook 最後一次發動」的單一真相
      // (診斷面板、未來的 UI 都讀它)。
      src.hookLastFired[hi] = world.tick;
      if (perSlot) {
        if (!src.hookLastFiredBySlot) src.hookLastFiredBySlot = new Array(src.hooks.length);
        let m = src.hookLastFiredBySlot[hi];
        if (!m) {
          m = new Map<string, number>();
          src.hookLastFiredBySlot[hi] = m;
        }
        m.set(slotKey, world.tick);
      }

      const resolveAgainst =
        hook.target === "allies"
          ? alliedChampions(world, owner)
          : hook.target === "self" || target === undefined
            ? [owner]
            : [target];
      runEffects(scaleEffects(hook.effects, scale), {
        world,
        caster: owner,
        rank: 1,
        targets: resolveAgainst,
        origin: `hook:${src.id}`,
        // 觸發這一次的那一發封包,原封不動往下傳。`damage.incomingPct` 讀它,
        // 而且它同時帶著 `reflectDepth` —— 反彈鏈的終止性就掛在這個欄位上。
        ...(incoming !== undefined ? { incoming } : {}),
        rng: world.rng,
      });
    }
  }
}
