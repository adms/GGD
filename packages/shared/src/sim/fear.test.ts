/**
 * 【恐懼】的行為守衛（Lane B）。
 *
 * ⭐ 驗的是**身體真的往反方向走了**，不是「status 掛上去了」。
 * 「掛上去了」是屬性；恐懼的全部價值是那個位移（CLAUDE.md 失敗形態 ⑦）。
 * 所以這一條跑**真的 `world.step()`**，而且用**出貨的那條路**掛狀態
 * （`runEffects` → `applyStatus`），不是手寫一筆 `StatusEffect`（失敗形態 ⑤：
 * 手寫的話，即使 `applyStatus` 從來沒有把 `feared` 抄進 status，測試照樣綠）。
 *
 * ⛔ 沒有任何出貨數值住在斷言裡（第零守則⑦）：斷言是「距離變大 / 變小」的**方向**，
 * 不是「跑了幾單位」。逃跑速度、恐懼秒數、掃描半徑改了，這一條都不該紅。
 *
 * 對照組是同一份設定 **只差沒中恐懼** —— 兩邊都拿到「朝敵人走」的指令，所以
 * 綠燈的意思是「恐懼把一個正在衝鋒的身體反轉了」，而不是「被恐懼的人剛好沒動」
 * （失敗形態 ④：斷言方向跟缺陷無關）。
 *
 * 突變紀錄：
 *   · `fear.ts::fearFlee` 的 `nav.moveTarget = {…逃跑點…}` 那一段拿掉
 *     → 「遠離」紅（距離不再變大）。
 *   · `fear.ts::fearFlee` 的 `nav.attackTarget = null` 拿掉
 *     → 「不攻擊」紅（被恐懼的人握著目標）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent, SELA } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { runEffects } from "./effects/effectRunner";
import { dist } from "./math/vec2";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";
import type { StatusId } from "../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** 敵我各一：敵人站中心，受害者站在 x+8，並且**被命令朝敵人走**。 */
function rig(withFear: boolean): { world: SimWorld; victim: EntityId; foe: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 7);
  world.combatActive = true;
  const spawn = (seat: number, team: number, dx: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id as ChampionId,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + dx, z: C.z },
      zone: 0,
    });
  const foe = spawn(1, 1, 0);
  const victim = spawn(0, 0, 8);
  world.step(new Map());
  if (withFear) {
    runEffects(
      [{ kind: "applyStatus", statusId: "fear" as StatusId, duration: 5, feared: true }],
      { world, caster: foe, rank: 1, targets: [victim], origin: "test:fear", rng: world.rng },
    );
  }
  return { world, victim, foe };
}

/** 每一 tick 都推「朝敵人走」—— 搖桿玩家的行為，也是恐懼要推翻的東西。 */
function charge(world: SimWorld, foe: EntityId): Map<SeatId, IntentFrame> {
  const p = world.transform.get(foe)!.pos;
  return new Map([[asSeatId(0), { order: { kind: "move" as const, point: { ...p } }, commands: [] }]]);
}

function run(withFear: boolean): { d0: number; d1: number; held: EntityId | null } {
  const { world, victim, foe } = rig(withFear);
  const at = (): number => dist(world.transform.get(victim)!.pos, world.transform.get(foe)!.pos);
  const d0 = at();
  for (let i = 0; i < 40; i++) world.step(charge(world, foe));
  return { d0, d1: at(), held: world.nav.get(victim)!.attackTarget };
}

describe("恐懼 —— 會逃跑的 AI 狀態", () => {
  it("被恐懼的身體遠離敵人並停手；同樣被命令衝鋒的對照組則貼上去開打", () => {
    const feared = run(true);
    const control = run(false);

    // ① 逃 —— 方向，不是距離。
    expect(feared.d1).toBeGreaterThan(feared.d0);
    // 對照組拿的是**一模一樣**的衝鋒指令，證明變大的原因是恐懼而不是設定。
    expect(control.d1).toBeLessThan(control.d0);

    // ② 不打 —— 對照組貼上去之後手上有目標，被恐懼的沒有。
    expect(feared.held).toBeNull();
    expect(control.held).not.toBeNull();
  });
});
