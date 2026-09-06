import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { parseInlineVfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import {
  api,
  type AiProposalResult,
  type AiVisualAuditReceipt,
  type AiVisualEvidence,
} from "../api/client";
import type { VfxScriptAssetGuard } from "./assetSafety";

export interface VfxScriptProposalWriter {
  submitAiProposal(input: {
    target: { collection: "vfx-scripts"; id: string };
    purpose: "production-candidate" | "editor-capability-fixture";
    candidate: VfxScriptDoc;
    summary?: string;
    evidence?: string[];
    visualEvidence?: AiVisualEvidence[];
    visualAudit?: AiVisualAuditReceipt;
    autoVisualScore?: number;
  }): Promise<AiProposalResult>;
}

/**
 * The only persistence seam owned by VFX Forge.
 *
 * It can submit a non-live proposal only.  There is intentionally no `put` or
 * `create` member in this interface, so UI shortcuts and future AI agents
 * cannot turn a draft into shipping content without the admin approval gate.
 */
export async function submitVfxScriptProposal(
  input: unknown,
  assetGuard: VfxScriptAssetGuard,
  purpose: "production-candidate" | "editor-capability-fixture",
  writer: VfxScriptProposalWriter = api as VfxScriptProposalWriter,
  metadata: {
    summary?: string;
    evidence?: string[];
    visualEvidence?: AiVisualEvidence[];
    visualAudit?: AiVisualAuditReceipt;
    autoVisualScore?: number;
  } = {},
): Promise<AiProposalResult> {
  const doc = parseInlineVfxScriptDoc(input);
  // This remains inside the sole persistence seam: submitting an unsafe draft
  // to a review page would waste human review time and could later Promote a
  // texture with a visible backdrop.
  await assetGuard.assertScriptSafe(doc);
  return writer.submitAiProposal({
    target: { collection: "vfx-scripts", id: doc.id },
    purpose,
    candidate: doc,
    ...metadata,
  });
}
