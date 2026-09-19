/**
 * 名言補檔聽審頁的資料庫路徑薄守衛（GH#1288 · 第零守則：工具腳本一條薄守衛，⛔ 不開對抗輪）。
 * 問的是三件會讓 owner 那一批 14 位再掉一次的事：
 *   ① 每一條路徑都是偶數段（document），逐位存檔那條逐字不變（已經有資料存過）
 *   ② 三段的送出路徑**接不出來**，而且驗得出來它是錯的
 *   ③ 寫失敗／讀不回時一定丟錯，⛔ 不會假稱送出成功
 */
import { describe, it, expect } from "vitest";
import {
  assertDocPath,
  quoteGapChoiceDocPath,
  quoteGapDoc,
  quoteGapExportDocPath,
  saveAndVerify,
} from "./quoteGapDbPaths.mjs";

const segments = (path) => path.split("/").length;

describe("名言補檔聽審的 db 路徑（GH#1288）", () => {
  it("① 每一條都是偶數段的 document，逐位存檔那條逐字不變", () => {
    expect(quoteGapChoiceDocPath("godie-ucrl")).toBe("quotegap/choices/heroes/godie-ucrl");
    for (const path of [
      quoteGapChoiceDocPath("b2-kisaragi"),
      quoteGapExportDocPath(),
      quoteGapExportDocPath("20260917-1337"),
    ]) {
      expect(segments(path) % 2, `「${path}」奇數段＝collection，db.doc() 會拒絕`).toBe(0);
    }
  });

  it("② 三段的送出路徑接不出來，而且驗得出來是錯的", () => {
    // 票上那一條逐字：`quotegap/export/all` 三段 ⇒ 指到 collection。
    expect(quoteGapExportDocPath()).not.toBe("quotegap/export/all");
    expect(() => assertDocPath("quotegap/export/all")).toThrow(/3 段|collection/);
    expect(() => assertDocPath("quotegap//heroes/x")).toThrow(/空白段/);
    // 組路徑函式只收不含斜線的段 ⇒ ⛔ 沒辦法用 "export/all" 偷渡回三段。
    expect(() => quoteGapDoc("export", "all", "")).toThrow();
    expect(() => quoteGapDoc("export/all", "batches", "all")).toThrow();
  });

  it("③ 寫失敗或讀不回一定丟錯，⛔ 不假稱送出成功", async () => {
    const path = quoteGapExportDocPath();
    const body = { picked: 14, of: 14 };

    const store = new Map();
    const okDb = {
      doc: (p) => ({
        set: async (b) => void store.set(p, b),
        get: async () => ({ data: () => store.get(p) ?? null }),
      }),
    };
    await expect(saveAndVerify(okDb, path, body)).resolves.toEqual({ path, data: body });

    // db 拒絕寫入（票上真的發生的那一種）⇒ 錯誤要原樣丟給介面。
    const rejectingDb = {
      doc: () => ({
        set: async () => {
          throw new TypeError("db doc(): document paths have an even number of segments");
        },
        get: async () => ({ data: () => null }),
      }),
    };
    await expect(saveAndVerify(rejectingDb, path, body)).rejects.toThrow(TypeError);

    // 寫入「成功」但讀不回 ⇒ 仍然是失敗，⛔ 不可以回成功。
    const amnesiacDb = { doc: () => ({ set: async () => {}, get: async () => ({ data: () => null }) }) };
    await expect(saveAndVerify(amnesiacDb, path, body)).rejects.toThrow(/讀回失敗/);
  });
});
