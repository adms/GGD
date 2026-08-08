/**
 * Fire ring (火圈 / 火環, tasks #132 + #195) — the round-pacing hazard.
 *
 * #195 redesign under test:
 *   • THE SHRINK LAW — `fireRingRadius` is a pure function of the TICK (never
 *     of tick history), monotone non-increasing, and identical for two
 *     independently-armed rule sets;
 *   • THE SAFETY PREDICATE — whole-body-inside, and at the closed radius
 *     `inner < 0` so it is false for every champion at every position
 *     (「沒有生存空間」 out of the same arithmetic, no second rule);
 *   • ONLY OUTSIDE BURNS, with a rate that ramps with the shrink progress;
 *   • the SHIPPED config is locked to the owner's numbers (60 / 20 / 0.5), and
 *     the client's cue formula `combatMaxSec - startSec` is proven against the
 *     sim's own tick math.
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
  currentFireRingRadius,
  endCombatFireRing,
  fireRingIsSafe,
  fireRingRadius,
  fireRingRatePerSec,
  fireRingRulesFromConfig,
  isBurnedByFireRing,
  ringFullCloseSec,
  DEFAULT_MAX_PCT_PER_SEC,
  type FireRingRules,
} from "./fireRing";
import { zConfigMatchDoc } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
/** The shipped arena geometry the ring closes inside. */
const ZONE_R = 24;
/** Champion collision radius (spawnChampion.ts). */
const BODY_R = 0.6;

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number, zone = 0): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone,
  });
}

/** The shipped ring, in ticks — the exact rules the game-server arms. */
const shippedRules = (): FireRingRules =>
  fireRingRulesFromConfig(
    {
      startSec: 60,
      shrinkSec: 20,
      minRadius: 0.5,
      // omitted `burnCurve` = DEFAULT_BURN_CURVE = the shipped table.
      maxPctPerSec: 1,
    },
    DT,
  );

/** Live-combat world with one champion at zone 0's centre, armed. */
function armedWorld(rules: FireRingRules, seed = 7): { w: SimWorld; id: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = champAt(w, 0, 1, c.x, c.z);
  beginCombatFireRing(w, rules);
  return { w, id };
}

/** Sum this tick's fireRingDamage for `id`. */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}

// ---------------------------------------------------------------- shrink law
describe("the shrink law (firering-shrink)", () => {
  it("matches the design table exactly at k = 0/150/300/450/600, and clamps past the end", () => {
    cover("firering-shrink");
    const r = shippedRules();
    expect(r.startTicks).toBe(1800);
    expect(r.shrinkTicks).toBe(600);

    // t (s) | k (ticks) | radius | safe radius (inner = radius - 0.6)
    const table: [number, number, number][] = [
      [0, 0, 24.0],
      [5, 150, 18.125],
      [10, 300, 12.25],
      [15, 450, 6.375],
      [20, 600, 0.5],
    ];
    for (const [, k, want] of table) {
      expect(fireRingRadius(r, k, ZONE_R)).toBeCloseTo(want, 12);
      expect(fireRingRadius(r, k, ZONE_R) - BODY_R).toBeCloseTo(want - BODY_R, 12);
    }
    // past the end it CLAMPS — a long round never produces a negative radius
    expect(fireRingRadius(r, 900, ZONE_R)).toBeCloseTo(0.5, 12);
    expect(fireRingRadius(r, 1_000_000, ZONE_R)).toBeCloseTo(0.5, 12);
    // before/at ignition the ring is the zone boundary itself
    expect(fireRingRadius(r, 0, ZONE_R)).toBe(ZONE_R);
    expect(fireRingRadius(r, -5, ZONE_R)).toBe(ZONE_R);
  });

  it("is monotone NON-INCREASING across every one of the 600 shrink ticks", () => {
    cover("firering-shrink");
    const r = shippedRules();
    let prev = fireRingRadius(r, 0, ZONE_R);
    for (let k = 1; k <= 600; k++) {
      const cur = fireRingRadius(r, k, ZONE_R);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
    // ~1.175 u/s: continuous to the eye, never a staircase
    const perTick = fireRingRadius(r, 0, ZONE_R) - fireRingRadius(r, 1, ZONE_R);
    expect(perTick).toBeCloseTo((ZONE_R - 0.5) / 600, 12);
    expect(perTick * 30).toBeCloseTo(1.175, 6);
  });

  it("two independently-armed rule sets produce bit-identical radii (determinism)", () => {
    cover("firering-shrink");
    const a = shippedRules();
    const b = shippedRules();
    for (let k = 0; k <= 700; k++) {
      // Object.is, not toBeCloseTo: the wire and the digest need bit equality.
      expect(Object.is(fireRingRadius(a, k, ZONE_R), fireRingRadius(b, k, ZONE_R))).toBe(true);
    }
  });
});

// ------------------------------------------------------------ safety predicate
describe("the safety predicate is WHOLE-BODY-INSIDE (firering-shrink)", () => {
  it("at t=0 a champion at 23.39 is safe and one at 23.41 burns", () => {
    cover("firering-shrink");
    const r = shippedRules();
    const radius = fireRingRadius(r, 0, ZONE_R); // 24
    // inner = 24 - 0.6 = 23.4, EXACTLY clampToBoundary's own limit, so ignition
    // burns nobody the collision system would have allowed to stand there.
    expect(fireRingIsSafe(radius, BODY_R, 23.39 * 23.39)).toBe(true);
    expect(fireRingIsSafe(radius, BODY_R, 23.41 * 23.41)).toBe(false);
    expect(fireRingIsSafe(radius, BODY_R, 23.4 * 23.4)).toBe(true); // exactly on it
  });

  it("at t=20 the ring is closed: dist 0 burns — 沒有生存空間, no special case", () => {
    cover("firering-shrink");
    const r = shippedRules();
    const radius = fireRingRadius(r, 600, ZONE_R); // 0.5
    expect(radius - BODY_R).toBeCloseTo(-0.1, 12); // inner < 0
    expect(fireRingIsSafe(radius, BODY_R, 0)).toBe(false);
    for (const d of [0, 0.01, 0.1, 0.4, 1, 5, 23]) {
      expect(fireRingIsSafe(radius, BODY_R, d * d)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- rate curve
describe("burn rate follows the burnCurve, keyed on SECONDS SINCE IGNITION (firering-ramp)", () => {
  it("shipped table: 4 %/s → 20 %/s → 100 %/s, linear between rows, held after", () => {
    cover("firering-ramp");
    const r = shippedRules();
    // ── rows 1→2 (0–20 s). ⚠️ EVERY ONE OF THESE FIVE NUMBERS IS UNCHANGED
    // from the retired two-point ramp, on purpose: owner asked for a hotter
    // TAIL, not a hotter early game, so the shape nobody asked about had to
    // stay bit-for-bit identical.
    expect(fireRingRatePerSec(r, 0)).toBeCloseTo(0.04, 12);
    expect(fireRingRatePerSec(r, 150)).toBeCloseTo(0.08, 12); // 5 s
    expect(fireRingRatePerSec(r, 300)).toBeCloseTo(0.12, 12); // 10 s
    expect(fireRingRatePerSec(r, 450)).toBeCloseTo(0.16, 12); // 15 s
    expect(fireRingRatePerSec(r, 600)).toBeCloseTo(0.2, 12); // 20 s — ring closed
    // ── rows 2→3 (20–40 s): the part the old ramp COULD NOT EXPRESS. Under the
    // two-point law the rate was pinned at 0.2 from here to the end of time.
    expect(fireRingRatePerSec(r, 750)).toBeCloseTo(0.4, 12); // 25 s
    expect(fireRingRatePerSec(r, 900)).toBeCloseTo(0.6, 12); // 30 s
    expect(fireRingRatePerSec(r, 1050)).toBeCloseTo(0.8, 12); // 35 s
    // 40 s past ignition = COMBAT SECOND 100 on the shipped `startSec: 60`.
    // 100 %/s = a full health bar per second = owner's 「必死」.
    expect(fireRingRatePerSec(r, 1200)).toBeCloseTo(1, 12);
    // held flat past the last row (and the cap agrees), never extrapolated away
    expect(fireRingRatePerSec(r, 5000)).toBeCloseTo(1, 12);
    expect(fireRingRatePerSec(r, -1)).toBe(0);
  });

  it("maxPctPerSec is the ONLY wall; omitting it falls back to the SHIPPED cap", () => {
    cover("firering-ramp");
    const curve = [
      { sec: 0, pctPerSec: 0.5 },
      { sec: 1, pctPerSec: 1.6 },
    ];
    const capped = fireRingRulesFromConfig({ startSec: 1, burnCurve: curve, maxPctPerSec: 0.6 }, DT);
    expect(fireRingRatePerSec(capped, 30)).toBe(0.6);
    const omitted = fireRingRulesFromConfig({ startSec: 1, burnCurve: curve }, DT);
    // ⚠️ This line has held `1e9`, then `Infinity`, and now the shipped default.
    // 「沒填 = 不設限」 was a DRIFT, not a feature: the Zod field bounded the same
    // knob while this branch answered 「無限」, and only the Zod-free callers
    // (fixtures / MatchController substitutions / the admin preview with a blank
    // box) could ever see the disagreement. Absent ⇒ 出貨預設, same convention as
    // `compileBurnCurve`'s missing table and `sim/stealth.ts`'s missing doc.
    expect(omitted.maxPctPerSec).toBe(DEFAULT_MAX_PCT_PER_SEC);
    expect(omitted.maxPctPerSec).not.toBe(Number.POSITIVE_INFINITY);
    // …and the fallback BITES: the curve asks for 1.6, the player takes 0.5.
    expect(fireRingRatePerSec(omitted, 30)).toBeCloseTo(DEFAULT_MAX_PCT_PER_SEC, 12);
  });

  it("degenerate tables cannot produce NaN / Infinity damage", () => {
    cover("firering-ramp");
    // empty table → the shipped curve, NOT a burn of `undefined` (which lands
    // in the health store as NaN and silently voids every hp comparison).
    const empty = fireRingRulesFromConfig({ startSec: 0, burnCurve: [] }, DT);
    expect(fireRingRatePerSec(empty, 0)).toBeCloseTo(0.04, 12);
    // Two authored seconds rounding onto ONE tick. ⚠️ Measured, not assumed:
    // this does NOT reach the `span > 0` ternary in `fireRingRatePerSec` (the
    // scan skips the collapsed segment — see the proof at that line); what it
    // proves is the end-to-end property that a collision cannot produce a
    // non-finite rate, which is the thing that would matter.
    const collide = fireRingRulesFromConfig(
      {
        startSec: 0,
        burnCurve: [
          { sec: 0, pctPerSec: 0.1 },
          { sec: 0.01, pctPerSec: 0.9 },
          { sec: 1, pctPerSec: 0.9 },
        ],
      },
      DT,
    );
    for (let t = 0; t <= 60; t++) expect(Number.isFinite(fireRingRatePerSec(collide, t))).toBe(true);
    // a negative rate would be the ring HEALING whoever stands in the fire.
    const negative = fireRingRulesFromConfig(
      {
        startSec: 0,
        burnCurve: [
          { sec: 0, pctPerSec: -1 },
          { sec: 1, pctPerSec: -1 },
        ],
      },
      DT,
    );
    expect(fireRingRatePerSec(negative, 15)).toBe(0);
  });
});

// ---------------------------------------------------------------- ignition
describe("fire-ring ignition timing (firering-start)", () => {
  it("stays dormant until startTicks, then fires fireRingStart exactly once", () => {
    cover("firering-start");
    const rules = fireRingRulesFromConfig(
      { startSec: 5 * DT, shrinkSec: 10 * DT, minRadius: 0.5, maxPctPerSec: 1 },
      DT,
    );
    expect(rules.startTicks).toBe(5);
    const { w, id } = armedWorld(rules);
    const startHp = w.health.get(id)!.hp;

    let starts = 0;
    for (let i = 0; i < 4; i++) {
      step(w);
      starts += w.events.filter((e) => e.type === "fireRingStart").length;
      expect(ringDmg(w, id)).toBe(0);
    }
    expect(starts).toBe(0);
    expect(w.health.get(id)!.hp).toBe(startHp);

    // tick 5 = startTicks: ignition beat, radius still == the zone boundary, so
    // the champion at the centre (and anyone the collision system allowed) is safe
    step(w);
    expect(w.events.filter((e) => e.type === "fireRingStart")).toHaveLength(1);
    expect(ringDmg(w, id)).toBe(0);
    expect(currentFireRingRadius(w)).toBe(ZONE_R);

    step(w);
    expect(w.events.filter((e) => e.type === "fireRingStart")).toHaveLength(0); // one-shot
  });
});

// ---------------------------------------------------------------- gating
describe("fire-ring gating (firering-gate)", () => {
  it("disarmed world is a pure no-op, and reads as the un-shrunk boundary", () => {
    cover("firering-gate");
    const w = new SimWorld(SKELETON_ARENA, 3);
    w.combatActive = true;
    const id = champAt(w, 0, 1, -40, 0);
    const startHp = w.health.get(id)!.hp;
    step(w, 20);
    expect(w.health.get(id)!.hp).toBe(startHp);
    expect(w.events.some((e) => e.type === "fireRingTick")).toBe(false);
    expect(currentFireRingRadius(w)).toBe(ZONE_R);
    expect(isBurnedByFireRing(w, id)).toBe(false);
  });

  it("armed but combatActive=false does not burn (settle stops the ring, #100)", () => {
    const rules = fireRingRulesFromConfig(
      { startSec: 1 * DT, shrinkSec: 1 * DT, minRadius: 0.5, burnCurve: [{ sec: 0, pctPerSec: 0.5 }, { sec: 9, pctPerSec: 0.5 }], maxPctPerSec: 1 },
      DT,
    );
    const w = new SimWorld(SKELETON_ARENA, 3);
    const id = champAt(w, 0, 1, -40, 0);
    beginCombatFireRing(w, rules);
    w.combatActive = false; // round settled
    const startHp = w.health.get(id)!.hp;
    step(w, 10);
    expect(w.health.get(id)!.hp).toBe(startHp); // clock never advanced, no burn
    expect(w.fireRingTicks).toBe(0);
    // and the radius FREEZES with the mechanic instead of shrinking on
    expect(currentFireRingRadius(w)).toBe(ZONE_R);
  });

  it("endCombatFireRing disarms and re-idles the system", () => {
    const rules = fireRingRulesFromConfig(
      { startSec: 1 * DT, shrinkSec: 2 * DT, minRadius: 0.5, burnCurve: [{ sec: 0, pctPerSec: 0.4 }, { sec: 9, pctPerSec: 0.4 }], maxPctPerSec: 1 },
      DT,
    );
    const { w, id } = armedWorld(rules);
    step(w, 4); // ignite + close + burn (the centre is outside a 0.5 ring)
    expect(w.health.get(id)!.hp).toBeLessThan(w.health.get(id)!.maxHp);
    endCombatFireRing(w);
    expect(w.fireRingRules).toBeNull();
    expect(w.fireRingTicks).toBe(-1);
    const hpAfterDisarm = w.health.get(id)!.hp;
    step(w, 10);
    expect(w.events.some((e) => e.type === "fireRingTick")).toBe(false);
    expect(w.health.get(id)!.hp).toBeGreaterThanOrEqual(hpAfterDisarm);
  });

  it("two same-seed armed worlds stay byte-identical (determinism)", () => {
    cover("firering-gate");
    const mk = (): SimWorld => {
      const rules = fireRingRulesFromConfig(
        { startSec: 2 * DT, shrinkSec: 30 * DT, minRadius: 0.5, maxPctPerSec: 1 },
        DT,
      );
      const { w } = armedWorld(rules, 4242);
      step(w, 30);
      return w;
    };
    expect(mk().digest()).toBe(mk().digest());
  });

  it("HARD CONSTRAINT: the burn NEVER routes through world.damageQueue", () => {
    cover("firering-gate");
    // A champion parked at the rim burns every shrink tick. The queue that feeds
    // armor/MR/shields/lifesteal/kill-credit must stay empty the whole time —
    // the ring applies hp directly and emits its own fireRingDamage event.
    const rules = fireRingRulesFromConfig(
      { startSec: 0, shrinkSec: 20, minRadius: 0.5, maxPctPerSec: 1 },
      DT,
    );
    const w = new SimWorld(SKELETON_ARENA, 9);
    w.combatActive = true;
    const c = SKELETON_ARENA.zones[0]!.center;
    const id = champAt(w, 0, 1, c.x, c.z + (ZONE_R - BODY_R - 0.05)); // near the rim
    beginCombatFireRing(w, rules);
    let sawBurn = false;
    for (let t = 0; t < 200; t++) {
      step(w);
      if (ringDmg(w, id) > 0) sawBurn = true;
      expect(w.damageQueue.length).toBe(0); // every tick, no exceptions
      if (!w.health.get(id)!.alive) break;
    }
    expect(sawBurn).toBe(true); // the burn really did happen (else the guard is vacuous)
  });
});

// ---------------------------------------------------------------- schema
describe("config.match@1 fireRing schedule (firering-config)", () => {
  const shipped = (): Record<string, unknown> =>
    JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
    ) as Record<string, unknown>;

  it("locks the OWNER'S numbers: 60 s ignition, a 20 s shrink to 0.5", () => {
    cover("firering-config");
    const parsed = zConfigMatchDoc.parse(shipped());
    // combatMaxSec MUST come down with startSec: at 240 the `fireRing` bed and
    // the minimap rim would cover 75% of combat and the `combat` bed's
    // B-section (#87/#109) would never play.
    expect(parsed.match.combatMaxSec).toBe(180);
    expect(parsed.match.fireRing).toEqual({
      startSec: 60,
      shrinkSec: 20,
      // 二段制 (owner 2026-08-02 「燃燒是二段制…第一段…起始於 60 秒；第二段燒到
      // 全地圖淹沒，起始於 90 秒」+「燒幾秒跟起始是幾秒，也可以在後台設定」)。
      // 60 起燃 → 80 停在半徑 4（站得住的口袋）→ 90 第二段 → 110 半徑 0。
      // ⚠️ 4.0 必須大於角色碰撞半徑 0.6，否則「停止縮圈」只是把處決延後 10 秒；
      //    行為守衛在 fireRingTwoStage.test.ts（這裡只釘數字）。
      stage1Radius: 4,
      stage2StartSec: 90,
      stage2ShrinkSec: 20,
      minRadius: 0,
      // 灼燒曲線 (owner 2026-08-02 「隨秒數越高越燒越痛」). `sec` 是**點燃之後**
      // 的秒數,所以它跟著 `startSec` 一起移動 —— 這是刻意的形狀:
      //   +0s  0.04/秒（剛點燃，還可以走位）
      //   +20s 0.2 /秒（＝火圈全閉的那一刻，combat 第 110 秒）
      //   +40s 1.0 /秒（被 maxPctPerSec 夾成 0.5/秒，combat 第 130 秒）
      // ⚠️ 2026-08-02 二次裁決把 `startSec` 從 60 改成 90，所以 `sec: 40`
      // **不再是「第 100 秒」**（現在是第 130 秒）。曲線本身沒有動,因為它綁的是
      // 「點燃之後多久」而不是「回合第幾秒」—— 那正是它該綁的東西。
      burnCurve: [
        { sec: 0, pctPerSec: 0.04 },
        { sec: 20, pctPerSec: 0.2 },
        { sec: 40, pctPerSec: 1 },
      ],
      // 燃燒真傷上限 (owner 2026-08-02 「可以把燃燒真傷上限數值設定放在後台，
      // 例如預設最高是50%之類，不必到100%」)。它**低於**上面曲線的最後一列，
      // 而那是刻意的：第 100 秒的 100 %/秒被夾成 50 %/秒，還是必死，只是要兩秒。
      maxPctPerSec: 0.5,
      // GH#287 — 免死擋不擋火圈。**出貨關 = 今天的行為**（火圈無視免死，燒到 0
      // 就是死），這是 owner 還沒表態的決策點，所以預設選「保留現況」的那一個。
      // 行為守衛在 `fireRingLethalSaveConfig.test.ts`（兩個方向 + 接線突變），
      // 這一行只釘出貨值 —— 它出現在這個 `toEqual` 裡正是下面那段註解說的理由：
      // 一個「schema 有、文件沒寫」的旋鈕會從比較窄的斷言底下溜過去。
      lethalSaveApplies: false,
      // #248 — 回合硬上限 5 分鐘 (owner 2026-08-01 「不管什麼條件，每回合最長
      // 上限就是 5 分鐘出現火圈準備收場，不會無限增加時間」). It is the CEILING
      // on the ignition tick that bounds the `boss` extension below; behaviour
      // is guarded in `roundHardCap.test.ts`, this line only pins the number.
      roundHardCapSec: 300,
      // #L1 — 殭屍王在場 → 回合延長 3 分鐘,火圈同步延後 3 分鐘 (owner
      // 2026-07-30). Pinned INSIDE this object rather than in its own `it`
      // because the whole point of `toEqual` here is that the shipped ring block
      // is exactly these keys and nothing else: a knob added to the schema but
      // never authored into the doc would slip past a narrower assertion.
      boss: { extendCombatSec: 180, delayFireRingSec: 180 },
    });
    // backstop left after the WHOLE ring (BOTH stages) has closed. ⚠️ Reading
    // `shrinkSec` here would only cover 第一段 and would go on passing while the
    // second stage ran past the backstop — the very drift `ringFullCloseSec`
    // exists to have one answer to.
    expect(ringFullCloseSec(parsed.match.fireRing!)).toBe(50); // 30 s gap + 20 s
    expect(
      parsed.match.fireRing!.startSec + ringFullCloseSec(parsed.match.fireRing!),
    ).toBeLessThanOrEqual(parsed.match.combatMaxSec);

    const rules = fireRingRulesFromConfig(parsed.match.fireRing!, DT);
    expect(rules.startTicks).toBe(1800);
    expect(rules.shrinkTicks).toBe(600);
    expect(rules.stage1Radius).toBe(4);
    expect(rules.stage2GapTicks).toBe(900); // 90 − 60 = 30 s, stored as a GAP
    expect(rules.stage2ShrinkTicks).toBe(600);
    expect(rules.minRadius).toBe(0);
  });

  it("an absent fireRing block still validates (optional + additive)", () => {
    const doc = shipped();
    delete (doc.match as Record<string, unknown>).fireRing;
    expect(() => zConfigMatchDoc.parse(doc)).not.toThrow();
  });

  it("rejects a ring that could not FINISH CLOSING before the hard backstop", () => {
    const doc = shipped();
    // 60 + 20 = 80 > 70: ignition fits, the shrink does not. Ignition alone is
    // not enough — a ring still closing when the phase force-ends finishes nobody.
    (doc.match as Record<string, unknown>).combatMaxSec = 70;
    expect(() => zConfigMatchDoc.parse(doc)).toThrow(/startSec/);
  });

  it("drops the retired staircase fields loudly (.strict)", () => {
    cover("firering-config");
    const doc = shipped();
    (doc.match as { fireRing: Record<string, unknown> }).fireRing.stepSec = 1;
    expect(() => zConfigMatchDoc.parse(doc)).toThrow();
  });

  /**
   * THE CUE FORMULA, PROVEN AGAINST THE SIM'S OWN TICK MATH.
   *
   * The client never sees combat-ELAPSED time; the HUD carries
   * `phaseSecondsLeft`, counting DOWN from `combatMaxSec`. So every client-side
   * cue for the ring (`apps/client/src/audio/fireRingWindow.ts`: the tension BGM
   * bed and the minimap danger rim) is driven by
   *
   *     secondsLeftAtIgnition = combatMaxSec - fireRing.startSec
   *
   * #195 moved BOTH numbers (240/180 → 100/60), which is exactly the situation
   * that produced #132's silent 30-second cue drift. Nothing about the
   * derivation inverts — it is asserted here from the TICK side so the client's
   * arithmetic is checked against the sim's, not merely against itself.
   */
  it("ignites with exactly (combatMaxSec - startSec) seconds left — the client's cue formula", () => {
    cover("firering-config");
    const parsed = zConfigMatchDoc.parse(shipped());
    const combatMaxTicks = Math.round(parsed.match.combatMaxSec * 30);
    const rules = fireRingRulesFromConfig(parsed.match.fireRing!, DT);
    const ticksLeftAtIgnition = combatMaxTicks - rules.startTicks;
    expect(ticksLeftAtIgnition / 30).toBe(
      parsed.match.combatMaxSec - parsed.match.fireRing!.startSec,
    );
    // ⚠️ 這個數字**只是出貨值的釘子**，上面那條 `combatMaxSec - startSec` 才是
    // 不變量（推導本身沒有反轉）。owner 2026-08-02 二次裁決把窗口從 40 秒拉到
    // 90 秒（`startSec 60→90`、`combatMaxSec 100→180`，配 `maxHealth 4→5`）——
    // 理由是實測 480 場/格證明：互殺% ≈ P(TTK < 火圈死線)、<60s% = P(TTK < 60s)，
    // **兩個門檻只差 20 秒**，單靠 maxHealth（乘法縮放整條分佈）永遠分不開它們。
    // 要動的是那個窗口本身。
    //
    // ⚠️ 順帶一個沒有守衛的下游事實：`minRadius 0.5 < bodyRadius 0.6`，
    // 所以火圈全閉（90+20=110s）之後全場沒有站得住的位置。窗口拉長不會改變
    // 這一點，只是把它往後推了 30 秒。owner 知道並接受（2026-08-02:
    //「現在這樣很好，不需要硬撐到 100% 真傷」）。
    expect(ticksLeftAtIgnition / 30).toBe(120);
  });
});
