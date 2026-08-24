/**
 * GH#348 —— 殭屍不可以穿隱藏英雄的皮。
 *
 * ⚠️ 這一條存在的理由是**票的前提被翻轉而沒有東西紅**：開票時（2026-08-17）body
 * 逐字寫「出貨的 `hiddenChampions` 是空陣列，**所以今天不會發生**」，而 08-20
 * （GH#469）owner 填進四位之後那句話當場變成謊話（第三守則的形狀）。
 * ⇒ 這一支**從出貨內容推導**，⛔ 不抄任何 id：owner 明天多藏一位，它自動涵蓋。
 *
 * ⛔ 它刻意**不驗**「玩家的 🎲 抽不抽得到隱藏英雄」—— 那條路 owner 逐字要它抽得到
 *   （「隱藏角色**可以隨機到** 但不能選到」），而兩條路現在分家了，
 *   所以「殭屍那條濾掉了」與「玩家那條沒被濾掉」要一起釘，否則修法可能修錯一邊。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { Configs, Models, registerAll } from "@ggd/shared/content/registries";
import { Champions } from "@ggd/shared/sim/content/registry";
import { hiddenChampionIds, ROSTER_DOC_ID } from "@ggd/shared/content/championRetirement";
import type { ChampionId } from "@ggd/shared/ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});

describe("GH#348 殭屍的皮 vs 隱藏英雄", () => {
  it("出貨設定下：隱藏名單非空，而且那幾位真的在『有模型 ∩ 已註冊』裡", () => {
    // ⭐ 這一條是**標本檢查**：隱藏名單空掉的話下一條會變成恆真（vacuous green）。
    const hidden = [...hiddenChampionIds()] as ChampionId[];
    expect(hidden.length, "隱藏名單空了 —— 下一條會變成永遠綠的空斷言").toBeGreaterThan(0);
    const registered = hidden.filter((cid) => Champions.tryGet(cid) !== undefined);
    expect(registered.length, "隱藏英雄一位都沒註冊 —— 標本失效").toBeGreaterThan(0);
    const withModel = registered.filter(
      (cid) => Models.tryGet(Champions.get(cid).modelKey) !== undefined,
    );
    expect(
      withModel.length,
      "隱藏英雄都沒有模型 ⇒ 它們本來就進不了外觀池，這條測試沒有在測東西",
    ).toBeGreaterThan(0);
  });

  it("⭐ 承重：mobSkinPool() 真的把隱藏英雄濾掉了（⛔ 不是只有設定值長得對）", async () => {
    // ⭐ 量**真的那一支** —— ⛔ 不是重寫一份過濾邏輯（失敗形態⑤：被測的不是出貨的那個）。
    const { MatchController } = await import("./MatchController");
    const ctl = Object.create(MatchController.prototype) as {
      randomChampionPool: () => string[];
      mobSkinPool: () => string[];
    };
    const hidden = [...hiddenChampionIds()] as ChampionId[];
    const registeredHidden = hidden.filter((cid) => Champions.tryGet(cid) !== undefined);
    // 池子裡刻意混進隱藏英雄與一般英雄，看它濾掉哪一邊。
    const normal = Champions.ids().filter((c) => !hidden.includes(c)).slice(0, 3);
    ctl.randomChampionPool = () => [...registeredHidden, ...normal];
    const skins = ctl.mobSkinPool();
    for (const h of registeredHidden) {
      expect(skins, `隱藏英雄 ${h} 出現在殭屍的外觀池裡 —— 這正是 GH#348 的症狀`).not.toContain(h);
    }
    expect(skins.length, "一般英雄也被濾掉了 ⇒ 殭屍會沒有皮可穿").toBe(normal.length);
  });

  it("出貨的 config.roster@1 把殭屍外觀池的隱藏英雄關掉了", () => {
    const doc = Configs.tryGet(ROSTER_DOC_ID) as
      | { hiddenChampionsInMobPool?: boolean }
      | undefined;
    expect(doc, `${ROSTER_DOC_ID} 不在出貨內容裡`).toBeDefined();
    // ⛔ 不抄字面 false：讀出貨值，而出貨值的意義是「殭屍不穿隱藏英雄的皮」。
    expect(
      doc?.hiddenChampionsInMobPool ?? false,
      "出貨值打開了 ⇒ 隱藏英雄會出現在殭屍臉上（GH#348 的症狀）",
    ).toBe(false);
  });
});
