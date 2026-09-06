import { z } from "zod";
import { zHeroProject } from "./heroForge/schema";
import { zPackageManifest } from "./import/packageSchema";
import { zCommunityTarget } from "./communityRoom";

const id = z.string().min(1).max(128);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
export const zHeroSource = z.object({ workId: id, submissionId: id, packageDigest: digest, authorId: id }).strict();
export const zHeroStoredVersion = z.object({ schema: z.literal("ggd-work-version@1"), workId: id, versionId: digest, projectId: id, packageDigest: digest, snapshotDigest: digest, files: z.array(z.object({ path: z.string().min(1).max(1024), sha256: digest, bytes: z.number().int().nonnegative() }).strict()).max(5000) }).strict();
export const zHeroInspection = z.object({
  schema: z.literal("ggd-hero-package-inspection@1"), project: zHeroProject, packageDigest: digest, manifest: zPackageManifest,
  icons: z.array(z.object({ slot: z.string().max(8), path: z.string().max(1024), contentSha256: digest, mime: z.string().max(80), base64: z.string().max(12 * 1024 * 1024) }).strict()).max(7),
  diagnostics: z.array(z.object({ severity: z.string().max(32), message: z.string().max(4000) }).passthrough()).max(1000),
}).strict();
export const zHeroSnapshot = z.object({ schema: z.literal("ggd-hero-submission@1"), id, workId: id, accountId: id, version: zHeroStoredVersion, inspection: zHeroInspection, allowAttributionRemix: z.boolean(), source: zHeroSource.optional(), submittedAt: z.string().datetime() }).strict();
export const zHeroDecision = z.object({ schema: z.literal("ggd-hero-review@1"), id, submissionId: id, packageDigest: digest, snapshotDigest: digest, status: z.enum(["approved", "returned", "rejected"]), reason: z.string().max(4000), problems: z.array(z.object({ slot: z.string().max(8).optional(), field: z.string().max(256).optional(), message: z.string().max(1000) }).strict()).max(12).nullable(), decidedBy: id, decidedAt: z.string().datetime() }).strict();
export const zHeroPublished = z.object({ submissionId: id, version: zHeroStoredVersion, decisionId: id, publishedAt: z.string().datetime(), operationId: id }).strict();
export const zHeroPublishOperation = z.object({ id, action: z.enum(["publish", "restore", "unpublish"]), inputDigest: digest, submissionId: id, status: z.enum(["publishing", "published", "failed", "stale", "unpublished"]), expectedPublished: digest, expectedRevision: z.number().int().nonnegative(), guardRevision: z.number().int().nonnegative(), decisionId: z.string().max(128), reason: z.string().max(4000), requestedBy: id, error: z.string().max(12000).optional(), completedAt: z.string().datetime().optional() }).strict();
export const zHeroControl = z.object({ schema: z.literal("ggd-hero-publication@1"), workId: id, revision: z.number().int().nonnegative(), publicationEpoch: z.number().int().nonnegative(), pendingSubmission: z.string().max(128), pendingSubmittedAt: z.string().datetime(), submissions: z.array(id).max(1000), published: zHeroPublished.nullable(), reviews: z.record(z.object({ id, status: z.string().max(32), digest }).strict()), operations: z.record(zHeroPublishOperation), history: z.array(zHeroPublished).max(1000) }).strict();
export const HERO_PUBLICATION_STATUSES = ["pending", "approved", "returned", "rejected", "publishing", "publish-failed", "published", "unpublished", "superseded"] as const;
export const HERO_STATUS_LABELS: Record<typeof HERO_PUBLICATION_STATUSES[number], string> = { pending: "待審", approved: "已審未發布", returned: "退回修改", rejected: "已拒絕", publishing: "發布中", "publish-failed": "已審、發布失敗", published: "已發布", unpublished: "已下架", superseded: "歷史候選" };
export const zHeroReviewView = z.object({ snapshot: zHeroSnapshot, publication: zHeroControl, decision: zHeroDecision.optional(), status: z.enum(HERO_PUBLICATION_STATUSES) }).strict();
export const zHeroListRow = z.object({ id, workId: id, accountId: id, name: z.string().max(256), status: z.enum(HERO_PUBLICATION_STATUSES), packageDigest: digest, submittedAt: z.string().datetime(), authorName: z.string().max(128).optional(), allowAttributionRemix: z.boolean().optional(), portraitPath: z.string().max(1024).optional(), target: zCommunityTarget.optional() }).strict();
export const zHeroWork = z.object({ schema: z.literal("ggd-hero-work@1"), id, ownerId: id, draftRevision: z.number().int().positive(), draftDigest: digest, draft: z.unknown(), source: zHeroSource.optional(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() }).strict();
export type HeroWork = z.infer<typeof zHeroWork>;
export type HeroSnapshot = z.infer<typeof zHeroSnapshot>;
export type HeroControl = z.infer<typeof zHeroControl>;
export type HeroReviewView = z.infer<typeof zHeroReviewView>;
export type HeroListRow = z.infer<typeof zHeroListRow>;
