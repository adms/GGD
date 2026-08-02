/**
 * #248 — 回合硬上限：不管什麼條件，5 分鐘一定出火圈收場.
 *
 * owner 2026-08-01:
 *   「時間延長太久了，**不管什麼條件**，每回合最長上限就是 5 分鐘出現火圈準備
 *     收場，不會無限增加時間」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS ACTUALLY UNBOUNDED (measured, not assumed)
 * ─────────────────────────────────────────────────────────────────────────────
 * `extendRoundForBoss` is the ONLY thing in the tree that lengthens a round, and
 * `summonMobBoss` is its only caller. `content/config/arena-rules.json` ships
 * `mobWaves.boss` as `{ enabled: true, killThreshold: 100, repeatable: true }`,
 * and `mobBoss.bossSummonsAt` reads `repeatable` as 「every multiple」 against a
 * PER-CHAMPION, match-cumulative tally. So kings arrive at 100, 200, 300 …
 * zombies **per champion**, and each one adds `boss.delayFireRingSec` (180 s) to
 * the ring's ignition and `boss.extendCombatSec` (180 s) to the deadline. The
 * `.max(3600)` bounds in the schema bound ONE summon; nothing bounded the sum.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THESE GUARDS READ (failure mode ⑦: 掃屬性代替掃行為)
 * ─────────────────────────────────────────────────────────────────────────────
 * 「`roundHardCapSec` is 300」 is a property of a JSON file and stays true even
 * if nothing enforces it. Every assertion below therefore reads something the
 * SIM ACTS ON:
 *
 *   · `currentFireRingRadius` — the number `net/snapshot.ts` puts on the wire
 *     and the client draws the flame from;
 *   · REAL hp off a REAL champion after REAL `world.step()`s, plus the
 *     `fireRingDamage` packets the damage numbers come from;
 *   · `isCombatTimeUp` — the predicate `MatchController.combatTimeUp` ends the
 *     combat phase on;
 *   · `bossRoundExtensionTicks` — the running total the host mirrors onto
 *     `PhaseMachine.ticksLeft`, i.e. the player's round countdown.
 *
 * Failure mode ⑤ (被測的不是出貨的那個): the cap comes from
 * `zConfigMatchDoc.parse(content/config/config.match.json)` — never a literal —
 * and the extension is applied by the SHIPPED `summonMobBoss`, never by poking
 * `world.fireRingRules` by hand. That is what makes the MUTATION below bite: if
 * someone raises the cap in the CODE, the expectation (derived from the shipped
 * doc) stays at 9000 ticks and these tests go red.
 *
 * MUTATION RECORD — every line below was RUN (RED → revert → GREEN), never
 * asserted from an armchair. Counts are of THIS file's 11 tests.
 *
 *   1. `applyRoundHardCap`, the ignition ceiling:
 *      `rules.startTicks = rules.hardCapTicks` → `= rules.hardCapTicks + 1800`
 *      (i.e. raise the cap by 60 s IN CODE, so a test that re-derived the
 *      expectation from code instead of from the shipped doc would stay green)
 *      → 5 RED.
 *   2. `applyRoundHardCap`, the deadline ceiling: the whole
 *      `if (rules.combatMaxTicks > rules.hardDeadlineTicks)` block deleted
 *      → 3 RED.
 *   3. `extendRoundForBoss`: `applyRoundHardCap(rules);` deleted → 5 RED.
 *   4. `extendRoundForBoss`: `const appliedExtend = rules.combatMaxTicks -
 *      deadlineBefore;` → `= extend;` (book the AUTHORED number again)
 *      → 1 RED (「倒數只拿到真的加上去的秒數」).
 *   5. `fireRingRulesFromConfig`: `applyRoundHardCap(rules);` deleted
 *      → 1 RED (「起燃比硬上限還晚的設定，開場就被夾回來」).
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
  fireRingIgnitionTick,
  fireRingRulesFromConfig,
  isCombatTimeUp,
  ringFullCloseSec,
  type FireRingConfigLike,
} from "./fireRing";
import { mobRulesFromConfig, summonMobBoss, type MobRules } from "./mobs";
import { zConfigMatchDoc, type MobWavesConfig } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const TAG = "round-hard-cap";
const DT = 1 / 30;
const TICKS_PER_SEC = 30;
const ZONE_R = 24;

/** The SHIPPED match doc, parsed through the real loader schema. */
const shippedMatch = (): ReturnType<typeof zConfigMatchDoc.parse>["match"] =>
  zConfigMatchDoc.parse(
    JSON.parse(readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8")),
  ).match;

/** The SHIPPED `mobWaves` block — the one that ships `boss.repeatable: true`. */
const shippedMobWaves = (): MobWavesConfig =>
  (
    JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/arena-rules.json"), "utf8"),
    ) as { mobWaves: MobWavesConfig }
  ).mobWaves;

/**
 * The shipped mob rules, optionally with the OTHER operator knob that bounds
 * kings — `boss.maxPerRound` (#247, 「每回合最多只會出現一次殭屍王」) — moved.
 *
 * ⚠️ THE TWO CAPS ARE INDEPENDENT AND BOTH ARE THE OPERATOR'S. #247 bounds HOW
 * MANY kings a round may contain (shipped 1, per ZONE, schema max 20); #248
 * bounds HOW MUCH TIME they may add. 不管什麼條件 means this guard has to hold
 * for EVERY setting of the other one, so the multi-king cases below raise it to
 * the schema ceiling deliberately — and the shipped-value case is guarded
 * separately, in 「出貨設定本身就會超過硬上限」.
 */
const mobRulesWithBossCap = (maxPerRound: number): MobRules => {
  const waves = shippedMobWaves();
  return mobRulesFromConfig({ ...waves, boss: { ...waves.boss!, maxPerRound } }, DT, 6);
};

/**
 * A live-combat world armed EXACTLY as `MatchController.enterCombat` arms one:
 * the shipped `match.fireRing` block plus the shipped `combatMaxSec` as the
 * backstop. One champion parked at `x` units from the zone centre so the
 * shrinking ring has a real victim.
 */
function shippedWorld(offsetFromCentre = 20): {
  w: SimWorld;
  hero: EntityId;
  mobRules: MobRules;
} {
  const m = shippedMatch();
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(1),
    pos: { x: c.x + offsetFromCentre, z: c.z },
    zone: 0,
  });
  beginCombatFireRing(w, fireRingRulesFromConfig(m.fireRing!, DT, m.combatMaxSec));
  // 20 = `zMobWavesConfig.boss.maxPerRound`'s ceiling — see mobRulesWithBossCap.
  return { w, hero, mobRules: mobRulesWithBossCap(20) };
}

const step = (w: SimWorld, n: number): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

const hp = (w: SimWorld, id: EntityId): number => w.health.get(id)!.hp;

/** THIS TICK's fire-ring damage against `id` — the packet the client renders. */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}

/**
 * Summon `n` 殭屍王 through the SHIPPED path, spread across the round exactly as
 * a farming champion would trigger them (100th, 200th … zombie). Each king is
 * left ALIVE on the field: the owner's 不管什麼條件 is about a cap that fires
 * while the extension condition is still in flight, not after it resolved.
 */
function summonKings(w: SimWorld, rules: MobRules, hero: EntityId, n: number): EntityId[] {
  const ids: EntityId[] = [];
  for (let k = 1; k <= n; k++) {
    const id = summonMobBoss(w, 0, rules, hero, k * 100);
    expect(id, `king #${k} did not spawn`).not.toBeNull();
    ids.push(id!);
  }
  return ids;
}

// ═══════════════════════════════════════════════════════ the numbers in force
describe(`${TAG} — 出貨的數字`, () => {
  it("出貨的火圈區塊真的帶著硬上限，而且 schema 讓正常回合完全跑得完", () => {
    cover(TAG);
    const m = shippedMatch();
    expect(m.fireRing!.roundHardCapSec).toBe(300); // owner 的 5 分鐘
    // The refine's promise: the cap can only ever shorten an EXTENDED round.
    expect(m.fireRing!.startSec + m.fireRing!.shrinkSec).toBeLessThanOrEqual(
      m.fireRing!.roundHardCapSec,
    );
  });

  it("殭屍王真的是可重複的 —— 這就是「無限增加時間」的來源", () => {
    cover(TAG);
    const boss = shippedMobWaves().boss!;
    expect(boss.enabled).toBe(true);
    expect(boss.repeatable).toBe(true); // 100、200、300… 每位英雄各自計數
    expect(boss.killThreshold).toBe(100);
    // #247 landed a SECOND, different bound while #248 was being written: how
    // many kings a ROUND may contain. It is per-ZONE, so it does not by itself
    // bound the time — see the next test, which measures that.
    expect(boss.maxPerRoundScope).toBe("zone");
  });

  it("出貨設定本身就會超過硬上限 —— 兩個對戰區各一隻王 = +360 秒", () => {
    cover(TAG);
    // The 火圈 clock is GLOBAL (one `world.fireRingRules` for the whole match),
    // but #247's per-round king cap is PER ZONE. So the shipped configuration —
    // `maxPerRound: 1`, `maxPerRoundScope: "zone"`, two duel zones — still lets
    // two kings land in one round, and the ring's ignition would go
    // 60 + 2×180 = 420 s. This is the shipped path with NOTHING raised.
    const m = shippedMatch();
    const { w, hero } = shippedWorld();
    const shippedRules = mobRulesFromConfig(shippedMobWaves(), DT, 6);
    expect(summonMobBoss(w, 0, shippedRules, hero, 100)).not.toBeNull();
    expect(summonMobBoss(w, 1, shippedRules, hero, 200)).not.toBeNull();
    // the naive schedule this WOULD have produced…
    const naive =
      (m.fireRing!.startSec + 2 * m.fireRing!.boss.delayFireRingSec) * TICKS_PER_SEC;
    expect(naive).toBeGreaterThan(m.fireRing!.roundHardCapSec * TICKS_PER_SEC);
    // …and what the sim actually runs on.
    expect(fireRingIgnitionTick(w)).toBe(m.fireRing!.roundHardCapSec * TICKS_PER_SEC);
  });
});

// ═══════════════════════════════════════════════════════════ 不管什麼條件
describe(`${TAG} — 不管什麼條件，回合到上限一定開始收場`, () => {
  /** The cap in ticks, DERIVED FROM THE SHIPPED DOC (never re-derived in code). */
  const capTicks = (): number => shippedMatch().fireRing!.roundHardCapSec * TICKS_PER_SEC;

  it("火圈在硬上限那一刻一定開始收 —— 四隻殭屍王都推不動它", () => {
    cover(TAG);
    const { w, hero, mobRules } = shippedWorld();
    const CAP = capTicks();

    // Four kings, alive, spread across the round. Un-capped this would push
    // ignition to 60 + 4×180 = 780 s — more than twice the cap.
    summonKings(w, mobRules, hero, 2);
    step(w, 4000);
    summonKings(w, mobRules, hero, 2);

    // …and the ring is still shut, because the delay DID apply up to the cap.
    step(w, CAP - w.fireRingTicks);
    expect(w.fireRingTicks).toBe(CAP);
    // On the ignition tick itself `ticksSinceStart === 0`, so the radius is
    // still the full boundary — the ring appears, it has not moved yet.
    expect(currentFireRingRadius(w)).toBe(ZONE_R);

    // THE ASSERTION: one tick later it is closing, and it keeps closing.
    step(w, 1);
    const justAfter = currentFireRingRadius(w);
    expect(justAfter).toBeLessThan(ZONE_R);
    step(w, 300); // 10 s in
    expect(currentFireRingRadius(w)).toBeLessThan(justAfter);
    // …and all the way to 「全地圖淹沒」 at the end of the WHOLE ring — 二段制,
    // so that is `ringFullCloseSec` (50 s shipped), NOT `shrinkSec` (20 s).
    // ⚠️ Stepping only `shrinkSec` here would find the ring parked at
    // `stage1Radius` and 「收場」 would be asserted about a ring still holding a
    // standable pocket.
    step(w, ringFullCloseSec(shippedMatch().fireRing!) * TICKS_PER_SEC);
    expect(currentFireRingRadius(w)).toBeCloseTo(shippedMatch().fireRing!.minRadius, 6);
  });

  it("硬上限的那一刻，圈外的人真的在掉血（真 HP、真 tick、真事件）", () => {
    cover(TAG);
    const { w, hero, mobRules } = shippedWorld();
    const CAP = capTicks();
    summonKings(w, mobRules, hero, 4);

    // Park the champion at the rim and hold it there — the ring must reach it.
    const c = SKELETON_ARENA.zones[0]!.center;
    const pin = (): void => {
      const t = w.transform.get(hero)!;
      t.pos.x = c.x + 20;
      t.pos.z = c.z;
      const h = w.health.get(hero)!;
      h.hp = h.maxHp;
    };

    // Just BEFORE the cap: nothing burns. Without this the test would pass on an
    // implementation that ignites the ring at second 0.
    let burnTicksBefore = 0;
    while (w.fireRingTicks < CAP) {
      pin();
      step(w, 1);
      if (ringDmg(w, hero) > 0) burnTicksBefore++;
    }
    expect(w.fireRingTicks).toBe(CAP);
    expect(burnTicksBefore, "圈在硬上限之前就燒了").toBe(0);
    expect(hp(w, hero)).toBe(w.health.get(hero)!.maxHp);

    // …and AFTER it, the champion is being eaten, tick after tick.
    const before = hp(w, hero);
    let burnTicksAfter = 0;
    for (let i = 0; i < 5 * TICKS_PER_SEC; i++) {
      const t = w.transform.get(hero)!;
      t.pos.x = c.x + 20;
      t.pos.z = c.z;
      step(w, 1);
      if (ringDmg(w, hero) > 0) burnTicksAfter++;
    }
    expect(burnTicksAfter, "硬上限到了但沒有任何燒傷封包").toBeGreaterThan(0);
    expect(hp(w, hero)).toBeLessThan(before);
  });

  it("回合真的結束：`isCombatTimeUp` 在硬底線上限那一刻翻真，不管幾隻王", () => {
    cover(TAG);
    const m = shippedMatch();
    const { w, hero, mobRules } = shippedWorld();
    // The hard deadline = cap + the tail the operator authored between ignition
    // and the backstop (`combatMaxSec - startSec`). Derived from the doc here,
    // exactly as `fireRingRulesFromConfig` derives it — so a code-side change to
    // either half is caught.
    const tail = m.combatMaxSec - m.fireRing!.startSec;
    const HARD_DEADLINE = (m.fireRing!.roundHardCapSec + tail) * TICKS_PER_SEC;

    summonKings(w, mobRules, hero, 6); // 6 × 180 s = 18 minutes of naive extension
    expect(combatDeadlineTick(w)).toBe(HARD_DEADLINE);

    step(w, HARD_DEADLINE - 1);
    expect(isCombatTimeUp(w)).toBe(false);
    step(w, 1);
    expect(isCombatTimeUp(w)).toBe(true);
  });

  it("倒數只拿到真的加上去的秒數 —— 不是後台那一格的數字", () => {
    cover(TAG);
    const m = shippedMatch();
    const { w, hero, mobRules } = shippedWorld();
    const perSummon = m.fireRing!.boss.extendCombatSec * TICKS_PER_SEC;
    const tail = m.combatMaxSec - m.fireRing!.startSec;
    const HARD_DEADLINE = (m.fireRing!.roundHardCapSec + tail) * TICKS_PER_SEC;
    const authoredDeadline = m.combatMaxSec * TICKS_PER_SEC;

    // King #1 fits entirely under the cap → the full authored extension applies.
    summonKings(w, mobRules, hero, 1);
    expect(bossRoundExtensionTicks(w)).toBe(perSummon);

    // Keep summoning. `bossRoundExtensionTicks` is what the host adds to
    // `PhaseMachine.ticksLeft`, so it must converge on 「deadline − authored」 and
    // stop — never keep counting 180 s the sim will not honour.
    summonKings(w, mobRules, hero, 5);
    expect(bossRoundExtensionTicks(w)).toBe(HARD_DEADLINE - authoredDeadline);
    expect(bossRoundExtensionTicks(w)).toBeLessThan(6 * perSummon);
    // …and one more king adds NOTHING, so the countdown does not drift up.
    expect(summonMobBoss(w, 0, mobRules, hero, 700)).not.toBeNull();
    expect(bossRoundExtensionTicks(w)).toBe(HARD_DEADLINE - authoredDeadline);
  });
});

// ═════════════════════════════════════════════════════ the cap must be inert
describe(`${TAG} — 沒有延長條件時，硬上限一格都不能動`, () => {
  it("沒有殭屍王 → 起燃 60 s、硬底線 100 s，和 #248 之前逐一相同", () => {
    cover(TAG);
    const m = shippedMatch();
    const { w } = shippedWorld();
    expect(fireRingIgnitionTick(w)).toBe(m.fireRing!.startSec * TICKS_PER_SEC);
    expect(combatDeadlineTick(w)).toBe(m.combatMaxSec * TICKS_PER_SEC);
    // and it really does close on the authored schedule, not the cap's.
    // 二段制: 「closed」 means BOTH stages done → `ringFullCloseSec`.
    step(w, (m.fireRing!.startSec + ringFullCloseSec(m.fireRing!)) * TICKS_PER_SEC);
    expect(currentFireRingRadius(w)).toBeCloseTo(m.fireRing!.minRadius, 6);
  });

  it("沒有 authored 硬上限的規則（fixture／客戶端預測）行為和 #248 之前一樣", () => {
    cover(TAG);
    // `FireRingConfigLike` treats an absent `roundHardCapSec` as 「no cap」 — the
    // deliberate asymmetry with the schema's `.default(300)`. Three kings still
    // add 3 × 180 s here, which is exactly the pre-#248 behaviour every recorded
    // replay digest was produced under.
    const cfg: FireRingConfigLike = {
      startSec: 60,
      shrinkSec: 20,
      minRadius: 0.5,
      maxPctPerSec: 1,
      boss: { extendCombatSec: 180, delayFireRingSec: 180 },
    };
    const rules = fireRingRulesFromConfig(cfg, DT, 100);
    expect(rules.hardCapTicks).toBe(Number.POSITIVE_INFINITY);
    expect(rules.hardDeadlineTicks).toBe(Number.POSITIVE_INFINITY);

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
    beginCombatFireRing(w, rules);
    summonKings(w, mobRulesWithBossCap(20), hero, 3);
    expect(fireRingIgnitionTick(w)).toBe(1800 + 3 * 5400);
    expect(combatDeadlineTick(w)).toBe(3000 + 3 * 5400);
  });
});

// ═══════════════════════════════════════════════════════════ the arm-time clamp
describe(`${TAG} — 開場就違規的設定`, () => {
  it("起燃比硬上限還晚的設定，開場就被夾回來（不是等到有王才夾）", () => {
    cover(TAG);
    // The schema's refine rejects this at authoring time, but `FireRingConfigLike`
    // is also hand-built — `MatchController.fireRingForRound` substitutes a
    // different `startSec` on the finale, for instance. 不管什麼條件 has to
    // include 「回合一開始就是這樣」.
    const rules = fireRingRulesFromConfig(
      {
        startSec: 400,
        shrinkSec: 20,
        minRadius: 0.5,
        roundHardCapSec: 300,
      },
      DT,
      600,
    );
    // Capped to 300 s, and the deadline capped to 300 + max(shrink, 600−400)
    // = 300 + 200 = 500 s.
    expect(rules.startTicks).toBe(300 * TICKS_PER_SEC);
    expect(rules.combatMaxTicks).toBe(500 * TICKS_PER_SEC);
    // …and the ring still gets its whole closing animation inside the deadline.
    expect(rules.combatMaxTicks - rules.startTicks).toBeGreaterThanOrEqual(rules.shrinkTicks);
  });

  it("夾過之後火圈一定收得完 —— 硬上限不會製造「圈還在縮就結束」的回合", () => {
    cover(TAG);
    const m = shippedMatch();
    const { w, hero, mobRules } = shippedWorld();
    summonKings(w, mobRules, hero, 8);
    const rules = w.fireRingRules!;
    // 二段制: the room the deadline must leave is the WHOLE ring, and that is
    // the invariant `fireRingRulesFromConfig` floors `authoredTail` at.
    const fullClose = rules.stage2GapTicks + rules.stage2ShrinkTicks;
    expect(fullClose).toBeGreaterThan(rules.shrinkTicks); // stage 2 really is on
    expect(rules.combatMaxTicks - rules.startTicks).toBeGreaterThanOrEqual(fullClose);
    // and concretely: fully closed BEFORE the deadline, on the shipped numbers.
    step(w, rules.startTicks + fullClose);
    expect(currentFireRingRadius(w)).toBeCloseTo(m.fireRing!.minRadius, 6);
    expect(isCombatTimeUp(w)).toBe(false);
  });
});
