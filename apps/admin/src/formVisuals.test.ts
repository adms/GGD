/**
 * 後台「變身外觀」的守衛 (task #249 / GH#288).
 *
 * 三件事:
 *   ① 面板的出貨欄與 `content/config/form-visuals.json` 沒有 drift。
 *      (mobWaves 那一頁的教訓:兩份手抄的數字一定會分家。)
 *   ② **上界和下界一樣會擋** —— CLAUDE.md 2026-07-29:`validateField` 以前只檢查
 *      `min`,所以 1.5 打成 15 會過後台、在下游才被拒或被靜默夾掉。
 *   ③ 面板寫不出「基本型的外觀」。`setFormEntry` 只認 `CHAMPION_FORM_PAIRS` 的
 *      alternate 那一半,所以一個打錯的 id 不會安靜地存進 overlay。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { CHAMPION_FORM_PAIRS } from "@ggd/shared/content";
import type { ConfigFormVisualsDoc } from "@ggd/shared/content/schema/config";
import {
  FORM_VISUAL_ROW_FIELDS,
  SHIPPED_FORM_VISUALS,
  draftFromEntry,
  entryFromDraft,
  extractFormVisuals,
  formVisualRows,
  formVisualSummary,
  setFormEntry,
  setFormGlobal,
  validateFormVisualGlobal,
  validateFormVisualInput,
} from "./formVisuals";

const SHIPPED_JSON = JSON.parse(
  readFileSync(join(__dirname, "../../../content/config/form-visuals.json"), "utf8"),
) as ConfigFormVisualsDoc;

describe("後台的出貨欄 = 出貨的 JSON (formvis-admin-drift)", () => {
  it("四個全域旋鈕與每一格逐欄相等", () => {
    cover("formvis-admin-drift");
    expect(SHIPPED_FORM_VISUALS.enabled).toBe(SHIPPED_JSON.enabled);
    expect(SHIPPED_FORM_VISUALS.tintStrength).toBe(SHIPPED_JSON.tintStrength);
    expect(SHIPPED_FORM_VISUALS.scaleStrength).toBe(SHIPPED_JSON.scaleStrength);
    expect(SHIPPED_FORM_VISUALS.attachmentsEnabled).toBe(SHIPPED_JSON.attachmentsEnabled);
    expect(Object.keys(SHIPPED_FORM_VISUALS.forms).sort()).toEqual(
      Object.keys(SHIPPED_JSON.forms).sort(),
    );
    for (const id of Object.keys(SHIPPED_JSON.forms)) {
      expect(SHIPPED_FORM_VISUALS.forms[id]!.tint, id).toEqual(SHIPPED_JSON.forms[id]!.tint);
      expect(SHIPPED_FORM_VISUALS.forms[id]!.scaleMult, id).toBe(
        SHIPPED_JSON.forms[id]!.scaleMult,
      );
      expect(SHIPPED_FORM_VISUALS.forms[id]!.attachModelKey, id).toBe(
        SHIPPED_JSON.forms[id]!.attachModelKey,
      );
    }
  });

  it("列出全部 26 個變身態,不是只列已經做過的兩隻", () => {
    cover("formvis-admin-drift");
    const rows = formVisualRows(SHIPPED_JSON);
    expect(rows.length).toBe(CHAMPION_FORM_PAIRS.length);
    expect(rows.map((r) => r.alternateId)).toEqual(CHAMPION_FORM_PAIRS.map((p) => p.alternateId));
    // 兩隻有效,其餘 24 隻是 null(可以被點亮,但現在不改外觀)
    expect(rows.filter((r) => r.effective !== null).map((r) => r.alternateId).sort()).toEqual([
      "godie-e00l",
      "godie-o00x",
    ]);
    expect(formVisualSummary(rows)).toContain("2 / 26");
  });

  it("schema 不對的文件當沒讀到 —— 不會把 combat-env 當顏色表讀", () => {
    cover("formvis-admin-drift");
    expect(extractFormVisuals({ schema: "config.combat-env@1" })).toBeNull();
    expect(extractFormVisuals(null)).toBeNull();
    expect(extractFormVisuals(SHIPPED_JSON)).not.toBeNull();
  });
});

describe("輸入驗證有上界 (formvis-admin-bounds)", () => {
  it("每一個數值欄位都同時擋下界與上界", () => {
    cover("formvis-admin-bounds");
    // 顏色 0..4
    expect(validateFormVisualInput("tintR", "1.45")).toBe("");
    expect(validateFormVisualInput("tintR", "-1")).not.toBe("");
    expect(validateFormVisualInput("tintR", "9")).not.toBe("");
    // 大小 0.2..3 —— 1.5 打成 15 必須當場紅
    expect(validateFormVisualInput("scaleMult", "1.08")).toBe("");
    expect(validateFormVisualInput("scaleMult", "15")).not.toBe("");
    expect(validateFormVisualInput("scaleMult", "0.01")).not.toBe("");
    // 掛件縮放 0.01..10
    expect(validateFormVisualInput("attachScale", "0.3221")).toBe("");
    expect(validateFormVisualInput("attachScale", "100")).not.toBe("");
    // 掛件高度 -5..5(可以是負的,但不能離譜)
    expect(validateFormVisualInput("attachOffsetY", "-0.5")).toBe("");
    expect(validateFormVisualInput("attachOffsetY", "-50")).not.toBe("");
    // 非數字
    expect(validateFormVisualInput("scaleMult", "大")).not.toBe("");
  });

  it("字串欄位:留白合法,含空白不合法", () => {
    cover("formvis-admin-bounds");
    expect(validateFormVisualInput("attachModelKey", "")).toBe("");
    expect(validateFormVisualInput("attachModelKey", "imported.goku3head")).toBe("");
    expect(validateFormVisualInput("attachModelKey", "imported goku")).not.toBe("");
  });

  it("全域濃度:0..1 與 0..2,兩端都擋", () => {
    cover("formvis-admin-bounds");
    expect(validateFormVisualGlobal("tintStrength", "0")).toBe("");
    expect(validateFormVisualGlobal("tintStrength", "1")).toBe("");
    expect(validateFormVisualGlobal("tintStrength", "1.5")).not.toBe("");
    expect(validateFormVisualGlobal("scaleStrength", "2")).toBe("");
    expect(validateFormVisualGlobal("scaleStrength", "3")).not.toBe("");
    expect(validateFormVisualGlobal("tintStrength", "")).not.toBe("");
    expect(validateFormVisualGlobal("enabled", "")).toBe(""); // 布林由核取方塊產生
  });

  it("寫回時仍然夾一次 —— 面板擋不住的路徑(貼上、程式呼叫)也不會存進非法值", () => {
    cover("formvis-admin-bounds");
    expect(setFormGlobal(SHIPPED_JSON, "tintStrength", 99).tintStrength).toBe(1);
    expect(setFormGlobal(SHIPPED_JSON, "scaleStrength", -5).scaleStrength).toBe(0);
    expect(setFormGlobal(SHIPPED_JSON, "enabled", false).enabled).toBe(false);
    expect(setFormGlobal(SHIPPED_JSON, "attachmentsEnabled", false).attachmentsEnabled).toBe(false);
  });
});

describe("面板寫不出基本型的外觀 (formvis-admin-alt-only)", () => {
  it("setFormEntry 拒絕基本型與不存在的 id,而且是原封不動退回", () => {
    cover("formvis-admin-alt-only");
    const entry = { attachModelKey: "imported.goku3head", scaleMult: 2 };
    // 基本型
    expect(setFormEntry(SHIPPED_JSON, "godie-ogrh", entry).forms["godie-ogrh"]).toBeUndefined();
    // 根本不是英雄
    expect(setFormEntry(SHIPPED_JSON, "godie-nosuch", entry).forms["godie-nosuch"]).toBeUndefined();
    // 變身態則寫得進去
    expect(
      setFormEntry(SHIPPED_JSON, "godie-h00w", entry).forms["godie-h00w"]?.attachModelKey,
    ).toBe("imported.goku3head");
  });

  it("26 對的 base 那一半,一個都寫不進去", () => {
    cover("formvis-admin-alt-only");
    for (const p of CHAMPION_FORM_PAIRS) {
      const next = setFormEntry(SHIPPED_JSON, p.baseId, { scaleMult: 2 });
      expect(next.forms[p.baseId], `${p.baseId} 被寫進去了`).toBeUndefined();
    }
  });
});

describe("草稿 ⇄ 文件的往返 (formvis-admin-draft)", () => {
  it("全部留白 = 移除這一格,不是寫一個空物件", () => {
    cover("formvis-admin-draft");
    expect(entryFromDraft({})).toBeUndefined();
    expect(entryFromDraft({ tintR: "", scaleMult: "  ", attachModelKey: "" })).toBeUndefined();
    const doc = setFormEntry(SHIPPED_JSON, "godie-o00x", entryFromDraft({}));
    expect(doc.forms["godie-o00x"]).toBeUndefined();
  });

  it("出貨那一格轉成草稿再轉回來,值不變", () => {
    cover("formvis-admin-draft");
    const entry = SHIPPED_JSON.forms["godie-o00x"]!;
    const back = entryFromDraft(draftFromEntry(entry))!;
    expect(back.tint).toEqual(entry.tint);
    expect(back.scaleMult).toBe(entry.scaleMult);
    expect(back.attachModelKey).toBe(entry.attachModelKey);
    expect(back.attachBone).toBe(entry.attachBone);
    expect(back.attachScale).toBe(entry.attachScale);
    // attachOffsetY 出貨是 0,往返之後仍然是 0(不是被當成「留白」丟掉)
    expect(back.attachOffsetY).toBe(0);
  });

  it("只填一個顏色分量時,另外兩個補中性 1 —— 不會存出半個顏色", () => {
    cover("formvis-admin-draft");
    expect(entryFromDraft({ tintB: "1.4" })!.tint).toEqual([1, 1, 1.4]);
  });

  it("沒有 attachModelKey 時,掛件的三個微調欄位不會被存進去", () => {
    cover("formvis-admin-draft");
    // 只填微調、沒填模型 → 整格是空的,回 undefined(= 移除),而不是一份
    // 只有 attachBone 的殘骸。殘骸會通過 Zod、存進 overlay、然後永遠沒有作用。
    expect(entryFromDraft({ attachBone: "Head", attachScale: "2", attachOffsetY: "1" })).toBeUndefined();
    // 有顏色但沒有模型 → 顏色留著,掛件三欄一個都不留
    const e = entryFromDraft({ tintR: "1.2", attachBone: "Head", attachScale: "2" })!;
    expect(e.tint).toEqual([1.2, 1, 1]);
    expect(e.attachBone).toBeUndefined();
    expect(e.attachScale).toBeUndefined();
  });

  it("面板列出的欄位就是 entryFromDraft 認得的那些(沒有畫了卻存不進去的格子)", () => {
    cover("formvis-admin-draft");
    const draft = Object.fromEntries(
      FORM_VISUAL_ROW_FIELDS.map((f) => [
        f,
        f === "attachModelKey" ? "imported.goku3head" : f === "attachBone" ? "origin" : "1.2",
      ]),
    );
    const e = entryFromDraft(draft)!;
    expect(e.tint).toEqual([1.2, 1.2, 1.2]);
    expect(e.scaleMult).toBe(1.2);
    expect(e.attachModelKey).toBe("imported.goku3head");
    expect(e.attachBone).toBe("origin");
    expect(e.attachScale).toBe(1.2);
    expect(e.attachOffsetY).toBe(1.2);
  });
});
