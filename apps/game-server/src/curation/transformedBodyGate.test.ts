/**
 * 變身態的身體永遠不是一個可以被選的英雄（owner 裁過兩次：2026-07-26、07-30）。
 * 客戶端的 `resolveToPickable()` 一直有做，**伺服器沒有**。
 *
 * 缺口是真的不是理論：`ApplyStarterSet` **union-only、永不移除**，#249 換掉的
 * 10 個舊 alternate id（含 `godie-o00x`）很可能還留在線上白名單裡。
 *
 * 閘放 `allowsChampion` 而非 `selectChampion`：一個 seam 蓋住兩條路 ——
 * bot／隨機英雄走 `filterChampions → allowsChampion`，**不經過 selectChampion**。
 * 擋在 `bypass` **之前**：bypass 是 fail-open（localhost 常態），而「這是第二形態的
 * 身體」是**內容事實**不是營運狀態，那條路上照樣要成立。
 *
 * 突變紀錄（兩條都跑過）：
 *   · 拿掉 `if (isTransformedBody(id)) return false` → 三條全紅（實測 2 failed，前提那條不動）
 *   · 移到 `this.bypass ||` **之後** → 「bypass 底下也擋得住」那條紅
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Configs } from "@ggd/shared/content";
import { cover } from "../../../../packages/shared/testkit/cover";
import { isTransformedBody } from "@ggd/shared/content/championForms";
import { Whitelist } from "./whitelist";

/** 超級賽亞人 —— 悟空 `godie-ogrh` 的 alternate 身體，也是 #249 換掉的那 10 個之一。 */
const SSJ = "godie-o00x";
/** 一個正常的、選得到的本體。 */
const BASE = "godie-ogrh";

beforeEach(() => {
  Configs.clear();
  Configs.register({ id: "roster", schema: "config.roster@1", retiredChampions: [] } as never);
});

describe("變身態的身體不可被選（伺服器側）", () => {
  it("夾具前提：這兩個 id 真的是「變身態」與「本體」", () => {
    cover("transformed-body-gate");
    // ⚠️ 先釘住前提。少了這一條，下面兩條在「isTransformedBody 對誰都回 false」
    //    的實作下也會過 —— 那是一條驗不到東西的測試。
    expect(isTransformedBody(SSJ)).toBe(true);
    expect(isTransformedBody(BASE)).toBe(false);
  });

  it("⭐ 就算它**在**白名單上，也選不到 —— 這正是線上可能的狀態", () => {
    cover("transformed-body-gate");
    // #249 換掉的 10 個舊 alternate id 可能還留在線上白名單裡（union-only）。
    const wl = new Whitelist({ champions: [BASE, SSJ] } as never, false);
    expect(wl.allowsChampion(BASE)).toBe(true);
    expect(wl.allowsChampion(SSJ)).toBe(false);
    // bot / 隨機英雄走的是這一支 —— 它必須看到同一個答案。
    expect(wl.filterChampions([BASE, SSJ])).toEqual([BASE]);
  });

  it("⭐ bypass（平台連不上／localhost 常態）底下也擋得住", () => {
    cover("transformed-body-gate");
    const wl = new Whitelist(null, true);
    expect(wl.bypass).toBe(true);
    // 夾具前提：bypass 真的把別人都放行了，否則下面那條沒有意義。
    expect(wl.allowsChampion(BASE)).toBe(true);
    // ⬇⬇ THE assertion：把閘移到 `this.bypass ||` 之後，這一行就會變 true。
    expect(wl.allowsChampion(SSJ)).toBe(false);
  });
});
