/**
 * `grantAttribute` — PERMANENTLY add 力/敏/智 to the unit, with a repeat gate
 * and a hard ceiling.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CARD THIS EXISTS FOR, AND WHY NOTHING ELSE COULD EXPRESS IT
 *
 * 蒼月潮 07-00 獸化心靈, `war3map.j:14163`+`:14226` (the JASS, not the tooltip):
 *
 *     ModuloInteger(udg_killUnit[player], 8) == 0            ← every 8th kill
 *     GetHeroStatBJ(bj_HEROSTAT_AGI, killer, false) < 120    ← HIDDEN cap
 *     GetUnitTypeId(GetKillingUnitBJ()) == 'Hpb1'            ← the hero itself
 *       → ModifyHeroStat(bj_HEROSTAT_AGI, killer, ADD, 1)
 *
 * ⚠️ THE GATE IS ON THE HERO'S **UNIT** RAWCODE, NOT ON AN ABILITY RAWCODE.
 * `'Hpb1'` is 蒼月潮 himself. A previous pass looked for the passive's ability
 * code, found nothing, and concluded the innate was dead — the same class of
 * miss the project memory calls 天生技 JASS 查法. The trigger is a global
 * kill-counter trigger that special-cases one hero.
 *
 * Three things had to be true at once and none of them existed:
 *   · GRANT AN ATTRIBUTE. `applyBuff` writes `StatModifier`s, and an attribute
 *     is NOT a stat: 1 AGI feeds armour additively and attack speed
 *     MULTIPLICATIVELY off the champion's own base (stats/attributes.ts).
 *     Faking it as `{as: +0.02}` would be right for one champion's weapon and
 *     wrong for everyone else's — and it would not show in the shop's 三圍 panel.
 *   · EVERY Nth TIME. `HookDef.internalCooldown` is a CLOCK ("at most once per
 *     N seconds"); 「每 8 個」 is a COUNT. A 8-kill wave inside one second pays
 *     once under an ICD and eight times under none. Neither is the ability.
 *   · A CEILING ON THE RESULT, not on the number of grants. 「敏捷 < 120」 reads
 *     the LIVE attribute, so innate growth from levelling counts toward it too.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `everyNth` LIVES HERE AND NOT ON `HookDef`
 *
 * 「每 N 次觸發一次」 is generic enough that `HookDef` is arguably its home. It is
 * NOT put there for one honest reason: `effects/hooks.ts` and
 * `content/schema/effect.ts`'s `zHookDef` are being edited by the 條件系統 lane
 * in parallel, and a counter needs a storage slot next to `hookLastFired` —
 * i.e. an edit right through the middle of their hunk. Scoped to this effect it
 * is additive-only. If the field earns a second user it should be promoted to
 * `HookDef` and this one deleted; that is a refactor, not a re-design, because
 * the semantics ("count the times the effect was REACHED, pay on the Nth") are
 * identical.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE COUNTER IS COUNTED **BEFORE** THE CEILING IS CHECKED — like the JASS
 *
 * `udg_killUnit` is incremented unconditionally and only THEN tested, so a kill
 * made at 120 AGI still advances the tally. This module does the same: the
 * progress counter ticks on every application, and `maxAttribute` only refuses
 * the PAYOUT. Today the two orders are indistinguishable (the attribute never
 * falls, so past the cap nothing is ever paid again) — it is written the
 * faithful way anyway, because the moment anything in GGD can lower an
 * attribute the two orders diverge and the difference is silent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SECOND CARD: 勇者小呆 08-00 龍紋記憶 —— 「被暈眩時，力/敏/智暫時 ×2，持續 3 秒」
 *
 * Two more fields, and both are decisions rather than plumbing:
 *
 * · `mode` — 「加一個定值」 vs 「加現有的百分之幾」. 獸化心靈 wants the first
 *   (+1 AGI), 龍紋記憶 wants the second (×2 = +100 % of what you have). They
 *   cannot be the same number: +100 % of a level-1 hero and of a level-9 hero
 *   differ by the whole growth curve, and writing 龍紋記憶 as a flat +25 would
 *   be a buff that is enormous early and irrelevant late — a different ability
 *   wearing the same name.
 * · `durationSec` — ABSENT = permanent (the WC3 `ModifyHeroStat` semantic that
 *   獸化心靈 actually has). Present = it comes back off at an ABSOLUTE tick.
 *
 * ⚠️ A TIMED GRANT STILL WRITES `attrBonus`, and that is the point. The
 * alternative — a parallel "temporary attribute" store — would have to be
 * threaded through `championStatBase` and every one of its readers (the sim,
 * the shop preview, the champ-select table, the wire projection). One of them
 * would have been missed, and the missed one would be a panel that says 30 敏
 * while the body fights at 60. Writing the same accumulator the shop writes
 * makes every surface correct by construction; the cost is a teardown pass,
 * which is {@link attrGrantExpirySystem} and is the only thing that can undo it.
 *
 * REFRESH, NOT STACK, per `<origin>|<attr>`: a champion chain-stunned by three
 * enemies must not end up at ×8. The active grant is REMOVED and re-applied,
 * so the payload is always exactly one doubling and the clock restarts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STORAGE, PURITY, DETERMINISM
 *
 * Progress lives on `ChampionComp.attrGrantProgress`, keyed by
 * `<origin>|<attr>`, created lazily — so no spawn site changes, nothing is
 * added to any wire schema, and `world.destroy` frees it with the champion.
 * Keying by ORIGIN means two different abilities that both grant AGI keep
 * separate tallies, which is the only reading that does not make one passive
 * steal another's progress.
 *
 * No rng, no clock, no Map iteration, no `**`. The payout itself is a plain
 * `+=` on `ChampionComp.attrBonus`, the SAME accumulator the 能力屬性強化 shop
 * writes — so it flows to the client through the existing `SeatState.attrBonus`
 * projection (`economy/statPath.ts::attrBonusArray`) and shows up in the panel
 * without one line of new wire code. That is deliberate: failure shape ② is
 * exactly 「算出來了但從沒送到客戶端」, and reusing the shipped channel makes it
 * unreachable rather than merely tested-for.
 */
import type { EntityId } from "../../ids";
import type { EffectKindSpec } from "./effectKind";
import {
  ATTR_KEYS,
  championAttribute,
  zeroAttrBonus,
  type AttrKey,
} from "../stats/attributes";
import { liveAttribute } from "../stats/attrSources";
import { Champions } from "../content/registry";
import type { ModifierSource } from "../stats/modifiers";

/** Recompute-triggering write: the attribute term is folded by `recomputeStats`. */
function markDirty(world: import("../SimWorld").SimWorld, id: EntityId): void {
  const sc = world.stats.get(id);
  if (sc) sc.dirty = true;
}

/**
 * Reverse every timed 三圍 grant whose ABSOLUTE expiry tick has arrived.
 *
 * Slot 1b′ in `SimWorld.step`, immediately after `buffExpirySystem` — the same
 * job on the neighbouring accumulator, so the two cannot drift into different
 * ideas of when "3 seconds" ended. Absolute ticks, never a countdown
 * (sim/purity.test.ts), and the champion map is walked in SORTED id order.
 *
 * A champion with no timed grant (everybody except 小呆 mid-awakening) costs one
 * `undefined` check.
 */
export function attrGrantExpirySystem(world: import("../SimWorld").SimWorld): void {
  const ids: EntityId[] = [];
  for (const id of world.champion.keys()) ids.push(id);
  ids.sort((a, b) => a - b);
  for (const id of ids) {
    const champ = world.champion.get(id);
    const timed = champ?.attrGrantTimed;
    if (!champ || !timed || timed.length === 0) continue;
    let changed = false;
    for (let i = timed.length - 1; i >= 0; i--) {
      const g = timed[i]!;
      if (g.expiresAtTick > world.tick) continue;
      champ.attrBonus[g.attr] -= g.amount;
      timed.splice(i, 1);
      changed = true;
      world.emit("attrGrantEnd", { id, attr: g.attr, amount: g.amount, origin: g.origin });
    }
    if (changed) markDirty(world, id);
  }
}

/** Drop an ACTIVE timed grant for `<origin>|<attr>` (the refresh half). */
function revokeTimed(
  world: import("../SimWorld").SimWorld,
  id: EntityId,
  champ: import("../components").ChampionComp,
  origin: string,
  attr: AttrKey,
): void {
  const timed = champ.attrGrantTimed;
  if (!timed) return;
  for (let i = timed.length - 1; i >= 0; i--) {
    const g = timed[i]!;
    if (g.origin !== origin || g.attr !== attr) continue;
    champ.attrBonus[attr] -= g.amount;
    timed.splice(i, 1);
    markDirty(world, id);
  }
}

/**
 * THE `ModifierSource` THAT FIRED THIS HOOK, recovered from `ctx.origin`.
 *
 * `effects/hooks.ts` sets `origin: \`hook:${src.id}\`` — that string IS the
 * back-reference, and it is the only one there is: `EffectContext` carries the
 * caster and the origin label, never the source object. So `store: "source"`
 * costs no new plumbing through the runner, and any carrier of hooks (item
 * passive, aura-projected hook, augment, timed buff) works identically.
 *
 * Returns undefined for an ability's own effect list (`origin: "ability:…"`), a
 * bare test origin, or a source that has since been detached mid-tick — every
 * one of which means 「沒有一個來源可以記帳」, and the caller REFUSES the payout
 * rather than quietly rerouting it into the permanent accumulator.
 */
const HOOK_ORIGIN_PREFIX = "hook:";
function firingSource(
  world: import("../SimWorld").SimWorld,
  holder: EntityId,
  origin: string,
): ModifierSource | undefined {
  if (!origin.startsWith(HOOK_ORIGIN_PREFIX)) return undefined;
  const sourceId = origin.slice(HOOK_ORIGIN_PREFIX.length);
  return world.stats.get(holder)?.sources.find((s) => s.id === sourceId);
}

export const grantAttributeEffect: EffectKindSpec<"grantAttribute"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const amount = e.amount;
    if (!(amount > 0)) return;
    const attr: AttrKey = e.attr;
    // Belt-and-braces on a value that arrives from a JSON document: an unknown
    // attribute key would otherwise write a fourth property onto AttrBonus that
    // `championStatBase` never reads — the silent no-op this file exists to
    // prevent elsewhere.
    if (!ATTR_KEYS.includes(attr)) return;
    const everyNth = e.everyNth === undefined ? 1 : Math.max(1, Math.round(e.everyNth));

    for (const id of ctx.targets) {
      const champ = world.champion.get(id);
      // Attributes are a CHAMPION model. A mob has no ChampionComp by design
      // (components.ts MobComp), so it cannot carry 三圍 and this is a no-op on
      // one rather than a crash.
      if (!champ) continue;

      // ── the repeat gate ────────────────────────────────────────────────────
      if (everyNth > 1) {
        const key = `${ctx.origin}|${attr}`;
        const progress = champ.attrGrantProgress ?? (champ.attrGrantProgress = {});
        const n = (progress[key] ?? 0) + 1;
        // Wrap rather than grow forever: the tally is only ever read modulo
        // `everyNth`, and an unbounded integer in long sessions is a number
        // that eventually stops being exact.
        progress[key] = n % everyNth;
        if (n % everyNth !== 0) continue;
      }

      // ── the ceiling (checked AFTER the tally — see the header) ─────────────
      if (e.maxAttribute !== undefined) {
        // WHICH 三圍 it measures is a FIELD (`maxAttributeBasis`), defaulting to
        // `"base"` — see `EffectDef.maxAttributeBasis` for the JASS that decides
        // it. `"base"` is innate + growth + 三選一 + previous payouts, i.e.
        // exactly what 獸化心靈's `GetHeroStatBJ(1,…,false)` reads, and it means
        // a weapon that grants 敏捷 cannot retire this innate early.
        const live = liveAttribute(world, id, attr, e.maxAttributeBasis ?? "base");
        if (live !== null && live >= e.maxAttribute) continue;
      }

      // REFRESH before measuring: a re-trigger must not read its OWN previous
      // doubling as the base (that is how ×2 becomes ×4 becomes ×8 under a
      // chain-stun). Removing the active grant first makes 「現有的」 mean the
      // champion's real attribute every time.
      if (e.durationSec !== undefined) revokeTimed(world, id, champ, ctx.origin, attr);

      // HOW MUCH. `pctOfCurrent` reads the champion's BASE 三圍 (innate +
      // growth + everything bought/earned this match) — NOT the equipment
      // total, and that asymmetry with the ceiling above is deliberate rather
      // than an oversight:
      //
      //   · the ceiling ASKS A QUESTION about the hero and stops there;
      //   · this WRITES `champ.attrBonus`, which is the base accumulator.
      //     Doubling the equipment total would deposit a slice of a REMOVABLE
      //     source into a permanent one, so 龍紋記憶 fired while holding
      //     四魂之玉 and then selling it would leave the player with more base
      //     三圍 than twice his base — a laundering path from item to base that
      //     `attrGrantExpirySystem` cannot undo for a PERMANENT grant.
      //
      // It is also the WC3 reading: `ModifyHeroStat` moves the base stat, and
      // 小呆's own trigger reads the base stat to decide by how much.
      let granted = amount;
      if (e.mode === "pctOfCurrent") {
        const def = Champions.tryGet(champ.championId);
        const live =
          def === undefined
            ? champ.attrBonus[attr]
            : championAttribute(def, attr, champ.level, champ.attrBonus);
        granted = live * amount;
      }
      if (!(granted > 0)) continue;

      // ── store: "source" —— 甘豆腐之袍's 「疊層」 ───────────────────────────
      // Bank into the FIRING SOURCE's own accumulator instead of the champion's
      // permanent one, so an unequip takes the stacks with it. Everything above
      // (everyNth, maxAttribute, mode) applies identically; only the destination
      // and the ceiling differ.
      if (e.store === "source") {
        // The accumulator lives on a source carried by the HOLDER, so paying it
        // out to anyone else would credit the holder for the ally's stack. A
        // 「疊層」 card is about the wearer; refuse rather than mis-attribute.
        if (id !== ctx.caster) continue;
        const src = firingSource(world, id, ctx.origin);
        if (src === undefined) continue; // no source to bank into — see firingSource
        const earned = src.attrEarned ?? (src.attrEarned = zeroAttrBonus());
        let pay = granted;
        if (e.maxSourceTotal !== undefined) {
          // CLAMP, never refuse: 「上限 160」 is a promise about the total, so a
          // 15-point stack authored against a 160 ceiling must land on 160, not
          // stop at 150. Zero headroom = nothing happens and no event fires.
          pay = Math.min(pay, e.maxSourceTotal - earned[attr]);
        }
        if (!(pay > 0)) continue;
        earned[attr] += pay;
        markDirty(world, id);
        world.emit("attrGrant", {
          id,
          attr,
          amount: pay,
          // 「總共」 for this SOURCE — what the tooltip means by 「已疊 N 層」.
          total: earned[attr],
          origin: ctx.origin,
        });
        continue;
      }

      champ.attrBonus[attr] += granted;
      if (e.durationSec !== undefined) {
        // ABSOLUTE tick, never a countdown. ⚠️ `Math.round(duration/dt)` with
        // dt = 1/30 means anything under 0.034 s rounds to 0 or 1 tick — both
        // blanks. The Zod floor is 0.067 s (two ticks) for exactly that reason.
        const expiresAtTick = world.tick + Math.round(e.durationSec / world.dt);
        const timed = champ.attrGrantTimed ?? (champ.attrGrantTimed = []);
        timed.push({ attr, amount: granted, expiresAtTick, origin: ctx.origin });
      }
      markDirty(world, id);
      world.emit("attrGrant", {
        id,
        attr,
        amount: granted,
        total: champ.attrBonus[attr],
        origin: ctx.origin,
        ...(e.durationSec !== undefined ? { durationSec: e.durationSec } : {}),
      });
    }
  },
};
