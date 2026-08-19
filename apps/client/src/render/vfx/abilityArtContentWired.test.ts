/**
 * ⭐【搬進 content/ 的那 617 筆真的走完整條路】（GH#384）
 *
 * 一份文件搬家最安靜的失敗方式**不是**檔案壞掉 —— 是它被寫出來、通過 schema、
 * 進了 bundle，而**沒有人讀它**（失敗形態②）。這條把三個關節一次釘住：
 *
 *   1. 出貨的那一份**就是產生器現在算出來的那一份**（`--check` 的行為，⛔ 不是掃字串）
 *   2. `ContentDb.load()` 真的把它交給註冊表 —— ⛔ 讀 ContentDb 自己，不是讀註解
 *   3. 交進去之後，三個消費模組（分類／證據／晉升）都拿得到東西，
 *      ⛔ 而且沒交進去的時候是**吼**而不是靜靜地空掉
 *
 * ⚠️ 第 3 條的下半是這條守衛真正的重點。少了 `setAbilityArtBindings` 那一行，
 * 每一支技能都掉回通用替身 —— 而那在畫面上與「特效還沒做好」一模一樣。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { readFileSync } from "node:fs";
import {
  abilityArtRows,
  setAbilityArtBindings,
  resetAbilityArtBindingsForTest,
} from "./abilityArtContent";
import { abilityArtDocPath, loadAbilityArtFromDisk } from "./loadAbilityArtFromDisk";
import { nextDoc, serialise, CONTENT_DIR } from "./generateAbilityArtContent";
import { rosterBindings } from "./bindings";
import { w3xFamilyArtRows } from "./w3xFamilyArt";
import { w3xAbilityArtRows } from "./w3xAbilityArt";

afterEach(() => {
  loadAbilityArtFromDisk();
});

describe("逐技能特效綁定：content → 註冊表 → 三個消費者", () => {
  it("⭐ 出貨的 vfx-ability-art.json 逐位元組等於產生器現在算出來的那一份", () => {
    expect(
      readFileSync(abilityArtDocPath(), "utf8"),
      "跑 `pnpm exec tsx apps/client/src/render/vfx/generateAbilityArtContent.ts` 再 `pnpm content:build`。",
    ).toBe(serialise(nextDoc(CONTENT_DIR)));
  });

  it("⭐ ContentDb 真的把它交給註冊表（⛔ 讀 ContentDb 的原始碼 AST，不是讀註解）", async () => {
    const src = readFileSync(new URL("../../content/ContentDb.ts", import.meta.url), "utf8");
    // 兩件事都要：import 進來，而且真的在 load() 裡被呼叫並餵了那個 schema tag。
    expect(src).toContain("setAbilityArtBindings");
    expect(src).toContain('"config.vfx-ability-art@1"');
    // 順序：綁定要在家族調校之前（`setFamilyTuning` 會立刻拿它去鑄 fx.fam 文件）。
    expect(
      src.indexOf("setAbilityArtBindings("),
      "⛔ `setAbilityArtBindings` 必須在 `setFamilyTuning` 之前 —— 反了會鑄出一份空的家族文件。",
    ).toBeLessThan(src.indexOf("setFamilyTuning(vfxFamiliesDoc)"));
  });

  it("⭐ 三個消費者都拿得到；⛔ 沒交進去時是 FAIL-LOUD 而不是靜靜空掉", () => {
    expect(rosterBindings().length).toBeGreaterThan(300);
    expect(Object.keys(w3xFamilyArtRows()).length).toBeGreaterThan(200);
    expect(Object.keys(w3xAbilityArtRows()).length).toBeGreaterThan(30);

    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      setAbilityArtBindings(null);
      expect(abilityArtRows()).toEqual({});
      expect(rosterBindings()).toEqual([]);
      expect(
        err.mock.calls.flat().join(" "),
        "⛔ 綁定不見了必須吼一行 —— 靜默的 fail-open 讓「內容沒載入」看起來像「特效沒做」。",
      ).toContain("vfx ability art bindings MISSING");
    } finally {
      err.mockRestore();
      resetAbilityArtBindingsForTest();
    }
  });
});
