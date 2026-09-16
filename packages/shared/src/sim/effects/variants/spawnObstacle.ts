/** 【暫時障礙】（GH#1190 鄂爾 Q）—— 鏡射 `zSpawnObstacle`。 */
export interface SpawnObstacleVariant {
  kind: "spawnObstacle";
  radius: number;
  durationSec: number;
  at?: "point" | "self";
  /** 沿施放方向前推幾格（同 `spawnModelFx.offsetForwardU`）。缺 = 0 */
  offsetForwardU?: number;
  shatterable?: boolean;
}
