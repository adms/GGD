/**
 * G1 —— 「範圍解出來的那群人」的承重守衛（`victimCondition` + `onHitTargets`）。
 *
 * 讀的是 `world.damageQueue` —— handler 真正寫出去的那個物件（同 damageArea.test.ts
 * 的檔頭理由：這個功能存在的唯一理由是**第二個人身上要真的掉血**）。
 * ⛔ 不驗 `zEffectDef.safeParse`：那對「schema 開了但 handler 沒接」是全綠的，
 * 而 2026-08-10 的實測量到今天正是那個狀態（safeParse=true、下游封包 0）。
 * ⛔ 斷言裡沒有任何出貨數值；比的是**同一次執行的另一半**。
 *
 * 突變紀錄（真的做過）：
 *   · `victimFilter.ts::runOnHitChain` 的 `runList(chain, { ...ctx, targets: [...struck] })`
 *     改成 `runList(chain, ctx)`（＝把上游的震央交下去，最像「做了」的壞法）
 *     → 「打到的那群人才是下游收到的人 —— 震央與被濾掉的人都不在裡面」紅：
 *       AssertionError: 下游收到的不是這一圈真的打到的那群人: expected [ 2 ] to deeply equal [ 4 ]
 *       （2 = 震央，4 = 唯一通過過濾的殘血旁觀者）
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import type { EffectCondition } from "../content/condition";
import { asTeamId, asSeatId, type EntityId } from "../../ids";

const C = SKELETON_ARENA.zones[0]!.center;
/** 哨兵金額 —— 把下游那一段排出去的封包跟母效果的分開。 */
const MARK = 777;
/** 「血量低於一半」—— `condition.stat@1`，同一支 `evaluateCondition`。 */
const LOW_HP: EffectCondition = {
  kind: "stat",
  subject: "target",
  stat: "hp",
  mode: "percent",
  op: "<",
  value: 0.5,
};
const CHAIN: EffectDef[] = [{ kind: "damage", damageType: "true", amount: { flat: MARK } }];

interface Rig {
  world: SimWorld;
  caster: EntityId;
  epicentre: EntityId;
  bystanders: EntityId[];
}

/** `offsets` = 距震央幾公尺（東），`hpPct` 逐一對應。震央本身在施法者東邊 0.5。 */
function rig(offsets: number[], hpPct: number[]): Rig {
  const world = new SimWorld(SKELETON_ARENA, 7);
  const place = (x: number, team: number, seat: number, pct: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: C.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1,
      zone: 0,
    });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.health.set(id, {
      hp: 1000 * pct,
      maxHp: 1000,
      mana: 0,
      maxMana: 0,
      alive: true,
      shields: [],
    });
    return id;
  };
  const caster = place(C.x, 0, 0, 1);
  const epicentre = place(C.x + 0.5, 1, 1, 1);
  const bystanders = offsets.map((d, i) => place(C.x + 0.5 + d, 1, i + 2, hpPct[i] ?? 1));
  world.rebuildGrid();
  return { world, caster, epicentre, bystanders };
}

function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.epicentre],
    origin: "hook:item:test-g1",
    rng: r.world.rng,
  };
}

const area = (over: Partial<Extract<EffectDef, { kind: "damageArea" }>>): EffectDef => ({
  kind: "damageArea",
  damageType: "physical",
  amount: { flat: 100 },
  radius: 6,
  ...over,
});

describe("G1 ① —— 圈內逐一過濾 (victimCondition)", () => {
  it("圈內只有通過條件的人挨打，沒通過的一滴血都不掉", () => {
    // 兩個旁觀者都在圈內：一個滿血、一個殘血。條件是「血量 < 一半」。
    const r = rig([1, 2], [1, 0.1]);
    runEffects([area({ victimCondition: LOW_HP })], ctxOf(r));
    const struck = new Set(r.world.damageQueue.map((p) => p.target));
    // ⭐ 兩條一起讀才是守衛：只有第一條的話「handler 直接 return」也會綠。
    expect(struck.has(r.bystanders[0]!), "滿血的旁觀者挨打了 —— victimCondition 沒有逐一過濾，整圈照發").toBe(false);
    expect(struck.has(r.bystanders[1]!), "通過條件的人反而沒挨打 —— 過濾把整段關掉了").toBe(true);
  });

  it("maxTargetsCounts 決定 maxTargets 數的是「通過的人」還是「候選」", () => {
    // 距離 A < B < C，只有 B、C 通過條件，上限 2。
    const counted = (mode?: "qualified" | "candidates"): EntityId[] => {
      const r = rig([1, 2, 3], [1, 0.1, 0.1]);
      runEffects(
        [area({ victimCondition: LOW_HP, maxTargets: 2, maxTargetsCounts: mode })],
        ctxOf(r),
      );
      return r.world.damageQueue.map((p) => p.target);
    };
    // qualified（省略 = 這個）：通過的前兩個 = B、C。
    expect(counted().length, "qualified 沒有把上限用在「通過的人」身上").toBe(2);
    // candidates：先取最近兩個（A、B）再過濾 → 只剩 B，A 佔掉一格。
    expect(counted("candidates").length, "candidates 跟 qualified 打到一樣多人 —— 這一格沒有被讀").toBe(1);
  });
});

describe("G1 ② —— 打到的那群人交給下游 (onHitTargets)", () => {
  it("打到的那群人才是下游收到的人 —— 震央與被濾掉的人都不在裡面", () => {
    const r = rig([1, 2], [1, 0.1]);
    runEffects([area({ victimCondition: LOW_HP, onHitTargets: CHAIN })], ctxOf(r));
    const chain = r.world.damageQueue.filter((p) => p.amount === MARK).map((p) => p.target);
    // 一條斷言關三個洞：接線在不在、交的是哪一份、①與②的接合處。
    expect(chain, "下游收到的不是這一圈真的打到的那群人").toEqual([r.bystanders[1]!]);
  });

  it("一個人都沒打到時，下游預設不跑；runOnEmptyHit 開著才跑", () => {
    // 下游用 `spawnVfx{at:"self"}` —— 它**不需要目標**也做得出事，所以「跑了沒」
    // 才分得出來（用 `damage` 的話兩邊都是 0，那是斷言方向跟缺陷無關的④）。
    const marks = (runOnEmptyHit?: boolean): number => {
      const r = rig([1, 2], [1, 1]); // 兩個都滿血 = 沒有人通過條件
      runEffects(
        [
          area({
            victimCondition: LOW_HP,
            onHitTargets: [{ kind: "spawnVfx", vfxId: "g1-empty", at: "self" }],
            runOnEmptyHit,
          }),
        ],
        ctxOf(r),
      );
      return r.world.events.filter((ev) => ev.type === "vfxSpawn").length;
    };
    expect(marks(), "沒人通過過濾，下游卻照樣跑了 —— 預設應該是不跑").toBe(0);
    expect(marks(true), "runOnEmptyHit 開著，下游還是沒跑 —— 這一格沒有被讀").toBe(1);
  });
});
