/**
 * 設定文件的**標籤資料**（屬性正規化・驅散/狂暴/增益過濾・潛行/嘲諷）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigBerserkDoc,
  zConfigDispelDoc,
  zConfigStatNormalizationDoc,
  zConfigAugmentFilterDoc,
  zConfigStealthDoc,
  zConfigTauntDoc,
} from "@ggd/shared/content";
// ⚠️ 同上的深路徑理由：這兩份 Zod 住自己的檔案（欄位理由長、且 sim 直接吃）。
import { DEFAULT_STAT_NORMALIZATION } from "@ggd/shared/content/statNormalization";
import {
  BALANCE_ANCHOR_LEVELS,
  HARD_ANCHOR_LEVEL,
} from "@ggd/shared/content/balanceAnchors";
import type { ConfigDocSpec, ConfigFieldLabel } from "../engine";
/**
 * ⭐【正規化那 209 個葉節點：K 個模板 + 一張表，⛔ 不是 209 列手寫標籤】
 *
 * `config.stat-normalization@1` 的形狀是**完全規則**的四族：
 *   · `bands.<屬性>.<級距>`      10 × 5  = 50
 *   · `byArchetype.<屬性>.<定位>` 10 × 4  = 40
 *   · `byOrigin.<屬性>.<出身>`    10 × 10 = 100
 *   · `channel.<屬性>`            10
 *
 * 2026-08-13 的平衡批把屬性從 3 條擴到 10 條、又加了 `byOrigin` 整族，
 * 而標籤表停在 27 列 ⇒ `configForms.test.ts` 紅，**177 格在後台沒有中文標籤**
 *（畫不出來或顯示原始鍵名）。第一守則的三個住處缺了第三個。
 *
 * ⛔ 補法不是貼 177 列。第零守則⑨：「N 個同型項目 = K 個模板 + 一張表」——
 *    這裡是**三張詞彙表 + 一個產生器**，下一次再加一條屬性或一個出身，
 *    標籤自動長出來，⛔ 不需要有人記得回來補。
 *
 * ⭐ 手寫的那些**不會被蓋掉**：`generatedNormalizationFields()` 只補
 *    「還沒有人寫過的 path」。帶著 owner 裁決理由的註解（坦克吃裝甲不吃魔抗、
 *    移速為什麼只能走初始值⋯）全部原樣保留 —— 那才是人寫的價值所在。
 */
const NORM_STAT_ZH: Record<string, string> = {
  ms: "移速",
  mr: "魔抗",
  armor: "裝甲",
  maxHealth: "生命上限",
  maxMana: "魔力上限",
  ad: "攻擊力",
  ap: "法術強度",
  as: "攻速",
  healthRegen: "生命回復",
  manaRegen: "魔力回復",
  // ⭐ 2026-08-16 第 11 項。⚠️ 它的**真正**階梯是雙份的（近戰/遠程各一把，
  //   見 `bandsByScale`）—— 這一頁列出來的 `bands.range.*` 是「英雄卡沒填
  //   attackType」時的退路，出貨填近戰那把。
  range: "攻擊距離",
};
const NORM_BANDS = ["極小", "小", "中", "大", "極大"] as const;
const NORM_ARCHETYPE_ZH: Record<string, string> = {
  tank: "坦克",
  fighter: "近戰",
  marksman: "遠程",
  mage: "法師",
};
/** 級距下拉的選項標籤 —— 五格都要有，⛔ 少一個 `configForms.test.ts` 就紅。 */
const NORM_BAND_OPTIONS: Record<string, string> = Object.fromEntries(
  NORM_BANDS.map((b) => [b, b]),
);
const NORM_CHANNEL_OPTIONS = { baseStats: "初始值", growth: "每級成長" };

/** 選角出身（`byOrigin` 的第二層鍵）—— 出貨十種。 */
const NORM_ORIGINS = [
  "坦克", "砲手", "鬥士", "射手", "法鬥", "法師", "狂戰", "硬輔", "法刺", "軟輔",
] as const;

/**
 * 把四族的每一格補齊，跳過 `written` 裡已經有人手寫的 path。
 *
 * ⚠️ 詞彙表是**宣告的**（上面四個常數），⛔ 不是從檔案讀的 —— 這支模組進 client
 * bundle，不能碰 fs。閘在 `configForms.test.ts`：它拿 **Zod schema 的葉節點**
 * 對照這裡產出的 path，schema 多一條屬性而詞彙表沒跟上就**當場紅**並指名那一格。
 * ⇒ 詞彙表過期不會靜默，這正是「第四個住處」與「有閘的第三個住處」的差別。
 */
function generatedNormalizationFields(written: ReadonlySet<string>): ConfigFieldLabel[] {
  const out: ConfigFieldLabel[] = [];
  const zh = (k: string): string => NORM_STAT_ZH[k] ?? k;
  const push = (f: ConfigFieldLabel): void => {
    if (!written.has(f.path)) out.push(f);
  };
  for (const stat of Object.keys(NORM_STAT_ZH)) {
    for (const band of NORM_BANDS) {
      push({
        path: `bands.${stat}.${band}`,
        zh: `${zh(stat)} · ${band}`,
        note: `${zh(stat)} 落在「${band}」這一格時的數值。⚠️ 它是**基準等級**（見「成長通道的基準等級」）的最終總值，不是初始值。`,
      });
    }
    for (const [role, roleZh] of Object.entries(NORM_ARCHETYPE_ZH)) {
      push({
        path: `byArchetype.${stat}.${role}`,
        zh: `${roleZh} → ${zh(stat)}哪一格`,
        note: `決定「${roleZh}」這個定位的英雄，${zh(stat)} 要落在哪一格級距 —— 改它會同時影響**每一位**判定為這個定位的英雄，不是單一個案。`,
        optionLabels: NORM_BAND_OPTIONS,
      });
    }
    for (const origin of NORM_ORIGINS) {
      push({
        path: `byOrigin.${stat}.${origin}`,
        zh: `${origin} → ${zh(stat)}哪一格`,
        note: `選角出身「${origin}」的 ${zh(stat)} 落在哪一格級距。⚠️ 出身比定位**更細** —— 同一個定位的兩位英雄可以走不同出身。`,
        optionLabels: NORM_BAND_OPTIONS,
      });
    }
    push({
      path: `channel.${stat}`,
      zh: `${zh(stat)}寫進哪個通道`,
      note: "「初始值」= 等級 1 就看得出差別；「每級成長」= 差異隨等級拉開，⚠️ 選人畫面上等級 1 看起來會一樣。",
      optionLabels: NORM_CHANNEL_OPTIONS,
    });
  }
  // ⭐ 雙階梯的那幾項（2026-08-16，今天只有攻擊距離）。
  // ⚠️ **從出貨設定推導有哪幾項**，⛔ 不寫死 "range" —— 這一頁與引擎必須對同一份
  //   清單說話，寫死一次就是一份會過期的鏡射。
  for (const stat of Object.keys(DEFAULT_STAT_NORMALIZATION.bandsByScale)) {
    for (const [type, typeZh] of [
      ["melee", "近戰"],
      ["ranged", "遠程"],
    ] as const) {
      for (const band of NORM_BANDS) {
        push({
          path: `bandsByScale.${stat}.${type}.${band}`,
          zh: `${zh(stat)} · ${typeZh} · ${band}`,
          note:
            `走「${typeZh}尺」的英雄，${zh(stat)} 落在「${band}」這一格時的數值。` +
            `⭐ ${zh(stat)}是**唯一分兩把尺**的屬性：它的分佈是雙峰的（實測近戰中位 1.6、` +
            `遠程中位 8.2，跨度 5.1×），⚠️ 而近戰/遠程是**量級不是級別**，` +
            `所以出身給的級距意思是「以你這把尺而言算遠還算近」——近戰的「大」不會把他變成遠程。` +
            `⚠️ 走哪一把尺由下面的「⋯走哪一把尺」那幾格決定，⛔ 不是英雄卡上的攻擊型別。`,
        });
      }
    }
  }
  // ⭐ 出身 → 走哪一把尺（2026-08-16）。同樣**從出貨設定推導**，⛔ 不寫死 "range"。
  for (const stat of Object.keys(DEFAULT_STAT_NORMALIZATION.scaleByOrigin)) {
    for (const origin of NORM_ORIGINS) {
      push({
        path: `scaleByOrigin.${stat}.${origin}`,
        zh: `${origin} → ${zh(stat)}走哪一把尺`,
        note:
          `出身「${origin}」的 ${zh(stat)} 要用近戰那把尺還是遠程那把尺量。` +
          `搭配上面的「${origin} → ${zh(stat)}哪一格」，兩格合起來才是絕對值` +
          `（例：砲手 = 遠程 × 極大 = 12；法刺 = 近戰 × 小 = 1.4）。` +
          `🔴 ⚠️ 這一格**刻意不看英雄卡上的攻擊型別** —— owner 2026-08-16 那張 49 位的表裡` +
          `有 10 位兩者相反（妙蛙種子是近戰攻擊但要 8.2 的距離、皮卡娘是遠程攻擊但只要 1.4），` +
          `攻擊型別管的是「投射物還是近身揮擊」，這一格管的是「構多遠」。` +
          `⛔ 改錯會讓整個出身的射程差 5 倍，而且畫面上不會有任何錯誤訊息。`,
        optionLabels: { melee: "近戰尺（1.2~2.0）", ranged: "遠程尺（6~12）" },
      });
    }
  }
  return out;
}

/** 手寫的那些 —— 帶著 owner 裁決理由，⛔ 產生器不會蓋掉它們。 */
const NORM_HAND_WRITTEN: ConfigFieldLabel[] = [
    {
      path: "mode",
      zh: "模式（normalized / legacy）",
      note: "`normalized` 是出貨預設，英雄的移速與魔抗由角色定位決定。`legacy` 是**回滾用的逃生口** —— 扳過去就回到英雄卡上的原值，**不需要部署**（舊數值一直留在英雄卡裡沒有被銷毀）。",
      optionLabels: { normalized: "正規化（出貨預設）", legacy: "舊數值（回滾用）" },
    },
    { path: "bands.ms.小", zh: "移速 · 小（慢）", note: "坦克與法師落在這一格。錨點是 74 位母體的中位數 5.8，小 = 中 ÷ 1.25。" },
    { path: "bands.ms.中", zh: "移速 · 中", note: "遠程角色落在這一格。這個數字是**量出來的**（74 位母體的中位數），不是挑的。" },
    { path: "bands.ms.大", zh: "移速 · 大（快）", note: "近戰角色落在這一格。大 = 中 × 1.25。⚠️ in-game 還要再乘攻擊型別倍率（近戰 ×0.8 / 遠程 ×0.6）。" },
    { path: "bands.mr.小", zh: "魔抗 · 小（弱）", note: "遠程與法師落在這一格 —— owner：「魔抗則是遠距離及法師弱」。⚠️ in-game 還要再乘 ×0.2（`magicResistMult`）。" },
    { path: "bands.mr.中", zh: "魔抗 · 中", note: "近戰角色落在這一格。這個數字是量出來的（母體中位數 38.8）。" },
    { path: "bands.mr.大", zh: "魔抗 · 大（高）", note: "坦克落在這一格 —— owner：「坦克高」。大 = 中 × 1.25。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.ms.tank", zh: "坦克 → 移速哪一格", note: "owner：「近距離攻擊移動速度應該是快，**但坦克是中或慢**」。出貨取「小（慢）」—— 改成「中」就是另一種讀法，這一格就是給你改的。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.ms.fighter", zh: "近戰 → 移速哪一格", note: "owner：「近距離攻擊 移動速度應該是**快**」。出貨「大」。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.ms.marksman", zh: "遠程 → 移速哪一格", note: "owner：「遠距離攻擊 移動速度應該是**中**」。出貨「中」。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.ms.mage", zh: "法師 → 移速哪一格", note: "owner：「技能傷害為主的法師⋯移動速度應該是中或慢，**但慢的為主**」。出貨「小」。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.mr.tank", zh: "坦克 → 魔抗哪一格", note: "⚠️ **2026-08-12 整組反轉**。owner 原本說「坦克高」，但那和「智慧→魔抗」的推導打架。他的新裁決是「**我們引入防禦/裝甲來平衡這個現象**」→ 坦克改吃**裝甲**，魔抗讓給法師。出貨「小」。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.mr.fighter", zh: "近戰 → 魔抗哪一格", note: "owner：「近距離**中**」。出貨「中」—— 近戰要貼身，但不該像坦克一樣無視魔法傷害。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.mr.marksman", zh: "遠程 → 魔抗哪一格", note: "owner：「遠距離⋯**弱**」。出貨「小」—— 遠程靠距離活命，不是靠抗性。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.mr.mage", zh: "法師 → 魔抗哪一格", note: "⭐ 出貨「大」。法師的智慧最高，而智慧本來就推導魔抗 —— 這一格讓**引擎本來就在做的事變成對的**，不再需要對抗它。坦克那一邊改由裝甲負責。" },

    { path: "bands.armor.小", zh: "裝甲 · 小（薄）", note: "法師與遠程落在這一格。⚠️ 這是**等級 18 的最終總值**（裝甲走成長通道），不是初始值。小 = 中 ÷ 1.25。" },
    { path: "bands.armor.中", zh: "裝甲 · 中", note: "近戰落在這一格。錨點 = 73 位可達英雄在等級 18 的**中位數**（量出來的），所以改制前後全場的防禦總量不變，只是重新分配。" },
    { path: "bands.armor.大", zh: "裝甲 · 大", note: "坦克落在這一格。大 = 中 × 1.25。⚠️ 這一格是坦克唯一的硬度來源 —— 裝甲由**敏捷**推導，而坦克是力量主，自然裝甲全場最低（改制前坦克排第三）。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.armor.tank", zh: "坦克 → 裝甲哪一格", note: "owner 2026-08-12：坦克**大**。這一格是整次改制的重點 —— 它取代了原本「坦克魔抗高」的角色。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.armor.fighter", zh: "近戰 → 裝甲哪一格", note: "owner：近戰**中**。⚠️ 改制前近戰的裝甲其實是全場第一（敏捷主），這一格會把它拉回中間。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.armor.marksman", zh: "遠程 → 裝甲哪一格", note: "owner：遠程**小**。⚠️ 改制前遠程的裝甲排全場第二（敏捷主），這一格把它拉到最低 —— 遠程靠站位活命，被貼上就該死。" },
    { optionLabels: NORM_BAND_OPTIONS, path: "byArchetype.armor.mage", zh: "法師 → 裝甲哪一格", note: "owner：法師**小**。法師拿魔抗不拿裝甲 —— 這一格與「法師 → 魔抗＝大」是同一個設計的兩半，一起改才有意義。" },

    { optionLabels: { baseStats: "初始值", growth: "每級成長" }, path: "channel.ms", zh: "移速寫進哪個通道", note: "⛔ 出貨「初始值」，而這**不是偏好，是量出來的機制限制**：成長只能往上推不能往下拉，而移速沒有三圍來源可以在反解時被減掉。實測改成「每級成長」會讓坦克 15/16 位、法師 18/18 位被夾在 0，排序變成坦克第二。" },
    { optionLabels: { baseStats: "初始值", growth: "每級成長" }, path: "channel.mr", zh: "魔抗寫進哪個通道", note: "出貨「每級成長」。owner：「**初始的屬性是用來補正角色個性化差異，成長是定位導向**」。⚠️ 走成長的代價是**等級 1 看不出差別** —— 選人畫面上四個定位的魔抗會一樣。" },
    { optionLabels: { baseStats: "初始值", growth: "每級成長" }, path: "channel.armor", zh: "裝甲寫進哪個通道", note: "出貨「每級成長」，理由同魔抗：初始值留給角色個性，定位差異由成長拉開。⚠️ 裝甲改走成長之後，坦克的硬度要到中後期才浮出來，等級 1 的選人畫面上四個定位是一樣的。" },
    {
      path: "referenceLevel",
      zh: "成長通道的基準等級",
      // ⛔ 出貨值**不可以打在這句話裡**。它在 2026-08-20 之前寫著「出貨 18」，
      //   而實際出貨的是 **99**（owner 2026-08-13「我不要用等級 18 作為終值假設，
      //   我要等級 99」）—— 一句綠燈的說明正在對操作者說謊，而沒有任何東西會紅。
      //   ⇒ 從 `DEFAULT_STAT_NORMALIZATION` 推導，⛔ 不抄。
      note:
        `級距那三個數字是「**這一級**的最終總值」。出貨 **{{出貨值}}**。` +
        `⚠️ 改它會讓三格的數字整組換一個意思 —— 基準從 ${DEFAULT_STAT_NORMALIZATION.referenceLevel} 拉到別的等級，` +
        `同樣填 26.2 就變成「那一級時是 26.2」，於是每一級的成長跟著換算。` +
        `⭐ owner 的平衡錨點是 **LV ${BALANCE_ANCHOR_LEVELS.join(" / ")}**` +
        `（${HARD_ANCHOR_LEVEL} = 一定要滿足），⛔ 這一格與「屬性上限」那一頁的錨點是**兩把不同的尺**：` +
        `這裡量的是**卡面設計**，那裡量的是**場中最終值的柵欄**。`,
    },
    { path: "allowNegativeGrowth", zh: "允許反解出負成長", note: "出貨**關著**（負的夾成 0）。⚠️ 關著的代價是**目標可能達不到**：一位初始值已經高過目標的英雄，成長填 0 也降不下來。打開它會讓那條屬性**隨等級下降** —— 那在數學上成立，但在遊戲裡幾乎一定看起來像 bug。" },
    {
      path: "transformBandShift",
      zh: "變身態的級距位移",
      note: "變身態相對於本體要**往上位移幾格**。0 = 同一格（等於沒有強化）、1 = 高一格（本體「中」→ 變身「大」）。⚠️ 只有在上面那格「變身態跳過正規化」**關掉**時才會被讀到 —— 兩格一起看才知道變身態拿到什麼。",
    },
    {
      path: "skipTransformedBodies",
      zh: "變身態跳過正規化",
      note: "出貨**開著**。⚠️ 這一格是被守衛逼出來的：變身態與本體的角色定位幾乎一定相同（同主屬性、同攻擊型別），一起正規化會讓兩者的移速/魔抗變成同一個數字 —— **超級賽亞人不再比悟空快、霸氣索隆不再比索隆抗魔**，變身的強化整個消失。等你決定「變身態的級別該怎麼相對於本體」之後再關掉它。",
    },
];

export const STAT_NORMALIZATION_SPEC: ConfigDocSpec = {
  page: "statNormalization",
  collection: "config",
  docId: "stat-normalization",
  schemaTag: "config.stat-normalization@1",
  zod: zConfigStatNormalizationDoc,
  title: "英雄屬性正規化",
  intro: [
    "owner 2026-08-12：「我的**極大極小就是為了極端例外而誕生**(ex 牙膏 熊貓等)，**不需要考慮平均分佈問題，只有小中大才是真正的分佈**⋯極小與極大只是**限制合理的上下限**(例如攻速上限 4)」。",
    "⭐ 所以這一頁只有**小 / 中 / 大**三格。**極小 / 極大 不在這裡** —— 它們是硬上下限，住在「屬性上限」頁（`config.stat-caps@1`）。個案 0 是正常狀態，不是缺陷。",
    "⭐ 這一版只套用**移動速度**與**魔抗**。量到它們今天的自然跨度只有 1.20~1.22 倍（全 roster 最強與最弱只差兩成），等於**不區分英雄**；owner 因此改成由**角色定位**決定，而不是照歷史數值分帶。",
    "角色定位怎麼判：**主屬性（lv10 權重）× 攻擊型別** —— 智慧主＝法師、力量主+近戰＝坦克、敏捷主+近戰＝近戰、遠程＝遠程。⭐ 忠於 WC3 原作模型（這個專案是 w3x 移植，英雄卡本來就帶三圍）。英雄卡上填了 `archetype` 就以那裡為準。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/stat-normalization.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/statNormalization.ts 的 resolveChampionStats（全專案唯一知道「級別怎麼變成數字」的地方）← content/registries.ts 的 registerAll，在英雄註冊時改寫 baseStats；商店預覽／選人畫面／後台全部走同一份註冊表",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完），客戶端要重新載入 bundle。和 冷卻規則／AoE 級距 同一個形態(#278)。",
  // ⭐ 手寫的在前（順序＝後台頁的顯示順序），產生的補在後面。
  fields: [
    ...NORM_HAND_WRITTEN,
    ...generatedNormalizationFields(new Set(NORM_HAND_WRITTEN.map((f) => f.path))),
  ],
  // ⚠️ `appliesTo` 是一個陣列 —— 表單引擎只畫純量，所以它原封帶走。
  //    要開啟別的屬性請直接改 content/config/stat-normalization.json 或用 API。
  //    ⭐ 這一格刻意不做成表單：它決定「正規化到底動了什麼」，
  //    誤點一下的代價是全 roster 的數值一起變，不該跟其他旋鈕一樣好按。
  preserved: [
    {
      path: "appliesTo",
      why: "它決定「正規化到底動了什麼」。掉了 = 這一頁的其餘旋鈕全部變成裝飾（存得下去、場上沒反應），而那看起來跟正常一模一樣。⭐ 刻意不做成表單欄位：誤點一下的代價是全 roster 的數值一起變。",
    },
  ],
};

export const DISPEL_SPEC: ConfigDocSpec = {
  page: "dispelRules",
  collection: "config",
  docId: "dispel",
  schemaTag: "config.dispel@1",
  zod: zConfigDispelDoc,
  title: "淨化規則",
  intro: [
    "一發【淨化】拔掉什麼：哪幾池（狀態／延燒／護盾／增益來源）、每一池最多拔幾層、拔不完時留下哪幾個。",
    "⚠️ **三個「沒標時算不算可拔」是這一頁唯一會真的改變平衡的三格**，而出貨值是刻意不對稱的：狀態與延燒開著（減速／纏繞／燃燒本來就該解得掉，關掉的話【淨化】上線當天什麼都拔不到，而那看起來跟功能壞掉一模一樣），增益來源關著（沒有人預期自己買的裝備效果可以被敵人剝掉）。",
    "⚠️ 這一頁**不影響復活與回合重置** —— 那兩條走的是另一支函式（`clearForFreshBody`），因為它們不是淨化而是重置：一個標了不可驅散的減速也不可以跨過墳墓活下來。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/dispel.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。⭐ 反過來也成立：**這一頁就是線上唯一真的生效的地方** —— 平衡值要上線，在這裡改並存檔，⛔ 不是改那個檔案再 deploy。",
    "⭐ **「解除全部負面狀態」現在是真的**（owner 2026-08-18「理論上淨化就是解掉所有負面狀態阿」）：下面的「一發淨化每一池最多拔幾層」出貨值是 **50**，實務上等於不設限；**這一格最高填到 60**（owner 同一則的追加「上限改成 60, 後台可調」）。⛔ 這個數字不是「總共只有 26 種可淨化減益」那樣算出來的 —— 引擎是**一筆一筆**算的（同一種減速由 30 隻殭屍各掛一次就是 30 筆），所以筆數沒有種類數那個天花板。",
    "⭐ **想做一張連 [狂戰士]／[暴走] 這種正向增益也一起解掉的淨化？** 那是**逐張卡**的三格，不是這一頁的開關（這一頁只管「作者沒表態時的預設」）。在那一份技能／寶具的 dispel 效果上填：①「極性」＝ buff（只拔增益）或 any（正負一起拔），出貨預設是 debuff＝只拔減益；②「清哪幾池」把「增益來源」勾起來；③ 而**被拔的那一份增益自己也要同意** —— 它的 applyBuff 要填「可被驅散＝是」而且「極性＝buff」。三格缺一，勾了也一筆都不會掉，而且**畫面上跟正常一模一樣**（這是刻意的：沒有人預期自己買的裝備被敵人剝掉，所以「不知道」不當成「是」）。想讓所有沒表態的增益一律可拔，就是下面那格「沒標『可驅散』的增益來源算不算可拔」——⚠️ 那一格是全域的，打開之後**所有人的裝備被動**都變成可以被敵方淨化剝走。",
  ],
  consumer:
    "packages/shared/src/sim/effects/dispel.ts（每一發 dispel effect 都會呼叫，讀 world.dispelRules 的其中十一格）→ sim/clearPools.ts；⭐ 第十二格「沒標極性但整份都是負值⋯」的讀取端**不在那裡** —— 它是 packages/shared/src/sim/effects/applyBuff.ts，在**掛上去的那一刻**決定極性（而不是淨化發生的那一刻），因為極性住在施加時寫下的欄位；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.dispelRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／暴走規則／基礎加成 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "淨化功能總開關",
      note: "關掉之後 dispel 這個效果整條不作用（技能還是放得出來，只是什麼都不會被拔）。⚠️ 它**只**關淨化 —— 復活與回合重置照樣清池，那兩條走的是另一支函式。",
    },
    {
      path: "statusDefaultDispellable",
      zh: "沒標「可驅散」的狀態算不算可拔",
      note: "14 份狀態文件今天一格都沒標，所以這一格實際上就是「【淨化】拔不拔得到減速／纏繞／暈眩」。填**否**＝上線當天什麼都拔不到。⚠️ 這是三個真的改變平衡的格子之一。",
    },
    {
      path: "dotDefaultDispellable",
      zh: "沒標「可驅散」的延燒算不算可拔",
      note: "燃燒／中毒／流血。單獨一格而不是跟狀態共用，因為延燒在這一版之前**完全沒有任何移除路徑** —— 打開它是一次真的能力增加，值得有自己的閥。",
    },
    {
      path: "buffDefaultDispellable",
      zh: "沒標「可驅散」的增益來源算不算可拔",
      note: "道具被動／增益卡／靈氣投影。**出貨關著**：沒有人預期自己買的裝備效果可以被敵人剝掉。打開會讓「敵方淨化」變成一個能拆對手裝備的機制 —— 那是一個設計決定，不是一個預設值。",
    },
    {
      path: "inferDebuffFromNegativeModifiers",
      zh: "沒標「極性」但整份都是負值的增益，算不算減益",
      note: "**出貨開著**（GH#662）。量到的：出貨內容有 **12 份文件**的減速／破甲／降攻速／降吸血沒有填「極性」，於是【淨化】與【免疫】對它們**一筆都拔不掉** —— 卡面寫「免疫所有負面狀態」而遊戲裡只免了一半。打開之後，一份 applyBuff 的修飾詞**全部**都是往下拉的時候，引擎在**掛上去的那一刻**就把它記成減益（而且視為可驅散，因為上面那格講的是「你自己買的裝備」，這一份是別人塞給你的）。⛔ 它**不是**「看數字猜增益還是減益」：只要有**任何一條**不是往下拉（例如攻速 +100% 配回血 −10 這種代價型狂化，出貨有 6 個），就完全不推論。⚠️ 關掉＝逐位元回到這一版之前的行為，是這一版的 rollback 開關。",
    },
    {
      path: "defaultPoolStatus",
      zh: "文件沒寫時預設清不清 狀態",
      note: "一份 dispel 文件可以自己指定清哪幾池；沒寫的時候用這四格。狀態＝減速／纏繞／暈眩／詛咒那一族。",
    },
    {
      path: "defaultPoolDot",
      zh: "文件沒寫時預設清不清 延燒",
      note: "燃燒／中毒／流血這一族的持續傷害。**出貨開著**：這是玩家最預期「一發淨化就該解掉」的東西，關掉的話身上著火時按淨化會完全沒有反應，而畫面上看起來就像技能壞了。",
    },
    {
      path: "defaultPoolShields",
      zh: "文件沒寫時預設清不清 護盾",
      note: "**出貨關著**：淨化的語意是「拔狀態」，順手把護盾也吃掉會讓【破盾】那件獨立道具失去存在理由。要破盾的道具自己在文件裡寫 pools。",
    },
    {
      path: "defaultPoolBuffs",
      zh: "文件沒寫時預設清不清 增益來源",
      note: "**出貨關著**，理由同上面那一格。⚠️ 就算打開，沒有明確標「可驅散」的來源仍然拔不走 —— 兩道閘是刻意的。",
    },
    {
      path: "maxCountCap",
      zh: "一發淨化每一池最多拔幾層",
      note: "全域上限：文件沒寫層數時用它，**文件寫了也夾不過它**。一句話管到底，避免出現兩個會分歧的上限。⭐ **出貨 {{出貨值}}＝實務上「全部」**（owner 2026-08-18「理論上淨化就是解掉所有負面狀態阿」），**這一格填得到 60**（同一則追加「上限改成 60, 後台可調」）—— 卡面寫「解除全部負面狀態」的那些技能，靠的就是這一格。填 1＝每發只解一層（很弱但很好懂）。⚠️ **調低它會讓卡面說謊**：好幾張卡的文案寫著「淨化全部可淨化的減益」，而引擎只會拔到你填的這個數字，多的**靜默消失**（⛔ 沒有任何東西會叫，也不會有任何測試變紅）。要做弱淨化請去那一份文件填層數，不要動這一格。",
    },
    {
      path: "defaultOrder",
      zh: "層數不夠時先拔哪一邊",
      note: "newest＝先拔**最晚**掛上的（剛被暈到就解得掉 —— 玩家預期的那一種）。oldest＝先拔最早掛上的（優先清快過期的殘渣，實際上比較弱）。⚠️ 這一格同時保證「拔哪一筆」是決定性的：沒有它就是靠陣列順序決定，而那是錄影對不起來的來源。",
      optionLabels: {
        newest: "newest 先拔最晚掛上的（出貨值）",
        oldest: "oldest 先拔最早掛上的",
      },
    },
    {
      path: "appliesToMobs",
      zh: "殭屍身上的狀態吃不吃淨化",
      note: "獨立一格的理由與 嘲弄規則 那一頁的同名欄位一模一樣：第 3 場之後場上大多數敵人就是殭屍，PvE 與 PvP 的答案不一定相同。關掉＝淨化只對英雄有效。",
    },
  ],
  preserved: [],
};

export const BERSERK_SPEC: ConfigDocSpec = {
  page: "berserkRules",
  collection: "config",
  docId: "berserk",
  schemaTag: "config.berserk@1",
  zod: zConfigBerserkDoc,
  title: "暴走規則",
  intro: [
    "暴走（59-00 初號機那一族）的三格：主動暴走可以按下去的生命門檻、暴走期間施法的冷卻倍率、以及這兩格套用在誰身上。",
    "⚠️ **這一頁在 2026-08-05 之前不存在，而遊戲一直在讀這三個值。** `sim/abilities/berserkRules.ts` 早就有預設表與解析器、`SimWorld` 有欄位、`abilitySystem` 有兩處在讀 —— 少的只是文件、schema、這一頁與那條接線。所以那個解析器從上架起沒有拿到過一份真的文件，三格的值只能是程式裡寫死的那一份。",
    "出貨值**逐字等於**當時寫死的預設（15% / 2 倍 / 只管主動技），所以這一頁上線不改變任何平衡 —— 它把三個本來改不到的數字變成改得到的。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/berserk.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/abilities/abilitySystem.ts 的 berserkCastBlock()（每一次按技能都會呼叫，讀 world.berserkRules.castHpPct）與 berserkCooldownFactor()（施法成功時讀 cooldownMult）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.berserkRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／護盾規則／基礎加成 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格。",
  fields: [
    {
      path: "castHpPct",
      zh: "主動暴走的生命門檻",
      note: "0..1 的**比例**，不是百分比數字：0.15 = 生命剩 15% 以下才按得下去。高於它按了會被拒（回 hp-too-high），而且**魔力與冷卻一格都不扣** —— 玩家不會因為誤按而付代價。填 1 = 隨時可放（等於這道閘不存在）；填 0 = 只有剛好 0 血那一瞬間，也就是永遠放不出來。",
    },
    {
      path: "cooldownMult",
      zh: "暴走期間施法的冷卻倍率",
      note: "2 = 冷卻時間變兩倍長（owner 的字面意思，暴走的代價）。1 = 不影響。小於 1 會變成獎勵。⚠️ 它乘的是**開始施放的那一刻**算出來的秒數，所以暴走**之前**就已經轉起來的冷卻不會被追溯加倍 —— 那會讓玩家看到進度條倒退。下界 0.1 而不是 0：0 是「無限連放」不是「冷卻縮短」，而一個打錯的 0 看起來跟關掉這個功能一模一樣。",
    },
    {
      path: "trigger",
      zh: "上面兩格套用在誰身上",
      note: "berserkGrantors＝只有會授予暴走的**主動技**吃這兩格（出貨值；天生技走 hook 的 condition，本來就不需要這道閘）。off＝施法閘不存在、冷卻也不加倍，也就是這個功能整個下線 —— 但**看得見它是被關掉的**，而不是壞掉的。",
      optionLabels: {
        berserkGrantors: "berserkGrantors 只管會授予暴走的主動技（出貨值）",
        off: "off 整個關掉（門檻與冷卻倍率都不套用）",
      },
    },
  ],
  preserved: [],
};

// ──────────────────────────── 增益卡敵方過濾 (config/augment-filter) ──

export const AUGMENT_FILTER_SPEC: ConfigDocSpec = {
  page: "augmentEnemyFilter",
  collection: "config",
  docId: "augment-filter",
  schemaTag: "config.augment-filter@1",
  zod: zConfigAugmentFilterDoc,
  title: "增益卡敵方過濾",
  intro: [
    "稜彩增益卡上寫「敵方英雄」的那些 hook，在**殭屍波**裡到底算不算數。第 3 場之後場上最多的東西就是殭屍，所以這一格決定了那一族卡片在半個遊戲裡活不活。",
    "真正的表達方式是**每張卡自己選**（那張卡的 hook 寫 `victim: \"enemy\"` 就連殭屍一起收，`\"enemyChampion\"` 只收敵方英雄）。這一頁是**全域覆寫**，給你打完一場覺得某一族卡太廢／太肥時現場翻一次，不用逐張改文件。",
    "⚠️ 打開它**不會**讓殭屍長出屬性表，所以「對敵人上 debuff」那一類卡片還是打不到殭屍身上。它救得到的是效果掛在**自己**身上的那一族：疊層、充能、打到人就回血。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/augment-filter.json`** —— 線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/effects/hooks.ts 的 victimPasses()（每一次 hook 派發都會呼叫，讀 world.augmentEnemyFilter.mobsCountAsEnemy）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.augmentEnemyFilter",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／護盾規則 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格。",
  fields: [
    {
      path: "mobsCountAsEnemy",
      zh: "殭屍算不算「敵方英雄」",
      note: "關著（出貨值）＝ 照字面：只有敵方**英雄**會觸發那些卡，殭屍潮裡一層都不疊。打開＝敵對陣營的殭屍也算，於是「打到敵人就疊一層」那一族卡在殭屍波裡會**非常快**滿層（一波三十隻）—— 那正是它要不要打開的全部：你想要那些卡在 PvE 段落也有存在感，還是想讓它們專門獎勵打人。⚠️ 它只影響寫 `enemyChampion` 的 hook；寫 `enemy` 的本來就收殭屍，寫 `allyChampion` 的永遠不受影響。",
    },
  ],
  preserved: [],
};

// ────────────────────────────────────────────── 隱形規則 (config/stealth) ──

export const STEALTH_SPEC: ConfigDocSpec = {
  page: "stealthRules",
  collection: "config",
  docId: "stealth",
  schemaTag: "config.stealth@1",
  zod: zConfigStealthDoc,
  title: "隱形規則",
  intro: [
    "誰看得見隱形單位、隱形擋掉哪幾種被指定的方式、以及什麼動作會破隱。目前場上有三位英雄用到：小次郎（27-00 永久性的隱形術，站著不動 4 秒後消失）、夏娜（21-00 灼眼）與通靈者（16-00 通靈能力）這兩支真視。",
    "出貨值**全部是 WC3 原作行為**，所以這一頁不動也不會有事；它存在是為了讓「隱形到底擋不擋得住什麼」變成可以改的，而不是藏在程式裡的四個 if。",
    "⚠️ **這不是防作弊。** 隱形單位的座標照樣送到每一個客戶端，只是客戶端不畫它；改過的客戶端還是看得到位置。owner 明確知道並接受這個取捨（家用局沒有作弊疑慮），要真的擋住必須改成每隊一份快照，那是另一件事。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/stealth.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/stealth.ts 的 canSee()／stealthSystem()（每一 tick 跑，被 sim/targeting.ts 的三個索敵謂詞與 MobSystem 讀）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.stealthRules，兩個不透明度另外由客戶端 ContentDb.load → applyStealthDoc 讀走",
  effect:
    "**索敵那幾格要重啟 game-server shard 才生效**（和 護盾規則／基礎加成 同一個形態 #278：shard 開機載入內容樹時讀一次就定格）。兩個**不透明度**與**血條開關**是客戶端讀的，玩家**重新整理遊戲頁面**就生效。",
  fields: [
    {
      path: "blocksAutoAcquire",
      zh: "隱形讓敵人的自動索敵看不到你",
      note: "關掉之後隱形就只剩畫面：模型淡出、血條不畫，但敵方英雄照樣自動撲上來打你。WC3 原作是開著。",
    },
    {
      path: "blocksMobAggro",
      zh: "隱形讓殭屍的 aggro 看不到你",
      note: "和上面拆開，因為「英雄看不到但殭屍照樣撞上來」是一種合理的設計（隱形不該完全免除 PvE 壓力）。關掉之後隱形英雄照樣會被整波殭屍追。",
    },
    {
      path: "blocksManualTarget",
      zh: "隱形讓敵方玩家點不到你",
      note: "敵人手動右鍵點你會被當成點空地——他會就地重新自動索敵，不會卡著一個死掉的指令。你的**隊友照樣點得到你**，這一格不影響己方。",
    },
    {
      path: "blocksAbilityAoe",
      zh: "隱形讓技能 AoE 也打不到你",
      note: "⚠️ 出貨值是**關**，而且那才是原作：WC3 的暴風雪照樣燒得到隱形單位，隱形是「不可被指定」不是「無敵」。打開之後永久隱形會變成「穿過整場戰鬥毫髮無傷」，那是一個強很多的技能，不是同一支。",
    },
    {
      path: "breaksOnBasicAttack",
      zh: "普攻破隱",
      note: "揮出一刀就現形，然後重新等淡出延遲。關掉 = 可以隱形著一路砍人，等於把 27-00 變成完全不同的技能。",
    },
    {
      path: "breaksOnCast",
      zh: "施法破隱",
      note: "放任何一個技能就現形，然後重新等一次淡出延遲——和普攻破隱是同一組節奏，只是換成技能鍵。出貨值是**開**。關掉之後隱形的人可以一路放技能而不現形，27-00 永久性的隱形術就從「潛行接近」變成「隱形輸出」，那是完全不同的一支技能，不是強一點而已。",
    },
    {
      path: "breaksOnDamaged",
      zh: "被打破隱",
      note: "出貨值是**關**（WC3：被 AoE 掃到不會讓你現形）。打開之後只要吃到任何一點傷害就現形，對上有 AoE 的對手等於隱形直接失效——這是節奏設計，不是強弱調整。",
    },
    {
      path: "fadeDelayMult",
      zh: "淡出延遲倍率",
      note: "乘在技能自己寫的秒數上（27-00 永久性的隱形術 = 4.0 秒，直接來自 w3x）。0.5 = 兩秒就消失，2 = 八秒。**0 = 停手就立刻隱形**。上界 10 是誤植守衛：打成 40 等於那位英雄整場再也不會隱形，而畫面上看起來就是「功能壞了」。",
    },
    {
      path: "allyAlpha",
      zh: "己方看到的隱形隊友不透明度",
      note: "0 = 完全看不見，1 = 和平常一樣。⚠️ **不要設 0** —— 你會看不到自己操作的角色，那支英雄就不能玩了。出貨值 {{出貨值}} 是「明顯在那裡、明顯不是實體」。",
    },
    {
      path: "enemyAlpha",
      zh: "敵方（沒有真視）看到的不透明度",
      note: "0 = 完全消失（出貨值）。設成 0.1~0.2 會變成「半透明鬼影」——看得到大概在哪但看不清楚，是一種比較不挫折的折衷；設高了隱形就沒有意義。",
    },
    {
      path: "hideEnemyHealthBar",
      zh: "隱形時對敵方隱藏血條",
      note: "**獨立的一格，不是上面那個的推論**：如果你把不透明度設成 0.15 想要鬼影效果，血條還飄在上面就等於把位置清清楚楚標出來，隱形完全白做。己方的血條永遠會畫，這一格只管敵方。",
    },
  ],
  preserved: [],
};

// ────────────────────────────────────────────── 嘲弄規則 (config/taunt) ──

export const TAUNT_SPEC: ConfigDocSpec = {
  page: "tauntRules",
  collection: "config",
  docId: "taunt",
  schemaTag: "config.taunt@1",
  zod: zConfigTauntDoc,
  title: "嘲弄規則",
  intro: [
    "[嘲弄] 是遊戲裡**唯一**會強迫一個單位改打別人的機制 —— 目前只有一件道具用到：鍊金術之盾（每秒把周圍敵人拉過來打自己 0.5 秒）。這一頁決定它拉得動誰、拉多久、以及它能不能從**玩家自己手上**把目標搶走。",
    "⚠️ 這是坦克類道具唯一的存在理由，也是最容易讓人覺得「操作被搶走」的機制。出貨值全部選保守側：嘲弄只接管**自動索敵**與 bot／殭屍的 aggro，玩家右鍵點名的目標一個 tick 都不會被動到。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/taunt.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/taunt.ts 的 tauntedBy()／applyTaunt()，經由 sim/targeting.ts 的 forcedTargetOf() 被三個索敵消費端讀（OrderSystem 的自動索敵、Tier0Brain 的 bot 迴圈、MobSystem 的殭屍 aggro）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.tauntRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場（和 護盾規則／隱形規則／基礎加成 同一個形態 #278：shard 開機載入內容樹時讀一次就定格）。",
  fields: [
    {
      path: "enabled",
      zh: "嘲弄總開關",
      note: "關掉＝嘲弄整條機制不存在：場上已經掛著的也讀不出來，新的也寫不進去，索敵完全回到這條機制落地之前的樣子。這是**止血閥** —— 嘲弄是唯一會替玩家決定打誰的東西，線上手感出問題時要能在不重新部署的情況下整個關掉。關掉之後鍊金術之盾就只剩 [煉金術] 那一半。",
    },
    {
      path: "overridesManualOrder",
      zh: "嘲弄可以蓋掉玩家自己下的攻擊指令",
      note: "⚠️ 出貨值是**關**。關＝嘲弄只接管自動索敵與 bot／殭屍的 aggro，玩家右鍵點名的那個目標不會被搶走 —— 他仍然可以選擇無視嘲弄他的人。開＝WC3 原作行為，嘲弄期間玩家的目標被清掉、身體自己去打嘲弄者。開之前先想清楚：同一個題目（系統要不要從玩家手上接管方向盤）在 卡住就接敵 那一頁已經被推翻過一次，實測那次搶走了 86.6% 的走位 tick。",
    },
    {
      path: "restoreManualOrderOnLapse",
      zh: "嘲弄退掉之後把玩家原本的目標還回去",
      note: "只有上面那一格打開時才有意義。出貨**開**：嘲弄一失效（過期／嘲弄者死掉／被拖出牽引距離／規則被關掉），被搶走的那個目標會原封不動還給玩家，而且還原成**手選**。⚠️ 關掉之後就是舊行為，而舊行為是一個缺陷不是一種風格：被搶走的手選目標會被自動索敵重新填上，也就是一次右鍵點名**永久**變成自動目標，嘲弄退了也回不來。玩家在嘲弄期間自己下的新指令（走位／S／H／改點別人）一律優先，不會被還原蓋掉。",
    },
    {
      path: "appliesToMobs",
      zh: "殭屍也會被嘲弄拉走",
      note: "出貨**開**。文案寫的是「吸引周圍**敵人**」，而第 3 場之後場上大多數敵人就是殭屍 —— 關掉之後坦克盾拉不住整波殭屍，這件道具在 PvE 幾乎沒有用。和 隱形規則 把「英雄索敵」跟「殭屍 aggro」拆成兩格是同一個理由：PvE 與 PvP 的答案不一定相同。這一格是**讀取時**生效，關掉之後場上已經掛著的嘲弄對殭屍立刻失效，不用等它過期。",
    },
    {
      path: "mobTauntMode",
      zh: "殭屍被嘲弄時，是改打嘲弄者還是只把他排前面",
      note: "replace（出貨）＝ 嘲弄者直接成為目標，不管牠原本鎖著誰、也不管誰比較近 —— 嘲弄就是一條拉繩，「最近」正是它要推翻的答案。nearestFirst ＝ 原本的最近敵人掃描照跑，嘲弄者只有在**沒有更近的敵人**時才贏（平手算它贏）。換句話說 nearestFirst 只能改變「已經朝你來的那幾隻」，拉不動貼在隊友臉上的那一隻。兩種模式都吃下面的牽引距離。",
      optionLabels: {
        replace: "replace 直接改打嘲弄者（出貨值）",
        nearestFirst: "nearestFirst 只有更近時才生效",
      },
    },
    {
      path: "priority",
      zh: "嘲弄在索敵順序裡排第幾",
      note: "absolute（出貨）＝ 排在**最前面**，壓過「敵方英雄優先」與「正在打我的人優先」兩條；這一側就是鍊金術之盾卡面上那句「吸引周圍敵人**優先攻擊自己**」。aboveThreatOnly ＝ 排在「敵方英雄優先」**後面**，也就是一個由召喚物或小怪發出的嘲弄拉不走一個旁邊就有敵方英雄的人。⚠️ 兩側的差別**只有**在嘲弄者跟另一個候選的種類不同時才看得到（英雄／召喚物／小怪）。目前唯一的嘲弄來源是玩家手上的盾（一個英雄），所以今天把它翻過去不會改變任何一場戰鬥 —— 這一格是替下一件帶嘲弄的內容準備的。兩側都**不會**讓嘲弄輸給「正在打我的人」：那不是比較弱的嘲弄，那是一個會被它想拉開的那個敵人當場取消掉的嘲弄。",
      optionLabels: {
        absolute: "absolute 壓過所有條件（出貨值）",
        aboveThreatOnly: "aboveThreatOnly 敵方英雄仍然優先",
      },
    },
    {
      path: "leashUnits",
      zh: "嘲弄最多能把人拖多遠",
      note: "圓心到圓心的距離（GGD 單位）。超過就當場鬆手，走回來又生效 —— 和到期一樣是**每 tick 重問**的。⚠️ 嘲弄本來就無視受害者自己的索敵半徑（那是刻意的：半徑是「我看多遠」，不是嘲弄的射程），所以在這一格出現之前**沒有任何東西**限制嘲弄者可以把一具身體拖多遠：掛上、跑掉，對方就一路追過整個競技場。出貨 {{出貨值}} ＝ 一個決鬥區的半徑；鍊金術之盾實際能碰到的範圍只有 5.5，所以 24 對現行內容一格都沒動。**0 ＝ 不限制**（舊行為）。上界 100 是誤植守衛 —— 區域直徑才 48。",
    },
    {
      path: "maxTargetsCap",
      zh: "一發範圍嘲弄最多拉幾個人",
      note: "道具／技能沒有自己寫「最多幾個」時用這個數字，寫了也**夾不過**它 —— 一句話管到底，不會出現兩個上限互相打架。出貨 {{出貨值}} 就是這一格出現之前寫死在程式裡的那個數字（鍊金術之盾自己寫 8，本來就在底下，所以出貨行為沒變）。調低它是壓制坦克盾在殭屍波裡強度最直接的一格。",
    },
    {
      path: "capOrder",
      zh: "超過上限時留下哪幾個",
      note: "nearest（出貨）＝ 由近到遠。lowestHp ＝ 血最低的先被拉走，想讓坦克盾去救那些快被打死的隊友時選這個。id ＝ 先生成的先被拉，是唯一一個與位置和血量都無關的順序，需要一個完全穩定的參照時才用。三種都是**全序**（最後一定比到 entityId），所以「五隻殭屍裡拉哪三隻」永遠是同一個答案，不會每場不一樣。",
      optionLabels: {
        nearest: "nearest 由近到遠（出貨值）",
        lowestHp: "lowestHp 血最低的先拉",
        id: "id 先生成的先拉",
      },
    },
    {
      path: "conflictMode",
      zh: "同時被兩個人嘲弄時聽誰的",
      note: "newest＝最後喊的那個人贏，也就是新的一發嘲弄**一定**會生效（出貨值）。longest＝剩餘時間長的那個贏，短的那一發被吃掉。選 newest 是因為另一側有一個很難查的失敗形態：技能放出去、動畫演完、冷卻照燒，目標卻一動也不動，因為身上還掛著別人比較長的嘲弄。",
      optionLabels: {
        newest: "newest 最後喊的贏（出貨值）",
        longest: "longest 剩餘時間長的贏",
      },
    },
    {
      path: "durationMult",
      zh: "嘲弄持續時間倍率",
      note: "乘在道具／技能自己寫的秒數上（鍊金術之盾 = 0.5 秒）。1＝照文件寫的；2＝一秒；**0＝嘲弄立刻過期，等於關掉**。用來整體調快／調慢這條機制而不必逐件道具改文件。上界 10 是誤植守衛：0.5 秒打成 40 倍就是 20 秒，整整一波交戰所有人都在打同一個人，而畫面上看起來就是「索敵壞掉了」。",
    },
  ],
  preserved: [],
};

