import { z } from "zod";
import { zId } from "../schema/common";
import {
  HERO_PROPOSAL_REQUEST_SCHEMA,
  HERO_PROPOSAL_BATCH_SCHEMA,
  HERO_PROPOSAL_SCHEMA,
  HERO_SECTION_IDS,
  HERO_SLOTS,
} from "./constants";
import { zContractId, zHeroPlan, zHeroSourceLock } from "./plan";

export const zHeroMoveNames = z
  .object({
    PASSIVE: z.string().min(1).max(80).optional(),
    Q: z.string().min(1).max(80).optional(),
    W: z.string().min(1).max(80).optional(),
    E: z.string().min(1).max(80).optional(),
    R: z.string().min(1).max(80).optional(),
    EX: z.string().min(1).max(80).optional(),
  })
  .strict();

export const zHeroSummary = z
  .object({
    name: z.string().min(1).max(80),
    concept: z.string().min(1).max(4000),
    moveNames: zHeroMoveNames,
    sourceLock: zHeroSourceLock,
  })
  .strict();
export type HeroSummary = z.infer<typeof zHeroSummary>;

export const zDirectionOption = z
  .object({
    id: zContractId,
    subject: z.enum(["self", "ally", "enemy"]),
    destination: z.enum(["self", "ally", "enemy", "point", "origin"]),
    capabilityId: zContractId,
  })
  .strict();
export type DirectionOption = z.infer<typeof zDirectionOption>;

export const zFallbackOption = z
  .object({
    id: zContractId,
    requestedCapabilityId: zContractId,
    fallbackCapabilityId: zContractId,
    disclosure: z.string().min(1).max(500),
  })
  .strict();
export type FallbackOption = z.infer<typeof zFallbackOption>;

export const zProposalTemplateOption = z.object({
  id: zId,
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(1000),
  requires: z.array(zContractId).max(32),
}).strict();

const zSafePathSegment = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9]*$/)
  .refine((value) => !["__proto__", "prototype", "constructor"].includes(value));

export const zProposalRequest = z
  .object({
    schema: z.literal(HERO_PROPOSAL_REQUEST_SCHEMA),
    task: z.enum([
      "three-concepts",
      "fill-slot",
      "simplify-complexity",
      "rewrite-copy",
      "explain-error",
      "review-kit",
    ]),
    projectRevision: z.number().int().nonnegative(),
    sectionId: z.enum(HERO_SECTION_IDS),
    targetSlot: z.enum(HERO_SLOTS).nullable(),
    sanitizedHeroSummary: zHeroSummary,
    currentPlan: zHeroPlan.nullable(),
    diagnosticCodes: z.array(z.string().min(1).max(80)).max(64),
    legalTemplateIds: z.array(zId).min(3).max(8),
    templateOptions: z.array(zProposalTemplateOption).min(3).max(8),
    legalPatchPaths: z.array(z.array(zSafePathSegment).min(2).max(6)).max(32),
    legalCapabilityIds: z.array(zContractId).max(128),
    legalDirectionOptions: z.array(zDirectionOption).max(32),
    legalFallbackOptions: z.array(zFallbackOption).max(32),
    outputSchema: z.literal(HERO_PROPOSAL_SCHEMA),
  })
  .strict()
  .superRefine((value, context) => {
    const optionIds = value.templateOptions.map((option) => option.id);
    if (JSON.stringify(optionIds) !== JSON.stringify(value.legalTemplateIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["templateOptions"], message: "template options must exactly match legalTemplateIds" });
    }
    if ((value.task === "fill-slot") !== (value.targetSlot !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetSlot"], message: "fill-slot requires exactly one target slot" });
    }
    if (value.currentPlan && JSON.stringify(value.currentPlan.sourceLock) !== JSON.stringify(value.sanitizedHeroSummary.sourceLock)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["currentPlan", "sourceLock"], message: "current plan and summary source locks differ" });
    }
  });
export type ProposalRequest = z.infer<typeof zProposalRequest>;

const zProviderOrigin = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.origin === value && url.username === "" && url.password === "";
    } catch {
      return false;
    }
  }, "provider receipt must contain only the exact origin");

export const zProviderReceipt = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("local"),
      modelId: zContractId,
      modelDigest: z.string().regex(/^[a-f0-9]{64}$/),
      runtimeDigest: z.string().regex(/^[a-f0-9]{64}$/),
      promptDigest: z.string().regex(/^[a-f0-9]{64}$/),
      grammarDigest: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal("byok"),
      origin: zProviderOrigin,
      protocol: z.enum(["responses", "chat-completions"]),
      modelId: z.string().min(1).max(256).regex(/^[a-z0-9][a-z0-9._:@/-]*$/i),
      requestId: z.string().min(1).max(256).optional(),
      promptDigest: z.string().regex(/^[a-f0-9]{64}$/),
      usage: z
        .object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() })
        .strict()
        .optional(),
    })
    .strict(),
]);
export type ProviderReceipt = z.infer<typeof zProviderReceipt>;

/** The path is project-relative; section-specific legality is checked separately. */
export const zAllowlistedSectionPatch = z
  .object({
    op: z.literal("replace"),
    path: z.array(zSafePathSegment).min(2).max(6),
    value: z.unknown(),
  })
  .strict();
export type AllowlistedSectionPatch = z.infer<typeof zAllowlistedSectionPatch>;

export const zHeroProposalPayload = z
  .object({
    schema: z.literal(HERO_PROPOSAL_SCHEMA),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    baseRevision: z.number().int().nonnegative(),
    sectionId: z.enum(HERO_SECTION_IDS),
    outcome: z.enum(["proposed", "degraded", "refused", "advice"]),
    patches: z.array(zAllowlistedSectionPatch).max(64),
    referencedTemplateIds: z.array(zId).max(64),
    referencedCapabilityIds: z.array(zContractId).max(128),
    selectedDirectionOptionIds: z.array(zContractId).max(32),
    selectedFallbackOptionIds: z.array(zContractId).max(32),
    assumptions: z.array(z.string().min(1).max(500)).max(32),
    explanation: z.string().min(1).max(4000),
  })
  .strict();
export type HeroProposalPayload = z.infer<typeof zHeroProposalPayload>;

export const zHeroProposal = zHeroProposalPayload.extend({ providerReceipt: zProviderReceipt }).strict();
export type HeroProposal = z.infer<typeof zHeroProposal>;

export const zHeroProposalPayloadBatch = z.object({
  schema: z.literal(HERO_PROPOSAL_BATCH_SCHEMA),
  proposals: z.array(zHeroProposalPayload).min(1).max(3),
}).strict();
export type HeroProposalPayloadBatch = z.infer<typeof zHeroProposalPayloadBatch>;

export const zHeroProposalBatch = z.object({
  schema: z.literal(HERO_PROPOSAL_BATCH_SCHEMA),
  proposals: z.array(zHeroProposal).min(1).max(3),
}).strict();
export type HeroProposalBatch = z.infer<typeof zHeroProposalBatch>;

export const HERO_SLOT_SET: ReadonlySet<string> = new Set(HERO_SLOTS);
