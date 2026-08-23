/**
 * 【免疫】的錨點 —— 一發被拒的攻擊要在**受害者身上**浮出兩個字，⛔ 不是在原點。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這條守衛為什麼存在（量到的，⛔ 不是推測）
 *
 * `sim/combat/damage.ts` 的兩個拒絕出口（無敵 `refusesDamage` / 型別連擊免疫
 * `refusesByTypeStreak`）在 2026-08-23 之前發出的 `immune` **完全沒有帶 `x`/`z`**，
 * 而客戶端 `net/RoomConnection.recordEvade` 對缺席的座標退回 `(0, 0)`。
 * 出貨 13 張場地裡有 **5 張**（`godie`/`skeleton`/`castle`/`colosseum`/`dota`）
 * 的兩個對戰分區都不在原點上 ⇒ `render/anchorBounds.anchorDrawable` 對 (0,0)
 * 回 false ⇒ 那兩個字**一個像素都沒有被畫出來過**；另外 8 張畫得出來，但飄在
 * zone0 的正中央，而這一場的對決可能在 72 單位外的另外半張圖。
 *
 * ⇒ 41-002 絕對屏障 / [EX∅ 根源] L3 / 史萊姆裝的型別連擊免疫，在玩家眼裡與
 * 「這一發封包被丟掉了」一模一樣 —— 而 `net/eventFanout.ts` 把 `immune` 放進
 * 白名單的**唯一理由**就是它是客戶端唯一能知道一擊被拒的證據（失敗形態②）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 它驗**機制**，⛔ 不驗數字
 *
 * ⛔ 一個座標、一個 `boundaryRadius`、一個餘裕都沒有抄進來 —— 場地幾何從
 * `content/arenas/*.json` **讀出貨的那一份**（owner 隨時會調，也隨時會加新圖，
 * 新圖會自動被納入），身體位置從 sim 讀回來。兩條斷言問的是：
 *   ① 錨點就是**那具拒絕了這一擊的身體**（＝ `evade` 的同一條規矩）
 *   ② 而它在**每一張出貨場地**上都畫得出來
 *
 * ⚠️ 兩條都要：只有①的話，一條把座標寫死成某個「合法但不對」的點的實作照樣過；
 * 只有②的話，8 張以原點為中心的場地會讓缺陷矇混過關（原點就在區內）。
 *
 * 突變紀錄（2026-08-23）：把 `combat/damage.ts::emitImmune` 裡的
 * `x: tt?.pos.x ?? 0, z: tt?.pos.z ?? 0` 兩行刪掉（＝退回缺陷）→ 紅，
 * 訊息指名 `arena.godie` 與那具身體的座標。改回 → 綠。
 */
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { arenaDefFromDoc, type ArenaDef } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { combatResolveSystem } from "@ggd/shared/sim/combat/damage";
import { grantImmunity } from "@ggd/shared/sim/effects/invulnerable";
import { zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "@ggd/shared/ids";
import type { ModifierSource } from "@ggd/shared/sim/stats/modifiers";
import { anchorInsideArena, type AnchorZone } from "../render/anchorBounds";
import { recordEvade, drainEvadeSightings, clearEvadeSightings } from "./RoomConnection";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ARENAS = join(ROOT, "content/arenas");

/** 出貨的每一張場地。⛔ 不捏夾具 —— 下一張新圖要自動被這條守衛蓋到。 */
function shippedArenas(): ArenaDef[] {
  return readdirSync(ARENAS)
    .filter((f) => f.startsWith("arena.") && f.endsWith(".json"))
    .sort()
    .map((f) => arenaDefFromDoc(JSON.parse(readFileSync(join(ARENAS, f), "utf8")) as never));
}

/** `GameApp.applyArena` 餵給 `frameBus.arenaZones` 的同一個投影。 */
function anchorZones(def: ArenaDef): AnchorZone[] {
  return def.zones.map((z) => ({
    x: z.center.x,
    z: z.center.z,
    r: z.boundaryRadius,
    ...(z.bounds?.kind === "rect" ? { rect: { halfW: z.bounds.halfW, halfD: z.bounds.halfD } } : {}),
  }));
}

function spawnBody(world: SimWorld, seat: number, at: { x: number; z: number }, sources: ModifierSource[] = []): EntityId {
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: at.x, z: at.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.6,
    zone: 0,
  });
  world.health.set(id, { hp: 100_000, maxHp: 100_000, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(seat), seatId: asSeatId(seat) });
  world.stats.set(id, { championId: "dummy" as ChampionId, final: zeroStats(), dirty: false, sources });
  return id;
}

beforeAll(() => registerSkeletonContent());
beforeEach(() => clearEvadeSightings());

describe("【免疫】的浮字錨在受害者身上,而且每一張出貨場地都畫得出來", () => {
  it("兩個拒絕出口發出的 immune 都帶得出一個在場內的錨點", () => {
    for (const def of shippedArenas()) {
      const zones = anchorZones(def);
      const zone = def.zones[0]!;
      const world = new SimWorld(def, 42);
      // 出貨文件自己寫的出生點 —— 一個**真的在這張圖上**、而且不是原點的位置。
      const attacker = spawnBody(world, 0, zone.spawns[0][0]!);
      const warded = spawnBody(world, 1, zone.spawns[1][0]!);
      // 型別連擊免疫要第三具身體:`recordEvade` 對同一個 (source,target,label)
      // 在同一個 socket turn 內會去重,兩個機制共用一具就會少掉一筆。
      const slimed = spawnBody(world, 2, zone.spawns[1][1] ?? zone.spawns[0][1]!, [
        { id: "item:fixture#0", kind: "item", typeStreakImmunity: { damageTypes: ["physical"], threshold: 2 } },
      ]);
      grantImmunity(world, warded, {
        physicalUntil: world.tick + 100,
        magicUntil: 0,
        trueUntil: 0,
        controlUntil: 0,
      });

      world.events.length = 0;
      for (const target of [warded, slimed, slimed, slimed]) {
        world.damageQueue.push({ source: attacker, target, amount: 100, type: "physical", crit: false, origin: "ability:fixture" });
        combatResolveSystem(world);
      }
      const immunes = world.events.filter((e) => e.type === "immune");
      expect(immunes.length, `${def.id}: 兩個拒絕出口應該各發一次 immune`).toBe(2);

      for (const e of immunes) recordEvade(e.data, "immune");
      const seen = drainEvadeSightings();
      expect(seen.length, `${def.id}: 每一次拒絕都要進 sightings 緩衝`).toBe(2);

      for (const s of seen) {
        const body = world.transform.get(s.target as EntityId)!.pos;
        // ① 錨點 = 拒絕了這一擊的那具身體（`evade` 的同一條規矩）
        expect({ id: def.id, x: s.x, z: s.z }).toEqual({ id: def.id, x: body.x, z: body.z });
        // ② 而它在這張場地上真的畫得出來（`render/anchorBounds` 是出口的閘）
        expect(anchorInsideArena(zones, s.x, s.z), `${def.id}: 錨點 (${s.x},${s.z}) 落在場外 ⇒ 玩家看不到「免疫」`).toBe(true);
      }
    }
  });
});
