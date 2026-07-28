/**
 * 體素身體開關 (GH#31) 的守衛。
 *
 * ⚠️ 這一組刻意把重點放在「三種狀態」而不是「開關會不會動」。
 * 開關會不會動是顯而易見的、寫錯會立刻被看見的;而 `null` 被壓成 `false`
 * 不會 —— 它會讓一份空文件讀起來像「全部強制關掉體素」,於是那四位真的沒有
 * 模型的英雄被推回共用替身臉,#231 整個任務被撤銷,而每一條測試都還是綠的。
 */
import { describe, it, expect } from "vitest";
import {
  BODY_SCHEMA,
  bodyRows,
  bodySummary,
  emptyBodiesDoc,
  extractBodies,
  forgetBody,
  resolveBody,
  setBody,
} from "./voxelBody";

const CHAMPS = [
  { id: "godie-hapm", name: "Berserker", modelKey: "champ.thorne" }, // 有暴雪模型
  { id: "godie-e00s", name: "白木卡迪那", modelKey: "champ.sela" }, // 有暴雪模型
  { id: "godie-o02n", name: "曹操孟德", modelKey: "champ.skin.rogue" }, // 沒有
  { id: "godie-u011", name: "克勞薩先生", modelKey: "champ.skin.barbarian" }, // 沒有
  { id: "godie-h01n", name: "黑崎一護", modelKey: "imported.heroichigo" }, // 不是替身
];

describe("體素身體開關 — 預設", () => {
  it("有暴雪模型的預設走模型,沒有的預設走體素", () => {
    const rows = bodyRows(CHAMPS, {});
    expect(rows.map((r) => r.championId)).toEqual([
      "godie-e00s",
      "godie-hapm",
      "godie-o02n",
      "godie-u011",
    ]);
    expect(rows.find((r) => r.championId === "godie-hapm")!.effective).toBe(false);
    expect(rows.find((r) => r.championId === "godie-e00s")!.effective).toBe(false);
    expect(rows.find((r) => r.championId === "godie-o02n")!.effective).toBe(true);
    expect(rows.find((r) => r.championId === "godie-u011")!.effective).toBe(true);
  });

  it("不是共用替身的英雄根本不進表 —— 他們沒有可切換的東西", () => {
    // 一個把 godie-h01n 也列進來的表會讓 operator 以為自己能把黑崎一護變體素;
    // 他有自己的 imported 模型,那個開關對他沒有意義。
    expect(bodyRows(CHAMPS, {}).some((r) => r.championId === "godie-h01n")).toBe(false);
  });

  it("空文件 = 沒有人動過,不是「全部關掉體素」", () => {
    // ⚠️ 這是本檔存在的核心理由。突變:讓 resolveBody 在查不到時回傳
    // `{effective:false, origin:"overlay"}` —— o02n / u011 立刻退回共用替身臉,
    // 而「開關能存能讀」那幾條測試依然全綠。
    const s = bodySummary(bodyRows(CHAMPS, {}));
    expect(s.touched, "沒有人動過").toBe(0);
    expect(s.voxel, "仍有兩位在體素上").toBe(2);
    expect(s.noModelAvailable).toBe(2);
  });
});

describe("體素身體開關 — operator 覆寫", () => {
  it("可以把有模型的英雄強制切成體素", () => {
    const r = resolveBody("godie-hapm", "champ.thorne", { "godie-hapm": true });
    expect(r).toEqual({ effective: true, origin: "overlay" });
  });

  it("也可以反向:把預設體素的強制切成模型", () => {
    // 單向開關是閘刀不是設定。operator 要能反悔。
    const r = resolveBody("godie-o02n", "champ.skin.rogue", { "godie-o02n": false });
    expect(r).toEqual({ effective: false, origin: "overlay" });
  });

  it("origin 忠實反映「這是後台改的還是預設」", () => {
    expect(resolveBody("godie-hapm", "champ.thorne", {}).origin).toBe("default");
    expect(resolveBody("godie-hapm", "champ.thorne", { "godie-hapm": false }).origin).toBe(
      "overlay",
    );
    // 即使 operator 設的值剛好等於預設值,它仍然是「後台設定過」——
    // 把它顯示成「預設」會讓人以為自己沒設定過,下次部署改了預設規則就會困惑。
  });
});

describe("體素身體開關 — 文件操作", () => {
  it("setBody 回傳新物件,不改原本的", () => {
    const doc = emptyBodiesDoc();
    const next = setBody(doc, "godie-hapm", true);
    expect(doc.bodies).toEqual({});
    expect(next.bodies).toEqual({ "godie-hapm": true });
    expect(next.schema).toBe(BODY_SCHEMA);
  });

  it("forgetBody 與 setBody(false) 是不同的兩件事", () => {
    // 對一個沒有模型的英雄:
    //   forgetBody → 回到規則 → 體素(對的)
    //   setBody(false) → 強制用模型 → 但他沒有模型 → 共用替身臉(錯的)
    const withFalse = setBody(emptyBodiesDoc(), "godie-o02n", false);
    expect(resolveBody("godie-o02n", "champ.skin.rogue", withFalse.bodies).effective).toBe(false);

    const forgotten = forgetBody(withFalse, "godie-o02n");
    expect(forgotten.bodies).toEqual({});
    expect(resolveBody("godie-o02n", "champ.skin.rogue", forgotten.bodies).effective).toBe(true);
  });

  it("extractBodies 擋掉 schema 不符與垃圾值", () => {
    expect(extractBodies(null)).toEqual({});
    expect(extractBodies({ schema: "something.else@1", bodies: { a: true } })).toEqual({});
    expect(
      extractBodies({ schema: BODY_SCHEMA, bodies: { a: true, b: "yes", c: 1, d: false } }),
    ).toEqual({ a: true, d: false });
  });
});
