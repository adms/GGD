import { z } from "zod";
import { zId } from "../schema/common";
import { HERO_PROJECT_SCHEMA, HERO_SECTION_IDS } from "./constants";
import { zHeroPlan, zHeroSourceLock } from "./plan";
import { zHeroMoveNames } from "./proposal";
import { defaultHeroPresentation, zHeroPresentation } from "./presentation";

export const zAiMode = z.enum(["off", "local", "byok"]);
export type AiMode = z.infer<typeof zAiMode>;

export const zFieldOwner = z.enum(["auto", "manual", "locked"]);
export type FieldOwner = z.infer<typeof zFieldOwner>;

const zOwnershipPath = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z][A-Za-z0-9]*(\.(?:[A-Za-z][A-Za-z0-9]*|[0-9]+))*$/)
  .refine((path) => !path.split(".").some((part) => ["__proto__", "prototype", "constructor"].includes(part)));

export const zHeroSection = z
  .object({
    revision: z.number().int().nonnegative(),
    state: z.enum(["empty", "draft", "validating", "valid", "warning", "blocked", "stale"]),
    fieldOwnership: z.record(zOwnershipPath, zFieldOwner),
  })
  .strict();
export type HeroSection = z.infer<typeof zHeroSection>;

const exactSections = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .object({
      identity: schema,
      attributes: schema,
      skills: schema,
      mechanics: schema,
      presentation: schema,
      validation: schema,
      package: schema,
    })
    .strict();

export const zSectionValidationState = z
  .object({
    revision: z.number().int().nonnegative(),
    status: z.enum(["idle", "running", "passed", "warning", "failed", "stale"]),
    diagnosticCodes: z.array(z.string().min(1).max(80)).max(128),
  })
  .strict();
export type SectionValidationState = z.infer<typeof zSectionValidationState>;

export const zProjectReceipt = z
  .object({
    kind: z.enum(["plan-generated", "proposal-accepted", "package-built"]),
    projectRevision: z.number().int().nonnegative(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    promptDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    acceptedPatchIndexes: z.array(z.number().int().nonnegative()).max(64).optional(),
  })
  .strict();
export type ProjectReceipt = z.infer<typeof zProjectReceipt>;

export const zHeroProject = z
  .object({
    schema: z.literal(HERO_PROJECT_SCHEMA),
    projectId: zId,
    revision: z.number().int().nonnegative(),
    sourceLock: zHeroSourceLock,
    brief: z
      .object({
        name: z.string().min(1).max(80),
        concept: z.string().min(1).max(4000),
        moveNames: zHeroMoveNames,
      })
      .strict(),
    sections: exactSections(zHeroSection),
    acceptedPlan: zHeroPlan.nullable(),
    presentation: zHeroPresentation.default(defaultHeroPresentation),
    validationState: exactSections(zSectionValidationState),
    receipts: z.array(zProjectReceipt).max(512),
  })
  .strict();
export type HeroProject = z.infer<typeof zHeroProject>;

export const HERO_SECTION_ID_SET: ReadonlySet<string> = new Set(HERO_SECTION_IDS);
