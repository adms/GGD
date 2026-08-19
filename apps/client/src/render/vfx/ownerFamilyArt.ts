/**
 * ⭐ OWNER 的設計覆寫層（GH#431）—— 第〇·六守則的**第 1 層**，讀取端。
 *
 * ⚠️ 這一支存在的理由是一個**結構缺口**，⛔ 不是一個新旋鈕。整條家族綁定鏈
 * （`MODEL_USAGE.json` → {@link ./deriveW3xFamilyArt} → `w3xFamilyArt.test.ts`
 * 的反捏造守衛）的設計前提是「原作說什麼就是什麼」，於是 **owner 的設計決定
 * 沒有地方可以住**。量到的那一支就是他點名的：
 *
 *   owner 2026-08-19：「立起來的光柱也有其他技能會用到 **例如飛鼠天譴**」
 *
 * 飛鼠天譴（`godie-udea.r` = 65-04 天譴）的證據是 `shockwaveRing`
 * （`thunderclapcaster` / `A04C`）⇒ 玩家看到的是青色**貼地衝擊環**。而在這一格
 * 出現之前，三個看起來可寫的點沒有一個承載得了那個決定：
 *
 * | 想寫在哪 | 為什麼不行 |
 * |---|---|
 * | `bindings.<id>.family` | 反捏造守衛從 `MODEL_USAGE.json` 重新推導 ⇒ 手改一列就紅 |
 * | `config.vfx-families@1.abilities[]` | `generateFamilyContent` 擁有那一列的 `family` 格 ⇒ 下一次產生就洗掉 |
 * | `bindings.<id>.prim` | family 贏 prim ⇒ 改了不會顯示（**死改動**） |
 *
 * ⭐ 所以覆寫是**同一列的第四格**（`bindings.<id>.owner`），⛔ 不是改寫證據那一格。
 * 兩個後果都是刻意的：
 *   · 被取代的原作值**原封留在隔壁**（知識不可以無聲消失）
 *   · 反捏造守衛**一格都不必放寬** —— 它比對的仍然是 `family` 那一格
 *
 * ⛔ **這裡一筆逐 id 的資料都沒有**，和 `bindings.ts` / `w3xFamilyArt.ts` /
 * `w3xAbilityArt.ts` 同一條規矩：覆寫表是**內容**，它住在
 * `content/config/vfx-ability-art.json`。守衛 `artTablesLiveInContent.test.ts`
 * 把這個檔也掃進去了 —— ⚠️ GH#431 原本的提案是「產生器加一張
 * `OWNER_FAMILY_OVERRIDES` 表」，而那張表寫在 TS 裡就是 GH#384 的**第四張常數表**。
 *
 * PURE。⛔ 沒有 `@babylonjs/*`、沒有檔案讀取 —— 資料從 `abilityArtContent` 那一道
 * 唯一的縫進來（`ContentDb.load()` 或 `loadAbilityArtFromDisk()`）。
 */
import type { VfxOwnerBinding } from "@ggd/shared/content";
import { abilityArtRows, onAbilityArtBindingsChanged } from "./abilityArtContent";

export type { VfxOwnerBinding };

let cached: Readonly<Record<string, VfxOwnerBinding>> | null = null;
onAbilityArtBindingsChanged(() => {
  cached = null;
});

/** 技能 id → owner 的設計覆寫。⛔ 唯讀，內容還沒載入時是空的。 */
export function ownerFamilyArtRows(): Readonly<Record<string, VfxOwnerBinding>> {
  if (cached) return cached;
  const out: Record<string, VfxOwnerBinding> = {};
  for (const [abilityId, row] of Object.entries(abilityArtRows())) {
    if (row.owner) out[abilityId] = row.owner;
  }
  cached = out;
  return out;
}

/** 這一支技能的覆寫，或 undefined（＝照原作證據走）。 */
export function ownerFamilyArtFor(abilityId: string | undefined): VfxOwnerBinding | undefined {
  return abilityId ? ownerFamilyArtRows()[abilityId] : undefined;
}
