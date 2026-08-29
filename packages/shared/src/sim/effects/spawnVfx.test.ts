/**
 * Task #9 — spawnVfx effect determinism (do-runner-emit).
 * The WC3 dummy-effect-unit idiom routes to a cosmetic `vfxSpawn` sim event.
 * It must be DETERMINISTIC (two seeded runs identical) and mutate NO world
 * state — it only reads transforms and emits an event.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import type { EntityId } from "../../ids";

function makeWorld(seed = 42): { world: SimWorld; caster: EntityId; target: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const caster = world.spawn();
  const target = world.spawn();
  world.transform.set(caster, {
    pos: { x: 3, z: 7 },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  world.transform.set(target, {
    pos: { x: 11, z: -4 },
    vel: { x: 0, z: 0 },
    facing: { x: -1, z: 0 },
    radius: 0.5,
    zone: 0,
  });
  return { world, caster, target };
}

function ctxOf(world: SimWorld, caster: EntityId, target: EntityId): EffectContext {
  return {
    world,
    caster,
    rank: 1,
    targets: [target],
    point: { x: -2, z: 5 },
    origin: "ability:test.spawnvfx",
    rng: world.rng,
  };
}

describe("spawnVfx effectRunner (do-runner-emit)", () => {
  it("resolves the world point for at self/target/point and emits vfxSpawn", () => {
    cover("do-runner-emit");
    const cases: { at: "self" | "target" | "point"; x: number; z: number }[] = [
      { at: "self", x: 3, z: 7 },
      { at: "target", x: 11, z: -4 },
      { at: "point", x: -2, z: 5 },
    ];
    for (const c of cases) {
      const { world, caster, target } = makeWorld();
      const eff: EffectDef = { kind: "spawnVfx", vfxId: "godie-deathwave-p0", at: c.at };
      runEffects([eff], ctxOf(world, caster, target));
      const ev = world.events.filter((e) => e.type === "vfxSpawn");
      expect(ev).toHaveLength(1);
      expect(ev[0]!.data).toMatchObject({ vfxId: "godie-deathwave-p0", x: c.x, z: c.z, caster });
    }
  });

  /**
   * ⭐ GH#649/#565 —— `at:"bone"` 的**出貨鏈**守衛：出貨 schema 收（含 refine 的
   * 成對檢查）→ 真的 effectRunner 跑 → 事件帶 `attach` 過線（客戶端據此解析骨頭）。
   * ⛔ 不自造 payload 餵消費端（失敗形態⑤）—— 斷言的是 sim 真的送出的那一則。
   * 突變驗證：把 emitter 的 `attach` spread 拿掉 → 本條紅（見 commit message）。
   */
  it('at:"bone" ships attach over the wire, and schema pairs at:"bone" with attach', async () => {
    cover("do-runner-emit");
    const { zEffectDef } = await import("../../content/schema/effect");
    // 出貨 schema：成對才收 —— attach 落單或 at:"bone" 缺 attach 都要被拒
    const node = { kind: "spawnVfx", vfxId: "fx.w3x.orb.herocloudkfksword.p00", at: "bone", attach: "weapon" };
    expect(zEffectDef.safeParse(node).success).toBe(true);
    expect(zEffectDef.safeParse({ ...node, attach: undefined }).success).toBe(false);
    expect(zEffectDef.safeParse({ ...node, at: "self" }).success).toBe(false);
    // 真的 runner：座標＝施法者腳下（替身退路），attach 原樣過線
    const { world, caster, target } = makeWorld();
    runEffects([node as EffectDef], ctxOf(world, caster, target));
    const ev = world.events.filter((e) => e.type === "vfxSpawn");
    expect(ev).toHaveLength(1);
    expect(ev[0]!.data).toMatchObject({
      vfxId: "fx.w3x.orb.herocloudkfksword.p00",
      x: 3,
      z: 7,
      caster,
      attach: "weapon",
    });
  });

  /**
   * ⭐ GH#809 —— 錨定單位可以是**受擊者**（原作 317 次 `AddSpecialEffectTargetUnitBJ`
   * 裡明確掛在受擊者身上的 92 次）。四個方向一起驗，⛔ 少一個都還原得出一個壞：
   * `attachTo` 過線 · **落點也換成受擊者腳下**（模型還在載那一格退路才不會丟回施法者）
   * · 沒有受擊者 ⇒ **一則都不發**（原作那個 ForGroup 的迴圈體不會跑）
   * · 省略 `boneOn` ⇒ `attachTo` 根本不出現 ＝ 票的 rollback 條件。
   * 突變（實跑）：`anchor` 改回 `ctx.caster` → 紅（座標退回 3,7）。
   */
  it('at:"bone" + boneOn:"victim" anchors on the victim; omitted = byte-identical', async () => {
    cover("do-runner-emit");
    const { zEffectDef } = await import("../../content/schema/effect");
    const eff = zEffectDef.parse({
      kind: "spawnVfx", vfxId: "v", at: "bone", attach: "chest", boneOn: "victim",
    }) as EffectDef;
    // `boneOn` 沒有 `at:"bone"` 就是一格「說了但不會發生」的欄位（第一·五守則）
    expect(zEffectDef.safeParse({ kind: "spawnVfx", vfxId: "v", boneOn: "victim" }).success).toBe(false);
    const { world, caster, target } = makeWorld();
    runEffects([eff], ctxOf(world, caster, target));
    // 受擊者的 entity id ＋ 受擊者腳下（11,-4），⛔ 不是施法者的 (3,7)
    expect(world.events.find((e) => e.type === "vfxSpawn")!.data)
      .toMatchObject({ attachTo: target, x: 11, z: -4, caster });
    // 一個受擊者都沒有 ⇒ 什麼都不發（⛔ 不是退回施法者身上）
    const none = makeWorld();
    runEffects([eff], { ...ctxOf(none.world, none.caster, none.target), targets: [] });
    expect(none.world.events.filter((e) => e.type === "vfxSpawn")).toHaveLength(0);
    // 省略 boneOn ⇒ 錨定單位仍是施法者，且 `attachTo` 這一格**根本不出現**
    const old = makeWorld();
    runEffects([{ kind: "spawnVfx", vfxId: "v", at: "bone", attach: "chest" } as EffectDef],
      ctxOf(old.world, old.caster, old.target));
    const d = old.world.events.find((e) => e.type === "vfxSpawn")!.data;
    expect(d).toMatchObject({ x: 3, z: 7 });
    expect("attachTo" in d).toBe(false);
  });

  it("defaults `at` to self and forwards durationSec only when present", () => {
    cover("do-runner-emit");
    const { world, caster, target } = makeWorld();
    runEffects([{ kind: "spawnVfx", vfxId: "v" }], ctxOf(world, caster, target));
    runEffects([{ kind: "spawnVfx", vfxId: "v", durationSec: 3 }], ctxOf(world, caster, target));
    const evs = world.events.filter((e) => e.type === "vfxSpawn");
    expect(evs[0]!.data).toMatchObject({ x: 3, z: 7 }); // self
    expect("durationSec" in evs[0]!.data).toBe(false);
    expect(evs[1]!.data).toMatchObject({ durationSec: 3 });
  });

  it("is deterministic: two seeded runs emit identical events", () => {
    cover("do-runner-emit");
    const eff: EffectDef = { kind: "spawnVfx", vfxId: "godie-lightningtornado-p0", at: "target" };
    const run = (): unknown => {
      const { world, caster, target } = makeWorld(1234);
      runEffects([eff], ctxOf(world, caster, target));
      return world.events.map((e) => ({ type: e.type, data: e.data }));
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("mutates no world state (cosmetic only)", () => {
    cover("do-runner-emit");
    const { world, caster, target } = makeWorld();
    runEffects([{ kind: "spawnVfx", vfxId: "v", at: "target" }], ctxOf(world, caster, target));
    expect(world.damageQueue).toHaveLength(0);
    expect(world.projectile.size).toBe(0); // no projectile/entity spawned
    expect([...world.transform.keys()]).toEqual([caster, target]); // no new transforms
  });
});
