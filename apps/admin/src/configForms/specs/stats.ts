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
import { derivedFields, specFromZod } from "../schemaToForm";
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
    {
      path: "roleFromOrigin",
      zh: "英雄定位（role）由出身推導",
      note: "出貨**開著**：圖鑑篩選／戰後評分用的四格定位（坦克/近戰/遠程/法師）從出身查表（ORIGIN_TO_ARCHETYPE），英雄卡上的 role 格只是退路。關掉 = 照抄英雄卡（匯入時的粗分類，71 份裡 36 份與出身不一致，66 份只是 attackType 的別名）。GH#1024 A4。",
    },
    {
      path: "transformInheritsOrigin",
      zh: "變身態的出身繼承本體",
      note:
        "出貨**開著**：變身身體的出身在載入時從本體那一份繼承（`transform.counterpartId`），於是**十一屬性級距 · 普攻距離尺標 · 定位**一起跟著本體走。" +
        "⚠️ 量到的（⛔ 不是估的）：**20 具變身身體裡 16 具**由三圍推導出的出身與本體不同 —— 草泥馬本體**坦克**（裝甲／魔抗**極大**）推導成**法刺**（兩防**極小**）、" +
        "飛影本體法刺推導成鬥士（11 項全動、AD 差 3 格），而卡面上沒有任何一句說明。" +
        "關掉 = 回到 2026-09-07 之前（變身身體照自己的三圍推導出身）。" +
        "⛔ **這一格的預設是 Claude 挑的，⛔ 不是 owner 的裁決** —— owner 2026-08-13「屬性不用多一份考量，都是一樣」有兩種讀法，這裡挑了「與本體一樣」那一種；不同意就關掉它。GH#1064。",
    },
];

export const STAT_NORMALIZATION_SPEC: ConfigDocSpec<"statNormalization"> = {
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

export const DISPEL_SPEC: ConfigDocSpec<"dispelRules"> = {
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
  fields: derivedFields(zConfigDispelDoc, []),
  preserved: [],
};

export const BERSERK_SPEC: ConfigDocSpec<"berserkRules"> = {
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
  fields: derivedFields(zConfigBerserkDoc, []),
  preserved: [],
};

// ──────────────────────────── 增益卡敵方過濾 (config/augment-filter) ──

export const AUGMENT_FILTER_SPEC: ConfigDocSpec<"augmentEnemyFilter"> = specFromZod(zConfigAugmentFilterDoc, "augmentEnemyFilter");

// ────────────────────────────────────────────── 隱形規則 (config/stealth) ──

export const STEALTH_SPEC: ConfigDocSpec<"stealthRules"> = {
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
  fields: derivedFields(zConfigStealthDoc, []),
  preserved: [],
};

// ────────────────────────────────────────────── 嘲弄規則 (config/taunt) ──

export const TAUNT_SPEC: ConfigDocSpec<"tauntRules"> = {
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
  fields: derivedFields(zConfigTauntDoc, []),
  preserved: [],
};

