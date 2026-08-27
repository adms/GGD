/**
 * ⭐ GH#330 —— 「還沒加點」在**出貨的 markup 上**看得見。
 *
 * ⚠️ owner 2026-08-14 把這個狀態回報成「悟空變身超級賽亞人**沒有任何效果、甚至
 * 沒有進入 CD 冷卻**」——引擎與內容都是好的，真相是 `rank: 0` ⇒ `castAbility`
 * 回 `"not-learned"`（被拒的施法⛔不進冷卻、不播特效、不變身 ⇒ 四個症狀一次全中）。
 * ⇒ 判準因此不是「有沒有一行提示文案」（那行 2026-08-14 就在 `castFeedback.ts`
 * 裡了），是「**沒讀到那行的人看不看得出來**」。
 *
 * ⛔ 這條**不掃原始碼字串**（失敗形態⑥）—— 它渲染真的 `AbilityBar`，讀真的 HUD
 * store，斷言那幾個字真的落在 markup 上。
 *
 * ── 突變（2026-08-27）：拿掉 AbilityBar 裡那一行 `{!learned && !passive &&
 *    <UnlearnedMark …/>}` → 第一條紅（W/E/R 三格一個「未學習」都沒有）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { hudStore, resetHudStore, type SeatView } from "../../net/RoomStore";
import { AbilityBar } from "./AbilityBar";

const CH = "godie-test0" as ChampionId;

const ability = (slot: CoreAbilitySlot): AbilityDef =>
  ({
    id: `${CH}.${slot}` as AbilityId,
    name: `技能${slot}`,
    slot,
    castType: "self",
    maxRank: 5,
    cooldown: [8, 8, 8, 8, 8],
    manaCost: [50, 50, 50, 50, 50],
    range: 5,
    effects: [],
  }) as AbilityDef;

function render(unspentPoints: number): string {
  Champions.register(CH, {
    id: CH,
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: { Q: ability("Q"), W: ability("W"), E: ability("E"), R: ability("R") },
  } as ChampionDef);
  resetHudStore();
  hudStore.setState({
    connected: true,
    phase: "combat",
    localSeatId: 0,
    localEntityId: 7,
    localMaxMana: 500,
    localMana: 400,
    localAlive: true,
    // 出生態：只有 Q 是 rank 1，W/E/R 都是 0（spawnChampion）
    seats: [
      {
        seatId: 0,
        teamId: 0,
        championId: CH,
        entityId: 7,
        alive: true,
        level: 3,
        unspentPoints,
        items: [],
        augments: [],
        abilityRanks: [1, 0, 0, 0],
        cooldowns: [0, 0, 0, 0],
      } as unknown as SeatView,
    ],
  });
  return renderToStaticMarkup(createElement(AbilityBar));
}

beforeEach(() => resetHudStore());

describe("GH#330 沒加點的格子自己說得出來", () => {
  it("W/E/R 三格都畫著「未學習」，⛔ 不是只有 pips 少一顆", () => {
    const html = render(0);
    // 非空洞：這真的是那一排技能（Q 學了、W/E/R 沒學）
    expect(html).toContain("技能Q");
    expect((html.match(/>未學習</g) ?? []).length, "看得見的字,⛔ 不是 aria-label").toBe(3);
    expect((html.match(/aria-label="尚未學習"/g) ?? []).length, "讀螢幕器那一半").toBe(3);
    // 手上沒點 ⇒ ⛔ 不可以喊「去加點」（那是一個做不到的指示）
    expect(html).not.toContain("＋ 未學習");
  });

  it("⭐ 手上有點的時候文案換成可執行的那一句", () => {
    const html = render(1);
    expect((html.match(/＋ 未學習/g) ?? []).length).toBe(3);
  });
});
