/**
 * 鑄技工坊 · 特效綁定 — 後台 → 鑄技工坊 的純邏輯 (task #205 / #230 / #272).
 *
 * ---------------------------------------------------------------------------
 * 這一頁在解什麼問題
 * ---------------------------------------------------------------------------
 * 696 份技能文件裡 646 份的 `vfxKey` 真的解得到一份 vfx 文件 —— 所以「沒有特效」
 * 從來不是缺口。缺口是**畫的是不是原作畫的那個**:595 支指向 `fx.prim.*`,而那是
 * task #79 **照技能中文名猜**出來的合成原型(`bindings.ts` 自己的檔頭寫著
 * 「read off each ability's NAME — not evidence of what the original map drew」)。
 *
 * 所以這一頁的第一根柱子是**「原作用的是哪個模型」那一欄**:owner 要能一眼看出
 * 「這支技能現在畫的是猜的,原作其實是 WarStompCaster」。那一欄不是我編的,是讀
 * 出貨的 `content/assets/vfx/w3x-ability-provenance.json`(639 支技能 × 每一個
 * 美術通道的真實模型 + 它是怎麼來的)。
 *
 * 第二根柱子是 owner 的裁決:
 *
 *   > 「我的結論跟你類似,請你**盡量用編輯器的方式,彈性調整方式複用**」
 *   > 「WarStompCaster 常拿來**放大/縮小、改變顏色/透明度**後用於 Saber
 *   >   約束勝利之劍 等衝擊波特效」
 *
 * ⛔ 所以這裡沒有 33 個一次性特效,只有 **21 個家族原型 + per-invocation 參數**。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ SCHEMA 的權威在 shared,不在這裡
 * ---------------------------------------------------------------------------
 * `config.vfx-families@1` 的欄位、列舉成員與上下界全部定義在
 * `packages/shared/src/content/schema/vfx.ts`。這個檔案:
 *
 *   · **在執行期把列舉讀出來**(`zConfigVfxFamiliesDoc.shape.families.keySchema
 *     .options` 等),所以下拉選單的選項不可能和 schema 漂開 —— 沒有第二份手抄的
 *     家族清單可以忘記更新。
 *   · 上下界仍然寫在這裡(Zod 的 check 是內部結構,不該被後台反射),但
 *     `vfxForge.test.ts` 對**每一個**欄位用真的 `safeParse` 驗四個點
 *     (min / min−ε / max / max+ε)。後台收得下的值就是 schema 收得下的值,
 *     schema 一改這裡就紅。
 *
 * ⚠️ **ABSENT ≠ ZERO**(schema 檔頭明文):per-ability 少一格的意思是「原圖沒說,
 * 用家族預設」,**不是 0**。操作者把框清空時必須把那個 key 整個拿掉,寫 0 會把
 * 「沒說」變成「明確要求 0」——例如 alpha 0 = 完全看不見。
 *
 * ⚠️ **綁定不走 ability doc 的 `spawnVfx`**,走 `vfxKey` → `ContentDb.vfxFor`。
 * 掃錯欄位會得到「99% 技能沒有 VFX」這種戲劇化但完全假的結論,所以這裡任何
 * 「現在畫的是什麼」的判斷都經過 `vfxDocIdFor()`(和 `vfxFor` 同一件事:拿 key
 * 去 registry 查,查不到就是 null),**不是**看 `vfxKey` 這個欄位在不在。
 *
 * 寫入走 durable content overlay(`putOverlayDoc`),和 屬性上限 / 變身外觀 /
 * 殭屍波系統 同一條路 —— 那是唯一撐得過 `docker compose build` 的可寫表面。
 */
import {
  zConfigVfxFamiliesDoc,
  zVfxAbilityFamilyBinding,
  zVfxFamilyTuning,
  type ConfigVfxFamiliesDoc,
  type VfxAbilityFamilyBinding,
  type VfxFamilyTuning,
  type W3xFamilyId,
} from "@ggd/shared/content/schema/vfx";
import { DEFAULT_MAX_ABILITY_VFX_LAYERS } from "@ggd/shared/content/schema/abilityVfx";
import { parseIndex, type IndexEntry } from "./content";

/** 重新匯出,讓頁面只從這一個模組拿鑄技工坊要的東西(和其他常數同一條路)。 */
export { DEFAULT_MAX_ABILITY_VFX_LAYERS };

// ---------------------------------------------------------------------------
// 文件座標
// ---------------------------------------------------------------------------

export const VFX_FAMILIES_COLLECTION = "config";
export const VFX_FAMILIES_DOC_ID = "vfx-families";
export const VFX_FAMILIES_SCHEMA = "config.vfx-families@1";

/** 出貨的技能／特效／普查三份資料在 `/content` 掛載點下的位置。 */
export const ABILITY_INDEX_PATH = "abilities/_index.json";
export const VFX_INDEX_PATH = "vfx/_index.json";
export const CENSUS_PATH = "assets/vfx/w3x-ability-provenance.json";

// ---------------------------------------------------------------------------
// 列舉 —— 執行期從 shared 的 Zod schema 讀出來,不手抄
// ---------------------------------------------------------------------------

interface EnumLike {
  readonly options: readonly string[];
}

/**
 * `z.enum([...])` 在執行期帶著 `.options`;`z.record(key, value)` 帶著
 * `.keySchema`。兩者都是 Zod 的公開表面(不是 `_def` 內部結構),所以後台可以
 * 直接把 schema 的成員清單畫成下拉選單 —— **一份清單,不是兩份**。
 */
function enumOptions(schema: unknown): readonly string[] {
  return (schema as EnumLike).options;
}

export const FAMILY_IDS: readonly W3xFamilyId[] = enumOptions(
  (zConfigVfxFamiliesDoc.shape.families as unknown as { keySchema: unknown }).keySchema,
) as readonly W3xFamilyId[];

export const PRIMITIVE_KINDS: readonly string[] = enumOptions(zVfxFamilyTuning.shape.primitive);
export const ELEMENT_IDS: readonly string[] = enumOptions(zVfxFamilyTuning.shape.element);

/** owner 面向的中文家族名 —— 和普查報告上的名字一樣。 */
export const FAMILY_LABEL_ZH: Readonly<Record<string, string>> = {
  shockwaveRing: "衝擊波環",
  blink: "閃現",
  burst: "爆裂",
  dissipate: "消散",
  missile: "飛彈",
  boltStrike: "雷擊",
  tornado: "龍捲",
  groundDust: "地面塵土",
  flamePillar: "火柱",
  mirrorImage: "分身",
  resurrect: "復活光",
  mark: "印記",
  lightColumn: "書／光柱",
  portal: "傳送門",
  breath: "吐息",
  levelUp: "升級光",
  cloud: "雲",
  shine: "閃光",
  blood: "血",
  starfall: "星墜",
  uncategorised: "未分類（自訂匯入）",
};

export const ELEMENT_LABEL_ZH: Readonly<Record<string, string>> = {
  fire: "火 fire",
  ice: "冰 ice",
  lightning: "雷 lightning",
  wind: "風 wind",
  earth: "土 earth",
  holy: "聖光 holy",
  void: "闇 void",
  physical: "物理 physical",
  nature: "自然 nature",
  arcane: "秘法 arcane",
  blood: "血 blood",
  ki: "氣 ki",
  sound: "音 sound",
};

export function familyLabel(id: string): string {
  return FAMILY_LABEL_ZH[id] ?? id;
}

/**
 * 每個家族在原圖真的用的模型檔名(小寫、無副檔名)。
 *
 * 這是「原作用的是哪個模型」那一欄反查家族的鍵,也是 drift 守衛的對象:每個家族
 * 至少要有一個 stem 真的出現在出貨的普查檔裡,否則這一列在說謊。
 *
 * 幾個 owner 清單以外的拼法是刻意加的:`phoenix-missile` / `phoenix_missile_mini`
 * 是同一顆飛彈的別種寫法,`starfallcaster` 是星墜在這份普查裡真正出現的那一個
 * (`starfalltarget` 一次都沒出現),`earthtornado2` / `lightningtornado` 是原圖
 * 自訂的龍捲。少寫它們,反查就會把真的證據判成「沒有」。
 *
 * `uncategorised` 是 `Boomnl.mdx` —— 2,623 byte 的自訂匯入,內部名稱就叫
 * `KABOOM`,0 個 geoset、1 個 `BlizParticle01` 發射器、`Clouds8x8Fire.blp`
 * 8×8 火焰 sprite、additive、紅→橙→黃,就是一顆純火焰爆炸煙團。
 */
export const FAMILY_MODELS: Readonly<Record<string, readonly string[]>> = {
  shockwaveRing: ["warstompcaster", "thunderclapcaster"],
  blink: ["blinktarget", "blinkcaster"],
  burst: [
    "stampedemissiledeath",
    "neutralbuildingexplosion",
    "steamtankimpact",
    "abominationexplosion",
    "firelorddeathexplode",
    "doomdeath",
  ],
  dissipate: ["nagadeath", "hcanceldeath", "undeaddissipate"],
  missile: ["phoenix_missile", "phoenix-missile", "phoenix_missile_mini", "ancientprotectormissile"],
  boltStrike: ["monsoonbolttarget"],
  tornado: ["tornadoelemental", "tornadoelementalsmall", "earthtornado2", "lightningtornado"],
  groundDust: ["impaletargetdust"],
  flamePillar: ["flamestriketarget"],
  mirrorImage: ["mirrorimagecaster"],
  resurrect: ["resurrecttarget", "resurrectcaster"],
  mark: ["markofchaostarget"],
  lightColumn: ["tomeofretrainingcaster"],
  portal: ["darkportaltarget"],
  breath: ["bloodbreathstream"],
  levelUp: ["levelupcaster"],
  cloud: ["herocloudcyd"],
  shine: ["supershinythingy"],
  blood: ["herobloodelfblood"],
  starfall: ["starfallcaster", "starfalltarget"],
  uncategorised: ["boomnl"],
};

/** 「它影響什麼」,不是複述家族名。 */
export const FAMILY_HINT: Readonly<Record<string, string>> = {
  shockwaveRing: "腳下炸開的一圈環。原圖最重的家族，Saber 約束勝利之劍 就是它放大染色來的",
  blink: "瞬移的前後殘影。原圖 118 次裡 76 次是 JASS 直接呼叫的，位移技幾乎都用它",
  burst: "一次性的爆炸煙團，命中點或死亡點用。調大 scale 就是大招的收尾",
  dissipate: "往上飄散然後不見。死亡、驅散、變回本體的那一下",
  missile: "會飛的彈體本身（不是命中特效）。timeScale 調長 = 飛得慢、看得到",
  boltStrike: "從天打下來的一道。原圖最大 scale 出現在這裡（w3a 10.0 再乘 JASS 的 300%）",
  tornado: "持續旋轉的柱狀氣流。原圖這個家族的 flyHeight 跨 −1000～100，位置比大小重要",
  groundDust: "貼地掀起的沙塵。高度設 0 附近才對，設高了會變成半空中的煙",
  flamePillar: "地面竄起的一根柱子。高度決定它燒到多高，不是決定它出現在哪",
  mirrorImage: "分裂／召喚出現的那一下。alpha 壓低會像幻影，拉滿像實體",
  resurrect: "由下往上包住目標的柔光。復活、治療、無敵護盾都吃這個",
  mark: "貼在目標身上的符號，持續性的標記感。多半配高一點的位置",
  lightColumn: "直上直下的一道光。學習、升級、拾取這類「拿到東西」的回饋",
  portal: "開一個洞的環狀漩渦。timeScale 拉長才看得出是「門」而不是「爆炸」",
  breath: "從嘴部噴出去的錐狀流。錨點選 head 才會從臉噴，選 origin 會從肚臍噴",
  levelUp: "由下往上的環狀上升光。變強了的那一下，持續型 buff 也常借它",
  cloud: "慢慢飄的一團。毒霧、沼氣、範圍持續傷害的地面雲",
  shine: "短促的一閃。強化、暴擊、命中確認這種要「有感但不擋畫面」的回饋",
  blood: "噴濺的血點。受擊回饋，alpha 是這一個最該調的旋鈕",
  starfall: "天上掉下來的多發小體。大範圍持續轟炸的視覺",
  uncategorised: "原圖自訂匯入的 Boomnl.mdx（內部名稱 KABOOM），一顆純火焰爆炸煙團",
};

/** 原圖模型檔名 → 家族。反查表由 `FAMILY_MODELS` 生成,不手抄。 */
const FAMILY_BY_MODEL: ReadonlyMap<string, W3xFamilyId> = new Map(
  Object.entries(FAMILY_MODELS).flatMap(([fam, models]) =>
    models.map((m) => [m, fam as W3xFamilyId] as const),
  ),
);

export function familyForModel(stem: string): W3xFamilyId | null {
  return FAMILY_BY_MODEL.get(stem.trim().toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// 上下界
// ---------------------------------------------------------------------------

export interface ForgeBound {
  readonly min: number;
  readonly max: number;
  readonly int?: boolean;
}

/**
 * ⚠️ **每一條都有 max** —— 這是 CLAUDE.md 點名的那個洞:`validateField` 在
 * 2026-07-29 之前只檢查 `min`,所以 50 打成 500 會過後台、在下游才被拒或被靜默
 * 夾掉(同 GH#277 / GH#279)。
 *
 * 這些數字**不是我挑的**,是 `packages/shared/src/content/schema/vfx.ts` 的
 * Zod 定義。`vfxForge.test.ts` 對每一格用真的 `safeParse` 驗 min / min−ε /
 * max / max+ε 四個點,所以 schema 一動這裡就紅 —— 抄錯一個數字不可能靜靜留著。
 */
export const GLOBAL_BOUNDS: Readonly<Record<string, ForgeBound>> = {
  scaleGain: { min: 0, max: 1 },
  scaleMin: { min: 0.1, max: 4 },
  scaleMax: { min: 0.2, max: 8 },
  // #205 多層特效模板的層數上限。上界 6 = `ABILITY_VFX_LAYER_HARD_CAP`,
  // 下界 1 = 「至少還有主特效那一層」。整數。
  maxAbilityVfxLayers: { min: 1, max: 6, int: true },
  // owner 2026-07-30 (a) —— 一次性粒子壽命上限(秒)。上下界的推導寫在
  // `MIN_/MAX_ONE_SHOT_MAX_LIFE_SEC` 的註解裡(3 秒 = 12 人混戰會吃掉九成畫面
  // 粒子預算的那條線;0.1 秒 = 手機 30fps 的 3 張畫面)。
  oneShotMaxLifeSec: { min: 0.1, max: 3 },
  // #251 owner「投射物特效沒有真實套用」—— 彈道體積跟 `hitRadius` 走多少。
  // 上下界 0/3 是 `MIN_/MAX_PROJECTILE_RADIUS_GAIN`,推導寫在那兩個常數上面
  // (上界 3 擋的是「內容側把 hitRadius 寫大」被畫面再放大三次)。
  projectileRadiusGain: { min: 0, max: 3 },
  // 彈道飛在離地多高。下界 0.2 = 再低就埋進地板;上界 4 = 再高就飛出構圖。
  projectileFlyHeightY: { min: 0.2, max: 4 },
};

export const FAMILY_BOUNDS: Readonly<Record<string, ForgeBound>> = {
  scale: { min: 0.1, max: 6 },
  alpha: { min: 0.05, max: 1 },
  timeScale: { min: 0.2, max: 4 },
  heightY: { min: 0, max: 8 },
};

export const ABILITY_BOUNDS: Readonly<Record<string, ForgeBound>> = {
  w3xScale: { min: 0.05, max: 20 },
  flyHeight: { min: -2000, max: 2000 },
  alpha: { min: 0.05, max: 1 },
  timeScale: { min: 0.2, max: 4 },
  tintR: { min: 0, max: 255, int: true },
  tintG: { min: 0, max: 255, int: true },
  tintB: { min: 0, max: 255, int: true },
  // #366 方位 —— owner 的四個參數裡唯一一個以前後台碰不到的
  facingDeg: { min: -360, max: 360 },
  pitchDeg: { min: -180, max: 180 },
};

export const GLOBAL_FIELDS = [
  "scaleGain",
  "scaleMin",
  "scaleMax",
  "maxAbilityVfxLayers",
  "oneShotMaxLifeSec",
  "projectileRadiusGain",
  "projectileFlyHeightY",
] as const;
export type GlobalField = (typeof GLOBAL_FIELDS)[number];

/**
 * #251 —— 全域的**選擇題**欄位（下拉，不是數字框）。
 *
 * 它們和 `GLOBAL_FIELDS` 分開是因為驗證與 UI 元件都不同（數字有上下界，選擇題
 * 只有「是不是清單裡的一個」），但**存檔路徑是同一條**：`familiesDocFor` 必須
 * 一樣把它們帶上，否則操作者按存檔就會把它們從文件裡刪掉、而畫面上那一格還好好
 * 地顯示著他選的值。`vfxForge.test.ts` 的 round-trip 守衛涵蓋這兩張表。
 */
export const GLOBAL_CHOICE_FIELDS = ["castHeightSource", "projectileArtFromDoc"] as const;
export type GlobalChoiceField = (typeof GLOBAL_CHOICE_FIELDS)[number];

/** 每一格的選項（value 是存進文件的字串，boolean 欄位用 "1"/"0"）。 */
export const GLOBAL_CHOICE_OPTIONS: Readonly<
  Record<GlobalChoiceField, readonly { readonly value: string; readonly label: string }[]>
> = {
  castHeightSource: [
    { value: "ground", label: "貼地家族回到地板（出貨）" },
    { value: "flat", label: "全部固定在胸口 y=1.0（升級前）" },
    { value: "family", label: "每個家族都用自己的高度（含從天而降的）" },
  ],
  projectileArtFromDoc: [
    { value: "1", label: "開：彈道套用自己的特效文件（出貨）" },
    { value: "0", label: "關：固定彗星，只換顏色（升級前）" },
  ],
};

export const FAMILY_FIELDS = [
  "enabled",
  "primitive",
  "element",
  "scale",
  "alpha",
  "timeScale",
  "heightY",
] as const;
export type FamilyField = (typeof FAMILY_FIELDS)[number];

export const ABILITY_FIELDS = [
  "family",
  "enabled",
  "w3xScale",
  "tintR",
  "tintG",
  "tintB",
  "flyHeight",
  "alpha",
  "timeScale",
  "facingDeg",
  "pitchDeg",
  "anchor",
] as const;
export type AbilityField = (typeof ABILITY_FIELDS)[number];

export const FIELD_LABEL: Readonly<Record<string, string>> = {
  scaleGain: "縮放採用度",
  scaleMin: "縮放下限",
  scaleMax: "縮放上限",
  maxAbilityVfxLayers: "單技能特效層數上限",
  oneShotMaxLifeSec: "餘燼壽命上限（秒）",
  castHeightSource: "施法特效高度",
  projectileArtFromDoc: "彈道套用特效文件",
  projectileRadiusGain: "彈道大小跟半徑",
  projectileFlyHeightY: "彈道飛行高度",
  enabled: "啟用",
  primitive: "形狀",
  element: "元素",
  scale: "家族基準大小",
  alpha: "家族基準透明度",
  timeScale: "家族基準時間倍率",
  heightY: "家族基準高度",
  family: "家族原型",
  w3xScale: "原圖縮放",
  tintR: "紅",
  tintG: "綠",
  tintB: "藍",
  flyHeight: "原圖飛行高度",
  facingDeg: "方位角",
  pitchDeg: "仰角",
  anchor: "錨點",
};

/** 說明寫「它影響什麼」。 */
export const FIELD_HINT: Readonly<Record<string, string>> = {
  scaleGain:
    "原圖那些 1.0～10.0 的倍率要照抄多少。0 = 完全不管原圖，每一招一樣大；1 = 照單全收，一個 10.0 會塞滿整個畫面",
  scaleMin: "壓縮後的最小值，避免小到看不見",
  scaleMax: "壓縮後的最大值，這是「再怎麼放大也不會擋住畫面」的那條線",
  maxAbilityVfxLayers:
    "一支技能的 vfxLayers 最多播幾層。多出來的層直接不播（從後面砍，主特效永遠留著）。" +
    "調小 = 手機端省畫面預算；6 是硬上限，因為一層至少吃一個發射器，" +
    "12 個人同時放到滿就會逼近整個畫面的發射器預算",
  oneShotMaxLifeSec:
    "施法／命中／死亡這類一次性特效的粒子最久活多久。這是「爆完之後那一圈餘燼還能留多久」那一格：" +
    "匯入的原圖文件壽命有 1～6 秒，照播會讓每一次施法在畫面上留一團化不開的霧，所以播放端一律夾到這個上限。" +
    "0.6 = 出貨值（乾淨俐落的打擊感）；拉到 1.5～2 才看得到明顯的餘燼尾巴。" +
    "⚠️ 上限 3 秒不是隨便訂的：12 個人各疊 5 層、每層 80 顆、平均兩秒放一招，" +
    "3 秒壽命就會吃掉整個畫面 8,000 顆粒子預算的九成 —— 那就是畫面變成霧的那條線。" +
    "另外這一格只會往下夾，不會把短的特效拉長：原本 0.3 秒的爆炸不會因為調大而變長",
  castHeightSource:
    "施法特效要不要用家族自己算出來的高度。" +
    "2026-08-01 實測：91 支「衝擊波環」畫出 105 個發射器，世界高度全部是 1.0（胸口），" +
    "而那個家族設定的是 0.15（貼地的環）—— 也就是「家族基準高度」那一格以前算得出來但沒送到播放端。" +
    "貼地家族回到地板 = 只讓想往下的家族往下（環／塵土／火柱／光柱），從天而降的（雷擊 3.2、流星 3.5）維持不動，" +
    "所以特效只會更靠近地板、不可能飛出畫面上緣；" +
    "每個家族都用自己的高度 = 連往上那一半也照做（會改到 200 多支技能的構圖，先看過畫面再開）；" +
    "全部固定在胸口 = 升級前的行為，改壞了用這一格退回去，不用重新出 client",
  projectileArtFromDoc:
    "飛在空中的子彈要不要真的套用它自己那份特效文件（大小／壽命／密度／混色）。" +
    "2026-08-01 實測：把文件的顆數 40→200、大小→9、壽命→3 秒、混色→alpha 全部改掉，" +
    "引擎手上那顆發射器一格都沒動 —— 文件唯一到得了畫面的只有顏色與貼圖，" +
    "所以一顆冰彈、一道貫穿波、一發平砍在畫面上是同一顆彗星換個顏色。" +
    "關掉 = 回到那個固定彗星",
  projectileRadiusGain:
    "子彈畫多大要跟它真正的打擊半徑走多少。0 = 全部一樣大（升級前的畫面）；1 = 完全跟著走。" +
    "出貨的子彈半徑有三檔：平砍 0.4、單發彈 0.5、貫穿波 0.9 —— 調到 1 之後貫穿波在畫面上就真的比平砍大，" +
    "玩家看得出哪一發會穿人。上限 3 是「還看得出那是一顆飛行物」的那條線",
  projectileFlyHeightY:
    "子彈飛在離地多高（世界單位）。1 ≈ 胸口。調低會擦地飛、調高會從頭頂過；" +
    "低於 0.2 會埋進地板（等於看不見），高於 4 會飛出戰鬥鏡頭的構圖（玩家看不到子彈從哪來）",
  enabled: "關掉之後這一層不再覆寫，技能回到依名字猜出來的 fx.prim.* 分類",
  primitive: "決定形狀（剪影）。同一個家族換形狀就是整批技能一起換長相",
  element: "決定顏色。技能自己沒有原圖 tint 時用這個",
  scale: "這個家族的基準大小，1 = 原型本來的大小。每一招的原圖倍率再疊在這之上",
  heightY:
    "特效播在離地多高（世界單位）。0.1 = 貼地的環，1 = 胸口，3.5 = 頭頂上方。" +
    "⚠️ 這一格要不要生效，看上面「施法特效高度」那一個下拉：" +
    "出貨的「貼地家族回到地板」只採用比 1.0 低的值（往上的仍然固定在 1.0），" +
    "選「每個家族都用自己的高度」才會連往上那一半也照做，選「全部固定在胸口」則整格不生效",
  family: "這一招要播哪一個家族原型。留白 = 沿用出貨的綁定",
  w3xScale:
    "原圖給這個呼叫點的 usca / SetUnitScalePercent。留白 = 原圖沒說，用家族基準；填了才會走上面的壓縮曲線",
  tintR: "原圖給這個呼叫點的頂點顏色，0–255（和 w3u 的 uclr 同一個座標系）。三格留白 = 用元素的顏色",
  tintG: "0–255，留白 = 用元素的顏色",
  tintB: "0–255，留白 = 用元素的顏色",
  flyHeight:
    "原圖的 SetUnitFlyHeight，WC3 單位（128 單位 = 1 世界單位）。留白 = 用家族高度；" +
    "填了會疊在家族基準高度上（負值代表原圖把替身藏在地形底下，會被夾在地板之上）。" +
    "⚠️ 和「家族基準高度」共用同一個開關：上面「施法特效高度」選「全部固定在胸口」時整格不生效",
  facingDeg:
    "這一招的特效朝哪個方向噴，度，0 = +X、90 = +Z。留白 = 0。" +
    "⚠️ 只有**有方向的形狀**看得出來（beam / bolt / dash / slash / breath / missile）；" +
    "球狀的 nova / pulse 轉了也長一樣",
  pitchDeg:
    "特效的仰角，度。**90 = 直立**（出貨，柱狀往上長），**0 = 完全橫放**。" +
    "「橫放的柱狀砲」就是把 column 那一族填 0。留白 = 90，也就是升級前的行為",
  // ⚠️ alpha / timeScale 兩個名字在「家族」和「單支技能」兩張表都出現。這裡**只能
  // 有一份**（重複的 key 會被 JS 靜默吃掉最後一個，tsc 才抓得到），所以文案要同時
  // 說得通兩邊：家族那格是基準，技能那格是覆寫。
  alpha: "不透明度。家族那一張是基準，單支技能那一格覆寫它；留白 = 用家族基準。壓低 = 幻影感",
  timeScale: "壽命倍率。>1 = 慢而長，<1 = 快而脆。家族那一張是基準，單支技能那一格覆寫它；留白 = 用家族基準",
  anchor:
    "WC3 的掛點字串，原封不動（\"chest\" / \"origin\" / \"right,hand\"）。留白 = 不掛骨頭。" +
    "⚠️ 施法特效走的是共用粒子池那條路，那條路不做骨骼掛載，所以這一格目前不生效",
};

/**
 * 這一格**目前算得出來但沒有送到播放端**（第②號故障），文案已經照實寫。
 *
 * ⚠️ 這不是「留著當裝飾」——是 owner 還沒裁決要「接上去」還是「拿掉欄位」：
 *   · `anchor` —— pooled cast path 結構上沒有 bone parenting（和多層堆疊刻意不
 *     開 `anchor` 是同一個理由）。要它生效得先讓 `play()` 會解掛點。
 *
 * 這張清單縮短過兩次，兩次都是因為那一格**真的接上去了**：
 *   · 2026-07-30 `alpha` / `timeScale`（`familyRow()` 搬進 `W3xAbilityArt`，
 *     `playCastVfx` 用 `applyVfxOverrides` 套上去）。守衛
 *     `apps/client/src/vfx/VfxSystem.familyKnobs.test.ts` 讀的是 Babylon 真的
 *     拿到的顏色梯度與壽命，不是「函式回傳了 0.35」。
 *   · 2026-08-01 #251 `heightY` / `flyHeight`（同一行、同一個蒸發點）。要不要
 *     採用由全域的「施法特效高度」下拉決定，出貨值只讓**貼地**的家族回到地板。
 *     守衛 `apps/client/src/render/vfx/castHeightApplied.test.ts` 讀的是
 *     `scene.particleSystems` 上 emitter 的世界 Y。
 */
export const DEAD_FAMILY_KNOBS: readonly string[] = ["anchor"];

export const DEAD_KNOB_NOTE =
  "⚠️ 家族／技能綁定裡的「錨點」那一格目前不生效（算得出來但沒有送到播放端）——" +
  "施法特效走的是共用粒子池，那條路不做骨骼掛載。要把特效掛在某根骨頭上，" +
  "請用下面每一支技能自己的「多層特效堆疊」。" +
  "（「家族基準高度」與「原圖飛行高度」已經在 2026-08-01 接上去了，" +
  "由上面的「施法特效高度」下拉決定採用範圍。）";

// ---------------------------------------------------------------------------
// 讀 / 寫文件
// ---------------------------------------------------------------------------

/**
 * 讀 API 回來的東西。**用 shared 自己的 Zod 解**,所以後台看到的合法性和伺服器
 * 看到的是同一套;schema 不對(例如一份存錯地方的 combat-env)就回 null,而不是
 * 被當成家族表讀進來然後畫出一堆不存在的家族。
 */
export function extractFamiliesDoc(raw: unknown): ConfigVfxFamiliesDoc | null {
  if (!raw || typeof raw !== "object") return null;
  if ((raw as { schema?: unknown }).schema !== VFX_FAMILIES_SCHEMA) return null;
  const parsed = zConfigVfxFamiliesDoc.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** 要 PUT 的文件。永遠送**整張表**,不是只送被改的那一列。 */
export function familiesDocFor(doc: ConfigVfxFamiliesDoc): ConfigVfxFamiliesDoc {
  const abilities: Record<string, VfxAbilityFamilyBinding> = {};
  for (const id of Object.keys(doc.abilities).sort()) {
    const e = doc.abilities[id];
    if (e) abilities[id] = e;
  }
  const families: Record<string, VfxFamilyTuning> = {};
  for (const id of FAMILY_IDS) {
    const t = doc.families[id];
    if (t) families[id] = t;
  }
  return {
    id: VFX_FAMILIES_DOC_ID,
    schema: VFX_FAMILIES_SCHEMA,
    enabled: doc.enabled,
    scaleGain: doc.scaleGain,
    scaleMin: doc.scaleMin,
    scaleMax: doc.scaleMax,
    // ⚠️ #205 —— 這一行漏掉的話,後台按存檔就會把層數上限**從文件裡刪掉**,
    // 而畫面上那一格看起來還好好地填著值。`vfxForge.test.ts` 有一條 round-trip
    // 守衛盯著這件事(每一個 GLOBAL_FIELD 都要走完一圈回得來)。
    maxAbilityVfxLayers: doc.maxAbilityVfxLayers,
    // ⚠️ 同上 —— 少寫這一行,操作者按存檔就會把餘燼壽命上限從文件裡刪掉,
    // 而畫面上那一格還好好地填著 2.0。round-trip 守衛盯著每一個 GLOBAL_FIELD。
    oneShotMaxLifeSec: doc.oneShotMaxLifeSec,
    // ⚠️ #251 —— 同樣的四行。少寫任何一行，操作者按存檔就把那一格從文件裡刪掉，
    // 而畫面上還好好地顯示著他選的值（下一次載入才會發現變回出貨預設）。
    // round-trip 守衛涵蓋 `GLOBAL_FIELDS` + `GLOBAL_CHOICE_FIELDS` 兩張表。
    castHeightSource: doc.castHeightSource,
    projectileArtFromDoc: doc.projectileArtFromDoc,
    projectileRadiusGain: doc.projectileRadiusGain,
    projectileFlyHeightY: doc.projectileFlyHeightY,
    families: families as ConfigVfxFamiliesDoc["families"],
    abilities,
  };
}

export function setFamilyTuning(
  doc: ConfigVfxFamiliesDoc,
  family: W3xFamilyId,
  tuning: VfxFamilyTuning,
): ConfigVfxFamiliesDoc {
  return { ...doc, families: { ...doc.families, [family]: tuning } };
}

export function setAbilityBinding(
  doc: ConfigVfxFamiliesDoc,
  abilityId: string,
  binding: VfxAbilityFamilyBinding,
): ConfigVfxFamiliesDoc {
  return { ...doc, abilities: { ...doc.abilities, [abilityId]: binding } };
}

export function clearAbilityBinding(doc: ConfigVfxFamiliesDoc, abilityId: string): ConfigVfxFamiliesDoc {
  const abilities = { ...doc.abilities };
  delete abilities[abilityId];
  return { ...doc, abilities };
}

// ---------------------------------------------------------------------------
// 草稿 ⇄ 文件 (表單是字串,文件是數字)
// ---------------------------------------------------------------------------

export type FamilyDraft = Record<FamilyField, string>;
export type AbilityDraft = Record<AbilityField, string>;

function numText(v: number | undefined): string {
  return v === undefined ? "" : String(v);
}

export function familyDraftFrom(t: VfxFamilyTuning): FamilyDraft {
  return {
    enabled: t.enabled ? "1" : "0",
    primitive: t.primitive,
    element: t.element,
    scale: String(t.scale),
    alpha: String(t.alpha),
    timeScale: String(t.timeScale),
    heightY: String(t.heightY),
  };
}

export function abilityDraftFrom(b: VfxAbilityFamilyBinding | null): AbilityDraft {
  return {
    family: b?.family ?? "",
    enabled: b?.enabled === undefined ? "" : b.enabled ? "1" : "0",
    w3xScale: numText(b?.w3xScale),
    tintR: numText(b?.tint?.[0]),
    tintG: numText(b?.tint?.[1]),
    tintB: numText(b?.tint?.[2]),
    flyHeight: numText(b?.flyHeight),
    alpha: numText(b?.alpha),
    timeScale: numText(b?.timeScale),
    facingDeg: numText(b?.facingDeg),
    pitchDeg: numText(b?.pitchDeg),
    anchor: b?.anchor ?? "",
  };
}

function checkNumber(bound: ForgeBound, text: string, optional: boolean): string {
  const t = text.trim();
  if (t === "") return optional ? "" : "必填";
  const n = Number(t);
  if (!Number.isFinite(n)) return "必須是數字";
  if (bound.int && !Number.isInteger(n)) return "必須是整數";
  if (n < bound.min) return `不能小於 ${bound.min}`;
  // ⚠️ 上界和下界一樣重要。越界回訊息、由頁面關掉儲存鈕,**不夾值** ——
  // 靜默 clamp 會讓操作者以為存進去的是他打的那個數字。
  if (n > bound.max) return `不能大於 ${bound.max}`;
  return "";
}

/**
 * 全域欄位裡**可以留白**的那些。
 *
 * ⚠️ 這不是裝飾:`maxAbilityVfxLayers` 在 schema 上是 optional(舊的 durable
 * overlay 沒有這一格),所以後台不可以在讀進來的時候幫它填一個預設值 ——
 * 那樣一來「只是打開頁面看一眼」就會讓整份文件變成 dirty,儲存鈕亮起來,
 * 操作者一按就把一個他從來沒選過的值寫進線上。`vfxForgeSave.test.ts` 的
 * 「打開一列只是看 —— 沒有真的改動時儲存鈕是關的」就是釘這件事的,而我第一版
 * 真的把它弄紅了。留白 = 不寫這個 key = 用出貨預設。
 */
export const OPTIONAL_GLOBAL_FIELDS: ReadonlySet<string> = new Set([
  "maxAbilityVfxLayers",
  "oneShotMaxLifeSec",
  // #251 —— 同一條規則：schema 上是 optional，所以留白必須合法，否則舊 overlay
  // 一打開就是 dirty。留白 = 不寫這個 key = 用出貨預設。
  "projectileRadiusGain",
  "projectileFlyHeightY",
]);

export function validateGlobalField(field: GlobalField, text: string): string {
  const b = GLOBAL_BOUNDS[field];
  if (!b) return "";
  return checkNumber(b, text, OPTIONAL_GLOBAL_FIELDS.has(field));
}

/**
 * #251 —— 選擇題欄位的驗證。留白 = 沒設過 = 用出貨預設（schema 上 optional，
 * 和數字那些一模一樣的理由）；填了就必須是清單裡的一個。
 */
export function validateGlobalChoiceField(field: GlobalChoiceField, text: string): string {
  const t = text.trim();
  if (t === "") return "";
  return GLOBAL_CHOICE_OPTIONS[field].some((o) => o.value === t) ? "" : "不是一個可選的值";
}

export function validateFamilyField(field: FamilyField, text: string): string {
  const t = text.trim();
  if (field === "enabled") return t === "1" || t === "0" ? "" : "只能是開或關";
  if (field === "primitive") return PRIMITIVE_KINDS.includes(t) ? "" : "必填：請選一個形狀";
  if (field === "element") return ELEMENT_IDS.includes(t) ? "" : "必填：請選一個元素";
  const b = FAMILY_BOUNDS[field];
  return b ? checkNumber(b, t, false) : "";
}

export function validateAbilityField(field: AbilityField, text: string): string {
  const t = text.trim();
  if (field === "family") {
    if (t === "") return "";
    return (FAMILY_IDS as readonly string[]).includes(t) ? "" : "不是一個已知的家族";
  }
  if (field === "enabled") {
    if (t === "") return "";
    return t === "1" || t === "0" ? "" : "只能是開或關";
  }
  if (field === "anchor") {
    if (t === "") return "";
    if (t.length > 32) return "不能超過 32 個字";
    return "";
  }
  const b = ABILITY_BOUNDS[field];
  return b ? checkNumber(b, t, true) : "";
}

export type FamilyErrors = Partial<Record<FamilyField, string>>;
export type AbilityErrors = Partial<Record<AbilityField, string>>;

export function validateFamilyDraft(d: FamilyDraft): FamilyErrors {
  const errs: FamilyErrors = {};
  for (const f of FAMILY_FIELDS) {
    const e = validateFamilyField(f, d[f]);
    if (e) errs[f] = e;
  }
  return errs;
}

export function validateAbilityDraft(d: AbilityDraft): AbilityErrors {
  const errs: AbilityErrors = {};
  for (const f of ABILITY_FIELDS) {
    const e = validateAbilityField(f, d[f]);
    if (e) errs[f] = e;
  }
  const filled = (["tintR", "tintG", "tintB"] as const).filter((f) => d[f].trim() !== "");
  if (filled.length > 0 && filled.length < 3) {
    // 只填紅色 = 綠藍當 0 = 特效變成純紅。原圖的 tint 一定是三格一起寫的。
    for (const f of ["tintR", "tintG", "tintB"] as const) {
      if (d[f].trim() === "") errs[f] = "顏色要三格一起填（或三格都留白）";
    }
  }
  return errs;
}

export function familyTuningFromDraft(d: FamilyDraft): VfxFamilyTuning | null {
  if (Object.keys(validateFamilyDraft(d)).length > 0) return null;
  const candidate = {
    enabled: d.enabled.trim() === "1",
    primitive: d.primitive.trim(),
    element: d.element.trim(),
    scale: Number(d.scale),
    alpha: Number(d.alpha),
    timeScale: Number(d.timeScale),
    heightY: Number(d.heightY),
  };
  // shared 的 Zod 是最後一道 —— 後台自己的檢查漏了什麼,這裡會擋下來。
  const parsed = zVfxFamilyTuning.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * 草稿 → per-ability 綁定。
 *
 * ⚠️ **留白的格子整個不寫進去**(schema 檔頭的 ABSENT ≠ ZERO)。寫 0 會把
 * 「原圖沒說,用家族預設」變成「明確要求 0」—— alpha 0 就是完全看不見,而畫面上
 * 看起來只是一個空欄位。
 *
 * 每一格都留白時回 null:一筆什麼都沒說的綁定不該存在,存了只會讓文件變大、
 * 讓 「已改過幾支」 這個數字說謊。
 */
export function abilityBindingFromDraft(d: AbilityDraft): VfxAbilityFamilyBinding | null {
  if (Object.keys(validateAbilityDraft(d)).length > 0) return null;
  const out: Record<string, unknown> = {};
  const fam = d.family.trim();
  if (fam !== "") out["family"] = fam;
  const en = d.enabled.trim();
  if (en !== "") out["enabled"] = en === "1";
  const num = (f: AbilityField): number | undefined => {
    const t = d[f].trim();
    return t === "" ? undefined : Number(t);
  };
  const w3xScale = num("w3xScale");
  if (w3xScale !== undefined) out["w3xScale"] = w3xScale;
  const flyHeight = num("flyHeight");
  if (flyHeight !== undefined) out["flyHeight"] = flyHeight;
  const alpha = num("alpha");
  if (alpha !== undefined) out["alpha"] = alpha;
  const timeScale = num("timeScale");
  if (timeScale !== undefined) out["timeScale"] = timeScale;
  const facingDeg = num("facingDeg");
  if (facingDeg !== undefined) out["facingDeg"] = facingDeg;
  const pitchDeg = num("pitchDeg");
  if (pitchDeg !== undefined) out["pitchDeg"] = pitchDeg;
  const tr = num("tintR");
  const tg = num("tintG");
  const tb = num("tintB");
  if (tr !== undefined && tg !== undefined && tb !== undefined) out["tint"] = [tr, tg, tb];
  const anchor = d.anchor.trim();
  if (anchor !== "") out["anchor"] = anchor;
  if (Object.keys(out).length === 0) return null;
  const parsed = zVfxAbilityFamilyBinding.safeParse(out);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// 「現在畫的是什麼」—— 走解析,不看欄位
// ---------------------------------------------------------------------------

/**
 * ⚠️ **這就是 `ContentDb.vfxFor` 做的事**:拿 key 去 registry 查,查不到回 null。
 *
 * 這一頁任何「這支技能現在畫得出東西嗎」的判斷都必須走這裡。看 `vfxKey` 這個
 * **欄位存不存在**是掃屬性(第⑦種失敗形態);技能綁定也**不是**走 ability doc 的
 * `spawnVfx`,掃那個欄位會得到「99% 技能沒有特效」這種完全假的結論。
 */
export function vfxDocIdFor(vfxKey: string | null | undefined, vfxIds: ReadonlySet<string>): string | null {
  if (!vfxKey) return null;
  return vfxIds.has(vfxKey) ? vfxKey : null;
}

export type ForgeOrigin = "none" | "guessed" | "family" | "w3x" | "authored";

export const ORIGIN_LABEL: Readonly<Record<ForgeOrigin, string>> = {
  none: "沒有特效",
  guessed: "猜的（依技能名分類）",
  family: "家族原型",
  w3x: "原作（從 w3x 抽出來）",
  authored: "手寫特效",
};

/**
 * 分類一支技能**現在真的畫的**是什麼。
 *
 * 先解析,再看前綴 —— 順序不能反:一個指向不存在文件的 `fx.prim.*` key 看起來
 * 像「猜的」,實際上什麼都不會畫。
 */
export function classifyOrigin(vfxKey: string | null | undefined, vfxIds: ReadonlySet<string>): ForgeOrigin {
  const id = vfxDocIdFor(vfxKey, vfxIds);
  if (id === null) return "none";
  if (id.startsWith("fx.fam.")) return "family";
  if (id.startsWith("fx.prim.")) return "guessed";
  if (id.startsWith("fx.w3x.") || id.startsWith("godie-")) return "w3x";
  return "authored";
}

// ---------------------------------------------------------------------------
// 普查 —— 「原作用的是哪個模型」
// ---------------------------------------------------------------------------

/** 美術是怎麼到這支技能身上的。強度由高到低。 */
export const PROVENANCE_ORDER = [
  "jass-literal",
  "w3a-override",
  "w3h-override",
  "stock-buff-inherited",
  "stock-inherited",
] as const;

export const PROVENANCE_LABEL: Readonly<Record<string, string>> = {
  "jass-literal": "作者在 JASS 裡直接打的模型路徑（意圖最強）",
  "w3a-override": "作者自己設了這支技能的美術欄位",
  "w3h-override": "作者設在這支技能的 buff 記錄上",
  "stock-buff-inherited": "沒設，從暴雪 base 的 buff 掉下來的",
  "stock-inherited": "沒設，WC3 掉回暴雪 base 技能 —— 不是作者意圖",
};

export interface CensusArt {
  readonly channel: string;
  readonly stem: string;
  readonly path: string;
  readonly provenance: string;
  readonly assetStatus: string;
}

export interface CensusRow {
  readonly rawcodes: readonly string[];
  readonly art: readonly CensusArt[];
}

function provenanceRank(p: string): number {
  const i = (PROVENANCE_ORDER as readonly string[]).indexOf(p);
  return i < 0 ? PROVENANCE_ORDER.length : i;
}

/**
 * 解出貨的 `content/assets/vfx/w3x-ability-provenance.json`。
 *
 * 那份檔案的檔頭自己寫著「IMMUTABLE ARCHAEOLOGY … 只記原始地圖的事實」——
 * 也就是說它**不會**因為誰改了綁定而過期,正好適合當「原作畫的是什麼」那一欄的
 * 權威。每一支技能的美術依 provenance 強度排序,強的在前。
 */
export function parseCensus(raw: unknown): Map<string, CensusRow> {
  const out = new Map<string, CensusRow>();
  if (!raw || typeof raw !== "object") return out;
  const abilities = (raw as { abilities?: unknown }).abilities;
  if (!abilities || typeof abilities !== "object") return out;
  for (const [id, v] of Object.entries(abilities as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const rec = v as Record<string, unknown>;
    const rawcodes = Array.isArray(rec["rawcodes"])
      ? (rec["rawcodes"] as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    const artRaw = Array.isArray(rec["realArt"]) ? (rec["realArt"] as unknown[]) : [];
    const art: CensusArt[] = [];
    for (const a of artRaw) {
      if (!a || typeof a !== "object") continue;
      const r = a as Record<string, unknown>;
      const stem = r["stem"];
      if (typeof stem !== "string" || stem === "") continue;
      art.push({
        channel: typeof r["channel"] === "string" ? r["channel"] : "?",
        stem: stem.toLowerCase(),
        path: typeof r["path"] === "string" ? r["path"] : stem,
        provenance: typeof r["provenance"] === "string" ? r["provenance"] : "?",
        assetStatus: typeof r["assetStatus"] === "string" ? r["assetStatus"] : "UNKNOWN",
      });
    }
    art.sort((x, y) => provenanceRank(x.provenance) - provenanceRank(y.provenance));
    out.set(id, { rawcodes, art });
  }
  return out;
}

/**
 * 從普查推薦一個家族。取**證據最強**、而且落在 21 個家族裡的第一個。
 *
 * 刻意不排除 `stock-inherited`:那條 provenance 講的是「作者有沒有自己設」,
 * 而這一欄問的是「原作畫面上出現的是什麼」—— WC3 確實會畫繼承來的美術。
 * 強度差異在畫面上照樣標出來,由 owner 自己判斷。
 */
export function suggestFamily(row: CensusRow | undefined): { family: W3xFamilyId; art: CensusArt } | null {
  if (!row) return null;
  for (const a of row.art) {
    const fam = familyForModel(a.stem);
    if (fam) return { family: fam, art: a };
  }
  return null;
}

/** 每個家族在出貨普查裡真的被引用幾次 —— 在檢視時算,不是抄一個會過期的數字。 */
export function familyCensusCounts(census: ReadonlyMap<string, CensusRow>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of FAMILY_IDS) counts.set(key, 0);
  for (const row of census.values()) {
    for (const a of row.art) {
      const fam = familyForModel(a.stem);
      if (!fam) continue;
      counts.set(fam, (counts.get(fam) ?? 0) + 1);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// 表格的一列
// ---------------------------------------------------------------------------

export interface AbilityFacts {
  readonly id: string;
  readonly name: string;
  readonly vfxKey: string | null;
  /**
   * #205 —— 這一列的**整份出貨技能文件**。目錄本來就把 696 份文件都抓下來了
   * (為了讀 `name` 和 `vfxKey`),丟掉其餘欄位再讓多層堆疊編輯器重抓一次是白花
   * 一趟往返。多層編輯器要送出的是**整份**文件(overlay 是整份替換,不是欄位
   * 合併),所以它需要這個。
   */
  readonly doc?: unknown;
}

export interface ForgeRow {
  readonly abilityId: string;
  readonly name: string;
  readonly championId: string;
  readonly slot: string;
  readonly shippedVfxKey: string | null;
  /** 出貨的 key 真的解得到文件嗎(vfxFor 語意) */
  readonly shippedResolvedId: string | null;
  readonly origin: ForgeOrigin;
  /** 原作真的畫的東西,強度由高到低 */
  readonly originalArt: readonly CensusArt[];
  readonly suggested: { family: W3xFamilyId; art: CensusArt } | null;
  readonly binding: VfxAbilityFamilyBinding | null;
  /** 這一列最後會播的家族(綁定 > 普查建議 > 無) */
  readonly effectiveFamily: W3xFamilyId | null;
  /** #205 —— 出貨的整份技能文件,多層堆疊編輯器要它當底 */
  readonly shippedDoc: unknown;
}

const SLOT_ORDER = ["passive", "q", "w", "e", "r", "ex"] as const;

function slotRank(slot: string): number {
  const i = (SLOT_ORDER as readonly string[]).indexOf(slot);
  return i < 0 ? SLOT_ORDER.length : i;
}

/** `godie-e002.e` → `{ championId: "godie-e002", slot: "e" }`。 */
export function splitAbilityId(id: string): { championId: string; slot: string } {
  const dot = id.lastIndexOf(".");
  if (dot <= 0) return { championId: id, slot: "" };
  return { championId: id.slice(0, dot), slot: id.slice(dot + 1) };
}

export function forgeRows(
  abilities: readonly AbilityFacts[],
  vfxIds: ReadonlySet<string>,
  census: ReadonlyMap<string, CensusRow>,
  doc: ConfigVfxFamiliesDoc | null,
): ForgeRow[] {
  const rows = abilities.map((a): ForgeRow => {
    const { championId, slot } = splitAbilityId(a.id);
    const binding = doc?.abilities[a.id] ?? null;
    const row = census.get(a.id);
    const suggested = suggestFamily(row);
    return {
      abilityId: a.id,
      name: a.name,
      championId,
      slot,
      shippedVfxKey: a.vfxKey,
      shippedResolvedId: vfxDocIdFor(a.vfxKey, vfxIds),
      origin: classifyOrigin(a.vfxKey, vfxIds),
      originalArt: row?.art ?? [],
      suggested,
      binding,
      effectiveFamily: binding?.family ?? suggested?.family ?? null,
      shippedDoc: a.doc ?? null,
    };
  });
  rows.sort((x, y) => {
    if (x.championId !== y.championId) return x.championId < y.championId ? -1 : 1;
    const sr = slotRank(x.slot) - slotRank(y.slot);
    if (sr !== 0) return sr;
    return x.abilityId < y.abilityId ? -1 : x.abilityId > y.abilityId ? 1 : 0;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// 摘要
// ---------------------------------------------------------------------------

export interface ForgeSummary {
  readonly total: number;
  readonly drawing: number;
  readonly guessed: number;
  readonly family: number;
  readonly w3x: number;
  readonly authored: number;
  readonly none: number;
  readonly rebindable: number;
  readonly bound: number;
}

export function forgeSummary(rows: readonly ForgeRow[]): ForgeSummary {
  let drawing = 0;
  let guessed = 0;
  let family = 0;
  let w3x = 0;
  let authored = 0;
  let none = 0;
  let rebindable = 0;
  let bound = 0;
  for (const r of rows) {
    if (r.shippedResolvedId !== null) drawing++;
    if (r.origin === "guessed") guessed++;
    else if (r.origin === "family") family++;
    else if (r.origin === "w3x") w3x++;
    else if (r.origin === "authored") authored++;
    else none++;
    if (r.suggested) rebindable++;
    if (r.binding) bound++;
  }
  return { total: rows.length, drawing, guessed, family, w3x, authored, none, rebindable, bound };
}

export function forgeSummaryText(s: ForgeSummary): string {
  if (s.total === 0) return "讀不到技能文件 —— /content 掛載點沒有回應";
  const pct = (n: number): string => `${Math.round((n / s.total) * 100)}%`;
  return [
    `技能 ${s.total} 支`,
    `畫得出東西 ${s.drawing}（${pct(s.drawing)}）`,
    `其中「猜的」${s.guessed}（${pct(s.guessed)}）· 家族原型 ${s.family} · 原作 ${s.w3x} · 手寫 ${s.authored}`,
    `普查說原作真的有畫、可以重綁的 ${s.rebindable}`,
    `已在這一頁改過 ${s.bound}`,
  ].join(" · ");
}

// ---------------------------------------------------------------------------
// 文案 + 讀出貨資料
// ---------------------------------------------------------------------------

export const APPLY_NOTE =
  "儲存後寫入平台的耐久覆蓋層；對戰伺服器在下次重啟（部署）時載入，進行中的對戰不受影響";

export const PROVENANCE_NOTE =
  "「原作」那一欄讀的是出貨的 w3x 考古檔（content/assets/vfx/w3x-ability-provenance.json），只記原始地圖的事實，不會因為誰改了綁定而過期";

export const ABSENT_NOTE =
  "留白 ≠ 0：一格留白的意思是「原圖沒說，用家族預設」，存檔時那個欄位整個不會寫進去。填 0 是明確要求 0（alpha 0 = 完全看不見）";

export function loadErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `讀不到出貨內容：${msg}`;
}

export function saveErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `寫入覆蓋層失敗：${msg}`;
}

export interface ForgeCatalog {
  readonly abilities: readonly AbilityFacts[];
  readonly vfxIds: ReadonlySet<string>;
  readonly census: Map<string, CensusRow>;
}

function abilityFactsFrom(id: string, raw: unknown): AbilityFacts {
  if (!raw || typeof raw !== "object") return { id, name: id, vfxKey: null };
  const d = raw as Record<string, unknown>;
  const name = typeof d["name"] === "string" && d["name"] !== "" ? d["name"] : id;
  const key = d["vfxKey"];
  return { id, name, vfxKey: typeof key === "string" && key !== "" ? key : null, doc: raw };
}

async function getJson(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

/**
 * 把三份出貨資料抓下來:技能文件、vfx 文件 id、w3x 考古普查。
 *
 * ⚠️ vfx 的 id 集合是**必要的**,不是裝飾:沒有它就沒辦法判斷一個 `vfxKey`
 * 到底解不解得到,而那正是 `ContentDb.vfxFor` 唯一做的事。少了它,頁面就只能
 * 掃欄位,也就是掃屬性代替掃行為。
 */
export async function loadForgeCatalog(
  opts: { fetchFn?: typeof fetch; base?: string; concurrency?: number } = {},
): Promise<ForgeCatalog> {
  const fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = opts.base ?? "/content";
  const concurrency = Math.max(1, opts.concurrency ?? 16);

  const [abilityIndexRaw, vfxIndexRaw, censusRaw] = await Promise.all([
    getJson(fetchFn, `${base}/${ABILITY_INDEX_PATH}`),
    getJson(fetchFn, `${base}/${VFX_INDEX_PATH}`),
    getJson(fetchFn, `${base}/${CENSUS_PATH}`),
  ]);

  const entries: IndexEntry[] = parseIndex(abilityIndexRaw);
  const vfxIds = new Set(parseIndex(vfxIndexRaw).map((e) => e.id));
  const census = parseCensus(censusRaw);

  const abilities: AbilityFacts[] = entries.map((e) => ({ id: e.id, name: e.id, vfxKey: null }));
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const entry = entries[i];
      if (entry === undefined) return;
      try {
        abilities[i] = abilityFactsFrom(entry.id, await getJson(fetchFn, `${base}/${entry.path}`));
      } catch {
        // 讀不到就留 id-only 那一列 —— 一份壞掉的文件不可以讓整頁空白
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return { abilities, vfxIds, census };
}
