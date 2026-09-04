import type { AppearanceResult } from "@ggd/shared/content/import/resolvedAppearance";

export interface AppearanceReview {
  /** A visual proof may only be accepted when both actors resolve to real, non-stand-in bodies. */
  readonly allowed: boolean;
  readonly issues: readonly string[];
  /** Persisted beside the candidate so review can reproduce the exact resolver/model documents. */
  readonly receipts: readonly string[];
}

/**
 * Review policy for the two characters visible in a VFX Forge proof.
 *
 * The renderer may still show a stand-in so an author can debug mechanics, but
 * a screenshot of the wrong character must never become approval evidence.
 */
export function reviewAppearances(
  caster: AppearanceResult | null,
  target: AppearanceResult | null,
): AppearanceReview {
  const issues: string[] = [];
  const receipts: string[] = [];
  for (const [role, result] of [["施法者", caster], ["目標", target]] as const) {
    if (!result) {
      issues.push(`${role}外觀尚未解析`);
      continue;
    }
    if (!result.ok) {
      issues.push(`${role}外觀解析失敗：${result.failure.kind}`);
      continue;
    }
    const appearance = result.appearance;
    receipts.push(
      `resolved-appearance:${role}:${appearance.championId}:${appearance.modelKey}:` +
      `${appearance.modelDocDigest}:${appearance.resolverFingerprint}`,
    );
    if (appearance.isStandIn) {
      issues.push(`${role} ${appearance.championId} 使用共用替身 ${appearance.modelKey}`);
    }
  }
  return { allowed: issues.length === 0, issues, receipts };
}
