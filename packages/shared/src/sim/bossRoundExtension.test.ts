/**
 * #L1 — 殭屍王在場 → 回合延長 3 分鐘,火圈也延後.
 *
 * owner 2026-07-30:
 *   「殭屍王出現**回合結束時間延長 3 分鐘**(**火圈時間也延後**),
 *     除非全死不然不會提前結束,避免打到一半結果回合結束」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THESE GUARDS READ, AND WHY IT IS NOT THE CONFIG FIELD
 * ─────────────────────────────────────────────────────────────────────────────
 * Failure mode ⑦ (掃屬性代替掃行為) is the live hazard here: `boss.extendCombatSec
 * === 180` is a property of a JSON file and stays true even if `summonMobBoss`
 * never touches the clock. So every assertion below reads a value the SIM ACTS
 * ON:
 *
 *   · the ring, through `currentFireRingRadius` / `isBurnedByFireRing` — the
 *     exact functions the snapshot encoder and the BURNING flag call, i.e. the
 *     number that reaches the player, plus REAL HP off a REAL champion after
 *     REAL `world.step()`s;
 *   · the deadline, through `isCombatTimeUp` / `combatDeadlineTick` — the
 *     predicate a host force-ends combat on, never `match.combatMaxSec`.
 *
 * Failure mode ⑤ (被測的不是出貨的那個) is handled by driving the SHIPPED path:
 * rules come from `zConfigMatchDoc.parse(content/config/config.match.json)` and
 * the king is summoned by the SHIPPED `summonMobBoss`, never by poking
 * `world.fireRingRules` by hand.
 *
 * MUTATION RECORD (each line deleted → which tests go red) is in the task
 * write-up; the two load-bearing lines are `rules.startTicks += delay` and
 * `rules.combatMaxTicks += extend` in `extendRoundForBoss`, and they are covered
 * by DIFFERENT tests on purpose — the owner asked for both halves, and a guard
 * that only notices when both are deleted would let either one rot alone.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  beginCombatFireRing,
  bossRoundExtensionTicks,
  combatDeadlineTick,
  currentFireRingRadius,
  endCombatFireRing,
  extendRoundForBoss,
  fireRingIgnitionTick,
  fireRingRulesFromConfig,
  isBurnedByFireRing,
  isCombatTimeUp,
  type FireRingConfigLike,
} from "./fireRing";
import { mobRulesFromConfig, summonMobBoss, type MobRules } from "./mobs";
import { zConfigMatchDoc, type MobWavesConfig } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
const ZONE_R = 24;

/** The SHIPPED match doc, parsed through the real schema. */
const shippedMatch = (): ReturnType<typeof zConfigMatchDoc.parse>["match"] =>
  zConfigMatchDoc.parse(
    JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
    ),
  ).match;

/**
 * 出貨設定算出來的回合截止 tick。
 *
 * ⚠️ 這裡刻意**不寫死**。`combatMaxSec` 是後台可調的回合長度，2026-08-01 從 100
 * 改成 180，而這個檔裡三處寫死的 `3000` 讓兩條測試從那一刻起就紅著跟過兩個版本
 * —— 而且紅訊息說的是假話（看起來像「王的延長壞了」，實際上只是回合變長）。
 * 這個檔要驗的是**差值**（召喚王 → 截止時間往後推 5,400 tick），基準線是變數。
 */
const SHIPPED_COMBAT_DEADLINE_TICK = Math.round(shippedMatch().combatMaxSec / DT);

/** The SHIPPED arena rules' `mobWaves` block. */
const shippedMobWaves = (): MobWavesConfig =>
  (
    JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/arena-rules.json"), "utf8"),
    ) as { mobWaves: MobWavesConfig }
  ).mobWaves;

/**
 * A live-combat world armed with the SHIPPED ring AND the SHIPPED backstop —
 * i.e. exactly what the match host produces on combat entry once it passes
 * `combatMaxSec` through (see the task write-up's one-line MatchController
 * change). One champion parked at the zone centre so the burn has a victim.
 */
function shippedWorld(): { w: SimWorld; hero: EntityId; mobRules: MobRules } {
  const m = shippedMatch();
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(1),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  beginCombatFireRing(w, fireRingRulesFromConfig(m.fireRing!, DT, m.combatMaxSec));
  const mobRules = mobRulesFromConfig(shippedMobWaves(), DT, 6);
  w.mobRules = mobRules;
  w.mobTicks = 0;
  return { w, hero, mobRules };
}

/** Advance the sim `n` ticks. */
const step = (w: SimWorld, n: number): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

// ─────────────────────────────────────────────────────────── the two deadlines
describe("殭屍王被召喚 → 兩個截止時間都真的延後 (boss-round-extension)", () => {
  it("delays the ring's ACTUAL ignition by 180 s — read off the radius, not the config", () => {
    cover("boss-round-extension");
    const { w, mobRules } = shippedWorld();

    // Sanity on the un-extended schedule: ignition at 1800, and 300 ticks later
    // the ring has visibly closed in. If this is not true the rest is vacuous.
    expect(fireRingIgnitionTick(w)).toBe(1800);
    step(w, 2100); // 70 s of combat: 10 s into the shrink
    const shrunk = currentFireRingRadius(w);
    expect(shrunk).toBeLessThan(ZONE_R);
    // 二段制: 第一段 runs 24 → `stage1Radius` (4) over 20 s, so 10 s in the
    // radius is 24 + (4 − 24) × 0.5 = 14. (It was 12.25 while the single stage
    // ran 24 → 0.5 — the number moved because the LAW moved, and this assertion
    // is here to prove the ring is actually closing, which it still is.)
    expect(shrunk).toBeCloseTo(14, 6);

    // ── the king walks in ──────────────────────────────────────────────────
    const fresh = shippedWorld();
    step(fresh.w, 2100);
    const id = summonMobBoss(fresh.w, 0, fresh.mobRules, fresh.hero, 100);
    expect(id).not.toBeNull();

    // THE ASSERTION: at the very same tick count, the ring the player sees is
    // the FULL zone boundary again, not the 14 it would have been. This is
    // `currentFireRingRadius` — the function `snapshot.ts` writes onto the wire.
    expect(currentFireRingRadius(fresh.w)).toBe(ZONE_R);
    // and the ignition tick in force has moved by exactly 180 s of ticks
    expect(fireRingIgnitionTick(fresh.w)).toBe(1800 + 5400);
    // The un-extended control is still shrinking, so the difference is the king.
    expect(currentFireRingRadius(w)).toBeCloseTo(14, 6);
  });

  it("a champion standing outside STOPS BURNING after the summon (real HP, real ticks)", () => {
    cover("boss-round-extension");
    // Both worlds put the champion at the rim, where the shrinking ring reaches
    // it; only one of them gets a king.
    const build = (): { w: SimWorld; hero: EntityId; mobRules: MobRules } => {
      const m = shippedMatch();
      const w = new SimWorld(SKELETON_ARENA, 7);
      w.combatActive = true;
      const c = SKELETON_ARENA.zones[0]!.center;
      const hero = spawnChampion(w, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(0),
        teamId: asTeamId(1),
        pos: { x: c.x + 20, z: c.z },
        zone: 0,
      });
      beginCombatFireRing(w, fireRingRulesFromConfig(m.fireRing!, DT, m.combatMaxSec));
      const mobRules = mobRulesFromConfig(shippedMobWaves(), DT, 6);
      w.mobRules = mobRules;
      w.mobTicks = 0;
      return { w, hero, mobRules };
    };

    const noKing = build();
    const withKing = build();
    // 70 s in: the ring is at 12.25, the champion at 20 is outside → burning.
    step(noKing.w, 2100);
    step(withKing.w, 2100);
    expect(isBurnedByFireRing(noKing.w, noKing.hero)).toBe(true);
    expect(isBurnedByFireRing(withKing.w, withKing.hero)).toBe(true);

    summonMobBoss(withKing.w, 0, withKing.mobRules, withKing.hero, 100);
    // The BURNING flag (client's red wash) and the damage agree, because both
    // read the same delayed ignition.
    expect(isBurnedByFireRing(withKing.w, withKing.hero)).toBe(false);
    expect(isBurnedByFireRing(noKing.w, noKing.hero)).toBe(true);

    const hpBefore = { no: hp(noKing.w, noKing.hero), king: hp(withKing.w, withKing.hero) };
    let burnTicksNo = 0;
    let burnTicksKing = 0;
    for (let i = 0; i < 60; i++) {
      step(noKing.w, 1);
      step(withKing.w, 1);
      if (ringDmg(noKing.w, noKing.hero) > 0) burnTicksNo++;
      if (ringDmg(withKing.w, withKing.hero) > 0) burnTicksKing++;
    }
    // 2 more seconds. NOT `toBe(hpBefore)` on the extended world — the champion
    // regenerates, so 「沒被燒」 shows up as hp going UP, and an assertion that
    // demanded equality would have been red for the RIGHT behaviour. The
    // direction is the claim: the un-extended champion is losing the race to the
    // ring, the extended one is winning it back.
    expect(hp(noKing.w, noKing.hero)).toBeLessThan(hpBefore.no);
    expect(hp(withKing.w, withKing.hero)).toBeGreaterThan(hpBefore.king);
    // …and the burn is not merely out-healed, it does not happen: zero
    // `fireRingDamage` packets against 60 ticks of them in the control.
    expect(burnTicksNo).toBe(60);
    expect(burnTicksKing).toBe(0);
  });

  it("pushes the ACTUAL combat deadline out by 180 s — read off isCombatTimeUp", () => {
    cover("boss-round-extension");
    // ⚠️ 這裡的基準線**讀出貨設定**,不寫死。`combatMaxSec` 是後台可調的回合長度
    // (2026-08-01 從 100 改成 180),而這條測試要驗的是「王把截止時間往後推」——
    // 那是一個**差值**。把基準線寫死等於讓一次平衡調整把它變紅,而它紅的時候
    // 說的是假話(它會說「延長壞了」,其實只是回合變長了)。
    const BASE = SHIPPED_COMBAT_DEADLINE_TICK;
    const noKing = shippedWorld();
    const withKing = shippedWorld();
    expect(combatDeadlineTick(noKing.w)).toBe(BASE);

    step(withKing.w, 100);
    summonMobBoss(withKing.w, 0, withKing.mobRules, withKing.hero, 100);
    expect(combatDeadlineTick(withKing.w)).toBe(BASE + 5400);
    expect(bossRoundExtensionTicks(withKing.w)).toBe(5400);

    // Run BOTH to the original deadline. The un-extended round is over; the
    // extended one is still going — 「避免打到一半結果回合結束」, measured on the
    // predicate a host ends combat with, not on a config field.
    step(noKing.w, BASE);
    step(withKing.w, BASE - 100);
    expect(noKing.w.fireRingTicks).toBe(BASE);
    expect(withKing.w.fireRingTicks).toBe(BASE);
    expect(isCombatTimeUp(noKing.w)).toBe(true);
    expect(isCombatTimeUp(withKing.w)).toBe(false);

    // …and it does end, at the extended tick and not one tick earlier.
    step(withKing.w, 5399);
    expect(isCombatTimeUp(withKing.w)).toBe(false);
    step(withKing.w, 1);
    expect(isCombatTimeUp(withKing.w)).toBe(true);
  });

  it("NO summon → neither deadline moves, for the whole round", () => {
    cover("boss-round-extension");
    const { w } = shippedWorld();
    const END = SHIPPED_COMBAT_DEADLINE_TICK;
    for (const t of [0, 600, 1799, 1800, 2400, END - 1]) {
      step(w, t - w.fireRingTicks);
      expect(fireRingIgnitionTick(w), `ignition @${t}`).toBe(1800);
      expect(combatDeadlineTick(w), `deadline @${t}`).toBe(END);
      expect(bossRoundExtensionTicks(w), `extension @${t}`).toBe(0);
    }
    // the ring really did do its job in the control world (else the guard is
    // asserting that nothing happened in a world where nothing happens)
    // ⚠️ 收到的是出貨設定的 `minRadius`,不是寫死的 0.5 —— v0.9.24 的二段火圈把
    // 出貨值改成 0（第二段從 90 秒起再收一次）,而寫死 0.5 會讓這一行對「二段
    // 根本沒跑」和「二段跑了」給出同一個答案的相反面:它會紅,但紅的理由是假的。
    expect(currentFireRingRadius(w)).toBeCloseTo(shippedMatch().fireRing!.minRadius, 6);
    expect(isCombatTimeUp(w)).toBe(false);
    step(w, 1);
    expect(isCombatTimeUp(w)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────── the mechanics
describe("extendRoundForBoss mechanics (boss-round-extension)", () => {
  const cfg = (boss?: FireRingConfigLike["boss"]): FireRingConfigLike => ({
    startSec: 60,
    shrinkSec: 20,
    minRadius: 0.5,
    maxPctPerSec: 1,
    boss,
  });

  it("is ABSOLUTE-TICK: N summons = N × the knob, never a re-based countdown", () => {
    cover("boss-round-extension");
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    beginCombatFireRing(
      w,
      fireRingRulesFromConfig(cfg({ extendCombatSec: 180, delayFireRingSec: 180 }), DT, 100),
    );
    // Apply the extension at three DIFFERENT points in the round. If the code
    // rebased on "now" (e.g. `startTicks = fireRingTicks + delay`) the answers
    // would depend on WHEN, and these three adds would not be 3 × 5400.
    extendRoundForBoss(w);
    step(w, 500);
    extendRoundForBoss(w);
    step(w, 900);
    extendRoundForBoss(w);
    expect(fireRingIgnitionTick(w)).toBe(1800 + 3 * 5400);
    expect(combatDeadlineTick(w)).toBe(3000 + 3 * 5400);
    expect(bossRoundExtensionTicks(w)).toBe(3 * 5400);
  });

  it("an absent boss block, or 0, extends nothing (缺席 = 今天的行為)", () => {
    cover("boss-round-extension");
    for (const block of [undefined, { extendCombatSec: 0, delayFireRingSec: 0 }]) {
      const w = new SimWorld(SKELETON_ARENA, 7);
      w.combatActive = true;
      beginCombatFireRing(w, fireRingRulesFromConfig(cfg(block), DT, 100));
      expect(extendRoundForBoss(w)).toBe(0);
      expect(fireRingIgnitionTick(w)).toBe(1800);
      expect(combatDeadlineTick(w)).toBe(3000);
    }
  });

  it("no backstop handed in ⇒ the sim asserts no deadline at all (pre-#L1 behaviour)", () => {
    cover("boss-round-extension");
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    beginCombatFireRing(w, fireRingRulesFromConfig(cfg(), DT));
    expect(combatDeadlineTick(w)).toBe(Number.POSITIVE_INFINITY);
    step(w, 5000);
    expect(isCombatTimeUp(w)).toBe(false);
  });

  it("a DISARMED ring has no round clock and cannot be extended", () => {
    cover("boss-round-extension");
    const w = new SimWorld(SKELETON_ARENA, 7);
    w.combatActive = true;
    beginCombatFireRing(
      w,
      fireRingRulesFromConfig(cfg({ extendCombatSec: 180, delayFireRingSec: 180 }), DT, 100),
    );
    endCombatFireRing(w);
    expect(extendRoundForBoss(w)).toBe(0);
    expect(fireRingIgnitionTick(w)).toBe(-1);
    expect(combatDeadlineTick(w)).toBe(Number.POSITIVE_INFINITY);
    expect(bossRoundExtensionTicks(w)).toBe(0);
    expect(isCombatTimeUp(w)).toBe(false);
  });

  it("two independently-armed worlds extend bit-identically (determinism)", () => {
    cover("boss-round-extension");
    const mk = (): SimWorld => {
      const w = new SimWorld(SKELETON_ARENA, 7);
      w.combatActive = true;
      beginCombatFireRing(
        w,
        fireRingRulesFromConfig(cfg({ extendCombatSec: 180, delayFireRingSec: 180 }), DT, 100),
      );
      return w;
    };
    const a = mk();
    const b = mk();
    step(a, 300);
    step(b, 300);
    extendRoundForBoss(a);
    extendRoundForBoss(b);
    step(a, 5400);
    step(b, 5400);
    for (let k = 0; k < 400; k++) {
      step(a, 1);
      step(b, 1);
      expect(Object.is(currentFireRingRadius(a), currentFireRingRadius(b))).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────── the shipped doc + schema
describe("the shipped config.match@1 authors the extension (boss-round-extension)", () => {
  const shippedDoc = (): Record<string, unknown> =>
    JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
    ) as Record<string, unknown>;

  it("ships the owner's 180 / 180 in the DOC, not merely as a schema default", () => {
    cover("boss-round-extension");
    // Read the raw file: a Zod `.default()` would make an EMPTY doc look armed.
    const raw = shippedDoc() as {
      match: { fireRing: { boss?: { extendCombatSec?: number; delayFireRingSec?: number } } };
    };
    expect(raw.match.fireRing.boss).toEqual({ extendCombatSec: 180, delayFireRingSec: 180 });
  });

  it("rejects a delay that would outlive the extended backstop", () => {
    cover("boss-round-extension");
    const doc = shippedDoc() as { match: { fireRing: Record<string, unknown> } };
    // 60 + 400 + 20 = 480 > 100 + 180 = 280: after a king the ring would still
    // be open when the round force-ends, i.e. no stalemate-breaker at all.
    doc.match.fireRing.boss = { extendCombatSec: 180, delayFireRingSec: 400 };
    expect(() => zConfigMatchDoc.parse(doc)).toThrow(/delayFireRingSec|殭屍王|extendCombatSec/);
    // and the shipped 180/180 is inside the allowance
    const ok = shippedDoc();
    expect(() => zConfigMatchDoc.parse(ok)).not.toThrow();
  });

  it("is bounded on BOTH sides — an hour is the ceiling, not the sky", () => {
    cover("boss-round-extension");
    const doc = shippedDoc() as { match: { fireRing: Record<string, unknown> } };
    doc.match.fireRing.boss = { extendCombatSec: 3601, delayFireRingSec: 0 };
    expect(() => zConfigMatchDoc.parse(doc)).toThrow();
    doc.match.fireRing.boss = { extendCombatSec: -1, delayFireRingSec: 0 };
    expect(() => zConfigMatchDoc.parse(doc)).toThrow();
  });
});

/** Current hp of `id`. */
function hp(w: SimWorld, id: EntityId): number {
  return w.health.get(id)?.hp ?? 0;
}

/** This tick's fire-ring damage against `id` (0 = the ring did not touch it). */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}
