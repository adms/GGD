/**
 * 🧹 GH#819 —— **重新盤點**：這一場現在要用的資產路徑（純函式，從 GameApp 抽出）。
 *
 * 兩族：①技能特效模型（`spawnModelFx` 名單從已註冊技能推導，⛔ 不是手寫清單 ——
 * 同 GH#703 的預熱）標 `"fx"`；②場上英雄**實際採用**的 glb 標 `"shared"`
 * （永不 purge —— 它們的來源材質正掛在活著的實例上）。
 *
 * ⭐ 後寫 —— 同一個路徑兩族都要（名字巧合）時，**shared 贏**：寧可永不 purge，
 * ⛔ 不可誤殺一個活著的英雄模型的來源。
 *
 * ⚠️ 住 `game/`（⛔ 不是塞回 GameApp）—— `gameAppSplit.test.ts` 的 4,000 行線
 * （第〇·七守則）就是為這種「每個功能都往 GameApp 加一段」的走勢立的。
 */
export type RoundAssetTag = "fx" | "shared";

export function buildRoundInventory(
  fxKeys: Iterable<string>,
  glbPathForKey: (key: string) => string | null | undefined,
  adoptedGlbPaths: Iterable<string>,
  out: Map<string, RoundAssetTag>,
): string[] {
  out.clear();
  for (const key of fxKeys) {
    const p = glbPathForKey(key);
    if (p) out.set(p, "fx");
  }
  for (const p of adoptedGlbPaths) out.set(p, "shared");
  return [...out.keys()];
}
