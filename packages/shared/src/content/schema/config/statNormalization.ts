import { z } from "zod";
import { zId } from "../common";
import { ARCHETYPES, BAND_VALUE_MAX, SCALE_KEYS, BAND_VALUE_MIN, DEFAULT_STAT_NORMALIZATION, NORMAL_BANDS, NORMALIZED_STAT_KEYS, ORIGINS, STAT_NORMALIZATION_DOC_ID } from "../../statNormalization";
import { BALANCE_ANCHOR_LEVELS, HARD_ANCHOR_LEVEL } from "../../balanceAnchors";

/**
 * ⭐【正規化那 247 格欄位說明：K 個模板 ＋ 一張表，⛔ 不是 247 列手寫標籤】（GH#992）
 *
 * 這一族的形狀是**完全規則**的六族：
 *   · `bands.<屬性>.<級距>`            11 × 5  = 55
 *   · `byArchetype.<屬性>.<定位>`       11 × 4  = 44
 *   · `byOrigin.<屬性>.<出身>`          11 × 10 = 110
 *   · `channel.<屬性>`                  11
 *   · `bandsByScale.<屬性>.<尺>.<級距>`  雙峰的那幾項 × 2 × 5
 *   · `scaleByOrigin.<屬性>.<出身>`      雙峰的那幾項 × 10
 *
 * ⚠️ 在 2026-09-07 之前，這 247 格的**人話**住在 `apps/admin/src/configForms/specs/stats.ts`
 * （一支 `generatedNormalizationFields()` 產生器 ＋ 一張 `NORM_HAND_WRITTEN` 手寫表），
 * 而**結構**住這裡 ⇒ 同一格欄位有兩個住處（第〇·四守則的病灶）。
 * ⭐ 搬過來之後只有這一份：後台的 `derivedFields(zod)` 從 `.describe()` 的行首指令
 * （`@zh` / `@note` / `@opt`）推導出標籤、說明與選項中文。
 *
 * ⛔ **搬家不是複製** —— `apps/admin` 那一側的產生器與手寫表**已經刪掉**；
 * 棘輪（`packages/shared/src/ops/adminFormsHandWrittenRatchet.test.ts`）量的正是
 * 「後台還有幾格拿不到 Zod 給的人話」，這一批從 362 掉下來的 247 格就是這一族。
 *
 * ⭐ 帶著 owner 裁決理由的那 31 格**逐字保留**在 {@link NORM_PROSE}（key ＝ 完整 path）——
 * 模板只服務「規則的那些」，⛔ 不會把「坦克吃裝甲不吃魔抗」這種裁決壓掉。
 */

/** 屬性的中文名 —— ⭐ 這一族說明的**唯一**詞彙表（原本住 `apps/admin`）。 */
const STAT_ZH: Record<string, string> = {
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
  //   見 `bandsByScale`）—— `bands.range.*` 是「英雄卡沒填 attackType」時的退路。
  range: "攻擊距離",
};
const zhOf = (k: string): string => STAT_ZH[k] ?? k;

const ARCHETYPE_ZH: Record<string, string> = {
  tank: "坦克",
  fighter: "近戰",
  marksman: "遠程",
  mage: "法師",
};
const SCALE_ZH: Record<string, string> = { melee: "近戰", ranged: "遠程" };

/** 級距下拉的五個選項 —— ⛔ 少一個 `configForms.test.ts` 就紅。 */
const BAND_OPTS = NORMAL_BANDS.map((b) => `@opt ${b} ${b}`).join("\n");
const CHANNEL_OPTS = "@opt baseStats 初始值\n@opt growth 每級成長";
const SCALE_OPTS = "@opt melee 近戰尺（1.2~2.0）\n@opt ranged 遠程尺（6~12）";

/**
 * ⭐ 帶著 **owner 裁決理由**的那幾格（key ＝ 完整 path）。
 *
 * ⚠️ 這些**不是**模板產得出來的東西 —— 「坦克吃裝甲不吃魔抗」「移速為什麼只能走
 * 初始值」是 owner 在特定日期給的判斷，模板只知道「這是某某屬性的某一格」。
 * ⇒ 模板負責規則的那 216 格，這張表負責剩下的 31 格；⛔ 兩者不重疊。
 */
const NORM_PROSE: Record<string, string> = {
  mode:
    "@zh 模式（normalized / legacy）\n" +
    "@note `normalized` 是出貨預設，英雄的移速與魔抗由角色定位決定。`legacy` 是**回滾用的逃生口** —— 扳過去就回到英雄卡上的原值，**不需要部署**（舊數值一直留在英雄卡裡沒有被銷毀）。\n" +
    "@opt normalized 正規化（出貨預設）\n" +
    "@opt legacy 舊數值（回滾用）",

  "bands.ms.小": "@zh 移速 · 小（慢）\n@note 坦克與法師落在這一格。錨點是 74 位母體的中位數 5.8，小 = 中 ÷ 1.25。",
  "bands.ms.中": "@zh 移速 · 中\n@note 遠程角色落在這一格。這個數字是**量出來的**（74 位母體的中位數），不是挑的。",
  "bands.ms.大": "@zh 移速 · 大（快）\n@note 近戰角色落在這一格。大 = 中 × 1.25。⚠️ in-game 還要再乘攻擊型別倍率（近戰 ×0.8 / 遠程 ×0.6）。",
  "bands.mr.小": "@zh 魔抗 · 小（弱）\n@note 遠程與法師落在這一格 —— owner：「魔抗則是遠距離及法師弱」。⚠️ in-game 還要再乘 ×0.2（`magicResistMult`）。",
  "bands.mr.中": "@zh 魔抗 · 中\n@note 近戰角色落在這一格。這個數字是量出來的（母體中位數 38.8）。",
  "bands.mr.大": "@zh 魔抗 · 大（高）\n@note 坦克落在這一格 —— owner：「坦克高」。大 = 中 × 1.25。",

  "byArchetype.ms.tank":
    "@zh 坦克 → 移速哪一格\n@note owner：「近距離攻擊移動速度應該是快，**但坦克是中或慢**」。出貨取「小（慢）」—— 改成「中」就是另一種讀法，這一格就是給你改的。\n" +
    BAND_OPTS,
  "byArchetype.ms.fighter":
    "@zh 近戰 → 移速哪一格\n@note owner：「近距離攻擊 移動速度應該是**快**」。出貨「大」。\n" + BAND_OPTS,
  "byArchetype.ms.marksman":
    "@zh 遠程 → 移速哪一格\n@note owner：「遠距離攻擊 移動速度應該是**中**」。出貨「中」。\n" + BAND_OPTS,
  "byArchetype.ms.mage":
    "@zh 法師 → 移速哪一格\n@note owner：「技能傷害為主的法師⋯移動速度應該是中或慢，**但慢的為主**」。出貨「小」。\n" + BAND_OPTS,
  "byArchetype.mr.tank":
    "@zh 坦克 → 魔抗哪一格\n@note ⚠️ **2026-08-12 整組反轉**。owner 原本說「坦克高」，但那和「智慧→魔抗」的推導打架。他的新裁決是「**我們引入防禦/裝甲來平衡這個現象**」→ 坦克改吃**裝甲**，魔抗讓給法師。出貨「小」。\n" +
    BAND_OPTS,
  "byArchetype.mr.fighter":
    "@zh 近戰 → 魔抗哪一格\n@note owner：「近距離**中**」。出貨「中」—— 近戰要貼身，但不該像坦克一樣無視魔法傷害。\n" + BAND_OPTS,
  "byArchetype.mr.marksman":
    "@zh 遠程 → 魔抗哪一格\n@note owner：「遠距離⋯**弱**」。出貨「小」—— 遠程靠距離活命，不是靠抗性。\n" + BAND_OPTS,
  "byArchetype.mr.mage":
    "@zh 法師 → 魔抗哪一格\n@note ⭐ 出貨「大」。法師的智慧最高，而智慧本來就推導魔抗 —— 這一格讓**引擎本來就在做的事變成對的**，不再需要對抗它。坦克那一邊改由裝甲負責。\n" +
    BAND_OPTS,

  "bands.armor.小": "@zh 裝甲 · 小（薄）\n@note 法師與遠程落在這一格。⚠️ 這是**等級 18 的最終總值**（裝甲走成長通道），不是初始值。小 = 中 ÷ 1.25。",
  "bands.armor.中": "@zh 裝甲 · 中\n@note 近戰落在這一格。錨點 = 73 位可達英雄在等級 18 的**中位數**（量出來的），所以改制前後全場的防禦總量不變，只是重新分配。",
  "bands.armor.大": "@zh 裝甲 · 大\n@note 坦克落在這一格。大 = 中 × 1.25。⚠️ 這一格是坦克唯一的硬度來源 —— 裝甲由**敏捷**推導，而坦克是力量主，自然裝甲全場最低（改制前坦克排第三）。",
  "byArchetype.armor.tank":
    "@zh 坦克 → 裝甲哪一格\n@note owner 2026-08-12：坦克**大**。這一格是整次改制的重點 —— 它取代了原本「坦克魔抗高」的角色。\n" + BAND_OPTS,
  "byArchetype.armor.fighter":
    "@zh 近戰 → 裝甲哪一格\n@note owner：近戰**中**。⚠️ 改制前近戰的裝甲其實是全場第一（敏捷主），這一格會把它拉回中間。\n" + BAND_OPTS,
  "byArchetype.armor.marksman":
    "@zh 遠程 → 裝甲哪一格\n@note owner：遠程**小**。⚠️ 改制前遠程的裝甲排全場第二（敏捷主），這一格把它拉到最低 —— 遠程靠站位活命，被貼上就該死。\n" +
    BAND_OPTS,
  "byArchetype.armor.mage":
    "@zh 法師 → 裝甲哪一格\n@note owner：法師**小**。法師拿魔抗不拿裝甲 —— 這一格與「法師 → 魔抗＝大」是同一個設計的兩半，一起改才有意義。\n" + BAND_OPTS,

  "channel.ms":
    "@zh 移速寫進哪個通道\n@note ⛔ 出貨「初始值」，而這**不是偏好，是量出來的機制限制**：成長只能往上推不能往下拉，而移速沒有三圍來源可以在反解時被減掉。實測改成「每級成長」會讓坦克 15/16 位、法師 18/18 位被夾在 0，排序變成坦克第二。\n" +
    CHANNEL_OPTS,
  "channel.mr":
    "@zh 魔抗寫進哪個通道\n@note 出貨「每級成長」。owner：「**初始的屬性是用來補正角色個性化差異，成長是定位導向**」。⚠️ 走成長的代價是**等級 1 看不出差別** —— 選人畫面上四個定位的魔抗會一樣。\n" +
    CHANNEL_OPTS,
  "channel.armor":
    "@zh 裝甲寫進哪個通道\n@note 出貨「每級成長」，理由同魔抗：初始值留給角色個性，定位差異由成長拉開。⚠️ 裝甲改走成長之後，坦克的硬度要到中後期才浮出來，等級 1 的選人畫面上四個定位是一樣的。\n" +
    CHANNEL_OPTS,

  // ⛔ 出貨值**不可以打在這句話裡**。它在 2026-08-20 之前寫著「出貨 18」，
  //   而實際出貨的是 **99**（owner 2026-08-13「我不要用等級 18 作為終值假設，
  //   我要等級 99」）—— 一句綠燈的說明正在對操作者說謊，而沒有任何東西會紅。
  //   ⇒ 從 `DEFAULT_STAT_NORMALIZATION` 推導，⛔ 不抄。
  referenceLevel:
    "@zh 成長通道的基準等級\n" +
    "@note 級距那三個數字是「**這一級**的最終總值」。出貨 **{{出貨值}}**。" +
    `⚠️ 改它會讓三格的數字整組換一個意思 —— 基準從 ${DEFAULT_STAT_NORMALIZATION.referenceLevel} 拉到別的等級，` +
    "同樣填 26.2 就變成「那一級時是 26.2」，於是每一級的成長跟著換算。" +
    `⭐ owner 的平衡錨點是 **LV ${BALANCE_ANCHOR_LEVELS.join(" / ")}**` +
    `（${HARD_ANCHOR_LEVEL} = 一定要滿足），⛔ 這一格與「屬性上限」那一頁的錨點是**兩把不同的尺**：` +
    "這裡量的是**卡面設計**，那裡量的是**場中最終值的柵欄**。",

  allowNegativeGrowth:
    "@zh 允許反解出負成長\n@note 出貨**關著**（負的夾成 0）。⚠️ 關著的代價是**目標可能達不到**：一位初始值已經高過目標的英雄，成長填 0 也降不下來。打開它會讓那條屬性**隨等級下降** —— 那在數學上成立，但在遊戲裡幾乎一定看起來像 bug。",
  transformBandShift:
    "@zh 變身態的級距位移\n@note 變身態相對於本體要**往上位移幾格**。0 = 同一格（等於沒有強化）、1 = 高一格（本體「中」→ 變身「大」）。⚠️ 只有在上面那格「變身態跳過正規化」**關掉**時才會被讀到 —— 兩格一起看才知道變身態拿到什麼。",
  /**
   * ⭐ GH#1095（2026-09-07）：這一句在此之前逐字寫著「出貨**開著**」，而出貨值是
   * **`false`**（`content/config/stat-normalization.json`）—— 一句在它到期之後還活著的
   * 散文，⛔ 而沒有任何東西會紅：`configFormsShippedProse` 那條閘只掃**數字**出貨值，
   * 布林的宣稱它結構上看不見。
   *
   * ⚠️ 而它是**載重**的：開著時變身態整份跳過正規化 ⇒ 同一頁的 `transformBandShift`
   * 與 GH#1064 的 `transformInheritsOrigin` **兩格都讀不到**。照那句話讀，操作者會
   * 以為自己在調的兩格是死的（或反過來，以為是活的）。
   *
   * ⇒ ⭐ 出貨值改成 `{{出貨值}}`（`ConfigDocPage` 渲染時代入真的那一份，布林顯示
   * 「開啟」／「關閉」），⛔ 不抄字面值 —— 抄的那一份就是第四個住處，而它一定會過期。
   */
  skipTransformedBodies:
    "@zh 變身態跳過正規化\n" +
    "@note 出貨 **{{出貨值}}**。⭐ 開著時變身態**整份跳過**正規化 ⇒ 同一頁的" +
    "「變身態的級距位移」與「變身態的出身繼承本體」**兩格都讀不到**（它們只在這一格**關著**時才有作用）。" +
    "⚠️ 它在 2026-08-13 之前是開著的，理由是：變身態與本體的角色定位幾乎一定相同（同主屬性、同攻擊型別），" +
    "一起正規化會讓兩者的移速/魔抗變成同一個數字 —— **超級賽亞人不再比悟空快、霸氣索隆不再比索隆抗魔**。" +
    "owner 2026-08-13 逐字：「請把變身也排除考慮行列，我決定變身所有的屬性改變都用技能標籤組合到該變身技能中就好，" +
    "所以屬性不用多一份考量，都是一樣」⇒ 關掉它之後，變身態就是一張照自己那一列正規化的普通卡，" +
    "「變身比較強」由變身技能本身的 buff 負責。",

  /**
   * ⭐ GH#1024 A4（2026-09-06）：註冊表上的 `role` 由**出身**推導（`ORIGIN_TO_ARCHETYPE`），
   * 英雄卡的 `role` 格降為退路原始值。
   */
  roleFromOrigin:
    "@zh 英雄定位（role）由出身推導\n" +
    "@note 出貨**開著**：圖鑑篩選／戰後評分用的四格定位（坦克/近戰/遠程/法師）從出身查表（ORIGIN_TO_ARCHETYPE），" +
    "英雄卡上的 role 格只是退路。關掉 = 照抄英雄卡（匯入時的粗分類，71 份裡 36 份與出身不一致，66 份只是 attackType 的別名）。GH#1024 A4。",

  /**
   * ⭐ GH#1064（2026-09-07）：變身態的出身在**載入時**繼承本體（`transform.counterpartId`），
   * ⛔ 不烘進那 20 份文件。量測在 `statNormalization.ts` 的 `StatNormalization.transformInheritsOrigin`。
   */
  transformInheritsOrigin:
    "@zh 變身態的出身繼承本體\n" +
    "@note 出貨**開著**：變身身體的出身在載入時從本體那一份繼承（`transform.counterpartId`），於是**十一屬性級距 · 普攻距離尺標 · 定位**一起跟著本體走。" +
    "⚠️ 量到的（⛔ 不是估的）：**20 具變身身體裡 16 具**由三圍推導出的出身與本體不同 —— 草泥馬本體**坦克**（裝甲／魔抗**極大**）推導成**法刺**（兩防**極小**）、" +
    "飛影本體法刺推導成鬥士（11 項全動、AD 差 3 格），而卡面上沒有任何一句說明。" +
    "關掉 = 回到 2026-09-07 之前（變身身體照自己的三圍推導出身）。" +
    "⛔ **這一格的預設是 Claude 挑的，⛔ 不是 owner 的裁決** —— owner 2026-08-13「屬性不用多一份考量，都是一樣」有兩種讀法，這裡挑了「與本體一樣」那一種；不同意就關掉它。GH#1064。",
};

/** 這一格有沒有 owner 的裁決版本；沒有就用模板那一句。 */
const say = (path: string, template: string): string => NORM_PROSE[path] ?? template;

/** 三格的數值（小/中/大）。⛔ 極小/極大不在這裡 —— 它們是硬上下限，住 stat-caps。 */
const zBandName = () => z.enum(["極小", "小", "中", "大", "極大"] as const);

const zNormBandValues = (describeFor: (band: string) => string) =>
  z
    .object(
      Object.fromEntries(
        NORMAL_BANDS.map((b) => [
          b,
          z.number().finite().min(BAND_VALUE_MIN).max(BAND_VALUE_MAX).describe(describeFor(b)),
        ]),
      ) as Record<string, z.ZodNumber>,
    )
    .strict();
type NormBandValues = ReturnType<typeof zNormBandValues>;

/** `bands.<屬性>.<級距>` —— 單尺那一張。 */
const zBandsFor = (stat: string): NormBandValues =>
  zNormBandValues((band) =>
    say(
      `bands.${stat}.${band}`,
      `@zh ${zhOf(stat)} · ${band}\n` +
        `@note ${zhOf(stat)} 落在「${band}」這一格時的數值。⚠️ 它是**基準等級**（見「成長通道的基準等級」）的最終總值，不是初始值。`,
    ),
  );

/** `bandsByScale.<屬性>.<尺>.<級距>` —— 雙峰那幾項的兩把尺。 */
const zBandsByScaleFor = (stat: string, type: string): NormBandValues =>
  zNormBandValues((band) =>
    say(
      `bandsByScale.${stat}.${type}.${band}`,
      `@zh ${zhOf(stat)} · ${SCALE_ZH[type] ?? type} · ${band}\n` +
        `@note 走「${SCALE_ZH[type] ?? type}尺」的英雄，${zhOf(stat)} 落在「${band}」這一格時的數值。` +
        `⭐ ${zhOf(stat)}是**唯一分兩把尺**的屬性：它的分佈是雙峰的（實測近戰中位 1.6、` +
        `遠程中位 8.2，跨度 5.1×），⚠️ 而近戰/遠程是**量級不是級別**，` +
        `所以出身給的級距意思是「以你這把尺而言算遠還算近」——近戰的「大」不會把他變成遠程。` +
        `⚠️ 走哪一把尺由下面的「⋯走哪一把尺」那幾格決定，⛔ 不是英雄卡上的攻擊型別。`,
    ),
  );

/** 四個角色定位各落在哪一格。 */
const zNormArchetypeBands = (stat: string) =>
  z
    .object(
      Object.fromEntries(
        ARCHETYPES.map((a) => [
          a,
          zBandName().describe(
            say(
              `byArchetype.${stat}.${a}`,
              `@zh ${ARCHETYPE_ZH[a] ?? a} → ${zhOf(stat)}哪一格\n` +
                `@note 決定「${ARCHETYPE_ZH[a] ?? a}」這個定位的英雄，${zhOf(stat)} 要落在哪一格級距 —— 改它會同時影響**每一位**判定為這個定位的英雄，不是單一個案。\n` +
                BAND_OPTS,
            ),
          ),
        ]),
      ) as Record<string, ReturnType<typeof zBandName>>,
    )
    .strict();

/** 十格出身表的一列。⭐ 允許只填一部分（沒填的退回四格那張）。 */
const zNormOriginBands = (stat: string) =>
  z
    .object(
      Object.fromEntries(
        ORIGINS.map((o) => [
          o,
          zBandName()
            .describe(
              say(
                `byOrigin.${stat}.${o}`,
                `@zh ${o} → ${zhOf(stat)}哪一格\n` +
                  `@note 選角出身「${o}」的 ${zhOf(stat)} 落在哪一格級距。⚠️ 出身比定位**更細** —— 同一個定位的兩位英雄可以走不同出身。\n` +
                  BAND_OPTS,
              ),
            )
            .optional(),
        ]),
      ) as Record<string, z.ZodOptional<ReturnType<typeof zBandName>>>,
    )
    .strict();

/** `scaleByOrigin.<屬性>.<出身>` —— 這個出身量距離用哪一把尺。 */
const zScaleByOriginRow = (stat: string) =>
  z
    .object(
      Object.fromEntries(
        ORIGINS.map((o) => [
          o,
          z
            .enum(SCALE_KEYS)
            .describe(
              say(
                `scaleByOrigin.${stat}.${o}`,
                `@zh ${o} → ${zhOf(stat)}走哪一把尺\n` +
                  `@note 出身「${o}」的 ${zhOf(stat)} 要用近戰那把尺還是遠程那把尺量。` +
                  `搭配上面的「${o} → ${zhOf(stat)}哪一格」，兩格合起來才是絕對值` +
                  `（例：砲手 = 遠程 × 極大 = 12；法刺 = 近戰 × 小 = 1.4）。` +
                  `🔴 ⚠️ 這一格**刻意不看英雄卡上的攻擊型別** —— owner 2026-08-16 那張 49 位的表裡` +
                  `有 10 位兩者相反（妙蛙種子是近戰攻擊但要 8.2 的距離、皮卡娘是遠程攻擊但只要 1.4），` +
                  `攻擊型別管的是「投射物還是近身揮擊」，這一格管的是「構多遠」。` +
                  `⛔ 改錯會讓整個出身的射程差 5 倍，而且畫面上不會有任何錯誤訊息。\n` +
                  SCALE_OPTS,
              ),
            )
            .optional(),
        ]),
      ) as Record<string, z.ZodOptional<z.ZodEnum<["melee", "ranged"]>>>,
    )
    .strict();

/**
 * config.stat-normalization@1 — 英雄屬性正規化（owner 2026-08-12，第三版）。
 *
 * ⭐ owner：「你要重新寫出**定位 10 種**如何影響**極小小中大極大**的**所有屬性**」
 * → 十格出身 × 十項屬性 × 五格級距。⛔ `range` 不在裡面（雙峰，型別不是級別）。
 *
 * ⚠️ 前兩版的說明（「只套用移速與魔抗」「極小/極大不是格是上下限」）**已經失效**，
 * 那是我把範圍讀窄了 —— owner 2026-08-12：「出身跟定位**是影響所有屬性**不是這幾項而已」。
 */
export const zConfigStatNormalizationDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stat-normalization@1"),
    note: z.string().optional(),
    mode: z.enum(["normalized", "legacy"]).describe(NORM_PROSE.mode!),
    /**
     * 這一版真的套用的屬性。
     * ⚠️ `range` 自 2026-08-16 起**在 `NORMALIZED_STAT_KEYS` 裡**（第 11 項），
     * 但要不要真的套用仍由這一格決定 —— 見 `statNormalization.ts` 的
     * `bandsByScale`（雙峰要兩把階梯）與 `DEFAULT_STAT_NORMALIZATION.appliesTo`。
     */
    appliesTo: z.array(z.enum(NORMALIZED_STAT_KEYS)).max(NORMALIZED_STAT_KEYS.length),
    /** 每一項的**五格**數值。⭐ 由「中」× 階梯推出來，⛔ 不手打。 */
    bands: z
      .object(Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zBandsFor(k)])) as Record<string, NormBandValues>)
      .strict(),
    /**
     * ⭐ 分成**兩把階梯**的屬性（2026-08-16，今天只有 `range`）。
     * 查得到（而且 `scaleByOrigin` 說得出走哪一把）就優先於 `bands`；否則退回單尺。
     *
     * ⚠️ 鍵**只列真的有雙峰的那幾項**（從 `DEFAULT_STAT_NORMALIZATION` 推導），
     * ⛔ 不是全部 11 項都開一格。理由是誠實：對 `ad`／`maxHealth` 這種沒有雙峰的
     * 屬性開一格「近戰/遠程各一把」，等於在後台長出 100 個永遠不該被填的欄位，
     * 而操作者沒有任何線索知道哪些是真的。
     * ⭐ 要新增一項雙階梯屬性本來就得先量出它的兩組錨點（= 改 `DEFAULT`），
     * 所以「schema 跟著 DEFAULT 走」不會擋住任何真實需求。
     */
    bandsByScale: z
      .object(
        Object.fromEntries(
          Object.keys(DEFAULT_STAT_NORMALIZATION.bandsByScale).map((k) => [
            k,
            z
              .object(Object.fromEntries(SCALE_KEYS.map((t) => [t, zBandsByScaleFor(k, t)])) as Record<string, NormBandValues>)
              .strict(),
          ]),
        ) as Record<string, z.ZodObject<Record<string, NormBandValues>>>,
      )
      .partial()
      .strict(),
    /**
     * ⭐ **出身 → 走哪一把尺**（owner 2026-08-16：「依出身套用普攻距離」）。
     * 🔴 ⛔ 不是 `attackType`：owner 那張 49 位的表裡 **10 位**兩者相反。
     * 缺一格出身 ⇒ 那個出身退回單尺 `bands`。
     */
    scaleByOrigin: z
      .object(
        Object.fromEntries(
          Object.keys(DEFAULT_STAT_NORMALIZATION.scaleByOrigin).map((k) => [k, zScaleByOriginRow(k)]),
        ) as Record<string, ReturnType<typeof zScaleByOriginRow>>,
      )
      .partial()
      .strict(),
    /** 四格定位表 —— owner 2026-08-12 逐字給的，留著當退路。 */
    byArchetype: z
      .object(
        Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormArchetypeBands(k)])) as Record<
          string,
          ReturnType<typeof zNormArchetypeBands>
        >,
      )
      .strict(),
    /** ⭐ 十格出身表，**優先於**上面那張。 */
    byOrigin: z
      .object(
        Object.fromEntries(NORMALIZED_STAT_KEYS.map((k) => [k, zNormOriginBands(k)])) as Record<
          string,
          ReturnType<typeof zNormOriginBands>
        >,
      )
      .strict(),
    /** 每一項寫進哪個通道。⚠️ `ms` 出貨走 `baseStats` 是量出來的機制限制。 */
    channel: z
      .object(
        Object.fromEntries(
          NORMALIZED_STAT_KEYS.map((k) => [
            k,
            z.enum(["baseStats", "growth"] as const).describe(
              say(
                `channel.${k}`,
                `@zh ${zhOf(k)}寫進哪個通道\n` +
                  "@note 「初始值」= 等級 1 就看得出差別；「每級成長」= 差異隨等級拉開，⚠️ 選人畫面上等級 1 看起來會一樣。\n" +
                  CHANNEL_OPTS,
              ),
            ),
          ]),
        ) as Record<string, z.ZodEnum<["baseStats", "growth"]>>,
      )
      .strict(),
    referenceLevel: z.number().int().min(2).max(99).describe(NORM_PROSE.referenceLevel!),
    /** 變身態往上位移幾格。出貨 1（本體中 → 變身大）。⛔ 0 = 變身與本體同級。 */
    transformBandShift: z.number().int().min(-4).max(4).describe(NORM_PROSE.transformBandShift!),
    allowNegativeGrowth: z.boolean().describe(NORM_PROSE.allowNegativeGrowth!),
    skipTransformedBodies: z.boolean().describe(NORM_PROSE.skipTransformedBodies!),
    /**
     * ⭐ GH#1024 A4（2026-09-06）：註冊表上的 `role` 由**出身**推導（`ORIGIN_TO_ARCHETYPE`），
     * 英雄卡的 `role` 格降為退路原始值。出貨 `true`；關掉 = 回到照抄英雄卡（今天的行為）。
     * 選填：缺席就走 `DEFAULT_STAT_NORMALIZATION.roleFromOrigin`（出貨檔可以晚一步補這一格）。
     * 量測與理由在 `statNormalization.ts` 的 `StatNormalization.roleFromOrigin`。
     */
    roleFromOrigin: z.boolean().optional().describe(NORM_PROSE.roleFromOrigin!),
    /**
     * ⭐ GH#1064（2026-09-07）：變身態的出身在**載入時**繼承本體（`transform.counterpartId`），
     * ⛔ 不烘進那 20 份文件。出貨 `true`；關掉 = 回到照自己的三圍推導（2026-09-07 之前的行為）。
     * 選填：缺席就走 `DEFAULT_STAT_NORMALIZATION.transformInheritsOrigin`。
     * 量測（20 具裡 16 具不同、最極端差 4 格）在 `statNormalization.ts` 的
     * `StatNormalization.transformInheritsOrigin`。
     */
    transformInheritsOrigin: z.boolean().optional().describe(NORM_PROSE.transformInheritsOrigin!),
  })
  .strict();

export const DEFAULT_STAT_NORMALIZATION_DOC = {
  id: STAT_NORMALIZATION_DOC_ID,
  schema: "config.stat-normalization@1",
  mode: DEFAULT_STAT_NORMALIZATION.mode,
  appliesTo: DEFAULT_STAT_NORMALIZATION.appliesTo,
  bands: DEFAULT_STAT_NORMALIZATION.bands,
  byArchetype: DEFAULT_STAT_NORMALIZATION.byArchetype,
  channel: DEFAULT_STAT_NORMALIZATION.channel,
  referenceLevel: DEFAULT_STAT_NORMALIZATION.referenceLevel,
  allowNegativeGrowth: DEFAULT_STAT_NORMALIZATION.allowNegativeGrowth,
  skipTransformedBodies: DEFAULT_STAT_NORMALIZATION.skipTransformedBodies,
  roleFromOrigin: DEFAULT_STAT_NORMALIZATION.roleFromOrigin,
  transformInheritsOrigin: DEFAULT_STAT_NORMALIZATION.transformInheritsOrigin,
} as const;
