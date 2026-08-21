/**
 * 手把手感的**三住處 drift + 承重接線**守衛（GH#520）。
 *
 * ① 三住處：`content/config/gamepad.json` × shared 的 `DEFAULT_GAMEPAD_FEEL_POLICY`
 *    × 客戶端的 `DEFAULT_GAMEPAD_FEEL`。⛔ 比對的是**真的 import 進來的常數**，
 *    不是 grep 原始碼有沒有出現那串數字（失敗形態 ⑥/⑦）。
 *    外加 2026-08-02 那一步：出貨文件要真的被 `zConfigDoc`（collection union）收下 ——
 *    union 漏一行 = 內容整棵驗證失敗 → 退回 2 隻骨架英雄，而網站看起來完全正常。
 *
 * ② 承重：**餵一組非出貨的手感進去，四條路真的都跟著動**。這一條才是這張票的
 *    重點 —— 三個住處全部一致但沒有人讀它，就是「後台存了、遊戲一輩子看不到」。
 *    ⛔ 斷言不抄出貨數值，全部從 {@link FEEL} 推導（第零守則⑦：數值 0 行）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_GAMEPAD_FEEL_POLICY, zConfigDoc } from "@ggd/shared/content";
import type { Order } from "@ggd/shared/sim/intents";
import {
  BTN,
  DEFAULT_GAMEPAD_FEEL,
  GamepadInput,
  GamepadSystem,
  mapGamepadFrame,
  type GamepadFeel,
  type GamepadPlayerCtx,
  type PadState,
} from "./GamepadInput";

const SHIPPED = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../../content/config/gamepad.json", import.meta.url)), "utf8"),
) as Record<string, unknown>;

/** ⛔ 刻意每一格都與出貨值不同 —— 相同的那一格對「根本沒讀設定」也會過。 */
const FEEL: GamepadFeel = {
  deadzone: 0.5,
  moveLead: 9,
  attackMoveLead: 7,
  basicAttackRange: 31,
  longPressMs: 1000,
};

const ctx = (rec: number[]): GamepadPlayerCtx => ({
  selfPos: { x: 0, z: 0 },
  facing: { x: 0, z: 1 },
  lastAimDir: null,
  ability: () => null,
  nearestEnemy: (_from, maxRange) => {
    rec.push(maxRange);
    return null;
  },
  skillPoints: 0,
  feel: FEEL,
});

const pad = (axes: number[], down: number[]): PadState => ({
  connected: true,
  axes,
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: down.includes(i) })),
});

describe("手把手感住在後台 (GH#520)", () => {
  it("★ 三個住處逐格一致，而且出貨文件被 collection union 收下", () => {
    const META = ["id", "schema", "note"];
    const payload = Object.fromEntries(Object.entries(SHIPPED).filter(([k]) => !META.includes(k)));
    expect(payload).toEqual({ ...DEFAULT_GAMEPAD_FEEL_POLICY });
    expect(DEFAULT_GAMEPAD_FEEL).toEqual({ ...DEFAULT_GAMEPAD_FEEL_POLICY });
    expect(zConfigDoc.safeParse(SHIPPED).success).toBe(true);
    // 反向對照:union 不是照單全收（少了它，壞掉的 union 也會全綠 —— 失敗形態 ④）。
    expect(zConfigDoc.safeParse({ ...SHIPPED, schema: "config.not-wired-yet@1" }).success).toBe(false);
  });

  it("★ 承重:四條路真的讀那份設定，⛔ 不是讀模組常數", () => {
    // ① 移動前導 ② attack-move 前導 ③ 搜敵半徑（都走純 mapping）
    const seen: number[] = [];
    const move = mapGamepadFrame({ move: { x: 1, z: 0 }, aim: null, justPressed: [] }, ctx(seen));
    expect(move.order).toEqual({ kind: "move", point: { x: FEEL.moveLead, z: 0 } });
    const am = mapGamepadFrame({ move: { x: 1, z: 0 }, aim: null, justPressed: [BTN.LT] }, ctx(seen));
    expect(am.order).toEqual({ kind: "attackMove", point: { x: FEEL.attackMoveLead, z: 0 } });
    mapGamepadFrame({ move: null, aim: null, justPressed: [BTN.RT] }, ctx(seen));
    expect(seen).toContain(FEEL.basicAttackRange);

    // ④ 死區與 ⑤ 長按門檻（走 GamepadInput.poll 的即時重讀）
    let t = 0;
    let held: number[] = [];
    let axes = [0.3, 0, 0, 0]; // 過得了出貨死區,過不了 FEEL 的
    const input = new GamepadInput(0, () => pad(axes, held), () => t, () => FEEL);
    expect(input.poll()?.move, "死區沒有從設定讀 —— 出貨死區收得下 0.3").toBeNull();
    axes = [DEFAULT_GAMEPAD_FEEL.deadzone + FEEL.deadzone, 0, 0, 0];
    expect(input.poll()?.move).not.toBeNull();
    held = [BTN.A];
    input.poll();
    t += DEFAULT_GAMEPAD_FEEL.longPressMs; // 過得了出貨門檻,過不了 FEEL 的
    expect(input.poll()?.longPressed, "長按門檻沒有從設定讀").toEqual([]);
    t += FEEL.longPressMs;
    expect(input.poll()?.longPressed).toEqual([BTN.A]);
  });

  it("★ 承重:系統層真的把生效中的手感交給純 mapping（⛔ 這一行刪掉會靜靜退回出貨值）", () => {
    const orders: Order[] = [];
    const sys = new GamepadSystem(
      { onOrder: (o) => orders.push(o), onAim: () => {}, onCommand: () => {}, onPadsChanged: () => {} },
      () => ctx([]),
      () => [pad([0.65, 0, 0, 0], [])],
      () => 1,
      () => FEEL,
    );
    sys.poll();
    expect(orders[0]).toEqual({ kind: "move", point: { x: FEEL.moveLead, z: 0 } });
  });
});
