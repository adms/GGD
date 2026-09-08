/** Shared with tools/model-budget/limits.ts: iPad mini A17 Pro at 30 fps, estimated. */
export const C_CHAN_MS = 2.19 / 1476;
export const DERATE = 3;
export const ANIMATION_FRAME_MS = 9;
export const CHAMPION_INSTANCES = 12;
export const CHAMPION_CHANNEL_LIMIT = Math.floor(ANIMATION_FRAME_MS / (C_CHAN_MS * DERATE) / CHAMPION_INSTANCES / 10) * 10;
export const HERO_MODEL_BUDGET = {
  tris: { warn: 16_000, limit: 28_000 },
  meshes: { warn: 3, limit: 5 },
  texEdge: { warn: 512, limit: 1024 },
  channels: { warn: Math.floor(CHAMPION_CHANNEL_LIMIT * 0.75), limit: CHAMPION_CHANNEL_LIMIT },
} as const;
