/**
 * 🔥 GH#703 —— 「冷快取第一次施放 0 頂點」的預熱名單。
 *
 * 病：`spawnModelFx` 的 glb 是**第一次用到才載**（`modelFxRig.ensureContainer`），
 * 而一段短命演出（0.1–2 秒）會死在 389KB 下載完成之前 ⇒ 回填（GH#673-①c）
 * 醒來時場上已經沒有活著的實例 —— **玩家第一次看到這支技能時模型不存在**，
 * 之後每一次都好好的（失敗形態②的變形：熱快取全綠，冷快取零像素）。
 *
 * 藥：進場時把**出貨內容真的會用到的** modelKey 先餵給 rig。
 * ⭐ 名單從**已註冊的技能**推導（`Abilities` 是模板展開之後的形狀 ——
 * 模板預設的 `modelKey` 也在裡面），⛔ 不是手寫清單（手寫的會過期而且不會紅）。
 * 走整棵 def 樹：`hooks` / `perStrike` / `finisher` / `onTouch` / `finalEffects`
 * 這些巢狀容器逐年在長，逐格點名必漏（GH#607 手挑欄位的同一個病）。
 */
import { Abilities } from "../sim/content/registry";

/** 深走一棵 def 樹，收所有 `spawnModelFx` 節點的 `modelKey`。 */
export function collectSpawnModelFxKeys(roots: readonly unknown[]): string[] {
  const keys = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    if (rec["kind"] === "spawnModelFx" && typeof rec["modelKey"] === "string") {
      keys.add(rec["modelKey"]);
    }
    for (const v of Object.values(rec)) walk(v);
  };
  for (const r of roots) walk(r);
  return [...keys].sort();
}

/** 出貨（已註冊）技能會用到的每一顆 modelKey。空註冊表（骨架開機）＝空名單。 */
export function spawnModelFxKeysInUse(): string[] {
  return collectSpawnModelFxKeys(Abilities.all());
}
