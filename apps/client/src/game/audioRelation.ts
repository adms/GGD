/**
 * 👣 腳步聲的敵我關係（從 GameApp 抽出 —— `gameAppSplit.test.ts` 的 4,000 行線）。
 * ⭐ 與 `VfxSystem.relationOf` 同一個判準來源（`teamOfEntity` 注入），⛔ 不是第二份。
 */
import type { SfxRelation } from "../audio/spatial";

export function footstepRelationOf(
  id: number,
  localId: number | null,
  teamOf: (entityId: number) => number | null,
): SfxRelation {
  if (localId === null) return "third";
  if (id === localId) return "self";
  const mine = teamOf(localId);
  const theirs = teamOf(id);
  if (mine === null || theirs === null) return "third";
  return mine === theirs ? "ally" : "enemy";
}
