/**
 * 百分比**自傷**（`healthDrainPctOfMax`）—— 引擎機制守衛。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 2026-08-08：這一支改名了，因為它已經不是「Berserker 的守衛」
 * ════════════════════════════════════════════════════════════════════════════
 * 舊檔名是 `berserkerPctDrain.test.ts`，而且刻意**讀出貨的
 * `content/champions/godie-hapm.json`** 來驅動 —— 那個設計在當時是對的（唯一的
 * 使用者就是那張卡，手寫夾具會在有人把那一格刪掉時靜默轉綠，失敗形態 ⑤）。
 *
 * owner 2026-08-08 把海克力斯的天生技 52-00 重製成【十二道試煉】的**標記**機制
 * （`sim/marks.ts`），自傷那一格因此歸 0。於是這個引擎機制在出貨內容裡
 * **零使用者** —— 「讀出貨的卡」在這裡會變成一條驗不到東西的空測試。
 *
 * 所以拆成兩個方向，兩邊都有人守：
 *   · **機制**（血條單調下降 / 打到地板停手 / stop ≠ clamp / 每一格都是欄位）
 *     —— 用一位**合成英雄**（骨架卡 + 一格自傷）跑真的 `world.step()`。
 *     機制本身是泛用的引擎能力，跟哪一位英雄在用它無關。
 *   · **零使用者**（本檔第一個 describe）—— 掃全部出貨英雄卡。它取代了舊檔頭
 *     「有人把那一格從卡片上刪掉會紅」的那個保護：現在**有人把它加回來**才紅，
 *     而那正是「該把機制守衛接回真實內容」的時刻。
 *
 * ⛔ 出貨的數值（12 層試煉、0.012、地板 1% …）**不住在這裡**。它們有三個住處
 * （`content/` + Zod `DEFAULT_*` + admin `SHIPPED_*`）與 drift 測試在守；抄進斷言
 * 就是第四個住處，而它沒有守衛。這裡驗的一律是「機制會不會發生」。
 *
 * 斷言讀的是 `world.health.get(id).hp` 跑完真 `step()` 之後的**軌跡**，
 * 不是 `world.regenRules` 上的欄位值（失敗形態 ⑦）。
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/champions/godie-hapm.json`
 *   · `content/champions/godie-hapm.json` 是 **skillremake:json · tiers:apply** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh <那一支>`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     batch1.py 從 tools/skill-remake/heroes/<英雄>.py 整份重建英雄卡;tiers:apply 另外把技能的
 *     五級距欄位**單向**鏡射進卡片內嵌副本 ⇒ 改內嵌副本一定被 standalone 蓋掉。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { Champions, registerChampion } from "./content/registry";
import { registerSkeletonContent, SELA } from "./content/skeleton";
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
const Z0 = SKELETON_ARENA.zones[0]!;

/** 合成英雄的 id —— 出貨內容裡不存在，這是刻意的。 */
const DUMMY = "drain-dummy" as ChampionId;
/**
 * 夾具自己的自傷比例。**不是出貨值**，也不該去對齊出貨值 —— 它只需要大到
 * 「明顯壓過卡片上那條固定回血」，讓每一條斷言都能指認是哪條路在動血條。
 */
const FIXTURE_PCT = 0.05;

/**
 * 「出貨英雄卡」的**母體** —— 直接列 `content/champions/` 這個目錄。
 *
 * ⚠️ 這裡原本讀 `_index.json` 並且斷言 `entries.length > 100`。owner 2026-08-13
 * 把 41 位沒上架的英雄搬進 `content/_legacy/champions/`（那個目錄不在
 * `COLLECTION_NAMES` 裡，引擎讀不到它），營運名單掉到 78 —— 那個 100 是一個
 * **抄來的出貨值**，也就是 CLAUDE.md 說的「第四個住處」，所以它跟著名單過期了。
 *
 * 現在母體跟著目錄走：誰在營運名單裡由 `content/champions/` 定義，再搬一次
 * 也不必回來改這一行。
 */
function shippedChampionCards(): { id: string; doc: ChampionDef }[] {
  const dir = join(CONTENT_DIR, "champions");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => ({
      id: f.slice(0, -".json".length),
      doc: JSON.parse(readFileSync(join(dir, f), "utf-8")) as ChampionDef,
    }));
}

/** 骨架英雄卡 + 一格自傷。除了那一格，其餘與 `SELA` 逐位元相同。 */
function drainFixture(): ChampionDef {
  return {
    ...(structuredClone(SELA) as ChampionDef),
    id: DUMMY,
    name: "自傷夾具",
    healthDrainPctOfMax: FIXTURE_PCT,
  };
}

/**
 * 一個**開著戰鬥**的世界 + 一位帶自傷的合成英雄。`combatActive` 是扣血的閘
 * （和火圈 / 殭屍波 / `onInterval` 同一條規矩，理由寫在 `RegenSystem` 檔頭）。
 */
function arena(seed = 7): { world: SimWorld; id: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  world.combatActive = true;
  const id = spawnChampion(world, {
    championId: DUMMY,
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
  registerChampion(drainFixture());
});

describe("零使用者 —— 出貨內容裡目前沒有人在用百分比自傷", () => {
  it("沒有任何一張出貨英雄卡把自傷開起來（> 0）", () => {
    // ⭐ 這條紅了**不是缺陷**，是訊號。
    // 零使用者是 2026-08-08 的事實：海克力斯（godie-hapm）的天生技 52-00 改成
    // 【十二道試煉】的標記機制，自傷那一格歸 0。機制留著是因為它是一個可調的
    // 引擎能力，不是因為有人在用。
    // 哪天這條紅了 = 有人重新開始用它 —— 那時候請把上面那些機制守衛從合成英雄
    // 改回讀**那張真的卡**（失敗形態 ⑤：被測的不是出貨的那個）。
    const cards = shippedChampionCards();
    // 反向守衛：母體空了下面那條會變成 vacuously true，所以先釘住它不是空的。
    // ⛔ 這個下界刻意是**結構性**的，不是「至少 N 位」——「一位英雄都沒有」不是
    //    一次名單調整，那是整棵 content 樹掛了，所以它不會因為誰上下架而過期。
    expect(cards.length).toBeGreaterThan(0);
    const users = cards
      .filter((c) => typeof c.doc.healthDrainPctOfMax === "number" && c.doc.healthDrainPctOfMax > 0)
      .map((c) => c.id);
    expect(users).toEqual([]);
  });

  it("出貨的 `config/regen.json` 真的被 sim 認得 —— 不是靜默退回預設", () => {
    // 只驗「這份文件接得上」：schema 字串打錯的話 `regenRulesFromDoc` 會**安靜地**
    // 回傳那個凍結的 DEFAULT 物件，後台改的每一格都不會生效而畫面上毫無異狀。
    // ⛔ 這裡刻意**不抄**檔案裡的數字（地板 1% 之類）—— 那些是 owner 每週在改的，
    //    住在 content/ + Zod + admin 三處，抄進來就是第四個住處。
    const doc: unknown = JSON.parse(readFileSync(join(CONTENT_DIR, "config/regen.json"), "utf-8"));
    expect(regenRulesFromDoc(doc)).not.toBe(DEFAULT_REGEN_RULES);
    expect(regenRulesFromDoc({ ...(doc as object), schema: "config.regen@2" })).toBe(
      DEFAULT_REGEN_RULES,
    );
  });
});

describe("機制 —— 跑真的 tick，血條單調下降並停在地板", () => {
  it("方向：每一秒都比前一秒低，而且量級就是卡片上那一格", () => {
    const { world, id } = arena();
    const maxHp = world.health.get(id)!.maxHp;
    expect(maxHp).toBeGreaterThan(0);

    const start = world.health.get(id)!.hp;
    let prev = start;
    // 單調：一秒一個取樣點。符號翻回去（「回血」的實作）在第一個取樣點就紅。
    for (let s = 0; s < 10; s++) {
      step(world, 30);
      const now = world.health.get(id)!.hp;
      expect(now, `第 ${s + 1} 秒沒有比前一秒低`).toBeLessThan(prev);
      prev = now;
    }
    // 兩邊都有界，兩邊都由**夾具自己的**那一格推導：
    //   上界 —— 淨值不可能超過毛額（卡片上的固定回血會抵掉一點點）；
    //   下界 —— 掉的量必須是同一個量級，不是「有動就算」。
    const lost = start - prev;
    const gross = maxHp * FIXTURE_PCT * 10;
    expect(lost).toBeLessThanOrEqual(gross);
    expect(lost).toBeGreaterThan(gross * 0.8);
  });

  it("打到地板就停 —— 停得**精準**，而且再跑一分鐘也不會更低", () => {
    const { world, id } = arena(11);
    const maxHp = world.health.get(id)!.maxHp;
    const floor = maxHp * world.regenRules.drainFloorPctOfMax;

    step(world, 30 * 60);
    expect(world.health.get(id)!.alive).toBe(true);
    // 精準停在地板，不是「大概附近」：每 tick 的固定回血把血條頂高一點點，
    // 扣血就只拿走那一點點（`room` 夾值），所以 tick 結束時剛好等於地板。
    expect(world.health.get(id)!.hp).toBeCloseTo(floor, 6);

    // 再一分鐘。地板拿掉的話這裡會是負數（而且 alive 還是 true —— 那正是
    // `MIN_ALIVE_HP` 存在的理由）。
    step(world, 30 * 60);
    expect(world.health.get(id)!.hp).toBeCloseTo(floor, 6);
    expect(world.health.get(id)!.alive).toBe(true);
  });

  it("地板不是無敵：被打到地板以下的人**不會**被扣血這條路拉回來（stop ≠ clamp）", () => {
    const { world, id } = arena(13);
    step(world, 30 * 60); // 掉到地板
    const maxHp = world.health.get(id)!.maxHp;
    const floor = maxHp * world.regenRules.drainFloorPctOfMax;
    expect(world.health.get(id)!.hp).toBeCloseTo(floor, 6);

    // 模擬敵人那一發：把血條打到地板的一半。
    world.health.get(id)!.hp = floor / 2;
    step(world, 1);
    expect(world.health.get(id)!.hp, "stop 模式不可以把血條往上拉到地板").toBeLessThan(floor);

    // 同一個局面換成 clamp：同一 tick 就被**補回**地板 = 免疫致死。
    world.regenRules = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainFloorMode: "clamp" });
    world.health.get(id)!.hp = floor / 2;
    step(world, 1);
    expect(world.health.get(id)!.hp).toBeCloseTo(floor, 6);
  });

  it("戰鬥沒開（中場/商店）完全不扣 —— 逐位元等同這個機制出現之前", () => {
    const { world, id } = arena(17);
    world.combatActive = false;
    const before = world.health.get(id)!.hp;
    step(world, 30 * 5);
    // 滿血，所以固定回血被 maxHp 夾住 → 血條一動也不動。
    expect(world.health.get(id)!.hp).toBe(before);
  });
});

describe("機制 —— 每一格都是欄位", () => {
  it("drainEnabled=false → 血條不再下降（止血閥）", () => {
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
    step(world, 30 * 60);
    expect(world.health.get(id)!.hp).toBeCloseTo(maxHp * 0.5, 6);
  });

  it("drainChampionsOnly=true（出貨）擋掉非英雄；關掉之後小怪也會自己掉血", () => {
    const mob = { maxHp: 60000, pctOfMax: 0.01, isChampion: false };
    expect(healthDrainPerSec(mob, DEFAULT_REGEN_RULES)).toBe(0);
    const all = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainChampionsOnly: false });
    expect(healthDrainPerSec(mob, all)).toBe(600);
  });

  it("drainFloorMode=clamp 會把被打到地板以下的人**拉回**地板（= 免疫致死）", () => {
    const clamp = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainFloorMode: "clamp" });
    // 血量 5，地板 10：clamp 把他補回 10，stop 一點都不動。
    expect(applyHealthDrain(5, 1000, 10, clamp)).toBe(10);
    expect(applyHealthDrain(5, 1000, 10, DEFAULT_REGEN_RULES)).toBe(5);
  });

  it("地板 0 也扣不死人 —— 有效地板夾在 1 點，不會生出「0 血還活著」", () => {
    const noFloor = normalizeRegenRules({ ...DEFAULT_REGEN_RULES, drainFloorPctOfMax: 0 });
    expect(noFloor.drainFloorPctOfMax).toBe(0);
    expect(drainFloorHp(1000, noFloor)).toBe(MIN_ALIVE_HP);
    expect(applyHealthDrain(3, 1000, 99999, noFloor)).toBe(MIN_ALIVE_HP);
  });

  it("垃圾值 / 超界 → 夾回合法區間或退回出貨值，絕不產生 NaN", () => {
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
