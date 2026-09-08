import { derivedFields, schemaToForm, specFromZod } from "../schemaToForm";
/**
 * 設定文件的**標籤資料**（爽度特效・血腥・護盾/格擋/暴擊・傷害規則・傷口/虛弱・冷卻規則）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigControllerSchemeDoc,
  zConfigOneShotClampDoc,
  zConfigGoreDoc,
  // 爽度特效（GH#494）—— 金幣吸回 · 連段音階 · 施法餘燼壽命。
  zConfigFeelFxDoc,
  zConfigBlockDoc,
  zConfigCritDoc,
  zConfigCooldownRulesDoc,
  zConfigWoundsDoc,
  zConfigWeaknessDoc,
  zConfigDamageRulesDoc,
  zConfigApDamageScalingDoc,
  zConfigShieldDoc,
} from "@ggd/shared/content";
// ⛔ AP 傷害加成的出貨值與上界也只有一份 —— 這一頁的每一個乘數例子都從它算，
// ⛔ 不抄字面值（owner 調 rate 的那一天，說明會自己跟著變）。
import {
  AP_DAMAGE_RATE_MAX,
  DEFAULT_AP_DAMAGE_SCALING,
} from "@ggd/shared/sim/combat/apDamageScaling";
import type { ConfigDocSpec } from "../engine";
// ───────────────────────────────────────────── 爽度特效 (config/feel-fx) ───

export const FEEL_FX_SPEC: ConfigDocSpec<"feelFx"> = {
  page: "feelFx",
  collection: "config",
  docId: "feel-fx",
  schemaTag: "config.feel-fx@1",
  zod: zConfigFeelFxDoc,
  title: "爽度特效",
  intro: [
    "殭屍死掉之後掉出來的那一枚小金幣：躺在屍體上停一下，然後沿著一條會加速的弧線飛回擊殺者身上，落袋時「叮」一聲；連續擊殺時那一聲會逐段升高音階（到頂就停住，不會刺耳）。owner 的原話是「提高爽度 模仿肉鴿遊戲的氛圍感」。",
    "⛔ 這一頁沒有一格會改變任何人拿到的金幣。擊殺賞金是伺服器發的，早在金幣畫出來之前就已經進了口袋；這裡調的只是「那一刻看得到、聽得到什麼」。把總開關關掉，玩家拿到的錢一毛不差，只是不畫也不響。",
    "最後一區是施法光柱腳邊那圈往上飄的餘燼 —— owner 2026-08-21：「特效存活時間真的太長了，請你砍半，不需要後半段飄到天空」。三格要一起看：只砍壽命會讓粒子在半空中被剪掉（看起來像破圖），所以上升的力道與阻力也要讓它在壽命結束之前自己停住。",
    "蓄力集氣（GH#788）—— owner 2026-08-27：「所有吟唱時間超過0.3秒以上都要有蓄力特效（粒子特效從外往身體內縮多道小光束像集氣一樣如圖但顏色是隊伍顏色光芒）」。吟唱夠長的每一次施放，多道細光束從四周向施法者身體內縮，顏色是那位施法者的隊色（從連線資料的隊伍編號解析，不分敵我陣營寫死）。它與施法光柱疊在一起但職責不同：光柱說「還有多久」，集氣說「正在蓄力」。",
  ],
  consumer:
    "apps/client/src/vfx/feelFx.ts 的 feelFx() → GoldPickupFx（掉落/停留/貝茲飛行/落袋音效）與 castPillar.ts 的 moteSpec()（施法上升餘燼）；castCharge 由 apps/client/src/vfx/CastChargeFx.ts 的 readCastCharge() 讀（施法窗口的集氣光束）",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時載內容覆蓋層）。⛔ 不必重開一場，但已經在飛的金幣會用它出發時的那一份設定飛完。",
  fields: derivedFields(zConfigFeelFxDoc, []),
  preserved: [],
};

// ──────────────────────────────────────────────────── 濺血 (config/gore) ───

export const GORE_SPEC: ConfigDocSpec<"gore"> = {
  page: "gore",
  collection: "config",
  docId: "gore",
  schemaTag: "config.gore@1",
  zod: zConfigGoreDoc,
  title: "濺血程度",
  intro: [
    "名單上皮卡丘、初音跟死亡騎士、鋼彈站在一起，所以「打中會噴多少血」是調性決定而不是技術決定 —— 家裡有人在旁邊看的時候，這一頁是那個開關。",
    "玩家自己的畫面設定是一道**地板**：這裡設 blood，玩家仍然可以自己選 stylized 或 off；反過來，玩家選了 off 之後這一頁**加不回去**。",
  ],
  consumer: "apps/client/src/vfx/goreConfig.ts 的 applyGoreDoc()（由 ContentDb.load 呼叫）→ goreConfig() → 濺血特效層",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。",
  fields: derivedFields(zConfigGoreDoc, []),
  preserved: [
    {
      path: "championStyles",
      why: "逐英雄的**降級**表（機械／不死／植物系的十位角色改噴火花或能量，不噴紅血）。這一頁不編輯它，但每次儲存都原封不動帶著走 —— 掉了的話那十位角色會從此開始噴紅血，而畫面上完全看不出來。",
    },
  ],
};

// ─────────────────────────────────────────────── 護盾規則 (config/shield) ──

export const SHIELD_SPEC: ConfigDocSpec<"shieldRules"> = specFromZod(zConfigShieldDoc, "shieldRules");


// ─────────────────────────────────────────────── 格擋規則 (config/block) ──

export const BLOCK_SPEC: ConfigDocSpec<"blockRules"> = {
  page: "blockRules",
  collection: "config",
  docId: "block",
  schemaTag: "config.block@1",
  zod: zConfigBlockDoc,
  title: "格擋規則",
  intro: [
    "同一個角色身上同時有兩件以上帶 [格擋] 的傳說武器時，它們怎麼疊。場上真的湊得出來：晨曦之光與殺豬刀都在傳說池裡、都不是唯一裝備，兩件都寫著「30%機率 抵擋致命一擊」。",
    "owner 2026-07-31 的裁決是「這種情形應該是**獨立判斷兩次**，拿第一次檔掉剩餘繼續算下一次」，所以出貨值是 independent —— 兩件 30% 合起來是 51%（1 − 0.7 × 0.7），不是 30%。",
    "⚠️ 這一頁**會改變平衡**，和 護盾規則 那一頁不同（那一頁的出貨值刻意等於改成欄位之前的行為）。舊行為保留成 best，切回去就是「只有最強的那一件會擋，整發只抽一次」。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/block.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/combat/block.ts 的 blockCutFor()（每一發傷害封包都會呼叫，讀 world.blockRules.stacking）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.blockRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 護盾規則／基礎加成 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: derivedFields(zConfigBlockDoc, []),
  preserved: [],
};

// ───────────────────────────────────────────────── 暴擊規則 (config/crit) ──

export const CRIT_SPEC: ConfigDocSpec<"critRules"> = {
  page: "critRules",
  collection: "config",
  docId: "crit",
  schemaTag: "config.crit@1",
  zod: zConfigCritDoc,
  title: "暴擊規則",
  intro: [
    "一次攻擊上同時有**好幾條**暴擊時，它們怎麼合起來算。來源有兩種：英雄自己的暴擊率（屬性面板那一格），加上每一件裝備／每一張三選一卡片各自帶的暴擊（例：天堂之劍「6%機率造成10倍暴擊傷害」）。",
    "owner 2026-08-09 的裁決是「**每一條暴擊獨立算完傷害再帶入下一條**」，他自己舉的例子是：同時拿到「1%機率100倍」與「10%機率2倍」，會有三種結果 —— 兩條都中 100×2＝200 倍、只中第一條 100 倍、只中第二條 2 倍。所以出貨值是 multiply。",
    "⚠️ 這一頁**會改變平衡**，和 護盾規則 那一頁不同（那一頁的出貨值刻意等於改成欄位之前的行為）。舊行為保留成 max，切回去就是「只有期望值最高的那一條會算，整發只抽一次骰」—— 那個世界裡玩家的第二張暴擊卡是廢牌，撿到它畫面上什麼都不會變。",
    "⚠️ 改成獨立骰之後，一次攻擊抽幾次亂數變成「這個人身上有幾條暴擊」的函式，所以**同一顆種子的舊錄影會對不上**（owner 已接受：錄影只在同一個版本內有效）。「最多算幾條」那一格給了它一個上界，所以次數不是無限的。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/crit.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/combat/critStrike.ts 的 rollCritStrike()（每一次普攻的傷害點都會呼叫一次，近戰在 systems/BasicAttackSystem.ts、遠程同一處算好之後塞進投射物，讀 world.critRules）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.critRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／護盾規則／基礎加成 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: derivedFields(zConfigCritDoc, []),
  preserved: [],
};

export const DAMAGE_RULES_SPEC: ConfigDocSpec<"damageRules"> = {
  page: "damageRules",
  collection: "config",
  docId: "damage-rules",
  schemaTag: "config.damage-rules@1",
  zod: zConfigDamageRulesDoc,
  title: "傷害規則",
  intro: [
    "一份傷害效果**沒有寫**傷害型別時，遊戲要當它是哪一種。owner 2026-08-05：「技能傷害預設都改成 AP 傷害」。",
    "⚠️ **在這之前沒有預設** —— 傷害型別是必填的，忘了寫會在載入時被擋下來。現在忘了寫會**安靜地變成魔法傷害**，所以這一頁存在的意義就是讓那個「安靜」變成看得到、改得到的一格。",
    "⚠️ 這一格**只影響沒寫的那些**。已經明寫型別的技能（出貨的絕大多數都寫了）一支都不會被改到，所以在這裡改成物理不會把全樹翻過來。",
    "⚠️ 它**不是**「技能吃 AP 加成」。傷害型別決定吃護甲還是魔抗；數字多大是每個效果自己的係數（力量/敏捷/智慧/AD/AP）決定的，兩者互不影響 —— 一支「數字吃 AP、打出去是物理」的技能完全合法。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/damage-rules.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/effects/damage.ts（以及 damageArea.ts / damageLine.ts / dot.ts，共五個 `e.damageType ?? world.damageRules.defaultAbilityDamageType` 讀取點）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.damageRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／重創規則／格擋規則 同一個形態(#278)。",
  fields: derivedFields(zConfigDamageRulesDoc, []),
  preserved: [],
};

export const AP_DAMAGE_SCALING_SPEC: ConfigDocSpec<"apDamageScaling"> = {
  page: "apDamageScaling",
  collection: "config",
  docId: "ap-damage-scaling",
  schemaTag: "config.ap-damage-scaling@1",
  zod: zConfigApDamageScalingDoc,
  title: "AP 傷害加成",
  intro: [
    "⭐ **這是調整「技能 vs 普攻」全域關係的唯一旋鈕。** owner 2026-08-21：「技能傷害都套用公式 (1+AP\\*1%)⋯物理意義來說 就是 **AP 變為原本傷害的額外加成**」「**=> 預設 0.5%**」。",
    `⭐ 公式是 **最終傷害 = 基礎傷害 × (1 + 法強 × 加成率)**。出貨 ${DEFAULT_AP_DAMAGE_SCALING.rate}（${+(DEFAULT_AP_DAMAGE_SCALING.rate * 100).toFixed(4)}%/點）⇒ 法強 100 的人技能打 **×${+(1 + 100 * DEFAULT_AP_DAMAGE_SCALING.rate).toFixed(3)}**、法強 200 打 **×${+(1 + 200 * DEFAULT_AP_DAMAGE_SCALING.rate).toFixed(3)}**、法強 300 打 **×${+(1 + 300 * DEFAULT_AP_DAMAGE_SCALING.rate).toFixed(3)}**。`,
    "⚠️ **動這一格等於同時動每一支技能。** 它掛在傷害佇列上（減傷之前、與全域傷害倍率同一層），⛔ 不是某一支技能的數值 —— 每一支技能、技能投射物、技能種下的持續傷害都走這一行。",
    "⭐ **加成率填 0 = 這一層整個不存在**（乘數恆為 1），也就是**一鍵 rollback** 回到這個欄位出現之前的每一場比賽。這是這一頁最重要的一句話：不確定就填 0，不會有任何殘留。",
    "⚠️ 它與「傷害規則」是兩件事：那一頁決定技能傷害**吃護甲還是魔抗**，這一頁決定**乘多少**。",
    "⚠️ **反彈不吃這一層**（不論範圍填什麼）—— 反彈的量是「剛剛打中我的那一下」的百分比，那個讀數已經吃過攻擊者的乘數；反彈者再乘一次自己的，反彈比例就不等於卡面寫的百分比了。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ap-damage-scaling.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/combat/apDamageScaling.ts::apDamageMult（唯一讀取點，由 combat/damage.ts 的傷害佇列排空迴圈每發封包呼叫一次）與 ::apRatiosSuppressed（effects/effectCommon.ts::casterDamageStats，五個傷害葉共用）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.apDamageScaling",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 傷害規則／重創規則／格擋規則 同一個形態(#278)。",
  fields: derivedFields(zConfigApDamageScalingDoc, [
  ]),
  preserved: [],
};

export const WOUNDS_SPEC: ConfigDocSpec<"woundRules"> = specFromZod(zConfigWoundsDoc, "woundRules");

export const WEAKNESS_SPEC: ConfigDocSpec<"weaknessRules"> = {
  page: "weaknessRules",
  collection: "config",
  docId: "weakness",
  schemaTag: "config.weakness@1",
  zod: zConfigWeaknessDoc,
  title: "虛弱規則",
  intro: [
    "【虛弱】= 攻擊速度減半 + **造成的傷害**減半（owner 2026-08-09：「虛弱 => 攻擊速度暫時減半、AP/AD 造成傷害暫時減半」）。",
    "⚠️ 「造成的傷害」不等於「AD/AP 屬性」：這一頁砍的是他**打出去的每一發**，所以連「固定 300 點」那種不吃屬性的技能也一起減半。砍屬性的寫法對固定值一點作用都沒有。",
    "⚠️ 屬性面板**不會**顯示 AD/AP 掉一半 —— 它們真的沒掉。虛弱是掛在身上的減益，該出現的地方是狀態列不是屬性表。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/weakness.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/weakness.ts::weaknessMult（兩個讀取點各呼叫一次：systems/BasicAttackSystem.ts 的攻速、combat/damage.ts 的出手傷害）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.weaknessRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／重創規則／格擋規則 同一個形態(#278)。",
  fields: derivedFields(zConfigWeaknessDoc, []),
  // 這一頁三格純量,沒有任何不編輯的分支要原封帶走。
  preserved: [],
};

export const COOLDOWN_RULES_SPEC: ConfigDocSpec<"cooldownRules"> = {
  page: "cooldownRules",
  collection: "config",
  docId: "cooldown-rules",
  schemaTag: "config.cooldown-rules@1",
  zod: zConfigCooldownRulesDoc,
  title: "冷卻規則",
  intro: [
    "冷卻能縮到多短。owner 2026-08-10：「cdr 天花板可以是 0.99（99%減免），但要卡最低秒數 0.1 秒」。",
    "⭐ **那是兩個旋鈕，住在兩頁**：比率天花板在「屬性上限」頁的 `cdr`（現在 0.99），秒數地板在這一頁。兩個一起才蓋得住整個值域 —— 比率上限對短冷卻的技能沒用（一支 1 秒的技能在 99% 減免下是 0.01 秒，等於每個 tick 都放得出來），秒數地板對長冷卻的技能沒用（120 秒的 EX 永遠碰不到 0.1）。",
    "算式是：`基礎冷卻[等級] × (1 − 冷卻縮減) × 全域冷卻倍率 × 暴走倍率`，**然後**才夾這個地板。地板放在最後一步，否則「全域冷卻 ×2」會把已經觸底的技能推回地板之上，讀起來像 bug。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cooldown-rules.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/cooldownRules.ts 的 applyCooldownFloor（唯一知道地板怎麼作用的地方）← abilities/abilitySystem.ts 每一次付冷卻成本時呼叫；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.cooldownRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／格擋規則／暴走規則 同一個形態(#278)。",
  fields: derivedFields(zConfigCooldownRulesDoc, []),
  // 三格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};


// ── 手把操作版本（config/controller-scheme）—— GH#863 ────────────────────────
export const CONTROLLER_SCHEME_SPEC: ConfigDocSpec<"controllerScheme"> = specFromZod(zConfigControllerSchemeDoc, "controllerScheme");

// ──────────────────── 一擊必殺夾限 (config/one-shot-clamp) ─

/**
 * ⭐⭐ GH#928 —— owner 2026-09-02 逐字：「我們來檢討傷害排行榜上的技能傷害」
 * （他貼了線上榜單前 100）。
 */
export const ONE_SHOT_CLAMP_SPEC: ConfigDocSpec<"oneShotClamp"> = {
  page: "oneShotClamp",
  collection: "config",
  docId: "one-shot-clamp",
  schemaTag: "config.one-shot-clamp@1",
  zod: zConfigOneShotClampDoc,
  title: "一擊必殺夾限",
  intro: [
    "⭐ 一次技能最多能打掉一名英雄**幾成最大生命** —— ⭐ 出貨**開著**（owner 2026-09-06 逐字「先做 A 但我想深入了解 B」，A ＝ 翻開這一格，GH#1017）。",
    "⛔⛔ 量到的（owner 2026-09-02 貼的榜單前 100，⛔ 不是估計）：**12 列**打掉單一英雄超過 **100% 最大生命**，最高 **401%**（48-04 騎英之疆繩）· 301%（39-03 蛟龍）· 187%（44-04 心臟麻痺）；**17/100** 標著「☠ 一擊」。",
    "⭐⭐ 根因是**五級距只管加法項**：`傷害 = 小級距(500) + 0.8 × AP`，而五級距是從**純基礎**血量反推的 —— ⭐ 那個空間裡 AP ＝ **0**，⛔ 而榜上 100 列沒有一列在那個空間裡。⇒ 級距回答的是「零裝備時要打幾發」，而玩家從商店開門起就不在那個世界。",
    "⚠️ ⭐ 這一頁**不改公式、不夾 AP、不動任何技能的數值** —— 它只是在傷害的**最後一步**把單次傷害壓住，讓「一擊必殺」變成一個關得掉的東西。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/one-shot-clamp.json`**。",
  ],
  consumer: "packages/shared/src/sim/combat/damage.ts 的 `mitigate()` 之後、護盾之前（全專案唯一的夾點）",
  effect: "**要重啟 game-server shard 才生效**（`Configs` 是 boot 時載入的，同 combatFeel #863）。",
  fields: derivedFields(zConfigOneShotClampDoc, []),
  preserved: [],
};
