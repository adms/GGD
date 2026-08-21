/**
 * GH#512 —— 手把瞄準的三條機制守衛。
 *
 * ⛔ 這裡**一個出貨數值都不斷言**（第二守則：驗機制不驗數字）。夾限、係數、射程
 * 全部由夾具餵進去，斷言的是「輸出跟著輸入走」這個關係本身 ——
 * 任何寫死的常數都不可能同時滿足兩支射程不同的技能。
 */
import { describe, it, expect, afterEach } from "vitest";
import type { CastableSlot } from "@ggd/shared/sim/intents";
import {
  BTN,
  GROUND_CAST_MAX,
  mapGamepadFrame,
  padCastReach,
  type GamepadFrame,
  type GamepadPlayerCtx,
} from "./GamepadInput";
import { resolveAoeCenter, setCursorlessAim, type AimAbility } from "./AimResolver";

const SELF = { x: 100, z: 100 };
/** 兩支只差 range 的 ground 技能 —— 一個常數不可能同時是它們兩個的射程。 */
const SHORT: AimAbility = { castType: "ground", range: GROUND_CAST_MAX / 2 };
const LONG: AimAbility = { castType: "ground", range: GROUND_CAST_MAX * 3 };

function ctx(ability: (slot: CastableSlot) => AimAbility | null, mult?: number): GamepadPlayerCtx {
  const c: GamepadPlayerCtx = {
    selfPos: SELF,
    facing: { x: 0, z: 1 },
    lastAimDir: null,
    ability,
    nearestEnemy: () => null,
    skillPoints: 0,
  };
  return mult === undefined ? c : { ...c, abilityRangeMult: mult };
}

const press = (button: number): GamepadFrame => ({
  move: null,
  aim: { x: 0, z: 1 },
  justPressed: [button],
});

/** 送出去的 ground 落點離施法者多遠。 */
function castDistance(ability: AimAbility, mult?: number): number {
  const intent = mapGamepadFrame(press(BTN.X), ctx(() => ability, mult));
  const cmd = intent.commands[0];
  if (!cmd || cmd.kind !== "castAbility" || cmd.target.type !== "point") return Number.NaN;
  return Math.hypot(cmd.target.point.x - SELF.x, cmd.target.point.z - SELF.z);
}

afterEach(() => setCursorlessAim(null));

describe("GH#512 手把地面型瞄準", () => {
  it("落點距離跟著技能自己的射程走,⛔ 不是一個固定夾限", () => {
    // 承重的那一條:兩支技能 → 兩個不同的距離,各自等於自己的射程。
    expect(castDistance(SHORT)).toBeCloseTo(padCastReach(SHORT, 1), 6);
    expect(castDistance(LONG)).toBeCloseTo(padCastReach(LONG, 1), 6);
    // 舊的硬夾限會把長射程那支砍到 GROUND_CAST_MAX —— 現在它超過了。
    expect(castDistance(LONG)).toBeGreaterThan(GROUND_CAST_MAX);
  });

  it("combat-env 的 abilityRange 係數乘得進去(operator 改後台就跟著動)", () => {
    const half = castDistance(LONG, 0.5);
    expect(half).toBeCloseTo(castDistance(LONG, 1) / 2, 6);
  });

  it("按空的技能鍵會回報 refused —— ⛔ 不再是完全靜音", () => {
    const intent = mapGamepadFrame(press(BTN.X), ctx(() => null));
    expect(intent.commands).toEqual([]);
    expect(intent.refused).toEqual(["E"]);
  });

  it("預覽圓心讀手把瞄準向量,⛔ 不是滑鼠落點", () => {
    // 滑鼠停在施法者「後面」(手把玩家根本沒動過滑鼠 → cursorGround 退回 self)
    const mouse = { selfPos: SELF, cursorGround: SELF, hoveredEntityId: null };
    expect(resolveAoeCenter(LONG, mouse)).toEqual(SELF); // 修之前:圈畫在腳下
    setCursorlessAim({ x: 0, z: 1 });
    const aimed = resolveAoeCenter(LONG, mouse);
    expect(aimed).toEqual({ x: SELF.x, z: SELF.z + LONG.range });
  });
});
