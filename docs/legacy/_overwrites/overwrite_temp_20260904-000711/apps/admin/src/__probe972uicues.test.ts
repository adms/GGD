import { describe, expect, it } from "vitest";
import { CONFIG_DOC_SPECS } from "./configForms";
import { readSchema, elsewhereCovers } from "./configForms/engine";

describe("probe972 ui-cues only", () => {
  it("leaf coverage", () => {
    const spec = CONFIG_DOC_SPECS.find((s) => s.docId === "ui-cues")!;
    const { leaves, branches } = readSchema(spec.zod);
    const schemaPaths = leaves
      .map((l) => l.path)
      .filter((p) => !["id", "schema", "note"].includes(p))
      .filter((p) => !elsewhereCovers(spec, p))
      .sort();
    const labelPaths = spec.fields.map((f) => f.path).sort();
    // eslint-disable-next-line no-console
    console.log(
      "MISSING_LABEL=", schemaPaths.filter((p) => !labelPaths.includes(p)),
      "EXTRA_LABEL=", labelPaths.filter((p) => !schemaPaths.includes(p)),
      "BRANCHES=", branches.map((b) => b.path),
      "PRESERVED=", spec.preserved.map((p) => p.path),
    );
    expect(labelPaths).toEqual(schemaPaths);
  });
});
