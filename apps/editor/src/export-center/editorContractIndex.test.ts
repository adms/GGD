import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildContractIndex } from "@ggd/shared/content/import/contractIndex";
import { canonicalizeJcs } from "@ggd/shared/content/import/jcs";
import { sha256Hex } from "@ggd/shared/content/sha256";
import { ZIP_LIMITS } from "@ggd/shared/content/import/zipSafety";
import {
  modesFor,
  packageRuntimeRepresentations,
  promotionPolicyFor,
  readEditorContractIndex,
} from "./editorContractIndex";

const fixture = buildContractIndex({
  maxCompressedBytes: 64 * 1024 * 1024,
  maxUncompressedBytes: 256 * 1024 * 1024,
});

function redigest(value: Record<string, unknown>): Record<string, unknown> {
  const body = { ...value };
  delete body["digest"];
  return {
    ...body,
    digest: sha256Hex(canonicalizeJcs(body)).slice(0, 12),
  };
}

describe("Main editor contract index", () => {
  it("consumes Main's real registry shape and pins the profile digest", () => {
    const index = readEditorContractIndex(fixture, fixture.digest);
    expect(index.minEditorContractVersion).toBe("1.0.0");
    expect(modesFor(index, "ability@1")).toEqual(["bootstrap", "full", "delta"]);
    expect(modesFor(index, "vfx-script@1")).toEqual([]);
    expect(promotionPolicyFor(index, "editor-capability-fixture")).toBe("forbidden");
    expect(packageRuntimeRepresentations(index).map((row) => row.schema)).toEqual(["ability@1", "item@1"]);
  });

  it("matches the shipped target-profile digest to Main's full registry", () => {
    const root = join(__dirname, "..", "..", "..", "..");
    const profile = JSON.parse(
      readFileSync(join(root, "content", "editor-target-profile.json"), "utf8"),
    ) as { contractIndex?: { digest?: string } };
    const full = buildContractIndex(ZIP_LIMITS as unknown as Record<string, number>);
    expect(profile.contractIndex?.digest).toBe(full.digest);
    expect(readEditorContractIndex(full, profile.contractIndex?.digest)).toMatchObject({
      digest: full.digest,
      minEditorContractVersion: "1.0.0",
    });
  });

  it("fails closed for unknown and unsupported representations", () => {
    const unsupported = redigest({
      ...fixture,
      representations: [
        ...fixture.representations,
        {
          schema: "future@9",
          packageKind: "future",
          state: "unsupported",
          minStage: "G9",
          modes: ["bootstrap"],
          promotionPolicy: "review-required",
          why: "fixture",
        },
      ],
    });
    const index = readEditorContractIndex(unsupported);
    expect(modesFor(index, "future@9")).toEqual([]);
    expect(promotionPolicyFor(index, "unknown@9")).toBe("forbidden");
  });

  it("rejects content tampering, profile drift, and a newer minimum Editor contract", () => {
    expect(() => readEditorContractIndex({ ...fixture, representations: [] })).toThrow(/摘要/);
    expect(() => readEditorContractIndex(fixture, "000000000000")).toThrow(/target profile/);
    expect(() => readEditorContractIndex(redigest({
      ...fixture,
      minEditorContractVersion: "2.0.0",
    }))).toThrow(/目前僅支援/);
  });

  it("rejects missing fields, duplicate rows, and invented modes after valid re-digest", () => {
    expect(() => readEditorContractIndex(redigest({
      ...fixture,
      representations: [{ schema: "ability@1" }],
    }))).toThrow(/packageKind|state/);
    expect(() => readEditorContractIndex(redigest({
      ...fixture,
      representations: [...fixture.representations, fixture.representations[0]],
    }))).toThrow(/重複/);
    expect(() => readEditorContractIndex(redigest({
      ...fixture,
      representations: [{ ...fixture.representations[0], modes: ["turbo"] }],
    }))).toThrow(/未知 mode/);
  });
});
