/**
 * 「切了版本，鍵**真的**換了」—— GH#863 Phase 2 的承重守衛。
 *
 * ⭐ 這一支問的是**接縫**：`config.controller-scheme@1` 的資料有沒有真的走到
 * `mapGamepadFrame` 的派送。⛔ 不是「JSON 對不對」（那由 shared 側的
 * `controllerScheme.test.ts` 守），也⛔不是「按鍵索引對不對」。
 *
 * ⚠️ 為什麼這個接縫值得一條測試：兩邊各自都可以是綠的而功能是死的 ——
 * JSON 寫著 v4、派送照樣讀寫死的表，⭐ 而症狀是「切了版本但鍵沒換」，
 * ⛔ 看起來就像 owner 記錯了自己按哪一顆。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { AimAbility } from "./AimResolver";
import type { CastableSlot } from "@ggd/shared/sim/intents";
import {
  zConfigControllerSchemeDoc,
  type ControllerSchemeEntry,
} from "@ggd/shared/content";
import { BTN, mapGamepadFrame, type GamepadFrame, type GamepadPlayerCtx } from "./GamepadInput";
import { pickNearestUnit } from "./Picking";

const DOC = zConfigControllerSchemeDoc.parse(
  JSON.parse(
    readFileSync(new URL("../../../../content/config/controller-scheme.json", import.meta.url), "utf8"),
  ),
);
const V3 = DOC.schemes["v3-shipped"] as ControllerSchemeEntry;
const V4 = DOC.schemes.v4 as ControllerSchemeEntry;

const ABILITIES: Record<CastableSlot, AimAbility> = {
  Q: { castType: "self", range: 1 },
  W: { castType: "self", range: 1 },
  E: { castType: "self", range: 1 },
  R: { castType: "self", range: 1 },
  EX: { castType: "self", range: 1 },
  PASSIVE: { castType: "self", range: 1 },
};
const ctx = (scheme: ControllerSchemeEntry, skillPoints = 0): GamepadPlayerCtx => ({
  selfPos: { x: 0, z: 0 },
  facing: { x: 1, z: 0 },
  lastAimDir: null,
  ability: (s) => ABILITIES[s],
  nearestEnemy: () => 77,
  skillPoints,
  scheme,
});
const press = (b: number): GamepadFrame => ({ move: null, aim: null, justPressed: [b] });
const castSlot = (scheme: ControllerSchemeEntry, b: number): string | undefined => {
  const c = mapGamepadFrame(press(b), ctx(scheme)).commands.find((x) => x.kind === "castAbility");
  return c && "slot" in c ? (c.slot as string) : undefined;
};

describe("手把操作方案真的驅動派送 (GH#863)", () => {
  it("⭐ 同一顆 B 在兩版送出不同的技能槽", () => {
    expect(castSlot(V3, BTN.B)).toBe("W"); // 出貨
    expect(castSlot(V4, BTN.B)).toBe("R"); // v4
  });

  it("⭐ LB／RB 在 v4 對調（天生 ↔ EX）", () => {
    expect(castSlot(V3, BTN.LB)).toBe("EX");
    expect(castSlot(V3, BTN.RB)).toBe("PASSIVE");
    expect(castSlot(V4, BTN.LB)).toBe("PASSIVE");
    expect(castSlot(V4, BTN.RB)).toBe("EX");
  });

  it("⭐⭐ 長按加點表跟著綁定走，⛔ 不會錯位", () => {
    // ⚠️ 這是刪掉 `RANK_BY_LONG_PRESS` 那張手寫表的理由：v4 把 B 從 W 換成 R，
    //   一張寫死的表會讓長按 B 加點加到 **W**，而畫面上完全看得過去。
    const longPress = (s: ControllerSchemeEntry): string | undefined => {
      const cmds = mapGamepadFrame(
        { move: null, aim: null, justPressed: [], longPressed: [BTN.B] },
        ctx(s, 1),
      ).commands.find((c) => c.kind === "rankUpAbility");
      return cmds && "slot" in cmds ? (cmds.slot as string) : undefined;
    };
    expect(longPress(V3)).toBe("W");
    expect(longPress(V4)).toBe("R");
  });

  it("⭐⭐ 玩家專注（LT）：只有 v4 會把「只選玩家」傳下去", () => {
    // ⚠️ 驗的是**接縫** —— 按住 LT 時，挑目標那一支收到的參數。
    const seen: (boolean | undefined)[] = [];
    const spy = (scheme: ControllerSchemeEntry, held: number[]): void => {
      mapGamepadFrame(
        { move: null, aim: null, justPressed: [BTN.RT], held },
        {
          ...ctx(scheme),
          nearestEnemy: (_f, _r, _a, opts) => {
            seen.push(opts?.playersOnly);
            return 5;
          },
        },
      );
    };
    spy(V4, [BTN.LT]); // 按住 → 只選玩家
    spy(V4, []); // 沒按 → 一般
    spy(V3, [BTN.LT]); // v3 的 LT 是 attack-move ⇒ ⛔ 沒有這個功能
    expect(seen).toEqual([true, undefined, undefined]);
  });

  it("⭐ 過濾是**移除**候選，⛔ 不是加權（spec §16 禁止瞄準磁吸）", () => {
    // 殭屍近、英雄遠 —— 一般情況挑近的；按住玩家專注時殭屍**整個不在候選裡**。
    const units = [
      { id: 1, x: 1, z: 0, radius: 0.5, priority: 1, kind: "mob" as const },
      { id: 2, x: 9, z: 0, radius: 0.5, priority: 0, kind: "champion" as const },
      { id: 3, x: 2, z: 0, radius: 0.5, priority: 0, kind: "objective" as const },
    ];
    const from = { x: 0, z: 0 };
    expect(pickNearestUnit(from, units, 20, null, 0)).toBe(1); // 一般:最近的殭屍
    expect(pickNearestUnit(from, units, 20, null, 0, { playersOnly: true })).toBe(2);
    // ⭐ 守衛塔（objective）也被排除 —— 它的 priority 是 0 但它不是玩家。
    expect(pickNearestUnit(from, [units[2]!], 20, null, 0, { playersOnly: true })).toBeNull();
  });

  it("LT：v3 是 attack-move，v4 ⛔ 不送任何 order（那一顆給了玩家專注）", () => {
    expect(mapGamepadFrame(press(BTN.LT), ctx(V3)).order?.kind).toBe("attackMove");
    expect(mapGamepadFrame(press(BTN.LT), ctx(V4)).order).toBeUndefined();
  });
});
