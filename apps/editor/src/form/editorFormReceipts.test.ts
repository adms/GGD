import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDITOR_BRICK_LAYERS,
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
});
