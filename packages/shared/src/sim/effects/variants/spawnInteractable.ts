import type { EffectDef } from "../effect";

/** 【互動物】（GH#1189 瑟雷西 W 燈籠）—— 鏡射 `zSpawnInteractable`。 */
export interface SpawnInteractableVariant {
  kind: "spawnInteractable";
  radius: number;
  durationSec: number;
  maxUses?: number;
  at?: "point" | "self";
  onAccept: EffectDef[];
}
