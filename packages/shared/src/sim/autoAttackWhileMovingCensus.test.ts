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
 *   far         有移動指令,敵人 16 單位外(索敵半徑 6 之外)—— Saber 實測 16.25
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
const Z0 = SKELETON_ARENA.zones[0]!;
/** 同一個木樁(#128 / autoAttackCensus 用的那個)。 */
const DUMMY = "godie-hart" as ChampionId;
const IMMOBILE = 1e-9;
/** 「遠」= 16 單位。實測 Saber 卡在柱子上時最近的敵人是 16.25。 */
const FAR_GAP = 16;

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
      ? FAR_GAP
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
    expect(rows.length).toBeGreaterThan(100);

    const melee = rows.filter((r) => r.attackType === "melee");
    const ranged = rows.filter((r) => r.attackType === "ranged");
    const brokenBefore = (k: "inReach" | "approach" | "far"): Row[] =>
      rows.filter((r) => r[k][0] === 0);
    const brokenAfter = (k: "inReach" | "approach" | "far"): Row[] =>
      rows.filter((r) => r[k][1] === 0);

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
