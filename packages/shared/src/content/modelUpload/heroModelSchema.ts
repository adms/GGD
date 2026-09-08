import { z } from "zod";
import { zClipMap } from "../schema/model";
import { MODEL_UPLOAD_LIMITS } from "./glb";

// ⭐ 2026-09-08（合併 PR 1118）—— 這一行原本是**手抄的第六個住處**：
//   `["idle","run","attack","cast","hurt","death"]`。⛔ 抄一份的代價是「加第七格狀態時
//   漏改它**不會有 tsc 紅**」，而 `animPulseSingleHome.test.ts` 就是為此存在的閘。
//   ⇒ 改成引用唯一的那一份（`voxel/clips.ts` 的 `CLIP_STATES`，經 `content/animPulse` 轉出）。
export { ANIM_STATES as HERO_MODEL_STATES, type AnimState as HeroModelState } from "../animPulse";
import { type AnimState } from "../animPulse";
export type HeroModelSelections = Record<AnimState, number>;
export const HERO_MODEL_STATE_LABELS: Record<AnimState, string> = { idle: "待機", run: "移動", attack: "普攻", cast: "施法", hurt: "受傷", death: "死亡" };
export const zUploadedHeroModel = z.object({
  schema: z.literal("ggd-uploaded-hero-model@1"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(MODEL_UPLOAD_LIMITS.fileBytes),
  clipMap: zClipMap,
  yawOffsetDeg: z.number().finite().min(-360).max(360),
}).strict();
export type UploadedHeroModel = z.infer<typeof zUploadedHeroModel>;

export function uploadedHeroModelPath(model: UploadedHeroModel): string { return `assets/models/community/${model.sha256}.glb`; }
