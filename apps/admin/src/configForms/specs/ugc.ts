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
    "⭐ 流程：玩家在編輯器做出 JSON → 提交（格式沿用既有的 `ggd-ai-authoring-operation@1`，`author: \"player:<id>\"`，⛔ 不是第二種格式）→ **機器閘**（嚴格 Zod／空效果宣稱／出生就看不見的特效）→ **人審**（批次審查頁一頁打勾）→ 上架到 `content/ugc/`。",
    "⛔⛔ **這條路今天是關著的，而那是刻意的。** 落地的只有這一頁（開關本身）—— 身分檢查、逐份機器閘、配額計數**一個都還沒有**。⇒ 打開總開關等於開一條**沒有任何守衛的公開寫入路**。⭐ 判斷「可以打開了嗎」不要靠感覺：`packages/shared/src/ops/ugcGateIsArmed.test.ts` 會在提交端點出現而沒綁齊身分＋這一頁的開關時**紅並逐條列出缺什麼**。",
    "⚠️ ⭐ 關掉總開關**不會**動到任何已經上架的 UGC 內容 —— 那要清白名單，是另一個動作。這一格答的是「還收不收新的」，⛔ 不是「已經在的還算不算數」。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ugc.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/schema/config/ugc.ts 的 `resolveUgc()`（唯一知道這六格怎麼作用的地方）← ⚠️ ⭐ **今天零個執行期呼叫端** —— 提交端點還沒做（GH#991 第二批）。⇒ 這一頁現在是**規格**，而 `ugcGateIsArmed.test.ts` 是它會不會被繞過去的閘。",
  effect:
    "**下一次讀取設定就生效**（提交端點做好之後，它每一次請求都重讀，⛔ 不快取）。⛔ 不必重新部署、⛔ 不必重啟。",
  fields: derivedFields(zConfigUgcDoc, []),
  // 六格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};
