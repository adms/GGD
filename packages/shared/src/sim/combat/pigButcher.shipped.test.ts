/**
 * [變形] 殺豬刀 godie-i06g 「專殺畜牲，7%機率將敵人變成食材，無法動作」 —— THE
 * SHIPPED DOC, driven through the shipped equip path onto a real MOB.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 *
 * Every primitive this line uses already existed (`onBasicAttack` + `chance` +
 * `victim` + `applyStatus{stun}`), so there is no new mechanism to prove — which
 * is exactly the situation 失敗形態 ⑤ lives in: 「the mechanism works」 and 「the
 * item does it」 are different claims, and a doc that authored `stun: false`, or
 * pointed `victim` at the wrong class, or forgot the `duration`, would leave
 * every mechanism test green while the card pays nothing.
 *
 * So: read the real JSON, equip through `economy/itemSource.ts` (the ONE builder
 * every equip path uses), swing at a real body, and read `world.status` back.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE CLAIMS
 *
 *   ① THE DOC SAYS IT — the hook's five authored decisions are pinned per field
 *      (event / victim class / chance / ICD / stun+duration), so a silent
 *      rebalance is a red test. The two numbers owner never gave (duration, ICD)
 *      are pinned LOUDLY, because they are the ones awaiting his call.
 *   ② 「無法動作」 REALLY MEANS IT — the status that lands is read back through
 *      the SAME predicate the sim's five action gates use (`e.stun === true` and
 *      not yet expired). Asserting 「a status with id X exists」 would pass on a
 *      cosmetic marker that stops nothing (失敗形態 ⑦: 掃屬性代替掃行為).
 *   ③ 「專殺畜牲」 IS FLAVOUR, NOT A FILTER — owner ruled 2026-08-01 「也殺敵方
 *      英雄單位」, so `victim: "any"` and a CHAMPION target IS stunned. This test
 *      used to assert the exact opposite (`victim: "mob"`, champions immune) and
 *      it CORRECTLY went red when the ruling landed — the flip is recorded here
 *      rather than quietly deleted, because 「殺豬刀 對英雄有沒有用」 is a question
 *      someone will ask again and the answer must be findable.
 *      ⚠️ 「畜牲」 could not have been a real filter anyway: this sim's whole
 *      vocabulary is champions / mobs / summons / structures, and the w3x source
 *      has no transform ability on this item at all, so there was never a
 *      taxonomy to bind it to. Owner resolved it by widening the target, which
 *      also fixed the side effect that rounds 1–2 (no mob spawns) made the line
 *      dead weight in every match.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { attachSource, recomputeStats } from "../stats/statPipeline";
import { itemModifierSource } from "../economy/itemSource";
import { zItemHookDef } from "../../content/schema/item";
import type { ItemDef } from "../content/defs";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "../../ids";
import { MONSTER_TEAM } from "../mobs";

beforeAll(() => registerSkeletonContent());

const HERE = dirname(fileURLToPath(import.meta.url));
const ITEMS = join(HERE, "../../../../../content/items");
const PIG_KNIFE = "godie-i06g";
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14;

const doc: ItemDef & { description: string } = JSON.parse(
  readFileSync(join(ITEMS, `${PIG_KNIFE}.json`), "utf8"),
);

/** THE predicate the sim's five action gates use — not a status-id lookup. */
function cannotAct(world: SimWorld, id: EntityId): boolean {
  const st = world.status.get(id);
  return st?.effects.some((e) => e.stun === true && e.expiresAtTick > world.tick) ?? false;
}

describe("① 出貨的文件真的寫了那五個決定", () => {
  it("owner's prose still carries the line these assertions are about", () => {
    expect(doc.description).toContain("[變形] 專殺畜牲，7%機率將敵人變成食材，無法動作");
  });

  it("the hook is an on-hit, ALL-target, 7 % proc that applies a STUN", () => {
    const hooks = doc.passive ?? [];
    expect(hooks.length, "殺豬刀 has no passive — 「[變形]」 pays nothing").toBe(1);
    const h = hooks[0]!;
    expect(() => zItemHookDef.parse(h), "the shipped bytes do not parse").not.toThrow();

    expect(h.on, "「7%機率將敵人變成食材」 fires on a basic attack").toBe("onBasicAttack");
    // owner 2026-08-01: 「專殺畜牲 => 也殺敵方英雄單位」. So 「畜牲」 is flavour and
    // the hook takes everyone. Pinned at "any" rather than left unasserted,
    // because narrowing it back to "mob" would silently make this line dead for
    // the first two rounds of every match (no mobs spawn until round 3, task
    // #215) — which is precisely the side effect owner's ruling removed.
    expect(h.victim, "owner ruled 「也殺敵方英雄單位」 — must not narrow back").toBe("any");
    expect(h.chance, "owner's 7%").toBeCloseTo(0.07, 6);

    const eff = (h.effects ?? [])[0];
    expect(eff?.kind, "「無法動作」 is an applyStatus, not a damage").toBe("applyStatus");
    expect((eff as { stun?: boolean }).stun, "「無法動作」 = stun, not root/slow").toBe(true);
  });

  it("⚠️ the two numbers OWNER NEVER GAVE are pinned so a change is deliberate", () => {
    const h = (doc.passive ?? [])[0]!;
    const eff = (h.effects ?? [])[0] as { duration?: number };
    // owner's text gives NO duration and NO internal cooldown. Both ship
    // conservative and both are ordinary authorable fields, so the moment owner
    // supplies a number this test is the one line to change — which is the
    // point of pinning them rather than leaving them un-asserted.
    expect(eff.duration, "食材化 duration — awaiting owner's number").toBeCloseTo(1, 6);
    expect(h.internalCooldown, "proc ICD — the attack-speed-cap fuse, awaiting owner").toBeCloseTo(3, 6);
  });
});

// ---------------------------------------------------------------------------
// behaviour
// ---------------------------------------------------------------------------

interface Rig {
  world: SimWorld;
  attacker: EntityId;
  victim: EntityId;
}

/** A melee wielder of the shipped knife + one target body. */
function rig(victimIsMob: boolean): Rig {
  const world = new SimWorld(SKELETON_ARENA, 5150);
  const attacker = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z0.center.x, z: LANE_Z },
    zone: 0,
  });
  // THE SHIPPED BUILDER, not a hand-written source — that forward is what
  // `economy/itemSource.ts` exists to make unmissable.
  const champ = world.champion.get(attacker)!;
  champ.items[0] = PIG_KNIFE as ItemId;
  attachSource(world, attacker, itemModifierSource(world, attacker, PIG_KNIFE as ItemId, 0, doc));
  recomputeStats(world, attacker);

  // The victim is a CHAMPION body either way; what changes is whether it also
  // carries a `MobComp`, because that is precisely what `HookDef.victim: "mob"`
  // reads (`world.mob`). Building it this way isolates the filter from every
  // other difference a real zombie would bring (hp, speed, ai).
  const victim = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x + 1.0, z: LANE_Z },
    zone: 0,
  });
  if (victimIsMob) {
    world.mob.set(victim, {
      zone: 0,
      team: MONSTER_TEAM,
      kind: "normal", // 一般殭屍 — the ordinary roguelite mob (sim/components.ts MobKind)
      target: -1,
      attackCdTicks: 0,
      spawnTick: 0,
    });
  }
  return { world, attacker, victim };
}

/** Swing for `ticks`, keeping the target alive and in place. Returns stun ticks. */
function swingAndCountStunned(r: Rig, ticks: number): number {
  const { world, attacker, victim } = r;
  const vpos = { ...world.transform.get(victim)!.pos };
  let stunnedTicks = 0;
  for (let i = 0; i < ticks; i++) {
    const hp = world.health.get(victim)!;
    hp.hp = hp.maxHp; // a training dummy: the proc, not the kill, is the subject
    world.transform.get(victim)!.pos = { ...vpos };
    world.nav.get(attacker)!.attackTarget = victim;
    world.step(new Map());
    if (cannotAct(world, victim)) stunnedTicks++;
  }
  return stunnedTicks;
}

describe("② 「無法動作」真的動不了(讀的是 sim 自己的判準,不是狀態 id)", () => {
  it("a mob eventually gets stunned — and the stun is the real action gate", () => {
    const r = rig(true);
    const stunned = swingAndCountStunned(r, 3000);
    expect(stunned, "3000 ticks of swinging at a mob and it never lost a turn").toBeGreaterThan(0);
  });
});

describe("③ 「專殺畜牲」是風味不是過濾器 (owner 2026-08-01「也殺敵方英雄單位」)", () => {
  // ⚠️ THE POLARITY OF THIS TEST IS THE POINT. It used to assert `.toBe(0)` —
  // 「a CHAMPION target is never stunned」 — and owner's ruling inverted it. Both
  // sides are now pinned: a champion IS stunned here, and a mob still is in ②.
  // Asserting only the champion side would let a `victim: "champion"` typo pass,
  // which would silently disarm the knife against the mob waves it was written
  // for; asserting only the mob side is what let the old reading ship.
  it("a CHAMPION target DOES get stunned — the knife works in PvP now", () => {
    const r = rig(false); // champion body with no MobComp
    const stunned = swingAndCountStunned(r, 3000);
    expect(
      stunned,
      "3000 ticks swinging at a hero and it never landed — victim narrowed back to mob?",
    ).toBeGreaterThan(0);
  });
});
