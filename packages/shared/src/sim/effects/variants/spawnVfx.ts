/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */

/**
 * spawnVfx — the WC3 "dummy effect unit" idiom (化繁為簡): a Locust/invuln
 * unit that only carries a MODEL and expires is NOT gameplay, it's a one-shot
 * visual at a position. Emits a `vfxSpawn` sim event carrying a vfx@1 doc id
 * and a world point; the client's VfxSystem plays the doc there. Purely
 * cosmetic — mutates no world state, keeps the sim deterministic.
 *
 * ⭐ GH#649/#565 —— `at:"bone"` + `attach`：一次性特效掛在**施法者模型的
 * 骨頭**上（原作 285 次 timed 掛件的形狀）。sim 只送字串與座標；
 * 骨頭解析（WC3 fallback 鏈、替身退回胸口）全在客戶端。
 */
export interface SpawnVfxVariant {
  kind: "spawnVfx";
  vfxId: string;
  at?: "self" | "target" | "point" | "bone";
  /** WC3 掛點字串（chest / hand,right / weapon / …）；只有 `at:"bone"` 讀它。 */
  attach?: string;
  durationSec?: number;
}
