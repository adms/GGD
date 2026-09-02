import { ANIM_PULSES, type AnimPulse } from "@ggd/shared/content/animPulse";
import type { PresentationChannel } from "@ggd/shared/content/abilityPresentation";
import type {
  VfxScriptDoc,
  VfxScriptSegment,
} from "@ggd/shared/content/schema/vfxScript";
import bundledReceipt from "../../../../docs/editor-contract/ggd-presentation-receipt.json";

export type PresentationCapabilityStatus = "supported" | "partial" | "unsupported";

export interface PresentationRuleReceipt {
  readonly trigger: string;
  readonly actor: "caster" | "target";
  readonly pulse: AnimPulse;
  readonly channel: string;
  readonly why: string;
}

export interface PresentationReceipt {
  readonly schema: "ggd-presentation-receipt@1";
  readonly fingerprint: string;
  readonly actorPulses: {
    readonly vocabulary: readonly AnimPulse[];
    readonly defaultWindowMs: Readonly<Record<AnimPulse, number>>;
  };
  readonly defaultPresentation: {
    readonly rules: readonly PresentationRuleReceipt[];
    readonly neverFakeCast: readonly string[];
    readonly resolver: string;
  };
  readonly replacementPolicy: {
    readonly status: PresentationCapabilityStatus;
    readonly why: string;
  };
  readonly singleArc: {
    readonly status: PresentationCapabilityStatus;
    readonly ids: readonly string[];
    readonly params: readonly string[];
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path} 必須是非空字串`);
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${path} 必須是非空字串陣列`);
  }
  return [...new Set(value as string[])];
}

function status(value: unknown, path: string): PresentationCapabilityStatus {
  if (value !== "supported" && value !== "partial" && value !== "unsupported") {
    throw new Error(`${path} 必須是 supported／partial／unsupported`);
  }
  return value;
}

/**
 * Parse Main's generated presentation receipt. Unknown or incomplete data is
 * rejected: the Editor must never copy a pulse list or a single-arc allowlist
 * into a second hand-maintained constant.
 */
export function readPresentationReceipt(value: unknown): PresentationReceipt {
  const root = record(value);
  if (!root || root["schema"] !== "ggd-presentation-receipt@1") {
    throw new Error("presentation receipt schema 必須是 ggd-presentation-receipt@1");
  }
  const actorPulses = record(root["actorPulses"]);
  const defaultWindowMs = record(actorPulses?.["defaultWindowMs"]);
  const vocabulary = stringArray(actorPulses?.["vocabulary"], "actorPulses.vocabulary");
  if (JSON.stringify(vocabulary) !== JSON.stringify([...ANIM_PULSES])) {
    throw new Error("presentation receipt 的 actor pulse 詞彙與目前 Editor schema 不一致");
  }
  const windows = Object.fromEntries(vocabulary.map((pulse) => {
    const value = defaultWindowMs?.[pulse];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`actorPulses.defaultWindowMs.${pulse} 必須是正數`);
    }
    return [pulse, value];
  })) as Record<AnimPulse, number>;

  const defaults = record(root["defaultPresentation"]);
  if (!defaults || !Array.isArray(defaults["rules"])) {
    throw new Error("defaultPresentation.rules 必須是陣列");
  }
  const rules = defaults["rules"].map((raw, index): PresentationRuleReceipt => {
    const row = record(raw);
    if (!row) throw new Error(`defaultPresentation.rules.${index} 必須是 object`);
    const actor = row["actor"];
    const pulse = row["pulse"];
    if (actor !== "caster" && actor !== "target") {
      throw new Error(`defaultPresentation.rules.${index}.actor 無效`);
    }
    if (!(ANIM_PULSES as readonly unknown[]).includes(pulse)) {
      throw new Error(`defaultPresentation.rules.${index}.pulse 不在詞彙表`);
    }
    return {
      trigger: string(row["trigger"], `defaultPresentation.rules.${index}.trigger`),
      actor,
      pulse: pulse as AnimPulse,
      channel: string(row["channel"], `defaultPresentation.rules.${index}.channel`),
      why: string(row["why"], `defaultPresentation.rules.${index}.why`),
    };
  });

  const replacement = record(root["replacementPolicy"]);
  const singleArc = record(root["singleArc"]);
  if (!replacement || !singleArc) throw new Error("presentation receipt 缺少 replacementPolicy／singleArc");
  const arcIds = stringArray(singleArc["ids"], "singleArc.ids");
  const arcStatus = status(singleArc["status"], "singleArc.status");
  if (arcStatus === "supported" && arcIds.length === 0) {
    throw new Error("singleArc 宣告 supported，但沒有任何積木 ID");
  }

  return {
    schema: "ggd-presentation-receipt@1",
    fingerprint: string(root["fingerprint"], "fingerprint"),
    actorPulses: { vocabulary: vocabulary as AnimPulse[], defaultWindowMs: windows },
    defaultPresentation: {
      rules,
      neverFakeCast: stringArray(defaults["neverFakeCast"], "defaultPresentation.neverFakeCast"),
      resolver: string(defaults["resolver"], "defaultPresentation.resolver"),
    },
    replacementPolicy: {
      status: status(replacement["status"], "replacementPolicy.status"),
      why: string(replacement["why"], "replacementPolicy.why"),
    },
    singleArc: {
      status: arcStatus,
      ids: arcIds,
      params: stringArray(singleArc["params"], "singleArc.params"),
    },
  };
}

export const PRESENTATION_RECEIPT = readPresentationReceipt(bundledReceipt);
const SINGLE_ARC_IDS = new Set(PRESENTATION_RECEIPT.singleArc.ids);

export function isSingleArcVfxId(id: string): boolean {
  return PRESENTATION_RECEIPT.singleArc.status === "supported" && SINGLE_ARC_IDS.has(id);
}

/** Resolve a family without silently inventing an ID that Main did not receipt. */
export function singleArcVfxId(family: string): string {
  const id = `fx.prim.${family}.arc`;
  if (!isSingleArcVfxId(id)) throw new Error(`Main presentation receipt 沒有 ${id}`);
  return id;
}

export type ReplacementTrigger =
  | "abilityCast"
  | "comboStrike"
  | "projectileHit"
  | "reflectSuccess";

export interface PresentationReplacementClaim {
  readonly trigger: ReplacementTrigger;
  readonly channel: PresentationChannel;
  /** Only selects which combo event owns the claim; it is not part of channel vocabulary. */
  readonly strikeIndex?: number;
}

/**
 * Minimal v1 replacement contract requested by Main. It claims only actor
 * channels already present in Main's default table. Visual/audio channels can
 * be added when Main actually publishes defaults for them.
 */
export function replacementClaimForSegment(
  segment: VfxScriptSegment,
): PresentationReplacementClaim | null {
  if (segment.kind !== "anim") return null;
  const at = segment.at ?? "target";
  switch (segment.on) {
    case "castStart":
      return at === "caster" ? { trigger: "abilityCast", channel: "caster.action" } : null;
    case "castEffect":
      // Main has no default castEnd/castEffect row. This action therefore
      // coexists honestly and must not suppress the abilityCast wind-up.
      return null;
    case "strike":
      return {
        trigger: "comboStrike",
        channel: at === "caster" ? "caster.action" : "target.reaction",
        ...(segment.strikeIndex === undefined ? {} : { strikeIndex: segment.strikeIndex }),
      };
    case "projectileHit":
      return at === "target" ? { trigger: "projectileHit", channel: "target.reaction" } : null;
    case "reflectSuccess":
      // VfxScriptPlayer calls the reflector `caster`; Main's wire resolver
      // calls that same defender `target`. The channel follows Main's receipt.
      return at === "caster" ? { trigger: "reflectSuccess", channel: "target.reaction" } : null;
    case "projectileSpawn":
      return null;
  }
}

export function replacementClaimsForScript(doc: VfxScriptDoc): PresentationReplacementClaim[] {
  const claims = new Map<string, PresentationReplacementClaim>();
  for (const segment of doc.segments) {
    const claim = replacementClaimForSegment(segment);
    if (!claim) continue;
    const key = `${claim.trigger}:${claim.channel}:${claim.strikeIndex ?? "each"}`;
    claims.set(key, claim);
  }
  return [...claims.values()];
}

/**
 * Stamp Main's receipted actor-channel takeover onto every generated action.
 * Explicit author choices always win; the Editor only fills a missing claim,
 * and only while Main advertises the replacement policy as supported.
 */
export function completePresentationReplacements(
  segments: readonly VfxScriptSegment[],
): VfxScriptSegment[] {
  if (PRESENTATION_RECEIPT.replacementPolicy.status !== "supported") return [...segments];
  return segments.map((segment) => {
    if (segment.replaces !== undefined) return segment;
    const claim = replacementClaimForSegment(segment);
    return claim ? { ...segment, replaces: claim.channel } : segment;
  });
}

export function unsupportedReplacementClaims(doc: VfxScriptDoc): PresentationReplacementClaim[] {
  return PRESENTATION_RECEIPT.replacementPolicy.status === "supported"
    ? []
    : replacementClaimsForScript(doc);
}
