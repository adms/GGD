/**
 * 移動指令期間會不會攻擊 —— 全角色矩陣 (GH#216)。
 *
 * owner 回報 Saber 在有移動指令時完全不攻擊,並說「其他也有角色是這樣」。
 * 這個檔案回答的就是「其他是哪些」,而且是逐位英雄真的跑出來的,不是推論。
 *
 * ── 既有的 `autoAttackCensus.test.ts` 為什麼看不到 ──────────────────────────
 * 它用 `NO_INTENTS` 跑,也就是**完全沒有任何指令**。owner 踩到的整條路徑
 * ——「手上有一條走不到的移動指令」—— 在那份普查裡一次都沒有被走過,所以那份
 * 全綠,而遊戲裡是壞的。這正是 CLAUDE.md 第⑤種故障:被測的不是出貨的那個。
 *
 * ── 四個情境 ────────────────────────────────────────────────────────────────
 * 每一個都把英雄放在競技場邊界上、再給一條指向場外的移動指令,身體因此從第一
 * tick 就頂在牆上動不了 —— 這是實測到的災難形狀:右鍵點進柱子,|v| = 0.00
 * 連續 2,240 個 tick(75 秒),整場 0 次索敵、0 次出手。
 *
 * ⚠️ 指令**只送一次**(2026-07-30 改的)。第一版是每 tick 重送,並且說那是
 * 「類比/虛擬搖桿的行為」—— 那句話沒錯,但那個情境**刻意不在這條規則的救援
 * 範圍內**:每 tick 都有新指令 = 玩家正握著方向盤,系統替他轉向是幫倒忙。
 * 實測(出貨 Saber、真實對局)接管搖桿的代價是 2,039/2,355(86.6%)個走位
 * tick 被改寫,角色往玩家推的**反方向**跑 68 秒。所以出貨的
 * `autoEngage.respectLiveSteering` 會在每一條新指令上把方向盤還給玩家,
 * 而這張矩陣量的是**放手之後**的那個人:一次右鍵、指到到不了的地方。
 * (搖桿那一格的守衛在 `autoEngageStalledWalk.test.ts` 的 ae-stick-refresh,
 *  方向是相反的:一個 tick 都不准被接管。)
 *
 *   idle        沒有任何指令,敵人在 0.7×射程 —— 對照組
 *   inReach     有移動指令,敵人在 0.7×射程(射程內)
 *   approach    有移動指令,敵人在射程外、索敵半徑內
 *   far         有移動指令,敵人在**這一位自己的索敵半徑之外**(至少 16 單位,
 *               Saber 實測 16.25;大體型遠程角色會自動往外推,見 `FAR_MARGIN`)
 *
 * ── 兩欄:規則關 vs 規則開 ─────────────────────────────────────────────────
 * 每個情境跑兩次,`autoEngage.enabled` 一次 false(= 修正前的出貨行為)一次
 * true(= 現在)。左欄就是這張單子要證明的損害,右欄是修好之後。
 *
 * ── 斷言讀的是傷害事件 ──────────────────────────────────────────────────────
 * 全部數 `damage` 事件(`origin: "basic"`),不數 `nav.attackTarget`。索敵旗標
 * 在 #274 之後本來就是對的,壞的是旗標到傷害之間那一段。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { normalizeCombatEnv, type CombatEnvKey } from "./combatEnv";
import { DEFAULT_AUTO_ENGAGE, DEFAULT_COMBAT_FEEL } from "./combatFeel";
import { Stat } from "./stats/statTypes";
import { reachTo } from "./systems/BasicAttackSystem";
import { acquireRadius } from "./targeting";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame, Order } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../..", "content");

const NO_INTENTS = new Map<SeatId, IntentFrame>();
/**
 * 母體 = `content/champions/` 裡真的出貨的那些文件,**推導出來的,不是一個數字**。
 *
 * 這條原本是 `expect(rows.length).toBeGreaterThan(100)`,而 100 是 2026-07 出貨
 * 頭數(119 位)的近似值。2026-08-13 未上架英雄整批搬進 `content/_legacy/`
 * (營運母體 119 → 78)之後,那條就用「英雄變少了」這種和這張矩陣毫無關係的
 * 訊息紅掉 —— CLAUDE.md 講的「第四個住處」。
 *
 * 從內容目錄推導之後這條**變強**:它不再只是「列數夠多」,而是「出貨的每一位
 * 英雄都真的跑過這四個情境」。內容載入失敗退回骨架(2 位)、或迴圈漏掃了誰,
 * 兩種都會在這裡紅 —— 而下面那三條 `brokenAfter(...) === []` 的棘輪,母體被
 * 悄悄縮小的話本來是會**變綠**的(空集合永遠通過)。
 */
function shippedChampionDocCount(): number {
  return readdirSync(join(CONTENT_DIR, "champions")).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_"),
  ).length;
}
const Z0 = SKELETON_ARENA.zones[0]!;
/** 同一個木樁(#128 / autoAttackCensus 用的那個)。 */
const DUMMY = "godie-hart" as ChampionId;
const IMMOBILE = 1e-9;
/**
 * 「遠」的**地板**。實測 Saber 卡在柱子上時最近的敵人是 16.25,所以這個情境
 * 原本就是照著那個數字挑的。
 *
 * ⚠️ 它是地板不是定值 —— 真正的間距是
 * `max(FAR_GAP, 這一位自己的索敵半徑 + FAR_MARGIN)`,見下面 `run` 裡的算式。
 */
const FAR_GAP = 16;
/**
 * 「遠」比索敵半徑再多出來的餘裕。
 *
 * ── 為什麼這一格會存在(2026-08-01,GH#252 的漣漪)────────────────────────
 * 這一格原本是硬寫的 16,而 16 隱含一個從來沒有人寫下來的假設:**沒有任何一位
 * 英雄的索敵半徑會超過 16**。GH#252 把體型接上射程之後,那個假設當場破掉 ——
 * `godie-o030`(臭作,體型 3.0、卡面射程 12.0)在「等比倍率」那一版拿到 36.00 的
 * 射程與索敵半徑,於是「敵人在 16 單位外」對他而言是**索敵半徑之內**,這個情境
 * 對他來說根本不是「遠」,規則關掉他照樣打得到,而整張矩陣的最後一條斷言紅了。
 *
 * owner 更正成斷點曲線之後他變成 15.60 —— 剛好在 16 之下。**那個綠燈是運氣**:
 * 餘裕只有 0.40。實測(2026-08-01):把 `DEFAULT_ATTACK_RANGE_CURVE` 的 3 倍那一格
 * 從 1.30 改成 1.35,他的射程變成 16.20,而這張矩陣**又紅一次**(118/119)——
 * 紅的理由和 GH#216(這張矩陣要守的東西)一點關係都沒有。
 *
 * 所以間距改成從**這一位自己的索敵半徑**算出來 —— 那正是這個情境的檔頭一直在
 * 說的話(「敵人在索敵半徑之外、seekRadius 之內」)。1.0 的餘裕遠大於位置抖動
 * (兩具身體都被釘住,只有 collision 那一層會推),而且 `radius + 1` 仍然遠小於
 * `autoEngage.seekRadius`(出貨 48),所以規則開著的那一欄照樣找得到人。
 * 同樣那個 1.35 的實驗,套上這條算式之後是**綠的**。
 *
 * ⚠️ 上面說的是 `DEFAULT_ATTACK_RANGE_CURVE`(程式裡的預設)而不是
 * `content/config/body-scale.json`,因為這支普查**只注入 `combat-env`**,
 * `world.bodyScaleRules` 用的是 `SimWorld` 的預設值。今天兩者的數字一樣,所以
 * 這張表量到的仍然是出貨行為;哪一天出貨文件和預設分家了,這張表會跟著預設走。
 */
const FAR_MARGIN = 1;

type Scene = "idle" | "inReach" | "approach" | "far";
/** 遠距離要留夠時間走過去(16 單位 @ ~5.8 u/s ≈ 83 tick)+ 卡住判定 30 tick。 */
const TICKS: Record<Scene, number> = { idle: 300, inReach: 300, approach: 400, far: 600 };

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

function shippedEnv(): ReturnType<typeof normalizeCombatEnv> {
  const doc = Configs.tryGet("combat-env") as
    | { multipliers?: Partial<Record<CombatEnvKey, number>> }
    | undefined;
  return normalizeCombatEnv(doc?.multipliers);
}

interface RunResult {
  hits: number;
  reach: number;
  radius: number;
}

/**
 * 一個情境跑一次。英雄放在 +x 邊界上(`boundaryRadius - selfRadius`,正是
 * `clampToBoundary` 的夾點),移動指令指向場外 1000 單位 —— 身體從第一 tick
 * 就推不動,`Transform.vel` 是 0,而 `nav.moveTarget` 永遠不會抵達。
 */
function run(championId: ChampionId, scene: Scene, engage: boolean): RunResult {
  const world = new SimWorld(SKELETON_ARENA, 20260730);
  world.combatEnv = shippedEnv();
  world.combatActive = true;
  world.combatFeel = {
    ...DEFAULT_COMBAT_FEEL,
    autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: engage },
  };

  // 先用暫定位置生出來,拿到半徑之後再搬到邊界上。
  const me = spawnChampion(world, {
    championId,
    seatId: asSeatId(0),
    teamId: asTeamId(1),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  const myT = world.transform.get(me)!;
  const wallX = Z0.center.x + Z0.boundaryRadius - myT.radius;
  myT.pos = { x: wallX, z: Z0.center.z };

  const foe = spawnChampion(world, {
    championId: DUMMY,
    seatId: asSeatId(1),
    teamId: asTeamId(2),
    pos: { x: Z0.center.x, z: Z0.center.z },
    zone: 0,
  });
  const foeT = world.transform.get(foe)!;
  const sc = world.stats.get(me)!;
  const reach = reachTo(sc, myT.radius, foeT.radius);
  const radius = acquireRadius(sc, myT.radius);
  const gap =
    scene === "far"
      ? // 見 FAR_MARGIN:16 是地板,真正的門檻是「這一位自己搆不到」。
        Math.max(FAR_GAP, radius + FAR_MARGIN)
      : scene === "approach"
        ? Math.max(reach * 1.15, Math.min(radius * 0.95, reach + 3))
        : reach * 0.7;
  // 敵人一律放在**內側**(−x),所以英雄推向場外時是「背對敵人」——
  // 這正是「打就站定」會擋下出手的方向,兩條規則的交互也一起被量到了。
  foeT.pos = { x: wallX - gap, z: Z0.center.z };

  const order: Order = { kind: "move", point: { x: Z0.center.x + 1000, z: Z0.center.z } };
  const orders = new Map<SeatId, IntentFrame>();
  orders.set(asSeatId(0), { order, commands: [] });

  const foeHp = world.health.get(foe)!;
  let hits = 0;
  for (let i = 0; i < TICKS[scene]; i++) {
    foeHp.hp = foeHp.maxHp; // 打不死:量的是「有沒有打到」
    world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
    // ⚠️ 指令**只在第一 tick 送一次**(滑鼠右鍵),不是每 tick 重送(搖桿)。
    // 2026-07-30 改的,理由見檔頭:每 tick 重送代表玩家正握著方向盤,那一格
    // 依出貨設定 `respectLiveSteering` 永遠不會被接管,整張矩陣會全是 0。
    world.step(scene === "idle" || i > 0 ? NO_INTENTS : orders);
    for (const e of world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return { hits, reach, radius };
}

interface Row {
  id: string;
  name: string;
  attackType: string;
  reach: number;
  radius: number;
  /** [規則關, 規則開] 各情境的命中數 */
  idle: [number, number];
  inReach: [number, number];
  approach: [number, number];
  far: [number, number];
}

const rows: Row[] = [];

describe("GH#216 移動指令期間會不會攻擊 —— 全角色矩陣", () => {
  it("每一位英雄,四個情境,規則關/開各跑一次", () => {
    for (const def of Champions.all()) {
      const id = def.id as ChampionId;
      const one = (s: Scene): [number, number] => [run(id, s, false).hits, run(id, s, true).hits];
      const probe = run(id, "inReach", true);
      rows.push({
        id: def.id,
        name: def.name,
        attackType: def.attackType,
        reach: probe.reach,
        radius: probe.radius,
        idle: one("idle"),
        inReach: [run(id, "inReach", false).hits, probe.hits],
        approach: one("approach"),
        far: one("far"),
      });
    }
    // 儀器自檢:出貨的每一位英雄都跑過了(見 `shippedChampionDocCount`)。
    const shipped = shippedChampionDocCount();
    expect(shipped).toBeGreaterThan(0); // 內容目錄不是空的
    expect(rows.length).toBe(shipped); // 一位都沒漏

    const melee = rows.filter((r) => r.attackType === "melee");
    const ranged = rows.filter((r) => r.attackType === "ranged");
    const brokenBefore = (k: "inReach" | "approach" | "far"): Row[] =>
      rows.filter((r) => r[k][0] === 0);
    // ⭐ 走不動的身體不算「壞掉」——「移動中接敵」對它**在定義上**不成立。
    //
    // 2026-08-13 落地的 70-00 紮根（owner：「類似定身，可攻擊跟施展技能但不能移動」）
    // 讓 `godie-e010` 這具替身卡帶著 `immobile: true`，於是 approach / far 兩個
    // 需要**走過去**的情境對它永遠是 0 命中。⛔ 那不是缺陷，是規格。
    //
    // ⚠️ 判定從**英雄卡推導**（`Champions.tryGet(id).immobile`），
    // ⛔ 不是把 `godie-e010` 寫成一個豁免清單 —— 下一具不會走的身體
    // （砲台形態、雕像）不該要求有人記得回來補一列。
    const immobile = (id: string): boolean => Champions.tryGet(id as ChampionId)?.immobile === true;
    const brokenAfter = (k: "inReach" | "approach" | "far"): Row[] =>
      rows.filter((r) => r[k][1] === 0 && !(immobile(r.id) && k !== "inReach"));

    const pct = (n: number, d: number): string =>
      `${n}/${d} = ${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
    const lines: string[] = [];
    lines.push(`champions=${rows.length} melee=${melee.length} ranged=${ranged.length}`);
    for (const k of ["inReach", "approach", "far"] as const) {
      lines.push(
        `[${k}] 規則關 → 0 命中: ${pct(brokenBefore(k).length, rows.length)}` +
          `   (近戰 ${brokenBefore(k).filter((r) => r.attackType === "melee").length}` +
          ` / 遠程 ${brokenBefore(k).filter((r) => r.attackType === "ranged").length})` +
          `   規則開 → 0 命中: ${pct(brokenAfter(k).length, rows.length)}`,
      );
    }
    lines.push(
      `[idle] 對照組 0 命中: 規則關 ${rows.filter((r) => r.idle[0] === 0).length}` +
        ` · 規則開 ${rows.filter((r) => r.idle[1] === 0).length}`,
    );
    // 逐位英雄的明細:每一格是「規則關 → 規則開」的命中數
    lines.push("id | 名稱 | 類型 | 射程 | 索敵 | idle | inReach | approach | far");
    for (const r of rows.slice().sort((a, b) => a.id.localeCompare(b.id))) {
      lines.push(
        `${r.id} | ${r.name} | ${r.attackType} | ${r.reach.toFixed(2)} | ${r.radius.toFixed(2)} | ` +
          `${r.idle[0]}→${r.idle[1]} | ${r.inReach[0]}→${r.inReach[1]} | ` +
          `${r.approach[0]}→${r.approach[1]} | ${r.far[0]}→${r.far[1]}`,
      );
    }
    console.log(lines.join("\n"));

    // ---- 棘輪 ----
    // 卡住的走位 + 敵人在**索敵半徑內**(射程內或射程外都算)→ 每一位英雄都必須
    // 打得到。這一條是 owner 那句「移動指令期間完全不攻擊」的直接反面。
    expect(brokenAfter("inReach").map((r) => `${r.id} ${r.name}`)).toEqual([]);
    expect(brokenAfter("approach").map((r) => `${r.id} ${r.name}`)).toEqual([]);
    // 敵人在索敵半徑之外、seekRadius 之內 —— 這是 Saber 實測的那一格。
    expect(brokenAfter("far").map((r) => `${r.id} ${r.name}`)).toEqual([]);

    // ---- 這張矩陣不是空的 ----
    // 規則關掉時「approach」必須是全滅:索敵半徑 6 到射程之間那一段只有追擊會走,
    // 而追擊被移動指令壓住。如果這一條變綠了,代表有別的東西也在補這段路,
    // 那就要回來重讀成因,而不是把數字調鬆。
    expect(brokenBefore("approach").length).toBeGreaterThan(rows.length * 0.9);
    expect(brokenBefore("far").length).toBe(rows.length);
  }, 1_800_000);
});
