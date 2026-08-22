/**
 * 條件角標真的畫在**出貨的**技能格上（GH#556）。
 *
 * ⭐ 這條驗的是 owner 那句話的兩半：觸發條件**看得到**（角標在），而且**不佔空間**
 * （`position:absolute` 疊在既有 tile 上 ⇒ 它推不開任何東西）。
 *
 * ⛔ 斷言裡沒有手打的句子 —— `title` 的期望值由 `conditionLabel(GATE)` 現算，
 * 跟角標自己呼叫的是同一支函式。角標哪天改成自己造句，這裡就紅。
 *
 * 讀的是 `renderToStaticMarkup(<AbilityBar/>)`（同 abilityBarScale.test.ts 的做法）
 * —— 出貨的那棵樹，⛔ 不是一個手搭的夾具（失敗形態⑤）。
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { conditionLabel, type EffectCondition } from "@ggd/shared/sim/content/condition";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { AbilityBar } from "./AbilityBar";
import { CONDITION_MARK_LABEL, conditionMarkTitle } from "./AbilityConditionMark";
import { hudStore, resetHudStore, type SeatView } from "../../net/RoomStore";

const CHAMP = "godie-condmark-test" as ChampionId;

/** `not` of a kind leaf → 「目標不是英雄」：⛔ 沒有 HTML 特殊字元，也不是手寫句子。 */
const GATE: EffectCondition = { not: { kind: "kind", subject: "target", is: "champion" } };

const ability = (slot: CoreAbilitySlot, gated: boolean): AbilityDef =>
  ({
    id: `${CHAMP}.${slot}`,
    name: `技能${slot}`,
    slot,
    castType: "self",
    maxRank: 3,
    cooldown: [8, 8, 8],
    manaCost: [10, 10, 10],
    range: 5,
    effects: [],
    ...(gated ? { passive: { ranks: [{ hooks: [{ on: "onBasicAttack", condition: GATE }] }] } } : {}),
  }) as unknown as AbilityDef;

/** 只有 Q 帶 gate；W/E/R 三格是對照組。 */
function renderBar(): string {
  Champions.register(CHAMP, {
    id: CHAMP,
    name: "測試·條件角標",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: {
      Q: ability("Q", true),
      W: ability("W", false),
      E: ability("E", false),
      R: ability("R", false),
    },
  } as ChampionDef);
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    localSeatId: 0,
    seats: [
      {
        seatId: 0,
        championId: CHAMP,
        abilityRanks: [1, 1, 1, 1],
        cooldowns: [0, 0, 0, 0],
        unspentPoints: 0,
        exRank: 0,
      } as unknown as SeatView,
    ],
  });
  return renderToStaticMarkup(createElement(AbilityBar));
}

describe("條件角標 (GH#556)", () => {
  it("只有帶 gate 的那一格有角標，句子是推導出來的", () => {
    const html = renderBar();
    const marks = html.split("data-ability-condition-mark").length - 1;
    expect(marks, "四格裡只有 Q 帶 gate").toBe(1);
    expect(html).toContain(`title="${conditionMarkTitle(ability("Q", true))}"`);
    expect(conditionMarkTitle(ability("Q", true))).toBe(conditionLabel(GATE));
    expect(conditionMarkTitle(ability("W", false))).toBeNull();
    // 角標在 tile 內，⛔ 不是新的一列：它疊在既有的格子上，推不開任何東西
    const at = html.indexOf("data-ability-condition-mark");
    expect(html.slice(at, at + 400)).toContain("position:absolute");
    expect(html.slice(at, at + 400)).toContain(CONDITION_MARK_LABEL);
  });
});
