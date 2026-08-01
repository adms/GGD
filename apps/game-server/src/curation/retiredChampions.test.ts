/**
 * retiredChampions.test.ts — 伺服器是最後一道，下架必須擋在 `bypass` **之前**。
 *
 * ⚠️ 為什麼這一份跟客戶端那一份（`ui/panels/champSelectRetired.test.ts`）
 * **兩邊都要有**：客戶端那條擋的是「玩家看得到 / 選得到」，這一條擋的是
 * 「一個改過的客戶端硬送一個 id 上來」。CLAUDE.md 失敗形態 ⑤ 的反面 ——
 * 只測 UI 那一層，出貨的權威路徑就沒有人測。
 *
 * ⚠️ 每一條都在 `bypass = true`（fail-open）底下跑。那不是刁鑽的邊界條件，
 * 那是**平台連不上時的常態**，而且是 localhost 的常態。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Configs } from "@ggd/shared/content";
import { Whitelist } from "./whitelist";

const RETIRED = "godie-e00u";
const LIVE = "godie-h02k";

function registerRoster(ids: string[]): void {
  Configs.register({
    id: "roster",
    schema: "config.roster@1",
    retiredChampions: ids,
  } as never);
}

beforeEach(() => {
  Configs.clear();
  registerRoster([RETIRED, "godie-u01f"]);
});
afterEach(() => Configs.clear());

describe("下架的英雄：伺服器在 bypass 之前就拒絕", () => {
  it("★ allowAll()（fail-open，平台連不上）仍然拒絕下架的", () => {
    const wl = Whitelist.allowAll();
    expect(wl.allowsChampion(RETIRED), "bypass 不可以放行下架的英雄").toBe(false);
    expect(wl.allowsChampion(LIVE), "bypass 底下沒下架的照樣通過").toBe(true);
  });

  it("★ filterChampions 在 bypass 底下也濾掉下架的", () => {
    // ⚠️ 這一條以前是 `this.bypass ? [...ids] : …` —— 一個原封不動的 identity。
    expect(Whitelist.allowAll().filterChampions([RETIRED, LIVE])).toEqual([LIVE]);
  });

  it("★ hasAnyChampion：候選只剩下架的 = 沒有可玩的英雄", () => {
    // 這個回答錯了的後果是 bot 退場邏輯失準，然後場上生出一隻 QWER 全空的英雄。
    expect(Whitelist.allowAll().hasAnyChampion([RETIRED])).toBe(false);
    expect(Whitelist.allowAll().hasAnyChampion([RETIRED, LIVE])).toBe(true);
  });

  it("★ 營運把下架的勾進白名單也沒有用", () => {
    const wl = new Whitelist({ champions: [RETIRED, LIVE] }, false);
    expect(wl.allowsChampion(RETIRED)).toBe(false);
    expect(wl.allowsChampion(LIVE)).toBe(true);
  });

  it("★ 沒有 roster 文件時（內容沒載到）誰都不擋 —— fail-open 的方向是刻意的", () => {
    // 反過來（讀不到就全擋）會讓一次內容載入失敗變成「沒有人能進場」。
    Configs.clear();
    expect(Whitelist.allowAll().allowsChampion(RETIRED)).toBe(true);
  });

  it("★ 清單空的時候一個都不誤殺", () => {
    Configs.clear();
    registerRoster([]);
    expect(Whitelist.allowAll().filterChampions([RETIRED, LIVE])).toEqual([RETIRED, LIVE]);
  });
});
