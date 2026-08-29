/**
 * 📏 `damageLine` 的**行為**守衛 —— 線上的人真的掉血，線外的人真的沒掉。
 *
 * ⛔ 在這一支之前，全 repo **沒有任何東西跑過 `damageLineEffect.apply`**
 * （`effectRegistry.ts:156` 接了它、23 個出貨節點用它 —— 包含 20-03 約束與勝利之劍
 * 與 GH#401 這一批 4 支 —— 而「它會不會打到人」從來沒有被驗過）。
 * ⇒ 這正是失敗形態⑦：既有的提及全是**屬性**（「文件裡有 damageLine 這個字」
 * 「schema 認得這個 kind」），⛔ 沒有一條是行為。
 *
 * ⭐ 夾具刻意用 **`targets: []`** —— 因為 GH#401 那 4 支是 `castType: "skillshot"`，
 * 而 `abilitySystem.ts` 的 skillshot 分支**只算 `direction`、不填 `targets`**。
 * 拿一個有 target 的夾具來測，量到的就是**另一條路**（失敗形態⑤）。
 *
 * ⭐ 兩個方向都驗（⛔ 單邊校準的尺在它最該說話的時候會沉默）：
 * 「線上的人**有**掉血」＋「線外／線後的人**沒有**掉血」。
 * 少了後者，一個把全場都打一遍的實作也會過。
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asTeamId, asSeatId, type EntityId } from "../../ids";

const C = SKELETON_ARENA.zones[0]!.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  /** 依 `spots` 順序放的人；施法者面向 +x，所以 `x` 是「前方多遠」。 */
  marks: EntityId[];
}

/** `spots` = 相對施法者的 (前方 x, 側向 z)。`allyIdx` 的那幾個放我方。 */
function rig(spots: [number, number][], allyIdx: number[] = []): Rig {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const place = (x: number, z: number, team: number, seat: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1, // 小身體：驗的是膠囊幾何，⛔ 不是體寬容差
      zone: 0,
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    return id;
  };
  const caster = place(C.x, C.z, 0, 0);
  const marks = spots.map(([dx, dz], i) =>
    place(C.x + dx, C.z + dz, allyIdx.includes(i) ? 0 : 1, i + 1),
  );
  world.rebuildGrid();
  return { world, caster, marks };
}

/** ⭐ `targets: []` —— skillshot 出貨路徑的樣子。 */
const ctxOf = (r: Rig): EffectContext => ({
  world: r.world,
  caster: r.caster,
  rank: 1,
  targets: [],
  origin: "ability:test-line",
  rng: r.world.rng,
});

const line = (over: Partial<Extract<EffectDef, { kind: "damageLine" }>> = {}): EffectDef => ({
  kind: "damageLine",
  damageType: "magic",
  amount: { flat: 100 },
  length: 10,
  width: 2,
  aim: "facing",
  fromCaster: true,
  ...over,
});

const hits = (w: SimWorld): Map<EntityId, number> =>
  new Map(w.damageQueue.map((p) => [p.target, p.amount]));

describe("damageLine — 前方直線上的敵人真的掉血 (do-damage-line)", () => {
  it("⭐ 線上的敵人掉血；⛔ 側面 2 格外與射程外的都沒有（兩個方向一起驗）", () => {
    // 0: 正前方 5（線上）· 1: 前方 5 但側偏 3（寬 2 ⇒ 半寬 1，⛔ 打不到）
    // 2: 正前方 14（length 10，⛔ 超出）
    const r = rig([
      [5, 0],
      [5, 3],
      [14, 0],
    ]);
    runEffects([line()], ctxOf(r));
    const h = hits(r.world);
    expect(h.get(r.marks[0]!), "線正中央的敵人沒掉血 —— damageLine 整個沒發生").toBe(100);
    expect(h.has(r.marks[1]!), "側偏 3 格的人也被打到 —— width 沒有在夾").toBe(false);
    expect(h.has(r.marks[2]!), "14 格外的人被打到 —— length 沒有在夾").toBe(false);
  });

  it("⛔ 隊友站在線上不會被自己人砍，施法者自己也不吃", () => {
    const r = rig([[4, 0], [6, 0]], [0]);
    runEffects([line()], ctxOf(r));
    const h = hits(r.world);
    expect(h.has(r.marks[0]!), "隊友吃到了自己人的直線傷害").toBe(false);
    expect(h.get(r.marks[1]!), "同一條線上的敵人反而沒吃到").toBe(100);
    expect(h.has(r.caster), "施法者砍到自己").toBe(false);
  });

  it("⭐ 線的長度真的是 length —— 拉長就打得到原本打不到的那個人", () => {
    // 同一個人站在 12 格：length 10 打不到、length 14（= 龜派氣功出貨值）打得到。
    // ⛔ 這一條擋的是「幾何欄位其實沒有被讀」——那時上一條仍然全綠。
    const near = rig([[12, 0]]);
    runEffects([line()], ctxOf(near));
    expect(hits(near.world).has(near.marks[0]!)).toBe(false);

    const far = rig([[12, 0]]);
    runEffects([line({ length: 14 })], ctxOf(far));
    expect(hits(far.world).get(far.marks[0]!), "length 14 仍然打不到 12 格外的人").toBe(100);
  });
});
