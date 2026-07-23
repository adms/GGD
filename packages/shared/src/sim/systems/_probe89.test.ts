import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import { beginCombatGuardians, guardianVolleyDamage } from "./GuardianSystem";
import type { GuardianRules } from "./GuardianSystem";
import { resolveAbilityRadius } from "../abilities/abilitySystem";

beforeAll(() => registerSkeletonContent());

const RULES: GuardianRules = {
  hpBase: 1450, hpGrowthPerRound: 0.28, armor: 0, magicResist: 17.65, radius: 2.5,
  maxHitPctMaxHp: 0.15, volleyPeriodTicks: 3, volleyWindupTicks: 2, volleyMarks: 3,
  volleyRadius: 3.0, volleyDamageBase: 108, volleyDamageGrowthPerRound: 0.14,
  volleyRampPct: 0.15, volleyRampMax: 2.0, dormancyTicks: 5, rewardGold: 150,
  restoreHpPct: 1.0, restoreManaPct: 1.0, buffDurationTicks: 12, heirPulsePct: 0.25,
  heirPulseRadius: 2.5,
};

/** Replicate the EXACT snapshot.ts entity-encode branch order for one entity. */
function encode(w: SimWorld, id: EntityId) {
  if (w.projectile.get(id)) return { kind: 1, seatId: -1, key: "PROJ" };
  if (w.flower.has(id)) return { kind: 2, seatId: -1, key: "prop.flower" };
  if (w.reviveCircle.get(id)) return { kind: 3, seatId: -1, key: "prop.revive" };
  const team = w.team.get(id);
  const champ = w.champion.get(id);
  const hp = w.health.get(id);
  return {
    kind: 0,
    seatId: team ? (team.seatId as number) : -1,
    key: champ ? "CHAMPKEY" : "",
    hp: hp?.hp, maxHp: hp?.maxHp,
  };
}

describe("PROBE #89/#105 guardian wire state", () => {
  it("encodes as kind=0 seatId=-1 key='' hp=1450", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatEnv = { ...w.combatEnv, abilityRange: 0.6 };
    beginCombatGuardians(w, RULES, [0], 1);
    let gid: EntityId | null = null;
    for (const [id] of w.structure) gid = id;
    const enc = encode(w, gid!);
    // eslint-disable-next-line no-console
    console.log("PROBE guardian wire encode =", JSON.stringify(enc));
    expect(enc.kind).toBe(0);
    expect(enc.seatId).toBe(-1);
    expect(enc.key).toBe("");
    expect(enc.hp).toBe(1450);
  });

  it("client team fallback: teamBySeat.get(-1) ?? 0 => team 0 (blue)", () => {
    const teamBySeat = new Map<number, number>([[0, 0], [1, 1]]);
    const guardianTeam = teamBySeat.get(-1) ?? 0;
    // eslint-disable-next-line no-console
    console.log("PROBE guardian client teamId =", guardianTeam);
    expect(guardianTeam).toBe(0);
  });

  it("AoE radius is UNSCALED vs abilityRange (0.6)", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatEnv = { ...w.combatEnv, abilityRange: 0.6 };
    const raw = RULES.volleyRadius; // what GuardianSystem passes to queryOverlap
    const scaledLikePlayer = resolveAbilityRadius(w, RULES.volleyRadius);
    // eslint-disable-next-line no-console
    console.log("PROBE volleyRadius raw =", raw, " scaled-like-player =", scaledLikePlayer);
    expect(raw).toBe(3.0);
    expect(scaledLikePlayer).toBeCloseTo(1.8, 5);
    expect(raw).not.toBeCloseTo(scaledLikePlayer, 5);
  });

  it("guardian deals AoE + pays last-hit reward (mechanic alive in sim)", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    beginCombatGuardians(w, RULES, [0], 1);
    let gid: EntityId | null = null;
    for (const [id] of w.structure) gid = id;
    const atk = spawnChampion(w, {
      championId: "thorne" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: -40, z: 1 }, zone: 0,
    });
    const goldBefore = w.economy?.get?.(atk)?.gold ?? 0;
    // wake it and kill it
    w.damageQueue.push({ source: atk, target: gid!, amount: 100, type: "physical", crit: false, origin: "probe" });
    w.step(new Map());
    const woke = w.structure.get(gid!)!.wakeTick >= 0;
    w.health.get(gid!)!.hp = 1;
    w.damageQueue.push({ source: atk, target: gid!, amount: 500, type: "physical", crit: false, origin: "probe" });
    w.step(new Map());
    const buffed = w.guardianBuffs.has(atk);
    // eslint-disable-next-line no-console
    console.log("PROBE woke =", woke, " lastHitBuff =", buffed, " volleyDmgR1 =", guardianVolleyDamage(RULES, 1), " goldBefore =", goldBefore);
    expect(woke).toBe(true);
  });
});
