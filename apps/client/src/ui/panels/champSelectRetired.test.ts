/**
 * champSelectRetired.test.ts — 「下架的英雄在 fail-open 那條路上也拿不到」。
 *
 * ⚠️ 這份檔案的每一條都**故意用 `NO_FILTER`**，那是它存在的理由。
 * 白名單有 `enforced:false` 這條 fail-open 分支（平台連不上、localhost、
 * `pnpm dev`），而那正是我們自己試玩的環境 —— 一條只在 `enforced:true` 底下
 * 通過的守衛，對「owner 在 localhost 又看到那兩隻」完全沒有防護力。
 * 這是 `champSelectFilter.ts` 檔頭記載過的同一個坑（119 隻全部漏到選人畫面）。
 *
 * 對照組（enforced:true）也留著，因為兩條路的實作是分開的分支。
 */
import { describe, expect, it } from "vitest";
import {
  NO_FILTER,
  applyChampionWhitelist,
  isPickableChampionId,
  whitelistFromDoc,
  whitelistedChampionIds,
  type RosterChampion,
} from "./champSelectFilter";

const ROSTER: RosterChampion[] = [
  { id: "godie-e00u", name: "完全而瀟灑的女僕 - 十六夜Sakuya" },
  { id: "godie-u01f", name: "萬夫莫敵 - 黑化張飛" },
  { id: "godie-h02k", name: "熊貓" },
  { id: "godie-hart", name: "克勞德" },
];
const RETIRED: ReadonlySet<string> = new Set(["godie-e00u", "godie-u01f"]);

describe("下架的英雄：白名單全開時也不可以出現", () => {
  it("★ NO_FILTER（平台連不上／localhost）底下仍然被擋掉", () => {
    const out = applyChampionWhitelist(ROSTER, NO_FILTER, RETIRED).map((c) => c.id);
    expect(out).toEqual(["godie-h02k", "godie-hart"]);
  });

  it("★ 對照：不傳 retired 時行為完全不變（既有呼叫端零影響）", () => {
    const out = applyChampionWhitelist(ROSTER, NO_FILTER).map((c) => c.id);
    expect(out).toEqual(["godie-e00u", "godie-u01f", "godie-h02k", "godie-hart"]);
  });

  it("★ 營運「勾選」了下架的英雄也沒有用 —— 這不是一個可以被 toggle 的規則", () => {
    // 這條是刻意的：白名單是營運狀態，下架是內容事實。一次手滑的勾選
    // （或一鍵回復原廠寫回舊清單）不可以把 QWER 全空的半成品放回選人畫面。
    const wl = whitelistFromDoc({ champions: ["godie-e00u", "godie-u01f", "godie-h02k"] });
    expect(wl.enforced).toBe(true);
    const out = applyChampionWhitelist(ROSTER, wl, RETIRED).map((c) => c.id);
    expect(out).toEqual(["godie-h02k"]);
  });

  it("★ 🎲 隨機抽不到下架的（whitelistedChampionIds 走同一條路）", () => {
    const ids = whitelistedChampionIds(
      ROSTER.map((c) => c.id),
      NO_FILTER,
      RETIRED,
    );
    expect(ids).not.toContain("godie-e00u");
    expect(ids).not.toContain("godie-u01f");
    expect(ids).toHaveLength(2);
  });

  it("★ isPickableChampionId 對下架的回 false", () => {
    expect(isPickableChampionId("godie-e00u", RETIRED)).toBe(false);
    expect(isPickableChampionId("godie-h02k", RETIRED)).toBe(true);
    // 沒傳 retired = 沒有人下架
    expect(isPickableChampionId("godie-e00u")).toBe(true);
  });

  it("★ 下架清單是空的時候，一個人都不會被誤殺", () => {
    const out = applyChampionWhitelist(ROSTER, NO_FILTER, new Set()).map((c) => c.id);
    expect(out).toHaveLength(4);
  });
});
