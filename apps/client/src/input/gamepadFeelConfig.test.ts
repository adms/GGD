/**
 * 手把手感的**三住處 drift + 承重接線**守衛（GH#520）。
 *
 * ① 三住處：`content/config/gamepad.json` × shared `DEFAULT_GAMEPAD_FEEL_POLICY`
 *    × 客戶端 `DEFAULT_GAMEPAD_FEEL`，比對**真的 import 進來的常數**（⛔ 不 grep 原始碼）；
 *    外加 2026-08-02 那一步：出貨文件要真的被 `zConfigDoc` 收下。
 * ② 承重：餵一組**非出貨**的手感，五條路真的都跟著動 —— 三份一致但沒有人讀它，
 *    就是「後台存了、遊戲一輩子看不到」。⛔ 斷言全部從 {@link FEEL} 與出貨值推導。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_GAMEPAD_FEEL_POLICY, zConfigDoc } from "@ggd/shared/content";
import type { Order } from "@ggd/shared/sim/intents";
import {
  BTN,
  DEFAULT_GAMEPAD_FEEL as SHIP,
  GamepadInput,
  GamepadSystem,
  mapGamepadFrame,
  type GamepadFeel,
  type GamepadPlayerCtx,
  type PadState,
} from "./GamepadInput";

const DOC = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../content/config/gamepad.json", import.meta.url)), "utf8"),
) as Record<string, unknown>;

/** ⛔ 每一格都刻意**離出貨值有距離** —— 相同的那一格對「根本沒讀設定」也會過。 */
const FEEL: GamepadFeel = {
  deadzone: SHIP.deadzone + 0.3,
  moveLead: SHIP.moveLead + 5,
  attackMoveLead: SHIP.attackMoveLead + 5,
  basicAttackRange: SHIP.basicAttackRange + 19,
  longPressMs: SHIP.longPressMs + 600,
};
/** 出貨值與 FEEL 的正中間：⛔ 出貨那一邊收得下，FEEL 那一邊收不下。 */
const mid = (k: "deadzone" | "longPressMs"): number => (SHIP[k] + FEEL[k]) / 2;

const ctx = (rec: number[]): GamepadPlayerCtx => ({
  selfPos: { x: 0, z: 0 },
  facing: { x: 0, z: 1 },
  lastAimDir: null,
  ability: () => null,
  nearestEnemy: (_from, maxRange) => (rec.push(maxRange), null),
  skillPoints: 0,
  feel: FEEL,
});
const pad = (x: number, down: number[]): PadState => ({
  connected: true,
  axes: [x, 0, 0, 0],
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })),
});

describe("手把手感住在後台 (GH#520)", () => {
  it("★ 三個住處逐格一致，而且出貨文件被 collection union 收下", () => {
    const META = ["id", "schema", "note"];
    expect(Object.fromEntries(Object.entries(DOC).filter(([k]) => !META.includes(k)))).toEqual({
      ...DEFAULT_GAMEPAD_FEEL_POLICY,
    });
    expect({ ...SHIP }).toEqual({ ...DEFAULT_GAMEPAD_FEEL_POLICY });
    expect(zConfigDoc.safeParse(DOC).success).toBe(true);
    // 反向對照:union 不是照單全收（少了它，壞掉的 union 也會全綠 —— 失敗形態 ④）。
    expect(zConfigDoc.safeParse({ ...DOC, schema: "config.not-wired-yet@1" }).success).toBe(false);
  });

  it("★ 承重:五條路真的讀那份設定，⛔ 不是讀模組常數", () => {
    const seen: number[] = [];
    const f = (justPressed: number[], move: { x: number; z: number } | null): Order | undefined =>
      mapGamepadFrame({ move, aim: null, justPressed }, ctx(seen)).order;
    expect(f([], { x: 1, z: 0 })).toEqual({ kind: "move", point: { x: FEEL.moveLead, z: 0 } });
    expect(f([BTN.LT], { x: 1, z: 0 })).toEqual({
      kind: "attackMove",
      point: { x: FEEL.attackMoveLead, z: 0 },
    });
    f([BTN.RT], null);
    expect(seen).toContain(FEEL.basicAttackRange);

    let t = 0;
    let held: number[] = [];
    let ax = mid("deadzone");
    const input = new GamepadInput(0, () => pad(ax, held), () => t, () => FEEL);
    expect(input.poll()?.move, "死區沒有從設定讀（出貨死區收得下這個推程）").toBeNull();
    ax = FEEL.deadzone + 0.1;
    expect(input.poll()?.move).not.toBeNull();
    held = [BTN.A];
    input.poll();
    t += mid("longPressMs");
    expect(input.poll()?.longPressed, "長按門檻沒有從設定讀").toEqual([]);
    t += FEEL.longPressMs;
    expect(input.poll()?.longPressed).toEqual([BTN.A]);
  });

  it("★ 承重:系統層真的把生效中的手感交給純 mapping（⛔ 刪掉會靜靜退回出貨值）", () => {
    const orders: Order[] = [];
    const sinks = { onOrder: (o: Order) => orders.push(o), onAim: () => {}, onCommand: () => {}, onPadsChanged: () => {} };
    new GamepadSystem(sinks, () => ctx([]), () => [pad(1, [])], () => 1, () => FEEL).poll();
    expect(orders[0]).toEqual({ kind: "move", point: { x: FEEL.moveLead, z: 0 } });
  });
});
