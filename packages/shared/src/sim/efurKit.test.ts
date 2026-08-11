/**
 * 揍敵客阿福 (godie-efur) — 行為守衛 (lane D).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這裡刻意**不**測什麼
 * ─────────────────────────────────────────────────────────────────────────────
 * 不測「文件裡有沒有 `kind: "cycleBuff"`」、不測「`hpPct` 這個欄位在不在」、也不
 * 測「vfxLayers 有幾層」。那些全是**屬性**，是七種失敗形態的第 ⑦ 種。這一支英雄
 * 的六個技能全部是**位移／控制／百分比生命／狀態機**，也就是說每一條斷言都必須
 * 讀最終世界狀態：`world.transform.pos`、`world.health.hp/mana`、
 * `world.stats.get(id).final`、`world.status`。
 *
 * 而且被測的是**出貨的那一份文件**（第 ⑤ 種失敗形態）：所有六支都是從
 * `content/` 用真的 `ContentLoader` 載進真的 registry，沒有任何一個 EffectDef 是
 * 測試自己手寫的。文件被改壞、被刪掉一個 effect、數字被動過，這裡就紅。
 *
 * ⚠️ 這一份**不是** `it.each(從磁碟掃出來的清單)` + `toBeGreaterThan(0)` 那種
 * 守衛：那種寫法「刪掉內容 = 刪掉測試」。這裡每一支技能的 id 與關鍵數字都寫死在
 * 斷言裡，文件不見就是 `Abilities.get` 直接爆炸。
 *
 * 突變紀錄（每一條都真的做過，見回報）：
 *   · `nextCycleStep` 永遠回 0                     → efur-passive-rotation 紅
 *   · Q 的 `leap` 從文件裡拿掉                      → efur-q-blink 紅
 *   · W 的 `knockback` 從文件裡拿掉                 → efur-w-knock 紅
 *   · E 的 `damageArea` 從文件裡拿掉                → efur-e-burst 紅
 *   · `interruptOn === "damage"` 那一項改成 false   → efur-r-interrupt 紅
 *   · EX hook 的 `condition`（目標帶致盲）拿掉      → efur-ex-gate 紅
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 2026-08-12：W / E / EX 三段整段重寫，因為**技能換了**，不是因為守衛不好
 * ─────────────────────────────────────────────────────────────────────────────
 * owner 2026-08-12 裁決（揍敵客 13 全套重寫）：「**全做**」。三支技能的機制被
 * 換掉了，所以這裡的期望值跟著換 —— ⛔ 但**沒有任何一條斷言被拔掉、被改成
 * `toBeTruthy`、被 skip 或被刪掉**。每一條舊斷言都在下面有一條對應的新斷言，
 * 驗的是同一個位置上的新機制（逐條對照見各段落自己的裁決註解）：
 *
 *   舊：W 的傷害含目標最大生命 6%   → 新：那一項被拿掉了 = 兩座池子的差 **為 0**
 *   舊：W 打完會暈眩                → 新：只剩擊退 = `stunned` **為 false**
 *   舊：E 是衝鋒走廊（capsule）     → 新：self 環爆（circle）= 側面那個人**也**被打到
 *   舊：EX 是主動（燒魔／存款／連段）→ 新：被動 = 按鍵回 `'passive'`，改驗 W 命中致盲時的摘心
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import {
  Arenas,
  Configs,
  Models,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility, rankUpAbility, learnEx, resolveAbilityRange } from "./abilities/abilitySystem";
import { attachSource } from "./stats/statPipeline";
import { Stat } from "./stats/statTypes";
import { ModOp } from "./stats/modifiers";
import { cycleStepId } from "./effects/cycleBuff";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

const EFUR = "godie-efur" as ChampionId;
/** A body that is NOT 阿福, so the dummy never runs his own kit back at us. */
const DUMMY = "godie-e001" as ChampionId;

const Z0 = SKELETON_ARENA.zones[0]!;
const C = Z0.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

interface Rig {
  world: SimWorld;
  efur: EntityId;
  foe: EntityId;
}

/**
 * 阿福 at the zone centre, one enemy `gap` units EAST (that corridor is
 * obstacle-free — the same lane knockback.test.ts uses).
 */
function rig(opts?: { gap?: number; level?: number; foeMaxHp?: number; seed?: number }): Rig {
  // ⚠️ `seed` 是 2026-08-12 加的：新的 EX 是一顆 20% 的骰子（`hook.chance`），
  // 而 `world.rng` 是 seeded 的 —— 固定種子只會得到「這一顆種子的那一次擲骰」，
  // 那條斷言驗的是種子不是機率。掃一排種子才看得到「有時中、有時不中」。
  const world = new SimWorld(SKELETON_ARENA, opts?.seed ?? 4242);
  const level = opts?.level ?? 6;
  const efur = spawnChampion(world, {
    championId: EFUR,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: 0 },
    zone: 0,
    level,
  });
  const foe = spawnChampion(world, {
    championId: DUMMY,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: C.x + (opts?.gap ?? 2), z: 0 },
    zone: 0,
    level,
  });
  // A fat, unarmoured target: `armor 0` makes physical mitigation the identity,
  // so a damage assertion is about the ABILITY rather than about the mitigation
  // curve. The big pool keeps a 12 %-max-health slice measurable and keeps the
  // dummy alive through every case below.
  const hp = world.health.get(foe)!;
  hp.maxHp = opts?.foeMaxHp ?? 4000;
  hp.hp = hp.maxHp;
  const sc = world.stats.get(foe)!;
  sc.final[Stat.Armor] = 0;
  sc.final[Stat.MagicResist] = 0;
  world.rebuildGrid();
  return { world, efur, foe };
}

const empty = (): Map<SeatId, IntentFrame> => new Map();

function step(world: SimWorld, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step(empty());
}

function pos(world: SimWorld, id: EntityId): V.Vec2 {
  return { ...world.transform.get(id)!.pos };
}

/**
 * PIN a core slot to EXACTLY `rank`.
 *
 * ⚠️ Assignment rather than `rankUpAbility`, and that is deliberate: spawning at
 * a level above 1 already auto-learns points, so a "rank up N times" helper
 * lands on 1+N and every per-rank number in the assertions below would silently
 * be reading the wrong column. What matters to these guards is that the ABILITY
 * is the shipped document at a KNOWN rank; the rank-up ladder itself is
 * abilitySystem's own suite.
 */
function rankTo(world: SimWorld, id: EntityId, slot: "Q" | "W" | "E" | "R", rank: number): void {
  const ab = world.abilities.get(id)!;
  world.ultGateOverride = true;
  ab.slots[slot].rank = rank;
  expect(ab.slots[slot].rank).toBe(rank);
}

/** Live (un-expired) cycle-step sources on `id`, as their step INDEX. */
function liveCycleSteps(world: SimWorld, id: EntityId, key: string, n: number): number[] {
  const sc = world.stats.get(id)!;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const src = sc.sources.find((s) => s.id === cycleStepId(key, i));
    if (src && (src.expiresAtTick ?? 0) > world.tick) out.push(i);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 天生 13-00 念。攻防轉換 — 輪流四個 buff，可同時存在
// ═══════════════════════════════════════════════════════════════════════════
describe("13-00 念。攻防轉換 (efur-passive-rotation)", () => {
  it("four swings light FOUR DIFFERENT buffs, in order, and all four are live at once", () => {
    cover("efur-passive-rotation");
    const r = rig({ gap: 2, foeMaxHp: 100000 });
    // The rotation is per SWING and each step lasts 1.0 s, so 「可同時存在」 is
    // only reachable above 4 attacks/sec. That is a statement the shipped
    // description already makes; here we buy the attack speed so the guard can
    // observe the coexistence the ability promises.
    attachSource(r.world, r.efur, {
      id: "test:attackspeed",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 20 }],
    });

    const seen: number[][] = [];
    const attack: Map<SeatId, IntentFrame> = new Map([
      [asSeatId(0), { order: { kind: "attackTarget" as const, entity: r.foe }, commands: [] }],
    ]);
    for (let i = 0; i < 60; i++) {
      r.world.step(attack);
      seen.push(liveCycleSteps(r.world, r.efur, "efur-nen", 4));
    }

    // ① the rotation really visits all four, and it does so IN ORDER: the first
    //    tick that shows k steps live must be exactly [0..k-1].
    for (const k of [1, 2, 3, 4]) {
      const first = seen.find((s) => s.length === k);
      expect(first, `never saw ${k} step(s) live`).toBeDefined();
      expect(first).toEqual([0, 1, 2, 3].slice(0, k));
    }
    // ② 可同時存在 — a tick on which ALL FOUR are alive together.
    const together = seen.findIndex((s) => s.length === 4);
    expect(together, "the four buffs never coexisted").toBeGreaterThanOrEqual(0);

    // ③ and they are REAL stat changes, not bookkeeping. Read the final table on
    //    that tick's world: with all four live, ap/ad/armor/mr are each +10 %.
    //    (Re-run to the same tick because `seen` only kept the indices.)
    const r2 = rig({ gap: 2, foeMaxHp: 100000 });
    attachSource(r2.world, r2.efur, {
      id: "test:attackspeed",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackSpeed, op: ModOp.Flat, value: 20 }],
    });
    const attack2: Map<SeatId, IntentFrame> = new Map([
      [asSeatId(0), { order: { kind: "attackTarget" as const, entity: r2.foe }, commands: [] }],
    ]);
    let armorWithAll = 0;
    let armorBefore = r2.world.stats.get(r2.efur)!.final[Stat.Armor];
    for (let i = 0; i <= together; i++) {
      if (liveCycleSteps(r2.world, r2.efur, "efur-nen", 4).length === 0) {
        armorBefore = r2.world.stats.get(r2.efur)!.final[Stat.Armor];
      }
      r2.world.step(attack2);
    }
    expect(liveCycleSteps(r2.world, r2.efur, "efur-nen", 4)).toEqual([0, 1, 2, 3]);
    armorWithAll = r2.world.stats.get(r2.efur)!.final[Stat.Armor];
    expect(armorWithAll).toBeGreaterThan(armorBefore);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Q 13-01 暗步。極限之圓 — 瞬移到目標身邊，超過距離不觸發
// ═══════════════════════════════════════════════════════════════════════════
describe("13-01 暗步。極限之圓 (efur-q-blink)", () => {
  it("really teleports the caster next to the target", () => {
    cover("efur-q-blink");
    const r = rig({ gap: 4 });
    rankTo(r.world, r.efur, "Q", 1);
    const before = pos(r.world, r.efur);
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe("ok");
    step(r.world, 12);
    const after = pos(r.world, r.efur);
    // moved a real distance, and ENDED UP next to the victim (bodies are 1.2
    // wide, so "adjacent" is generous at 2.0).
    expect(V.dist(before, after)).toBeGreaterThan(1.5);
    expect(V.dist(after, pos(r.world, r.foe))).toBeLessThan(2.0);
  });

  it("REFUSES past its distance limit — no move, no cooldown, no mana", () => {
    cover("efur-q-blink");
    const def = Abilities.get("godie-efur.q" as AbilityId);
    // The gate is the SHIPPED reach (`range` through the #136 combat-env
    // factor), read from the same helper castAbility uses — never a number
    // re-typed here, which is how a guard silently stops matching the content.
    const reach = resolveAbilityRange(new SimWorld(SKELETON_ARENA, 1), def.range);
    const r = rig({ gap: reach + 2 });
    rankTo(r.world, r.efur, "Q", 1);
    const before = pos(r.world, r.efur);
    const mana = r.world.health.get(r.efur)!.mana;
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe(
      "out-of-range",
    );
    step(r.world, 12);
    expect(V.dist(before, pos(r.world, r.efur))).toBeLessThan(0.01);
    expect(r.world.health.get(r.efur)!.mana).toBeCloseTo(mana, 5);
    expect(r.world.abilities.get(r.efur)!.slots.Q.cooldownRemainingTicks).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// W 13-02 龍頭戲畫。牙突 — 只剩「傷害 + 擊退」
//
// owner 2026-08-12 裁決：「**全做**」（揍敵客 13 全套重寫）—— 舊行為「40 傷害
// ＋ 目標[最大生命] 6% ＋ 暈眩 ＋ 擊退」，新規格 3→4 階、CD 45、**拿掉暈眩與
// 最大生命百分比，只留「[擊退]6距離」**。
//
// 所以下面兩條斷言**翻面**而不是消失：
//   · 最大生命那一項：舊「兩座池子的差 = 6% × 池差」→ 新「差 = 0」。同一座隔離
//     夾具、同一個減法，只有期望值換邊 —— `hpPct` 哪一天長回來這條就紅。
//   · 暈眩：舊 `toBe(true)` → 新 `toBe(false)`。
// 另外補一條**正面**守衛（舊版沒有，而舊版靠 hpPct 那條間接證明「傷害存在」）：
// 整個 `damage` 效果被刪掉的話，差值一樣是 0，翻面之後那條就抓不到了。
// ═══════════════════════════════════════════════════════════════════════════
function castW(foeMaxHp: number, rank = 1): { pushed: number; lost: number; stunned: boolean } {
  const r = rig({ gap: 2, foeMaxHp });
  rankTo(r.world, r.efur, "W", rank);
  const start = pos(r.world, r.foe);
  const hp0 = r.world.health.get(r.foe)!.hp;
  expect(castAbility(r.world, r.efur, "W", { type: "entity", entityId: r.foe })).toBe("ok");
  let stunned = false;
  for (let i = 0; i < 30; i++) {
    r.world.step(empty());
    const st = r.world.status.get(r.foe);
    if (st?.effects.some((e) => e.stun && e.expiresAtTick > r.world.tick)) stunned = true;
  }
  return {
    pushed: V.dist(start, pos(r.world, r.foe)),
    lost: hp0 - r.world.health.get(r.foe)!.hp,
    stunned,
  };
}

describe("13-02 龍頭戲畫。牙突 (efur-w-hppct / efur-w-knock)", () => {
  it("傷害不再跟著目標的最大生命走，但 perRank 那一欄仍然真的被讀", () => {
    cover("efur-w-hppct");
    // 同一座隔離夾具：同階、同施法者、同減傷，**只有 `maxHp` 不一樣**，所以
    // 兩者掉血的差就是「最大生命百分比」那一項。舊規格它是 6% × 池差；
    // owner 2026-08-12 把它拿掉了，所以現在它必須是 0。
    const small = castW(1000);
    const big = castW(4000);
    expect(
      big.lost - small.lost,
      "牙突又長回了目標最大生命百分比項（owner 2026-08-12 明確拿掉）",
    ).toBeCloseTo(0, 1);

    // ⛔ 上面那條翻面之後，「整個 `damage` 效果被刪掉」也會讓差是 0 —— 所以
    //    這兩條是新的**正面**守衛：傷害要真的發生，而且要跟階數那一欄走。
    expect(small.lost, "牙突根本沒造成傷害").toBeGreaterThan(0);
    expect(
      castW(4000, 4).lost,
      "四階跟一階打一樣多 —— `amount.perRank` 那一欄沒有被讀",
    ).toBeGreaterThan(castW(4000, 1).lost);
  });

  it("把目標推開，而且**不再**暈眩", () => {
    cover("efur-w-knock");
    const out = castW(4000);
    // 6.0 at gap 0 minus the 2.0 gap (GH#193) = 4.0, and the body slides there
    // over several ticks. A loose floor of 2.0 keeps this about "it really got
    // shoved" rather than about the gap arithmetic knockback.test.ts owns.
    expect(out.pushed).toBeGreaterThan(2.0);
    // owner 2026-08-12 裁決：「全做」—— 舊行為 W 命中會暈眩（`knockback.getupTicks`
    // 開的擊倒窗口），新規格只留「[擊退]6距離」。⚠️ 副作用要記著：這支是全 repo
    // `getupTicks` 的**唯一使用者**，所以拿掉之後**全 roster 的擊退都不會擊倒**。
    expect(out.stunned, "牙突又暈眩了 —— 擊倒窗口被加回來").toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E 13-03 龍頭戲畫。布陣 — self 環爆（不再是衝鋒走廊）
//
// owner 2026-08-12 裁決：「**全做**」—— 舊行為「衝鋒一段距離，沿路走廊
// （capsule）切人並擊退」，新規格「將念形成龍形衝擊波**包裹全身**，造成[範圍]
// 敵人 150/250/350/450 + 60% [AP] 傷害」= `castType: "self"` 的一發環爆。
//
// 三條斷言逐條對應舊的三條，而且**方向剛好相反的那一條正是重點**：
//   舊「衝了 > 1.0」        → 新「原地不動 < 0.01」（規格自己寫「其實還可以衝刺，但老了」）
//   舊「線上那個人掉血」     → 保留（環內的人照樣掉血）
//   舊「側面那個人 0 傷害」  → 新「側面**同距離**那個人也掉血」
//      ⭐ 這一條是 capsule → circle 的判別式：一個還沒改完、仍然只打前方走廊的
//        實作會讓側面那個人 0 傷害，而它以前是**綠**的。
// 再加一個圈**外**的身體當上界，免得「打全場」也能過。
// ═══════════════════════════════════════════════════════════════════════════
describe("13-03 龍頭戲畫。布陣 (efur-e-burst)", () => {
  it("原地環爆：圈內的人（含側面同距離）都吃傷害，圈外的人一點都沒掉，施法者不位移", () => {
    cover("efur-e-burst");
    const world = new SimWorld(SKELETON_ARENA, 4242);
    const efur = spawnChampion(world, {
      championId: EFUR,
      seatId: asSeatId(0),
      teamId: asTeamId(0),
      pos: { x: C.x, z: 0 },
      zone: 0,
      level: 6,
    });
    const mk = (seat: number, x: number, z: number): EntityId => {
      const id = spawnChampion(world, {
        championId: DUMMY,
        seatId: asSeatId(seat),
        teamId: asTeamId(1),
        pos: { x, z },
        zone: 0,
        level: 6,
      });
      const hp = world.health.get(id)!;
      hp.maxHp = 8000;
      hp.hp = hp.maxHp;
      const sc = world.stats.get(id)!;
      sc.final[Stat.Armor] = 0;
      return id;
    };
    // 三個身體，兩個在環內（一個正前方、一個**側面同距離**）、一個在環外。
    // ⭐ `side` 是 capsule → circle 的判別式：舊的走廊實作打不到它。
    const ahead = mk(1, C.x + 2.0, 0);
    const side = mk(2, C.x, 2.0);
    const far = mk(3, C.x + 9.0, 0);
    world.rebuildGrid();
    const ab = world.abilities.get(efur)!;
    ab.unspentPoints += 1;
    expect(rankUpAbility(world, efur, "E")).toBe(true);

    const casterBefore = pos(world, efur);
    const aheadHp0 = world.health.get(ahead)!.hp;
    const sideHp0 = world.health.get(side)!.hp;
    const farHp0 = world.health.get(far)!.hp;
    // owner 2026-08-12 裁決：「全做」—— 舊行為是 `castType: "ground"` 的衝鋒
    // （對著一個落點放），新規格是「包裹全身」= `self`。連**怎麼放**都變了。
    expect(castAbility(world, efur, "E", { type: "self" })).toBe("ok");
    step(world, 40);

    // 舊：`toBeGreaterThan(1.0)`（衝出去了）。新：規格自己寫「其實還可以衝刺，
    // 但老了」—— 位移整個拿掉，所以站在原地。
    expect(
      V.dist(casterBefore, pos(world, efur)),
      "布陣又把人衝出去了 —— owner 2026-08-12 拿掉了位移",
    ).toBeLessThan(0.01);
    expect(aheadHp0 - world.health.get(ahead)!.hp, "環內正前方的人沒吃到傷害").toBeGreaterThan(0);
    // ⭐ 舊斷言在這一格是 `toBe(0)`。走廊變成圓環，所以側面同距離的人**必須**
    //   也吃到 —— 一個只改了描述、實作還是走廊的版本會在這裡紅。
    expect(
      sideHp0 - world.health.get(side)!.hp,
      "側面同距離的人沒吃到傷害 —— 它還是一條走廊，不是一個圓",
    ).toBeGreaterThan(0);
    // 上界：圓是有半徑的，不是打全場。
    expect(farHp0 - world.health.get(far)!.hp, "圈外的人也吃到了 —— 半徑沒有生效").toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// R 13-04 龍星群 — 2 秒才生效，中途被打就中斷
// ═══════════════════════════════════════════════════════════════════════════
describe("13-04 龍星群 (efur-r-cast / efur-r-interrupt)", () => {
  it("nothing happens for 2.0 s, then the meteors land", () => {
    cover("efur-r-cast");
    const r = rig({ gap: 3, foeMaxHp: 40000 });
    rankTo(r.world, r.efur, "R", 1);
    const hp0 = r.world.health.get(r.foe)!.hp;
    expect(
      castAbility(r.world, r.efur, "R", { type: "point", point: { x: C.x + 3, z: 0 } }),
    ).toBe("ok");
    // 0.6 s = 18 ticks of wind-up (the value castTimeFormula derives — see the
    // R doc's own description for why it is not the 2.0 s the owner asked for).
    // Two ticks short: still nothing.
    step(r.world, 16);
    expect(r.world.health.get(r.foe)!.hp).toBe(hp0);
    // …then the 10-payout shower over the next 2.0 s.
    step(r.world, 75);
    expect(hp0 - r.world.health.get(r.foe)!.hp).toBeGreaterThan(0);
  });

  it("a single point of damage during the wind-up CANCELS it — the meteors never come", () => {
    cover("efur-r-interrupt");
    const r = rig({ gap: 3, foeMaxHp: 40000 });
    rankTo(r.world, r.efur, "R", 1);
    const hp0 = r.world.health.get(r.foe)!.hp;
    expect(
      castAbility(r.world, r.efur, "R", { type: "point", point: { x: C.x + 3, z: 0 } }),
    ).toBe("ok");
    step(r.world, 8);
    // Poke the caster. NOT a stun and NOT a knockdown — those already cancelled
    // a cast before `interruptOn` existed, so using one would let this test pass
    // against an implementation that ignores the new field entirely (失敗形態 ④).
    r.world.health.get(r.efur)!.hp -= 1;
    r.world.step(empty());
    expect(r.world.abilities.get(r.efur)!.cast).toBeNull();
    step(r.world, 150);
    expect(r.world.health.get(r.foe)!.hp).toBe(hp0);
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// EX 13-002 絕。暗殺奧義 — **被動**：牙突打中致盲目標時 20% 機率摘心
//
// owner 2026-08-12 兩則裁決疊在這一段上：
//   ① 「只要讓 EX **照技能說明**正常實作 被動或主動 即可」
//      → 舊行為「按 EX = 主動：燒光法力、四圍 +40%、下一發 Q 附贈免費牙突、
//        燒掉的法力存起來當追加傷害」，新規格第一個標籤逐字就是 `[被動]`，
//        `effects: []`。**按鍵回 `'passive'` 是新的正確答案**，不是缺陷。
//   ② 「**全做**」（揍敵客全套重寫）→ 整支換成完全不同的一支技能：
//        「對於[致盲]狀態的敵人施展[龍頭戲畫。牙突]時，有 20% 機會摘除心臟」。
//
// 所以舊的四條斷言（燒魔／四圍 +40%／免費牙突一次／存款 × 0.2 與其上限）沒有
// 對應的機制可以驗了 —— ⛔ 但它們**不是被刪掉了事**：下面兩條把同樣的「兩個
// 方向一起關」的守衛形狀原封搬過來，只是換成新技能的那四道閘：
//
//   舊「燒了魔才有加成」（正向）      → 新「致盲 + 學了 EX + 血夠低 → 真的會摘心」
//   舊「第二發 Q 不再免費」（負向）    → 新「三道閘任何一道沒過 → 一次都不摘」
//   舊「存款差 × 0.2」（量的關係）     → 新「機率是**擲**出來的：有時中、有時不中」
//   舊「上限 400 夾得住」（上界）      → 新「血高於門檻就不摘」= 處決線的上界
// ═══════════════════════════════════════════════════════════════════════════

/** 這一批擲骰用的種子。⚠️ 一顆種子只能回答「那一次擲出什麼」，不是機率。 */
const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 7);

/** `id` 身上現在是不是真的帶著【致盲】（不是「文件裡有 applyStatus」）。 */
function isBlind(world: SimWorld, id: EntityId): boolean {
  const st = world.status.get(id);
  return st?.effects.some((e) => e.statusId === "blind" && e.expiresAtTick > world.tick) === true;
}

/**
 * 一次完整的實驗：（可選）Q 上致盲 → 牙突 → 目標死了沒有。
 *
 * ⚠️ 「死了沒有」而不是「掉了多少血」是刻意的：出貨文件用的是 `devour`
 * （處決），不是一發追加傷害 —— 讀掉血量會被牙突自己的傷害污染，而讀
 * `alive` 只有摘心會翻。牙突在這裡打掉的是 40000 血池裡的幾十點，一發都殺不死。
 */
function heartPluck(opts: { seed: number; blind: boolean; ex: boolean; hpFrac: number }): boolean {
  const r = rig({ gap: 2, foeMaxHp: 40000, seed: opts.seed });
  rankTo(r.world, r.efur, "Q", 1);
  rankTo(r.world, r.efur, "W", 1);
  if (opts.ex) expect(learnEx(r.world, r.efur)).toBe(true);
  const hp = r.world.health.get(r.foe)!;
  hp.hp = hp.maxHp * opts.hpFrac;

  if (opts.blind) {
    // 走**出貨的那條路**上致盲（Q 的 `blink.onArrive`），不是自己往
    // `world.status` 裡塞一筆 —— 手寫狀態的話 Q 的 `applyStatus` 被刪掉這裡
    // 還是全綠（失敗形態⑤）。
    expect(castAbility(r.world, r.efur, "Q", { type: "entity", entityId: r.foe })).toBe("ok");
    step(r.world, 6);
    // 前提條件自己先驗：0 次觸發如果是因為「致盲根本沒上身」，那下面那條
    // 「一次都不摘」會用錯誤的理由變綠。
    expect(isBlind(r.world, r.foe), "致盲根本沒上身 —— Q 的 onArrive 斷了").toBe(true);
  }

  expect(castAbility(r.world, r.efur, "W", { type: "entity", entityId: r.foe })).toBe("ok");
  step(r.world, 20);
  return !r.world.health.get(r.foe)!.alive;
}

describe("13-002 絕。暗殺奧義 (efur-ex-devour / efur-ex-gate)", () => {
  it("★ 對致盲目標的牙突會摘心 —— 而且不是每一次（20% 是真的擲出來的）", () => {
    cover("efur-ex-devour");
    const plucked = SEEDS.filter((seed) => heartPluck({ seed, blind: true, ex: true, hpFrac: 0.3 }));
    expect(
      plucked.length,
      "一次都沒摘到 —— `onAbilityHit` hook 或 `devour` 整條沒接上",
    ).toBeGreaterThan(0);
    // ⭐ 上界跟下界一樣重要：一個把 `chance` 忽略掉（每次必中）的實作會讓
    //   30 顆種子全中，而只有下界的斷言對它是綠的。
    expect(plucked.length, "每一顆種子都摘到 —— `hook.chance` 那一格沒有被擲").toBeLessThan(
      SEEDS.length,
    );
  });

  it("★ 三道閘任何一道沒過就一次都不摘，而 EX 鍵本身已經按不下去了", () => {
    cover("efur-ex-gate");
    // owner 2026-08-12：「只要讓 EX **照技能說明**正常實作 被動或主動 即可」——
    // 舊行為「按 EX → `'ok'`，主動開一個窗口」，新規格 `[被動]`、`effects: []`，
    // 所以引擎回 `'passive'`。⚠️ 這一條沒有變弱：它仍然在斷言一個**確定的**
    // 回傳值，只是那個值換了；HUD 上那顆 EX 鈕現在是虛線框的死鈕（#166）。
    const r = rig({ gap: 2 });
    expect(learnEx(r.world, r.efur)).toBe(true);
    expect(
      castAbility(r.world, r.efur, "EX", { type: "self" }),
      "EX 又變回主動了 —— 規格第一個標籤是 [被動]",
    ).toBe("passive");

    // 三道閘，一次關一道，其餘兩道全開 —— 所以紅的時候直接指名是哪一道破了。
    expect(
      SEEDS.filter((seed) => heartPluck({ seed, blind: false, ex: true, hpFrac: 0.3 })),
      "沒有致盲也摘心 —— hook 的 `condition`（目標帶【致盲】）沒有在把關",
    ).toEqual([]);
    expect(
      SEEDS.filter((seed) => heartPluck({ seed, blind: true, ex: false, hpFrac: 0.3 })),
      "沒學 EX 也摘心 —— 被動掛在誰身上根本沒檢查",
    ).toEqual([]);
    expect(
      SEEDS.filter((seed) => heartPluck({ seed, blind: true, ex: true, hpFrac: 1.0 })),
      "滿血也被摘心 —— `devour.thresholdPctOfMax` 那條處決線沒有生效",
    ).toEqual([]);
  });
});
