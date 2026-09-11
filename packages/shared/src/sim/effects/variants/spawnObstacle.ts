/** 【暫時障礙】（GH#1190 鄂爾 Q）—— 鏡射 `zSpawnObstacle`。 */
export interface SpawnObstacleVariant {
  kind: "spawnObstacle";
  radius: number;
  durationSec: number;
  at?: "point" | "self";
  shatterable?: boolean;
}
