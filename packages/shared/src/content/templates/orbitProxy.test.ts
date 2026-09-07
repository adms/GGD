/**
 * 環形放射陣 (tpl-orbit-array) + 範圍逐一施法 (tpl-proxy-fanout) 的行為守衛。
 * GH#244 機器組 2/3 —— 前 15 台裡 index % 3 == 1 的那些。
 *
 * ---------------------------------------------------------------------------
 * 這裡刻意不測什麼
 * ---------------------------------------------------------------------------
 * ⛔ 沒有一條是「總類表有 N 張卡」「schema 收得下」這種**屬性**斷言
 *    (七種失敗形態 ⑦)。一台機器成不成立，只有一個問題算數：
 *    **操作者在鑄技工坊開這張卡、按存檔，場上那具身體會怎麼樣。**
 *
 * 所以每一條都走完整條出貨路徑，一段都不繞：
 *      磁碟上的 template@1 doc
 *   →  `defaultParamsFor`   (表單按存檔真的送出的東西)
 *   →  `expand()`           (registry 註冊技能真的跑的東西)
 *   →  `Abilities.register` (出貨的註冊表)
 *   →  `castAbility`        (出貨的施法路徑, 含 ground AoE 的目標收集)
 *   →  `world.step()`       → 讀 `world.health` / `world.status`
 * 沒有任何一行自己手寫 EffectDef 餵給 handler，也沒有任何一行自己算圓內有誰
 * (失敗形態 ⑤：被測的不是出貨的那個)。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（每一條都真的改壞跑過，見任務回報的 mutation 欄）
 * ---------------------------------------------------------------------------
 *   · ground-nova 的 castType 改回 "self"        → nova-hits-the-ring 紅
 *   · orbit-array 的 radius 改成常數不讀 reach   → orbit-reach-lands 紅
 *   · orbit-array 的 dot durationSec 拿掉 rayCount → orbit-raycount-lands 紅
 *   · orbit-array 永遠走 dot 分支（無視間隔清空） → orbit-burst-is-one-hit 紅
 *   · proxy-fanout 的 CC_MECHANIC 展開拿掉       → proxy-status-really-roots 紅
 *   · proxy-fanout 的 radius 改成常數            → proxy-radius-lands 紅
 *   · tpl-orbit-array.reach.max 改回 650         → new-bounds-have-headroom 紅
 *   · tpl-proxy-fanout.radius.max 改回 1800      → new-bounds-have-headroom 紅
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";
import { zEffectDefUnion } from "../schema/effect";
import { defaultParamsFor } from "./paramsSchema";
import { expand, toLen } from "./expand";
import { SimWorld } from "../../sim/SimWorld";
import { SKELETON_ARENA } from "../../sim/world/ArenaDef";
import { registerSkeletonContent } from "../../sim/content/skeleton";
import { spawnChampion } from "../../sim/spawnChampion";
import { Abilities } from "../../sim/content/registry";
import { castAbility } from "../../sim/abilities/abilitySystem";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId } from "../../ids";

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../content/ability-templates",
);

function loadTemplate(id: string): TemplateDoc {
  return zTemplateDoc.parse(JSON.parse(readFileSync(join(TEMPLATES_DIR, `${id}.json`), "utf8")));
}

const Z0 = SKELETON_ARENA.zones[0]!;
const C = Z0.center;

beforeAll(() => {
  registerSkeletonContent();
});

/**
 * Register the EXACT behaviour half an operator's saved card produces, under a
 * fresh ability id, and give it the skeleton fields a template never owns
 * (schema/template.ts header: cooldown / manaCost / range stay on the doc).
 *
 * `range: 0` is the 原地 reading both families default to — `castAbility`'s
 * "ground" branch clamps the requested point to `range`, so the blast always
 * detonates on the caster's own feet and the only thing deciding who is hit is
 * the expanded `radius`. That is what makes the radius assertions below mean
 * something.
 */
function registerFromTemplate(
  templateId: string,
  abilityId: string,
  overrides: Record<string, unknown> = {},
  range = 0,
): AbilityId {
  const t = loadTemplate(templateId);
  const ex = expand(t, { ...defaultParamsFor(t), ...overrides });
  // The CONTENT schema has to accept every effect — this is the gate a real doc
  // passes through on its way into the registry.
  for (const e of ex.effects) expect(() => zEffectDefUnion.parse(e)).not.toThrow();
  const id = abilityId as AbilityId;
  Abilities.register(id, {
    id,
    name: abilityId,
    slot: "Q",
    maxRank: 1,
    cooldown: [0.1],
    manaCost: [0],
    range,
    ...ex,
  } as never);
  return id;
}

interface Rig {
  world: SimWorld;
  caster: EntityId;
  /** hostile bodies, in the order they were placed (east of the caster) */
  victims: EntityId[];
}

/**
 * One caster at the zone centre and N hostile bodies strung out east along the
 * obstacle-free z = 0 corridor at the requested distances (GGD units).
 *
 * HOSTILE is required: `castAbility`'s ground branch collects with
 * `enemiesInCircle`, so a same-team body is never in the set at all and every
 * radius assertion below would read zero for the wrong reason.
 */
function rig(distances: number[]): Rig {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const caster = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: 0 },
    zone: 0,
  });
  const victims = distances.map((d, i) =>
    spawnChampion(world, {
      championId: "thorne" as ChampionId,
      seatId: asSeatId(i + 1),
      teamId: asTeamId(1),
      pos: { x: C.x + d, z: 0 },
      zone: 0,
    }),
  );
  world.rebuildGrid();
  return { world, caster, victims };
}

/** Slot the ability into Q, cast it at the caster's own feet, and step. */
function castAndStep(r: Rig, abilityId: AbilityId, ticks: number): void {
  r.world.abilities.get(r.caster)!.slots.Q = { abilityId, rank: 1, cooldownRemainingTicks: 0 };
  const t = r.world.transform.get(r.caster)!;
  expect(castAbility(r.world, r.caster, "Q", { type: "point", point: { ...t.pos } })).toBe("ok");
  for (let i = 0; i < ticks; i++) r.world.step(new Map());
}

const lost = (r: Rig, id: EntityId): number => {
  const h = r.world.health.get(id)!;
  return h.maxHp - h.hp;
};

// ===========================================================================
// 原地震波 — the defect this task found while wiring its neighbours
// ===========================================================================

describe("tpl-ground-nova 的震波打的是圈裡的人，不是施法者自己", () => {
  it("nova-hits-the-ring", () => {
    cover("nova-hits-the-ring");
    // 這一條是這輪最重要的一條。舊的展開是 `castType: "self"`，而
    // `castAbility` 的 "self" 分支把 `targets` 設成 `[caster]` 就結束了 ——
    // `radius` 只有 "ground" 分支會讀。所以出貨了一張「原地震波」，它的傷害
    // 封包只打施法者自己，圈裡站著的人一滴血都不掉。
    //
    // 過去釘住這個家族的斷言是 `expect(ex.castType).toBe("self")` 與
    // `expect(ex.radius).toBeCloseTo(...)` —— 兩條在壞掉的實作上都是綠的
    // (失敗形態 ⑦)。所以這裡量的是**血量**。
    const t = loadTemplate("tpl-ground-nova");
    const radiusWc3 = defaultParamsFor(t)["radius"] as number; // 530 → 9.72 GGD
    const inside = toLen(radiusWc3) * 0.5;
    const outside = toLen(radiusWc3) * 1.6;
    const r = rig([inside, outside]);
    const before = r.world.health.get(r.caster)!.hp;
    const id = registerFromTemplate("tpl-ground-nova", "test.nova");
    castAndStep(r, id, 3);

    expect(
      lost(r, r.victims[0]!),
      "圈內的敵人沒有掉血 —— 震波沒有打到圈裡的任何人",
    ).toBeGreaterThan(100);
    expect(lost(r, r.victims[1]!), "圈外的敵人掉血了 —— radius 沒有生效").toBe(0);
    // 而且施法者自己不能掉血：那正是 "self" 版本唯一會做的事。
    expect(
      r.world.health.get(r.caster)!.hp,
      "施法者自己掉血了 —— 傷害還是打在 [caster] 身上",
    ).toBe(before);
  });
});

// ===========================================================================
// 環形放射陣
// ===========================================================================

describe("tpl-orbit-array — 操作者存下來的那張卡是一支跑得動的技能", () => {
  it("orbit-reach-lands — reach 真的決定誰在圈裡", () => {
    cover("orbit-reach-lands");
    const t = loadTemplate("tpl-orbit-array");
    const reachWc3 = defaultParamsFor(t)["reach"] as number; // 256 → 4.69 GGD
    const inside = toLen(reachWc3) * 0.5;
    const outside = toLen(reachWc3) * 1.8;
    const r = rig([inside, outside]);
    const id = registerFromTemplate("tpl-orbit-array", "test.orbit.reach");
    // 預設是逐道 0.3s × 12 道 = 3.6s，跑滿 120 tick (4s) 才收得完。
    castAndStep(r, id, 120);

    expect(lost(r, r.victims[0]!), "圈內沒掉血 —— 整圈打空了").toBeGreaterThan(100);
    expect(lost(r, r.victims[1]!), "圈外掉血了 —— reach 沒有進到 radius").toBe(0);
  });

  it("orbit-raycount-lands — 12 道打的次數比 4 道多", () => {
    cover("orbit-raycount-lands");
    // 逐道連發 = 一片會連續切人的場，所以「道數」在本版是**總時長**：
    // 道數 × 間隔。道數砍成 1/3，站在原地的人吃到的總傷害就該掉一大截。
    //
    // ⚠️ 這條的第一版是拿**比值**斷言的，而它在正確的實作上就紅了 —— 預設
    // 325/道 × 4 道就已經把受害者打死，兩邊都讀到 maxHp，比值 1.07。所以量的
    // 改成兩次跑的**差**，而且把每一發壓到 20 點 true 傷害（跳過魔抗，讓數字
    // 直接可讀）並確認沒有人死。兩次跑同種子、同座標、同一支技能，只差
    // rayCount 一個欄位，所以普攻交火在兩邊完全相同、會從差裡消掉。
    const PER_RAY = 20;
    const totalFor = (rayCount: number): number => {
      const r = rig([1.5]);
      const id = registerFromTemplate("tpl-orbit-array", `test.orbit.n${rayCount}`, {
        rayCount,
        damage: { perRank: [PER_RAY], ratios: [] },
        damageType: "true",
      });
      castAndStep(r, id, 150);
      expect(r.world.health.get(r.victims[0]!)!.alive, "受害者死了，總傷害就被血量夾住了").toBe(
        true,
      );
      return lost(r, r.victims[0]!);
    };
    const many = totalFor(12);
    const few = totalFor(4);
    expect(many, "12 道沒有打出任何傷害").toBeGreaterThan(0);
    expect(
      many - few,
      "道數從 4 調到 12（多 8 道 = 多 8 次結算），同一個人吃到的總傷害沒有變多 —— " +
        "rayCount 沒有進到展開",
    ).toBeGreaterThan(PER_RAY * 8 * 0.5);
  });

  it("orbit-burst-is-one-hit — 清空逐道間隔就變成一次結算", () => {
    cover("orbit-burst-is-one-hit");
    // 決策點做成欄位，而且**清空真的有意義**（5/8 成員是齊發）。
    // 齊發 = 一發傷害；逐道 = 12 發。所以清空之後總傷害必須明顯變小，
    // 而且必須在第一個 tick 就全部結清。
    const t = loadTemplate("tpl-orbit-array");
    const params = { ...defaultParamsFor(t) };
    delete params["rayIntervalSec"];
    const burst = expand(t, params);
    expect(burst.effects.map((e) => e.kind)).toEqual(["damage"]);
    expect(expand(t, defaultParamsFor(t)).effects.map((e) => e.kind)).toEqual(["dot"]);

    const r = rig([1.5]);
    const id = registerFromTemplate("tpl-orbit-array", "test.orbit.burst", {
      rayIntervalSec: undefined,
    });
    castAndStep(r, id, 2);
    const early = lost(r, r.victims[0]!);
    for (let i = 0; i < 150; i++) r.world.step(new Map());
    // 齊發之後再跑 5 秒，這支技能不該再打出任何一發（普攻另計，所以只要求
    // 增量遠小於一發技能傷害）。
    expect(early, "齊發一發都沒打到").toBeGreaterThan(100);
    expect(
      lost(r, r.victims[0]!) - early,
      "清空了逐道間隔，傷害還是分很多次進來 —— 展開沒有真的切到齊發分支",
    ).toBeLessThan(early);
  });
});

// ===========================================================================
// 範圍逐一施法
// ===========================================================================

describe("tpl-proxy-fanout — 逐一施法打到每一個人，而且狀態真的鎖住人", () => {
  it("proxy-radius-lands — 範圍內每一具都吃到，範圍外一具都不吃", () => {
    cover("proxy-radius-lands");
    // 原作是「ForGroup 範圍內每一個目標各放一次」。落地的判準就是這句話：
    // 圈內的**每一個**都要掉血（不是只有第一個），圈外的一個都不能掉。
    const t = loadTemplate("tpl-proxy-fanout");
    const radiusWc3 = defaultParamsFor(t)["radius"] as number; // 600 → 11 GGD
    const rr = toLen(radiusWc3);
    const r = rig([rr * 0.25, rr * 0.55, rr * 0.85, rr * 1.7]);
    const id = registerFromTemplate("tpl-proxy-fanout", "test.proxy.radius");
    castAndStep(r, id, 3);

    for (let i = 0; i < 3; i++) {
      expect(lost(r, r.victims[i]!), `圈內第 ${i + 1} 具沒有吃到傷害`).toBeGreaterThan(100);
    }
    expect(lost(r, r.victims[3]!), "圈外的那一具吃到傷害了 —— radius 沒有生效").toBe(0);
  });

  it("proxy-status-really-roots — 掛上去的狀態會真的定住身體", () => {
    cover("proxy-status-really-roots");
    // ⚠️ 這一條是為了擋掉「掛了一個什麼都不做的標記」(失敗形態 ②)。
    // `status-effect@1` 文件只有 `tags`，模擬器一個字都不讀；真正讓人不能動的
    // 是 EffectDef 上的 `root: true`。所以斷言不是「status 陣列裡有 root」，
    // 是**身體有沒有移動**。
    const move = (withStatus: boolean): number => {
      const r = rig([2]);
      const id = registerFromTemplate(
        "tpl-proxy-fanout",
        `test.proxy.${withStatus ? "root" : "free"}`,
        withStatus ? {} : { status: undefined },
      );
      const victim = r.victims[0]!;
      const start = { ...r.world.transform.get(victim)!.pos };
      // 命令受害者往東邊走一段路，然後施法把他定住。
      r.world.nav.get(victim)!.moveTarget = { x: C.x + 12, z: 0 };
      castAndStep(r, id, 30);
      const now = r.world.transform.get(victim)!.pos;
      return Math.hypot(now.x - start.x, now.z - start.z);
    };
    const rooted = move(true);
    const free = move(false);
    expect(free, "對照組（清空 status）自己就不會動 —— 這條斷言測不到東西").toBeGreaterThan(
      0.5,
    );
    expect(
      rooted,
      `掛了 root 的身體還是走了 ${rooted.toFixed(2)} 單位（對照組 ${free.toFixed(2)}）—— ` +
        "status 槽只掛了一個裝飾用的標記，沒有帶上 root:true",
    ).toBeLessThan(free * 0.5);
  });

  it("proxy-status-optional — 清空 status 真的把 applyStatus 拿掉", () => {
    cover("proxy-status-optional");
    // 4/15 成員（千鳥流系的連鎖閃電）是純傷害，沒有任何狀態。
    // ⭐ GH#1066：`statusId`＋`statusDurationSec` 兩格收斂成一格 `status`（整個 applyStatus 節點）。
    const t = loadTemplate("tpl-proxy-fanout");
    const withStatus = expand(t, defaultParamsFor(t)).effects.map((e) => e.kind);
    const params = { ...defaultParamsFor(t) };
    delete params["status"];
    const without = expand(t, params).effects.map((e) => e.kind);
    expect(withStatus).toContain("applyStatus");
    expect(without).not.toContain("applyStatus");
    expect(without).toContain("damage");
  });

  it("proxy-emits-no-summon — 原作的 dummy 是實作繞道，不是召喚物", () => {
    cover("proxy-emits-no-summon");
    // 普查把這 15 張卡標成「召喚代理」。照字面做就會給它 requires:["summon"]，
    // 然後在場上生出 N 隻不該存在的身體。這裡量的是**場上實體數**。
    const t = loadTemplate("tpl-proxy-fanout");
    expect(t.requires).not.toContain("summon");
    const r = rig([2, 4]);
    const before = r.world.summon.size;
    const id = registerFromTemplate("tpl-proxy-fanout", "test.proxy.nosummon");
    castAndStep(r, id, 10);
    expect(r.world.summon.size, "施放之後場上多了召喚物 —— dummy 被當成設計實作了").toBe(
      before,
    );
  });
});

// ===========================================================================
// 兩台新機器的上界都要有餘裕（CLAUDE.md「欄位要有上界，不是只有下界」的第二半）
// ===========================================================================

describe("新增模板的數值上界", () => {
  it("new-bounds-have-headroom", () => {
    cover("new-bounds-have-headroom");
    const cases: { template: string; param: string; measuredMax: number; why: string }[] = [
      // 75-03 暴雷無限刃 A07Z，650u 的外圈（j:47296）—— 家族最大。
      { template: "tpl-orbit-array", param: "reach", measuredMax: 650, why: "A07Z j:47296" },
      // 47-04 天翔龍閃 A012 的 18 道是家族最多（j:43247）。
      { template: "tpl-orbit-array", param: "rayCount", measuredMax: 18, why: "A012 j:43247" },
      // 竹蜻蜓 A0JN 的 0.30s 週期是家族最慢（j:45770）。
      {
        template: "tpl-orbit-array",
        param: "rayIntervalSec",
        measuredMax: 0.3,
        why: "A0JN j:45770",
      },
      // 十萬伏特放電 A0SL 的 1800u 是這家族最大的枚舉半徑（j:40291）。
      { template: "tpl-proxy-fanout", param: "radius", measuredMax: 1800, why: "A0SL j:40291" },
      // ⚠️ 43-002 食神歸位的 polymorph 6 秒（A104 duration）曾是 `statusDurationSec` 的那一列 ——
      //    GH#1066 之後狀態時長住在 `status` 節點的 `duration` 上，上界由 `zApplyStatus`
      //    本人管（硬控 HARD_CC_MAX_DURATION_SEC / 其餘 STATUS_MAX_DURATION_SEC），
      //    ⛔ 模板不再有第二個上界可以壓在 6 上。
    ];
    for (const c of cases) {
      const slot = loadTemplate(c.template).params[c.param]!;
      expect(slot.max, `${c.template}.${c.param} 沒有上界`).toBeDefined();
      expect(
        slot.max!,
        `${c.template}.${c.param} max=${slot.max} 壓在實測極值 ${c.measuredMax} (${c.why}) 上 —— ` +
          "原作做得到的事情，操作者做不到",
      ).toBeGreaterThan(c.measuredMax);
    }
  });

  it("new-defaults-are-medians-not-extremes", () => {
    cover("new-defaults-are-medians-not-extremes");
    // 陷阱 ①：預設值不可以是「代表技能那一支」或家族極值。每一格都是群內中位
    // 數，所以每一格都必須明顯低於家族最大值。
    const t = loadTemplate("tpl-orbit-array");
    const p = defaultParamsFor(t);
    expect(p["rayCount"], "rayCount 預設回到家族最多的 18").toBeLessThan(18);
    expect(p["reach"], "reach 預設回到家族最遠的 650").toBeLessThan(650);
    const fanout = defaultParamsFor(loadTemplate("tpl-proxy-fanout"));
    expect(fanout["radius"], "radius 預設回到 A0SL 的 1800").toBeLessThan(1800);
    // 反方向：便宜的過關方式是把預設全部歸零，那跟 9999 一樣壞。
    expect((p["damage"] as { perRank: number[] }).perRank[0]).toBeGreaterThan(50);
    expect((fanout["damage"] as { perRank: number[] }).perRank[0]).toBeGreaterThan(50);
  });
});
