import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDITOR_BRICK_LAYERS,
  NO_FORM_EXEMPTIONS,
  buildEditorFormReceipts,
  type EditorBrick,
} from "./editorFormReceipts";

const REPO = join(import.meta.dirname, "../../../..");
const contract = JSON.parse(
  readFileSync(join(REPO, "docs/editor-contract/ggd-bricks.json"), "utf8"),
) as { bricks: EditorBrick[] };

describe("153-brick Editor form receipt", () => {
  const receipts = buildEditorFormReceipts(contract.bricks);

  it("answers every current brick exactly once without reading the proxy value", () => {
    expect(receipts).toHaveLength(contract.bricks.length);
    expect(new Set(receipts.map((row) => `${row.layer}/${row.id}`)).size).toBe(receipts.length);
    expect(new Set(receipts.map((row) => row.layer))).toEqual(new Set(EDITOR_BRICK_LAYERS));
    for (const row of receipts) {
      expect(Object.keys(row).sort(), `${row.layer}/${row.id}`).toEqual(
        ["componentPath", "id", "layer", "reason", "renderable", "surface"],
      );
    }
  });

  it("gives every positive result a real shipped component path", () => {
    for (const row of receipts) {
      if (!row.renderable) {
        expect(row.reason, `${row.layer}/${row.id}`).toBeTruthy();
        continue;
      }
      expect(row.componentPath, `${row.layer}/${row.id}`).toBeTruthy();
      expect(existsSync(join(REPO, row.componentPath!)), row.componentPath!).toBe(true);
      expect(row.surface, `${row.layer}/${row.id}`).toBeTruthy();
    }
  });

  it("fails closed for the draft model preset instead of counting a raw JSON escape hatch", () => {
    expect(receipts.find((row) => row.id === "tpl-dragon-shockwave" && row.layer === "model-preset"))
      .toMatchObject({ renderable: false, componentPath: null });
  });

  it("⭐ GH#1024 AC⑦：豁免表每一列的前提今天都還成立（draft · 引擎不認得 · 0 採用）—— 前提消失 ⇒ 紅", () => {
    const census = JSON.parse(
      readFileSync(join(REPO, "docs/editor-contract/ggd-brick-census.json"), "utf8"),
    ) as { templates: Array<{ id: string; status: string; engineKnows: boolean; abilities: number }> };
    const keys = Object.keys(NO_FORM_EXEMPTIONS);
    expect(keys.length, "豁免表空了就把這條與 NO_FORM_EXEMPTIONS 一起刪掉").toBeGreaterThan(0);
    for (const key of keys) {
      const id = key.slice(key.indexOf("/") + 1);
      const row = census.templates.find((t) => t.id === id);
      expect(row && { status: row.status, engineKnows: row.engineKnows, abilities: row.abilities }, key)
        .toEqual({ status: "draft", engineKnows: false, abilities: 0 });
      expect(receipts.find((r) => `${r.layer}/${r.id}` === key), key)
        .toMatchObject({ renderable: false, reason: NO_FORM_EXEMPTIONS[key] });
    }
  });
});
