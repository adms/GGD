/**
 * 【免疫】的錨點 —— 一發被拒的攻擊要浮在**受害者身上**，⛔ 不是在原點。
 *
 * 量到的（2026-08-23）：`sim/combat/damage.ts` 的兩個拒絕出口（無敵 / 型別連擊
 * 免疫）發出的 `immune` **完全沒有帶 `x`/`z`**，而 `recordEvade` 對缺席的座標退回
 * `(0,0)`。出貨 13 張場地有 **5 張**（godie/skeleton/castle/colosseum/dota）的
 * 對戰分區不在原點上 ⇒ `render/anchorBounds` 拒畫 ⇒ 41-002 絕對屏障 /
 * [EX∅ 根源] L3 / 史萊姆裝的免疫，在玩家眼裡與「這一發封包被丟掉了」一模一樣
 *（失敗形態②）。而 `net/eventFanout.ts` 白名單 `immune` 的唯一理由，就是它是
 * 客戶端唯一能知道一擊被拒的證據。
 *
 * ⛔ 一個座標、一個半徑、一個餘裕都沒有抄進來：場地讀 `content/arenas/*.json`
 *（新圖自動納入），身體位置從 sim 讀回來。兩條斷言 ——
 * ① 錨點就是**那具拒絕了這一擊的身體**；② 它在**每一張出貨場地**上畫得出來。
 * 兩條都要：少了①，一個「合法但不對」的固定座標照樣過；少了②，8 張以原點為
 * 中心的場地會讓缺陷矇混過去。
 *
 * 突變（做過）：刪掉 `damage.ts::emitImmune` 的 `x`/`z` 兩行 → 紅，訊息指名
 * `arena.castle` 與那具身體的座標 `(-24,-4)`。
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
import { anchorInsideArena } from "../render/anchorBounds";
import { recordEvade, drainEvadeSightings, clearEvadeSightings } from "./RoomConnection";

const ARENAS = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/arenas");

const shipped = (): ArenaDef[] =>
  readdirSync(ARENAS)
    .filter((f) => f.startsWith("arena.") && f.endsWith(".json"))
    .sort()
    .map((f) => arenaDefFromDoc(JSON.parse(readFileSync(join(ARENAS, f), "utf8")) as never));

/** `GameApp.applyArena` 餵給 `frameBus.arenaZones` 的同一個投影。 */
const zonesOf = (d: ArenaDef) =>
  d.zones.map((z) => ({
    x: z.center.x,
    z: z.center.z,
    r: z.boundaryRadius,
    ...(z.bounds?.kind === "rect" ? { rect: { halfW: z.bounds.halfW, halfD: z.bounds.halfD } } : {}),
  }));

function body(w: SimWorld, seat: number, at: { x: number; z: number }, sources: ModifierSource[] = []): EntityId {
  const id = w.spawn();
  w.transform.set(id, { pos: { ...at }, vel: { x: 0, z: 0 }, facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  w.health.set(id, { hp: 1e5, maxHp: 1e5, mana: 0, maxMana: 0, alive: true, shields: [] });
  w.team.set(id, { teamId: asTeamId(seat), seatId: asSeatId(seat) });
  w.stats.set(id, { championId: "dummy" as ChampionId, final: zeroStats(), dirty: false, sources });
  return id;
}

beforeAll(() => registerSkeletonContent());
beforeEach(() => clearEvadeSightings());

describe("【免疫】浮字錨在受害者身上,而且每一張出貨場地都畫得出來", () => {
  it("兩個拒絕出口發出的 immune 都帶得出一個在場內的錨點", () => {
    for (const def of shipped()) {
      const z0 = def.zones[0]!;
      const w = new SimWorld(def, 42);
      // 出貨文件自己寫的出生點 —— 真的在這張圖上,而且不是原點。
      const attacker = body(w, 0, z0.spawns[0][0]!);
      const warded = body(w, 1, z0.spawns[1][0]!);
      // 型別連擊免疫要**另一具**身體:`recordEvade` 對同一個 (source,target,label)
      // 在同一個 socket turn 內會去重,共用一具就會少掉一筆。
      const slimed = body(w, 2, z0.spawns[1][1] ?? z0.spawns[0][1]!, [
        { id: "item:fixture#0", kind: "item", typeStreakImmunity: { damageTypes: ["physical"], threshold: 2 } },
      ]);
      grantImmunity(w, warded, { physicalUntil: w.tick + 100, magicUntil: 0, trueUntil: 0, controlUntil: 0 });

      w.events.length = 0;
      for (const target of [warded, slimed, slimed, slimed]) {
        w.damageQueue.push({ source: attacker, target, amount: 100, type: "physical", crit: false, origin: "ability:fx" });
        combatResolveSystem(w);
      }
      for (const e of w.events.filter((e) => e.type === "immune")) recordEvade(e.data, "immune");

      const seen = drainEvadeSightings();
      expect(seen.length, `${def.id}: 無敵與型別連擊免疫應該各進一筆 sighting`).toBe(2);
      for (const s of seen) {
        const pos = w.transform.get(s.target as EntityId)!.pos;
        // ① 錨點 = 拒絕了這一擊的那具身體（`evade` 的同一條規矩）
        expect({ id: def.id, x: s.x, z: s.z }).toEqual({ id: def.id, x: pos.x, z: pos.z });
        // ② 而它在這張場地上真的畫得出來（`render/anchorBounds` 是出口的閘）
        expect(anchorInsideArena(zonesOf(def), s.x, s.z), `${def.id}: 錨點落在場外 ⇒ 看不到「免疫」`).toBe(true);
      }
    }
  });
});
