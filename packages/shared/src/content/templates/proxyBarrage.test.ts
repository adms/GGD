/**
 * 代理錨點施法 (tpl-proxy-cast) 與 亂數彈幕轟炸 (tpl-random-barrage) 的行為守衛。
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意不測什麼
 * ---------------------------------------------------------------------------
 * ⛔ 沒有一條是「有 N 張卡」「schema 收得下」「三個 anchor 解析出三個 castType」
 *    這種**屬性**斷言 (七種失敗形態 ⑦)。那些對正確與壞掉的實作都會過。
 *
 * 每一條都走完整條出貨路徑, 一行手寫的 EffectDef 都沒有 (失敗形態 ⑤):
 *    磁碟上的 template@1 doc
 *      → `defaultParamsFor` / exemplar 的實測參數 (編輯器表單送出的東西)
 *      → `expand()`         (registry 註冊技能時跑的東西)
 *      → `zEffectDefUnion`  (內容 schema 真的收不收)
 *      → `runEffects()`     (模擬器真的派發的那個 dispatch)
 *      → `world.step()`     → 讀 `world.health` / `world.transform.pos`
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄 (每一條都真的做過, 見任務回報的 mutation 欄)
 * ---------------------------------------------------------------------------
 *   · expand 的 `random-barrage` 分支整個刪掉             → rb-* 全紅
 *   · expand 的 `proxy-cast` 分支整個刪掉                  → pc-* 全紅
 *   · dot 的 `tickOnApply: true` 拿掉                      → rb-impact-count 紅 (9→8)
 *   · durationSec 從 (count−1)×interval 改成 count×interval → rb-impact-count 紅 (9→10)
 *   · `payout` 分支反過來 (perImpact 走 damage)            → rb-impact-count / rb-once 紅
 *   · applyStatus 的 `stun: true` 拿掉                      → pc-stun-holds-the-body 紅
 *   · applyStatus 整段拿掉 (只留 damage)                    → pc-stun-holds-the-body 紅
 *   · statusId 的 slow40 倍率 0.6 改成 1.0                  → pc-slow-is-a-real-slow 紅
 *   · tpl-random-barrage.impactDamage 改回 550 (A0V9 家族極值) → rb-defaults 紅
 *   · tpl-random-barrage.count 改回 40 (A0UO 家族極值)      → rb-defaults 紅
 *   · tpl-proxy-cast.damage 改回 1400 (A0SW 家族極值)       → pc-defaults 紅
 *   · tpl-random-barrage.count.max 改回 40 (壓在實測極值上)  → new-bounds-have-headroom 紅
 *   · tpl-proxy-cast.radius.max 改回 600 (壓在實測極值上)    → new-bounds-have-headroom 紅
 *   · 在 tpl-random-barrage 加一個 durationSec 欄位          → rb-duration-is-derived 紅
 *   · tpl-proxy-cast.proxyCount 拿掉 inert 旗標              → (本檔綠) paramsSchema.test.ts 紅
 *
 * ⚠️ 其中一發突變第一次跑出來是**綠的**, 而那正是這份紀錄最有價值的一行:
 *   · expand 的 `round2(impactRadius + scatterRadius)` 改成 `impactRadius`
 *     —— 也就是「散佈範圍完全不算數」—— 15 條全綠。原因是所有行為守衛都把
 *     `ctx.targets` 直接交給 `runEffects`, 而 `ExpandResult.radius` 是給
 *     `CastResolveSystem` 用的, 沒有任何一條讀到它 (失敗形態 ③)。
 *     補上 `rb-zone-includes-scatter` (走出貨路徑自己的 `enemiesInCircle` +
 *     `resolveAbilityRadius`) 之後這一發才變紅。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cover } from "../../../testkit/cover";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { zEffectDefUnion } from "../schema/effect";
import { defaultParamsFor } from "./paramsSchema";
import { expand, toLen } from "./expand";
import { SimWorld } from "../../sim/SimWorld";
import { SKELETON_ARENA } from "../../sim/world/ArenaDef";
import { runEffects } from "../../sim/effects/effectRunner";
import { enemiesInCircle, resolveAbilityRadius } from "../../sim/abilities/abilitySystem";
import type { EffectContext, EffectDef } from "../../sim/effects/effect";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import * as V from "../../sim/math/vec2";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates",
);

function loadTemplate(id: string): TemplateDoc {
  return zTemplateDoc.parse(JSON.parse(readFileSync(join(TEMPLATES_DIR, `${id}.json`), "utf8")));
}

const Z0 = SKELETON_ARENA.zones[0]!;
const C = Z0.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  victim: EntityId;
  victimStart: V.Vec2;
}

/**
 * One caster and one HOSTILE victim, 1.5 GGD units apart on the obstacle-free
 * z = 0 corridor east of the zone centre.
 *
 * ⚠️ HOSTILE on purpose — the same trap chargePush.test.ts documents. Anything
 * that re-resolves victims through `enemiesInCircle` (and every ability radius
 * does) simply COLLECTS NOBODY on a same-team victim, and the guard goes green
 * with the implementation doing nothing.
 *
 * The price is that `step()` lets them auto-acquire and swing, so raw HP after
 * N ticks is polluted by basic attacks. Every HP assertion below therefore
 * either counts DISCRETE DROPS (basic attacks are ~1/s at most, the barrage is
 * 10/s) or measures a DIFFERENCE between two runs that share the same seed and
 * the same brawl.
 */
function rig(gap = 1.5): Rig {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const place = (x: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: 0 },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1,
      zone: 0,
    });
    world.health.set(id, { hp: 20000, maxHp: 20000, mana: 0, maxMana: 0, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(seat), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    return id;
  };
  const caster = place(C.x, 0);
  const victim = place(C.x + gap, 1);
  world.rebuildGrid();
  return { world, caster, victim, victimStart: { ...world.transform.get(victim)!.pos } };
}

function ctxFor(r: Rig, origin: string): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.victim],
    point: { ...r.world.transform.get(r.victim)!.pos },
    origin,
    rng: r.world.rng,
  };
}

/** The effects an OPERATOR gets by opening the template and pressing save. */
function defaultEffects(id: string): EffectDef[] {
  const t = loadTemplate(id);
  return expand(t, defaultParamsFor(t)).effects;
}

/** HP of the victim sampled once per tick, for `ticks` ticks after the cast. */
function hpTrace(r: Rig, effects: EffectDef[], origin: string, ticks: number): number[] {
  runEffects(effects, ctxFor(r, origin));
  const out: number[] = [r.world.health.get(r.victim)!.hp];
  for (let i = 0; i < ticks; i++) {
    r.world.step(new Map());
    out.push(r.world.health.get(r.victim)!.hp);
  }
  return out;
}

/**
 * How many ticks in the trace the victim LOST at least `floor` HP on.
 *
 * A count, not a total, because the count is what distinguishes 「9 發」 from
 * 「1 發打 9 倍」 — and 「1 發打 9 倍」 is exactly what a `payout` branch flipped
 * the wrong way, or a `durationSec` collapsed to one interval, would produce.
 * `floor` is set well above the rig's basic-attack damage so an auto-attack
 * landing mid-window cannot be miscounted as an impact.
 */
function bigDropTicks(trace: number[], floor: number): number {
  let n = 0;
  for (let i = 1; i < trace.length; i++) if (trace[i - 1]! - trace[i]! >= floor) n++;
  return n;
}

// ===========================================================================
// 亂數彈幕轟炸
// ===========================================================================

/**
 * 74-03 闇之天使 (A0F4) 的**實測**參數, 逐格對照 war3map.j 與 OBJECTS.json:
 *   count 8            j:48507  `exitwhen udg_SephAngelCounter > 8`
 *   intervalSec 0.30   j:48514  `TriggerSleepAction( 0.30 )`
 *   scatterRadius 300  j:48508  `RectFromCenterSizeBJ(point, 600.00, 600.00)` 的半邊
 *   impactRadius 275   A011.area lv1
 *   impactDamage 150   A011.data1 lv1 (技能說明也寫「造成150點傷害, 共8道爆炸」)
 * 這一組是這台機器的 exemplar, 不是預設值 —— 預設值走群內中位數 (見 rb-defaults)。
 */
const ANGEL = {
  count: 8,
  intervalSec: 0.3,
  scatterRadius: 300,
  impactRadius: 275,
  impactDamage: { perRank: [150], ratios: [] },
  damageType: "magic",
  payout: "perImpact",
  castTimeSec: 0,
};

describe("tpl-random-barrage — 一張卡存下去, 遊戲裡真的連炸", () => {
  it("is enabled and its defaults expand into schema-valid effects", () => {
    cover("rb-expands");
    const t = loadTemplate("tpl-random-barrage");
    expect(t.status).toBe("enabled");
    const effects = defaultEffects("tpl-random-barrage");
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) expect(() => zEffectDefUnion.parse(e)).not.toThrow();
  });

  it("74-03 闇之天使 打的是 8 下, 不是 1 下也不是 9 下 (rb-impact-count)", () => {
    cover("rb-impact-count");
    // THE assertion this whole family exists for. 原作說明白紙黑字寫「共8道爆炸」,
    // 而 (a) payout 分支選錯、(b) tickOnApply 漏掉、(c) durationSec 用 count×dt
    // 而不是 (count−1)×dt —— 三種寫法都會讓總傷害「差不多對」而發數錯掉。
    // 玩家看到的是發數。
    const t = loadTemplate("tpl-random-barrage");
    const effects = expand(t, ANGEL).effects;
    const r = rig();
    // 8 發 × 0.30s = 2.1s 的窗口, 給到 3s (90 ticks) 確保收完。
    const trace = hpTrace(r, effects, "ability:test.barrage", 90);
    // floor 100: 每發 150 點魔法傷害過完減傷還遠大於 rig 的普攻。
    expect(bigDropTicks(trace, 100)).toBe(8);
  });

  it("彈幕是**連續**的, 不是一口氣結算 (rb-spread-over-time)", () => {
    cover("rb-spread-over-time");
    // 失敗形態 ⑦ 的解藥: 總量對不代表節奏對, 而玩家看到的是節奏。
    // 第一發落在施法 tick (原作是「先放一發再 sleep」), 最後一發落在 (8−1)×0.3
    // = 2.1s ≈ 第 63 tick 附近 —— 所以前 10 個 tick 之內絕不可能收完。
    const t = loadTemplate("tpl-random-barrage");
    const r = rig();
    const trace = hpTrace(r, expand(t, ANGEL).effects, "ability:test.barrage", 90);
    const early = bigDropTicks(trace.slice(0, 11), 100);
    expect(early).toBeGreaterThanOrEqual(1); // 第一發是即時的
    expect(early).toBeLessThan(8); // 但絕不是全部
  });

  it("payout: onceAtCast 真的塌成一發 (rb-once)", () => {
    cover("rb-once");
    // 決策點做成欄位, 而且切過去真的有意義: 23-03 雷牙一閃 / 81-02 Acxel Shooter /
    // 53-01 獸王牙操彈 的彈幕在 JASS 迴圈裡一行傷害都沒有。
    const t = loadTemplate("tpl-random-barrage");
    const r = rig();
    const trace = hpTrace(
      r,
      expand(t, { ...ANGEL, payout: "onceAtCast" }).effects,
      "ability:test.barrage-once",
      90,
    );
    expect(bigDropTicks(trace, 100)).toBe(1);
  });

  it("「開場直傷」清空 = 沒有那一發, 填了 = 多一發 (rb-opening-optional)", () => {
    cover("rb-opening-optional");
    const t = loadTemplate("tpl-random-barrage");
    const plain = expand(t, ANGEL).effects;
    const withOpening = expand(t, {
      ...ANGEL,
      openingDamage: { perRank: [400], ratios: [] },
    }).effects;
    expect(plain.filter((e) => e.kind === "damage")).toHaveLength(0);
    expect(withOpening.filter((e) => e.kind === "damage")).toHaveLength(1);
    // 而且開場那一發要排在轟炸**前面** —— 順序是玩家看得到的東西。
    expect(withOpening[0]!.kind).toBe("damage");
    expect(withOpening[1]!.kind).toBe("dot");
  });

  it("轟炸區真的把「散佈半徑」算進去 (rb-zone-includes-scatter)", () => {
    cover("rb-zone-includes-scatter");
    // ⚠️ 這一條是**突變跑出來才補上的**: 前一版的守衛整套都把 `ctx.targets` 直接
    // 交給 runEffects, 所以 ExpandResult.radius 根本沒有被任何一條讀到 —— 把
    // `impactRadius + scatterRadius` 改成 `impactRadius` (等於「散佈範圍不算數,
    // 只有正中心那一圈會被炸到」) 之後 15 條測試**全綠**。那就是失敗形態 ③。
    //
    // 修法是走**出貨路徑本身**: abilitySystem.ts:204 的 ground 分支就是
    // `enemiesInCircle(world, caster, point, resolveAbilityRadius(world, def.radius))`。
    // 這裡照抄那一行, 把一具身體放在「只算單發半徑就打不到、算上散佈就打得到」
    // 的距離上。
    const t = loadTemplate("tpl-random-barrage");
    const ex = expand(t, ANGEL);
    const impactOnly = toLen(ANGEL.impactRadius); // 275 → 5.04
    const withScatter = ex.radius!; // (275 + 300) → 10.54
    expect(withScatter).toBeGreaterThan(impactOnly + 1);

    // 站在兩者中間: 8.0 單位。乘上 combatEnv.abilityRange 之後兩邊一起縮, 所以
    // 用比例挑點, 不是用絕對距離。
    const r = rig();
    const mid = (impactOnly + withScatter) / 2;
    const caster = r.world.transform.get(r.caster)!.pos;
    r.world.transform.get(r.victim)!.pos = {
      x: caster.x + resolveAbilityRadius(r.world, mid),
      z: 0,
    };
    r.world.rebuildGrid();

    const zone = enemiesInCircle(
      r.world,
      r.caster,
      caster,
      resolveAbilityRadius(r.world, withScatter),
    );
    const impactOnlyHits = enemiesInCircle(
      r.world,
      r.caster,
      caster,
      resolveAbilityRadius(r.world, impactOnly),
    );
    expect(
      zone,
      "轟炸區收不到一具站在散佈範圍內的身體 —— scatterRadius 沒有進到 radius",
    ).toContain(r.victim);
    expect(
      impactOnlyHits,
      "對照組本來就打得到 —— 這條測試證明不了 scatterRadius 有沒有作用",
    ).not.toContain(r.victim);
  });

  it("總時長是導出的, 不是第三個欄位 (rb-duration-is-derived)", () => {
    cover("rb-duration-is-derived");
    // 陷阱 ③「導出值不是參數」。原作的迴圈只有 exitwhen N 與 sleep dt 兩個自由度。
    const t = loadTemplate("tpl-random-barrage");
    expect(
      Object.keys(t.params),
      "tpl-random-barrage 長出了一個 durationSec/totalDurationSec 欄位 —— 它是 " +
        "(count−1)×intervalSec 算出來的, 做成欄位就有三個會互相打架的輸入",
    ).not.toContain("durationSec");
    expect(Object.keys(t.params)).not.toContain("totalDurationSec");

    // 而且它真的跟著兩個來源動 —— 「沒有這個欄位」如果只是因為 expand 根本沒讀
    // count, 上面那條照樣是綠的。
    const dotOf = (params: Record<string, unknown>): Extract<EffectDef, { kind: "dot" }> => {
      const d = expand(t, params).effects.find((e) => e.kind === "dot");
      expect(d?.kind).toBe("dot");
      return d as Extract<EffectDef, { kind: "dot" }>;
    };
    expect(dotOf(ANGEL).durationSec).toBeCloseTo((8 - 1) * 0.3, 6);
    expect(dotOf({ ...ANGEL, count: 20 }).durationSec).toBeCloseTo((20 - 1) * 0.3, 6);
    expect(dotOf({ ...ANGEL, intervalSec: 0.1 }).durationSec).toBeCloseTo((8 - 1) * 0.1, 6);
  });
});

// ===========================================================================
// 代理錨點施法
// ===========================================================================

/**
 * 71-01 死亡隕落 (A03L) 的**實測**參數:
 *   anchor "point"        j:48163-48166 dummy 對 GetSpellTargetLoc 下 "inferno"
 *   radius 300            A095.area lv1
 *   damage 250            A095.data1 lv1
 *   statusId burnstun     ANin (地獄火) 落點會暈眩
 *   statusDurationSec 2   A095.duration lv1 = 2.0
 */
const DEATHFALL = {
  anchor: "point",
  radius: 300,
  damage: { perRank: [250], ratios: [] },
  damageType: "magic",
  statusId: "burnstun",
  statusDurationSec: 2,
  castTimeSec: 0,
  proxyCount: 1,
};

/**
 * 受害者在 `ticks` 個 tick 裡, 朝著一個遠方的移動目標走了多遠。
 *
 * 兩次跑同一顆 seed、同一組幾何、同一場互毆, 只差在模板的 `statusId` 有沒有填,
 * 所以普攻造成的位移在兩邊都有、會在差值裡抵銷 —— 剩下的就是這張卡授權的控場。
 */
function walkedWith(params: Record<string, unknown>, ticks = 40): number {
  const t = loadTemplate("tpl-proxy-cast");
  const r = rig(1.5);
  runEffects(expand(t, params).effects, ctxFor(r, "ability:test.proxy-cast"));
  // 給受害者一個明確的、離得很遠的移動指令: 沒被控住就會走。
  r.world.nav.get(r.victim)!.moveTarget = { x: C.x + 30, z: 0 };
  for (let i = 0; i < ticks; i++) {
    r.world.step(new Map());
    // MovementSystem 走到就清 moveTarget; 這裡的距離遠到不會發生, 但重新指定
    // 一次可以確保 OrderSystem 的自動接敵不會把它蓋掉。
    const nav = r.world.nav.get(r.victim)!;
    nav.moveTarget = { x: C.x + 30, z: 0 };
  }
  return V.dist(r.world.transform.get(r.victim)!.pos, r.victimStart);
}

describe("tpl-proxy-cast — 一張卡存下去, 遊戲裡真的打人又控人", () => {
  it("is enabled and its defaults expand into schema-valid effects", () => {
    cover("pc-expands");
    const t = loadTemplate("tpl-proxy-cast");
    expect(t.status).toBe("enabled");
    const effects = defaultEffects("tpl-proxy-cast");
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) expect(() => zEffectDefUnion.parse(e)).not.toThrow();
  });

  it("71-01 死亡隕落 真的扣血 (pc-damage-lands)", () => {
    cover("pc-damage-lands");
    const t = loadTemplate("tpl-proxy-cast");
    const r = rig();
    const before = r.world.health.get(r.victim)!.hp;
    runEffects(expand(t, DEATHFALL).effects, ctxFor(r, "ability:test.proxy-cast"));
    r.world.step(new Map());
    expect(before - r.world.health.get(r.victim)!.hp).toBeGreaterThan(100);
  });

  it("附帶的暈眩真的按住那具身體 (pc-stun-holds-the-body)", () => {
    cover("pc-stun-holds-the-body");
    // ⛔ 不是 `expect(status.effects[0].stun).toBe(true)` —— 那是屬性 (失敗形態 ⑦)。
    // 真正要回答的是「玩家按了方向鍵, 角色動不動」, 而那只有跑真的
    // MovementSystem 才答得出來。
    //
    // 對照組先證明「這具身體本來走得動」, 否則整條測試會在實作壞掉時照樣全綠
    // (失敗形態 ③ —— chargePush.test.ts 第一版就是這樣騙過自己的)。
    const noStatus = { ...DEATHFALL };
    delete (noStatus as Record<string, unknown>)["statusId"];
    const free = walkedWith(noStatus);
    const stunned = walkedWith(DEATHFALL);

    expect(free, "對照組本來就走不動 —— 這條測試證明不了任何事").toBeGreaterThan(2);
    expect(
      stunned,
      `填了 statusId=burnstun 之後受害者還是走了 ${stunned.toFixed(2)} 單位 —— ` +
        "模板授權的暈眩沒有到達 sim",
    ).toBeLessThan(free * 0.35);
  });

  it("statusId 換成減速 = 走得慢, 不是走不動 (pc-slow-is-a-real-slow)", () => {
    cover("pc-slow-is-a-real-slow");
    // 三根軸不能互相冒充: slow40 是 moveSpeedMult 0.6, 不是 stun。一個把所有
    // statusId 都折算成 stun 的實作會在這裡紅。
    const noStatus = { ...DEATHFALL };
    delete (noStatus as Record<string, unknown>)["statusId"];
    const free = walkedWith(noStatus);
    const slowed = walkedWith({ ...DEATHFALL, statusId: "slow40", statusDurationSec: 5 });
    const stunned = walkedWith({ ...DEATHFALL, statusDurationSec: 5 });

    expect(slowed, "slow40 把人完全定住了 —— 它是 0.6 倍速, 不是 stun").toBeGreaterThan(
      stunned + 1,
    );
    expect(slowed, "slow40 完全沒有減速").toBeLessThan(free - 1);
  });

  it("清空 statusId 真的把 applyStatus 整個拿掉 (pc-status-optional)", () => {
    cover("pc-status-optional");
    // 23 支成員裡有 20 支是純傷害, 所以「清空」必須是真的清空。
    const t = loadTemplate("tpl-proxy-cast");
    const withStatus = expand(t, DEATHFALL).effects.map((e) => e.kind);
    const params = { ...DEATHFALL };
    delete (params as Record<string, unknown>)["statusId"];
    const without = expand(t, params).effects.map((e) => e.kind);
    expect(withStatus).toContain("applyStatus");
    expect(without).not.toContain("applyStatus");
  });
});

// ===========================================================================
// 「預設值不是家族極值」 + 「上界要有餘裕」 —— 兩台新機器的數值守衛
// ===========================================================================

describe("兩台新機器的預設值不是家族裡最誇張的那組數字", () => {
  it("rb-defaults", () => {
    cover("rb-defaults");
    const p = defaultParamsFor(loadTemplate("tpl-random-barrage"));
    // 550 = 21-002 天破壤碎 dummy A0V9.data1 lv1, 家族最大; 逐發結算的四支
    // (150/550/150/150) 中位與眾數都是 150。
    expect(
      (p["impactDamage"] as { perRank: number[] }).perRank[0],
      "impactDamage 回到 550 (A0V9 天破壤碎, 家族極值)",
    ).toBeLessThanOrEqual(300);
    // 40 = 天破壤碎的 `exitwhen index > 40`; 八支 lv1 發數 [3,3,8,9,13,15,35,40]
    // 的中位下取是 9。40 發 × 550 = 22,000 一發存檔就送出去。
    expect(p["count"] as number, "count 回到 40 (A0UO 天破壤碎, 家族極值)").toBeLessThanOrEqual(20);
    // 但也不能靠歸零過關。
    expect((p["impactDamage"] as { perRank: number[] }).perRank[0]).toBeGreaterThan(50);
    expect(p["count"] as number).toBeGreaterThanOrEqual(2);
  });

  it("pc-defaults", () => {
    cover("pc-defaults");
    const p = defaultParamsFor(loadTemplate("tpl-proxy-cast"));
    // 1400 = 超新星 (EX) 的 dummy inferno A0SW.data1 lv1 —— 家族最大, 而且是
    // 一支 EX 技。九支代理技能的 lv1 傷害 [75,105,120,150,155,250,1400] 中位 150。
    expect(
      (p["damage"] as { perRank: number[] }).perRank[0],
      "damage 回到 1400 (A0SW 超新星, 家族極值)",
    ).toBeLessThanOrEqual(400);
    expect((p["damage"] as { perRank: number[] }).perRank[0]).toBeGreaterThan(50);
    // 600 = A0SW / A0FM 黑洞 的 area, 家族最大; 九支的 area 中位是 375。
    expect(p["radius"] as number, "radius 回到 600 (家族極值)").toBeLessThanOrEqual(450);
  });
});

describe("兩台新機器的上界不壓在資料的極值上", () => {
  it("new-bounds-have-headroom", () => {
    cover("new-bounds-have-headroom");
    // CLAUDE.md「欄位要有上界, 不是只有下界」的第二半 —— apexHeight max=1000 而
    // 實測最大正好 1000 就是這條規則的反例。
    const cases: { template: string; param: string; measuredMax: number; why: string }[] = [
      {
        template: "tpl-random-barrage",
        param: "count",
        measuredMax: 40,
        why: "21-002 天破壤碎 j:33163 `exitwhen udg_Shana_SB_Index > 40`",
      },
      {
        template: "tpl-random-barrage",
        param: "scatterRadius",
        measuredMax: 600,
        why: "21-002 天破壤碎 j:33165 的 1200×1200 rect 半邊",
      },
      {
        template: "tpl-random-barrage",
        param: "impactRadius",
        measuredMax: 375,
        why: "42-04 世界終結 dummy A0P6.area",
      },
      {
        template: "tpl-proxy-cast",
        param: "radius",
        measuredMax: 600,
        why: "超新星 dummy A0SW.area lv1 / 黑洞 A0FM.area",
      },
      {
        template: "tpl-proxy-cast",
        param: "statusDurationSec",
        measuredMax: 5,
        why: "66-02 驚駭 dummy A0I9.duration = 5.0",
      },
      {
        template: "tpl-proxy-cast",
        param: "proxyCount",
        measuredMax: 9,
        why: "37-03 災難之牆 j:44568-44574 的 9 隻牆單位",
      },
    ];
    for (const c of cases) {
      const slot = loadTemplate(c.template).params[c.param]!;
      expect(slot.max, `${c.template}.${c.param} 完全沒有上界`).toBeDefined();
      expect(
        slot.max!,
        `${c.template}.${c.param} max=${slot.max} 壓在實測極值 ${c.measuredMax} 上 ` +
          `(${c.why}) —— 操作者做不出任何原作沒做過的東西`,
      ).toBeGreaterThan(c.measuredMax);
    }
  });

  it("彈幕的兩個上界相乘之後仍在 dot schema 的 60 秒天花板之內", () => {
    cover("rb-bounds-are-jointly-valid");
    // 上界要有餘裕, 但兩個獨立的上界相乘之後可能撞到下游的硬限制 ——
    // `zEffectDefUnion` 的 dot.durationSec 是 .max(60)。這條就是那個乘積。
    const t = loadTemplate("tpl-random-barrage");
    const worst = {
      ...defaultParamsFor(t),
      count: t.params["count"]!.max!,
      intervalSec: t.params["intervalSec"]!.max!,
    };
    for (const e of expand(t, worst).effects) {
      expect(
        () => zEffectDefUnion.parse(e),
        `count/intervalSec 同時拉到上界 (${worst["count"]} × ${worst["intervalSec"]}s) ` +
          "產出的 dot 被內容 schema 拒收",
      ).not.toThrow();
    }
  });
});
