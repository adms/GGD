/**
 * 格擋 — THE MECHANISM, proved on real packets through a real `world.step()`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE ASSERTIONS AND NOT OTHERS
 *
 * Every case here pushes a real `DamagePacket` onto `world.damageQueue`, runs a
 * real tick, and then reads FINAL state — `health.hp`, the amounts left on
 * `health.shields`, the emitted `damage` event, and `world.rng.state`. Nothing
 * asserts the SHAPE of a `BlockGrant` and nothing greps source (失敗形態 ⑥/⑦):
 * an implementation that stores the field perfectly and never subtracts it from
 * `dmg` must go red here, and it does (mutation record in the commit message).
 *
 * The four things that have to hold, in order of how expensive getting them
 * wrong would be:
 *
 *   1. AT ZERO IT DOES NOT EXIST. No block source ⇒ no rng draw, so every
 *      existing replay and digest stays bit-identical. This is asserted on
 *      `world.rng.state`, which is the only observable that would actually
 *      move — a "hp unchanged" assertion would pass even if the gate burned a
 *      draw on every packet in the game.
 *   2. IT REALLY STOPS DAMAGE, and the three shapes owner authored are three
 *      sets of field values rather than three code paths.
 *   3. IT IS NOT A SECOND SHIELD AND NOT A SECOND EVASION. A block does not
 *      spend the barrier, and a fully blocked hit STILL emits `damage` with
 *      `blocked: true` — that event is the client's entire 「擋下了」 channel.
 *   4. IT IS DETERMINISTIC AND BOUNDED. Deterministic ORDER (insertion, never a
 *      sort), one draw per QUALIFYING source, and `fraction` cannot heal you.
 *
 * ⚠️ 2026-07-31 更正(第三守則):第 4 條本來寫「One draw per packet no matter how
 * many block items you carry (max-not-sum)」。owner 推翻了 max ——
 *
 *   「這種情形應該是獨立判斷兩次,拿第一次檔掉剩餘繼續算下一次」
 *
 * 所以現在是**鏈式獨立判定**:每個合格來源各抽各的,剩餘往下傳,兩件 30% 全額
 * 格擋 = 51%。舊的 max 行為保留成 `blockRules.stacking: "best"`,⑥ 兩邊都測。
 * 那一段舊文字如果留著,下一個讀者會相信它,然後照它去寫程式。
 *
 * The SHIPPED docs are driven separately in `block.shipped.test.ts` — 失敗形態
 * ⑤ (被測的不是出貨的那個) is a distinct failure and needs its own file.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { apDamageMult } from "./apDamageScaling";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Rng } from "../math/rng";
import { attachSource } from "../stats/statPipeline";
import { zeroStats } from "../stats/statTypes";
import { addShield } from "./damage";
import { blockCutFor, type BlockGrant } from "./block";
import {
  BLOCK_SCHEMA,
  BLOCK_STACKINGS,
  DEFAULT_BLOCK_RULES,
  blockRulesFromDoc,
  type BlockStacking,
} from "../blockRules";
import { zConfigBlockDoc, zConfigDoc } from "../../content/schema/config";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { DamageType } from "../effects/effect";
import type { IntentFrame } from "../intents";

beforeAll(() => registerSkeletonContent()); // synchronous; no async, so no 10 s hook to blow

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14; // pillar-free band, same as shieldAbsorb.test.ts

interface Rig {
  world: SimWorld;
  attacker: EntityId;
  victim: EntityId;
}

/**
 * Two bodies, and a victim whose `StatsComp.final` is ALL ZEROES.
 *
 * ⚠️ The zeroed block is the point, not laziness. `mitigate()` reads
 * `final[Armor]` / `final[MagicResist]`, so with 0 in both the post-mitigation
 * `impact` equals the packet amount EXACTLY — which means every number below is
 * a statement about the block and cannot be satisfied by a resist difference.
 * The victim still needs a real `StatsComp` because that is where
 * `attachSource` puts the source `blockCutFor` scans (the same place an equipped
 * item's source lands, via `economy/itemSource.ts`).
 */
function rig(seed = 20260801): Rig {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const spawn = (x: number, seat: number, team: number, hp: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: LANE_Z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, { hp, maxHp: 5000, mana: 400, maxMana: 400, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    world.stats.set(id, {
      championId: "fixture" as ChampionId,
      final: zeroStats(),
      dirty: false,
      sources: [],
    });
    return id;
  };
  const attacker = spawn(Z0.center.x, 0, 0, 5000);
  const victim = spawn(Z0.center.x + 3, 1, 1, 1000);
  world.rebuildGrid();
  return { world, attacker, victim };
}

/** Attach a block source the way an equipped item's source arrives. */
function giveBlock(r: Rig, block: BlockGrant, id = "item:fixture#0"): void {
  attachSource(r.world, r.victim, { id, kind: "item", block });
}

interface Outcome {
  /** HP the victim actually lost this tick. */
  hpLoss: number;
  /** absorb left in each surviving pool, in `health.shields` order. */
  poolsLeft: number[];
  /** the `damage` event, or undefined when none was emitted at all. */
  damageEvent: Record<string, unknown> | undefined;
  /** how many `Rng.next()` draws the whole tick consumed. */
  draws: number;
}

/** Count how many `next()` calls move `from` to `to` (bounded, so a runaway fails). */
function drawsBetween(from: number, to: number, max = 64): number {
  const probe = new Rng(from);
  for (let n = 0; n <= max; n++) {
    if (probe.state === to) return n;
    probe.next();
  }
  return -1;
}

/** Queue one packet, run ONE real tick, and report what the world looks like. */
function hit(r: Rig, amount: number, type: DamageType, origin = "ability:test.block"): Outcome {
  const hp = r.world.health.get(r.victim)!;
  const before = hp.hp;
  const rngBefore = r.world.rng.state;
  r.world.damageQueue.push({
    source: r.attacker,
    target: r.victim,
    amount,
    type,
    crit: false,
    origin,
  });
  r.world.step(NO_INTENTS);
  // `SimWorld.step` clears `events` on entry, so after the tick the array holds
  // exactly this tick's emissions — no windowing needed.
  const ev = r.world.events.find(
    (e) => e.type === "damage" && Number((e.data as { target: number }).target) === r.victim,
  );
  return {
    hpLoss: before - hp.hp,
    poolsLeft: hp.shields.map((s) => s.amount),
    damageEvent: ev?.data as Record<string, unknown> | undefined,
    draws: drawsBetween(rngBefore, r.world.rng.state),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 — ① THE ZERO GUARANTEE (a source that is not there costs nothing)", () => {
  it("no block source ⇒ full damage AND not one rng draw", () => {
    const r = rig();
    const out = hit(r, 200, "physical");
    expect(out.hpLoss).toBe(200);
    // THE assertion that matters: the seeded stream did not move. `hpLoss` alone
    // would stay green even if the gate rolled a die on every packet in the
    // game, and a spurious draw is exactly what desyncs a replay.
    expect(out.draws).toBe(0);
  });

  it("a block whose damageTypes exclude this packet costs no draw either", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["magic"], chance: 1, fraction: 1 });
    const out = hit(r, 200, "physical");
    expect(out.hpLoss).toBe(200);
    expect(out.draws).toBe(0);
  });

  it("a lethalOnly block costs no draw on a packet that would not kill", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1, lethalOnly: true });
    const out = hit(r, 200, "physical"); // victim has 1000 hp
    expect(out.hpLoss).toBe(200);
    expect(out.draws).toBe(0);
  });

  it("an EXPIRED block source is ignored (and costs no draw)", () => {
    const r = rig();
    attachSource(r.world, r.victim, {
      id: "buff:expired#0",
      kind: "buff",
      expiresAtTick: 0, // already lapsed at tick 0 (`expiresAtTick <= world.tick`)
      block: { damageTypes: ["physical"], chance: 1, fraction: 1 },
    });
    const out = hit(r, 200, "physical");
    expect(out.hpLoss).toBe(200);
    expect(out.draws).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 — ② the three shapes owner authored are three sets of VALUES", () => {
  it("奇門盾甲 shape: a full block of AD/AP leaves hp untouched", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical", "magic"], chance: 1, fraction: 1 });
    expect(hit(r, 300, "physical").hpLoss).toBe(0);
    expect(hit(r, 300, "magic").hpLoss).toBe(0);
  });

  it("「真實傷害無法阻擋」 falls out of damageTypes, not out of an `if`", () => {
    const r = rig();
    // The SAME grant as above. Nothing in the sim names "true"; the clause is
    // expressed by the type simply not being in the array.
    giveBlock(r, { damageTypes: ["physical", "magic"], chance: 1, fraction: 1 });
    expect(hit(r, 300, "true").hpLoss).toBe(300);
  });

  it("黃金聖鬥衣 shape: magic-only lets the physical hit through", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["magic"], chance: 1, fraction: 1 });
    expect(hit(r, 300, "magic").hpLoss).toBe(0);
    expect(hit(r, 300, "physical").hpLoss).toBe(300);
  });

  it("a PARTIAL block removes exactly `fraction` and lets the rest land", () => {
    const r = rig();
    // The reading owner did NOT pick for 奇門盾甲 — kept expressible so flipping
    // it is two numbers on the admin page, not a code change (第一守則).
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 });
    expect(hit(r, 300, "physical").hpLoss).toBeCloseTo(150, 9);
  });

  it("格擋 applies to BASIC attacks too — unlike the ability-only evasion channel", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1 });
    expect(hit(r, 300, "physical", "basic").hpLoss).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 — ③ 抵擋致命一擊 (the death save)", () => {
  const SAVE: BlockGrant = {
    damageTypes: ["physical", "magic", "true"],
    chance: 1,
    fraction: 1,
    lethalOnly: true,
  };

  it("a survivable hit lands in full; the killing hit is stopped whole", () => {
    const r = rig();
    giveBlock(r, SAVE);
    expect(hit(r, 400, "physical").hpLoss).toBe(400); // 1000 -> 600, survivable
    const lethal = hit(r, 5000, "physical"); // 5000 > 600 remaining
    expect(lethal.hpLoss).toBe(0);
    expect(r.world.health.get(r.victim)!.alive).toBe(true);
    expect(r.world.health.get(r.victim)!.hp).toBe(600);
  });

  it("it fires on TRUE damage too — owner wrote the 真傷 carve-out only on 奇門盾甲", () => {
    const r = rig();
    giveBlock(r, SAVE);
    expect(hit(r, 5000, "true").hpLoss).toBe(0);
  });

  it("a barrier that would have eaten the hit means it was never lethal (default basis)", () => {
    const r = rig();
    giveBlock(r, SAVE);
    addShield(r.world, r.victim, 4000, 5, "fixture");
    const out = hit(r, 2000, "physical"); // 2000 < 1000 hp + 4000 shield
    expect(out.hpLoss).toBe(0); // the SHIELD paid…
    expect(out.poolsLeft).toEqual([2000]); // …and it really was spent
    expect(out.draws).toBe(0); // …without the save even rolling
  });

  it("lethalBasis:'hp' is the literal 「現存生命」 reading, and it changes the answer", () => {
    const r = rig();
    giveBlock(r, { ...SAVE, lethalBasis: "hp" });
    addShield(r.world, r.victim, 4000, 5, "fixture");
    const out = hit(r, 2000, "physical"); // 2000 > 1000 hp, ignoring the barrier
    expect(out.hpLoss).toBe(0);
    expect(out.poolsLeft).toEqual([4000]); // the block ate it; the barrier is intact
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 — ④ it is not a shield and it is not an evasion", () => {
  it("a block does NOT spend the barrier", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1 });
    addShield(r.world, r.victim, 500, 5, "fixture");
    const out = hit(r, 300, "physical");
    expect(out.hpLoss).toBe(0);
    expect(out.poolsLeft).toEqual([500]); // untouched — the hit never reached it
  });

  it("a partial block spends the barrier only for the part that got through", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 });
    addShield(r.world, r.victim, 500, 5, "fixture");
    const out = hit(r, 300, "physical");
    expect(out.hpLoss).toBe(0);
    expect(out.poolsLeft).toEqual([350]); // 500 - 150
  });

  it("a fully blocked hit STILL emits `damage` with blocked:true — the whole visible channel", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1 });
    const out = hit(r, 300, "physical");
    // NOT the `refusesDamage` treatment (which `continue`s and emits nothing):
    // 無敵 refuses a hit that never arrived, 格擋 stops one that did. This event
    // is what draws the 「擋下」 text (ui/combatText `guard`), the block spark
    // (combat/hitFeel `sparkKind`) and the defender's block voice line
    // (GameApp's `d.blocked === true` branch). Losing it = 失敗形態 ②.
    expect(out.damageEvent).toBeDefined();
    expect(out.damageEvent!.amount).toBe(0);
    expect(out.damageEvent!.blocked).toBe(true);
    expect(out.damageEvent!.killingBlow).toBe(false);
  });

  it("a partial block also reads as blocked, so the guard cue fires either way", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 });
    const out = hit(r, 300, "physical");
    expect(out.damageEvent!.blocked).toBe(true);
    expect(out.damageEvent!.amount).toBeCloseTo(150, 9);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 多來源 —— owner 2026-07-31:「這種情形應該是獨立判斷兩次,拿第一次檔掉剩餘
//    繼續算下一次」。
//
// ⚠️ 這一節是**重寫**的。它的前身有一條註解寫著「a `>=` tie-break or a
//    last-wins scan would pick the wrong one」—— 那句話**被量掉了**:把
//    `weight > bestWeight` 改成 `>=`,43 條測試全綠。一條宣稱自己擋得住某個
//    突變、而那個突變其實過得去的註解,比沒有註解更糟。這一節每一條的突變都
//    真的跑過,寫在各自的 it 裡面。
// ─────────────────────────────────────────────────────────────────────────────

/** 直接問純函式 N 次,回「擋掉了多少」的分佈(不經過 tick,所以不會被別的系統干擾)。 */
function cutSamples(r: Rig, n: number, impact = 100, hp = 1000): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round(blockCutFor(r.world, r.victim, "physical", impact, hp, 0) * 1000) / 1000);
  }
  return out;
}

describe("格擋 — ⑤ 鏈式獨立判定 (owner 2026-07-31 的裁決)", () => {
  it("兩件 30% 全額格擋 = 51%,不是 30% —— 這就是 owner 推翻的那個數字", () => {
    // THE headline assertion. 1 − 0.7·0.7 = 0.51,而舊的「取最好的一個」給 0.30。
    // 兩個帶都測,所以「多帶一件到底有沒有用」是一個有數字的答案。
    const one = rig(4242);
    giveBlock(one, { damageTypes: ["physical"], chance: 0.3, fraction: 1 }, "item:a#0");
    const two = rig(4242);
    giveBlock(two, { damageTypes: ["physical"], chance: 0.3, fraction: 1 }, "item:a#0");
    giveBlock(two, { damageTypes: ["physical"], chance: 0.3, fraction: 1 }, "item:b#1");

    const rate = (r: Rig): number => cutSamples(r, 4000).filter((c) => c > 0).length / 4000;
    const oneRate = rate(one);
    const twoRate = rate(two);

    // ±4 pp on 4000 samples: 窄到能把 0.51 和 0.30 分開(相差 21 pp),寬到
    // 不會因為換一顆種子就 flaky。
    expect(oneRate).toBeGreaterThan(0.26);
    expect(oneRate).toBeLessThan(0.34);
    expect(twoRate).toBeGreaterThan(0.47);
    expect(twoRate).toBeLessThan(0.55);
    // …而且第二件真的有加成。這一條是「取 max」的實作**必定**紅的那一條。
    expect(twoRate).toBeGreaterThan(oneRate + 0.15);
  });

  it("剩餘往下傳是**相乘**,不是相加也不是取最大", () => {
    // 兩件各擋一半、機率都是 1 ⇒ 300 → 150 → 75,擋掉 225。
    //   · 相加的實作會擋掉 300(150 + 150)
    //   · 取最大的實作會擋掉 150
    // 三個數字互不相同,所以這一條同時排除另外兩種讀法。
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 }, "item:a#0");
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 }, "item:b#1");
    expect(hit(r, 300, "physical").hpLoss).toBeCloseTo(75, 9);
  });

  it("每個合格來源各抽一次 —— 兩件都必抽,所以是 2 draws 不是 1", () => {
    // 用 fraction 0.5 而不是 1:全額擋掉會讓鏈提早結束(見下一條),那樣就分不出
    // 「只抽一次」和「抽完就沒剩餘了」。
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 }, "item:a#0");
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 }, "item:b#1");
    expect(hit(r, 300, "physical").draws).toBe(2);
  });

  it("整發被擋光之後鏈就停 —— 後面的來源不抽 rng、也不燒自己的內部冷卻", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1 }, "item:first#0");
    attachSource(r.world, r.victim, {
      id: "item:second#1",
      kind: "item",
      block: { damageTypes: ["physical"], chance: 1, fraction: 1, internalCooldown: 1 },
    });
    const out = hit(r, 300, "physical");
    expect(out.hpLoss).toBe(0);
    expect(out.draws).toBe(1); // 第二件連骰子都沒碰
    // …而且它的冷卻時鐘完全沒有被啟動,所以下一發它還是滿的。
    const second = r.world.stats.get(r.victim)!.sources.find((s) => s.id === "item:second#1")!;
    expect(second.blockLastFired).toBeUndefined();
  });

  it("`lethalOnly` 在鏈裡對**剩餘**傷害判致死,不是對原始 impact", () => {
    // owner 的原話:「拿第一次檔掉剩餘繼續算下一次」。
    // 受擊者 1000 血;第一件先把傷害砍一半,第二件是致死格擋(lethalBasis "hp")。
    const build = (): Rig => {
      const r = rig();
      giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.5 }, "item:half#0");
      giveBlock(
        r,
        {
          damageTypes: ["physical"],
          chance: 1,
          fraction: 1,
          lethalOnly: true,
          lethalBasis: "hp",
        },
        "item:save#1",
      );
      return r;
    };

    // 2400 → 砍成 1200,1200 > 1000 血 ⇒ 保命技該救,整發歸零。
    const saved = hit(build(), 2400, "physical");
    expect(saved.hpLoss).toBe(0);
    expect(saved.draws).toBe(2); // 兩件都抽了

    // 1800 → 砍成 900,900 < 1000 血 ⇒ **已經殺不死人了**,保命技不該燒掉,
    // 連骰子都不該抽。對原始 impact 判的實作會在這裡整發擋掉(hpLoss 0)。
    const b = build();
    const out = hit(b, 1800, "physical");
    expect(out.hpLoss).toBeCloseTo(900, 9);
    expect(out.draws).toBe(1); // 只有第一件抽了
  });

  it("順序是 `sources` 的插入序,不是按 id 排序 —— 先掛上的先判", () => {
    // `attachSource` 是 `sources.push`,所以後買的一件排在後面,而**先掛的先判**。
    //
    // ⚠️ 2026-08-01 更正(第三守則):這條測試的標題本來是「新裝備接在尾巴,
    // 不搶既有來源的骰子」,註解還寫著「多帶一件格擋不會改變原本那件會拿到的
    // 那一次 draw」。**那是假的,而且量得出來**:每一發封包多走一個合格來源
    // 就多消耗一次 draw,所以第 2 發起既有那一件讀的就是亂數流上另一個位置
    // (seed 20260801 / chance .3 / fraction .01 / 30 發:一件時第一件擋中
    // 1,4,6,9,10,14,15;兩件時 1,5,8)。理由的完整更正在 `block.ts` 檔頭 ⑤。
    // 斷言本身沒有變 —— 它量的一直都是「誰先被判」,那部分是真的。
    //
    // ⚠️ 第一版的量法是廢的,而且是**量出來**才知道的:我原本讓第二件是
    // magic-only(型別不符),以為「它沒有偷走第一次 draw」就證明了順序。
    // 但一個型別不符的來源在**碰 rng 之前**就 `continue`,所以排序過的實作
    // 照樣綠 —— 突變 `for (const src of [...sources].sort(byId))` 存活。
    //
    // 真正分得開的量法:**兩件都合格、都必定擋中、而且都是全額格擋**。
    // 走到第一件就把整發擋光,鏈結束 ⇒ 只有**排在前面的那一件**會被蓋上
    // `blockLastFired`。所以「誰的時鐘被啟動」就是「誰排在前面」的直接讀數。
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1 }, "item:zzz#0"); // 先掛
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1 }, "item:aaa#1"); // 後掛
    const out = hit(r, 200, "physical");
    expect(out.hpLoss).toBe(0);
    expect(out.draws).toBe(1); // 第一件就擋光了,第二件連骰子都沒碰

    const byId = (id: string): { blockLastFired?: number } =>
      r.world.stats.get(r.victim)!.sources.find((s) => s.id === id)! as {
        blockLastFired?: number;
      };
    // 插入序 ⇒ 先掛的 zzz 擋;按 id 排序 ⇒ 會變成 aaa 擋。
    expect(byId("item:zzz#0").blockLastFired).toBe(r.world.tick - 1);
    expect(byId("item:aaa#1").blockLastFired).toBeUndefined();
  });

  it("`chance` really is a chance — same seed reproduces, a different seed diverges", () => {
    const roll = (seed: number): boolean[] => {
      const r = rig(seed);
      giveBlock(r, { damageTypes: ["physical"], chance: 0.5, fraction: 1 });
      return Array.from({ length: 40 }, () => hit(r, 10, "physical").hpLoss === 0);
    };
    const a = roll(1234);
    expect(roll(1234)).toEqual(a); // determinism
    expect(roll(9876)).not.toEqual(a); // …and it is a real roll, not a constant
    const blocked = a.filter(Boolean).length;
    expect(blocked).toBeGreaterThan(0);
    expect(blocked).toBeLessThan(40);
  });

  it("the SCOREBOARD is told what the block was worth", () => {
    // 失敗形態 ② one layer up: a block that leaves `damageBlocked` at the
    // armor-only figure means the post-match screen reports the item as having
    // done nothing. Needs real champions, because `recordDamage` returns early
    // for a target with no ChampionComp / no matchStats entry.
    const world = new SimWorld(SKELETON_ARENA, 99);
    const c = Z0.center;
    const mk = (dx: number, seat: number, team: number): EntityId =>
      spawnChampion(world, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(seat),
        teamId: asTeamId(team),
        pos: { x: c.x + dx, z: c.z },
        zone: 0,
      });
    const attacker = mk(-0.6, 0, 0);
    const victim = mk(0.6, 1, 1);
    attachSource(world, victim, {
      id: "item:fixture#0",
      kind: "item",
      block: { damageTypes: ["physical"], chance: 1, fraction: 1 },
    });
    world.rebuildGrid();
    world.damageQueue.push({
      source: attacker,
      target: victim,
      amount: 400,
      type: "physical",
      crit: false,
      origin: "ability:test.block",
    });
    world.step(NO_INTENTS);
    // A FULLY blocked packet: armour ate `amount - impact`, the block ate the
    // remaining `impact`, so the two terms must sum to the whole packet. That
    // identity holds whatever thorne's armour is, which is why it is asserted
    // instead of a hard-coded number.
    //
    // ⚠️ 「the whole packet」是**解算後**的量,不是 `amount` —— 這一發的 origin 是
    // `ability:*`,所以它先吃了一次 AP 傷害加成(`combat/apDamageScaling.ts`)。
    // ⛔ 乘數從那支函式讀而不是抄一個數字,也⛔ 不把那一層關掉:這一條驗的是
    // **出貨管線**下的恆等式,而恆等式本來就與封包多大無關。
    const packet = 400 * apDamageMult(world, attacker, "ability:test.block");
    expect(world.matchStats.get(victim)!.damageBlocked).toBeCloseTo(packet, 6);
    expect(world.matchStats.get(victim)!.damageTaken).toBe(0);
  });

  it("`fraction` over 1 cannot INFLATE the victim's shield (the ceiling is load-bearing)", () => {
    const r = rig();
    // The schema caps `fraction` at 1, but the admin overlay is a second write
    // path, so `clamp01` bounds it again before the subtraction.
    //
    // ⚠️ MEASURED, not assumed — and my first attempt at this test was worthless.
    // `fraction: 1.5` makes `dmg = impact - 1.5·impact` NEGATIVE, and the hp
    // write is guarded (`if (dmg > 0) hp.hp -= dmg`), so "it did not heal me"
    // passes with OR without the ceiling. The SHIELD loop is not guarded:
    // `sh.amount -= Math.min(sh.amount, -150)` ADDS 150 to the barrier. So the
    // assertion that actually pins the ceiling is the pool, not the hp bar.
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1.5 });
    addShield(r.world, r.victim, 500, 5, "fixture");
    const out = hit(r, 300, "physical");
    expect(out.hpLoss).toBe(0);
    expect(r.world.health.get(r.victim)!.hp).toBe(1000); // never above its start
    expect(out.poolsLeft).toEqual([500]); // NOT 650 — a block must not mint absorb
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 內部冷卻 —— owner 2026-07-31:「致命一擊格擋要不要內部冷卻? => 冷卻 1秒」
// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 — ⑥ 內部冷卻 (絕對 tick,閘在骰子之前)", () => {
  /** 1 秒 = TICK_HZ 個 tick。用 world.dt 反推,而不是把 30 抄進來。 */
  const icdTicks = (r: Rig): number => Math.round(1 / r.world.dt);

  it("擋中一次之後的 1 秒內完全不擋 —— 而且**連骰子都不抽**", () => {
    const r = rig();
    giveBlock(r, {
      damageTypes: ["physical"],
      chance: 1, // 機率 1,所以任何「沒擋到」都只能是冷卻造成的
      fraction: 1,
      internalCooldown: 1,
    });
    expect(hit(r, 200, "physical").hpLoss).toBe(0); // 第一發:擋下

    const second = hit(r, 200, "physical"); // 下一個 tick
    expect(second.hpLoss).toBe(200); // 冷卻中 ⇒ 整發吃下
    // draws 0 是「冷卻閘在骰子之前」那個決定的**唯一**可觀察證據。把閘移到
    // 骰子後面,hpLoss 這一條照樣綠,而亂數流會被每一發打進來的傷害推著走。
    expect(second.draws).toBe(0);
  });

  it("冷卻一過就恢復 —— 而且門檻真的是 1 秒,不是 1 tick 也不是永久", () => {
    const r = rig();
    giveBlock(r, {
      damageTypes: ["physical"],
      chance: 1,
      fraction: 1,
      internalCooldown: 1,
    });
    expect(hit(r, 200, "physical").hpLoss).toBe(0);

    // 差一個 tick 就到期:還在冷卻裡。
    for (let i = 1; i < icdTicks(r) - 1; i++) r.world.step(NO_INTENTS);
    expect(hit(r, 200, "physical").hpLoss).toBe(200);
    // 再一個 tick,`world.tick - blockLastFired` 剛好等於門檻 ⇒ 放行。
    expect(hit(r, 200, "physical").hpLoss).toBe(0);
  });

  it("抽輸的那一次**不**啟動冷卻 —— 否則 30% 的道具會退化成「每秒最多抽一次」", () => {
    const r = rig();
    // chance 0.01:這顆種子的前兩次一定抽輸,所以觀察到的每一件事都只跟
    // 「抽輸之後發生什麼」有關,不會被一次幸運的 proc 蓋掉。
    giveBlock(r, {
      damageTypes: ["physical"],
      chance: 0.01,
      fraction: 1,
      internalCooldown: 1,
    });
    const src = (): { blockLastFired?: number } =>
      r.world.stats.get(r.victim)!.sources[0] as { blockLastFired?: number };

    const first = hit(r, 50, "physical");
    expect(first.hpLoss).toBe(50); // 抽輸了
    expect(first.draws).toBe(1); // …但它真的抽了(不是被什麼閘擋掉)
    expect(src().blockLastFired).toBeUndefined(); // 而且時鐘沒有被啟動

    // 下一個 tick 照樣抽。把 `blockLastFired = world.tick` 挪到骰子**之前**,
    // 這一條就會讀到 0 —— 那正是「抽一次輸了就整秒不能再抽」的退化。
    expect(hit(r, 50, "physical").draws).toBe(1);
  });

  it("沒有 `internalCooldown` 的來源完全不受影響 —— 奇門盾甲/黃金聖鬥衣 是嚴格 no-op", () => {
    const r = rig();
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 1 }); // 沒有這個欄位
    expect(hit(r, 200, "physical").hpLoss).toBe(0);
    expect(hit(r, 200, "physical").hpLoss).toBe(0); // 下一個 tick 照樣擋
    expect(hit(r, 200, "physical").hpLoss).toBe(0);
  });

  it("兩件各自有自己的冷卻時鐘,不會互相洗掉", () => {
    // `blockLastFired` 掛在 SOURCE 上而不是掛在單位上。共用一格的實作會讓
    // 第一件擋完之後第二件也一起進冷卻。
    const r = rig();
    giveBlock(
      r,
      { damageTypes: ["physical"], chance: 1, fraction: 0.5, internalCooldown: 1 },
      "item:a#0",
    );
    giveBlock(
      r,
      { damageTypes: ["physical"], chance: 1, fraction: 0.5, internalCooldown: 1 },
      "item:b#1",
    );
    // 第一發:兩件都擋 ⇒ 300 → 150 → 75。
    expect(hit(r, 300, "physical").hpLoss).toBeCloseTo(75, 9);
    const srcs = r.world.stats.get(r.victim)!.sources;
    expect(srcs.find((s) => s.id === "item:a#0")!.blockLastFired).toBe(r.world.tick - 1);
    expect(srcs.find((s) => s.id === "item:b#1")!.blockLastFired).toBe(r.world.tick - 1);
    // 第二發:兩件都在冷卻 ⇒ 整發吃下,一次 draw 都沒有。
    const second = hit(r, 300, "physical");
    expect(second.hpLoss).toBeCloseTo(300, 9);
    expect(second.draws).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ `blockStacking` 是一個欄位 (CLAUDE.md 第一守則)
// ─────────────────────────────────────────────────────────────────────────────
describe("格擋 — ⑦ stacking 是後台欄位,兩個值都真的改變一場比賽", () => {
  const twoSources = (seed: number, stacking: BlockStacking): Rig => {
    const r = rig(seed);
    r.world.blockRules = { stacking, chanceMult: 1 };
    giveBlock(r, { damageTypes: ["physical"], chance: 0.3, fraction: 1 }, "item:a#0");
    giveBlock(r, { damageTypes: ["physical"], chance: 0.3, fraction: 1 }, "item:b#1");
    return r;
  };

  it("出貨預設是 owner 裁決的 `independent`", () => {
    // 一個新造的 world 拿到的就是出貨值 —— 而 MatchController 只是在 tick 0
    // 之前用文件覆寫它。這一條釘住「沒有文件時遊戲是什麼行為」。
    expect(new SimWorld(SKELETON_ARENA, 1).blockRules).toEqual(DEFAULT_BLOCK_RULES);
    expect(DEFAULT_BLOCK_RULES.stacking).toBe("independent");
  });

  it("切成 `best` 之後:兩件退回 ~30%,而且整發只抽一次", () => {
    const best = twoSources(4242, "best");
    const rate = cutSamples(best, 4000).filter((c) => c > 0).length / 4000;
    expect(rate).toBeGreaterThan(0.26);
    expect(rate).toBeLessThan(0.34); // 不是 51%
    expect(hit(twoSources(4242, "best"), 200, "physical").draws).toBe(1);
    // 對照:同一顆種子、同一組來源,independent 抽兩次。
    expect(hit(twoSources(4242, "independent"), 200, "physical").draws).toBe(2);
  });

  it("`best` 模式下 `chance × fraction` 才是排名指標,而且它只在那裡有意義", () => {
    // 0.5 × 0.5 = 0.25 贏過 1 × 0.2 = 0.2,所以擋中時擋掉的是 50 不是 20。
    // 弱的那個刻意排在前面 —— 「最後一個贏」的掃法會挑錯。
    const r = rig();
    r.world.blockRules = { stacking: "best", chanceMult: 1 };
    giveBlock(r, { damageTypes: ["physical"], chance: 1, fraction: 0.2 }, "item:weak#0");
    giveBlock(r, { damageTypes: ["physical"], chance: 0.5, fraction: 0.5 }, "item:strong#1");
    expect([...new Set(cutSamples(r, 200))].sort((a, b) => a - b)).toEqual([0, 50]);
  });

  it("後台文件 → sim:認得的值生效,認不得的一律退回出貨預設(不是空表)", () => {
    const doc = (stacking: string): unknown => ({ id: "block", schema: BLOCK_SCHEMA, stacking });
    // 走**真的 loader union**,所以後台存得進去的東西 sim 一定讀得懂。
    expect(blockRulesFromDoc(zConfigDoc.parse(doc("best"))).stacking).toBe("best");
    for (const s of BLOCK_STACKINGS) {
      expect(zConfigBlockDoc.safeParse(doc(s)).success, s).toBe(true);
      expect(blockRulesFromDoc(doc(s)).stacking).toBe(s);
    }
    // ⚠️ 退回出貨預設而不是 undefined:undefined 會讓 `blockCutFor` 兩條分支
    // 都不走,也就是格擋整族靜默失效,而卡片照顯示、語音照喊。
    expect(blockRulesFromDoc(undefined)).toEqual(DEFAULT_BLOCK_RULES);
    expect(blockRulesFromDoc({ schema: "config.shield@1", stacking: "best" })).toEqual(
      DEFAULT_BLOCK_RULES,
    );
    expect(blockRulesFromDoc(doc("independant"))).toEqual(DEFAULT_BLOCK_RULES); // typo
    expect(blockRulesFromDoc(doc(""))).toEqual(DEFAULT_BLOCK_RULES);
    // 一個 sim 沒有實作的值不可以存得進來。
    expect(zConfigBlockDoc.safeParse(doc("sum")).success).toBe(false);
  });
});
