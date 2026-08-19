/**
 * GH#374 洞② 的守衛 —— **一支只有 `spawnVfx` 的技能，普查不可以算它 ✅**。
 *
 * 普查在此之前把 `vfxSpawn` 收進「有效果」的事件表，於是「按下去噴個光、血量／
 * 位置／狀態一個都沒動」與一支真的會打人的技能量起來一模一樣（失敗形態④：斷言
 * 方向跟缺陷無關）—— GH#373 那 5 支主動天生技就是這樣在全綠底下上架的。
 *
 * ⛔ 不掃字串：註冊一支真的假技能，在真的 SimWorld 裡真的施放一次，交給**出貨的
 * 那一份**判定（`castabilityVerdict.ts`，普查讀同一份 —— 失敗形態⑤）。
 * 控制組是同一條路上一支有傷害的技能：少了它，一個「永遠回 FAIL」的壞判定也會綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { registerChampion } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { classifyCastOutcome, snapshotChannels, stochasticNodeKinds } from "./castabilityVerdict";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type SeatId } from "../ids";
import type { AbilityDef, ChampionDef } from "./content/defs";
import type { EffectDef } from "./effects/effect";
import type { IntentFrame } from "./intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
/** North of the zone centre — clear of the three SKELETON_ARENA pillars. */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };

const qDef = (name: string, effects: EffectDef[]): AbilityDef => ({
  id: `test.castability.${name}` as AbilityId, name, slot: "Q", castType: "targeted",
  maxRank: 1, cooldown: [1], manaCost: [0], range: 20, targetsEnemies: true, effects,
});
const VFX_ONLY = qDef("vfx-only", [{ kind: "spawnVfx", vfxId: "test.sparkle" }]);
const REAL = qDef("real", [{ kind: "damage", damageType: "magic", amount: { flat: 50 } }]);
/**
 * ⭐ 2026-08-19（GH#385）—— 交換是**看得見的 gameplay 頻道**。
 * `swapResource` 刻意繞開傷害／治療佇列（護甲、護盾、【重創】都不該醒過來），
 * 代價是它在此之前一個觀察者都沒有：44-002 交換筆記本把兩條血條各改上百點，
 * 而普查回報「接受施放但量不到效果」。
 */
const SWAP = qDef("swap", [
  { kind: "swapResource", shape: "single", resource: "health", clampMin: 1 },
]);
/**
 * ⭐ 2026-08-20（GH#407）—— 金幣是**看得見的 gameplay 頻道**。
 * 57-00 哆啦A夢的天生技是一顆 `weightedBranch`，權重最大的那一支（55/100）整支
 * payload 就是 `grantGold` —— 少了這根指針，那一格有一半的 seed 會量出「什麼都
 * 沒發生」，而普查會把它記成「這一格是擲骰」，真相是儀器沒在看。
 */
const GOLD = qDef("gold", [{ kind: "grantGold", flat: 25, to: "self" }]);
const VFX_CHAMP = "test.castability.champ.vfx" as ChampionId;
const REAL_CHAMP = "test.castability.champ.real" as ChampionId;
const SWAP_CHAMP = "test.castability.champ.swap" as ChampionId;
const GOLD_CHAMP = "test.castability.champ.gold" as ChampionId;

/**
 * SELA 的骨架卡片，Q 換成受測的那一支。
 * ⚠️ `passive` 必須拿掉：SELA 的天生技【Kindling】掛在 `onAbilityHit` 上、每次技能
 * 命中補 12 點魔法傷害 —— 留著的話**連純特效技能都會量到 damage**，這條守衛就會
 * 對著一個假的綠色點頭（第一次寫就踩到了）。
 */
function champWithQ(id: ChampionId, q: AbilityDef): ChampionDef {
  return { ...SELA, id, passive: undefined, abilities: { ...SELA.abilities, Q: q } };
}

beforeAll(() => {
  registerSkeletonContent();
  registerChampion(champWithQ(VFX_CHAMP, VFX_ONLY), { overrideAbilities: true });
  registerChampion(champWithQ(REAL_CHAMP, REAL), { overrideAbilities: true });
  registerChampion(champWithQ(SWAP_CHAMP, SWAP), { overrideAbilities: true });
  registerChampion(champWithQ(GOLD_CHAMP, GOLD), { overrideAbilities: true });
});

/** 普查那條路的最小版：真的按一次 Q，再用出貨的判定看它。 */
function probeQ(championId: ChampionId): ReturnType<typeof classifyCastOutcome> {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const at = (dx: number) => ({ x: P.x + dx, z: P.z });
  const caster = spawnChampion(world, { championId, seatId: asSeatId(0), teamId: asTeamId(0), pos: at(0), zone: 0 });
  const foe = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: at(1.35), zone: 0 });
  world.step(NO_INTENTS);
  world.rebuildGrid();

  const before = snapshotChannels(world);
  const events: string[] = [];
  expect(castAbility(world, caster, "Q", { type: "entity", entityId: foe })).toBe("ok");
  events.push(...world.events.map((e) => e.type));
  for (let i = 0; i < 30; i++) {
    world.step(NO_INTENTS);
    events.push(...world.events.map((e) => e.type));
  }
  return classifyCastOutcome({ events, before, after: snapshotChannels(world), moved: false, effectsAuthored: 1 });
}

describe("castability sweep — 只有特效的技能不算「有效果」（GH#374 洞②）", () => {
  it("整棵樹只有 spawnVfx 的技能量出 VFX_ONLY，⛔ 永遠不是 PASS", () => {
    const out = probeQ(VFX_CHAMP);
    expect(out.verdict, "純特效技能被算成 ✅ —— 普查對第一·五守則那一族缺陷說謊了").not.toBe("PASS");
    expect(out.verdict).toBe("VFX_ONLY");
    expect(out.channel).toBe("vfx");
  });

  it("控制組：同一條路上一支真的有傷害的技能仍然是 PASS", () => {
    expect(probeQ(REAL_CHAMP).verdict).toBe("PASS");
  });

  it("交換資源（`swapResource`）是 gameplay 頻道，⛔ 不是「量不到效果」", () => {
    const out = probeQ(SWAP_CHAMP);
    expect(
      out.verdict,
      "兩條血條被改寫上百點卻量不到 —— `swapResource` 沒有發 `resourceSwap`，" +
        "或那個事件沒有進 EFFECT_EVENTS（44-002 交換筆記本就是這樣變成假 ❌ 的）",
    ).toBe("PASS");
    expect(out.channel).toBe("resourceSwap");
  });

  it("金幣是 gameplay 頻道 —— 一支只發錢的技能是 PASS，⛔ 不是「量不到效果」（GH#407）", () => {
    const out = probeQ(GOLD_CHAMP);
    expect(
      out.verdict,
      "口袋裡的數字真的變了卻量不到 —— `snapshotChannels` 沒有金幣那根指針，" +
        "於是 57-00 那顆 `weightedBranch` 有 55% 的 seed 會量出「什麼都沒發生」（GH#407）",
    ).toBe("PASS");
    expect(out.channel).toBe("gold");
  });
});

/**
 * GH#407 —— 「這一格要不要跨 seed 量」的判準，本身要是**一條從樹推導出來的規則**。
 * ⛔ 不掃技能 id：下一支用 `weightedBranch` 的技能不該需要改任何一行。
 */
describe("castability sweep — 隨機節點偵測（GH#407）", () => {
  it("認得三種會讓判定隨 seed 改變的節點，而且只認**真的**會分岔的那些", () => {
    const live = stochasticNodeKinds([
      { kind: "weightedBranch", branches: [{ weight: 3, effects: [] }, { weight: 1, effects: [] }] },
      { kind: "damage", condition: { all: [{ kind: "chance", p: 0.3 }] } },
      { kind: "randomArea", count: [4] },
    ]);
    expect([...live].sort()).toEqual(["chance", "randomArea", "weightedBranch"]);

    // 控制組：**決定性**的同名節點不可以被收進來，否則整份普查會多跑 24 倍。
    const dead = stochasticNodeKinds([
      { kind: "weightedBranch", branches: [{ weight: 1, effects: [] }, { weight: 0, effects: [] }] },
      { kind: "damage", condition: { kind: "chance", p: 1 } },
    ]);
    expect([...dead]).toEqual([]);
  });
});
