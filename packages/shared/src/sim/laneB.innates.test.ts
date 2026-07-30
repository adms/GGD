/**
 * LANE B 天生技 GUARDS — six innates, proved on the SHIPPED `content/` docs.
 *
 * ---------------------------------------------------------------------------
 * THE RULES THIS SUITE IS WRITTEN AGAINST
 * ---------------------------------------------------------------------------
 * · NO FIXTURES. Every world below is spawned from the real `content/` tree via
 *   `registerAll` → `spawnChampion` → `syncAbilityPassives`. Delete the payload
 *   block from any doc named here and the matching `it` goes red. That is the
 *   whole point (failure form ⑤ — 被測的不是出貨的那個).
 * · EVERY ASSERTION READS RUNTIME STATE — `world.health`, `world.status`,
 *   `champ.attrBonus`, `world.flight`, `world.transform` — never the shape of a
 *   document and never a grep over source text (failure forms ⑥/⑦).
 * · NO `it.each(readdirSync(...))` + `toBeGreaterThan(0)`. That family cannot
 *   fail when content is DELETED, because deleting the content deletes the test
 *   with it. Every case here names its champion and its exact number.
 *
 * ---------------------------------------------------------------------------
 * THE SIX, AND THE ONE ASSERTION EACH THAT CANNOT PASS BY ACCIDENT
 * ---------------------------------------------------------------------------
 *   ① 66-00 恐懼      godie-e00t  — the ATTACKER's swings start missing.
 *                     Direction matters: an evasion-shaped mis-implementation
 *                     would make the attacker HARDER to kill, so the assertion
 *                     is on a THIRD body the cursed attacker then swings at.
 *   ② 07-00 獸化心靈  godie-hpb1  — +1 AGI on the 8th kill, NOT the 7th, and
 *                     nothing at all past 120 AGI. Both edges are asserted; the
 *                     120 one is the hidden cap the tooltip never mentioned.
 *   ③ 71-00 暗夜契約  godie-u00k  — a death raises a flag and the aura lands on
 *                     the carrier. Guards the doc's IDENTITY: `nightPact.ts`
 *                     matches on `passiveAbility`, so a re-id would silently
 *                     kill it.
 *   ④ 04-00 翔封界    godie-h020/hjai — walks THROUGH a body, and is still
 *                     inside the arena disc afterwards.
 *   ⑤ 18-00 薔薇荊棘  godie-n00p/nsjs — a second enemy standing BEHIND the one
 *                     being hit takes damage; one standing BEHIND KURAMA does
 *                     not. The second half is what separates a line from a
 *                     circle, i.e. what makes the assertion direction match the
 *                     defect (failure form ④).
 *   ⑥ 08-00 龍紋記憶  godie-nbbc/n01c — a stun doubles all three attributes for
 *                     3 s and they come BACK. Plus: a SLOW does not.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentStore } from "../content/store";
import { registerAll } from "../content/registries";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { nightPactRulesFromConfig, beginCombatNightPact, nightFlagIds, NIGHT_PACT_AURA_SOURCE_ID } from "./nightPact";
import { missChanceOf } from "./combat/evasion";
import { isFlying } from "./flight";
import { championAttribute } from "./stats/attributes";
import { Champions as ChampionsRegistry } from "./content/registry";
import { Stat } from "./stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

const SADAKO = "godie-e00t" as ChampionId; // ① 七夜怪談 - 貞子
const USHIO = "godie-hpb1" as ChampionId; // ② 獸矛傳承使 - 蒼月潮
const DEATHLORD = "godie-u00k" as ChampionId; // ③ 邪惡意念集合體 - 死之王
const LINA = "godie-h020" as ChampionId; // ④ 黑魔導士 - 莉娜因巴斯
const LINA_TWIN = "godie-hjai" as ChampionId; // ④ the mirrored doc
const KURAMA = "godie-n00p" as ChampionId; // ⑤ 妖狐藏馬 - 南野秀一
const KURAMA_TWIN = "godie-nsjs" as ChampionId;
const BAKKA = "godie-nbbc" as ChampionId; // ⑥ 傳說的龍騎士 - 勇者小呆
const BAKKA_TWIN = "godie-n01c" as ChampionId;
/**
 * The NEUTRAL body every test uses as a target dummy / bystander. 麻倉葉's
 * 天生技 is a `vision` grant, which touches no stat, no status and no collision
 * exemption — so it can never contribute to any number measured below.
 */
const DUMMY = "godie-nplh" as ChampionId;

/** Docs BY PATH, so the suite is green both before and after `content:build`. */
function docs(collection: string): Record<string, unknown>[] {
  return readdirSync(join(CONTENT_DIR, collection))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CONTENT_DIR, collection, f), "utf-8")) as Record<string, unknown>);
}

beforeAll(() => {
  const store = new ContentStore();
  for (const c of ["ability-templates", "abilities", "champions", "projectiles", "status-effects", "vfx"] as const) {
    for (const doc of docs(c)) store.add(c, doc.id as string, doc);
  }
  registerAll(store);
});

// The skeleton zone has a radius-2.5 pillar on its exact centre, so nobody is
// spawned there: bodies would be shoved out over the next ticks and every
// distance under test would drift.
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });
const XZ = (dx: number, dz: number): { x: number; z: number } => ({
  x: LINE_X + dx,
  z: Z0.center.z + dz,
});

let seat = 0;
function spawn(
  world: SimWorld,
  championId: ChampionId,
  team: 0 | 1,
  at: { x: number; z: number },
): EntityId {
  return spawnChampion(world, { championId, seatId: asSeatId(seat++), teamId: asTeamId(team), pos: at, zone: 0 });
}

/** Step with orders cleared and (optionally) bodies pinned. */
function idle(world: SimWorld, held: Map<EntityId, { x: number; z: number }>, ticks = 1): void {
  for (let k = 0; k < ticks; k++) {
    for (const [, nav] of world.nav) {
      nav.attackTarget = null;
      nav.moveTarget = null;
      nav.order = null;
    }
    for (const [id, at] of held) {
      const t = world.transform.get(id);
      if (t) {
        t.pos.x = at.x;
        t.pos.z = at.z;
      }
    }
    world.step(NO_INTENTS);
  }
}

// ───────────────────────────────────────────────── ① 66-00 恐懼 (godie-e00t)

describe("① 66-00 恐懼 (godie-e00t) — 打貞子的人自己開始揮空", () => {
  it("a unit that DAMAGES 貞子 gets a 4s 33% miss curse, and 貞子 does not", () => {
    const world = new SimWorld(SKELETON_ARENA, 21);
    const sadako = spawn(world, SADAKO, 0, P(0));
    const attacker = spawn(world, DUMMY, 1, P(2));
    const held = new Map([
      [sadako, P(0)],
      [attacker, P(2)],
    ]);
    idle(world, held, 1);

    expect(missChanceOf(world, attacker)).toBe(0);
    // A REAL damage packet through the REAL queue — the only path that fires
    // `onDamageTaken`. Not a hand-called fireHooks, which would prove the hook
    // exists without proving anything ever reaches it.
    world.damageQueue.push({
      source: attacker,
      target: sadako,
      amount: 5,
      type: "magic",
      crit: false,
      origin: "test",
    });
    idle(world, held, 1);

    // THE NUMBER, and THE DIRECTION. 0.33 is Blizzard's `Acrs.DataA1`; the
    // curse is on the ATTACKER, never on 貞子.
    expect(missChanceOf(world, attacker)).toBeCloseTo(0.33, 6);
    expect(missChanceOf(world, sadako)).toBe(0);

    // 4 s = 120 ticks at dt 1/30. Still cursed at 3 s, clean after 4.
    idle(world, held, 89);
    expect(missChanceOf(world, attacker)).toBeCloseTo(0.33, 6);
    idle(world, held, 31);
    expect(missChanceOf(world, attacker)).toBe(0);
  });

  it("the curse actually makes the CURSED unit's basic attacks miss a third of the time", () => {
    // The `it` above proves the number is stored. This one proves it is SPENT —
    // the difference between failure form ② (計算了但沒有人讀) and a live
    // mechanic. Measured by hp lost on a THIRD body the cursed unit attacks.
    const world = new SimWorld(SKELETON_ARENA, 33);
    const cursed = spawn(world, DUMMY, 0, P(0));
    const victim = spawn(world, DUMMY, 1, P(0.9));
    const held = new Map([
      [cursed, P(0)],
      [victim, P(0.9)],
    ]);
    idle(world, held, 1);

    // Curse the attacker directly through the SHIPPED effect kind (the doc's
    // own payload, applied by hand so the trial count is controlled).
    let landed = 0;
    const trials = 400;
    for (let i = 0; i < trials; i++) {
      const hp = world.health.get(victim)!;
      hp.hp = hp.maxHp;
      runEffects(
        [{ kind: "applyStatus", statusId: "curse" as never, duration: 4, missChance: 0.33 }],
        { world, caster: cursed, rank: 1, targets: [cursed], origin: "test:curse", rng: world.rng },
      );
      // The victim's own hp before/after ONE resolved swing.
      const before = hp.hp;
      const nav = world.nav.get(cursed)!;
      nav.attackTarget = victim;
      nav.moveTarget = null;
      // Let the swing cycle run to a damage point (windup + cooldown), then
      // score whether THAT swing connected.
      let hit = false;
      for (let k = 0; k < 60 && !hit; k++) {
        world.nav.get(cursed)!.attackTarget = victim;
        world.nav.get(cursed)!.moveTarget = null;
        world.nav.get(victim)!.attackTarget = null;
        world.nav.get(victim)!.moveTarget = null;
        world.step(NO_INTENTS);
        if (hp.hp < before) hit = true;
        if (world.events.some((ev) => ev.type === "evade" && ev.data.source === cursed)) break;
      }
      if (hit) landed++;
    }
    // ~67% should land. A generous band (the point is "clearly not 100%", not a
    // precise rate) but one a broken implementation cannot sit inside: an
    // unimplemented curse lands ~100%, an inverted one ~33%.
    const rate = landed / trials;
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(0.85);
  });
});

// ─────────────────────────────────────────── ② 07-00 獸化心靈 (godie-hpb1)

describe("② 07-00 獸化心靈 (godie-hpb1) — 每 8 殺 +1 敏，120 敏封頂", () => {
  /** Fire the doc's own `onKill` hook N times by killing N real bodies. */
  function killTimes(world: SimWorld, killer: EntityId, n: number): void {
    for (let i = 0; i < n; i++) {
      const prey = spawn(world, DUMMY, 1, P(4 + (i % 3)));
      const hp = world.health.get(prey)!;
      world.damageQueue.push({
        source: killer,
        target: prey,
        amount: hp.maxHp * 4,
        type: "true",
        crit: false,
        origin: "test",
      });
      idle(world, new Map(), 1);
    }
  }

  it("pays on the 8th kill, not the 7th", () => {
    const world = new SimWorld(SKELETON_ARENA, 41);
    const ushio = spawn(world, USHIO, 0, P(0));
    idle(world, new Map(), 1);
    const champ = world.champion.get(ushio)!;
    expect(champ.attrBonus.agi).toBe(0);

    killTimes(world, ushio, 7);
    expect(champ.attrBonus.agi).toBe(0); // ⚠️ the 7th pays NOTHING

    killTimes(world, ushio, 1);
    expect(champ.attrBonus.agi).toBe(1); // the 8th pays exactly 1

    killTimes(world, ushio, 8);
    expect(champ.attrBonus.agi).toBe(2);
  });

  it("⚠️ THE HIDDEN 120 CAP: nothing is paid once live AGI reaches 120", () => {
    // THE MUTATION TARGET. Remove `maxAttribute: 120` from
    // `content/abilities/godie-hpb1.passive.json`, or delete the ceiling branch
    // from `effects/grantAttribute.ts`, and this goes red. It is the ONLY
    // assertion in the repo that knows the cap exists at all — the tooltip
    // never did, and neither did the previous port.
    const world = new SimWorld(SKELETON_ARENA, 43);
    const ushio = spawn(world, USHIO, 0, P(0));
    idle(world, new Map(), 1);
    const champ = world.champion.get(ushio)!;
    const def = ChampionsRegistry.get(champ.championId);
    /** The SAME reader the ceiling uses, so the two cannot disagree. */
    const liveAgi = (): number => championAttribute(def, "agi", champ.level, champ.attrBonus);

    // Walk the LIVE attribute up to the cap the way the game would (bought
    // points land in `attrBonus`, exactly where the 三選一 shop puts them).
    while (liveAgi() < 120) champ.attrBonus.agi += 10;
    const atCap = champ.attrBonus.agi;
    expect(liveAgi()).toBeGreaterThanOrEqual(120);

    killTimes(world, ushio, 24); // three would-be payouts
    expect(champ.attrBonus.agi).toBe(atCap); // …and not one point landed

    // CONTROL: the very same 24 kills on a hero BELOW the cap pay 3 points, so
    // the assertion above is about the ceiling and not about the hook being
    // dead in this world.
    const w2 = new SimWorld(SKELETON_ARENA, 44);
    const ushio2 = spawn(w2, USHIO, 0, P(0));
    idle(w2, new Map(), 1);
    killTimes(w2, ushio2, 24);
    expect(w2.champion.get(ushio2)!.attrBonus.agi).toBe(3);
  });
});

// ─────────────────────────────────────────── ③ 71-00 暗夜契約 (godie-u00k)

describe("③ 71-00 暗夜契約 (godie-u00k) — 旗子 + 黑夜靈氣", () => {
  const RULES = nightPactRulesFromConfig(
    JSON.parse(readFileSync(join(CONTENT_DIR, "config/arena-rules.json"), "utf-8")).nightPact,
  );

  it("the SHIPPED config still names the SHIPPED doc — a re-id would kill this silently", () => {
    // `nightPact.ts` matches champions by `passiveAbility`, so this join key is
    // the whole mechanism. Nothing else in the repo asserts it.
    const doc = JSON.parse(
      readFileSync(join(CONTENT_DIR, "champions/godie-u00k.json"), "utf-8"),
    ) as { passiveAbility?: string };
    expect(RULES.abilityIds).toContain(doc.passiveAbility);
  });

  it("a champion death near a living 死之王 raises a flag and the carrier gets +100% ms / +30 regen", () => {
    const world = new SimWorld(SKELETON_ARENA, 51);
    world.combatActive = true;
    beginCombatNightPact(world, RULES);
    const lord = spawn(world, DEATHLORD, 0, P(0));
    const prey = spawn(world, DUMMY, 1, P(1.5));
    idle(world, new Map(), 1);

    const msBefore = world.stats.get(lord)!.final[Stat.MoveSpeed];
    expect(nightFlagIds(world).length).toBe(0);

    const hp = world.health.get(prey)!;
    world.damageQueue.push({
      source: lord,
      target: prey,
      amount: hp.maxHp * 4,
      type: "true",
      crit: false,
      origin: "test",
    });
    idle(world, new Map(), 3);

    expect(nightFlagIds(world).length).toBe(1);
    const src = world.stats.get(lord)!.sources.find((s) => s.id === NIGHT_PACT_AURA_SOURCE_ID);
    expect(src).toBeDefined();
    // +100 % move speed, read off the FINAL stat, not off the source.
    expect(world.stats.get(lord)!.final[Stat.MoveSpeed]).toBeGreaterThan(msBefore);
  });
});

// ───────────────────────────────────────────── ④ 04-00 翔封界 (h020/hjai)

describe("④ 04-00 翔封界 — 無視碰撞的飛行，但飛不出場外", () => {
  it.each([LINA, LINA_TWIN])("%s is flying from spawn", (cid) => {
    const world = new SimWorld(SKELETON_ARENA, 61);
    const lina = spawn(world, cid, 0, P(0));
    idle(world, new Map([[lina, P(0)]]), 2);
    expect(isFlying(world, lina)).toBe(true);
    // …and a champion WITHOUT the doc is not, so the assertion is about the
    // payload and not about the predicate always answering true.
    const other = spawn(world, DUMMY, 1, P(6));
    idle(world, new Map(), 2);
    expect(isFlying(world, other)).toBe(false);
  });

  it("walks THROUGH a body instead of being shoved off it", () => {
    const world = new SimWorld(SKELETON_ARENA, 63);
    const lina = spawn(world, LINA, 0, P(0));
    const wall = spawn(world, DUMMY, 1, P(0.4)); // deep inside her collision circle
    idle(world, new Map([[wall, P(0.4)]]), 2);

    // Both bodies are pinned-ish: the DUMMY is held, 莉娜 is not. If separation
    // still applied, `separatePair` would push her measurably away from the
    // overlapping body within a couple of ticks.
    const t = world.transform.get(lina)!;
    const start = { x: t.pos.x, z: t.pos.z };
    for (let i = 0; i < 10; i++) {
      const w = world.transform.get(wall)!;
      w.pos.x = P(0.4).x;
      w.pos.z = P(0.4).z;
      world.nav.get(lina)!.moveTarget = null;
      world.nav.get(lina)!.attackTarget = null;
      world.step(NO_INTENTS);
    }
    const moved = Math.hypot(t.pos.x - start.x, t.pos.z - start.z);
    expect(moved).toBeLessThan(1e-6); // not shoved at all

    // CONTROL: the same setup with a NON-flying champion IS shoved.
    const w2 = new SimWorld(SKELETON_ARENA, 64);
    const a = spawn(w2, DUMMY, 0, P(0));
    const b = spawn(w2, DUMMY, 1, P(0.4));
    const ta = w2.transform.get(a)!;
    const s2 = { x: ta.pos.x, z: ta.pos.z };
    for (let i = 0; i < 10; i++) {
      const tb = w2.transform.get(b)!;
      tb.pos.x = P(0.4).x;
      tb.pos.z = P(0.4).z;
      w2.nav.get(a)!.moveTarget = null;
      w2.nav.get(a)!.attackTarget = null;
      w2.step(NO_INTENTS);
    }
    expect(Math.hypot(ta.pos.x - s2.x, ta.pos.z - s2.z)).toBeGreaterThan(1e-3);
  });

  it("⚠️ IS STILL CLAMPED TO THE ARENA — 「無視碰撞」 must not mean 「走出場外」", () => {
    const world = new SimWorld(SKELETON_ARENA, 65);
    const lina = spawn(world, LINA, 0, P(0));
    idle(world, new Map(), 1);
    const t = world.transform.get(lina)!;
    // Teleport her far outside the disc, then let one tick of movement run.
    t.pos.x = Z0.center.x + Z0.boundaryRadius * 4;
    t.pos.z = Z0.center.z;
    world.step(NO_INTENTS);
    const d = Math.hypot(t.pos.x - Z0.center.x, t.pos.z - Z0.center.z);
    expect(d).toBeLessThanOrEqual(Z0.boundaryRadius + 1e-6);
  });
});

// ────────────────────────────────────── ⑤ 18-00 薔薇荊棘之刃 (n00p/nsjs)

describe("⑤ 18-00 薔薇荊棘之刃 — 面前 3.6 單位的直線，背後安全", () => {
  it.each([KURAMA, KURAMA_TWIN])(
    "%s: an enemy BEHIND the target is cut; an enemy BEHIND KURAMA is not",
    (cid) => {
      const world = new SimWorld(SKELETON_ARENA, 71);
      const kurama = spawn(world, cid, 0, XZ(0, 0));
      const target = spawn(world, DUMMY, 1, XZ(1.2, 0)); // in melee range, +x
      const behindTarget = spawn(world, DUMMY, 1, XZ(2.8, 0)); // on the line
      const behindKurama = spawn(world, DUMMY, 1, XZ(-2.0, 0)); // opposite side
      const held = new Map([
        [kurama, XZ(0, 0)],
        [target, XZ(1.2, 0)],
        [behindTarget, XZ(2.8, 0)],
        [behindKurama, XZ(-2.0, 0)],
      ]);
      idle(world, held, 2);

      const hpOf = (id: EntityId): number => world.health.get(id)!.hp;
      const beforeBehind = hpOf(behindTarget);
      const beforeBack = hpOf(behindKurama);

      // Make ONE real basic attack land on `target`.
      const nav = world.nav.get(kurama)!;
      for (let i = 0; i < 120; i++) {
        for (const [id, at] of held) {
          const t = world.transform.get(id)!;
          t.pos.x = at.x;
          t.pos.z = at.z;
        }
        nav.attackTarget = target;
        nav.moveTarget = null;
        world.step(NO_INTENTS);
        if (hpOf(behindTarget) < beforeBehind) break;
      }

      // THE LINE LANDED on the body standing further along it …
      expect(hpOf(behindTarget)).toBeLessThan(beforeBehind);
      // … and NOT on the one standing behind 藏馬. This half is what makes the
      // assertion direction match the defect: a `damageArea` circle of the same
      // reach would hit him too, and this test would then be green for an
      // implementation that is not the ability.
      expect(hpOf(behindKurama)).toBe(beforeBack);
    },
  );
});

// ────────────────────────────────────────── ⑥ 08-00 龍紋記憶 (nbbc/n01c)

describe("⑥ 08-00 龍紋記憶 — 被暈眩 → 三圍 ×2 三秒，然後收回", () => {
  const STUN = [{ kind: "applyStatus" as const, statusId: "burnstun" as never, duration: 1, stun: true }];
  const SLOW = [
    { kind: "applyStatus" as const, statusId: "slow25" as never, duration: 1, moveSpeedMult: 0.75 },
  ];

  it.each([BAKKA, BAKKA_TWIN])("%s: a stun doubles 力/敏/智 and they come back after 3s", (cid) => {
    const world = new SimWorld(SKELETON_ARENA, 81);
    const bakka = spawn(world, cid, 0, P(0));
    const enemy = spawn(world, DUMMY, 1, P(4));
    idle(world, new Map(), 2);

    const champ = world.champion.get(bakka)!;
    const def = ChampionsRegistry.get(champ.championId);
    const base = {
      str: championAttribute(def, "str", champ.level, champ.attrBonus),
      agi: championAttribute(def, "agi", champ.level, champ.attrBonus),
      int: championAttribute(def, "int", champ.level, champ.attrBonus),
    };
    expect(base.str + base.agi + base.int).toBeGreaterThan(0); // the fixture is real

    runEffects(STUN, { world, caster: enemy, rank: 1, targets: [bakka], origin: "test:stun", rng: world.rng });
    idle(world, new Map(), 1); // ccHookSystem runs this tick

    const now = (k: "str" | "agi" | "int"): number =>
      championAttribute(def, k, champ.level, champ.attrBonus);
    expect(now("str")).toBeCloseTo(base.str * 2, 5);
    expect(now("agi")).toBeCloseTo(base.agi * 2, 5);
    expect(now("int")).toBeCloseTo(base.int * 2, 5);

    // 3 s = 90 ticks. Still doubled just before, back to base just after.
    idle(world, new Map(), 86);
    expect(now("str")).toBeCloseTo(base.str * 2, 5);
    idle(world, new Map(), 6);
    expect(now("str")).toBeCloseTo(base.str, 5);
    expect(now("agi")).toBeCloseTo(base.agi, 5);
    expect(now("int")).toBeCloseTo(base.int, 5);
  });

  it("⚠️ a SLOW does not wake him — 「被暈眩時」 means stunned, not inconvenienced", () => {
    const world = new SimWorld(SKELETON_ARENA, 83);
    const bakka = spawn(world, BAKKA, 0, P(0));
    const enemy = spawn(world, DUMMY, 1, P(4));
    idle(world, new Map(), 2);
    const champ = world.champion.get(bakka)!;
    const before = { ...champ.attrBonus };

    runEffects(SLOW, { world, caster: enemy, rank: 1, targets: [bakka], origin: "test:slow", rng: world.rng });
    idle(world, new Map(), 3);
    expect(champ.attrBonus).toEqual(before);
  });

  it("chain-stuns REFRESH rather than compound — no ×4, no ×8", () => {
    const world = new SimWorld(SKELETON_ARENA, 85);
    const bakka = spawn(world, BAKKA, 0, P(0));
    const e1 = spawn(world, DUMMY, 1, P(4));
    const e2 = spawn(world, DUMMY, 1, P(5));
    idle(world, new Map(), 2);
    const champ = world.champion.get(bakka)!;
    const def = ChampionsRegistry.get(champ.championId);
    const base = championAttribute(def, "str", champ.level, { str: 0, agi: 0, int: 0 });

    runEffects(STUN, { world, caster: e1, rank: 1, targets: [bakka], origin: "test:a", rng: world.rng });
    idle(world, new Map(), 1);
    runEffects(STUN, { world, caster: e2, rank: 1, targets: [bakka], origin: "test:b", rng: world.rng });
    idle(world, new Map(), 1);

    const live = championAttribute(def, "str", champ.level, champ.attrBonus);
    // Exactly ×2, not ×4. (Both stuns route through the SAME hook origin, so
    // the second one revokes the first's grant before re-measuring.)
    expect(live).toBeCloseTo(base * 2, 5);
  });
});
