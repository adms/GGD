#!/usr/bin/env tsx
/**
 * RUNTIME PROBE — THE COMBO LOOP, ACTUALLY FIRED.
 *
 * `probeRecoveryCombo.ts` proves the GATE: after a hit, `castAbility` returns
 * "ok" instead of "recovery". It does that by casting the follow-up and then
 * ROLLING IT BACK, so nothing about the follow-up's own flight is measured.
 *
 * That is not the owner's question. The owner's question is whether the combo
 * LOOP closes: does ability 2, started the instant the hit cancelled ability 1's
 * recovery, actually LAND on a victim who is still locked down? A gate that
 * opens onto a wind-up longer than the victim's hitstun is a combo system on
 * paper and a free escape in the match.
 *
 * So this probe fires ability 2 for real, in a real SimWorld, with two DIFFERENT
 * slots, and reports:
 *   • the HIT timeline and the WHIFF timeline side by side, tick by tick,
 *   • the victim's remaining hitstun on the tick ability 2's damage lands,
 *   • whether that damage landed INSIDE the lock (a true combo) or after it
 *     (the victim had frames to act).
 *
 *     npx tsx packages/shared/scripts/probeComboLoop.ts
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities, Champions } from "../src/sim/content/registry";
import { isPassiveOnly } from "../src/sim/abilities/abilityPassives";
import { connectRuleOf, DEFAULT_RECOVERY_SEC } from "../src/sim/abilities/abilityRecovery";
import { castAbility } from "../src/sim/abilities/abilitySystem";
import { SimWorld } from "../src/sim/SimWorld";
import { SKELETON_ARENA } from "../src/sim/world/ArenaDef";
import { spawnChampion } from "../src/sim/spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "../src/ids";
import type { IntentFrame } from "../src/sim/intents";
import type { AbilityDef } from "../src/sim/content/defs";

const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
registerAll(result.store);

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const DT = 1 / 30;

console.log(`contentVersion: ${result.manifest.contentVersion}`);
console.log(`champions ${Champions.ids().length}  abilities ${Abilities.all().length}`);

// ─────────────────────────────────────────────────────────────────────────────
// Pick a champion with TWO damaging, targeted abilities in different slots.
// Targeted (not ground) for slot 2 so the follow-up cannot itself whiff for
// geometric reasons — we are measuring the hitstun budget, not my aim.
// ─────────────────────────────────────────────────────────────────────────────
type Pick = { id: ChampionId; s1: "Q" | "W" | "E" | "R"; a1: AbilityDef; s2: "Q" | "W" | "E" | "R"; a2: AbilityDef };

function pick(): Pick | null {
  for (const c of Champions.all()) {
    const dmg = (s: "Q" | "W" | "E" | "R"): AbilityDef | null => {
      const a = Abilities.tryGet(c.abilities[s].id);
      return a && !isPassiveOnly(a) && connectRuleOf(a) === "damage" ? a : null;
    };
    // ABILITY 1 MUST BE `ground`. A `targeted` ability CANNOT whiff — castAbility
    // validates the target up front and the packet is delivered to that entity,
    // so the whiff half of the A/B would be unreachable and the probe would be
    // comparing a hit against a hit. (That is itself a finding: see the report —
    // 201 of the 329 damaging abilities are targeted and therefore never pay
    // recovery at all.) Ground stamps a circle at a POINT, so aiming it at empty
    // floor is a genuine miss.
    const s1 = (["Q", "W", "E", "R"] as const).find((s) => dmg(s)?.castType === "ground");
    if (!s1) continue;
    const s2 = (["Q", "W", "E", "R"] as const).find((s) => s !== s1 && dmg(s));
    if (!s2) continue;
    return { id: c.id as ChampionId, s1, a1: dmg(s1)!, s2, a2: dmg(s2)! };
  }
  return null;
}

const p = pick();
if (!p) {
  console.log("no champion with two damaging targeted abilities");
  process.exit(1);
}

const ct = (a: AbilityDef): number => Math.round((a.castTimeSec ?? 0) / DT);
const rec = (a: AbilityDef): number => Math.round((a.recoverySec ?? DEFAULT_RECOVERY_SEC) / DT);

console.log(`\nCHAMPION: ${Champions.get(p.id).name}  (${p.id})`);
console.log(
  `  ability 1 = ${p.s1}  ${p.a1.id} "${p.a1.name}"  startup ${p.a1.castTimeSec ?? 0}s=${ct(p.a1)}t  recovery ${p.a1.recoverySec ?? DEFAULT_RECOVERY_SEC}s=${rec(p.a1)}t`,
);
console.log(
  `  ability 2 = ${p.s2}  ${p.a2.id} "${p.a2.name}"  startup ${p.a2.castTimeSec ?? 0}s=${ct(p.a2)}t  recovery ${p.a2.recoverySec ?? DEFAULT_RECOVERY_SEC}s=${rec(p.a2)}t`,
);

// ─────────────────────────────────────────────────────────────────────────────
// THE RUN. Cast ability 1. Step. The moment ability 1 resolves, try ability 2
// EVERY tick until it is accepted, then let it FLY and watch where it lands.
//
// `enemyPresent=false` is the whiff: ability 1 is cast at a target that is then
// removed from reach, so no damage packet resolves against an enemy and the
// hit-cancel never fires. Ability 2 is still attempted every tick, so the delay
// we measure is exactly the recovery it had to sit through.
// ─────────────────────────────────────────────────────────────────────────────
type Row = {
  tick: number;
  phase: string;
  recoveryLeft: number;
  victimHitstun: number;
  casterHitstop: number;
  castLeft: number;
  note: string;
};

type Run = {
  rows: Row[];
  resolve1: number;
  a2Accepted: number;
  a2Landed: number;
  hitstunAtLand: number;
  damage1: boolean;
  damage2: boolean;
  digest: number;
};

function run(hit: boolean, seed = 7): Run {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const z = SKELETON_ARENA.zones[0]!;
  const caster = spawnChampion(world, {
    championId: p!.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: z.center.x, z: z.center.z + 14 },
    zone: 0,
  });
  const victim = spawnChampion(world, {
    championId: p!.id,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: z.center.x + 2, z: z.center.z + 14 },
    zone: 0,
  });
  world.step(NO_INTENTS);

  // Keep the victim alive so a long sequence cannot end early by killing them,
  // and keep the caster's cooldown/mana out of the way so RECOVERY is the only
  // thing that can ever refuse a cast.
  // Only Q is learned at spawn, so slot 2 would answer "not-learned" forever.
  const free = (): void => {
    const ab = world.abilities.get(caster)!;
    for (const s of [p!.s1, p!.s2]) {
      ab.slots[s].cooldownRemainingTicks = 0;
      if (ab.slots[s].rank <= 0) ab.slots[s].rank = 1;
    }
    const h = world.health.get(caster)!;
    h.mana = h.maxMana = 99999;
    const vh = world.health.get(victim)!;
    vh.hp = vh.maxHp;
  };
  free();

  const vpos = world.transform.get(victim)!.pos;
  // ABILITY 1 is ground: HIT aims at the victim's feet, WHIFF aims at empty
  // floor 30u away. Nothing else differs — same seed, same champion, same slot.
  const aim1 = hit
    ? ({ type: "point", point: { x: vpos.x, z: vpos.z } } as const)
    : ({ type: "point", point: { x: z.center.x - 30, z: z.center.z - 30 } } as const);
  // ABILITY 2 is aimed at the victim in both runs.
  const tgt2 =
    p!.a2.castType === "targeted"
      ? ({ type: "entity", entityId: victim } as const)
      : ({ type: "point", point: { x: vpos.x, z: vpos.z } } as const);

  const first = castAbility(world, caster, p!.s1, aim1);
  if (first !== "ok") throw new Error(`ability 1 refused: ${first}`);

  const rows: Row[] = [];
  let resolve1 = -1;
  let a2Accepted = -1;
  let a2Landed = -1;
  let hitstunAtLand = -1;
  let damage1 = false;
  let damage2 = false;

  for (let i = 0; i < 90; i++) {
    world.step(NO_INTENTS);
    free();

    const ab = world.abilities.get(caster)!;
    const dmg = world.events.filter((e) => e.type === "damage");
    for (const d of dmg) {
      const origin = String((d.data as { origin?: string }).origin ?? "");
      if (origin.includes(p!.a1.id)) damage1 = true;
      if (origin.includes(p!.a2.id)) {
        damage2 = true;
        if (a2Landed < 0) {
          a2Landed = world.tick;
          hitstunAtLand = world.hitstun.get(victim) ?? 0;
        }
      }
    }

    if (resolve1 < 0 && !ab.cast) resolve1 = world.tick;

    let note = "";
    let phase = ab.cast ? `cast:${ab.cast.slot}` : ab.recovery ? "recovery" : "free";

    // Once ability 1 has resolved, try ability 2 every tick until accepted.
    if (resolve1 >= 0 && a2Accepted < 0) {
      const r = castAbility(world, caster, p!.s2, tgt2);
      if (r === "ok") {
        a2Accepted = world.tick;
        note = `ability 2 ACCEPTED and now flying`;
        phase = `cast:${p!.s2}`;
      } else {
        note = `ability 2 refused: ${r}`;
      }
    }

    rows.push({
      tick: world.tick,
      phase,
      recoveryLeft: ab.recovery?.ticksLeft ?? 0,
      victimHitstun: world.hitstun.get(victim) ?? 0,
      // THE TERM THAT DECIDES THE COMBO. damage.ts:388-389 bumps hitstop on
      // BOTH source and target, and CastResolveSystem pauses the wind-up while
      // frozen — so the attacker's own hit freezes the attacker's follow-up.
      // The victim's hitstun, however, keeps counting down through the freeze.
      // Net: every tick of hitstop is a tick of combo budget the attacker loses.
      casterHitstop: world.hitstop.get(caster) ?? 0,
      castLeft: ab.cast?.ticksLeft ?? 0,
      note,
    });

    if (a2Landed >= 0) break;
  }
  return { rows, resolve1, a2Accepted, a2Landed, hitstunAtLand, damage1, damage2, digest: world.digest() };
}

const hitRun = run(true);
const whiffRun = run(false);

// ─────────────────────────────────────────────────────────── side-by-side print
console.log("\n" + "=".repeat(100));
console.log("TICK TIMELINES, SIDE BY SIDE — same champion, same abilities, same seed 7.");
console.log("The ONLY difference: whether ability 1's damage found a body.");
console.log("=".repeat(100));
console.log(
  `${"".padEnd(4)} | ${"HIT: ability 1 connects".padEnd(46)} | WHIFF: ability 1 finds nobody`,
);
console.log(
  `${"tick".padEnd(4)} | ${"phase".padEnd(10)}${"rec".padStart(4)}${"stun".padStart(5)}${"stop".padStart(5)}  ${"note".padEnd(20)} | ${"phase".padEnd(10)}${"rec".padStart(4)}${"stun".padStart(5)}${"stop".padStart(5)}  note`,
);
console.log("-".repeat(130));
const n = Math.max(hitRun.rows.length, whiffRun.rows.length);
for (let i = 0; i < n; i++) {
  const a = hitRun.rows[i];
  const b = whiffRun.rows[i];
  const fmt = (r: Row | undefined): string =>
    r
      ? `${r.phase.padEnd(10)}${String(r.recoveryLeft).padStart(4)}${String(r.victimHitstun).padStart(5)}${String(r.casterHitstop).padStart(5)}  ${r.note.padEnd(20)}`
      : " ".repeat(46);
  console.log(`${String(a?.tick ?? b?.tick ?? "").padEnd(4)} | ${fmt(a)} | ${fmt(b)}`);
}

const T = (t: number): string => `tick ${t} (${(t * DT).toFixed(3)}s)`;
console.log("\n" + "=".repeat(100));
console.log("VERDICT");
console.log("=".repeat(100));
for (const [label, r] of [
  ["HIT  ", hitRun],
  ["WHIFF", whiffRun],
] as const) {
  console.log(`\n${label}:`);
  console.log(`  ability 1 resolved at        ${T(r.resolve1)}   (damage landed: ${r.damage1})`);
  console.log(
    `  ability 2 accepted at        ${T(r.a2Accepted)}   = ${r.a2Accepted - r.resolve1} ticks after ability 1 resolved`,
  );
  console.log(`  ability 2 damage landed at   ${r.a2Landed >= 0 ? T(r.a2Landed) : "NEVER (within 90 ticks)"}`);
  if (r.a2Landed >= 0)
    console.log(`  victim hitstun remaining     ${r.hitstunAtLand}t at the moment ability 2 landed`);
}

const delay = whiffRun.a2Accepted - hitRun.a2Accepted;
console.log(
  `\nTHE HIT-CANCEL IS WORTH: ${delay} ticks = ${(delay * DT).toFixed(3)}s ` +
    `(whiff waits ${whiffRun.a2Accepted - whiffRun.resolve1}t of recovery; hit waits ${hitRun.a2Accepted - hitRun.resolve1}t)`,
);

const trueCombo = hitRun.hitstunAtLand > 0;
console.log(
  `\nDOES THE LOOP CLOSE? ability 2's startup is ${ct(p.a2)}t. ` +
    `The victim's hitstun from ability 1 was ${hitRun.rows.find((x) => x.victimHitstun > 0)?.victimHitstun ?? 0}t.`,
);
console.log(
  trueCombo
    ? `  TRUE COMBO: ability 2 landed with ${hitRun.hitstunAtLand}t of lock still on the victim — they could not act between the two hits.`
    : `  NOT A TRUE COMBO: the victim's hitstun had already expired when ability 2 landed. ` +
      `The hit-cancel bought TEMPO (${(delay * DT).toFixed(3)}s of it) but the victim had frames to act.`,
);

console.log(`\ndeterminism: hit digest ${hitRun.digest}, whiff digest ${whiffRun.digest} (must differ — different worlds)`);
const again = run(true);
console.log(
  `same-seed replay of the HIT run: ${again.digest} vs ${hitRun.digest} -> ${again.digest === hitRun.digest ? "IDENTICAL" : "DIVERGED"}`,
);
