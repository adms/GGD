// @vitest-environment jsdom
/**
 * 🖤 **三選一開著的時候,那兩塊東西必須各自有一個合成層。**
 *
 * > owner 2026-08-23：「**隨機三選一卡片選完前的閃爍 請找到根因修正**」
 *
 * 在真的瀏覽器上量到（見 `DRAFT_COMPOSITING` 的檔頭）：這一整頁**只有兩個**
 * 面積 >900,000 px² 的合成層,**兩個都是 `<canvas>`** —— 焦點遮罩那塊
 * **921,600 px²** 的滿版填色是**畫進 `#hud-root` 那一層**的,而那一層同時被
 * **20 條非合成無窮動畫**（合計 81,449 px²,其中 **47,232 px² 是三張卡帶來的**）
 * 逐幀弄髒 ⇒ 來不及 raster 的 tile 呈現出去就是頁面底色 `#0b0e14` ＝ **黑**,
 * 而 tile 是分塊的 ⇒ owner 的「**介面有些部分**」。
 *
 * ⚠️ 這條守衛驗的是**機制**（那兩塊有沒有離開共用層）,⛔ 不是數字 ——
 * 面積、動畫條數都會變,`will-change` 在不在**不會**。
 */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { MatchState } from "@ggd/shared/protocol/schema";

import { resetHudStore, syncHudFromState } from "../../net/RoomStore";
import { AugmentDraftPanel, DRAFT_COMPOSITING } from "./AugmentDraftPanel";

const ME = "acc-me";
const CARDS = ["all-might-hair", "bezoar-of-the-apothecary", "book-of-gospel"];

function snap(): MatchState {
  return {
    matchId: "m", phase: "intermission", round: 3, tick: 30, phaseTicksLeft: 300, seed: 1,
    teams: [],
    seats: new Map([["0", { seatId: 0, teamId: 0, accountId: ME, displayName: "me",
      connected: true, driver: "human", championId: "champ.sela", entityId: 101, level: 1,
      gold: 0, xp: 0, ready: false, unspentPoints: 0, lastAckSeq: 0, items: [], augments: [],
      mobKills: 0, abilityRanks: [1, 0, 0, 0], cooldowns: [0, 0, 0, 0],
      offers: [{ offerId: "of_1", tier: "weapon", choices: CARDS }] }]]),
    entities: new Map([["101", { id: 101, kind: 1, seatId: 0, x: 0, z: 0, fx: 1, fz: 0,
      zone: 0, alive: true, hp: 100, maxHp: 100, shield: 0, mana: 10, maxMana: 500 }]]),
  } as unknown as MatchState;
}

/** jsdom 的 cssstyle 對 `will-change` 支援不一致 —— 兩條路都讀,⛔ 不賭其中一條。 */
function willChangeOf(el: Element): string {
  const inline = (el as HTMLElement).style.getPropertyValue("will-change");
  if (inline) return inline.trim();
  return ((el.getAttribute("style") ?? "").match(/will-change:\s*([^;]+)/)?.[1] ?? "").trim();
}

let root: Root;
let host: HTMLDivElement;

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function mountDraft(): Element {
  resetHudStore();
  syncHudFromState(snap(), ME);
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root.render(React.createElement(AugmentDraftPanel)));
  const dialog = host.querySelector('[role="dialog"]');
  expect(dialog, "面板沒掛上 —— 後面驗的是一棵空樹").not.toBeNull();
  return dialog!;
}

describe("三選一的合成層", () => {
  it("★ 滿版焦點遮罩自己一層,⛔ 不畫進 #hud-root 那一層", () => {
    const scrim = mountDraft().previousElementSibling!;
    // 先釘住「這一顆真的是那塊滿版遮罩」,免得斷言飄到別的 div 上（失敗形態④）
    expect(scrim.getAttribute("style"), "抓到的不是滿版遮罩").toMatch(/inset:\s*0/);
    expect(willChangeOf(scrim), "滿版 921,600 px² 的填色留在共用層裡").toBe(
      DRAFT_COMPOSITING.scrimOwnLayer ? "opacity" : "",
    );
  });

  it("★ 三張卡各自一層（那條 blur+mask 的逐幀重繪不可以弄髒共用層）", () => {
    mountDraft();
    const cards = [...host.querySelectorAll(".ggd-btn--card")];
    expect(cards.length, "卡片沒渲染出來").toBe(CARDS.length);
    for (const c of cards) {
      expect(willChangeOf(c), "卡片的逐幀重繪還在共用層裡").toBe(
        DRAFT_COMPOSITING.cardOwnLayer ? "transform" : "",
      );
    }
  });

  it("⛔ 出貨預設兩格都開（回頭才設 false —— 靜靜關掉就是 owner 的黑閃回來）", () => {
    expect(DRAFT_COMPOSITING).toEqual({ scrimOwnLayer: true, cardOwnLayer: true });
  });
});
