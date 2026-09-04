import { describe, expect, it } from "vitest";
import {
  GGD_TYPE_CATALOG,
  GGD_TYPE_CATALOG_ERROR,
  pickableTemplateIds,
  templateContractBlockers,
  templateParamDecision,
  templateSelectionDecision,
} from "./typeCatalog";

/**
 * ⭐ 「分析完成但 Main 還沒接上展開路徑」的**活夾具** —— 從契約自己拿一個 id，
 * ⛔ 不寫死。
 *
 * ⚠️ 這一行是踩出來的：底下兩條斷言原本寫死 `tpl-dragon-serpent` 與
 * `tpl-dragon-quake`，而 `typecat:build` 重新量過之後那兩支都 `expands: true`
 * 且接上了 doc 路由 ⇒ 兩條當場紅。⛔ **而那不是回歸，是前提消失**
 * （CLAUDE.md 的失敗形態⑩：一條靠缺陷才綠的守衛，缺陷被修好時看起來就像壞了）。
 * ⇒ 夾具改成從 `analysedButUnwired` 取，而「那一族空了」是一個**會紅的決定**，
 * ⛔ 不是靜靜地變成一條恆綠的斷言。
 */
const UNWIRED_ID: string | null = GGD_TYPE_CATALOG?.analysedButUnwired[0]?.id ?? null;
const UNWIRED_WHY =
  "契約裡已經沒有任何 analysedButUnwired 的模板 ⇒ fail-closed 的「尚未接上展開路徑」" +
  "這一條分支沒有活的夾具了。⛔ 這不是「把斷言刪掉」：要嘛改用一個合成 id，" +
  "要嘛把那條分支連同 typeCatalog.ts 的對應程式一起退場。";

describe("Main ggd-type-catalog fail-closed adapter", () => {
  it("accepts the generated contract and reproduces its measured pickable count", () => {
    expect(GGD_TYPE_CATALOG_ERROR).toBeNull();
    expect(GGD_TYPE_CATALOG).not.toBeNull();
    expect(GGD_TYPE_CATALOG!.types.filter((entry) => entry.expands)).toHaveLength(
      GGD_TYPE_CATALOG!.counts.pickable,
    );
    const expectedDoc = GGD_TYPE_CATALOG!.types
      .filter((entry) => entry.expands && (entry.wiring === "doc" || entry.wiring === "both"))
      .length;
    const expectedNode = GGD_TYPE_CATALOG!.types
      .filter((entry) => entry.expands && (entry.wiring === "node" || entry.wiring === "both"))
      .length;
    expect(pickableTemplateIds("doc").size).toBe(expectedDoc);
    expect(pickableTemplateIds("node").size).toBe(expectedNode);
  });

  it("uses measured expansion and wiring rather than the template status badge", () => {
    expect(templateSelectionDecision("tpl-beam-roll", "doc").selectable).toBe(true);
    expect(templateSelectionDecision("tpl-locust-line", "node").selectable).toBe(true);
    expect(templateSelectionDecision("tpl-locust-line", "doc")).toMatchObject({
      selectable: false,
      reason: expect.stringContaining("wiring=node"),
    });
    expect(UNWIRED_ID, UNWIRED_WHY).toBeTypeOf("string");
    expect(templateSelectionDecision(UNWIRED_ID!, "doc")).toMatchObject({
      selectable: false,
      reason: expect.stringContaining("尚未接上展開路徑"),
    });
    expect(templateSelectionDecision("tpl-does-not-exist", "doc").selectable).toBe(false);
  });

  it("locks inert and wrong-side params instead of offering silent no-op controls", () => {
    expect(templateParamDecision("tpl-beam-roll", "speed", "doc")).toMatchObject({
      editable: false,
      fillsVia: "spawnModelFx.preset",
      reason: expect.stringContaining("本版不生效"),
    });
    expect(templateParamDecision("tpl-beam-roll", "modelKey", "doc")).toMatchObject({
      editable: false,
      fillsVia: "spawnModelFx.preset",
      reason: expect.stringContaining("只能透過 spawnModelFx.preset"),
    });
    expect(templateParamDecision("tpl-beam-roll", "damageType", "doc")).toEqual({
      editable: true,
      reason: null,
      fillsVia: "template.ref → expand()",
    });
  });

  it("turns every unavailable card into an explicit save blocker", () => {
    expect(templateContractBlockers(["tpl-single-strike"], "doc")).toEqual([]);
    // ⭐ 兩個**理由不同**的擋路者要各自成為一列：`tpl-locust-line` 是「路由不對」
    // （wiring=node，只能填 spawnModelFx.preset），而 UNWIRED_ID 是「Main 還沒接上
    // 展開路徑」。⛔ 只留一個的話，這條就證明不了 blockers 是逐支算的。
    expect(UNWIRED_ID, UNWIRED_WHY).toBeTypeOf("string");
    expect(templateContractBlockers(["tpl-locust-line", UNWIRED_ID!], "doc"))
      .toEqual([
        expect.stringContaining("tpl-locust-line"),
        expect.stringContaining(UNWIRED_ID!),
      ]);
  });
});
