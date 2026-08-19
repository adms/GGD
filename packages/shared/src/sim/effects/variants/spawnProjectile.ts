/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { ProjectileId } from "../../../ids";
import type { EffectDef } from "../effect";

export interface SpawnProjectileVariant {
  kind: "spawnProjectile";
  projectileId: ProjectileId;
  onHit: EffectDef[];
}
