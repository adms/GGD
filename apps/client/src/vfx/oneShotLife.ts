/**
 * 一次性特效的粒子壽命天花板 —— 執行期的「現在生效值」(#205 時間軸 / owner
 * 2026-07-30 裁決 (a))。
 *
 * ---------------------------------------------------------------------------
 * 為什麼這是一個模組而不是 `VfxSystem` 裡的一個常數
 * ---------------------------------------------------------------------------
 * 它以前是 `VfxSystem.ts` 的 `export const ONE_SHOT_MAX_LIFE_SEC = 0.6`。改一次
 * 就要 rebuild client 映像(client 是 **build 時**烘進去的,只有 `content/` 是
 * live bind-mount),而 owner 要的「先蓄力光柱 → 再爆炸 → **再留一圈餘燼**」的
 * 餘燼長度正是他會反覆改的那種數字。
 *
 * ⚠️ 夾子本身**沒有被拿掉**,只是變成可調的。它當初存在是有理由的:匯入的 WC3
 * 文件壽命跑 1–6 秒,照播會讓每一次施法在畫面上留一團化不開的霧。預設值仍然是
 * 0.6,所以沒有人動後台的話,升級前後一位元不差。
 *
 * ---------------------------------------------------------------------------
 * 為什麼不放在 `VfxSystem.ts` 裡
 * ---------------------------------------------------------------------------
 * 安裝它的是 `ContentDb.load()`(和 `setMaxAbilityVfxLayers` / `setFamilyTuning`
 * 同一條路,同一份 `config.vfx-families@1`)。`VfxSystem.ts` 會拉進整個 Babylon
 * 粒子子系統,讓 `ContentDb` 為了一個數字 import 它是把開機成本壓在錯的地方。
 * 這個檔案是純的:沒有 Babylon,沒有 scene。
 */
import {
  clampOneShotMaxLifeSec,
  DEFAULT_ONE_SHOT_MAX_LIFE_SEC,
} from "@ggd/shared/content/schema/vfx";

export { DEFAULT_ONE_SHOT_MAX_LIFE_SEC };

let activeMaxLifeSec: number | undefined;

/**
 * 裝上(或清掉)後台的壽命天花板。傳 `undefined` = 回到出貨預設。
 *
 * 由 `ContentDb.load()` 呼叫,所以後台存檔 → 下一次載入內容就生效。
 */
export function setOneShotMaxLifeSec(v: number | undefined): void {
  activeMaxLifeSec = v;
}

/** 現在生效的天花板(後台的值,沒有就是出貨預設;界外的值被夾回範圍內)。 */
export function oneShotMaxLifeSec(): number {
  return clampOneShotMaxLifeSec(activeMaxLifeSec);
}
