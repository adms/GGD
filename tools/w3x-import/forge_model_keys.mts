/**
 * Hero Forge 範例的模型選項 —— 給 `model_intake.py` 的角色分帳用（GH#1263）。
 *
 * ⭐ 讀的是**出貨的註冊表本身**（編輯器 `CommunityHeroExamples.tsx`／`AcquiredHeroExamples.tsx`
 *   用的同一份），⛔ 不是在 python 裡用正則掃 TS 原始碼 —— 那是「掃字串代替行為」（失敗形態⑥），
 *   註冊表一換寫法它就靜默讀成空的。
 *
 * 輸出一行 JSON：`{ defaults, alternatives }`
 *   · defaults     —— 範例建出來的英雄**預設**身體（recipe.modelKey）
 *   · alternatives —— `ACQUIRED_MODEL_OPTIONS` 裡其餘可切換的選項
 */
import { ACQUIRED_MODEL_OPTIONS, COMMUNITY_ACQUIRED_HEROES } from "../../packages/shared/src/content/heroForge/communityAcquired";
import { COMMUNITY_HERO_EXAMPLES } from "../../packages/shared/src/content/heroForge/communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "../../packages/shared/src/content/heroForge/communityLolBatch2";

const recipes = [...COMMUNITY_HERO_EXAMPLES, ...COMMUNITY_LOL_BATCH2_EXAMPLES, ...COMMUNITY_ACQUIRED_HEROES];
const defaults = [...new Set(recipes.map((recipe) => recipe.modelKey).filter((key): key is string => Boolean(key)))].sort();
const alternatives = [...new Set(Object.values(ACQUIRED_MODEL_OPTIONS).flat())].filter((key) => !defaults.includes(key)).sort();
process.stdout.write(JSON.stringify({ defaults, alternatives }));
