/**
 * 火圈灼燒曲線 —— 「隨秒數越高越燒越痛」 (owner 2026-08-02).
 *
 *   「火圈應該是隨秒數越高越燒越痛的生命百分比的真實傷害
 *     (極端情形第100秒後燒100%真實傷害=必死)」
 *
 * WHAT WAS ACTUALLY IMPOSSIBLE BEFORE. The burn was `start + (end - start) * p`
 * where `p = min(1, ticksSinceStart / shrinkTicks)`. That x axis SATURATES at
 * `shrinkSec` (20 s shipped), so the rate froze at 20 %/s twenty seconds after
 * ignition and never rose again — 「越燒越痛」 had no way to be expressed, at any
 * setting of any field. The fix is a breakpoint table keyed on SECONDS SINCE
 * IGNITION whose domain is not tied to the shrink.
 *
 * ── WHY THESE ASSERTIONS AND NOT OTHERS (七種故障 ④/⑤/⑦) ──────────────────
 *
 *   • ⑦ 掃屬性代替掃行為: nothing here asserts `rules.burnCurveRates[2] === 1`.
 *     Every claim is 「step a real `SimWorld` and read the champion's hp」, so an
 *     implementation that computes a beautiful curve and then burns a constant
 *     fails. The death TICK is pinned, not a range.
 *   • ⑤ 被測的不是出貨的那個: the shipped rules come from parsing
 *     `content/config/config.match.json` through the SAME Zod schema the loader
 *     uses, then through the SAME `fireRingRulesFromConfig` the match host
 *     calls — never a hand-written fixture that happens to hold the same
 *     numbers.
 *   • ④ 斷言方向跟缺陷無關: the boss test does not merely check that a king
 *     round burns. It checks that the burn at 「N seconds after ignition」 is the
 *     SAME as in a normal round even though ignition moved 180 s — which is
 *     exactly the assertion an absolute-round-seconds implementation fails, and
 *     the only assertion that catches it.
 *
 * ── MUTATION RECORD (each applied, run, reverted, re-run green) ─────────────
 *   1. `content/config/config.match.json` last row `pctPerSec: 1` → `0.2`
 *      (= the retired two-point behaviour)          → 「必死」 + 「最後一個人」 fail.
 *   2. `fireRingRatePerSec`: read `ticksSinceStart` as absolute round ticks
 *      (drop the `- rules.startTicks` at both call sites)
 *                                                    → the BOSS test fails.
 *   3. `compileBurnCurve`: `curve.length > 0 ? curve : DEFAULT_BURN_CURVE`
 *      → `curve ?? DEFAULT_BURN_CURVE` (empty table survives)
 *                                                    → the NaN guard fails.
 *   4. `fireRingRatePerSec`: hold past the last row → extrapolate the last slope
 *                                                    → the 「held flat」 assert fails.
 *   The exact observed values are in the report; every one of them is a hard
 *   failure, not a flake.
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
  extendRoundForBoss,
  fireRingRatePerSec,
  fireRingRulesFromConfig,
  type FireRingRules,
} from "./fireRing";
import { zConfigMatchDoc } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const TAG = "firering-burn-curve";
const DT = 1 / 30;
const HZ = 30;

/** The SHIPPED doc, through the loader's own schema. */
const DOC = zConfigMatchDoc.parse(
  JSON.parse(
    readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
  ) as unknown,
);
const SHIPPED_RING = DOC.match.fireRing!;

const shippedRules = (): FireRingRules =>
  fireRingRulesFromConfig(SHIPPED_RING, DT, DOC.match.combatMaxSec);

/**
 * The outermost position `clampToBoundary` allows (24 − 0.6). A champion parked
 * here is outside the ring from the first shrink tick and never inside again.
 */
const RIM_OFFSET = 23.4;

function champAt(w: SimWorld, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(1),
    pos: { x, z },
    zone: 0,
  });
}

/**
 * Step a real world until the champion at `offset` from the zone centre dies.
 * Returns the absolute combat tick of death and the tick count SINCE IGNITION.
 * `null` if it survived — which is itself a failure worth reading as such.
 */
function stepToDeath(
  rules: FireRingRules,
  offset: number,
  seed: number,
  boss = false,
): { atTick: number; sinceIgnite: number; maxHp: number } | null {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = champAt(w, c.x + offset, c.z);
  beginCombatFireRing(w, rules);
  if (boss) extendRoundForBoss(w);
  const maxHp = w.health.get(id)!.maxHp;
  for (let i = 0; i < 20000; i++) {
    w.step(new Map());
    if (!w.health.get(id)!.alive) {
      return {
        atTick: w.fireRingTicks,
        sinceIgnite: w.fireRingTicks - rules.startTicks,
        maxHp,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────── 「越燒越痛」 itself ──
describe("the burn really does escalate with SECONDS SINCE IGNITION", () => {
  it("shipped: a champion parked outside dies on tick 351 past ignition (combat 71.700 s)", () => {
    cover(TAG);
    const r = shippedRules();
    expect(r.startTicks).toBe(60 * HZ);
    const dead = stepToDeath(r, RIM_OFFSET, 7);
    expect(dead).not.toBeNull();
    // THE TICK, not a window. 351 ticks = 11.700 s past ignition = combat
    // second 71.700. ⚠️ This is the SAME tick the retired two-point ramp
    // produced — deliberately: owner asked for a hotter tail, and the 0–20 s
    // stretch is where 「跑出去就回不來」 is decided, so it had to be untouched.
    expect(dead!.sinceIgnite).toBe(351);
    expect(dead!.atTick).toBe(2151);
    expect(dead!.maxHp).toBeGreaterThan(0); // the guard is not measuring a 0-hp corpse
  });

  it("the LAST possible survivor — full hp, zone centre, never attacked — dies at 109.033 s", () => {
    cover(TAG);
    // Nothing in this test is about the curve's x axis; it is about 「a round
    // ALWAYS ends」 — and 二段制 is precisely a change to WHEN, so this number
    // moving is the feature, not a regression.
    //
    // WHY 1471 AND NOT 709 (the single-stage number). The man at the centre is
    // now SAFE for the whole first stage and the whole breather: 第一段 stops at
    // `stage1Radius` 4.0, and 4.0 − 0.6 = 3.4 > 0, so whole-body-inside holds at
    // distance 0. He only starts burning once 第二段 has pulled the radius under
    // his body radius: stage 2 runs 4.0 → 0 over ticks 900…1500 past ignition,
    // crossing 0.6 at tick 1410 (combat second 107.0). From there the rate is
    // already clamped at `maxPctPerSec` 0.5/s, so a full bar takes 2 s = 60
    // ticks → death at 1470/1471. That is the whole design in one number: a
    // stalemate now survives the first stage and dies to the flood.
    const dead = stepToDeath(shippedRules(), 0, 11);
    expect(dead).not.toBeNull();
    expect(dead!.sinceIgnite).toBe(1471); // 49.033 s past ignition
    expect(dead!.atTick).toBe(3271); // combat second 109.033, inside combatMaxSec 180
  });

  it("softening the LAST row alone makes death strictly later — the tail is load-bearing", () => {
    cover(TAG);
    // Same config in every other respect; only the 40 s row moves 1.0 → 0.2,
    // which is exactly the retired two-point behaviour. If the tail were
    // decoration, these two numbers would be equal.
    const hot = stepToDeath(shippedRules(), 0, 11)!;
    const cold = stepToDeath(
      fireRingRulesFromConfig(
        { ...SHIPPED_RING, burnCurve: [...SHIPPED_RING.burnCurve.slice(0, 2), { sec: 40, pctPerSec: 0.2 }] },
        DT,
        DOC.match.combatMaxSec,
      ),
      0,
      11,
    )!;
    expect(cold.sinceIgnite).toBeGreaterThan(hot.sinceIgnite);
    // 90 ticks = 3.0 s. ⚠️ It was 39 under the single-stage ring: the centre
    // survivor now first burns at ~49 s past ignition, i.e. deep past the 40 s
    // row, so the row's value is what he meets head-on for his whole (short)
    // life instead of only at the very end — the tail got MORE load-bearing,
    // not less.
    expect(cold.sinceIgnite - hot.sinceIgnite).toBe(90);
  });

  it("past the last row the rate HOLDS — it does not keep climbing the last slope", () => {
    cover(TAG);
    // ⚠️ THIS TEST CANNOT USE THE SHIPPED TABLE, and that is the point. Shipped,
    // the last row is 1.0 and `maxPctPerSec` is 0.5, so past 40 s BOTH 「hold」
    // and 「extrapolate the final slope」 sit above the cap and get clamped to the
    // same 0.5 — a mutation to extrapolation passes every other assertion in
    // this file (measured). The behaviours only separate BELOW the cap, so the
    // guard has to author a config where they do: last row 0.5 with the cap
    // lifted clear of it (1.0 = the Zod maximum).
    // ⚠️ The cap is stated EXPLICITLY and must stay that way: omitting it now
    // resolves to DEFAULT_MAX_PCT_PER_SEC (0.5) — exactly the last row — which
    // would re-flatten the two behaviours and quietly retire this guard.
    const r = fireRingRulesFromConfig(
      {
        startSec: 0,
        maxPctPerSec: 1,
        burnCurve: [
          { sec: 0, pctPerSec: 0.1 },
          { sec: 10, pctPerSec: 0.5 },
        ],
      },
      DT,
    );
    expect(r.maxPctPerSec).toBe(1); // lifted clear of the 0.5 last row
    expect(fireRingRatePerSec(r, 10 * HZ)).toBeCloseTo(0.5, 12);
    // Extrapolating the 0.04 %/tick slope would give 0.9 at t = 20 and 1.7 at
    // t = 40; holding gives 0.5 forever.
    expect(fireRingRatePerSec(r, 20 * HZ)).toBeCloseTo(0.5, 12);
    expect(fireRingRatePerSec(r, 40 * HZ)).toBeCloseTo(0.5, 12);
    expect(fireRingRatePerSec(r, 600 * HZ)).toBeCloseTo(0.5, 12);
  });

  it("rate is monotonically non-decreasing over the whole shipped table", () => {
    cover(TAG);
    // 「越燒越痛」 as a property, checked on the real function rather than eyeballed
    // off the JSON: a table that dipped anywhere would be a curve nobody asked for.
    const r = shippedRules();
    let prev = fireRingRatePerSec(r, 0);
    for (let t = 1; t <= 60 * HZ; t++) {
      const cur = fireRingRatePerSec(r, t);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
    // ⚠️ 0.5, NOT the curve's own 1.0 — the shipped `maxPctPerSec` is 0.5
    // (owner 2026-08-02 「預設最高是50%…不必到100%」). The curve still ASKS for
    // 100 %/s at 40 s; the cap is what a player actually meets. Both numbers are
    // asserted on purpose so raising or lowering either one has to come here.
    expect(prev).toBeCloseTo(0.5, 12);
    expect(r.burnCurveRates[r.burnCurveRates.length - 1]).toBe(1); // 曲線本身沒被改
    expect(r.maxPctPerSec).toBe(0.5); // 夾住它的是這道牆
  });
});

// ────────────────────────────────────────────── 陷阱①: boss delays ignition ──
describe("the curve travels WITH ignition, not with the round clock (陷阱①)", () => {
  it("a 殭屍王 round ignites 180 s later and burns IDENTICALLY per second-since-ignition", () => {
    cover(TAG);
    const plain = shippedRules();
    const kingly = shippedRules();
    const w = new SimWorld(SKELETON_ARENA, 99);
    w.combatActive = true;
    beginCombatFireRing(w, kingly);
    expect(extendRoundForBoss(w)).toBe(180 * HZ);
    expect(kingly.startTicks).toBe(240 * HZ); // 60 + 180

    const a = stepToDeath(plain, RIM_OFFSET, 7)!;
    const b = stepToDeath(shippedRules(), RIM_OFFSET, 7, true)!;
    // SAME time-since-ignition, and BOTH pinned to the absolute 351. ⚠️ The
    // equality ALONE is not enough and that is measured, not assumed: keying
    // the rate on absolute round ticks shifts BOTH worlds onto the saturated
    // tail, so both die in ~31 ticks and `b === a` still holds. Pinning the
    // value is what turns this into a guard (失敗形態 ④).
    expect(a.sinceIgnite).toBe(351);
    expect(b.sinceIgnite).toBe(351);
    expect(b.sinceIgnite).toBe(a.sinceIgnite);
    // … at a DIFFERENT absolute round tick. Read as absolute seconds keyed on
    // the round clock, the curve would already be saturated at 100 %/s when a
    // king round's ring finally lights, and this champion would evaporate in
    // ~1 s instead of 11.7 — which is what makes this pairing the guard.
    expect(b.atTick - a.atTick).toBe(180 * HZ);
  });

  it("the RATE function itself is keyed on ticks-since-ignition, whatever startTicks is", () => {
    cover(TAG);
    const early = fireRingRulesFromConfig({ ...SHIPPED_RING, startSec: 1 }, DT);
    const late = fireRingRulesFromConfig({ ...SHIPPED_RING, startSec: 280 }, DT);
    for (const t of [0, 300, 600, 900, 1200, 3000]) {
      expect(Object.is(fireRingRatePerSec(early, t), fireRingRatePerSec(late, t))).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────── determinism ──
describe("determinism: the burn is a pure function of (rules, tick)", () => {
  it("two same-seed worlds produce a BIT-identical hp series, 2400 ticks long", () => {
    cover(TAG);
    const series = (): number[] => {
      const r = shippedRules();
      const w = new SimWorld(SKELETON_ARENA, 4242);
      w.combatActive = true;
      const c = SKELETON_ARENA.zones[0]!.center;
      const id = champAt(w, c.x + RIM_OFFSET, c.z);
      beginCombatFireRing(w, r);
      const out: number[] = [];
      for (let i = 0; i < 2400; i++) {
        w.step(new Map());
        out.push(w.health.get(id)!.hp);
      }
      return out;
    };
    const a = series();
    const b = series();
    expect(a).toHaveLength(2400);
    // Object.is, not toEqual: replay digests and client prediction need BIT
    // equality, and a curve lookup that allocated or iterated a Map could
    // differ in the last ulp while passing a tolerance comparison.
    expect(a.every((v, i) => Object.is(v, b[i]))).toBe(true);
    expect(a[2399]!).toBeLessThan(a[0]!); // and it actually burned (not a flat pair)
  });

  it("the compiled table is frozen, sorted and allocation-free to read", () => {
    cover(TAG);
    const r = shippedRules();
    expect(Object.isFrozen(r.burnCurveTicks)).toBe(true);
    expect(Object.isFrozen(r.burnCurveRates)).toBe(true);
    expect(r.burnCurveTicks).toEqual([0, 600, 1200]);
    expect(r.burnCurveRates).toEqual([0.04, 0.2, 1]);
    expect(r.burnCurveTicks.length).toBe(r.burnCurveRates.length);
    for (let i = 1; i < r.burnCurveTicks.length; i++) {
      expect(r.burnCurveTicks[i]!).toBeGreaterThanOrEqual(r.burnCurveTicks[i - 1]!);
    }
  });
});

// ───────────────────────────────────────────────── owner's sentence, literally ──
describe("owner 2026-08-02: 第 100 秒 100% 真傷 = 必死", () => {
  /**
   * ⚠️ 兩句 owner 的話在這一格相撞，而兩句都留著：
   *   · 「極端情形第100秒後燒100%真實傷害=必死」 → 曲線最後一列 `pctPerSec: 1`
   *   · 「燃燒真傷上限…預設最高是50%之類，不必到100%」 → `maxPctPerSec: 0.5`
   * 出貨的結果是 100 %/s 的曲線被 50 %/s 的牆夾住：還是必死，只是要兩秒不是
   * 一秒。把上限那一格調到 1.0 就回到字面上的「一秒」—— 這也是下面第二段驗的。
   */
  it("combat second 100 asks for 100 %/s, and the shipped cap delivers 50 %/s", () => {
    cover(TAG);
    const r = shippedRules();
    const ownerSecond = 100;
    const sinceIgnite = ownerSecond - SHIPPED_RING.startSec; // 40
    expect(sinceIgnite).toBe(40);
    // 曲線那一列真的是 1.0（沒有人偷偷把曲線改軟）
    expect(r.burnCurveRates[r.burnCurveRates.length - 1]).toBe(1);
    // 玩家實際吃到的：被 0.5 的天花板夾住
    expect(fireRingRatePerSec(r, sinceIgnite * HZ)).toBeCloseTo(0.5, 12);
    // 把後台那一格開到 1.0 → 字面上的 100 %/秒回來了（證明夾住它的是上限，
    // 不是曲線被改壞，也不是 rate 被硬寫成常數）。
    const lifted = fireRingRulesFromConfig({ ...SHIPPED_RING, maxPctPerSec: 1 }, DT, 100);
    expect(fireRingRatePerSec(lifted, sinceIgnite * HZ)).toBeCloseTo(1, 12);
  });

  it("100 %/s really does mean ONE SECOND: a full bar, 30 ticks, in a real world", () => {
    cover(TAG);
    // Not 「the number is 1.0」 — 「a champion at that rate dies in 30 ticks」.
    // A ring that ignites at 0 with a flat 100 %/s isolates the claim from the
    // ramp entirely.
    const instant = fireRingRulesFromConfig(
      {
        startSec: 0,
        shrinkSec: 20,
        minRadius: 0.5,
        burnCurve: [
          { sec: 0, pctPerSec: 1 },
          { sec: 40, pctPerSec: 1 },
        ],
        maxPctPerSec: 1,
      },
      DT,
    );
    const dead = stepToDeath(instant, RIM_OFFSET, 5)!;
    // 30 ticks of `maxHp * 1.0 * (1/30)` is exactly one bar; regen inside the
    // world can buy at most a tick or two, so ≤ 33 is the honest bound.
    expect(dead.sinceIgnite).toBeGreaterThanOrEqual(30);
    expect(dead.sinceIgnite).toBeLessThanOrEqual(33);
  });
});
