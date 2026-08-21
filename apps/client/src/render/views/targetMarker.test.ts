/**
 * GUARD — GH#519「指定型技能沒有目標指示」。
 *
 * 要證明的是**機制**，⛔ 不是數字：手把的軟鎖定換人時，畫面上那個環**跟著換到
 * 新的那個人腳下**。所以斷言全部走出貨那條路（`setCursorlessAim` /
 * `setCursorlessTarget` → `resolveAoeCenter` / `resolvePadTargetMarker`），
 * ⛔ 沒有一條自己手捏 `hoveredEntityId`（失敗形態⑤：被測的不是出貨的那個）。
 *
 * 顏色與粗細一律跟 `paletteFor` / `ABILITY_RANGE_GUIDE` **對照**，
 * ⛔ 不抄出貨值 —— 那三格是後台欄位，抄進來就是第四個沒有守衛的住處。
 */
import { describe, it, expect, beforeEach } from "vitest";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import {
  resolveAoeCenter,
  setCursorlessAim,
  setCursorlessTarget,
  getCursorlessTarget,
} from "../../input/AimResolver";
import { ABILITY_RANGE_GUIDE } from "../../ui/abilityRangeGuide";
import { paletteFor } from "../../vfx/telegraphChannel";
import { ChampionView } from "./ChampionView";
import { resolvePadTargetMarker, targetRingDiameter, targetRingY } from "./targetMarker";

const TARGETED = { castType: "targeted", range: 8 } as const;
const SELF: Vec2 = { x: 0, z: 0 };
const AT_11: Vec2 = { x: 3, z: 0 };
const AT_22: Vec2 = { x: -2, z: 4 };
const WHERE: Record<number, Vec2> = { 11: AT_11, 22: AT_22 };
const posOf = (id: number): Vec2 | null => WHERE[id] ?? null;

beforeEach(() => setCursorlessAim(null));

describe("手把軟鎖定的目標指示", () => {
  it("換目標時,環與 AoE 圓心一起搬到新的那個人腳下", () => {
    setCursorlessAim({ x: 1, z: 0 });
    setCursorlessTarget(11);
    expect(resolvePadTargetMarker(posOf, () => "enemy")?.entityId).toBe(11);
    // 出貨路徑：GameApp 每幀用它算 AoE 圓心 —— 它必須指到同一個人身上。
    expect(resolveAoeCenter(TARGETED, { selfPos: SELF, cursorGround: SELF }, posOf)).toEqual(AT_11);

    // 搖桿偏壓挑到另一個人（⛔ 沒有循環鍵,方向就是換目標的手勢）
    setCursorlessTarget(22);
    const moved = resolvePadTargetMarker(posOf, () => "enemy");
    expect(moved).toMatchObject({ entityId: 22, x: AT_22.x, z: AT_22.z });
    expect(resolveAoeCenter(TARGETED, { selfPos: SELF, cursorGround: SELF }, posOf)).toEqual(AT_22);
  });

  it("放開技能鍵就收環 —— 一個活過放開那一刻的目標會指著沒有人在瞄的敵人", () => {
    setCursorlessAim({ x: 0, z: 1 });
    setCursorlessTarget(11);
    setCursorlessAim(null);
    expect(getCursorlessTarget()).toBeNull();
    expect(resolvePadTargetMarker(posOf, () => "enemy")).toBeNull();
  });

  it("查不到位置就不畫,⛔ 不退回施法者腳下（GH#415 判死的那個謊）", () => {
    setCursorlessAim({ x: 1, z: 0 });
    setCursorlessTarget(999);
    expect(resolvePadTargetMarker(posOf, () => "enemy")).toBeNull();
  });

  it("顏色來自敵/友通道本人,粗細來自範圍指引本人（⛔ 不是這裡的字面值）", () => {
    setCursorlessAim({ x: 1, z: 0 });
    setCursorlessTarget(11);
    const enemy = resolvePadTargetMarker(posOf, () => "enemy");
    const ally = resolvePadTargetMarker(posOf, () => "ally");
    expect(enemy?.rgb).toBe(paletteFor("enemy").ring);
    expect(ally?.rgb).toBe(paletteFor("ally").ring);
    expect(enemy?.rgb).not.toEqual(ally?.rgb); // 敵/友一眼分得出來
    expect(enemy?.rimThickness).toBe(ABILITY_RANGE_GUIDE.rimThickness);
  });

  it("環比自己人光環寬且更高 —— 鎖到自己時兩個環不會疊成一個(失敗形態①)", () => {
    expect(targetRingDiameter()).toBeGreaterThan(ChampionView.SELF_RING_DIAMETER);
    expect(targetRingY()).toBeGreaterThan(ChampionView.SELF_RING_Y);
  });
});
