/**
 * `revive` —— 復活 as an AUTHORABLE EFFECT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CARD THIS EXISTS FOR
 *
 * 天生牙 godie-i031: 「[復活] 殺死任一個敵方英雄單位，將復活我方所有英雄」.
 *
 * Before this file, coming back from the dead existed in GGD in exactly ONE
 * shape: the 復活圈 (task #84 / #206) — a team-owned ground zone a living ally
 * channels in for 5 s. That is a SYSTEM, wired to deaths and to a per-round
 * charge; nothing could hand the same outcome to a piece of content.
 *
 * ⚠️ THIS IS NOT A SECOND WAY TO COME BACK FROM THE DEAD. The state contract —
 * where you stand, how much HP/mana you get, what is cleared, what survives —
 * lives in ONE function, `sim/revive.ts::reviveChampionAt`, which the circle's
 * own `ReviveSystem.completeRevive` now calls as well. This handler only decides
 * WHO, WHERE and WHETHER; the moment 「復活之後身上還有沒有中毒」 has two answers
 * in this codebase, one of them is a bug nobody will notice for months.
 *
 * WHAT IT INHERITS FROM THE CIRCLE, said explicitly (the brief asked):
 *   · POSITION — the circle stands you up at the CHANNELLER's feet; there is no
 *     channeller here, so the item stands you up AT YOUR OWN CORPSE
 *     (`transform.pos`, which a dead champion never leaves). It is the only
 *     reading that does not teleport a whole team across the arena on a kill,
 *     and it keeps everybody in their own zone by construction.
 *   · HP / MANA — `reviveChampionAt`'s fractions, and by DEFAULT they are the
 *     match's own `reviveCircles.reviveHpPctMax` / `reviveManaPctMax`
 *     (`config.arena-rules@1`, shipped 0.5 / 0.5). 「復活回多少」 is one operator
 *     concept and it already has one home in 戰鬥系統; an item that answered it
 *     differently would be a second number nobody knows exists. Overridable per
 *     effect — see {@link EffectDef} `revive.hpPct`.
 *   · THE FIRE-RING REFUSAL (#195) — UNCONDITIONALLY inherited, and it is not a
 *     preference: standing someone up inside a fully-closed ring is a griefing
 *     loop (they burn at 20 %/s with nowhere to stand), so both paths refuse.
 *   · THE ONCE-PER-ROUND CHARGE — NOT inherited by default. `world.reviveCharges`
 *     is the 復活圈's round budget; owner's card text puts no limit on 天生牙, so
 *     the shipped default is `teamCharge: "ignore"`. `"requireAndSpend"` makes
 *     the item share that budget, which is the once-per-round bound the brief
 *     asked to be offered — see the field.
 *   · THE SCOREBOARD — `recordRevive` credits the holder with `revivesPerformed`
 *     and the ally with `revivesReceived`, exactly like the circle. A death is
 *     still a death and a kill is still a kill (#25's rating must not be
 *     rewritten by a rescue).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO NEW EVENT — DELIBERATELY
 *
 * It emits `reviveComplete`, the event the circle already emits, which is
 * already in `FANNED_OUT_EVENT_TYPES` (apps/game-server/src/net/eventFanout.ts)
 * and already has consumers: `vfx/VfxSystem.ts` (the shimmer, reads x/z),
 * `audio/combatSfx.ts` + `combatSfxSpatial.ts` (復活完成). A brand-new event
 * would have been two more files and a silent drop if either was missed
 * (CLAUDE.md 失敗形態 ②) to say the identical thing. `id` carries the revived
 * entity rather than a circle entity — no consumer reads it (all three read
 * `ownerId` / `x` / `z`) — and `origin` names the item so a replay can tell the
 * two paths apart.
 *
 * PURITY (sim/purity.test.ts): no rng, no clock, no trig, no `**`. `ctx.targets`
 * arrives already sorted (`effects/hooks.ts::alliedChampions`).
 */
import type { EffectKindSpec } from "./effectKind";
import { recordRevive } from "../stats/matchStats";
import { reviveChampionAt } from "../revive";

/**
 * HP / mana fractions used when the effect names none AND the match has no
 * `reviveCircles` block armed (unit tests, a skeleton boot, an operator who
 * switched the circles off). Deliberately EQUAL to the shipped
 * `content/config/arena-rules.json` numbers, so the fallback and the live path
 * agree on every normal match and the constant is not a second balance opinion.
 * Guard: `reviveShipped.test.ts` (reads the SHIPPED arena-rules.json; mutation
 * verified 2026-08-25 — the two test files once named here never landed).
 */
export const REVIVE_EFFECT_FALLBACK_HP_PCT = 0.5;
export const REVIVE_EFFECT_FALLBACK_MANA_PCT = 0.5;

export const reviveEffect: EffectKindSpec<"revive"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const rules = world.reviveRules;
    const hpPct = e.hpPct ?? rules?.reviveHpPctMax ?? REVIVE_EFFECT_FALLBACK_HP_PCT;
    const manaPct = e.manaPct ?? rules?.reviveManaPctMax ?? REVIVE_EFFECT_FALLBACK_MANA_PCT;
    const side = e.side ?? "ally";
    const teamCharge = e.teamCharge ?? "ignore";
    const casterTeam = world.team.get(ctx.caster)?.teamId;

    // THE CHARGE GATE, resolved ONCE for the whole payload. 「復活我方所有英雄」 is
    // one act of resurrection, not three: charging per body would make the item
    // silently weaker the more of your team is down, which is backwards.
    if (teamCharge === "requireAndSpend") {
      if (casterTeam === undefined) return;
      if ((world.reviveCharges.get(casterTeam) ?? 0) <= 0) return;
    }

    let revived = 0;
    for (const id of ctx.targets) {
      // A revive is a CHAMPION model: `reviveChampionAt` would happily stand a
      // mob back up, and 「復活我方所有英雄」 does not mean the zombie wave.
      if (!world.champion.has(id)) continue;
      const t = world.transform.get(id);
      if (!t) continue;
      // 敵我 gate. Default "ally", because the footgun this closes is real and
      // silent: `revive` authored WITHOUT a `target: "allies"` hook scope on an
      // `onKill` resolves against THE CORPSE YOU JUST MADE, i.e. an item that
      // resurrects its own victims. See the field for when "any" is right.
      if (side === "ally" && world.team.get(id)?.teamId !== casterTeam) continue;

      const pos = reviveChampionAt(world, id, {
        pos: t.pos, // AT THE CORPSE — see the header
        zone: t.zone,
        hpPct,
        manaPct,
      });
      if (pos === null) continue; // already alive / ring closed / not a body

      revived++;
      recordRevive(world, ctx.caster, id);
      const team = world.team.get(id);
      world.emit("reviveComplete", {
        id,
        ownerId: id,
        seatId: team?.seatId ?? -1,
        channeller: ctx.caster,
        teamId: team?.teamId ?? -1,
        zone: t.zone,
        x: pos.x,
        z: pos.z,
        origin: ctx.origin,
      });
    }

    // Spend on SUCCESS only, mirroring the circle («a failed attempt never
    // burns the round's revive»). Nobody down = the charge is untouched.
    if (teamCharge === "requireAndSpend" && revived > 0 && casterTeam !== undefined) {
      const left = world.reviveCharges.get(casterTeam) ?? 0;
      world.reviveCharges.set(casterTeam, Math.max(0, left - 1));
    }
  },
};
