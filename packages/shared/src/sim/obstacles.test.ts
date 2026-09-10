/** GH#1190 鄂爾 Q→E【暫時障礙】承重守衛 —— 跑出貨的 runEffects／MovementSystem／dashOnEnd，⛔ 不手造狀態。 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { startDash } from "./systems/MovementSystem";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import { shatterObstaclesAt } from "./obstacles";

beforeAll(() => registerSkeletonContent());
const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;
const at = (dx: number) => ({ x: Z0.center.x + dx, z: Z0.center.z });

function rig() {
  const world = new SimWorld(SKELETON_ARENA, 17);
  const hero = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: at(0), zone: 0 });
  world.step(NO_INTENTS);
  const ctx = (caster: EntityId) => ({ world, caster, rank: 1, targets: [], point: at(4), origin: "ability:test.pillar", rng: world.rng });
  return { world, hero, ctx };
}

describe("spawnObstacle（GH#1190）", () => {
  it("生出來的柱子**真的擋住衝刺** —— 而且到期之後不再擋", () => {
    const a = rig();
    runEffects([{ kind: "spawnObstacle", radius: 1.5, durationSec: 2, at: "point" }], a.ctx(a.hero));
    expect(a.world.obstacle.size).toBe(1);

    startDash(a.world, a.hero, { x: 1, z: 0 }, 20, 12);
    for (let i = 0; i < 30; i++) a.world.step(NO_INTENTS);
    const stopped = a.world.transform.get(a.hero)!.pos.x - Z0.center.x;
    // ⭐ 承重：柱子在 +4、半徑 1.5 ⇒ 身體停在它前面（⛔ 不是衝到 12 格外）
    expect(stopped).toBeLessThan(4);
    expect(a.world.nav.get(a.hero)!.dashBlockedTick, "撞停要被記下來（dash.onEndOn:blocked 讀它）").toBeDefined();

    // 到期 ⇒ 柱子消失，同一條路衝得過去
    const b = rig();
    runEffects([{ kind: "spawnObstacle", radius: 1.5, durationSec: 0.2, at: "point" }], b.ctx(b.hero));
    for (let i = 0; i < 20; i++) b.world.step(NO_INTENTS);
    expect(b.world.obstacle.size, "到期要自己收掉").toBe(0);
    startDash(b.world, b.hero, { x: 1, z: 0 }, 20, 12);
    for (let i = 0; i < 30; i++) b.world.step(NO_INTENTS);
    expect(b.world.transform.get(b.hero)!.pos.x - Z0.center.x).toBeGreaterThan(4);
  });

  it("`shatterable:false` 的柱子撞不碎；預設的撞得碎", async () => {
    for (const [shatterable, want] of [[true, 0], [false, 1]] as const) {
      const a = rig();
      runEffects([{ kind: "spawnObstacle", radius: 1.5, durationSec: 5, at: "point", shatterable }], a.ctx(a.hero));
      startDash(a.world, a.hero, { x: 1, z: 0 }, 20, 12);
      for (let i = 0; i < 30; i++) a.world.step(NO_INTENTS);
      const t = a.world.transform.get(a.hero)!;
      shatterObstaclesAt(a.world, t.zone, t.pos, t.radius, a.hero);
      expect(a.world.obstacle.size, `shatterable:${shatterable}`).toBe(want);
    }
  });
  it("驗收②：施法者死了 / 回合重置 ⇒ 柱子不殘留", () => {
    for (const how of ["死掉", "回合重置"] as const) {
      const a = rig();
      runEffects([{ kind: "spawnObstacle", radius: 1.5, durationSec: 60, at: "point" }], a.ctx(a.hero));
      expect(a.world.obstacle.size).toBe(1);
      if (how === "死掉") a.world.health.get(a.hero)!.alive = false;
      else a.world.settledZones.add(a.world.transform.get(a.hero)!.zone);
      a.world.step(NO_INTENTS);
      // ⭐ 60 秒還沒到期 —— 收掉它的只能是這兩個條件之一
      expect(a.world.obstacle.size, how).toBe(0);
    }
  });

  it("驗收②：落點壓在既有障礙上 ⇒ 柱子被推到合法位置，⛔ 不是不生也不是重疊", () => {
    const a = rig();
    const wall = Z0.obstacles[0];
    // 落點正中既有靜態障礙的圓心
    const ctx = { ...a.ctx(a.hero), point: { x: wall.center.x, z: wall.center.z } };
    runEffects([{ kind: "spawnObstacle", radius: 1.5, durationSec: 5, at: "point" }], ctx);
    expect(a.world.obstacle.size, "⛔ 不可以靜默吞掉這一次施放").toBe(1);
    const o = [...a.world.obstacle.values()][0]!;
    const dx = o.center.x - wall.center.x;
    const dz = o.center.z - wall.center.z;
    expect(Math.sqrt(dx * dx + dz * dz), "⭐ 兩個圓不可以重疊").toBeGreaterThanOrEqual(o.radius + wall.radius - 1e-6);
  });
});
