/**
 * 條件角標真的畫在**出貨的**技能格上（GH#556）。
 *
 * ⭐ 驗 owner 那句話的兩半：觸發條件**看得到**，而且**不佔空間**（`position:absolute`
 * 疊在既有 tile 上 ⇒ 推不開任何東西）。⛔ 斷言裡沒有手打的句子 —— 期望值由
 * `conditionLabel(GATE)` 現算，角標哪天改成自己造句就紅。讀的是
 * `renderToStaticMarkup(<AbilityBar/>)`（同 abilityBarScale.test.ts）＝**出貨的那棵樹**，
 * ⛔ 不是手搭的夾具（失敗形態⑤）。
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
/** `not` of a kind leaf → 「目標不是英雄」：⛔ 無 HTML 特殊字元，也非手寫句子。 */
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
    abilities: Object.fromEntries(
      (["Q", "W", "E", "R"] as CoreAbilitySlot[]).map((s) => [s, ability(s, s === "Q")]),
    ),
  } as unknown as ChampionDef);
  resetHudStore();
  const seat = { seatId: 0, championId: CHAMP, abilityRanks: [1, 1, 1, 1], cooldowns: [0, 0, 0, 0] };
  hudStore.setState({
    connected: true,
    phase: "combat",
    localSeatId: 0,
    seats: [seat as unknown as SeatView],
  });
  return renderToStaticMarkup(createElement(AbilityBar));
}

describe("條件角標 (GH#556)", () => {
  it("只有帶 gate 的那一格有角標，句子是推導出來的，而且不佔版面", () => {
    const html = renderBar();
    expect(html.split("data-ability-condition-mark").length - 1, "四格裡只有 Q 帶 gate").toBe(1);
    expect(conditionMarkTitle(ability("Q", true))).toBe(conditionLabel(GATE));
    expect(conditionMarkTitle(ability("W", false))).toBeNull();
    expect(html).toContain(`title="${conditionMarkTitle(ability("Q", true))}"`);
    const at = html.indexOf("data-ability-condition-mark");
    expect(html.slice(at, at + 400)).toContain("position:absolute");
    expect(html.slice(at, at + 400)).toContain(CONDITION_MARK_LABEL);
  });
});
