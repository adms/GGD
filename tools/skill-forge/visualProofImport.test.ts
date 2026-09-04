import { describe, expect, it } from "vitest";
import { classifyImportedVisualAcceptance, parseVisualProofSource } from "./visualProofImport";

describe("visual proof importer classification seam", () => {
  it("preserves every supported proof source and rejects unknown values", () => {
    expect(parseVisualProofSource("acceptance-fixture")).toBe("acceptance-fixture");
    expect(parseVisualProofSource("editor-basic-script")).toBe("editor-basic-script");
    expect(parseVisualProofSource("editor-effect-graph-preview")).toBe("editor-effect-graph-preview");
    expect(parseVisualProofSource("runtime-effect-graph")).toBe("runtime-effect-graph");
    expect(parseVisualProofSource("owner-dialogue")).toBeUndefined();
  });

  it("recomputes NO_VISIBLE_PRESENTATION from the same browser evidence tuple", () => {
    const result = classifyImportedVisualAcceptance({
      status: "captured",
      blockers: [],
      proofSource: "editor-basic-script",
      frames: [],
      audit: {
        safe: true,
        autoVisualScore: 10,
        sampledFrames: 31,
        peakParticleCount: 42,
        peakSystemCount: 1,
        peakPresentationPixelShare: 0,
        presentationEventCount: 1,
        semanticActionCount: 2,
        worstAtMs: 0,
        worst: {
          litShare: 0,
          highlightShare: 0,
          brightShare: 0,
          nearWhiteShare: 0,
          dominantBrightShare: 0,
          dominantNonBackgroundShare: 0,
          localWhiteCardShare: 0,
          diagnosticCheckerShare: 0,
          unsafe: false,
        },
        suspects: [],
        elapsedMs: 867,
        gpuReadbacks: 31,
      },
    });

    expect(result.proofSource).toBe("editor-basic-script");
    expect(result.machineIssues.map((issue) => issue.code)).toEqual(["NO_VISIBLE_PRESENTATION"]);
  });
});
