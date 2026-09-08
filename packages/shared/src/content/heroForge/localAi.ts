import { z } from "zod";
import { zHeroProposalBatch, zProposalRequest } from "./proposal";
import { zAiMode } from "./schema";

export const LOCAL_AI_STATUS_SCHEMA = "ggd-local-ai-status@1" as const;

export const zLocalModelState = z.enum([
  "not-installed",
  "partial",
  "downloading",
  "paused",
  "verifying",
  "ready",
  "broken",
]);
export type LocalModelState = z.infer<typeof zLocalModelState>;

export const zLocalRuntimeStatus = z.object({
  schema: z.literal(LOCAL_AI_STATUS_SCHEMA),
  preference: zAiMode,
  preferenceConfigured: z.boolean(),
  desktopAvailable: z.boolean(),
  model: z.object({
    id: z.string().min(1).max(128),
    displayName: z.string().min(1).max(160),
    state: zLocalModelState,
    expectedBytes: z.number().int().positive(),
    downloadedBytes: z.number().int().nonnegative(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    errorCode: z.string().min(1).max(80).nullable(),
  }).strict(),
  inference: z.object({
    enabled: z.boolean(),
    backend: z.enum(["metal", "cuda", "vulkan", "cpu", "none"]),
    reasonCode: z.string().min(1).max(80).nullable(),
  }).strict(),
}).strict();
export type LocalRuntimeStatus = z.infer<typeof zLocalRuntimeStatus>;

export const zByokProtocol = z.enum(["auto", "responses", "chat-completions"]);
export type ByokProtocol = z.infer<typeof zByokProtocol>;

export const zByokPublicStatus = z.object({
  configured: z.boolean(),
  remembered: z.boolean(),
  baseUrl: z.string().max(2048).nullable(),
  origin: z.string().max(512).nullable(),
  protocol: zByokProtocol,
  models: z.array(z.string().min(1).max(256)).max(500),
  selectedModel: z.string().min(1).max(256).nullable(),
  modelDiscovery: z.enum(["unknown", "supported", "unsupported"]),
  structuredOutput: z.enum(["unknown", "supported", "unsupported"]),
  disclosureAccepted: z.boolean(),
  connection: z.object({
    state: z.enum(["idle", "testing", "passed", "failed"]),
    message: z.string().max(500).nullable(),
  }).strict(),
}).strict();
export type ByokPublicStatus = z.infer<typeof zByokPublicStatus>;

export const zDesktopAiStatus = zLocalRuntimeStatus.extend({ byok: zByokPublicStatus }).strict();
export type DesktopAiStatus = z.infer<typeof zDesktopAiStatus>;
// Kept as a compatibility name for the E3 renderer hook.
export const zLocalAiStatus = zDesktopAiStatus;
export type LocalAiStatus = DesktopAiStatus;

export const zLocalAiPreferenceRequest = z.object({ mode: zAiMode }).strict();
export type LocalAiPreferenceRequest = z.infer<typeof zLocalAiPreferenceRequest>;

export const zLocalModelControlRequest = z.object({
  action: z.enum(["start", "pause", "resume", "cancel", "repair", "remove"]),
}).strict();
export type LocalModelControlRequest = z.infer<typeof zLocalModelControlRequest>;

export const zByokConfigureRequest = z.object({
  baseUrl: z.string().min(1).max(2048),
  apiKey: z.string().min(1).max(8192),
  protocol: zByokProtocol,
  remember: z.boolean(),
  allowPrivateLan: z.boolean(),
}).strict();
export type ByokConfigureRequest = z.infer<typeof zByokConfigureRequest>;

export const zByokConnectionTestRequest = z.object({ confirmDisclosure: z.literal(true) }).strict();
export const zByokSelectModelRequest = z.object({ model: z.string().min(1).max(256), manual: z.boolean().default(false) }).strict();

export const zByokTextRequest = z.object({
  prompt: z.string().min(1).max(4000),
  field: z.string().min(1).max(80),
  context: z.string().max(8000),
  maxOutputTokens: z.number().int().min(16).max(512).default(256),
}).strict();
export type ByokTextRequest = z.infer<typeof zByokTextRequest>;
export const zByokTextJobRequest = zByokTextRequest.extend({ requestId: z.string().uuid() }).strict();
export const zByokCancelRequest = z.object({ requestId: z.string().uuid() }).strict();

export const zByokProposalJobRequest = z.object({
  requestId: z.string().uuid(),
  request: zProposalRequest,
}).strict();
export type ByokProposalJobRequest = z.infer<typeof zByokProposalJobRequest>;
export const zByokProposalResult = zHeroProposalBatch;
export type ByokProposalResult = z.infer<typeof zByokProposalResult>;

export const zByokTextResult = z.object({
  text: z.string().min(1).max(12000),
  model: z.string().min(1).max(256),
  protocol: z.enum(["responses", "chat-completions"]),
  usage: z.object({ inputTokens: z.number().int().nonnegative().nullable(), outputTokens: z.number().int().nonnegative().nullable() }).strict(),
}).strict();
export type ByokTextResult = z.infer<typeof zByokTextResult>;
