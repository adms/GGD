/**
 * 🔊 GH#806 —— 音訊對照表這一頁**真的調得到**那幾格嗎。
 *
 * ⚠️ 只驗一件事，而它是這一頁唯一**畫面上看不出來**的失敗形態：
 * `recordScalars` 的存檔是逐鍵**合併**回基底那一份，⛔ 不是覆蓋。
 * 覆蓋的話 `sfx.*.files` 會整批消失（Zod 會擋，還算好），而一個**選填**的
 * `cooldownMs` 被洗掉**不會有任何錯誤** —— 它只是安靜地退回消費端的預設，
 * 而操作者以為自己只改了音量（第一·五守則的形狀）。
 *
 * ⛔ 「這一頁有沒有被註冊 / 有沒有 session-gate / 每一格有沒有中文說明與上界」
 * 一條都不在這裡：`configDocCoverage.test.ts` 與 `configForms.test.ts` 已經對
 * **每一份** spec 問過了（第零守則⏱：同一件事不要用兩條斷言再寫一次）。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { AUDIO_MAP_SPEC } from "./configForms/specs/audio";
import { setTableColumnCell, tableRowsFrom, validateTable } from "./configTables";
import { applyEdits } from "./configForms";

const TAG = "adminui-audio-map-page";
const SFX = AUDIO_MAP_SPEC.tables!.find((t) => t.path === "sfx")!;

/** 一份最小的基底文件 —— 形狀與出貨檔相同，⛔ 但不抄任何出貨數值。 */
const base = {
  id: "audio-map",
  schema: "config.audio-map@1",
  bgm: { menu: { file: "assets/audio/bgm/menu.mp3", loop: true, gain: 0.5 } },
  sfx: {
    basicAttack: { files: ["assets/audio/sfx/fx/swing.mp3"], gain: 0.5, cooldownMs: 90 },
    uiClick: { files: ["assets/audio/sfx/ui/click.mp3"] },
  },
};

describe("音訊對照表：後台調得到，而且不吃掉沒畫在表上的東西", () => {
  it("改一顆 SFX 的音量 → 存檔讀回來是新值，而 files 原封不動", () => {
    cover(TAG);
    const rows = tableRowsFrom(base, SFX);
    const i = rows.findIndex((r) => r.key === "basicAttack");
    const edited = setTableColumnCell(rows, i, "gain", "1.4");
    const verdict = validateTable(edited, SFX, base);
    expect(verdict.table, "這張表應該是合法的").toBeNull();
    expect(verdict.value, "合法的表要產出要寫進文件的值").not.toBeNull();

    const next = applyEdits(base, new Map([["sfx", verdict.value]])) as typeof base;
    // ① 改到的那一格真的變了 —— 少了它這一頁等於沒有做。
    expect(next.sfx.basicAttack.gain).toBe(1.4);
    // ② ⭐ 承重：這一頁**沒有畫**的子鍵原封帶著走。
    //    `validateTable` 的 `base` 參數被拿掉 ⇒ 這一條紅。
    expect(next.sfx.basicAttack.files).toEqual(base.sfx.basicAttack.files);
    // ③ 沒有被碰到的那一列也一樣（連它「本來就沒有 gain」這件事也要保住）。
    expect(next.sfx.uiClick).toEqual(base.sfx.uiClick);
    // ④ 這一頁不編輯的整個分支（bgm）由 `applyEdits` 帶著走。
    expect(next.bgm).toEqual(base.bgm);
  });

  it("選填欄位留白 = 從文件裡拿掉那一格，⛔ 不是寫 0", () => {
    cover(TAG);
    const rows = tableRowsFrom(base, SFX);
    const i = rows.findIndex((r) => r.key === "basicAttack");
    const verdict = validateTable(setTableColumnCell(rows, i, "cooldownMs", ""), SFX, base);
    const entry = (verdict.value as Record<string, Record<string, unknown>>).basicAttack!;
    expect("cooldownMs" in entry, "留白應該是「不覆蓋」，⛔ 不是 0").toBe(false);
    expect(entry.files, "留白一格不可以順手吃掉別的子鍵").toEqual(base.sfx.basicAttack.files);
  });

  it("超出上界的音量被擋下來，理由是中文的一句話", () => {
    cover(TAG);
    const rows = tableRowsFrom(base, SFX);
    const i = rows.findIndex((r) => r.key === "basicAttack");
    const verdict = validateTable(setTableColumnCell(rows, i, "gain", "9"), SFX, base);
    expect(verdict.value, "有錯的表不可以產出值 —— 半張表寫出去比不寫更糟").toBeNull();
    expect(verdict.rows[i]!.gain).toMatch(/不能大於/);
  });
});
