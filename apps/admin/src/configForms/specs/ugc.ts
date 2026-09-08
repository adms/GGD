/**
 * 設定文件的**標籤資料**（玩家自製內容 UGC 的提交閘）—— GH#991。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  // ⭐ UGC 提交閘（GH#991）—— 走 barrel（`schema/config/index.ts` 有 re-export），
  //    ⛔ 不走深路徑：深路徑那條沒有守衛在看，遲早會指到搬走的檔案。
  zConfigUgcDoc,
} from "@ggd/shared/content";
import type { ConfigDocSpec } from "../engine";

import { derivedFields } from "../schemaToForm";
// ── 🧑‍🎨 玩家自製內容（config/ugc）—— GH#991 ────────────────────────────────
export const UGC_SPEC: ConfigDocSpec<"ugc"> = {
  page: "ugc",
  collection: "config",
  docId: "ugc",
  schemaTag: "config.ugc@1",
  zod: zConfigUgcDoc,
  title: "玩家自製內容（UGC）",
  intro: [
    "owner 2026-09-05：「**開放讓玩家自己設計 英雄、技能、特效**，不是靠 AI 無止境的逼近太沒效率」。這一頁管的是**那條路開不開、開多大**，⛔ 不管內容長什麼樣。",
    "完整英雄使用本頁的總開關、待審額度、每日新候選數與 ZIP 大小上限；同時需要內容展示設定中的投稿開關。編輯器會讀取目前生效的政策。",
    "完整英雄一律要求登入、驗證擁有者、重新編譯完整 ZIP，並由管理員審查發布；本頁的匿名與自動上架選項不會放寬這條流程。關閉投稿不影響既有發布版，也不阻止作者撤回待審稿。",
    "英雄每日額度在 UTC 00:00 重置；撤回、退回與替換仍計入當日新候選數，相同候選重試不重複計數。待審計數沿用既有投稿材料與英雄目前候選；歷史英雄版本不佔待審名額。一般單份素材投稿仍使用原有的投稿機制與上限。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ugc.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
    "⭐ 判斷「可以打開了嗎」⛔ 不要靠感覺：`packages/shared/src/ops/ugcGateIsArmed.test.ts` 會在提交端點出現而沒綁齊身分＋這一頁的開關時**紅並逐條列出缺什麼**。",
  ],
  consumer:
    "packages/shared/src/content/schema/config/ugc.ts 的 `resolveUgc()`（唯一知道這幾格怎麼作用的地方）。⭐ **逐格的執行期呼叫點**：`publishMode` → `apps/game-server/src/config/contentHotApply.ts` 的 `publishMode()`（由 `contentBus.ts` 的 `content-overlay` refresher 呼叫，GH#1025）· `communityRoomOnly` → `apps/game-server/src/curation/communityContent.ts` 的 `communityRoomOnly()`，由 `apps/game-server/src/rooms/MatchRoom.ts` 的 `buildMatch` 在**開房那一刻**讀（GH#1025 Scope C）· `digestRecompute` → `apps/platform/internal/server/playercontent.go` 的 `ugcDigestRecompute()`（GH#1022）· `enabled` → `apps/platform/internal/server/playercontent.go` 的 `ugcSubmissionPolicy()`，由 `submissions` 的 `POST /api/v1/submissions` 讀（GH#991）· `maxPendingPerPlayer` / `quotaPerPlayerPerDay` / `maxBytes` → 同一支政策讀法，由 `apps/platform/internal/submissions/submissions.go` 的 `Submit()` 執行 · ⚠️ `requireAuth` **今天沒有獨立的呼叫端**：那條路線本來就掛在 `auth.Middleware` 後面（匿名根本進不來），⭐ 所以它今天是一格**宣告**——關掉它不會讓匿名投稿變成可能。 ⭐ **完整英雄那一路（PR 1118）**：`apps/platform/internal/server/hero_policy.go` 每次讀取本頁的覆蓋層或出貨文件，`apps/platform/internal/submissions/hero_intake.go` 執行大小、待審與每日額度。",
  effect:
    "**下一次讀取設定就生效**。⭐ `publishMode` 在**下一次平台公告 content-overlay** 時生效（⛔ 這一台 shard 不必重啟）；⭐ `communityRoomOnly` 在**下一次開房**時生效（⛔ 已經在打的那一場不會變 —— 內容池與白名單一樣是開房那一刻的快照）；`digestRecompute` 與四格投稿限制每一次投稿都重讀。⛔ 都不必重新部署。 ⭐ **完整英雄**在下一次請求與提交前重讀政策；後台保存即生效,⛔ 不必重啟。無法驗證政策時**停止收件**,既有原稿保留。",
  fields: derivedFields(zConfigUgcDoc, []),
  // 六格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};
