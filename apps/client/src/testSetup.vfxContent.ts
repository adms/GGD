/**
 * VITEST SETUP —— 把出貨的 `config.vfx-ability-art@1` 灌進註冊表（GH#384）。
 *
 * ⭐ 為什麼是 setup 而不是每個測試各自載入：逐技能的特效綁定在 GH#384 之前是三張
 * **模組層級的常數表**，`import` 就有；搬進 `content/` 之後它要有人交進來。線上交
 * 它的是 `ContentDb.load()`，而測試沒有 ContentDb —— 少了這一行，12 個既有測試會
 * 一起看到空的綁定，而它們紅的訊息會說「特效沒綁上」，⛔ 不是「內容沒載入」。
 *
 * ⛔ 這一支**不是**「ContentDb 有沒有接線」的替身：那條由
 * `abilityArtWiredIntoContentDb.test.ts` 顧，它讀的是 ContentDb 自己。
 */
import { loadAbilityArtFromDisk } from "./render/vfx/loadAbilityArtFromDisk";

loadAbilityArtFromDisk();
