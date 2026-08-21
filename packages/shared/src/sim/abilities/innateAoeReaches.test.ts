/**
 * GH#314 —— 「宣告了範圍，而引擎那一發 AoE 從來沒有發生過」。
 *
 * 22-00 嗚鎖打! 的卡片寫著「對附近的敵方地面部隊造成傷害，並將他們嚇昏 0.5 秒」，
 * 文件卻是 `castType:"self"` + 一個 `damage` —— `self` 分支直接 `targets=[caster]`，
 * `doc.radius` 只有 `ground` 分支會讀。於是那一發**一次都沒打到過任何人**，
 * 而暈眩落在施法者自己身上，玩家照付魔力與冷卻（第一·五守則的形狀）。
 * 修法用 repo 已有的模板（11 份同形，例 `godie-e00s.e`）：`damageArea` 自己帶
 * `radius`、圓心退回施法者，附帶效果掛 `onHitTargets` 打到真的被打到的那些人。
 *
 * ⛔ 驗機制不驗數字：斷言只問「敵人掉血了嗎 / 被暈了嗎 / 加速加在誰身上」。
 * ⚠️ 走 `ContentLoader` 讀真的 `content/`（失敗形態⑤：手寫 fixture 會在出貨文件
 * 仍然壞掉時全綠）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { registerAll } from "../../content/registries";
import { Arenas, Configs, Models, StatusEffects, VfxDefs } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility } from "./abilitySystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

/** 22-00 嗚鎖打!（本體）與一具乾淨的敵方身體（21-00 灼眼，天生技只給視野）。 */
const RENA = "godie-e001" as ChampionId;
const DUMMY = "godie-e008" as ChampionId;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

function spawn(world: SimWorld, id: ChampionId, seat: number, team: number, dx: number): EntityId {
  return spawnChampion(world, {
    championId: id,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: Z0.center.x + dx, z: Z0.center.z },
    zone: 0,
  });
}

describe("22-00 嗚鎖打! 的範圍是真的會發生的事 (#314)", () => {
  it("圈裡的敵人掉血且被暈，加速掛在施法者身上", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    world.combatActive = true;
    const rena = spawn(world, RENA, 0, 0, 0);
    // 半徑從**引擎真的會讀的那一格**取（`damageArea.radius`），⛔ 不抄字面值。
    const innate = Abilities.get(Champions.get(RENA).passiveAbility!);
    const area = innate.effects.find((e) => e.kind === "damageArea") as { radius: number } | undefined;
    expect(area?.radius).toBeGreaterThan(0);
    const foe = spawn(world, DUMMY, 1, 1, area!.radius / 2);

    world.health.get(rena)!.mana = 9999;
    const before = world.health.get(foe)!.hp;
    const buffsBefore = {
      rena: world.stats.get(rena)!.sources.length,
      foe: world.stats.get(foe)!.sources.length,
    };
    expect(castAbility(world, rena, "PASSIVE", { type: "self" })).toBe("ok");
    // 跑到那一發落地為止（吟唱時間是後台可調的，⛔ 不要把 tick 數寫進斷言）。
    let landedAt = -1;
    for (let i = 0; i < 120 && landedAt < 0; i++) {
      world.step(NO_INTENTS);
      if (world.health.get(foe)!.hp < before) landedAt = i;
    }

    // ① 那一發真的打到人了（在此之前 targets=[caster]，敵人一滴血都不會掉）
    expect(landedAt).toBeGreaterThanOrEqual(0);
    // ② 附帶的暈眩落在**被打到的人**身上
    expect(
      world.status.get(foe)?.effects.some((e) => e.stun && e.expiresAtTick > world.tick),
    ).toBe(true);
    // ③ 而加速仍然是施法者自己的（⛔ 不可以隨著 AoE 送給敵人）
    expect(world.stats.get(rena)!.sources.length).toBeGreaterThan(buffsBefore.rena);
    expect(world.stats.get(foe)!.sources.length).toBe(buffsBefore.foe);
  });
});
