/**
 * 通用設定文件編輯器 —— schema 長表單、人話寫標籤 (E2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼是「通用引擎 + 每份文件一張標籤表」而不是九頁手刻表單
 * ════════════════════════════════════════════════════════════════════════════
 * `content/config/` 下有二十二份文件（2026-07-30 補了 `shield.json`），其中十一份
 * 在這支引擎出現之前完全沒有後台入口 —— 改一格要編 repo、rebuild、重啟容器。手刻
 * 九頁會重複九次同樣的骨架（讀 overlay → 疊出貨值 → 驗證 → PUT 整份），而每一次
 * 重複都是一次會 drift 的機會。
 *
 * 但**通用不是免費的**。從 Zod 自動長出來的表單天生會把 `maxPooledRings` 顯示成
 * 「Max Pooled Rings」，那不叫可調，那叫 JSON 編輯器 —— 操作者看得到欄位、看不懂
 * 它會讓遊戲發生什麼事，於是不敢動它，於是這一頁等於不存在。
 *
 * 所以這支引擎的形狀是：**結構自動、語意強制手寫**。
 *
 *   · 結構（有哪些欄位、型別、上下界、enum 選項）從 Zod schema 走出來 ——
 *     不重打一次，所以不會 drift；
 *   · 語意（中文名稱、「它影響什麼」、缺少上界時的上界）**必須**逐格手寫在
 *     {@link CONFIG_DOC_SPECS}，而 `configForms.test.ts` 斷言
 *     「schema 的每一個可編輯葉節點都有一筆標籤」且「每一筆標籤都對得上一個真的
 *     葉節點」。schema 加一個欄位而沒有人替它寫人話 → 測試紅。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三條這一頁自己踩過／看別人踩過的規則
 * ════════════════════════════════════════════════════════════════════════════
 * 1. **只掛有真消費端的文件。** 一份沒有人讀的文件配一頁後台，會造出「操作者存了
 *    值、頁面顯示已儲存、重整之後還讀得回自己填的數字，但遊戲一輩子看不到」的
 *    自我一致的謊言。`config/round-grade.json` 現在就是這個狀態
 *    （`roundGradeFromDoc` 在整個 repo 沒有任何production 呼叫端），所以它**不在**
 *    這裡。判準寫在 {@link ConfigDocSpec.consumer}：那一行要指得出一個真的
 *    會讀這份文件的函式。
 *
 * 2. **儲存一定寫「整份文件」，不是只寫被改的那幾格。** `config/gore.json` 的
 *    `championStyles` 是十位機械／不死系角色的降級表，這一頁不編輯它 —— 但如果
 *    儲存時只送 `style` / `intensity`，那十位角色會從此開始噴紅血，而畫面上完全
 *    看不出來。所有非純量分支列在 {@link ConfigDocSpec.preserved}，儲存時原封
 *    不動帶著走，`configFormsSave.test.ts` 有一條專門釘它。
 *
 * 3. **欄位要有上界，不是只有下界**（#277：50 打成 500 會過後台）。Zod 給得出
 *    上界的直接用；給不出的（`z.number().min(0)` 這種）**必須**在標籤表補一個
 *    `max`，否則 `configForms.test.ts` 的 `everyNumberHasCeiling` 紅。
 * ════════════════════════════════════════════════════════════════════════════
 * 這個檔案是**門面**（GH#626，第〇·七守則）
 * ════════════════════════════════════════════════════════════════════════════
 * 2026-08-27 之前它是 **5,783 行**，而它同時中了第〇·七守則的兩個觸發器：
 * 行數 ≥4,000（考慮拆）＋ 撞車率 16.7%（每條 lane 加一份設定都要動它）。
 *
 * ⛔ 但它**不是**被「切成兩半」—— 病是**多職責**，所以按職責拆成三層：
 *
 *   · `configForms/engine.ts`      —— 結構自動的那一半（Zod 走訪、上下界、解析、套用）
 *   · `configForms/specs/*.ts`     —— 語意手寫的那一半（56 份標籤資料表，按主題分組）
 *   · **這個檔**                    —— 有序註冊表 `CONFIG_DOC_SPECS` ＋ 門面 re-export
 *
 * ⭐ **門面保住既有 import 端**：全 repo 20+ 個消費端（`configDocCoverage.ts`、
 * `ui/ConfigDocPage.tsx`、十幾支測試）一行都不用改 —— `export *` 把引擎原樣送出去。
 *
 * ⭐ **忘了掛上去會有東西紅，而那條閘從「出貨的東西」推導**（⛔ 不掃資料夾 ——
 * 那正是 `config.ts` 9,162→68 檔那次漏掉 `castApproachDoc` 的形狀）：
 * `configDocCoverage.test.ts` 掃的是 **`content/config/*.json` 出貨檔本身**，
 * 每一份都必須要嘛在 `CONFIG_DOC_SPECS` 裡、要嘛在明示的豁免表上。
 * 新開一個 `specs/*.ts` 卻沒有把它的 spec 加進下面的陣列 ⇒ 那份 JSON 變成沒有入口
 * ⇒ 那條守衛紅並**指名**它。（另外 `navPagesRender.test.ts` 從同一個陣列推導導覽列。）
 *
 * ⚠️ 剩下的**唯一**共用行仍然是下面陣列裡的那一列 —— 那是刻意的：這個陣列的**順序**
 * 就是後台導覽列的順序，而順序是一個決定，⛔ 不可以由資料夾掃描產生（那會讓它跟著
 * 檔名的字母序漂）。⇒ 這是「一行接線」病裡**不該**自動推導的那一種。
 *
 */

export * from "./configForms/engine";
import type { ConfigDocSpec } from "./configForms/engine";
import { MODEL_LOD_SPEC, VFX_CLEANUP_SPEC, WEATHER_SPEC, WORLD_CUES_SPEC } from "./configForms/specs/render";
import { AP_DAMAGE_SCALING_SPEC, BLOCK_SPEC, COOLDOWN_RULES_SPEC, CRIT_SPEC, DAMAGE_RULES_SPEC, FEEL_FX_SPEC, GORE_SPEC, SHIELD_SPEC, WEAKNESS_SPEC, WOUNDS_SPEC } from "./configForms/specs/combat";
import { AUTHORING_RULES_SPEC, CAST_TIME_SPEC, CONTENT_LOAD_SPEC, NEW_HERO_CHECKS_SPEC } from "./configForms/specs/authoring";
import { AOE_TIERS_SPEC, COOLDOWN_TIERS_SPEC, DAMAGE_TIERS_SPEC, MANA_ECONOMY_SPEC, MANA_TIERS_SPEC, MOVE_SPEED_TIERS_SPEC, RANGE_TIERS_SPEC, SKILL_NORMALIZE_SPEC, SPEED_GROWTH_TIERS_SPEC } from "./configForms/specs/tiers";
import { AUGMENT_FILTER_SPEC, BERSERK_SPEC, DISPEL_SPEC, STAT_NORMALIZATION_SPEC, STEALTH_SPEC, TAUNT_SPEC } from "./configForms/specs/stats";
import { ARENA_FIRE_SPEC, BODY_SCALE_SPEC, BOSS_INTRO_SPEC, DAMAGE_COLORS_SPEC, REGEN_SPEC, REPLAY_SPEC, VICTORY_FX_SPEC, VICTORY_PODIUM_SPEC } from "./configForms/specs/visuals";
import { ITEM_CARD_SPEC } from "./configForms/specs/itemCard";
import { CAMERA_SPEC, MAP_SPEC_SPEC, MITIGATION_SPEC } from "./configForms/specs/arena";
import { AUDIO_MIX_SPEC, GAMEPAD_SPEC, ICON_STYLE_SPEC, PRACTICE_SPEC, RANKING_SPEC } from "./configForms/specs/ops";
import { DISPLACEMENT_TIERS_SPEC, RANGE_GUIDE_SPEC, TOGGLE_ABILITY_SPEC, UI_LEXICON_SPEC } from "./configForms/specs/ui";
import { ARENA_RULES_SPEC } from "./configForms/specs/arenaRules";
import { ADMIN_FRIEND_SPEC, CAST_APPROACH_SPEC, LOBBY_RALLY_SPEC, UI_CUES_SPEC } from "./configForms/specs/lobby";

export const CONFIG_DOC_SPECS: readonly ConfigDocSpec[] = [
  // 競技場規則（GH#410）。⚠️ 這一列同時做了兩件事：①把八個一直調不到的區塊變成
  // 真的欄位；②讓 `configForms.test.ts` 的「每一個葉節點都有標籤」**開始管**
  // 這一份文件 —— 在此之前 arena-rules 走的是 configDocCoverage 的文件層豁免，
  // 而文件層豁免一旦成立，欄位層就沒有任何守衛在數（那才是共同根因）。
  // ⇒ `configDocCoverage.ts` 的 arena-rules OWN_PAGE 那一列要**同時刪掉**，
  //   否則「同時在註冊表與豁免表上」會被 `verdict.duplicated` 抓到。
  ARENA_RULES_SPEC,
  MAP_SPEC_SPEC,
  CAMERA_SPEC,
  MITIGATION_SPEC,
  // 混音（owner 2026-08-17）。⚠️ 這一列要跟三件事一起才到得了操作者手上：
  // store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、App.tsx 的導覽列與路由、
  // 以及 `content/config/audio-mix.json` 出貨檔（三者都不在這條 lane 手上）。
  AUDIO_MIX_SPEC,
  // 練習模式（GH#343，owner 2026-08-17）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列要跟
  // store.ts 的 `Page` union / App.tsx 的導覽列一起才到得了操作者手上，那兩個檔
  // 不在這條 lane 手上（見 needsFromIntegrator）。
  PRACTICE_SPEC,
  // 手把手感（GH#520，owner 2026-08-22）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列要跟
  // store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、App.tsx 的導覽列一列，
  // 以及 `content/config/gamepad.json` 出貨檔一起，才到得了操作者手上
  // （少了出貨檔 `configForms.test.ts` 直接紅 —— 它對每一個 spec 都 readFileSync 那份 JSON）。
  GAMEPAD_SPEC,
  // 大廳集合令（GH#492，owner 2026-08-21）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列要
  // 跟 store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、App.tsx 的導覽列一列，
  // 以及 `content/config/lobby-rally.json` 出貨檔一起，才到得了操作者手上。
  LOBBY_RALLY_SPEC,
  // 管理員預設好友（GH#499，owner 2026-08-21）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列
  // 要跟 store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、App.tsx 的導覽列一列，
  // 以及 `content/config/admin-friend.json` 出貨檔一起，才到得了操作者手上。
  ADMIN_FRIEND_SPEC,
  // 排名獎勵（owner 2026-08-17）。⚠️ 同 AUDIO_MIX_SPEC 那一段的三件事，外加一件
  // 這一頁獨有的：它的消費端是 **Go**（`internal/ranking/standingsoverride.go`），
  // 所以「後台存了、Go 端讀不到」不會有任何 TypeScript 測試看得見 ——
  // 對得起來的那條守衛在 `packages/shared/src/content/rankingShipped.test.ts`。
  RANKING_SPEC,
  // 圖示畫風（owner 2026-08-17）。⚠️ 同上：這一列要跟 store.ts 的 `Page` union /
  // App.tsx 的導覽列一起才到得了操作者手上，那兩個檔不在這條 lane 手上。
  ICON_STYLE_SPEC,
  DISPLACEMENT_TIERS_SPEC,
  MODEL_LOD_SPEC,
  VFX_CLEANUP_SPEC,
  // 爽度特效（GH#494，owner 2026-08-21）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列要跟
  // store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、以及 App.tsx 的導覽列一列
  // 一起，才到得了操作者手上；那兩個檔不在這條 lane 手上（#491/#492/#493 正在動）。
  // ⭐ 出貨檔 `content/config/feel-fx.json` 已經在這條 lane 裡了 —— 少了它
  // `configForms.test.ts` 會直接紅（它對每一個 spec 都 readFileSync 那份 JSON）。
  FEEL_FX_SPEC,
  GORE_SPEC,
  DAMAGE_COLORS_SPEC,
  // 範圍指引與預告（GH#376）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列要跟 store.ts 的
  // `Page` union / `SESSION_REQUIRED_PAGES` 與 App.tsx 的導覽列一起，才到得了
  // 操作者手上；而且要跟 `apps/client/src/content/ContentDb.ts` 的
  // `applyRangeGuideDoc(...)` 那一行一起，才到得了**地板上**。
  RANGE_GUIDE_SPEC,
  // 開關型技能外觀（GH#546，owner 2026-08-22）。⚠️ 這一列的四個前置條件寫在
  // TOGGLE_ABILITY_SPEC 上面 —— 其中 ① `ContentDb.load()` 的 applyToggleAbilityDoc
  // 那一行是**功能性的**（少了它這一頁存了不生效），另外三個是「操作者點不點得到」。
  TOGGLE_ABILITY_SPEC,
  SHIELD_SPEC,
  BLOCK_SPEC,
  CRIT_SPEC,
  BERSERK_SPEC,
  DISPEL_SPEC,
  CONTENT_LOAD_SPEC,
  AUTHORING_RULES_SPEC,
  // 新英雄檢查警示（GH#480）。⚠️ 這一列要跟三件事一起才到得了操作者手上：
  // store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、App.tsx 的導覽列一列、
  // 以及 `content/config/new-hero-checks.json` 出貨檔（少了它 configForms.test.ts
  // 直接紅 —— 它對每一個 spec 都 readFileSync 那份 JSON）。
  NEW_HERO_CHECKS_SPEC,
  COOLDOWN_RULES_SPEC,
  CAST_TIME_SPEC,
  AOE_TIERS_SPEC,
  RANGE_TIERS_SPEC,
  COOLDOWN_TIERS_SPEC,
  DAMAGE_TIERS_SPEC,
  // 耗魔五級距（2026-08-21）—— 五軸的最後一軸。⚠️ 少了這一列，`ability@1` 上
  // 新開的 `manaCostTier` 就是一格**後台調不到**的參數（第一守則）。
  MANA_TIERS_SPEC,
  // 速度成長五級距（2026-08-21）。⚠️ 少了這一列，`champion@1` 上新開的
  // `msGrowthTier` / `asGrowthTier` 就是兩格**後台調不到**的參數（第一守則），
  // 而它們決定 49 位英雄跑多快、打多快隨等級怎麼變。
  SPEED_GROWTH_TIERS_SPEC,
  // 移速**加成**五級距（GH#789，owner 2026-08-27）。⚠️ 同 AUDIO_MIX_SPEC 那一段：
  // 這一列要跟 store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、App.tsx 的
  // 導覽列一列、以及 `content/config/move-speed-tiers.json` 出貨檔一起，
  // 才到得了操作者手上（本票四件一起落）。
  MOVE_SPEED_TIERS_SPEC,
  // 技能正規化決策點（2026-08-21）—— owner「決策點一律做成後台開關」的落地。
  SKILL_NORMALIZE_SPEC,
  MANA_ECONOMY_SPEC,
  UI_LEXICON_SPEC,
  STAT_NORMALIZATION_SPEC,
  WOUNDS_SPEC,
  WEAKNESS_SPEC,
  DAMAGE_RULES_SPEC,
  AP_DAMAGE_SCALING_SPEC,
  AUGMENT_FILTER_SPEC,
  STEALTH_SPEC,
  TAUNT_SPEC,
  ARENA_FIRE_SPEC,
  VICTORY_FX_SPEC,
  VICTORY_PODIUM_SPEC,
  BODY_SCALE_SPEC,
  REGEN_SPEC,
  BOSS_INTRO_SPEC,
  ITEM_CARD_SPEC,
  REPLAY_SPEC,
  CAST_APPROACH_SPEC,
  // 畫面提示（GH#576 / GH#573，owner 2026-08-23 三則 [優先]）。⚠️ 這一列要跟三件事
  // 一起才到得了操作者手上：store.ts 的 `Page` union + `SESSION_REQUIRED_PAGES`、
  // App.tsx 的導覽列一列、以及 `content/config/ui-cues.json` 出貨檔。
  UI_CUES_SPEC,
  // 世界演出（2026-08-23 稽核）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列要跟 store.ts 的
  // `Page` union + `SESSION_REQUIRED_PAGES`、App.tsx 的導覽列一列，以及
  // `content/config/world-cues.json` 出貨檔一起，才到得了操作者手上
  // （少了出貨檔 `configForms.test.ts` 直接紅 —— 它對每一個 spec 都 readFileSync 那份 JSON）。
  WORLD_CUES_SPEC,
  // 場地天氣（GH#610 第二批，owner 2026-08-23「do it, 但有開關」）。⚠️ 同
  // AUDIO_MIX_SPEC 那一段：這一列要跟 store.ts 的 `Page` union +
  // `SESSION_REQUIRED_PAGES`、App.tsx 的導覽列一列，以及 `content/config/weather.json`
  // 出貨檔一起，才到得了操作者手上（少了出貨檔 `configForms.test.ts` 直接紅）。
  WEATHER_SPEC,
];

export function specForPage(page: string): ConfigDocSpec | null {
  return CONFIG_DOC_SPECS.find((s) => s.page === page) ?? null;
}
