/**
 * Berserker 每秒回 1% 最大生命、**沒有保底** (GH#253).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支測的是**出貨的那一張卡**
 * ════════════════════════════════════════════════════════════════════════════
 * 英雄卡從 `content/champions/godie-hapm.json` 讀進來註冊,不是測試自己手寫一個
 * `healthRegenPctOfMax: 0.01` 的 fixture —— 那種寫法在有人把那一格從卡片上刪掉
 * 之後永遠是綠的(失敗形態 ⑤)。
 *
 * 量的是**真的跑過的 tick 之後血條動了多少**,不是 `world.regenRules` 上的欄位
 * 值(失敗形態 ⑦)。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 「沒有保底」在這裡怎麼證
 * ════════════════════════════════════════════════════════════════════════════
 * 保底的定義是「不管最大生命多少,每秒至少回 N 點」。所以反證是:**把最大生命
 * 壓到很低,回血必須跟著等比例變小**。第二組就是這件事 —— 一個 100 點血的身體
 * 每秒只回 1 點,而不是回一個跟固定回血一樣大的數字。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { Champions, registerChampion } from "./content/registry";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import { Stat } from "./stats/statTypes";
import type { ChampionDef } from "./content/defs";
import {
  DEFAULT_REGEN_RULES,
  healthRegenPerSec,
  normalizeRegenRules,
  regenRulesFromDoc,
} from "./regenRules";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const BERSERKER = "godie-hapm" as ChampionId;
const Z0 = SKELETON_ARENA.zones[0]!;

/** 出貨的那一張英雄卡,原封不動。 */
function shippedBerserker(): ChampionDef {
  return JSON.parse(
    readFileSync(join(CONTENT_DIR, "champions/godie-hapm.json"), "utf-8"),
  ) as ChampionDef;
}

function spawnBerserker(world: SimWorld): EntityId {
  return spawnChampion(world, {
    championId: BERSERKER,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { ...Z0.center },
    zone: 0,
  });
}

/** 跑 `seconds` 秒,回報血量實際增加了多少(先扣到半血,讓回血有空間)。 */
function measureRegen(world: SimWorld, id: EntityId, seconds: number): number {
  const hp = world.health.get(id)!;
  hp.hp = hp.maxHp / 2;
  const before = hp.hp;
  const ticks = Math.round(seconds / world.dt);
  for (let k = 0; k < ticks; k++) world.step(new Map());
  return world.health.get(id)!.hp - before;
}

beforeEach(() => {
  Champions.clear();
  registerSkeletonContent();
  registerChampion(shippedBerserker());
});

describe("GH#253 —— 出貨的英雄卡真的帶著 1%", () => {
  it("content/champions/godie-hapm.json 的 healthRegenPctOfMax 就是 0.01", () => {
    expect(shippedBerserker().healthRegenPctOfMax).toBe(0.01);
  });

  it("content/config/regen.json 解析出 owner 的「取代 + 沒有保底」", () => {
    const doc: unknown = JSON.parse(readFileSync(join(CONTENT_DIR, "config/regen.json"), "utf-8"));
    const rules = regenRulesFromDoc(doc);
    expect(rules.pctEnabled).toBe(true);
    expect(rules.pctMode).toBe("replace");
    expect(rules.floorPerSec).toBe(0);
  });
});

describe("GH#253 —— 跑真的 tick,量出來就是每秒 1% 最大生命", () => {
  it("10 秒回 10% 最大生命(誤差 < 1%)", () => {
    const world = new SimWorld(SKELETON_ARENA, 5);
    const id = spawnBerserker(world);
    const maxHp = world.health.get(id)!.maxHp;
    const gained = measureRegen(world, id, 10);

    expect(maxHp).toBeGreaterThan(0);
    expect(gained).toBeCloseTo(maxHp * 0.1, 1);
    // 而且它**不是**卡片上那條固定回血 —— 兩者差一個量級,不然這條斷言證明不了
    // 是哪一條路在動。
    const flat = world.stats.get(id)!.final[Stat.HealthRegen];
    expect(gained / 10).toBeGreaterThan(flat * 5);
  });

  it("換算成每秒:`healthRegenPerSec` 給的就是 maxHp × 0.01", () => {
    const world = new SimWorld(SKELETON_ARENA, 5);
    const id = spawnBerserker(world);
    const hp = world.health.get(id)!;
    const perSec = healthRegenPerSec(
      {
        flatPerSec: world.stats.get(id)!.final[Stat.HealthRegen],
        maxHp: hp.maxHp,
        pctOfMax: Champions.get(BERSERKER).healthRegenPctOfMax,
        envHealthRegen: world.combatEnv.healthRegen,
        isChampion: true,
      },
      world.regenRules,
    );
    expect(perSec).toBeCloseTo(hp.maxHp * 0.01, 6);
  });
});

describe("GH#253 —— 沒有保底(反證:小身體只回小數字)", () => {
  it("最大生命 100 的身體每秒只回 1 點,不是一個固定的最小值", () => {
    const world = new SimWorld(SKELETON_ARENA, 6);
    const id = spawnBerserker(world);
    const hp = world.health.get(id)!;
    // 直接把血條上限壓低 —— 「保底」的定義就是「跟最大生命無關」,所以這是
    // 唯一能把它逼出來的實驗。
    hp.maxHp = 100;
    world.stats.get(id)!.dirty = false;

    const gained = measureRegen(world, id, 10);
    expect(gained).toBeCloseTo(10, 1); // 100 × 1% × 10 秒
    // 反例(這一條就是「保底」長什麼樣):固定回血那條路在同一個身體上會給出
    // 一個跟 100 完全無關的數字。
    const flat = world.stats.get(id)!.final[Stat.HealthRegen];
    expect(gained / 10).toBeLessThan(flat);
  });

  it("floorPerSec 是欄位:填 50 之後同一個小身體就吃到地板(所以出貨的 0 不是巧合)", () => {
    const rules = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, floorPerSec: 50 });
    const withFloor = healthRegenPerSec(
      { flatPerSec: 1.41, maxHp: 100, pctOfMax: 0.01, envHealthRegen: 1, isChampion: true },
      rules,
    );
    expect(withFloor).toBe(50);
    const noFloor = healthRegenPerSec(
      { flatPerSec: 1.41, maxHp: 100, pctOfMax: 0.01, envHealthRegen: 1, isChampion: true },
      DEFAULT_REGEN_RULES,
    );
    expect(noFloor).toBe(1);
  });
});

describe("GH#253 —— 每一格都是欄位", () => {
  it("pctMode=add 會把固定回血加回來(= 一條與最大生命無關的地板)", () => {
    const add = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, pctMode: "add" });
    expect(
      healthRegenPerSec(
        { flatPerSec: 1.41, maxHp: 100, pctOfMax: 0.01, envHealthRegen: 1, isChampion: true },
        add,
      ),
    ).toBeCloseTo(2.41, 6);
  });

  it("pctEnabled=false → 完全退回固定回血(這個機制出現之前的行為)", () => {
    const off = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, pctEnabled: false });
    expect(
      healthRegenPerSec(
        { flatPerSec: 1.41, maxHp: 7500, pctOfMax: 0.01, envHealthRegen: 1, isChampion: true },
        off,
      ),
    ).toBeCloseTo(1.41, 6);
  });

  it("championsOnly=true(出貨)擋掉非英雄;關掉之後小怪也吃得到", () => {
    const mob = { flatPerSec: 0, maxHp: 60000, pctOfMax: 0.01, envHealthRegen: 1, isChampion: false };
    expect(healthRegenPerSec(mob, DEFAULT_REGEN_RULES)).toBe(0);
    const all = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, championsOnly: false });
    expect(healthRegenPerSec(mob, all)).toBe(600);
  });

  it("applyEnvMultiplier 決定百分比吃不吃 戰鬥系統 的全域回血倍率", () => {
    const on = { flatPerSec: 0, maxHp: 1000, pctOfMax: 0.01, envHealthRegen: 2, isChampion: true };
    expect(healthRegenPerSec(on, DEFAULT_REGEN_RULES)).toBeCloseTo(20, 6);
    const off = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, applyEnvMultiplier: false });
    expect(healthRegenPerSec(on, off)).toBeCloseTo(10, 6);
  });

  it("垃圾值 / 缺文件 → 出貨預設,絕不產生 NaN 或 undefined 分支", () => {
    expect(regenRulesFromDoc(undefined)).toEqual(DEFAULT_REGEN_RULES);
    expect(regenRulesFromDoc({ schema: "config.regen@2" })).toEqual(DEFAULT_REGEN_RULES);
    const junk = normalizeRegenRules({ pctMode: "叫什麼都好", floorPerSec: -9, pctEnabled: 1 });
    expect(junk.pctMode).toBe("replace");
    expect(junk.floorPerSec).toBe(0);
    expect(junk.pctEnabled).toBe(true);
    expect(
      Number.isFinite(
        healthRegenPerSec(
          { flatPerSec: 1, maxHp: 100, pctOfMax: 0.01, envHealthRegen: NaN, isChampion: true },
          junk,
        ),
      ),
    ).toBe(true);
  });

  it("沒填百分比的英雄逐位元不受影響 —— 固定回血照舊", () => {
    const plain = { flatPerSec: 3.5, maxHp: 9999, pctOfMax: undefined, envHealthRegen: 1, isChampion: true };
    expect(healthRegenPerSec(plain, DEFAULT_REGEN_RULES)).toBe(3.5);
  });
});
