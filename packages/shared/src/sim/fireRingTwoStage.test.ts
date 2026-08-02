/**
 * 火圈二段制 —— THE BEHAVIOURAL GUARD (owner 2026-08-02).
 *
 *   「燃燒是二段制，第一段燒 20 秒就停止縮圈，起始於 60 秒；
 *     第二段燒到全地圖淹沒，起始於 90 秒」
 *   「第一、第二段燒幾秒跟起始是幾秒，也可以在後台設定」
 *
 * WHAT THIS FILE REFUSES TO DO, AND WHY (CLAUDE.md 的七種失敗形態):
 *
 *  · IT NEVER ASSERTS ON `FireRingRules` FIELDS AS THE CLAIM. Every timeline
 *    assertion steps a real `SimWorld` and reads `currentFireRingRadius` — the
 *    same function `snapshot.ts` puts on the wire — so 「圈停住了」 is measured
 *    where a player would feel it, not where the author typed it (⑦).
 *  · IT NEVER HARD-CODES 0.6 AS THE BODY RADIUS. The pocket assertion spawns a
 *    real champion through `spawnChampion` and reads the radius back off
 *    `world.transform`, because the claim is 「a body fits」, and a literal would
 *    keep passing if champions ever got wider (⑤: the thing under test must be
 *    the thing that ships).
 *  · IT NEVER READS THE FOUR NUMBERS FROM A CONSTANT. They come out of
 *    `content/config/config.match.json` through the real Zod schema, so editing
 *    the SHIPPED file — the thing the operator and the admin console actually
 *    write — is what turns these red (⑥).
 *  · THE HOLD IS ASSERTED AS A HOLD. 「80–90 秒之間半徑一格都不動」 is checked
 *    tick by tick across the whole window, not as two equal samples: a law that
 *    dipped and came back would pass the sampled version (④).
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
  fireRingRadius,
  fireRingRulesFromConfig,
  isBurnedByFireRing,
  ringFullCloseSec,
  DEFAULT_STAGE1_RADIUS,
  DEFAULT_STAGE2_SHRINK_SEC,
  type FireRingConfigLike,
} from "./fireRing";
import { zConfigMatchDoc, type FireRingConfig } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const TAG = "firering-two-stage";
const HZ = 30;
const DT = 1 / HZ;
const ZONE_R = 24; // SKELETON_ARENA zone 0 boundaryRadius (asserted below)

/** The SHIPPED doc, raw. Editing the JSON is what must break these tests. */
const shippedRaw = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
  ) as Record<string, unknown>;

const shippedMatch = (): ReturnType<typeof zConfigMatchDoc.parse>["match"] =>
  zConfigMatchDoc.parse(shippedRaw()).match;

/** Parse a doc whose `match.fireRing` has been patched. */
function patched(patch: Record<string, unknown>): ReturnType<typeof zConfigMatchDoc.parse>["match"] {
  const doc = shippedRaw();
  const m = doc.match as Record<string, unknown>;
  m.fireRing = { ...(m.fireRing as Record<string, unknown>), ...patch };
  return zConfigMatchDoc.parse(doc).match;
}

interface Armed {
  w: SimWorld;
  hero: EntityId;
}

/**
 * Live combat armed with a real ring, one champion at `dist` from the zone
 * centre. `dist: 0` = the pocket; `dist: 20` = out where the ring reaches early.
 */
function armed(ring: FireRingConfig | FireRingConfigLike, combatMaxSec: number, dist = 0): Armed {
  const w = new SimWorld(SKELETON_ARENA, 7);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const hero = spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(1),
    pos: { x: c.x + dist, z: c.z },
    zone: 0,
  });
  beginCombatFireRing(w, fireRingRulesFromConfig(ring, DT, combatMaxSec));
  return { w, hero };
}

/** Advance to combat-elapsed second `sec` (absolute, never relative). */
function stepToSec(w: SimWorld, sec: number): void {
  const target = Math.round(sec * HZ);
  for (let t = w.fireRingTicks; t < target; t++) w.step(new Map());
}

/** Radius at combat second `sec`, from a freshly armed world (no history). */
function radiusAtSec(ring: FireRingConfig | FireRingConfigLike, max: number, sec: number): number {
  const { w } = armed(ring, max);
  stepToSec(w, sec);
  return currentFireRingRadius(w);
}

/** Ring damage dealt to `id` this tick. */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}

// ═════════════════════════════════════════════ ① 出貨的四個數字就是後台的四格
describe(`${TAG} — 出貨的四個數字（讀出貨 JSON，不是程式常數）`, () => {
  it("60 / 20 / 90 / 20，而且口袋 4.0、終點 0", () => {
    cover(TAG);
    const fr = shippedMatch().fireRing!;
    expect(fr.startSec).toBe(60); // ① 第一段起始
    expect(fr.shrinkSec).toBe(20); // ② 第一段縮多久
    expect(fr.stage2StartSec).toBe(90); // ③ 第二段起始
    expect(fr.stage2ShrinkSec).toBe(20); // ④ 第二段縮多久
    expect(fr.stage1Radius).toBe(4); // 停止縮圈的口袋
    expect(fr.minRadius).toBe(0); // 全地圖淹沒
    // 整個圈從點燃到淹沒 = (90−60) + 20 = 50 秒, and it fits inside the backstop.
    expect(ringFullCloseSec(fr)).toBe(50);
    expect(fr.startSec + ringFullCloseSec(fr)).toBeLessThanOrEqual(shippedMatch().combatMaxSec);
    // the arena the ring closes inside, asserted rather than assumed
    expect(SKELETON_ARENA.zones[0]!.boundaryRadius).toBe(ZONE_R);
  });
});

// ═══════════════════════════════════════════════ ② 時間軸：真的 step，真的量
describe(`${TAG} — 時間軸（真 world、真 tick、量半徑）`, () => {
  it("60 秒前不縮 · 60→80 在縮 · 80→90 一格都不動 · 90 之後又縮 · 110 到 0", () => {
    cover(TAG);
    const m = shippedMatch();
    const ring = m.fireRing!;
    const at = (sec: number): number => radiusAtSec(ring, m.combatMaxSec, sec);

    // ── before ignition: the ring IS the boundary ──────────────────────────
    expect(at(0)).toBe(ZONE_R);
    expect(at(59)).toBe(ZONE_R);
    expect(at(60)).toBe(ZONE_R); // ignition tick itself: appeared, not yet moved

    // ── 第一段 (60 → 80): strictly shrinking, ending exactly at the pocket ──
    expect(at(61)).toBeLessThan(ZONE_R);
    expect(at(70)).toBeCloseTo(24 + (4 - 24) * 0.5, 9); // = 14, half way
    expect(at(70)).toBeLessThan(at(61));
    expect(at(80)).toBeCloseTo(ring.stage1Radius!, 9);

    // ── 「停止縮圈」 (80 → 90): NOT A SAMPLE — every tick in the window ─────
    const { w } = armed(ring, m.combatMaxSec);
    stepToSec(w, 80);
    const held = currentFireRingRadius(w);
    expect(held).toBeCloseTo(ring.stage1Radius!, 9);
    for (let t = 80 * HZ; t < 90 * HZ; t++) {
      w.step(new Map());
      expect(currentFireRingRadius(w), `radius moved at tick ${w.fireRingTicks}`).toBe(held);
    }
    expect(w.fireRingTicks).toBe(90 * HZ);

    // ── 第二段 (90 → 110): closing again, all the way to 全地圖淹沒 ─────────
    w.step(new Map());
    expect(currentFireRingRadius(w)).toBeLessThan(held); // it MOVED again
    expect(at(100)).toBeCloseTo(4 + (0 - 4) * 0.5, 9); // = 2, half way
    expect(at(110)).toBe(0); // 全地圖淹沒 — really 0, not 「small」
    expect(at(150)).toBe(0); // and it stays there (clamped, never negative)
  });

  it("停止縮圈的那 10 秒**不是**停止燃燒 —— 圈外的人照樣在掉血", () => {
    cover(TAG);
    const m = shippedMatch();
    // parked at 20 u from the centre: outside the ring from early in 第一段.
    const { w, hero } = armed(m.fireRing!, m.combatMaxSec, 20);
    stepToSec(w, 82); // inside the breather
    expect(currentFireRingRadius(w)).toBeCloseTo(m.fireRing!.stage1Radius!, 9);

    // ⚠️ HP IS PINNED TO FULL EVERY TICK. Without it the champion is long dead
    // by second 82 (he has been outside since ~61 s) and 「zero ring damage」
    // would be measured on a corpse — an assertion that passes for the wrong
    // reason, which is the whole point of ④. Pinning keeps the question 「does
    // the ring still bite during the breather?」 instead of 「is he alive?」.
    let burningTicks = 0;
    let dealt = 0;
    for (let t = 82 * HZ; t < 88 * HZ; t++) {
      const h = w.health.get(hero)!;
      h.hp = h.maxHp;
      h.alive = true;
      w.step(new Map());
      if (isBurnedByFireRing(w, hero)) burningTicks++;
      dealt += ringDmg(w, hero);
    }
    // 6 s × 30 Hz, every single tick, with real HP coming off.
    expect(burningTicks).toBe(6 * HZ);
    expect(dealt).toBeGreaterThan(0);
  });
});

// ═══════════════════════ ③ 口袋真的站得住 —— 這一條是整個設計的重點
describe(`${TAG} — 第一段停下來的半徑真的站得住`, () => {
  it("拿真的角色碰撞半徑比，而且站在口袋裡的人整段喘息期都沒被燒", () => {
    cover(TAG);
    const m = shippedMatch();
    const { w, hero } = armed(m.fireRing!, m.combatMaxSec, 0);

    // THE REAL body radius, off the spawned entity — not a literal.
    const body = w.transform.get(hero)!.radius;
    expect(body).toBeGreaterThan(0);
    // 「站得住」 = whole-body-inside is satisfiable at all: inner > 0.
    expect(m.fireRing!.stage1Radius!).toBeGreaterThan(body);
    // …and the same arithmetic said the OPPOSITE about the terminal radius,
    // which is what 「全地圖淹沒」 means. (This is the defect 二段制 fixes: the
    // single-stage ring went straight here.)
    expect(m.fireRing!.minRadius).toBeLessThan(body);

    // BEHAVIOUR, not geometry: run the whole 「停止縮圈」 window and assert the
    // man in the pocket is never burned and never loses HP to the ring.
    stepToSec(w, 79);
    let burnt = 0;
    let dealt = 0;
    for (let t = 79 * HZ; t < 90 * HZ; t++) {
      w.step(new Map());
      if (isBurnedByFireRing(w, hero)) burnt++;
      dealt += ringDmg(w, hero);
    }
    expect(burnt).toBe(0);
    expect(dealt).toBe(0);

    // …and 第二段 does take the pocket away from the very same champion, at the
    // very same position: the ring crosses his body radius partway through
    // stage 2 and from then on he burns.
    stepToSec(w, 108);
    expect(isBurnedByFireRing(w, hero)).toBe(true);
    const hpBefore = w.health.get(hero)!.hp;
    let dealtLate = 0;
    for (let i = 0; i < HZ; i++) {
      w.step(new Map());
      dealtLate += ringDmg(w, hero);
    }
    expect(dealtLate).toBeGreaterThan(0);
    expect(w.health.get(hero)!.hp).toBeLessThan(hpBefore);
  });

  it("把口袋收到身體以下，喘息期立刻不存在了 —— 這一格不是裝飾", () => {
    cover(TAG);
    const m = shippedMatch();
    // 0.5 was the single-stage `minRadius`; as a POCKET it is under a body.
    const broken = patched({ stage1Radius: 1 }).fireRing!;
    const { w, hero } = armed({ ...broken, stage1Radius: 0.5 }, m.combatMaxSec, 0);
    stepToSec(w, 85);
    expect(isBurnedByFireRing(w, hero)).toBe(true); // no pocket → burning
    // control: the shipped pocket, same tick, same position → not burning.
    const ok = armed(m.fireRing!, m.combatMaxSec, 0);
    stepToSec(ok.w, 85);
    expect(isBurnedByFireRing(ok.w, ok.hero)).toBe(false);
  });
});

// ══════════════════════════ ④ 四格各自的突變：改一格，行為就變
describe(`${TAG} — 四個欄位各自都是 load-bearing`, () => {
  const m = () => shippedMatch();

  it("① 第一段起始：改 60→100，60→80 那段就完全不縮", () => {
    cover(TAG);
    // combatMaxSec 180 still fits 100 + 50 = 150.
    const late = patched({ startSec: 100, stage2StartSec: 130 }).fireRing!;
    expect(radiusAtSec(late, 180, 70)).toBe(ZONE_R);
    expect(radiusAtSec(m().fireRing!, 180, 70)).toBeLessThan(ZONE_R);
  });

  it("② 第一段縮多久：改 20→10，第 70 秒就已經停在口袋了", () => {
    cover(TAG);
    const fast = patched({ shrinkSec: 10 }).fireRing!;
    expect(radiusAtSec(fast, 180, 70)).toBeCloseTo(fast.stage1Radius!, 9);
    expect(radiusAtSec(m().fireRing!, 180, 70)).toBeGreaterThan(m().fireRing!.stage1Radius! + 1);
  });

  it("③ 第二段起始：改 90→120，第 100 秒的圈還停在口袋", () => {
    cover(TAG);
    const later = patched({ stage2StartSec: 120 }).fireRing!;
    expect(radiusAtSec(later, 180, 100)).toBeCloseTo(later.stage1Radius!, 9);
    expect(radiusAtSec(m().fireRing!, 180, 100)).toBeLessThan(m().fireRing!.stage1Radius!);
  });

  it("④ 第二段縮多久：改 20→60，第 110 秒還沒淹沒", () => {
    cover(TAG);
    const slow = patched({ stage2ShrinkSec: 60 }).fireRing!;
    expect(radiusAtSec(slow, 180, 110)).toBeGreaterThan(0);
    expect(radiusAtSec(slow, 180, 150)).toBe(0);
    expect(radiusAtSec(m().fireRing!, 180, 110)).toBe(0);
  });
});

// ═════════════════════════════════════════════════ ⑤ Zod：上下界與跨欄位規則
describe(`${TAG} — schema 擋得住的錯`, () => {
  it("第二段比第一段收完更早 → 擋下，而且指名那一格", () => {
    cover(TAG);
    const doc = shippedRaw();
    (doc.match as { fireRing: Record<string, unknown> }).fireRing.stage2StartSec = 70; // < 60+20
    expect(() => zConfigMatchDoc.parse(doc)).toThrow(/stage2StartSec/);
  });

  it("兩段加起來超過硬底線 → 擋下（舊算式只看第一段會放行）", () => {
    cover(TAG);
    const doc = shippedRaw();
    // 60 + 20 = 80 <= 100 → the PRE-二段制 formula would have said OK.
    // The real ring runs to 90 + 20 = 110 > 100 → must be rejected.
    (doc.match as Record<string, unknown>).combatMaxSec = 100;
    // ⚠️ 殭屍王的延長開大，好讓**只有**「圈收不完」那一條會 fire。
    // 不這樣做的話 boss 那條（它也用 `ringFullCloseSec`）會一起 fire，
    // 於是 `.toThrow()` 對「硬底線那一條被改回舊算式」完全無感
    // ——實測過：那個突變會存活。斷言要指名 issue 的**路徑**。
    (doc.match as { fireRing: { boss: Record<string, unknown> } }).fireRing.boss.extendCombatSec = 300;
    const res = zConfigMatchDoc.safeParse(doc);
    expect(res.success).toBe(false);
    const paths = res.success ? [] : res.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("match.fireRing.startSec"); // 「圈收不完」那一條的 path
    // and the same doc with the second stage pulled in DOES pass, so the
    // rejection above is about the ring's length and not about the number 100.
    const ok = shippedRaw();
    (ok.match as Record<string, unknown>).combatMaxSec = 100;
    const fr = (ok.match as { fireRing: Record<string, unknown> }).fireRing;
    fr.stage2StartSec = 80;
    fr.stage2ShrinkSec = 20;
    expect(() => zConfigMatchDoc.parse(ok)).not.toThrow();
  });

  it("回合硬上限也要放得下整個圈，不只第一段", () => {
    cover(TAG);
    const doc = shippedRaw();
    // 60 + 20 = 80 <= 100 (old formula OK); 60 + 50 = 110 > 100 → rejected.
    (doc.match as { fireRing: Record<string, unknown> }).fireRing.roundHardCapSec = 100;
    expect(() => zConfigMatchDoc.parse(doc)).toThrow(/roundHardCapSec/);
  });

  it("口袋半徑有上下界：0.5（比身體小）與 30（比場地大）都被擋", () => {
    cover(TAG);
    for (const bad of [0.5, 30]) {
      const doc = shippedRaw();
      (doc.match as { fireRing: Record<string, unknown> }).fireRing.stage1Radius = bad;
      expect(() => zConfigMatchDoc.parse(doc), `stage1Radius ${bad}`).toThrow(/stage1Radius/);
    }
  });
});

// ═════════════════════════════ ⑥ 相容性：二段制之前的設定不可以變成非法
describe(`${TAG} — 二段制之前的設定仍然合法，而且行為逐 tick 不變`, () => {
  /**
   * ⚠️ THE REASON THIS TEST EXISTS IS A DEPLOY LANDMINE, NOT TIDINESS.
   * The durable admin overlay (data/, task #189) can already hold a
   * `config/config.match` doc written before 二段制 existed, and it SHADOWS
   * `content/`. A doc the loader rejects does not fail-safe itself — it discards
   * THE WHOLE OVERLAY LAYER (see apps/platform/internal/contentoverlay/validate.go).
   * So 「任何在這次改動前合法的文件，改動後仍然合法」 is a hard invariant, and
   * this is where it is nailed down.
   */
  const legacyDoc = (): Record<string, unknown> => {
    const doc = shippedRaw();
    const m = doc.match as Record<string, unknown>;
    m.combatMaxSec = 100; // the value shipped before 2026-08-02
    m.fireRing = {
      startSec: 60,
      shrinkSec: 20,
      minRadius: 0.5,
      burnCurve: [
        { sec: 0, pctPerSec: 0.04 },
        { sec: 20, pctPerSec: 0.2 },
        { sec: 40, pctPerSec: 1 },
      ],
      maxPctPerSec: 0.5,
      roundHardCapSec: 300,
      boss: { extendCombatSec: 180, delayFireRingSec: 180 },
    };
    return doc;
  };

  it("沒有 stage2 欄位的舊文件照樣過 Zod（否則整層覆蓋會被丟掉）", () => {
    cover(TAG);
    const parsed = zConfigMatchDoc.parse(legacyDoc());
    expect(parsed.match.fireRing!.stage2StartSec).toBeUndefined();
    expect(parsed.match.fireRing!.stage1Radius).toBeUndefined();
    // and the length formula degenerates to the pre-二段制 one, so every
    // cross-field refine sees exactly the number it saw before.
    expect(ringFullCloseSec(parsed.match.fireRing!)).toBe(20);
  });

  it("而且它跑的是單段的舊法則 —— 逐 tick 對得上", () => {
    cover(TAG);
    const legacy = zConfigMatchDoc.parse(legacyDoc()).match.fireRing!;
    const rules = fireRingRulesFromConfig(legacy, DT, 100);
    // 二段制 OFF is expressed as ONE thing, not a flag: pocket == terminal and
    // no second shrink, so the law has no branch left to take.
    expect(rules.stage1Radius).toBe(rules.minRadius);
    expect(rules.stage2ShrinkTicks).toBe(0);
    // The pre-二段制 law, recomputed here independently, tick for tick.
    for (const k of [0, 1, 150, 300, 599, 600, 601, 5000]) {
      const want =
        k <= 0 ? ZONE_R : ZONE_R + (0.5 - ZONE_R) * (Math.min(k, 600) / 600);
      expect(fireRingRadius(rules, k, ZONE_R), `k=${k}`).toBeCloseTo(want, 12);
    }
  });

  it("手工組的 fixture（不走 Zod）也一樣退回單段", () => {
    cover(TAG);
    const rules = fireRingRulesFromConfig({ startSec: 1, shrinkSec: 1, minRadius: 0.5 }, DT);
    expect(rules.stage1Radius).toBe(0.5);
    expect(rules.stage2ShrinkTicks).toBe(0);
    expect(fireRingRadius(rules, 30, ZONE_R)).toBeCloseTo(0.5, 12);
    expect(fireRingRadius(rules, 3000, ZONE_R)).toBeCloseTo(0.5, 12);
  });

  it("只填 stage2StartSec，其他兩格用出貨預設（一格都不用抄）", () => {
    cover(TAG);
    const rules = fireRingRulesFromConfig(
      { startSec: 60, shrinkSec: 20, stage2StartSec: 90, minRadius: 0 },
      DT,
    );
    expect(rules.stage1Radius).toBe(DEFAULT_STAGE1_RADIUS);
    expect(rules.stage2ShrinkTicks).toBe(DEFAULT_STAGE2_SHRINK_SEC * HZ);
  });

  /**
   * ⚠️ 這一條是補一個**突變存活**的洞。把 `fireRingRulesFromConfig` 的
   * `authoredTail` 下限從「整個圈」改回「只有第一段」，整套 roundHardCap 測試
   * 依然全綠 —— 因為出貨設定的 tail（120 秒）本來就遠大於兩者，這條下限在
   * 出貨路徑上永遠不會 fire。
   *
   * 它會 fire 的是**繞過 Zod 的呼叫端**，而那不是假想的：
   * `MatchController.fireRingForRound()` 在決賽輪把 `startSec` 換成
   * `ROYALE_FIRE_RING_START_SEC`（180），而 `combatMaxSec` 沒有跟著動 ——
   * tail 於是變成 0，硬上限一旦生效就會在圈還在縮的時候強制結束回合
   * （失敗形態 ①：玩家看不到被承諾的收場）。
   */
  it("繞過 Zod 的呼叫端：tail 比整個圈短時，硬上限仍留得下整個圈", () => {
    cover(TAG);
    const rules = fireRingRulesFromConfig(
      {
        startSec: 180, // ROYALE_FIRE_RING_START_SEC 的形狀
        shrinkSec: 20,
        stage2StartSec: 210,
        stage2ShrinkSec: 20,
        stage1Radius: 4,
        minRadius: 0,
        roundHardCapSec: 300,
      },
      DT,
      180, // tail = 180 − 180 = 0 秒
    );
    const fullClose = rules.stage2GapTicks + rules.stage2ShrinkTicks;
    expect(fullClose).toBe(50 * HZ);
    // 兩個天花板之間的距離就是 tail，而它必須放得下**整個**圈，不是只有第一段。
    expect(rules.hardDeadlineTicks - rules.hardCapTicks).toBeGreaterThanOrEqual(fullClose);
  });

  it("手工組出「第二段比第一段早」時 sim 夾住（Zod 管不到的呼叫端）", () => {
    cover(TAG);
    const rules = fireRingRulesFromConfig(
      { startSec: 60, shrinkSec: 20, stage2StartSec: 65, stage2ShrinkSec: 10, minRadius: 0 },
      DT,
    );
    // floored at shrinkTicks — the pocket is never skipped by a Zod-free caller
    expect(rules.stage2GapTicks).toBe(rules.shrinkTicks);
    expect(fireRingRadius(rules, rules.shrinkTicks, ZONE_R)).toBe(rules.stage1Radius);
  });
});
