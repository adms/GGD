/**
 * Berserker 每秒**損失** 1% 最大生命,停在最大生命的 1%
 * (owner 2026-08-02:「Berseker 是每秒損失 1%生命, 直到生命不足1%」).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 這一支測的是**出貨的那一張卡跑出來的血條**
 * ════════════════════════════════════════════════════════════════════════════
 * 英雄卡從 `content/champions/godie-hapm.json` 讀進來註冊,不是測試自己手寫一個
 * `healthDrainPctOfMax: 0.01` 的 fixture —— 那種寫法在有人把那一格從卡片上刪掉
 * 之後永遠是綠的(失敗形態 ⑤)。
 *
 * 斷言讀的是 `world.health.get(id).hp` 在跑完真的 `step()` 之後的**軌跡**,
 * 不是 `world.regenRules` 上的欄位值(失敗形態 ⑦)。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三個問題,三組斷言
 * ════════════════════════════════════════════════════════════════════════════
 * 1. **方向** —— 血條單調下降。這一條把 8/1 的「每秒回 1%」與 8/2 的「每秒損失
 *    1%」分開,而且是唯一能分開它們的形狀:符號翻回去,`toBeLessThan` 全紅。
 * 2. **地板** —— 掉到最大生命的 1% 就停,而且**再跑一分鐘也不會再低一點**。
 *    地板拿掉的話他會一路掉到 0(甚至負數)。
 * 3. **地板不是無敵** —— 一個已經貼在地板上的 Berserker,被一發傷害照樣會死。
 *    這是 `drainFloorMode: "stop"` 和 `"clamp"` 的差別,也是 owner 要的那一個:
 *    自傷不負責殺你,但它也不保護你。
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
import type { ChampionDef } from "./content/defs";
import {
  DEFAULT_REGEN_RULES,
  MIN_ALIVE_HP,
  applyHealthDrain,
  drainFloorHp,
  healthDrainPerSec,
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
 * 一個**開著戰鬥**的世界 + 一位 Berserker。`combatActive` 是扣血的閘
 * (和火圈 / 殭屍波 / `onInterval` 同一條規矩,理由寫在 `RegenSystem` 檔頭)。
 */
function arena(seed = 7): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  const id = spawnChampion(world, {
    championId: BERSERKER,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { ...Z0.center },
    zone: 0,
  });
  return { world, id };
}

function step(world: SimWorld, ticks: number): void {
  for (let k = 0; k < ticks; k++) world.step(new Map());
}

beforeEach(() => {
  Champions.clear();
  registerSkeletonContent();
  registerChampion(shippedBerserker());
});

describe("owner 2026-08-02 —— 出貨的英雄卡與設定檔真的帶著「損失」", () => {
  it("content/champions/godie-hapm.json 填的是 healthDrainPctOfMax: 0.012,而且**不再**有回血百分比", () => {
    const card = shippedBerserker();
    // owner 2026-08-02:「天生技 hook => -1.2%, healthRegenPctOfMax=0」。
    // ⚠️ 這兩件事一起講是有意義的：1.2% 是**淨值**，沒有回血抵掉零頭。
    // （2026-08-01 那一版是 +1%/秒 的回血疊 −0.12%/秒 的 hook，淨 +0.88%——
    //  方向完全相反，而畫面上只是「他的血不太會動」。）
    expect(card.healthDrainPctOfMax).toBe(0.012);
    // 這一條擋的是「兩個機制同時掛著互相抵銷」:8/1 的回血 1% 沒拿掉的話,
    // 淨值是 0,而畫面上看起來只是「他的血不會動」。
    expect(card.healthRegenPctOfMax).toBeUndefined();
  });

  it("content/config/regen.json 解析出「地板 1% + 停手(不是夾住)」", () => {
    const doc: unknown = JSON.parse(readFileSync(join(CONTENT_DIR, "config/regen.json"), "utf-8"));
    const rules = regenRulesFromDoc(doc);
    expect(rules.drainEnabled).toBe(true);
    expect(rules.drainFloorPctOfMax).toBe(0.01);
    expect(rules.drainFloorMode).toBe("stop");
    expect(rules.drainChampionsOnly).toBe(true);
  });
});

describe("owner 2026-08-02 —— 跑真的 tick,血條單調下降並停在地板", () => {
  it("10 秒掉掉約 10% 最大生命,而且每一秒都比前一秒低", () => {
    const { world, id } = arena();
    const maxHp = world.health.get(id)!.maxHp;
    expect(maxHp).toBeGreaterThan(0);

    const start = world.health.get(id)!.hp;
    let prev = start;
    // 單調:一秒一個取樣點,10 個點每一個都嚴格比前一個低。
    // 「回血」的實作在這裡第一個取樣點就會紅。
    for (let s = 0; s < 10; s++) {
      step(world, 30);
      const now = world.health.get(id)!.hp;
      expect(now, `第 ${s + 1} 秒沒有比前一秒低`).toBeLessThan(prev);
      prev = now;
    }
    const lost = start - prev;
    // **淨**速率 = 1% 最大生命 − 固定回血(約 1.4 點/秒,量到的淨值是
    // 12.76/秒 vs 毛額 14.17/秒)。所以 10 秒的合理區間是 8.5 ～ 10.1 秒份 ——
    // **兩邊都有界**:量級調大上界紅,調小或翻成回血下界紅。
    expect(lost).toBeGreaterThan(maxHp * 0.012 * 8.5);
    expect(lost).toBeLessThan(maxHp * 0.012 * 10.1);
  });

  it("掉到最大生命的 1% 就停 —— 停得**精準**,而且再跑一分鐘也不會更低", () => {
    const { world, id } = arena(11);
    const maxHp = world.health.get(id)!.maxHp;
    const floor = maxHp * 0.01;

    // 130 秒:淨速率是「1% 最大生命 − 固定回血」,所以從滿血走到地板要比
    // 100 秒多一些(量到約 110 秒)。
    step(world, 30 * 130);
    const atFloor = world.health.get(id)!.hp;
    expect(world.health.get(id)!.alive).toBe(true);
    // 精準停在地板,不是「大概附近」:每 tick 的固定回血把血條頂高一點點,
    // 扣血就只拿走那一點點(`room` 夾值),所以 tick 結束時剛好等於地板。
    expect(atFloor).toBeCloseTo(floor, 6);

    // 再一分鐘。地板拿掉的話這裡會是負數(而且 alive 還是 true —— 那正是
    // `MIN_ALIVE_HP` 存在的理由)。
    step(world, 30 * 60);
    expect(world.health.get(id)!.hp).toBeCloseTo(floor, 6);
    expect(world.health.get(id)!.alive).toBe(true);
  });

  it("地板不是無敵:被打到地板以下的人**不會**被扣血這條路拉回來(stop ≠ clamp)", () => {
    const { world, id } = arena(13);
    step(world, 30 * 130); // 掉到地板
    const maxHp = world.health.get(id)!.maxHp;
    const floor = maxHp * 0.01;
    expect(world.health.get(id)!.hp).toBeCloseTo(floor, 6);

    // 模擬敵人那一發:把血條打到地板的一半。
    world.health.get(id)!.hp = floor / 2;
    step(world, 1);
    const afterStop = world.health.get(id)!.hp;
    expect(afterStop, "stop 模式不可以把血條往上拉到地板").toBeLessThan(floor);

    // 同一個局面換成 clamp:同一 tick 就被**補回**地板 = 免疫致死。
    world.regenRules = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainFloorMode: "clamp" });
    world.health.get(id)!.hp = floor / 2;
    step(world, 1);
    expect(world.health.get(id)!.hp).toBeCloseTo(floor, 6);
  });

  it("戰鬥沒開(中場/商店)完全不扣 —— 逐位元等同這個機制出現之前", () => {
    const { world, id } = arena(17);
    world.combatActive = false;
    const before = world.health.get(id)!.hp;
    step(world, 30 * 5);
    // 滿血,所以固定回血被 maxHp 夾住 → 血條一動也不動。
    expect(world.health.get(id)!.hp).toBe(before);
  });
});

describe("owner 2026-08-02 —— 每一格都是欄位", () => {
  it("drainEnabled=false → 血條不再下降(止血閥)", () => {
    const { world, id } = arena(19);
    world.regenRules = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainEnabled: false });
    const before = world.health.get(id)!.hp;
    step(world, 30 * 5);
    expect(world.health.get(id)!.hp).toBe(before);
  });

  it("drainFloorPctOfMax 決定停在哪 —— 50% 的地板讓他停在半血", () => {
    const { world, id } = arena(23);
    world.regenRules = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainFloorPctOfMax: 0.5 });
    const maxHp = world.health.get(id)!.maxHp;
    step(world, 30 * 100);
    const hp = world.health.get(id)!.hp;
    expect(hp).toBeGreaterThanOrEqual(maxHp * 0.5 * 0.99);
    expect(hp).toBeLessThan(maxHp * 0.5 * 1.2);
  });

  it("drainChampionsOnly=true(出貨)擋掉非英雄;關掉之後小怪也會自己掉血", () => {
    const mob = { maxHp: 60000, pctOfMax: 0.01, isChampion: false };
    expect(healthDrainPerSec(mob, DEFAULT_REGEN_RULES)).toBe(0);
    const all = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainChampionsOnly: false });
    expect(healthDrainPerSec(mob, all)).toBe(600);
  });

  it("drainFloorMode=clamp 會把被打到地板以下的人**拉回**地板(= 免疫致死)", () => {
    const clamp = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainFloorMode: "clamp" });
    // 血量 5,地板 10:clamp 把他補回 10,stop 一點都不動。
    expect(applyHealthDrain(5, 1000, 10, clamp)).toBe(10);
    expect(applyHealthDrain(5, 1000, 10, DEFAULT_REGEN_RULES)).toBe(5);
  });

  it("地板 0 也扣不死人 —— 有效地板夾在 1 點,不會生出「0 血還活著」", () => {
    const noFloor = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainFloorPctOfMax: 0 });
    expect(noFloor.drainFloorPctOfMax).toBe(0);
    expect(drainFloorHp(1000, noFloor)).toBe(MIN_ALIVE_HP);
    expect(applyHealthDrain(3, 1000, 99999, noFloor)).toBe(MIN_ALIVE_HP);
  });

  it("垃圾值 / 超界 → 夾回合法區間或退回出貨值,絕不產生 NaN", () => {
    const junk = normalizeRegenRules({
      drainFloorPctOfMax: 99,
      drainFloorMode: "隨便寫",
      drainEnabled: "yes",
    });
    expect(junk.drainFloorPctOfMax).toBe(0.5); // DRAIN_FLOOR_PCT_MAX
    expect(junk.drainFloorMode).toBe("stop");
    expect(junk.drainEnabled).toBe(true);
    expect(
      Number.isFinite(applyHealthDrain(100, NaN, NaN, junk)),
      "NaN 的 maxHp / 扣血量不可以把血條變成 NaN",
    ).toBe(true);
    expect(healthDrainPerSec({ maxHp: NaN, pctOfMax: 0.01, isChampion: true }, junk)).toBe(0);
  });

  it("沒填自傷的英雄逐位元不受影響", () => {
    expect(
      healthDrainPerSec({ maxHp: 9999, pctOfMax: undefined, isChampion: true }, DEFAULT_REGEN_RULES),
    ).toBe(0);
    expect(applyHealthDrain(500, 1000, 0, DEFAULT_REGEN_RULES)).toBe(500);
  });
});
