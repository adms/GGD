/** GH#1197 阿璃 E 魅惑：被魅惑者每 tick 朝施加者走、指令被丟；到期後恢復（跑出貨 OrderSystem／MovementSystem）。 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type SeatId } from "../ids";
import type { StatusEffect } from "./components";
import type { IntentFrame } from "./intents";
import { dist } from "./math/vec2";

beforeAll(() => registerSkeletonContent());
const NO_INTENTS = new Map<SeatId, IntentFrame>();

describe("charmed（GH#1197）", () => {
  it("魅惑期間走向施加者、丟掉自己的移動指令；到期後不再被拉", () => {
    const world = new SimWorld(SKELETON_ARENA, 3);
    const z = SKELETON_ARENA.zones[0]!;
    const src = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: z.center.x, z: z.center.z }, zone: 0 });
    const victim = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: z.center.x + 10, z: z.center.z }, zone: 0 });
    world.step(NO_INTENTS);
    const st = world.status.get(victim) ?? { effects: [] };
    st.effects.push({ statusId: "charm" as StatusEffect["statusId"], sourceId: "src:charm", applierId: src, expiresAtTick: world.tick + 10, charmed: true, polarity: "debuff" });
    world.status.set(victim, st);
    const d0 = dist(world.transform.get(victim)!.pos, world.transform.get(src)!.pos);
    // 受害者自己下「往反方向走」的指令 —— 魅惑中要被丟掉
    const away = new Map<SeatId, IntentFrame>([[asSeatId(1), { order: { kind: "move" as const, point: { x: z.center.x + 30, z: z.center.z } }, commands: [] }]]);
    for (let i = 0; i < 8; i++) world.step(away);
    const d1 = dist(world.transform.get(victim)!.pos, world.transform.get(src)!.pos);
    expect(d1).toBeLessThan(d0); // ⭐ 承重：沒有 charmPass 它會往反方向走（d1 > d0）
    for (let i = 0; i < 12; i++) world.step(away); // 到期
    const d2 = dist(world.transform.get(victim)!.pos, world.transform.get(src)!.pos);
    expect(d2).toBeGreaterThan(d1); // 恢復：自己的指令又有效了
  });
});
