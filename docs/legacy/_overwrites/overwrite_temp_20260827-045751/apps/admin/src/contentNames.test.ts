/**
 * #786 名稱 join 的薄守衛(體驗層,≤80 行):id 給機器、名稱給人 ——
 * 查得到就 join 出貨名稱,查不到誠實回 null(⛔ 不編名字、⛔ 不把 id 冒充名稱)。
 * 突變驗證:itemLabels 不再逐 id join(改回裸 id / 丟掉查表)⇒ 這裡紅。
 */
import { describe, expect, it } from "vitest";
import { buildNameIndex, itemLabels, nameLabelFor } from "./contentNames";

/** 與出貨 bundle 同形的最小假料(collections.<kind>.entries[].doc.{id,name})。 */
const bundle = {
  contentVersion: "cv_test",
  collections: {
    champions: {
      entries: [
        { doc: { id: "godie-hjai", name: "杰・巴恩斯" } },
        { doc: { id: "godie-h020", name: "godie-h020" } }, // placeholder:name===id
      ],
    },
    abilities: { entries: [{ doc: { id: "godie-hjai.e", name: "39-03 迴旋盾擊" } }] },
    // #793 —— `maps` 這個 kind 的來源**有兩個集合**（game shard 廣播的是 arena 文件的 id）
    arenas: { entries: [{ doc: { id: "arena.godie", name: "去死團的逆襲 EX 2.2s" } }] },
    maps: { entries: [{ doc: { id: "map.infinity-castle", name: "無限城" } }] },
    items: {
      entries: [
        { doc: { id: "bulwark-charge-greaves", name: "壁壘衝鋒脛甲" } },
        { doc: { id: "godie-i00j", name: "五吋釘束" } },
        { doc: { name: "沒有 id 的壞列" } },
      ],
    },
  },
};

describe("contentNames (#786)", () => {
  it("三個集合各自成索引;placeholder(name===id)與壞列不進去", () => {
    const idx = buildNameIndex(bundle);
    expect(idx.contentVersion).toBe("cv_test");
    expect(idx.names.champions.get("godie-hjai")).toBe("杰・巴恩斯");
    expect(idx.names.champions.has("godie-h020")).toBe(false); // ⛔ id 冒充名稱
    expect(idx.names.abilities.get("godie-hjai.e")).toBe("39-03 迴旋盾擊");
    expect(idx.names.items.size).toBe(2);
  });

  it("查不到回 name:null(誠實裸 id),⛔ 不是空字串也⛔ 不是 id", () => {
    const idx = buildNameIndex(bundle);
    expect(nameLabelFor(idx, "champions", "godie-hjai")).toEqual({
      id: "godie-hjai",
      name: "杰・巴恩斯",
    });
    // 退休英雄/舊資料的 id —— owner 貼的那種列
    expect(nameLabelFor(idx, "champions", "retired-hero").name).toBeNull();
    // 集合是分開的:拿英雄 id 去查技能索引不可以撈到東西
    expect(nameLabelFor(idx, "abilities", "godie-hjai").name).toBeNull();
  });

  // ⭐ 突變的承重線:裝備欄一整串 id 逐一 join、順序不動、查不到的留 null。
  it("itemLabels 逐 id join 且保序;查不到的那格留 null ⛔ 不丟列", () => {
    const idx = buildNameIndex(bundle);
    expect(itemLabels(idx, ["godie-i00j", "no-such-item", "bulwark-charge-greaves"])).toEqual([
      { id: "godie-i00j", name: "五吋釘束" },
      { id: "no-such-item", name: null },
      { id: "bulwark-charge-greaves", name: "壁壘衝鋒脛甲" },
    ]);
  });

  it("壞形狀回空索引不 throw(報表頁 fail-open 的那一半)", () => {
    for (const bad of [null, 42, "x", {}, { collections: { champions: { entries: "x" } } }]) {
      const idx = buildNameIndex(bad);
      expect(idx.names.champions.size).toBe(0);
      expect(idx.names.items.size).toBe(0);
    }
  });
});
