/** TEMP measurement harness for P2 (delete before commit). */
import { describe, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { rankUpAbility } from "./abilities/abilitySystem";
import { hasStatus } from "./effects/effectCommon";
import { isBerserk } from "./berserk";
import { DEFAULT_AUTO_ENGAGE } from "./combatFeel";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const EVA = "godie-e00r" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

function arena(seed: number, otherX = 30): { w: SimWorld; eva: EntityId; other: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  w.combatFeel = {
    ...w.combatFeel,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...w.combatFeel.autoEngage, enabled: false },
  };
  const spawn = (seat: number, team: number, x: number): EntityId =>
    spawnChampion(w, { championId: EVA, seatId: asSeatId(seat), teamId: asTeamId(team), pos: { x, z: 0 }, zone: 0 });
  const eva = spawn(0, 0, 0);
  const other = spawn(1, 1, otherX);
  w.step(new Map());
  return { w, eva, other };
}

describe("P2 measure", () => {
  it("A · block rate by rank, and which damage types", () => {
    for (const wantRank of [1, 4]) {
      const { w, eva, other } = arena(20260824);
      w.abilities.get(eva)!.unspentPoints = 8;
      for (let r = 0; r < wantRank; r++) rankUpAbility(w, eva, "E");
      const abil = w.abilities.get(eva)!;
      console.log("  E rank now =", (abil as unknown as { ranks: Record<string, number> }).ranks?.E ?? "?");
      const hp = w.health.get(eva)!;
      hp.hp = hp.maxHp * 0.5;
      w.step(new Map());
      const regen = hp.hp - hp.maxHp * 0.5;
      for (const type of ["physical", "magic", "true"] as const) {
        const losses = new Map<string, number>();
        for (let i = 0; i < 1000; i++) {
          hp.hp = hp.maxHp;
          w.damageQueue.push({ source: other, target: eva, amount: 500, type, crit: false, origin: "ability:t" });
          w.step(new Map());
          const k = (hp.maxHp - hp.hp + regen).toFixed(2);
          losses.set(k, (losses.get(k) ?? 0) + 1);
        }
        console.log(`  rank${wantRank} ${type}:`, [...losses.entries()].sort());
      }
    }
  });

  it("B · lifesteal stat + real heal in berserk (59-00) and EX (59-001)", () => {
    for (const ex of [false, true]) {
      const { w, eva, other } = arena(59);
      if (ex) {
        w.abilities.get(eva)!.unspentPoints = 4;
        console.log("  EX rankUp:", rankUpAbility(w, eva, "EX"));
      }
      const before = w.stats.get(eva)!.final;
      console.log(`  ex=${ex} lifesteal BEFORE =`, before.lifesteal, " as=", before.as, " evasion=", before.evasion);
      const hp = w.health.get(eva)!;
      hp.hp = hp.maxHp * (ex ? 0.45 : 0.05);
      w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true", crit: false, origin: "ability:t" });
      w.step(new Map());
      console.log(`  ex=${ex} berserk? `, isBerserk(w, eva));
      const after = w.stats.get(eva)!.final;
      console.log(`  ex=${ex} lifesteal AFTER =`, after.lifesteal, " as=", after.as, " evasion=", after.evasion);
      // real heal: eva deals a basic-attack packet to `other`, see own hp move
      hp.hp = hp.maxHp * 0.5;
      const h0 = hp.hp;
      w.damageQueue.push({ source: eva, target: other, amount: 200, type: "physical", crit: false, origin: "basic" });
      w.step(new Map());
      console.log(`  ex=${ex} self hp delta on 200 basic dmg =`, hp.hp - h0);
    }
  });

  it("C · what berserk immunity actually removes", () => {
    const { w, eva, other } = arena(77);
    const hp = w.health.get(eva)!;
    hp.hp = hp.maxHp * 0.05;
    w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true", crit: false, origin: "ability:t" });
    w.step(new Map());
    console.log("  berserk?", isBerserk(w, eva));
    const ctx = { world: w, caster: other, rank: 1, targets: [eva], origin: "ability:t", rng: w.rng };
    // (1) CC status
    runEffects([{ kind: "applyStatus" as const, statusId: "paralysis" as StatusId, duration: 3, stun: true }], ctx);
    console.log("  CC paralysis stuck?", hasStatus(w, eva, "paralysis" as StatusId));
    // (2) labeled debuff status
    runEffects([{ kind: "applyStatus" as const, statusId: "curse" as StatusId, duration: 4, missChance: 0.33 }], ctx);
    for (let i = 0; i < 3; i++) w.step(new Map());
    console.log("  labeled status curse stuck?", hasStatus(w, eva, "curse" as StatusId));
    // (3) UNLABELED negative applyBuff (shape of 92-02 消化液 ms -50%, 61-00 破甲 armor -3 ...)
    const msBefore = w.stats.get(eva)!.final.ms;
    runEffects([{ kind: "applyBuff" as const, modifiers: [{ stat: "ms" as const, op: "pctMult" as const, value: -0.5 }], duration: 6 }], ctx);
    for (let i = 0; i < 6; i++) w.step(new Map());
    console.log("  ms before:", msBefore, " after 6 ticks of unlabeled -50% ms buff:", w.stats.get(eva)!.final.ms, " berserk still?", isBerserk(w, eva));
    // (4) labeled debuff applyBuff for contrast
    runEffects([{ kind: "applyBuff" as const, polarity: "debuff" as const, modifiers: [{ stat: "ad" as const, op: "pctMult" as const, value: -0.5 }], duration: 6 }], ctx);
    const adMid = w.stats.get(eva)!.final.ad;
    for (let i = 0; i < 6; i++) w.step(new Map());
    console.log("  ad after labeled debuff:", adMid, "→", w.stats.get(eva)!.final.ad);
  });

  it("D · devour: real seconds between meals + berserk threshold doubling", () => {
    // meal interval
    {
      const { w, eva, other } = arena(101, 4);
      const oh = w.health.get(other)!;
      const tickSec = 1 / 30;
      const eats: number[] = [];
      for (let t = 0; t < 30 * 12; t++) {
        if (oh.hp <= 0 || w.health.get(other) === undefined) { /* respawn victim */ }
        oh.hp = oh.maxHp * 0.02; // way under rank-1 3%
        const alive = oh.hp;
        w.step(new Map());
        if ((w.health.get(other)?.hp ?? 0) <= 0 && alive > 0) eats.push(t * tickSec);
        if (eats.length >= 4) break;
      }
      console.log("  devour meal times (s):", eats, " gaps:", eats.slice(1).map((x, i) => +(x - eats[i]!).toFixed(3)));
    }
    // threshold doubling: victim at 5% — rank1 normal 3% (no eat), berserk 6% (eat)
    for (const berserk of [false, true]) {
      const { w, eva, other } = arena(202, 4);
      if (berserk) {
        const hp = w.health.get(eva)!;
        hp.hp = hp.maxHp * 0.05;
        w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true", crit: false, origin: "ability:t" });
        w.step(new Map());
      }
      console.log("  berserk?", isBerserk(w, eva));
      const oh = w.health.get(other)!;
      let eaten = false;
      for (let t = 0; t < 30 * 5; t++) {
        oh.hp = oh.maxHp * 0.05;
        w.step(new Map());
        if ((w.health.get(other)?.hp ?? 0) <= 0) { eaten = true; break; }
      }
      console.log(`  victim@5% berserk=${berserk} eaten? ${eaten}`);
    }
  });
});
