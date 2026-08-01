/**
 * 傷害數字配色 —— 後台這一頁真的擋得住一格打壞的顏色嗎 (adminui-damage-colors).
 *
 * 這一頁是通用 `ConfigDocPage` 引擎上第一份**顏色**文件，而那支引擎的走訪器把
 * 每一個 `z.string()` 都攤成一格純文字輸入框、regex 在走訪過程中被丟掉。少了
 * `ConfigFieldLabel.pattern` 的話，操作者可以在「真實傷害數字」填「白色」，
 * PUT 成功、頁面顯示已儲存，而遊戲繼續畫原本的顏色 —— #277 在字串上的形狀，
 * 也就是這個 repo 最討厭的那種失敗：**存了但畫面沒變**。
 *
 * ⚠️ `pattern` 是 Zod 之外的第二份規則，也就是一份會 drift 的規則。所以這裡不只
 * 測「pattern 擋得住」，還交叉驗證**它和整份文件的 Zod 判一樣的結果** ——
 * pattern 放寬或收緊而 schema 沒跟上，當場紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_DAMAGE_COLORS } from "@ggd/shared/content";
import { applyEdits, fieldRows, parseFieldInput, specForPage } from "./configForms";

const TAG = "adminui-damage-colors";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const shipped = (): unknown =>
  JSON.parse(readFileSync(`${REPO}content/config/damage-colors.json`, "utf8"));

const spec = (): NonNullable<ReturnType<typeof specForPage>> => {
  const s = specForPage("damageColors");
  expect(s, "傷害數字配色 沒有掛進 CONFIG_DOC_SPECS").not.toBeNull();
  return s!;
};

/** Every colour cell on the page, by dot path. */
const COLOUR_PATHS = [
  "text.physical",
  "text.magic",
  "text.true",
  "text.heal",
  "flash.physical",
  "flash.magic",
  "flash.true",
  // 第二個通道 (owner 2026-08-01 「加第二個通道，不動色相 => ok」) — 外框的兩個
  // 角色色。它們和上面七格走同一支 `pattern`，所以同一組拒絕樣本必須也擋得住。
  "outline.outgoing",
  "outline.incoming",
] as const;

describe("傷害數字配色 後台頁 (adminui-damage-colors)", () => {
  it("九格顏色 + 軸線 + 外框模式 + 外框粗細都畫得出來，而且順序是寫死的那個順序", () => {
    cover(TAG);
    const s = spec();
    const rows = fieldRows(s, shipped(), shipped());
    // 顏色七格在前、外框那一組在後 —— `outline.mode` 排在它的兩個顏色之前，
    // 因為它決定那兩格影響到誰。
    expect(rows.map((r) => r.path)).toEqual([
      "textAxis",
      "text.physical",
      "text.magic",
      "text.true",
      "text.heal",
      "flash.physical",
      "flash.magic",
      "flash.true",
      "outline.mode",
      "outline.outgoing",
      "outline.incoming",
      "outline.widthMult",
    ]);
    // 現在生效的值就是出貨值（沒有 overlay 時）
    expect(rows.find((r) => r.path === "text.true")!.current).toBe(
      DEFAULT_DAMAGE_COLORS.text.true,
    );
  });

  it("非 #rrggbb 的輸入被擋下來，理由是中文的一句話", () => {
    cover(TAG);
    const s = spec();
    const rows = fieldRows(s, shipped(), shipped());
    for (const path of COLOUR_PATHS) {
      const row = rows.find((r) => r.path === path)!;
      expect(parseFieldInput(row, "#FF5900")).toEqual({ ok: true, value: "#FF5900" });
      expect(parseFieldInput(row, "#ff5900")).toEqual({ ok: true, value: "#ff5900" });
      for (const bad of ["白色", "white", "#FFF", "#GGGGGG", "rgb(255,0,0)", "FF5900", ""]) {
        const out = parseFieldInput(row, bad);
        expect(out.ok, `${path} accepted "${bad}"`).toBe(false);
        expect(out.ok === false && /[一-鿿]/.test(out.error)).toBe(true);
      }
    }
  });

  /**
   * THE DRIFT GUARD. Two sources of truth for "what is a colour" (the label's
   * `pattern` and the doc's Zod regex) can disagree in two ways, and BOTH are
   * silent: a looser pattern lets a bad value through the form and the PUT then
   * either rejects it or — since the overlay write path has no Zod today (#283)
   * — stores it; a tighter pattern refuses values the schema would accept.
   */
  it("pattern 與 schema 對每一個樣本判一樣的結果", () => {
    cover(TAG);
    const s = spec();
    const rows = fieldRows(s, shipped(), shipped());
    const SAMPLES = [
      "#FF5900",
      "#ff5900",
      "#000000",
      "#FFFFFF",
      "#FFF",
      "#FF59000",
      "白色",
      "white",
      "rgb(255,0,0)",
      "#GGGGGG",
      " #FF5900",
      "#FF5900 ",
    ];
    for (const path of COLOUR_PATHS) {
      const row = rows.find((r) => r.path === path)!;
      for (const sample of SAMPLES) {
        const form = parseFieldInput(row, sample).ok;
        const doc = applyEdits(shipped(), new Map([[path, sample]]));
        const zod = s.zod.safeParse(doc).success;
        expect(form, `${path} "${sample}": form=${form} but schema=${zod}`).toBe(zod);
      }
    }
  });

  it("軸線那一格只收 schema 認得的兩個值，而且兩個都有中文標籤", () => {
    cover(TAG);
    const s = spec();
    const rows = fieldRows(s, shipped(), shipped());
    const row = rows.find((r) => r.path === "textAxis")!;
    expect(parseFieldInput(row, "damageType")).toEqual({ ok: true, value: "damageType" });
    expect(parseFieldInput(row, "relation")).toEqual({ ok: true, value: "relation" });
    expect(parseFieldInput(row, "byWho").ok).toBe(false);
    expect(row.label.optionLabels?.damageType).toBeTypeOf("string");
    expect(row.label.optionLabels?.relation).toBeTypeOf("string");
  });

  it("存檔送出的是整份文件 —— `note` 那一段散文不會被弄不見", () => {
    cover(TAG);
    const base = shipped() as Record<string, unknown>;
    expect(typeof base["note"]).toBe("string");
    const next = applyEdits(base, new Map([["text.true", "#00FF80"]]));
    expect(next["note"]).toBe(base["note"]);
    expect(next["schema"]).toBe("config.damage-colors@1");
    // 其他六格顏色一格都沒動
    expect((next["flash"] as Record<string, string>)["true"]).toBe(
      DEFAULT_DAMAGE_COLORS.flash.true,
    );
  });
});
