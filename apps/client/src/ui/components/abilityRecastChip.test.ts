/**
 * ⭐【後段角標真的畫在出貨的技能格上】（GH#1208，#1187 的另一半）
 *
 * ⚠️ `EntityState.recastCharges` / `recastWindow` 有**唯一的寫端**
 *（`game-server/src/net/snapshot.ts`，那兩行的註解自己說了「沒有它，客戶端永遠讀到 0」）
 * ⛔ 而在這一條之前客戶端**一行都沒有讀** ⇒ 玩家按了阿璃 R 之後不知道還能再按幾次
 *（失敗形態②：算出來了但畫面沒有）。
 *
 * ⭐ 讀的是 `renderToStaticMarkup(<AbilityBar/>)` ＝ **出貨的那棵樹**，
 * ⛔ 不是手搭的夾具（失敗形態⑤）。
 *
 * ⭐ **兩個方向**（⛔ 一個方向不算）：有後段時看得到，⛔ 沒有後段時一格都不畫。
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { AbilityBar } from "./AbilityBar";
import { resetHudStore, syncHudFromState } from "../../net/RoomStore";
import type { MatchState } from "@ggd/shared/protocol/schema";

const CHAMP = "godie-recastchip-test" as ChampionId;

const ability = (slot: CoreAbilitySlot): AbilityDef =>
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
  }) as unknown as AbilityDef;

/**
 * `charges` / `windowTicks` 逐槽（Q W E R）。
 *
 * ⭐⭐ 走**出貨的** `syncHudFromState()` —— ⛔ 不是 `hudStore.setState({seats:[...]})`。
 * ⚠️ 這一條是踩出來的：第一版直接塞 seat 物件，於是**把 store 的投影整段繞過去了**
 *（失敗形態⑤：被測的不是出貨的那個）——
 * 突變「store 不投影 recastCharges」⇒ 測試**照樣綠**。
 * ⭐ 改走這條之後，同一個突變當場紅。
 */
function renderBar(charges: number[], windowTicks: number[]): string {
  Champions.register(CHAMP, {
    id: CHAMP,
    name: "測試·後段角標",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: Object.fromEntries(
      (["Q", "W", "E", "R"] as CoreAbilitySlot[]).map((s) => [s, ability(s)]),
    ),
  } as unknown as ChampionDef);
  resetHudStore();
  const ME = "acc-recast";
  syncHudFromState(
    {
      matchId: "m", phase: "combat", round: 1, tick: 30, phaseTicksLeft: 300, seed: 1,
      teams: [],
      seats: new Map([["0", {
        seatId: 0, teamId: 0, accountId: ME, displayName: "me", connected: true,
        driver: "human", championId: CHAMP, entityId: 101, level: 1, gold: 0, xp: 0,
        ready: false, unspentPoints: 0, lastAckSeq: 0, items: [], augments: [], mobKills: 0,
        abilityRanks: [1, 1, 1, 1], cooldowns: [0, 0, 0, 0],
        recastCharges: charges, recastWindow: windowTicks, offers: [],
      }]]),
      entities: new Map([["101", { id: 101, kind: 1, seatId: 0, x: 0, z: 0, fx: 1, fz: 0,
        zone: 0, alive: true, hp: 100, maxHp: 100, shield: 0, mana: 500, maxMana: 500 }]]),
    } as unknown as MatchState,
    ME,
  );
  return renderToStaticMarkup(createElement(AbilityBar));
}

describe("後段角標 (GH#1208)", () => {
  it("⭐ 有後段的那一格印出段數與秒數；⛔ 其餘三格一個角標都沒有", () => {
    // R 槽（索引 3）剩 2 段、窗口 45 tick（30Hz ⇒ 1.5 秒）
    const html = renderBar([0, 0, 0, 2], [0, 0, 0, 45]);
    expect(html.split("data-recast-slot").length - 1, "⛔ 四格裡只有 R 在後段").toBe(1);
    expect(html, "⛔ 段數沒印出來 ⇒ 玩家不知道還能按幾次").toContain('data-recast-slot="2"');
    // ⭐ 秒數由 `cooldownSeconds()` 算（⛔ 不是測試自己抄一份 /30）
    expect(html, "⛔ 窗口倒數沒印出來").toContain("1.5s");
    const at = html.indexOf("data-recast-slot");
    expect(html.slice(at, at + 400), "⛔ 角標要疊在格子上,不可以推開版面").toContain("position:absolute");
  });

  it("⛔ 沒有任何技能在後段時，畫面逐位元不變（⭐ 反方向）", () => {
    const none = renderBar([0, 0, 0, 0], [0, 0, 0, 0]);
    expect(none, "⛔ 沒有後段卻畫了角標").not.toContain("data-recast-slot");
    // ⭐ 量尺自證：同一棵樹在有後段時**確實**不一樣 —— ⛔ 否則上面那條可能是永遠綠
    expect(renderBar([0, 0, 0, 2], [0, 0, 0, 45])).not.toBe(none);
  });
});
