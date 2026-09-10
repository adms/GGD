import { z } from "zod";
import { zClipMap } from "../schema/model";
import { MODEL_UPLOAD_LIMITS } from "./glb";

export const HERO_MODEL_STATES = ["idle", "run", "attack", "cast", "hurt", "death"] as const;
export type HeroModelState = typeof HERO_MODEL_STATES[number];
export type HeroModelSelections = Record<HeroModelState, number>;
export const HERO_MODEL_STATE_LABELS: Record<HeroModelState, string> = { idle: "待機", run: "移動", attack: "普攻", cast: "施法", hurt: "受傷", death: "死亡" };
export const zUploadedHeroModel = z.object({
  schema: z.literal("ggd-uploaded-hero-model@1"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(MODEL_UPLOAD_LIMITS.fileBytes),
  clipMap: zClipMap,
  yawOffsetDeg: z.number().finite().min(-360).max(360),
}).strict();
export type UploadedHeroModel = z.infer<typeof zUploadedHeroModel>;

export function uploadedHeroModelPath(model: UploadedHeroModel): string { return `assets/models/community/${model.sha256}.glb`; }
