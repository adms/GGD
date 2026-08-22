/**
 * 【開關型技能】的**承重**守衛（GH#546）—— 「開著」這件事真的走完整條路，
 * 從線路上的一格 bit 一路到六個算繪點畫出來的那個元素。
 *
 * ⭐ 它擋的是這個 repo 記錄過最貴的一種缺陷（失敗形態③）：2026-08-22 的對抗驗證
 * 量到 `abilityTileFrameStyle()` **三態全部寫好了、後台頁全部接好了、出貨 JSON
 * 全部在了**，而出貨路徑上唯一的呼叫者是它自己的單元測試 —— 六個算繪點沒有一個
 * 呼叫它。整條功能可以從渲染樹刪掉，而全套測試是綠的。
 *
 * ⛔ 所以這裡**不掃原始碼、也不掃 CSS 字串**：它把出貨的 `<AbilityBar/>` 與
 * `<TouchControls/>` 真的渲染出來（`renderToStaticMarkup`，這個 repo 的既有做法，
 * 見 `components/abilityBarScale.test.ts`），然後數**畫出來的 HTML 裡**有幾個元素
 * 帶著「開啟中」那一段動畫。斷言讀的是最終物件。
 *
 * 突變紀錄（接線類，一條，挑最承重的那一條線）：
 *   · `abilityReadyFrame.AbilityTileFrame` 的 `abilityTileFrameStyle` 換回
 *     `isAbilityTileReady(…) ? abilityReadyFrameStyle(rgb) : null`
 *     （＝落地之前那個形狀）→ 第一條紅：六個算繪點一個開啟框都畫不出來。
 *
 * ⛔ 這裡不驗顏色、不驗 sweepMs、不驗 rimPx —— 那些是**數字**，住在
 * `content/config/toggle-ability.json` + Zod + 後台三個地方，已經有漂移守衛。
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import { CASTABLE_SLOTS } from "@ggd/shared/sim/intents";
import { TOGGLE_MASK_SLOTS, toggleMaskHas, toggleMaskWith } from "@ggd/shared/protocol/schema";
import { AbilityBar } from "./components/AbilityBar";
import { TouchControls } from "./TouchControls";
import { TOGGLE_ANIM_NAME, resetToggleAbility } from "./toggleAbility";
import { hudStore, resetHudStore, type SeatView } from "../net/RoomStore";

const HERO = "godie-togglewire" as ChampionId;
const INNATE_ID = `${HERO}.passive` as AbilityId;
const EX_ID = `${HERO}.ex` as AbilityId;

const ability = (id: string, over: Partial<AbilityDef> = {}): AbilityDef =>
  ({
    id,
    name: `技能${id}`,
    castType: "self",
    maxRank: 5,
    cooldown: [8, 8, 8, 8, 8],
    manaCost: [0, 0, 0, 0, 0],
    range: 5,
    effects: [],
    ...over,
  }) as unknown as AbilityDef;

function registerHero(): void {
  // 天生技與 EX 是**獨立文件**（passiveAbility / exAbilityId 指過去），⛔ 不是內嵌 ——
  // 否則 `championPassive()` / `exSlotView()` 解析不到，那兩格根本不會被畫出來，
  // 而「沒被畫出來」與「畫出來但沒有開啟框」在一個只會數數的斷言裡長得一樣。
  Abilities.register(INNATE_ID, ability(INNATE_ID, { innateKind: "active" } as Partial<AbilityDef>));
  Abilities.register(EX_ID, ability(EX_ID));
  Champions.register(HERO, {
    id: HERO,
    name: "測試英雄",
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    passiveAbility: INNATE_ID,
    abilities: {
      Q: ability(`${HERO}.Q`, { slot: "Q" } as Partial<AbilityDef>),
      W: ability(`${HERO}.W`, { slot: "W" } as Partial<AbilityDef>),
      E: ability(`${HERO}.E`, { slot: "E" } as Partial<AbilityDef>),
      R: ability(`${HERO}.R`, { slot: "R" } as Partial<AbilityDef>),
    },
  } as unknown as ChampionDef);
}

/**
 * 出貨的兩條技能列，在「這幾格開著」的情況下渲染出來的 HTML。
 *
 * ⚠️ 每一格技能都**故意在冷卻中**（`cooldowns` / `exCooldown` / `passiveCooldown`
 * 全部 > 0）。這是這條守衛的核心：出貨的 20-01 風王結界開著的期間**自己就在
 * 60 秒冷卻裡**，所以就緒框對它是 false —— 一支開著的切換技與一支單純在冷卻的
 * 技能，在這條線落地之前於畫面上逐位元一模一樣。⇒ 讓就緒框全部不亮，畫面上剩下
 * 的每一個框都只可能來自「開啟中」那條路。
 */
function renderBars(mask: number): string {
  registerHero();
  resetHudStore();
  resetToggleAbility();
  hudStore.setState({
    connected: true,
    phase: "combat",
    localSeatId: 0,
    localMana: 9999,
    seats: [
      {
        seatId: 0,
        championId: HERO,
        abilityRanks: [1, 1, 1, 1],
        cooldowns: [60, 60, 60, 60],
        unspentPoints: 0,
        exAbilityId: EX_ID,
        exRank: 1,
        exCooldown: 60,
        passiveCooldown: 60,
        toggleMask: mask,
      } as unknown as SeatView,
    ],
  });
  return renderToStaticMarkup(createElement(AbilityBar)) + renderToStaticMarkup(createElement(TouchControls));
}

/** 畫出來的 HTML 裡，有幾個元素帶著「開啟中」那一段流轉動畫。 */
function toggleFrames(html: string): number {
  return html.split(TOGGLE_ANIM_NAME).length - 1;
}

afterEach(() => {
  resetHudStore();
  resetToggleAbility();
});

describe("開關型技能：開著的那一格，六個算繪點都看得出來 (GH#546)", () => {
  it("⭐ 六格全開 → 兩條技能列的六個算繪點全部畫出開啟框；全關 → 一個都沒有", () => {
    // 全關：每一格都在冷卻，所以就緒框也不亮 —— 畫面上一個框都不該有。
    expect(toggleFrames(renderBars(0)), "沒有任何技能開著，卻畫出了開啟框").toBe(0);

    // 六格全開（bit 由 `toggleMaskWith` 產生，⛔ 測試裡不手寫 `1 << i`）。
    let all = 0;
    for (let i = 0; i < TOGGLE_MASK_SLOTS; i++) all = toggleMaskWith(all, i, true);
    const html = renderBars(all);

    // 六個算繪點 = AbilityBar 的（天生技 · Q · W · E · R · EX）＋ TouchControls 的
    // （Q · W · E · R · EX · 天生技）。⛔ 斷言的是「兩條列上每一個家族都接了」，
    // 而不是一個抄下來的總數：少接任何一個算繪點都會低於這個數。
    expect(toggleFrames(html), "有算繪點沒有拿到「開啟中」的樣式").toBe(
      CASTABLE_SLOTS.length * 2,
    );
  });

  it("⭐ 遮罩的編號就是 CASTABLE_SLOTS 的編號 —— 加第七格不可以被靜默截掉", () => {
    // `protocol/schema.ts` 刻意不 import `sim/intents`（線路層 ⊥ 規則層），
    // 所以那個常數與這張表的對帳**只能**在這裡做。有人加第七個 castable slot 時
    // 這條會紅，⛔ 而不是讓第七格永遠讀成「關著」（一個按了沒反應、也沒有人報錯的技能）。
    expect(TOGGLE_MASK_SLOTS).toBe(CASTABLE_SLOTS.length);
    // 界外一律讀成「關著」：舊的／投影不完整的快照必須降級成這條線出現之前的畫面。
    expect(toggleMaskHas(0xff, TOGGLE_MASK_SLOTS)).toBe(false);
  });
});
