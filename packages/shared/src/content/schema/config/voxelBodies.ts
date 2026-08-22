import { z } from "zod";
import { zId } from "../common";

/**
 * config.voxel-bodies@1 — WHICH BODY EACH CHAMPION WEARS, and the ONLY place an
 * operator's answer to that question survives a deploy.
 *
 * owner, 2026-07-28:「請你都先用暴雪的 3d model，要替換成體素是我從後台設定套用
 * 才生效」.
 *
 * THE THREE-LAYER RESOLUTION, most specific first:
 *
 *   effective preferVoxelBody(champion)
 *     = overlay(config/voxel-bodies).bodies[id]                    ← 後台開關
 *    ?? seed(models/_voxel-skins.json).overrides[id].preferVoxelBody ← 手工美術指定
 *    ?? defaultPrefersVoxelBody(modelKey, id)                       ← 「有自己的模型就用」
 *
 * ⚠️ WHY THIS IS A CONFIG DOC AND NOT A FIELD IN `models/_voxel-skins.json`.
 * That file is a sidecar baked into the image. Had the console written to it,
 * every `docker compose build` would have restored the repo's copy and SILENTLY
 * DISCARDED the operator's choices — a setting that works all week and then
 * quietly reverts on the next deploy, with no error anywhere. The durable
 * overlay is the only writable surface that outlives an image, and its keys may
 * not start with `_`, so a sidecar could not be its target even in principle
 * (see `config.voxel-barcodes@1` above, which hit the same wall).
 *
 * `bodies` therefore holds ONLY what an operator explicitly toggled. Empty is
 * the shipped state and means 「全部照預設」 — which lets the console show
 * 「後台改過」 vs 「預設」 as a fact about the data rather than as a guess.
 */
export const zConfigVoxelBodiesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.voxel-bodies@1"),
    note: z.string().optional(),
    /**
     * championId -> true = 體素身體, false = 自己的 3D 模型.
     * BOTH directions are stored on purpose: an operator must be able to force a
     * Blizzard-modelled champion back onto voxel AND to force a voxel champion
     * onto whatever model it has. A one-way switch is a lever, not a setting.
     */
    bodies: z.record(zId, z.boolean()),
  })
  .strict();
export type ConfigVoxelBodiesDoc = z.infer<typeof zConfigVoxelBodiesDoc>;
