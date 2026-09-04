import {
  classifyVisualAcceptanceIssues,
  type VisualAcceptanceIssueInput,
  type VisualAcceptanceMachineIssue,
} from "../../apps/editor/src/vfx-forge/visualAcceptanceIssues";

export const VISUAL_PROOF_SOURCES = [
  "acceptance-fixture",
  "editor-basic-script",
  "editor-effect-graph-preview",
  "runtime-effect-graph",
] as const;

export type VisualProofSource = (typeof VISUAL_PROOF_SOURCES)[number];

export function parseVisualProofSource(value: unknown): VisualProofSource | undefined {
  return typeof value === "string" && (VISUAL_PROOF_SOURCES as readonly string[]).includes(value)
    ? value as VisualProofSource
    : undefined;
}

/**
 * The browser and importer must classify the exact same evidence tuple. Keep
 * proofSource in this adapter: NO_VISIBLE_PRESENTATION intentionally depends
 * on whether the pixels came from an Editor script or the runtime graph.
 */
export function classifyImportedVisualAcceptance(
  input: Omit<VisualAcceptanceIssueInput, "proofSource"> & { readonly proofSource: unknown },
): { readonly proofSource: VisualProofSource | undefined; readonly machineIssues: readonly VisualAcceptanceMachineIssue[] } {
  const proofSource = parseVisualProofSource(input.proofSource);
  return {
    proofSource,
    machineIssues: classifyVisualAcceptanceIssues({ ...input, proofSource }),
  };
}
