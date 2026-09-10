import type { EffectDef } from "../effect";

/** 【邊界陣】（GH#1197 瑟雷西 R）—— 鏡射 `zSpawnThresholds`。 */
export interface SpawnThresholdsVariant {
  kind: "spawnThresholds";
  sides: 3 | 4 | 5 | 6 | 8;
  radius: number;
  durationSec: number;
  onCross: EffectDef[];
}
