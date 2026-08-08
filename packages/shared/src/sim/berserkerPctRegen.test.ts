/**
 * 百分比回血機制 (GH#253) —— 現在**沒有任何一位出貨英雄在用它**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ owner 2026-08-02 把方向反過來了
 * ════════════════════════════════════════════════════════════════════════════
 * 8/1 是「Berserker HP 回血 1%每秒,沒有保底」,於是 `godie-hapm` 的卡片上填了
 * `healthRegenPctOfMax: 0.01`。8/2 的更正是「Berseker 是每秒**損失** 1%生命,
 * 直到生命不足1%」—— 那一格翻成了 `healthDrainPctOfMax`。
 *
 * ⚠️ 2026-08-08 又動了一次:owner 把海克力斯的天生技 52-00 重製成【十二道試煉】的
 * **標記**機制(`sim/marks.ts`),`healthDrainPctOfMax` 因此也歸 0。所以現在
 * **回血與自傷兩族在出貨內容裡都是零使用者** —— 自傷那半邊的機制守衛與零使用者
 * 反向守衛都搬去了 `healthPctDrain.test.ts`(它同時改名了,因為它已經與 Berserker
 * 無關)。這一支只留回血那半邊。
 *
 * 所以這一支守的是**這個機制本身還能用、而且沒有人在用它**。
 *   · 第一組:掃全部出貨英雄卡,釘住「真的沒有人填百分比回血」;
 *   · 其餘:機制的每一格仍然是欄位,用**手寫的 fixture 英雄**跑真的世界驗。
 *     這裡用 fixture 是正確的(不是失敗形態 ⑤):出貨內容裡沒有這個機制的使用者,
 *     「讀出貨的卡」在這裡會變成一條驗不到東西的空測試。
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

/**
 * 機制測試用的**手寫 fixture**:出貨的那張卡,加上 1% 百分比回血。
 * 為什麼這裡可以手寫,見檔頭 —— 出貨內容沒有這個機制的使用者。
 * `delete` 那一行是防呆:哪天有人把自傷填回這張卡,兩個機制會互相抵銷,
 * 而畫面上只是「他的血不太會動」。
 */
function pctRegenFixture(): ChampionDef {
  const card = shippedBerserker();
  delete card.healthDrainPctOfMax;
  card.healthRegenPctOfMax = 0.01;
  return card;
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
  registerChampion(pctRegenFixture());
});

describe("owner 2026-08-02 —— 出貨內容裡沒有人在用百分比回血了", () => {
  it("出貨的 Berserker 卡片上沒有 healthRegenPctOfMax", () => {
    // 這張卡是這個機制唯一有過的使用者(8/1 那一版),所以單獨釘一條擋回歸。
    // ⛔ 這裡**不再**順帶斷言自傷那一格:2026-08-08 之後它歸 0,而那半邊的守衛
    //    (含「零使用者」反向守衛)住在 `healthPctDrain.test.ts`。
    expect(shippedBerserker().healthRegenPctOfMax).toBeUndefined();
  });

  it("整份出貨英雄目錄都沒有人填百分比回血 —— 這一族目前是 no-op", () => {
    const index = JSON.parse(
      readFileSync(join(CONTENT_DIR, "champions/_index.json"), "utf-8"),
    ) as { entries: { id: string; path: string }[] };
    // 反向守衛:目錄空了這條就變成 vacuously true,所以先釘住它不是空的。
    expect(index.entries.length).toBeGreaterThan(100);
    const withPctRegen = index.entries
      .filter((e) => {
        const doc = JSON.parse(readFileSync(join(CONTENT_DIR, e.path), "utf-8")) as ChampionDef;
        return typeof doc.healthRegenPctOfMax === "number";
      })
      .map((e) => e.id);
    expect(withPctRegen).toEqual([]);
  });

  it("content/config/regen.json 的回血那一族仍然是 owner 8/1 的「取代 + 沒有保底」", () => {
    const doc: unknown = JSON.parse(readFileSync(join(CONTENT_DIR, "config/regen.json"), "utf-8"));
    const rules = regenRulesFromDoc(doc);
    expect(rules.pctEnabled).toBe(true);
    expect(rules.pctMode).toBe("replace");
    expect(rules.floorPerSec).toBe(0);
  });
});

describe("GH#253 —— 機制還在:跑真的 tick,量出來就是每秒 1% 最大生命", () => {
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
