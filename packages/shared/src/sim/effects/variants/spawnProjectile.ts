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
  /** GH#1187 鄂爾 R：`rangeEnd` = 射程盡頭生成、朝施法者飛回。缺 = caster */
  launchFrom?: "caster" | "rangeEnd";
  /** GH#1187【撞擊改向】改向後命中跑的那一串 —— 語意住 `zSpawnProjectile.onRedirectHit`；執行期 `sim/projectileRedirect.ts`。 */
  onRedirectHit?: EffectDef[];
}
