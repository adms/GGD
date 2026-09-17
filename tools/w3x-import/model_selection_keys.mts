/**
 * 玩家與作者「挑得到哪幾顆身體」—— 給 `model_intake.py` 的角色分帳用（GH#1263）。
 *
 * ⭐ 讀的是**出貨的規則本身**，⛔ 不是在 python 裡重寫一份（第〇·四：值只有一個住處）：
 *   · Hero Forge 範例 —— 編輯器 `CommunityHeroExamples.tsx`／`AcquiredHeroExamples.tsx` 用的同一份註冊表
 *     （⛔ 不用正則掃 TS 原始碼：那是「掃字串代替行為」，失敗形態⑥，註冊表一換寫法就靜默讀成空的）
 *   · 可挑的英雄身體 —— 編輯器目錄（`apps/editor/src/hero/catalog.ts`）與匯入共用的 `heroBodyModelIds()`
 *     ⚠️ 2026-09-15 更正：f52ca71eb 在 python 裡另寫了 `heroBody is True and not bodyVersion`，
 *     那是同一條規則的第二個住處，TS 那邊一改兩邊就各自漂。
 *     （本檔在 f52ca71eb 叫 `forge_model_keys.mts`，多了 heroBodies 之後改名）
 *
 * 用法：`node --import tsx tools/w3x-import/model_selection_keys.mts <content 目錄>`
 * 輸出一行 JSON：`{ defaults, alternatives, heroBodies }`
 *   · defaults     —— 範例建出來的英雄**預設**身體（recipe.modelKey）
 *   · alternatives —— `ACQUIRED_MODEL_OPTIONS` 裡其餘可切換的選項
 *   · heroBodies   —— `heroBodyModelIds()` 對這棵內容樹的答案（鍵的形狀同編輯器目錄：`models/<id>`）
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { heroBodyModelIds } from "../../packages/shared/src/content/heroForge/bodyModels";
import { ACQUIRED_MODEL_OPTIONS, COMMUNITY_ACQUIRED_HEROES } from "../../packages/shared/src/content/heroForge/communityAcquired";
import { COMMUNITY_HERO_EXAMPLES } from "../../packages/shared/src/content/heroForge/communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "../../packages/shared/src/content/heroForge/communityLolBatch2";

const content = process.argv[2];
if (!content) throw new Error("要給 content 目錄（⛔ 不猜預設值：讀錯樹與讀到空樹長得一樣）");
const recipes = [...COMMUNITY_HERO_EXAMPLES, ...COMMUNITY_LOL_BATCH2_EXAMPLES, ...COMMUNITY_ACQUIRED_HEROES];
const defaults = [...new Set(recipes.map((recipe) => recipe.modelKey).filter((key): key is string => Boolean(key)))].sort();
const alternatives = [...new Set(Object.values(ACQUIRED_MODEL_OPTIONS).flat())].filter((key) => !defaults.includes(key)).sort();
const documents: Array<readonly [string, unknown]> = [];
for (const collection of ["champions", "models"]) {
  for (const name of readdirSync(join(content, collection)).sort()) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(content, collection, name), "utf8")) as { id?: unknown };
    documents.push([`${collection}/${typeof doc.id === "string" ? doc.id : name.slice(0, -5)}`, doc]);
  }
}
process.stdout.write(JSON.stringify({ defaults, alternatives, heroBodies: heroBodyModelIds(documents) }));
