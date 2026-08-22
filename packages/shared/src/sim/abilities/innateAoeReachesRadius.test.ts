/**
 * GH#314（第二批）—— 兩支「宣告了範圍，而那一圈從來沒有罩到過別人」。
 *
 * 48-00 石化之眼是 `innateAoeReaches.test.ts` 那一族的第二種形狀：它**沒有傷害
 * 可以掛**（只有一個裸的 `applyStatus`），而 `castType:"self"` 直接
 * `targets=[caster]`、頂層 `radius` 只有 `ground` 分支讀得到 ⇒ 那 4 秒的石化
 * 落在 Rider 自己身上。修法用 repo 已有的同形寫法（53-03 破法對咒
 * `godie-o00l.e`）：`ground` + `range: 0`，落點永遠夾回腳下。
 * 突變紀錄：`castType` 改回 `"self"` → 第一條紅（實測）。
 *
 * ⛔ 驗機制不驗數字；⚠️ 走 `ContentLoader` 讀真的 `content/`（失敗形態⑤）。
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

/** 48-00 石化之眼（本體）與一具乾淨的敵方身體（天生技只給自我增益）。 */
const RIDER = "godie-hvsh" as ChampionId;
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

const stunned = (world: SimWorld, id: EntityId): boolean =>
  world.status.get(id)?.effects.some((e) => e.stun && e.expiresAtTick > world.tick) === true;

describe("48-00 石化之眼 的範圍是真的會發生的事 (#314)", () => {
  it("圈裡的敵人被石化，⛔ 不是施法者自己", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    world.combatActive = true;
    const rider = spawn(world, RIDER, 0, 0, 0);
    // 半徑從**引擎真的會讀的那一格**取（頂層 `radius`，由 radiusTier 解出來），
    // ⛔ 不抄字面值。四分之一半徑保證吃得到 combatEnv 的 abilityRange 縮放。
    const innate = Abilities.get(Champions.get(RIDER).passiveAbility!);
    expect(innate.radius ?? 0).toBeGreaterThan(0);
    const foe = spawn(world, DUMMY, 1, 1, innate.radius! / 4);

    const t = world.transform.get(rider)!.pos;
    expect(castAbility(world, rider, "PASSIVE", { type: "point", point: { x: t.x, z: t.z } })).toBe("ok");
    // 跑到那一發落地為止（吟唱時間是後台可調的，⛔ 不要把 tick 數寫進斷言）。
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      world.step(NO_INTENTS);
      landed = stunned(world, foe);
    }

    expect(landed).toBe(true);
    // ⭐ 反面同樣承重：在此之前這 4 秒**是定在 Rider 自己身上的**。
    expect(stunned(world, rider)).toBe(false);
  });

  // 同一次查證撈出來的第三支（99-00 可愛就是正義）：宣告了 radiusTier，加成卻
  // 寫在 `passive.ranks[].modifiers` —— 那一格只掛在自己身上，「週遭的部隊」
  // 一個都沒拿到。改成 `auras` 之後才有人接得到。
  it("99-00 可愛就是正義 的加成真的到得了隊友身上", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    world.combatActive = true;
    const miku = spawn(world, "godie-o02p" as ChampionId, 0, 0, 0);
    const aura = Abilities.get(Champions.get("godie-o02p" as ChampionId).passiveAbility!)
      .passive?.ranks[0]?.auras?.[0];
    expect(aura?.radius ?? 0).toBeGreaterThan(0);
    const mate = spawn(world, DUMMY, 2, 0, aura!.radius / 4);
    const before = world.stats.get(mate)!.sources.length;
    for (let i = 0; i < 60; i++) world.step(NO_INTENTS);
    expect(world.stats.get(mate)!.sources.length).toBeGreaterThan(before);
    expect(miku).toBeGreaterThan(0);
  });
});
