/**
 * 【背負】的行為守衛（L4，[EX∅ 根源]，禰豆子的木箱）。
 *
 * ── 為什麼上車走出貨路徑 ─────────────────────────────────────────────────
 * 每一條都用 `runEffects([{kind:"carry",…}])` 讓乘客上車，⛔ 不手寫
 * `world.carried.set()` —— 手寫的話 handler 整支刪掉這個檔還是綠的
 *（失敗形態⑤：被測的不是出貨的那個）。
 *
 * ── 三條斷言各自擋住一種「做了但玩家拿不到」───────────────────────────────
 *  ①  **同一 tick 內**乘客座標逐位元等於載具座標。⭐ 載具在那一 tick 真的被
 *      `movementSystem` 搬動過（斷言裡一起讀），所以它同時抓住「CarrySystem
 *      排在 movementSystem 前面」那個順序錯誤 —— 排錯的話乘客拿到的是**上一
 *      tick** 的位置，兩點不相等。
 *  ②  被背期間敵人的自動索敵**選不到乘客**。⭐ 夾具刻意讓乘客在比較器上
 *      **嚴格勝出**（血量較低 → `beats` 的 hp 那一關），所以「沒有閘」的實作
 *      會回乘客；有閘才會回載具。⛔ 只斷言「回了某個人」對兩種實作都會過。
 *  ③  到期之後放下：`world.carried` 清掉、選得到了、而且**不再跟著動**。
 *
 * ⛔ 數字（半徑、秒數、門檻）一律由夾具自己給，⛔ 不抄出貨的那張卡 ——
 * 那些是 owner 每週在改的平衡資料（第二守則：守衛驗機制不驗數字）。
 *
 * 突變紀錄（規格指定的那一點，真的做過）：
 *   · `systems/CarrySystem.ts` 的 `t.pos = { x: ht.pos.x, z: ht.pos.z }` 刪掉
 *     → 斷言① 紅（乘客留在原地），②③ 仍綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { startDash } from "./systems/MovementSystem";
import { runEffects } from "./effects/effectRunner";
import { acquireTarget } from "./targeting";
import type { EffectDef } from "./effects/effect";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
/** 夾具自己的數字，⛔ 不是出貨卡上的那些。 */
const CARRY_SEC = 1;
const BIG_RADIUS = 20;
const SEEK_RADIUS = 30;

function body(world: SimWorld, seat: number, team: number, dx: number): EntityId {
  const id = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: C.x + dx, z: C.z },
    zone: 0,
  });
  world.step(new Map());
  return id;
}

const CARRY: EffectDef = {
  kind: "carry",
  shape: "circle",
  radius: BIG_RADIUS,
  side: "allies",
  maxTargets: 1,
  durationSec: CARRY_SEC,
};

function board(world: SimWorld, carrier: EntityId): void {
  runEffects([CARRY], {
    world,
    caster: carrier,
    rank: 1,
    targets: [carrier],
    origin: "test:carry",
    rng: world.rng,
  });
}

/** 把載具推一段，跑一 tick，回傳這一 tick 之後的兩個座標。 */
function shove(world: SimWorld, carrier: EntityId, passenger: EntityId) {
  const before = { ...world.transform.get(carrier)!.pos };
  startDash(world, carrier, { x: 1, z: 0 }, 8, 4);
  world.step(new Map());
  return {
    before,
    carrier: world.transform.get(carrier)!.pos,
    passenger: world.transform.get(passenger)!.pos,
  };
}

describe("【背負】乘客跟著載具走，期間選不到", () => {
  it("① 同一 tick 內乘客座標逐位元等於載具座標（而且載具真的動了）／③ 到期放下就不再跟", () => {
    cover("carry-follow-and-release");
    const world = new SimWorld(SKELETON_ARENA, 11);
    world.combatActive = true;
    const passenger = body(world, 0, 0, 1);
    const carrier = body(world, 1, 0, 0);

    board(world, carrier);
    expect(world.carried.get(passenger)?.carrier, "出貨路徑沒有把人收進箱子").toBe(carrier);

    const moved = shove(world, carrier, passenger);
    // 載具真的被 movementSystem 搬過 —— 少了這一條，①會在「大家都沒動」時假綠。
    expect(moved.carrier.x, "載具這一 tick 沒有移動，①失去意義").not.toBe(moved.before.x);
    expect(moved.passenger).toEqual(moved.carrier);

    // ③ 走到期限之後：放下、而且不再跟。
    for (let i = 0; i < Math.ceil(CARRY_SEC / world.dt) + 2; i++) world.step(new Map());
    expect(world.carried.has(passenger), "到期了還在箱子裡").toBe(false);
    const after = shove(world, carrier, passenger);
    expect(after.passenger, "放下之後還在跟著載具跑").not.toEqual(after.carrier);
  });

  it("② 被背期間，敵人的自動索敵選不到乘客 —— 即使乘客在比較器上嚴格勝出", () => {
    cover("carry-untargetable-auto");
    const world = new SimWorld(SKELETON_ARENA, 11);
    world.combatActive = true;
    const passenger = body(world, 0, 0, 1);
    const carrier = body(world, 1, 0, 2);
    const foe = body(world, 2, 1, 6);
    // 讓乘客在 `beats` 的 hp 那一關**嚴格**贏過載具：沒有閘的實作一定回乘客。
    world.health.get(passenger)!.hp -= 50;
    expect(acquireTarget(world, foe, SEEK_RADIUS)?.id, "夾具沒建立起來").toBe(passenger);

    board(world, carrier);
    world.step(new Map());
    expect(acquireTarget(world, foe, SEEK_RADIUS)?.id, "箱子裡的人還是被選到了").toBe(carrier);
  });
});
