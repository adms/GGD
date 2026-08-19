/**
 * TESTKIT —— 讓一支測試檔拿到出貨的逐技能特效綁定（GH#384）。
 *
 * ⚠️ 為什麼每一支需要的測試都要**明寫這一行**，⛔ 而不是只靠 vitest setup：
 * `packages/shared` **沒有自己的 vitest 設定**，它往上撿的是 repo 根那一份 ——
 * 所以把 client 專用的 `setupFiles` 寫進根設定會讓整個 shared 測試套件去載入
 * client 的原始碼（實測：29 個檔一起紅在「找不到 setup 檔」）。
 * `apps/client/vite.config.ts` 那一份仍然有 setup（`pnpm --filter @ggd/client test`
 * 走它），這一行補的是**從 repo 根跑單檔**那條路（CLAUDE.md 第零守則④ 的迭代迴圈）。
 *
 * 冪等：重複 import 只會載入一次（模組快取），重複呼叫也只是再讀一次同一份檔。
 */
import { loadAbilityArtFromDisk } from "./loadAbilityArtFromDisk";
import { abilityArtRows } from "./abilityArtContent";

if (Object.keys(abilityArtRows()).length === 0) loadAbilityArtFromDisk();
