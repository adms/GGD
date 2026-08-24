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
import { rankUpAbility, learnEx } from "./abilities/abilitySystem";
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
        console.log("  EX learn:", learnEx(w, eva));
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
    const msBase = w.stats.get(eva)!.final.ms;
    runEffects([{ kind: "applyBuff" as const, modifiers: [{ stat: "ms" as const, op: "pctMult" as const, value: -0.5 }], duration: 8 }], ctx);
    w.step(new Map());
    const msApplied = w.stats.get(eva)!.final.ms;
    for (let i = 0; i < 60; i++) w.step(new Map());
    console.log("  UNLABELED ms debuff: base", msBase, "→ applied", msApplied, "→ after 2s of berserk immunity", w.stats.get(eva)!.final.ms, " berserk still?", isBerserk(w, eva));
    // (4) labeled debuff applyBuff for contrast
    const adBase = w.stats.get(eva)!.final.ad;
    runEffects([{ kind: "applyBuff" as const, polarity: "debuff" as const, dispellable: true, modifiers: [{ stat: "ad" as const, op: "pctMult" as const, value: -0.5 }], duration: 8 }], ctx);
    w.step(new Map());
    const adApplied = w.stats.get(eva)!.final.ad;
    for (let i = 0; i < 60; i++) w.step(new Map());
    console.log("  LABELED  ad debuff: base", adBase, "→ applied", adApplied, "→ after 2s", w.stats.get(eva)!.final.ad, " berserk still?", isBerserk(w, eva));
  });

  it("D · devour: real meal interval + berserk threshold doubling", () => {
    // 8 fresh victims, each parked at 2% hp; count meals over 12s → interval.
    {
      const w = new SimWorld(SKELETON_ARENA, 909);
      w.combatActive = true;
      w.combatFeel = { ...w.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, ...w.combatFeel.autoEngage, enabled: false } };
      const eva = spawnChampion(w, { championId: EVA, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: 0, z: 0 }, zone: 0 });
      const vics: EntityId[] = [];
      for (let i = 0; i < 8; i++) {
        vics.push(spawnChampion(w, { championId: EVA, seatId: asSeatId(1 + i), teamId: asTeamId(1), pos: { x: 2 + i * 0.4, z: 3 }, zone: 0 }));
      }
      w.step(new Map());
      for (const v of vics) { const h = w.health.get(v)!; h.hp = h.maxHp * 0.02; }
      const deaths: number[] = [];
      const trace: string[] = [];
      const alive = new Set(vics);
      for (let t = 0; t < 30 * 12; t++) {
        for (const v of alive) { const h = w.health.get(v); if (h && h.hp > 0) h.hp = h.maxHp * 0.02; }
        w.step(new Map());
        for (const v of [...alive]) {
          const h = w.health.get(v);
          if (!h || h.hp <= 0) { alive.delete(v); deaths.push(+(w.tick / 30).toFixed(3)); }
        }
        const cd = w.status.get(eva)?.effects.filter((x) => x.statusId === ("devour-cooldown" as StatusId) && x.expiresAtTick > w.tick) ?? [];
        if (t < 90) trace.push(`t${t} tick${w.tick} deaths=${deaths.length} cd=${cd.length}${cd.length ? "(" + ((cd[0]!.expiresAtTick - w.tick) / 30).toFixed(2) + "s)" : ""}`);
      }
      console.log("  trace:", trace.filter((x, i) => i < 4 || !x.endsWith("cd=0") || trace[i - 1]!.includes("cd=1")).slice(0, 40).join(" | "));
      console.log("  meal times (s):", deaths, " gaps:", deaths.slice(1).map((x, i) => +(x - deaths[i]!).toFixed(3)));
      const q = Champions.get(EVA)!.abilities.Q;
      console.log("  Q card cooldown:", q.cooldown, " scan icd:", q.passive!.ranks[0]!.hooks!.map((h) => h.internalCooldown),
        " onDevour:", JSON.stringify(q.passive!.ranks[0]!.hooks![0]!.effects.map((e) => (e as unknown as { onDevour: unknown }).onDevour)));
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
      const oh = w.health.get(other)!;
      let eaten = false;
      for (let t = 0; t < 30 * 5; t++) {
        oh.hp = oh.maxHp * 0.05;
        w.step(new Map());
        if ((w.health.get(other)?.hp ?? 0) <= 0) { eaten = true; break; }
      }
      console.log(`  victim@5%HP  berserk=${berserk}  eaten? ${eaten}  (eva berserk=${isBerserk(w, eva)})`);
    }
  });

  it("E · berserk VFX actually reach the wire (smoke + beam trail)", () => {
    const { w, eva, other } = arena(3131);
    const hp = w.health.get(eva)!;
    hp.hp = hp.maxHp * 0.05;
    w.damageQueue.push({ source: other, target: eva, amount: 1, type: "true", crit: false, origin: "ability:t" });
    w.step(new Map());
    console.log("  berserk?", isBerserk(w, eva));
    const seen = new Map<string, number>();
    const noPos = new Map<string, number>();
    const kinds = new Map<string, number>();
    for (let t = 0; t < 30 * 7; t++) {
      w.step(new Map());
      for (const ev of w.events) {
        kinds.set(ev.type, (kinds.get(ev.type) ?? 0) + 1);
        if (ev.type !== "vfxSpawn") continue;
        const d = ev.data as { vfxId?: string; x?: number; z?: number };
        const id = String(d.vfxId);
        seen.set(id, (seen.get(id) ?? 0) + 1);
        if (d.x === undefined || d.z === undefined) noPos.set(id, (noPos.get(id) ?? 0) + 1);
      }
      // move the body so a trail would actually trail
      const tr = w.transform.get(eva)!;
      tr.x += 0.05;
    }
    console.log("  vfxSpawn by id over 7s of berserk:", [...seen.entries()]);
    console.log("  vfxSpawn MISSING x/z:", [...noPos.entries()]);
    console.log("  all event kinds:", [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8));
  });
});
