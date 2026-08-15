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
 */
import {
  zConfigAmbientVfxDoc,
  zConfigBossIntroDoc,
  zConfigDamageColorsDoc,
  zConfigGoreDoc,
  zConfigItemCardDoc,
  zConfigModelLodDoc,
  zConfigReplayDoc,
  zConfigBlockDoc,
  zConfigCritDoc,
  zConfigBerserkDoc,
  zConfigDispelDoc,
  zConfigCooldownRulesDoc,
  zConfigCastTimeDoc,
  zConfigContentLoadDoc,
  zConfigAuthoringRulesDoc,
  zConfigAoeTiersDoc,
  zConfigStatNormalizationDoc,
  zConfigWoundsDoc,
  zConfigWeaknessDoc,
  zConfigDamageRulesDoc,
  zConfigAugmentFilterDoc,
  zConfigBodyScaleDoc,
  zConfigRegenDoc,
  zConfigShieldDoc,
  zConfigStealthDoc,
  zConfigTauntDoc,
  zConfigVfxCleanupDoc,
  zConfigVictoryFxDoc,
} from "@ggd/shared/content";
// ⚠️ 同上的深路徑理由：這兩份 Zod 住自己的檔案（欄位理由長、且 sim 直接吃）。
import { zConfigMitigationDoc } from "@ggd/shared/content/schema/mitigationDoc";
import { zConfigMapSpecDoc } from "@ggd/shared/content/schema/mapSpecDoc";
import { zConfigCameraDoc } from "@ggd/shared/content/schema/config";
import { zConfigDisplacementTiersDoc } from "@ggd/shared/content/schema/displacementDoc";
// ⚠️ 深路徑 import：`config.victory-podium@1` 的 Zod 住在自己的檔案裡（欄位的理由
// 很長，而且客戶端 render/** 直接吃它），`content/schema/index.ts` **沒有**再匯出
// 一次，所以這裡走 package.json 的 `"./*"` 子路徑。`laneConfigDocs.test.ts` 走的是
// 同一條。
import { zConfigVictoryPodiumDoc } from "@ggd/shared/content/schema/victoryPodium";
// 重用 `/editor` 的 Zod 走訪器而不是在後台再寫一支。理由和第一守則同源：兩支走訪器
// 就是兩份會 drift 的「Zod 長什麼樣」的知識，而它們的分歧會以「後台少了一個欄位」
// 的形態出現 —— 那正是這張單要修的東西。
// ⚠️ 它是別條 lane 的檔案（#238 動過）。`configForms.test.ts` 針對這三份 schema 釘住
// 走訪結果，所以那支走訪器的輸出形狀一改，紅的是這裡而不是遊戲。
import { walkZod } from "../../editor/src/form/walk";
import { humanize, type UINode } from "../../editor/src/form/uiSchema";
import type { ConfigCurveSpec } from "./configCurve";
import type { ConfigTableSpec } from "./configTables";

/**
 * `ZodTypeAny`，**不從 `"zod"` 取**。
 *
 * `apps/admin` 沒有把 zod 列進自己的 `dependencies`，所以 `import type
 * { ZodTypeAny } from "zod"` 在 `tsc -p apps/admin` 底下是 TS2307（執行期沒事，
 * 因為型別 import 會被抹掉 —— 也就是說那是一個**只有 typecheck 會抓到**的錯，
 * 而 `pnpm -s typecheck | grep error` 永遠 match 不到它）。從走訪器的參數推回來
 * 拿到的是同一個型別，而它的解析走 `apps/editor` 自己的 zod。
 */
type ConfigZodSchema = Parameters<typeof walkZod>[0];

// ─────────────────────────────────────────────────────────────── 葉節點 ────

/** 一個「可以填一個值」的欄位，從 Zod schema 走出來的部分。 */
export interface ScalarLeaf {
  /** 點路徑，例如 `presetTiers.medium` */
  path: string;
  kind: "number" | "boolean" | "enum" | "text";
  /** enum 的可選值（其他 kind 為空陣列） */
  options: string[];
  /** number 專用 */
  int: boolean;
  min?: number;
  max?: number;
  exclusiveMin?: boolean;
  exclusiveMax?: boolean;
}

/** 一個引擎不編輯的分支（record / array / union / 深到底的東西）。 */
export interface DocBranch {
  path: string;
  kind: UINode["kind"];
}

/**
 * 文件的「身分欄位」—— 不是設定，是文件自己的座標。刻意列成常數而不是散在
 * 判斷式裡：排除一個欄位是一個決定，決定要看得見。
 *
 * `note` 是文件裡給下一個人看的說明字串（model-lod / vfx-cleanup 都有一段）。
 * 它不影響遊戲行為，而且是多行中文 —— 塞進一格 input 只會被截斷成沒人看得懂的
 * 一行，所以這一頁不編輯它，但儲存時**照樣帶著走**（走 preserved 之外的
 * 「未編輯的鍵原封不動」那條路）。
 */
export const DOC_META_PATHS: readonly string[] = ["id", "schema", "note"];

/**
 * 走 schema → 純量葉節點 + 不編輯的分支。
 *
 * `literal`（`schema: z.literal("config.gore@1")`）永遠不可編輯 —— 它只有一個
 * 合法值，畫成輸入框就是在邀請操作者把文件打壞。
 */
export function readSchema(zod: ConfigZodSchema): { leaves: ScalarLeaf[]; branches: DocBranch[] } {
  const root = walkZod(zod, "", "文件");
  const leaves: ScalarLeaf[] = [];
  const branches: DocBranch[] = [];

  const visit = (node: UINode): void => {
    if (node.path !== "" && DOC_META_PATHS.includes(node.path)) return;
    switch (node.kind) {
      case "object":
        for (const f of node.fields) visit(f);
        return;
      case "number":
        leaves.push({
          path: node.path,
          kind: "number",
          options: [],
          int: node.int,
          ...(node.min !== undefined ? { min: node.min } : {}),
          ...(node.max !== undefined ? { max: node.max } : {}),
          ...(node.exclusiveMin ? { exclusiveMin: true } : {}),
          ...(node.exclusiveMax ? { exclusiveMax: true } : {}),
        });
        return;
      case "boolean":
        leaves.push({ path: node.path, kind: "boolean", options: [], int: false });
        return;
      case "enum":
        leaves.push({
          path: node.path,
          kind: "enum",
          options: node.options.map(String),
          int: false,
        });
        return;
      case "text":
        leaves.push({ path: node.path, kind: "text", options: [], int: false });
        return;
      case "literal":
        // 只有一個合法值 —— 不是設定。
        return;
      default:
        branches.push({ path: node.path, kind: node.kind });
        return;
    }
  };
  visit(root);
  return { leaves, branches };
}

// ─────────────────────────────────────────────────────────────── 標籤表 ────

/** 一格的人話。**這一半不能自動生成** —— 見檔頭。 */
export interface ConfigFieldLabel {
  /** 點路徑，和 schema 的葉節點一字不差 */
  path: string;
  /** 中文名稱 */
  zh: string;
  /**
   * **它影響什麼** —— 不是複述欄位名。操作者讀完這一行要知道「我把它調大，
   * 場上會發生什麼事」以及「代價是什麼」。
   */
  note: string;
  /**
   * schema 給不出上界時，這裡補一個（#277）。schema 已經有上界時填了會被
   * `configForms.test.ts` 當成重複來源而紅 —— 兩份上界就是兩份會 drift 的上界。
   */
  max?: number;
  /** 同上，補下界。 */
  min?: number;
  /** enum 選項的中文（key = 選項字面值）。缺一個 → 測試紅。 */
  optionLabels?: Record<string, string>;
  /**
   * **文字欄位的「上下界」**（#277 在字串上的形狀）。走訪器把每一個
   * `z.string()` 都攤成一個純文字輸入框，regex 在走訪過程中被丟掉 —— 所以
   * 沒有這一格的話，`text.true` 可以填「白色」，PUT 成功，而遊戲繼續畫原本的
   * 顏色：**「存了但畫面沒變」**，這個 repo 最討厭的那種失敗。
   *
   * ⚠️ 這是 Zod 之外的第二份規則，也就是一份會 drift 的規則。
   * `configForms.test.ts` 的「每一個 pattern 和 schema 對同一個值判一樣的結果」
   * 拿一組候選字串逐一比對「pattern 收不收」與「整份文件的 `spec.zod.safeParse`
   * 收不收」，兩邊判不一樣就當場紅。
   *
   * ⚠️ 2026-08-02：**在此之前這一段是假的**（第三守則）—— 它宣稱的那條測試在
   * 整個 repo 不存在（`grep -rn "pattern" apps/admin/src/configForms.test.ts`
   * 零命中），所以 HEX6 那九格從加進來的那天起就沒有任何東西在比對它和
   * `zColorHex`。現在那條測試真的寫了，這一段才是真話。
   */
  pattern?: RegExp;
  /** `pattern` 不過時給操作者看的一句中文。有 `pattern` 就必須有它。 */
  patternError?: string;
}

/** 一份不編輯但**必須原封不動帶著走**的分支。 */
export interface PreservedBranch {
  path: string;
  /** 掉了會發生什麼事 —— 這一行就是它為什麼被列出來的理由 */
  why: string;
}

export interface ConfigDocSpec {
  /** 後台路由 key */
  page: string;
  collection: "config";
  docId: string;
  /** `schema` 欄位的字面值，讀回來時用它擋掉「存錯文件」 */
  schemaTag: string;
  zod: ConfigZodSchema;
  title: string;
  /** 頁面開頭的說明段落 */
  intro: string[];
  /**
   * **誰真的會讀這份文件** —— 一個具體的函式，不是「客戶端」。
   * 沒有這一行的文件不可以做成後台頁，見檔頭第 1 條。
   */
  consumer: string;
  /** 存檔之後什麼時候生效（誠實版，不是「下一場」） */
  effect: string;
  fields: ConfigFieldLabel[];
  preserved: PreservedBranch[];
  /**
   * 一張**可以編輯**的斷點曲線(GH#252)。
   *
   * 走訪器把任何陣列都歸成「不編輯的分支」,而不編輯的分支只有 `preserved`
   * 一條出路。對 `attackRangeCurve` 那條出路是錯的 —— 那張表就是那一頁唯一要調
   * 的東西。所以陣列分支有兩條明著宣告的路:`preserved`(帶著走)或這一格
   * (畫成表格),`configForms.test.ts` 兩邊都認,沒有第三條「沒人管它」的路。
   *
   * 邏輯與逐格驗證住在 `configCurve.ts`。
   */
  curve?: ConfigCurveSpec;
  /**
   * 幾張**可以編輯**的對照表（`Record<string, enum>` 或 `string[]`）。
   *
   * 和 `curve` 同一個理由，只是形狀不同：走訪器把 record 與 array 都歸成「不編輯
   * 的分支」，而對 `item-card.markers` 那條出路是錯的 —— owner 2026-08-02 要改的
   * 就是「`[On-Hit]` 算主動還是被動」，也就是那張表的一列。
   *
   * 所以非純量分支現在有**三條**明著宣告的路（preserved / curve / tables），
   * `configForms.test.ts` 三邊都認，仍然沒有第四條「沒有人管它」的路。
   * 邏輯與逐格驗證住在 `configTables.ts`。
   */
  tables?: readonly ConfigTableSpec[];
}

// ────────────────────────────────────────────── 畫質分級 (config/model-lod) ─

const MODEL_LOD_SPEC: ConfigDocSpec = {
  page: "modelLod",
  collection: "config",
  docId: "model-lod",
  schemaTag: "config.model-lod@1",
  zod: zConfigModelLodDoc,
  title: "畫質分級",
  intro: [
    "玩家把畫質設成低／中／高／自適應時，遊戲實際去下載哪一階模型檔。目前 167 個模型裡有 83 個生了 -mid / -small 變體（49.7%），沒有變體的自動退回原檔，所以這張表不可能因為某個模型沒生變體而 404。",
    "這是效能↔畫質的取捨，不是事實 —— 手機發燙就往下調，模型太糊就往上調。",
  ],
  consumer: "apps/client/src/render/modelLod.ts 的 applyModelLodPolicy() → lodTierForPreset() → AssetManager 的 resolveLodPath()",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時才讀內容覆蓋層）。已經載進場的模型不會中途換階，那是刻意的：換階＝重新下載。",
  fields: [
    {
      path: "enabled",
      zh: "分級總開關",
      note: "關掉之後四個畫質等級全部載原始模型檔，等於 #115 之前的行為。線上如果發現某一階的 .glb 壞掉（破圖／載不進來），這一格是止血閥。",
    },
    {
      path: "presetTiers.low",
      zh: "低畫質 → 抓哪一階",
      note: "玩家選「低」時下載的模型階。small 面數最少、位元組最少，是舊手機最不容易發燙的一階，代價是輪廓會糊。",
      optionLabels: { high: "high（原始檔）", mid: "mid（中階）", small: "small（最省）" },
    },
    {
      path: "presetTiers.medium",
      zh: "中畫質 → 抓哪一階",
      note: "多數玩家會停在這一格，所以它是這一頁最實際的取捨點：mid 平均省一半以上位元組而外觀差異不明顯；改成 small 會更省但角色臉會開始糊掉。",
      optionLabels: { high: "high（原始檔）", mid: "mid（中階）", small: "small（最省）" },
    },
    {
      path: "presetTiers.high",
      zh: "高畫質 → 抓哪一階",
      note: "桌機通常留在 high（＝不換階，載作者原檔）。改成 mid 等於全體降階，連效能有餘裕的機器也拿不到最好的畫面。",
      optionLabels: { high: "high（原始檔）", mid: "mid（中階）", small: "small（最省）" },
    },
    {
      path: "presetTiers.auto",
      zh: "自適應 → 抓哪一階",
      note: "⚠️ 自適應階梯每幾秒就會換一級，而換模型階＝丟掉已載入的模型再發一次網路請求。留在 high 才不會在最撐不住的那台機器上、打到一半、反覆下載模型。改這一格之前先確認你要的是這個。",
      optionLabels: { high: "high（原始檔）", mid: "mid（中階）", small: "small（最省）" },
    },
  ],
  preserved: [],
};

// ──────────────────────────────────────────── 特效回收 (config/vfx-cleanup) ─

const VFX_CLEANUP_SPEC: ConfigDocSpec = {
  page: "vfxCleanup",
  collection: "config",
  docId: "vfx-cleanup",
  schemaTag: "config.vfx-cleanup@1",
  zod: zConfigVfxCleanupDoc,
  title: "特效回收",
  intro: [
    "回合與回合之間，要把特效層那些「暖好的」共用網格池回收到什麼程度。實測過的症狀是「越打越鈍」「一場就很燙」：60 個不同半徑的預告圈打完，連 dispose() 之後場景上都還留著 72 個 mesh / 73 份材質。",
    "這是體感取捨：丟掉＝穩態記憶體最低，代價是下一回合第一次施法要重新配置；留著＝第一次施法不卡，代價是那些網格整場都在。",
  ],
  consumer: "apps/client/src/vfx/vfxCleanupPolicy.ts 的 vfxCleanupPolicy() → ringCapForRoundBoundary() → VfxSystem.resetForRound() 的 trimTelegraphPools()",
  effect: "玩家**下一次重新整理遊戲頁面**之後的每一個回合邊界生效（讀的時候才查，所以不必重開一場，但要重新載入客戶端才拿得到新的文件）。",
  fields: [
    {
      path: "enabled",
      zh: "回合邊界回收總開關",
      note: "關掉＝回合之間完全不碰共用特效池（#259 的行為），記憶體會一路往上長。只有在懷疑「回收動作本身」造成閃爍或破圖時才關它，這是止血閥不是省事開關。",
    },
    {
      path: "purgeSharedPoolsOnRoundEnd",
      zh: "回合結束強制清空共用池",
      note: "開＝每回合結束把預告圈網格全部還回去，穩態記憶體最低，代價是下一回合第一次施法要重新配置（可能有一次極短的卡）。關＝改吃下面那個保留上限。",
    },
    {
      path: "maxPooledRings",
      zh: "回合之間保留幾個預告圈網格",
      note: "只有在上面那格關掉時才生效。每個網格帶一份自己的材質，所以這個數字直接就是「回合之間常駐的 mesh / material 數」。0＝一個都不留（等於強制清空）。",
    },
    {
      path: "deathFxBurnSec",
      zh: "死亡火焰全亮幾秒",
      note: "英雄倒下後留在屍體上的那團火（復活圈的火柱／火舌／往天上飄的餘燼）用全亮燒幾秒，燒完降到下面那格的亮度。0＝一出現就是低調狀態。owner 2026-08-03:「我找到場地天空火的兇手了，是角色死亡後的特效，持續太久了變得很干擾」。⚠️ 這只改**看起來**多久，不改復活圈還救不救得回來 —— 圈圈的存活是伺服器決定的，這一格碰不到它。調大＝回到「燒到回合結束」的畫面。",
    },
    {
      path: "deathFxCalmScale",
      zh: "死亡火焰收斂後剩幾成亮度",
      note: "全亮秒數過完之後，火剩下原本的幾成（火柱與火舌的透明度、餘燼的噴發速率一起乘上這個數）。1＝永遠不收斂，等於一鍵回到 #196 那種「每死一個人場上就多一團永遠不滅的火」（**止血閥**）；0＝完全熄掉只剩地上那圈。⚠️ 地上那圈的亮度**不受這一格影響**，因為它是玩家判斷「這裡還救得回來」的錨點。",
    },
    {
      path: "deathFxRelightOnChannel",
      zh: "有人來救時火重新燒旺",
      note: "隊友踩進圈圈開始復活、或敵人站進來卡住時，要不要立刻把火燒回全亮。開著＝收斂不會吃掉「有人在救／被卡住」這個一眼可讀的訊號（出貨值）。關掉＝圈圈收斂後就一直低調，畫面最乾淨但要靠 HUD 才知道有人在救。",
    },
    {
      path: "maxOneShotEmitters",
      zh: "一次性發射器上限",
      note: "同時允許幾個「閒置」的一次性粒子發射器。owner 2026-08-04 在線上量到它會隨回合線性成長（第 2 回合 144 個 / 2,819 顆粒子 → 第 4 回合 266 / 5,975），因為打擊感的共用池以「強度＋顏色」當 key，而一場比賽會一直遇到新的顏色 —— 每個 key 上限 4 個，但 key 的數量本身沒有上界。超過這一格就回收最久沒用的（正在飛的那些不動，所以打到一半的特效不會憑空消失）。調小＝畫面上的殘骸更少、記憶體更平，代價是同一種打擊感更常需要重新配置。",
    },
    {
      path: "emitterSweepSec",
      zh: "多久掃一次閒置發射器（秒）",
      note: "上面那個上限多久檢查一次。掃描本身很便宜（只走一次清單），設小＝殘骸活得更短，設大＝回收動作更少。",
    },
    {
      path: "purgeImpactPoolOnRoundEnd",
      zh: "回合結束清空打擊感池",
      note: "開＝進商店前把白光／火花／煙的共用發射器全部還回去，商店那一段場上一個一次性發射器都不留（出貨值）。關＝留著，下一回合第一拳不用重新配置，代價是那些系統整場都在場景裡被每一幀走訪 —— 那正是量到的那條成長曲線，所以關它是**止血閥**不是省事。",
    },
  ],
  preserved: [],
};

// ──────────────────────────────────────────────────── 濺血 (config/gore) ───

const GORE_SPEC: ConfigDocSpec = {
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
  fields: [
    {
      path: "style",
      zh: "濺血樣式",
      note: "blood＝紅色血滴＋噴霧＋會淡掉的地面血漬；stylized＝同樣方向的噴濺但畫成依傷害屬性上色的能量爆，沒有紅色也沒有地面血漬；off＝這一層完全不噴（打擊感的火花／碎屑不受影響，所以還是打得出手感）。",
      optionLabels: { blood: "blood 紅血", stylized: "stylized 能量爆", off: "off 完全不噴" },
    },
    {
      path: "intensity",
      zh: "濺血強度",
      note: "同時縮放血滴數量、血滴大小與地面血漬的不透明度。0＝這一層等於關掉；1＝最誇張。出貨值 0.85 是「明顯但不到搞笑」的那一點。",
    },
  ],
  preserved: [
    {
      path: "championStyles",
      why: "逐英雄的**降級**表（機械／不死／植物系的十位角色改噴火花或能量，不噴紅血）。這一頁不編輯它，但每次儲存都原封不動帶著走 —— 掉了的話那十位角色會從此開始噴紅血，而畫面上完全看不出來。",
    },
  ],
};

// ─────────────────────────────────────────────── 護盾規則 (config/shield) ──

const SHIELD_SPEC: ConfigDocSpec = {
  page: "shieldRules",
  collection: "config",
  docId: "shield",
  schemaTag: "config.shield@1",
  zod: zConfigShieldDoc,
  title: "護盾規則",
  intro: [
    "同一個角色身上同時掛著兩道以上的護盾時，一發傷害先花掉哪一道。場上真的會同時出現：破法對咒是**別人**幫你上的抗魔盾，守護之光／機警則是全類型的盾，兩者疊在同一個人身上是常態而不是例外。",
    "這一頁不改護盾的**數值**（吸收多少、持續幾秒寫在各自的技能文件裡，全域倍率在 戰鬥系統 的 shield 那一格），只改**消耗順序** —— 它決定同一波輸出打下去，對面還剩哪一種保護。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/shield.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/combat/damage.ts 的 absorbOrder()（每一發傷害封包都會呼叫，讀 world.shieldRules.absorbOrder）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.shieldRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。這份文件不在 content-bus 的三份即時文件裡（那三份是白名單／戰鬥系統／系統運維），它是 shard 開機載入內容樹時讀一次就定格 —— 和 基礎加成 同一個形態(#278)，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: [
    {
      path: "absorbOrder",
      zh: "多盾同時在身上時的消耗順序",
      note: "決定「先打掉哪一種保護」。specificFirst 會先燒掉專用盾，所以泛用盾留到最後、對面的下一發不管什麼屬性都還擋得住；generalFirst 反過來，先把泛用盾清光，逼出只剩抗魔盾的空窗，讓物理輸出有一段真的打得進去的窗口；insertionOrder 完全不看屬性，先上的先花 —— 護盾**會過期**，通常先上的也先到期，所以這一格是「不要讓盾白白過期」的近似解。三種對防守方的總吸收量一樣，差別在對面能不能操作出破口，所以這是節奏設計不是強弱調整。",
      optionLabels: {
        specificFirst: "specificFirst 專用盾先花（出貨值＝改成欄位之前的行為）",
        generalFirst: "generalFirst 泛用盾先花（逼出抗魔盾空窗）",
        insertionOrder: "insertionOrder 不看屬性，先上的先花",
      },
    },
  ],
  preserved: [],
};


// ─────────────────────────────────────────────── 格擋規則 (config/block) ──

const BLOCK_SPEC: ConfigDocSpec = {
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
  fields: [
    {
      path: "stacking",
      zh: "多件格擋同時在身上時怎麼疊",
      note: "independent＝每一件各抽各的骰子，擋中的那一件從**剩下的**傷害裡扣掉自己的比例，再把剩下的交給下一件；兩件 30% 全額格擋 = 51% 擋得下來，而兩件「擋一半」都擋中就剩四分之一。best＝只有期望減傷（機率 × 比例）最高的那一件會參與，整發只抽一次，所以第二件格擋等於白帶。差別只在**同時帶兩件以上**的時候，帶一件的人兩種設定完全一樣。",
      optionLabels: {
        independent: "independent 各自獨立判定、剩餘往下傳（出貨值＝owner 裁決）",
        best: "best 只有最強的那一件會擋（改成欄位之前的行為）",
      },
    },
  ],
  preserved: [],
};

// ───────────────────────────────────────────────── 暴擊規則 (config/crit) ──

const CRIT_SPEC: ConfigDocSpec = {
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
  fields: [
    {
      path: "stackMode",
      zh: "多條暴擊同時成立時怎麼合成",
      note: "multiply＝每一條各抽各的骰，抽中的把自己的倍率**乘**上去（1%×100倍 與 10%×2倍 都中 = 200 倍）；這是唯一一個讓第二張暴擊卡真的變強的選項，肉鴿三選一疊得起來就靠它。max＝只有期望增益（機率×倍率）最高的那一條會算，整發只抽一次骰，所以第二件暴擊裝完全白帶（這是 2026-08-09 之前的行為，連抽骰次數都一樣，切回去等於整條回滾）。add＝各抽各的骰但倍率**相加**（上面那個例子 = 102 倍），疊得起來但很快就被上限追上。差別只在**同時有兩條以上**的時候，只有一條暴擊的人三種設定完全一樣。",
      optionLabels: {
        multiply: "multiply 每條獨立骰、倍率相乘（出貨值＝owner 裁決）",
        max: "max 只取最高的那一條（2026-08-09 之前的行為）",
        add: "add 每條獨立骰、倍率相加",
      },
    },
    {
      path: "maxTotalMult",
      zh: "一次攻擊的總倍率上限",
      note: "合成完之後夾在這個數字（出貨 100，owner 指定）。⚠️ 夾的是**總倍率**不是逐條：owner 例子裡那個 100×2＝200 在出貨設定下會被夾回 100，也就是說第二條暴擊在那個極端組合下確實吃不到 —— 這是刻意的，multiply 沒有上限就是指數爆炸，五張暴擊卡疊起來一刀刪掉對手，遊戲就沒了。調小＝爆發封頂變低、後期靠疊暴擊的路線變弱；調大＝允許更誇張的一擊必殺 build。",
    },
    {
      path: "sourceCap",
      zh: "同一次攻擊最多算幾條暴擊來源",
      note: "身上暴擊來源超過這個數量時，只有**期望增益（機率×倍率）最高的前幾條**參與，其餘整條不算、連骰都不抽（出貨 5，owner 指定）。丟掉的一定是最弱的那幾條，不是最晚買的 —— 所以剛買到的強力武器不會被上限吃掉。它同時是每一發攻擊的亂數預算上界，也就是「換一個版本之後錄影還能不能對得上」的那個界。⚠️ 它**不管英雄自己的暴擊率**（那是一條聚合屬性，永遠只有一條）；讓它算進來的話，把這一格填 1 會讓每一個堆了暴擊率的英雄完全吃不到暴擊武器，而畫面上看起來就是那把武器壞了。",
    },
  ],
  preserved: [],
};

const DAMAGE_RULES_SPEC: ConfigDocSpec = {
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
  fields: [
    {
      path: "defaultAbilityDamageType",
      zh: "沒寫型別時當成哪一種傷害",
      note: "魔法＝吃目標的魔抗（出貨值，owner 2026-08-05 裁定）；物理＝吃護甲；真實＝什麼減免都不吃，血條直接掉。⚠️ 選「真實」要非常小心：那等於讓每一張忘記填型別的卡都變成無視防禦，而防禦裝在那一刻對它完全沒有用。",
      optionLabels: {
        physical: "物理（吃護甲）",
        magic: "魔法 / AP（吃魔抗，出貨值）",
        true: "真實（什麼都不吃）",
      },
    },
  ],
  preserved: [],
};

const WOUNDS_SPEC: ConfigDocSpec = {
  page: "woundRules",
  collection: "config",
  docId: "wounds",
  schemaTag: "config.wounds@1",
  zod: zConfigWoundsDoc,
  title: "重創規則",
  intro: [
    "【重創】= 治療、吸血、自然回復同時打折（owner 2026-08-03：「【減療 / 禁療】=> 用重創代替就好，吸血/治療同時減半」）。",
    "⚠️ **三格倍率不在這一頁** —— 它們寫在施加重創的那一張卡上（技能／道具的 applyStatus），因為每一支技能的重創本來就該不一樣重。這一頁只管「同時中了兩發重創怎麼算」。",
    "⚠️ 【禁療】不是第二個機制：它就是三格倍率都填 0 的一份內容文件（content/status-effects/no-heal.json），所以淨化拔得掉它、到期規則也完全一樣。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/wounds.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/grievousWounds.ts::woundMult（三個讀取點各呼叫一次：combat/restore.ts 的治療、combat/damage.ts 的吸血係數、systems/RegenSystem.ts 的自然回復）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.woundRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 淨化規則／格擋規則／暴走規則 同一個形態(#278)。",
  fields: [
    {
      path: "stackMode",
      zh: "同時中了兩發重創怎麼算",
      note: "取最重（出貨值）＝只算打折最兇的那一筆，與「失手率取最大值」一致；相乘＝兩層 0.5 變成 0.25，疊到第三層幾乎等於禁療。引擎自己對「同型效果怎麼疊」沒有一致答案（失手率取最大、護盾相加），所以這一格是留給你決定的，不是一個技術細節。",
      optionLabels: {
        max: "取最重（出貨值）",
        multiply: "相乘（會疊爆）",
      },
    },
  ],
  // 這一頁只有一格純量,沒有任何不編輯的分支要原封帶走。
  preserved: [],
};

const WEAKNESS_SPEC: ConfigDocSpec = {
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
  fields: [
    {
      path: "statusTag",
      zh: "哪一個狀態分類算虛弱",
      note: "引擎不認任何寫死的狀態編號 —— 它問的是「這個人身上有沒有一筆帶著這個分類的狀態」。所以只要一份狀態文件的 tags 帶了這個字，任何技能掛上它就會虛弱。⚠️ 目前出貨的 28 份狀態沒有一份帶這個分類，所以在那一份文件上架之前，這個機制一場比賽裡一次都不會發生。",
    },
    {
      path: "attackSpeedMult",
      zh: "被虛弱時攻速乘多少",
      note: "0.5 = 減半（出貨值）。1 = 把攻速那一半關掉，只留傷害那一半。0 = 完全打不出普攻。⚠️ 它乘的是最終攻速，不進屬性面板。",
    },
    {
      path: "damageDealtMult",
      zh: "被虛弱時造成的傷害乘多少",
      note: "0.5 = 減半（出貨值）。⚠️ 是「他打出去的」不是「他受到的」—— 單挑時兩者看起來一樣，混戰裡完全不同：虛弱的人打誰都軟。普攻／技能／持續傷害／道具觸發全部走同一條隊列，所以每一發各打折一次。",
    },
  ],
  // 這一頁三格純量,沒有任何不編輯的分支要原封帶走。
  preserved: [],
};

const COOLDOWN_RULES_SPEC: ConfigDocSpec = {
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
  fields: [
    {
      path: "enabled",
      zh: "秒數地板總開關",
      note: "關掉之後冷卻可以被縮到任意短（受比率天花板限制）。⚠️ 它**不**關掉冷卻縮減本身 —— 那是一格屬性，天花板在「屬性上限」頁。",
    },
    {
      path: "minSeconds",
      zh: "最短冷卻秒數",
      note: "一支技能的實際冷卻不會低於這個秒數。出貨 **0.1**（owner 指定）。填 0 ＝ 沒有地板。⚠️ 上界 10：再高就會把大多數技能的冷卻**拉長**而不是設地板（一支 3 秒 CD 的技能配一個 30 秒的「地板」），那是打錯數字的樣子。",
    },
  ],
  // 兩格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

const AUTHORING_RULES_SPEC: ConfigDocSpec = {
  page: "authoringRules",
  collection: "config",
  docId: "authoring-rules",
  schemaTag: "config.authoring-rules@1",
  zod: zConfigAuthoringRulesDoc,
  title: "編輯器創作規則",
  intro: [
    "外部技能編輯器（Codex 那一支）建包時看到的**原則界**。GH#327。",
    "⭐ **這一頁只有原則界,⛔ 硬界不在這裡。** 硬界（升階冷卻上升、AoE 超過決鬥區、階數不符）從既有的 Zod 界與「吟唱規則 / 冷卻規則 / AoE 級距 / 屬性上限」四頁**推導**出來 —— 抄一份到這裡就是第二個住處,而它一定會過期。",
    "⚠️ **違反原則界只警告,不擋。** owner 2026-08-12 的原話是「**原則上**附加技能升級冷卻不會增加」—— 保留刻意破例的空間。一律擋 = 想破例就得改程式;一律放 = 真缺陷跟設計選擇混在同一堆訊息裡。",
    "⭐ 改這一頁 → 端點 `GET /api/v1/content-import/authoring-rules` **下一秒就變**,外部編輯器不用改一行程式。那正是它取代散文的理由。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/）,**覆蓋層會蓋掉 `content/config/authoring-rules.json`**。",
  ],
  consumer:
    "packages/shared/src/content/authoringRules.ts 的 buildAuthoringRules()（唯一知道這些界怎麼組的地方）← content-api 的 /authoring-rules 端點 + content/editor-target-profile.json 的內嵌副本",
  effect: "**外部編輯器下一次讀端點就生效**;內嵌在 profile 裡的那一份要重跑 `pnpm content:build`。",
  fields: [
    {
      path: "singleTargetCooldown.min",
      zh: "單體技能冷卻下限",
      note: "出貨 **5 秒**。低於它的單體技能等於「一直按」,而那會讓其他技能的存在感消失。⚠️ 只警告不擋。",
    },
    {
      path: "singleTargetCooldown.max",
      zh: "單體技能冷卻上限",
      note: "出貨 **30 秒**。高於它玩家一場只放得出幾次,而單體技能的定位是常用手段。",
    },
    {
      path: "aoeCooldown.min",
      zh: "範圍技能冷卻下限",
      note: "出貨 **30 秒** —— 比單體技能長,因為它一次打到很多人;冷卻太短會讓範圍技變成常態手段,而單體技能失去存在的理由。",
    },
    {
      path: "aoeCooldown.max",
      zh: "範圍技能冷卻上限",
      note: "出貨 **120 秒**。高於它的範圍技一場放不到兩次,那個定位應該用「變身/長持續」那一條界,而不是把範圍技拉長。",
    },
    {
      path: "transformCooldownMin",
      zh: "變身／長持續冷卻下限",
      note: "出貨 **120 秒**。⭐ 只有下限沒有上限是刻意的:這一類技能的價值來自「一場只有幾次」,冷卻太短會讓變身變成常態 —— 那等於直接改了那位英雄的基礎形態。",
    },
  ],
  preserved: [],
};

const CONTENT_LOAD_SPEC: ConfigDocSpec = {
  page: "contentLoad",
  collection: "config",
  docId: "content-load",
  schemaTag: "config.content-load@1",
  zod: zConfigContentLoadDoc,
  title: "內容載入政策",
  intro: [
    "一份壞掉的內容文件，要不要殺掉**整份**內容。owner 2026-08-14：「遊戲主程式應該要把**全有全無**的這種奇怪機制改掉，應該改為**不同部分各自 check 載入成功**」。",
    "⭐ 這一頁存在是因為那個「全有全無」其實只是一行程式的決定，不是架構限制 —— `loader.ts` 從第一天就**逐份**收集錯誤（每一份壞的都記下 collection、id、Zod 的逐條 issue），只是最後一行把整批丟掉。",
    "⚠️ **代價已經發生過兩次**（2026-08-01、08-02）：四份 config 文件的 schema tag 不在已部署映像的 Zod union 裡 → 內容載入整份失敗 → 客戶端 fail-open 退回 2 隻骨架英雄 → 選人畫面空掉、沒有人進得去。**而網站看起來完全正常**，唯一說實話的是 console 一行 log。隔離之後，同一次的結果會是「少四份設定」。",
    "⛔ **隔離不等於安靜**：被隔離的每一份都會出現在 game shard 的 `GET /healthz` 的 `content.quarantined` 與 `content.quarantinedDocs`，開機 log 也會逐份印出來。那是這一頁能存在的前提 —— 一個沒有人知道的隔離，比整份失敗更糟。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/content-load.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/loader.ts 的 ContentLoader.load()（唯一知道這三格怎麼作用的地方）← game-server 開機、客戶端 main.tsx 的內容載入都走它。⚠️ 政策文件自己也在被載入的那一批裡，所以它**在迴圈跑完之後才被讀**；它自己壞掉時退回出貨預設，而且會出現在隔離清單裡。",
  effect:
    "**要重啟 game-server shard 才生效**（客戶端則是下一次重新整理）。",
  fields: [
    {
      path: "policy",
      zh: "一份壞文件的處置",
      note: "`quarantine`（出貨）= 壞的那幾份不進登錄表，其餘照常載入。`fail-closed` = 舊行為，任何一份壞掉整份失敗。⚠️ 舊行為在客戶端的樣子不是錯誤畫面，是**悄悄退回 2 隻骨架英雄** —— 那正是 owner 要廢掉它的理由。",
      optionLabels: {
        quarantine: "quarantine（隔離壞的、好的照跑）",
        "fail-closed": "fail-closed（舊行為：一份壞掉整份失敗）",
      },
    },
    {
      path: "cascadeDanglingRefs",
      zh: "隔離會不會傳染",
      note: "文件 A 硬參照到被隔離的 B 時，A 要不要也被隔離。⭐ 開著（出貨）擋的是**半個世界**：英雄載進來、他的 Q 沒載進來 = 一格空技能，而且沒有人會發現。寧可少一隻英雄，⛔ 不要一隻壞掉的英雄。關掉的話那些斷掉的參照會降級成警告，文件留著。",
    },
    {
      path: "maxQuarantined",
      zh: "隔離上限（超過就退回全有全無）",
      note: "隔離超過幾份就改用 `fail-closed`。出貨 **50**。⚠️ 這是 quarantine 的安全閥：「少四份設定」與「內容整份跟這個映像不相容」是兩件事，而後者隔離出來的結果是一個**空的遊戲** —— 那比誠實地退回骨架更糟，因為骨架至少會讓 `/healthz` 的 `content.ok` 變 false。填 0 ＝ 完全不容忍（等於 fail-closed）。",
    },
  ],
  // 三格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

const CAST_TIME_SPEC: ConfigDocSpec = {
  page: "castTime",
  collection: "config",
  docId: "cast-time",
  schemaTag: "config.cast-time@1",
  zod: zConfigCastTimeDoc,
  title: "吟唱規則",
  intro: [
    "技能按下去到生效之間，玩家站著不動多久。owner 2026-08-13：「請你照我的 **0.06~4.00 秒**來設定吟唱時間（所有的技能都有最低吟唱技能時間 0.06 秒，讓 tick 一定可以處理）」＋「**吟唱時間倍率**也可以在系統後台設定」＋「吟唱時間**上下限**也可以一起設定」。",
    "⭐ **三格是同一條算式的三個位置**，所以住同一頁：先把技能算出來的吟唱夾進 [下限, 上限] → 乘倍率 → **再夾一次** → 對齊整數 sim tick。夾兩次是刻意的：先夾擋作者打錯的「吟唱 10 秒」，後夾讓倍率 3 也不會把 2 秒推成 6 秒。",
    "⚠️ **下限的下界是一個 sim tick（≈0.034 秒），不是 0。** sim 是 30 Hz，用 `round(秒數 ÷ 1/30)` 換算 tick：0.06 秒 = 2 tick（穩）、0.02 秒 = 1 tick、0.01 秒 = **0 tick ⇒ sim 當它瞬發**。而客戶端**照樣畫得出**吟唱條與向天光束預告 —— 兩邊都不報錯，只有玩家看得出來。這就是 owner 那句「讓 tick 一定可以處理」在說的事。",
    "⛔ **不要改用「戰鬥系統」頁的冷卻倍率代替**：冷卻管「多久能再按一次」，吟唱管「按下去到生效多久」。用同一個旋鈕會把兩者一起動，等於什麼都沒調。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cast-time.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/castTimeRules.ts 的 applyCastTimeRules（唯一知道三格怎麼作用的地方）← abilities/abilitySystem.ts 每一次施法時呼叫一次，瞄準鎖窗口／實際吟唱 tick／送給客戶端畫吟唱條的秒數**三者共用同一個結果**；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.castTimeRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 冷卻規則／淨化規則／格擋規則 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "吟唱規則總開關",
      note: "關掉之後三格全部不作用，吟唱照技能自己算出來的秒數走。⚠️ **它也關掉下限** —— 於是低於一個 tick 的技能會退回「客戶端畫得出來、sim 當它瞬發」那個狀態。這一格是給排查用的（「是不是這三格害的？」），⛔ 不是拿來常關的。",
    },
    {
      path: "multiplier",
      zh: "全域吟唱倍率",
      note: "所有技能的吟唱一起快慢。1.0 ＝ 照算出來的值；0.5 ＝ 全部減半（更靈活、更難閃）；2.0 ＝ 全部加倍（更笨重、預告更好躲）。⚠️ 它在**夾完之後**才乘、然後**再夾一次**，所以開到 5 也不會有任何技能超過下面的上限。",
    },
    {
      path: "floorSec",
      zh: "吟唱下限（秒）",
      note: "有吟唱的技能最短幾秒。出貨 **0.06**（owner 指定 ＝ 2 個 sim tick）。⛔ 下界是 **0.034（一個 tick）不是 0** —— 理由見上面第三段。⚠️ 它**不會**把瞬發技（吟唱 0）變成 0.06：那一格管的是「有吟唱的技能最短多長」，把每支瞬發技都推到 0.06 會讓全部技能一起變鈍。",
    },
    {
      path: "capSec",
      zh: "吟唱上限（秒）",
      note: "任何技能最長幾秒。出貨 **4.00**（owner 指定）。這是「一支技能最多能讓玩家站著不動多久」的硬上界，也是作者在說明裡寫「吟唱 10 秒」時被夾住的地方。⚠️ 填得比下限還低時**下限贏** —— 否則夾出來的區間是空的，下限會被無聲違反。",
    },
  ],
  // 四格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

const AOE_TIERS_SPEC: ConfigDocSpec = {
  page: "aoeTiers",
  collection: "config",
  docId: "aoe-tiers",
  schemaTag: "config.aoe-tiers@1",
  zod: zConfigAoeTiersDoc,
  title: "AoE 範圍四級距",
  intro: [
    "技能的範圍**寫級別不寫數字**。owner 2026-08-11：「重新對應範圍只有 小／中／大／超大，**原則上不寫範圍數字**」。技能 JSON 填 `radiusTier: \"中\"`，這一頁決定「中」是多少半徑。",
    "⭐ 這一頁存在的理由就是**單一住處**：把數字寫在每支技能上等於 115 個住處，想把「中」從 4.5 調成 5.0 要改 115 個檔案。填了級別的技能，改這一格全部一起動。",
    "四個級別的意思：小 ≈ 同時打到 5 人 ／ 中 ≈ 10 人（預設）／ 大 ≈ 1/4 競技場 ／ 超大 ≈ 1/3 競技場。",
    "⚠️ 這四個數字是**卡面值**。玩家實際吃到的是它再乘「戰鬥系統」頁的 `abilityRange`（出貨 0.8）—— 所以「大 = 6」畫在地上是 4.8，也就是決鬥區半徑 24 的 **1/5**，不是 1/4。要讓比例在畫面上成立，這四格要各自除以 0.8。",
    "⚠️ AoE 命中是身體碰撞（英雄碰撞半徑 0.6），所以半徑 r 實際會掃到**圓心距離 r + 0.6** 的人。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/aoe-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/aoeTiers.ts 的 resolveRadiusTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能註冊時把 radiusTier 翻成 radius；standalone 與 champion-embedded 兩條路共用同一個答案",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 冷卻規則／淨化規則 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `radiusTier` 不解析（填了也不生效），技能只剩手寫的 `radius`。⚠️ 關掉**不會**讓技能失去範圍 —— 手寫值一直都在。",
    },
    {
      path: "radius.小",
      zh: "小 — 半徑",
      note: "填 `radiusTier: \"小\"` 的技能實際掃多大。約同時打到 5 人（原 WC3 100~200）。改這一格，樹上每一支標成「小」的技能同時跟著變。",
    },
    {
      path: "radius.中",
      zh: "中 — 半徑",
      note: "填 `radiusTier: \"中\"` 的技能實際掃多大。約同時打到 10 人，是**預設級別**（原 WC3 200~300），所以動它影響的技能數最多。",
    },
    {
      path: "radius.大",
      zh: "大 — 半徑",
      note: "填 `radiusTier: \"大\"` 的技能實際掃多大。設計意圖是 1/4 競技場（卡面座標：決鬥區半徑 24 ÷ 4），原 WC3 300~500 那一批就落在這裡。",
    },
    {
      path: "radius.超大",
      zh: "超大 — 半徑",
      note: "1/3 競技場（卡面座標：24 ÷ 3）。原 WC3 500 以上。⚠️ 上界 24 ＝ 決鬥區半徑：大於它就是全場命中，那要走不設 radius 的寫法，不是把這格填爆。",
    },
  ],
  // 四格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};


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
    { path: "referenceLevel", zh: "成長通道的基準等級", note: "級距那三個數字是「**這一級**的最終總值」。出貨 18。⚠️ 改它會讓三格的數字整組換一個意思 —— 基準拉到 30，同樣填 26.2 就變成「30 級時是 26.2」，於是每一級的成長變小。" },
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

const STAT_NORMALIZATION_SPEC: ConfigDocSpec = {
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

const DISPEL_SPEC: ConfigDocSpec = {
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
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/dispel.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/effects/dispel.ts（每一發 dispel effect 都會呼叫，讀 world.dispelRules 的全部十一格）→ sim/clearPools.ts；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.dispelRules",
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
      note: "全域上限：文件沒寫層數時用它，**文件寫了也夾不過它**。一句話管到底，避免出現兩個會分歧的上限。填 1＝每發只解一層（很弱但很好懂）；填大＝一發清光。",
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

const BERSERK_SPEC: ConfigDocSpec = {
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

const AUGMENT_FILTER_SPEC: ConfigDocSpec = {
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

const STEALTH_SPEC: ConfigDocSpec = {
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
      note: "0 = 完全看不見，1 = 和平常一樣。⚠️ **不要設 0** —— 你會看不到自己操作的角色，那支英雄就不能玩了。出貨值 0.35 是「明顯在那裡、明顯不是實體」。",
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

const TAUNT_SPEC: ConfigDocSpec = {
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
      note: "圓心到圓心的距離（GGD 單位）。超過就當場鬆手，走回來又生效 —— 和到期一樣是**每 tick 重問**的。⚠️ 嘲弄本來就無視受害者自己的索敵半徑（那是刻意的：半徑是「我看多遠」，不是嘲弄的射程），所以在這一格出現之前**沒有任何東西**限制嘲弄者可以把一具身體拖多遠：掛上、跑掉，對方就一路追過整個競技場。出貨 24 ＝ 一個決鬥區的半徑；鍊金術之盾實際能碰到的範圍只有 5.5，所以 24 對現行內容一格都沒動。**0 ＝ 不限制**（舊行為）。上界 100 是誤植守衛 —— 區域直徑才 48。",
    },
    {
      path: "maxTargetsCap",
      zh: "一發範圍嘲弄最多拉幾個人",
      note: "道具／技能沒有自己寫「最多幾個」時用這個數字，寫了也**夾不過**它 —— 一句話管到底，不會出現兩個上限互相打架。出貨 20 就是這一格出現之前寫死在程式裡的那個數字（鍊金術之盾自己寫 8，本來就在底下，所以出貨行為沒變）。調低它是壓制坦克盾在殭屍波裡強度最直接的一格。",
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

// ─────────────────────────────────── 傷害數字配色 (config/damage-colors) ───

/** `#rrggbb`，和 shared 的 `zColorHex` 同一條規則。 */
const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const HEX6_ERROR = "顏色要寫成 #rrggbb 六位十六進位（例如 #FF5900），不能寫顏色名稱";

const DAMAGE_COLORS_SPEC: ConfigDocSpec = {
  page: "damageColors",
  collection: "config",
  docId: "damage-colors",
  schemaTag: "config.damage-colors@1",
  zod: zConfigDamageColorsDoc,
  title: "傷害數字配色",
  intro: [
    "owner 2026-08-01：「真實傷害目前在畫面上看不出來 => 顯示白色傷害數字(紅物理; 紫魔法; 白真實; 綠治療)」。這一頁就是那四個顏色。",
    "在這一頁出現之前，客戶端只判斷「是不是魔法」，所以**真實傷害的數字和物理傷害一模一樣** —— [無視] 這件事在畫面上唯一的證據是「對面死得比較快」。火花、噴血與音效本來就分得出三種，飄字與身體閃光是唯二沒分的兩條，也是最大聲的兩條。",
    "⚠️ **飄字與閃光的值不一樣是刻意的，不是抄漏。** 飄字是畫在黑框上的文字，純白最清楚（對黑框 21:1）；身體閃光是疊色（結果 = 原色×0.4 + 疊色×0.6），白色只能把三個通道往上推，在淺色模型上實測只移動 ΔRGB 0.03~0.09 —— 也就是說「白色閃光」在最需要它的那些模型上等於沒有閃。所以真實傷害的**閃光**是青白色，那是還看得見的最白的一個。",
    "⚠️ 每一格的出貨值都對四個真實地面（土色／暗土／石地／白岩）與四個隊伍色量過。要換色的話請記得兩件事：**紫色不要調太深**（黑框在暗土上只有 2.13:1，深紫會連框帶字一起變成一團），**不要用接近隊伍色的顏色**（會被讀成隊伍標示而不是傷害）。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/damage-colors.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
    "── 外框（第二個通道）── owner 2026-08-01：「加第二個通道，不動色相 => ok」。上面那條裁決把顏色花在「哪一種傷害」上，代價是**「我打人」和「我被打」變成同一個顏色**。下面四格把那個分別放回去，但**不動顏色**：填色繼續講傷害屬性，外框講「這是誰的血」—— 我打人黑框、我被打深紅框。兩個通道用的是不同的畫素，所以不會互相搶。",
    "⚠️ **這裡調的是外圈，不是那圈黑框。** 黑框是 #164「傷害數字看起來是黑色」修好之後留下的辨識度地板，而且它**沒有餘裕可以換色**：實測黑框對土色地面（#6d6250）只有 3.51:1，而物理傷害的填色 #FF5900 在同一個地面只有 1.90:1 —— 那個地面完全靠黑框撐。把黑框換成任何一個看得出來是紅色的顏色（#5A0000 → 2.45:1）就會掉到 3.0 以下，整個數字在土地上糊成一團。所以做法是**在黑框後面多畫一圈**：黑框原封不動，外圈提供顏色。",
  ],
  consumer:
    "apps/client/src/render/damagePalette.ts 的 applyDamageColorsDoc()（由 ContentDb.load 呼叫）→ damageTextColor() 被 ui/combatText.ts 的 combatTextStyle() 讀走畫飄字，damageFlashRgb() 被 render/combatFeedback.ts 的 flashColorFor() 讀走畫身體閃光，damageOutlineMode()/damageOutlineColor()/damageOutlineWidthMult() 被 ui/combatText.ts 的 combatTextBand() 讀走決定外圈，最後由 combatTextShadow() 疊進 WorldAnchorLayer 真的寫上去的那個 text-shadow",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。",
  fields: [
    {
      path: "textAxis",
      zh: "傷害數字的顏色代表什麼",
      note: "damageType（出貨值，owner 的裁決）＝ 顏色就是傷害屬性，物理紅／魔法紫／真實白，不管是誰打誰。relation ＝ 這條裁決之前的做法：顏色代表「誰被打」（受到傷害是橘紅、造成傷害是白），傷害屬性只在魔法時加一層淡紫。⚠️ 兩邊各有代價：damageType 之下「我打人」和「我被打」同一個顏色，只靠字級（30 vs 24）、高度與飄開的方向分辨；relation 之下真實傷害又會變得看不出來，也就是這一頁存在的原因。",
      optionLabels: {
        damageType: "damageType 顏色＝傷害屬性（出貨值）",
        relation: "relation 顏色＝誰被打（舊做法）",
      },
    },
    {
      path: "text.physical",
      zh: "物理傷害數字",
      note: "普攻與所有物理技能跳出來的數字顏色。出貨 #FF5900 是一個橘紅：純紅 #FF0000 在暗土地面上只有 2.47:1，字和黑框都是暗的，整個數字糊成一團 —— 所以「紅」在這裡不等於 #FF0000。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "text.magic",
      zh: "魔法傷害數字",
      note: "法術傷害（AP）跳出來的數字顏色。出貨 #B872FF。⚠️ 不要換成更深的紫（#9D4EDD／#8B5CF6 那一類）：黑框在暗土地面上只有 2.13:1，深紫的字本身也過不了 3.0，兩層都暗的結果就是看不見。也要離「閃避」那個薰衣草 #C9A7FF 夠遠，不然場上會有兩個分不出來的紫。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "text.true",
      zh: "真實傷害數字",
      note: "無視防禦的傷害（火圈燃燒、[無視] 系的裝備）跳出來的數字顏色 —— 這一格就是這一頁的起因。出貨純白 #FFFFFF：對黑框 21:1，是這個調色盤裡最清楚的一個，而且離四個隊伍色都很遠。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "text.heal",
      zh: "治療數字",
      note: "補血跳出來的數字顏色，**上面那個選項切到哪一邊都吃這一格**（屬性軸只管傷害，治療永遠是治療）。出貨 #00FF00 是 RO 原本的綠。補魔不吃這一格：它有自己的青色＋斜體＋反方向飄開，那是為了讓色盲玩家也分得出補血與補魔。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "flash.physical",
      zh: "物理傷害的身體閃光",
      note: "被物理攻擊打中時，模型身上那一下疊色。出貨 #FF2626 紅：它在七個真實模型顏色上（全黑的老二到偏白的北斗神拳掌門人）都能把兩個通道**壓下去**，所以每一隻都看得到。技能自己指定了顏色的話（31 支技能文件有寫）會蓋掉這一格，那是刻意的。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "flash.magic",
      zh: "魔法傷害的身體閃光",
      note: "被法術打中時模型身上那一下疊色，出貨 #FF59E6 洋紅。⚠️ 它是三個裡面最淡的一個，已經貼著「還看得見」的下限（最大與最小通道差 0.65）；再往白色調就會在淺色模型上消失。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "flash.true",
      zh: "真實傷害的身體閃光",
      note: "被真實傷害打中時模型身上那一下疊色，出貨 #33FFFF 青白。⚠️ **這裡不能填純白 #FFFFFF。** 疊色的算法是「結果 = 原色×0.4 + 這個顏色×0.6」，白色只會把通道往上推，在淺色模型上實測只移動 0.03~0.09（紅色是 0.45）—— 填白等於把「真實傷害看不出來」這個問題原封不動搬到身體上。#33FFFF 是還看得見的範圍裡最白最冷的一個。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "outline.mode",
      zh: "哪些數字要換外框",
      note: "決定「我被打」那一組包含誰。incoming（出貨值）＝ 所有朝我來的一擊都換框：掉血的數字、被盾整個吃掉的 GUARD、閃掉的「閃避」。taken ＝ 只有真的掉血的那個數字換框，畫面最安靜。off ＝ 全部同一個外框，也就是這個功能出現之前的樣子（「我打人」和「我被打」在同一種傷害屬性下會變回完全一樣，只剩字級 30 vs 24、高度與飄開方向可以分）。⚠️ 會猶豫的是「閃避」：它是朝我來的一擊，但我沒被打到，兩種讀法都說得通 —— 所以它是一格下拉選單而不是寫死的。",
      optionLabels: {
        off: "off 全部同框（這個功能出現之前）",
        taken: "taken 只有掉血的數字換框",
        incoming: "incoming 掉血＋GUARD＋閃避都換框（出貨值）",
      },
    },
    {
      path: "outline.outgoing",
      zh: "「我打人」的外框顏色",
      note: "我造成的傷害、治療、補魔以及所有第三方飄字的外圈顏色。出貨 #000000 就是那圈黑框本身的顏色，而**與黑框同色的外圈不會被畫出來** —— 所以出貨狀態下「我打人」的數字和這個功能出現之前逐位元相同，換框的只有「我被打」那一組。想讓自己打出的數字也有識別色的話（例如填一個深藍 #0A1E4D），改這一格就會生效。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "outline.incoming",
      zh: "「我被打」的外框顏色",
      note: "上面那格選中的那些數字，外圈換成這個顏色。出貨 #5A0000 深紅是量出來的，三個條件同時滿足：離黑色夠遠（ΔE 48.1，不然這個通道等於沒加）、離四個隊伍色夠遠（最近的隊伍紅 ΔE 45.9，不然會被讀成隊伍標示）、對每一個可能被它包住的填色都 ≥ 4.66:1（不然外圈會和數字糊在一起）。⚠️ **不要填太亮的紅**：外圈越亮就越搶填色，而填色才是講傷害屬性的那一條；也不要填純黑，那等於把這個功能關掉。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "outline.widthMult",
      zh: "外框比黑框粗幾倍",
      note: "外圈半徑 ÷ 黑框半徑。出貨 1.9 → 30px 的受傷數字得到一圈約 1.8px 的深紅。調小 = 顏色變成一條細邊，遠看認不出來（這個功能就白做了）；調大 = 數字整個被一團深紅包住，會蓋掉旁邊的東西也會讓字看起來更肥。下界 1.1 是因為等於 1 時外圈完全被黑框蓋住，那是第二個關閉開關；上界 3 是誤植守衛（黑框 2px × 3 = 6px 已經不是描邊而是色塊了）。",
    },
  ],
  preserved: [],
};


// ───────────────────────────────── 場地環境火焰 (config/ambient-vfx.arenaFire) ─

const ARENA_FIRE_SPEC: ConfigDocSpec = {
  page: "arenaFire",
  collection: "config",
  docId: "ambient-vfx",
  schemaTag: "config.ambient-vfx@1",
  zod: zConfigAmbientVfxDoc,
  title: "場地環境：火焰與圓盤外背景",
  intro: [
    "這一頁管的是同一份文件（`config/ambient-vfx`）裡的兩件事：**場地環境火焰**（GH#251）與**圓盤外的 2D 景深背景**（GH#324）。⚠️ 它們合在一頁不是分類偷懶 —— 通用表單引擎是**整份文件存回去**的，同一份文件拆成兩頁會讓兩頁互相蓋掉對方的欄位。",
    "⭐ 兩者的出貨值**故意相反**：火焰是**關**的（owner 說礙眼），背景是**開**的（owner 說要填補場景外的空缺）。同一條原則 —— 讀不到設定時要退回 owner 要的那一邊。",
    "owner 2026-08-01 實戰回饋：「場地天空火焰很礙眼 請全部場地都去掉」(GH#251)。這一頁就是那把火的開關，出貨值已經是**關**。",
    "在這一頁出現之前，這件事寫死在 `dressArena` 的一行 `d.model.includes(\"torch\")` 裡：只要場地文件擺了一支火把，就一定有一團常駐的加色火焰粒子，後台一格都調不到。實際數量是 skeleton（**預設場地**）16 團、castle 16 團、colosseum 16 團、royale 4 團，dota 與 godie 0 團。",
    "⚠️ 火焰是**加色混合**（additive）的，所以它在暗色地面上永遠是畫面裡最亮的東西之一，而且 16 團全在場地邊緣 —— 那正是 owner 說「礙眼」的位置。要開回來的話建議先把「同時幾團」調小再開，而不是直接 16 團全點。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ambient-vfx.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/render/ArenaScene.ts 的 dressArena()（由 GameApp.applyArena 呼叫，政策從 ContentDb.arenaFire() 取得）→ 每一個命中的 decor 道具呼叫一次 attachFlame()",
  effect:
    "玩家**下一次重新整理遊戲頁面**、而且**下一次換場地**（dressArena 重跑）時生效。已經蓋好的場地不會中途點火或熄火 —— 那是刻意的：dressArena 是一次性的布景 pass，不是每幀跑的東西。",
  fields: [
    {
      path: "arenaFire.enabled",
      zh: "場地要不要有環境火焰",
      note: "關（出貨值）＝ 所有場地的火把一團火都不冒，也就是 owner 要的結果；開＝ 命中的布景道具每一支都掛一團常駐的加色火焰。這是唯一決定「場上有沒有火」的一格，下面三格只有在它開著時才有意義。",
    },
    {
      path: "arenaFire.maxEmitters",
      zh: "一張場地最多幾團火",
      note: "同時存在的火焰粒子系統上限，超過的火把就單純不冒火（依場地文件的順序先到先得）。每一團都是一組獨立的粒子系統加一張貼圖，所以這個數字直接就是「這張場地為了火焰多付出的繪製成本」。16 ＝ 出貨場地的火把全部點燃；填 4 就是只點四支，畫面上仍然有火但不會沿著整圈邊緣亮一排。",
    },
    {
      path: "arenaFire.emitRate",
      zh: "每團火每秒噴幾顆粒子",
      note: "火焰的濃密程度。18（出貨值）是一團看得出在燒的小火；調低會變成稀疏的火星、調高會變成一團實心的亮塊 —— 而 16 團同時調高就是 owner 抱怨的那個畫面。它同時決定同螢幕的粒子總量，手機發燙時這一格比關掉整個功能溫和。",
    },
    {
      path: "arenaFire.sizeScale",
      zh: "火焰粒子的大小倍率",
      note: "1（出貨值）＝ 每顆粒子 0.3–0.6 個世界單位，大約是英雄身高的五分之一到三分之一。這一格直接決定火焰在畫面上佔多大 —— 它比上面那格更影響「礙不礙眼」，因為粒子變大是面積成長不是數量成長。2 已經是一團跟英雄一樣高的火。",
    },
    {
      path: "backdrop.enabled",
      zh: "圓盤外要不要有景深背景",
      note: "開（出貨值）＝ 場地邊界外面鋪上一層層往下沉的環帶，看起來像場地漂在一個有深度的世界裡；關＝ 圓盤外回到純色底（深藍黑），也就是這個功能做之前的樣子。⚠️ 攝影機俯角 68 度，畫面最上緣在水平線下方 45 度，所以**地平線永遠不進畫面** —— 圓盤外看得到的只有地板平面，這也是為什麼這裡是一層層攤平的環帶而不是一面天空盒。",
    },
    {
      path: "backdrop.maxLayers",
      zh: "最多畫幾層背景",
      note: "每一層是 1 個繪製呼叫、最多 128 個三角面（對照：一隻英雄 1,500–2,000 面），所以 4 層（出貨值）的成本大約是四分之一隻英雄。⭐ 手機掉幀時這一格是最先該調的：砍掉的是**最外圈**那幾層（最遠、最暗的先消失），所以調到 1 也不會在場地邊界旁邊留下一圈黑洞。填 0 等同關閉。",
    },
    {
      path: "backdrop.alphaScale",
      zh: "背景整體透明度倍率",
      note: "乘在每一層自己的透明度上。1（出貨值）＝ 照地圖文件寫的畫。⭐ 覺得「背景太搶戲、看不清楚場上」的時候先動這一格，而不是直接關掉整個功能 —— 調到 0.4 會讓整個背景往後退成一層淡淡的底，場地邊界仍然讀得出來。0 ＝ 全透明（看起來跟關掉一樣，但仍然付繪製成本，所以真的不要就用上面那格關掉）。",
    },
  ],
  preserved: [
    {
      path: "bindings",
      why: "逐模型的**環境特效綁定表**（英雄身上的常駐光暈／餘燼尾巴／緞帶翅膀，9 個模型共 17 條）。這一頁不編輯它，但每次儲存都必須原封不動帶著走 —— 掉了的話那 9 位角色身上的常駐特效會全部消失，而畫面上沒有任何錯誤訊息。",
    },
    {
      path: "arenaFire.models",
      why: "哪些布景道具會冒火（對 decor 的 `model` 路徑做子字串比對，出貨值是 `[\"torch\"]`，命中 torch.glb 與 torch_mounted.glb）。通用表單引擎畫不了字串陣列，所以這一頁不編輯它；掉了的話就算開關打開也一團火都不會出現。要改它請走內容覆蓋層。",
    },
  ],
};

// ───────────────────────────────── 勝利煙火 (config/victory-fx) ────────────

const VICTORY_FX_SPEC: ConfigDocSpec = {
  page: "victoryFx",
  collection: "config",
  docId: "victory-fx",
  schemaTag: "config.victory-fx@1",
  zod: zConfigVictoryFxDoc,
  title: "勝利煙火",
  intro: [
    "owner 2026-08-02 實戰回饋：「天空的火焰似乎沒有被移除，我懷疑是煙火的時間太長」→ 裁決「請你直接取消煙火(變成後台開關)」。這一頁就是那兩把開關，**出貨兩格都是關的**。",
    "程式碼一行都沒有刪。「贏了要不要放煙火」是一個決策點不是一個 bug，所以它是兩格開關而不是一次刪除 —— 改主意時打勾就好，不必再改程式碼＋重新部署一次。形狀和 場地環境火焰 (GH#251) 一模一樣，理由也一樣。",
    "⚠️ **量到的煙火長度其實很短**：回合小煙火約 1.3 秒、烤雞煙火約 4.3 秒，而且結束後場上不留任何粒子系統。owner 感覺到的「時間太長」有一個已知的機制解釋 —— 煙火的收尾**完全靠 requestAnimationFrame 驅動**，切到別的分頁／手機息屏時整個凍結在那一幀，切回來才在一幀之內自癒。所以「切出去再切回來」看到的就是一團不動的火。這一頁關掉煙火就不會遇到；要開回來的話這件事還在。",
    "⚠️ 這兩格**只關煙火**。結算畫面的灰底（回合）與暗底（全場）、以及勝利嘲弄語音都不受影響 —— 那些是別的功能，一起關掉會是沒有人要求的迴歸。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/victory-fx.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/vfx/VictoryFireworks.ts 的 sync()（GameApp 每幀呼叫；政策由 ContentDb.load() 經 vfx/victoryFxPolicy 的 applyVictoryFxDoc 推進來）→ 決定 SmallFireworkFx.play() / ChickenFireworkFx.play() 要不要被呼叫；烤雞那格同時決定 ui/panels/MatchEndPanel 要不要把計分卡壓住 2340 毫秒",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（設定是在內容載入時讀進特效層的）。已經在進行中的那一場不會中途改變。",
  fields: [
    {
      path: "roundVolley.enabled",
      zh: "每回合贏的時候放小煙火",
      note: "關（出貨值）＝ 打贏一個回合時天空不會有任何煙火，畫面只剩下灰底與獲勝者的角色。開＝ 每贏一回合放一輪三發的小煙火，約 1.3 秒。這是一場裡最常看到的那一種（一場打 3–5 回合就放 3–5 次），也是三個數字裡最貴的一個：峰值會多出約 28 個粒子系統，手機上最有感的就是它。",
    },
    {
      path: "matchChicken.enabled",
      zh: "全場獲勝時放烤雞煙火",
      note: "關（出貨值）＝ 吃雞時天空不會出現那隻全螢幕的烤雞，而且**結算計分卡會立刻出現**（那 2.34 秒的延遲存在的唯一理由就是讓烤雞被看到，煙火關掉之後它就只是純粹的空等）。開＝ 一場只放一次、約 4.3 秒，然後計分卡才淡入。這是 #93 花了七次迭代才做到看得出是一隻雞的那個東西。",
    },
  ],
  preserved: [],
};

// ────────────────────────────────── 回合頒獎台 (config/victory-podium) ─────

/**
 * 三個「播哪一個剪輯」共用同一組中文。三格問的是同一個問題，答案不一樣的時候
 * 才有訊息（三個都 celebrate 就沒有「誰是第一」了），所以選項的說明要一致。
 */
const VICTORY_PODIUM_CLIP_LABELS: Record<string, string> = {
  celebrate: "celebrate（慶祝｜找模型自己的 cheer／Stand Victory，沒有的退回站姿並在 console 警告一次）",
  idle: "idle（站著｜和在商店裡發呆同一個動作）",
  death: "death（倒下｜給「敗方也上台」那種玩法用的）",
};

const VICTORY_PODIUM_SPEC: ConfigDocSpec = {
  page: "victoryPodium",
  collection: "config",
  docId: "victory-podium",
  schemaTag: "config.victory-podium@1",
  zod: zConfigVictoryPodiumDoc,
  title: "回合頒獎台",
  intro: [
    "一個回合分出勝負時，畫面中央那一排 3D 模型要站幾個人、誰站正中間、誰在慶祝、第一名開口說什麼。owner 2026-08-03：「回合勝利出現的 3d model 是勝利角色 但現在不是」——**站位**那一格就是那句話的答案。",
    "⚠️ 這一頁在 2026-08-03 之前是**存了不生效**的：文件在、Zod 在、進了 bundle，但畫面讀的是程式裡寫死的常數。現在 `RoundWinnerStage` 真的去內容登錄表讀這一份，所以這一頁的每一格都改得到畫面。",
    "⚠️ **頒獎台人數不是一個純顯示的數字**：每一位站上台的角色是一個獨立的 WebGL context，而瀏覽器同時大約只給 16 個。調高會直接吃顯示記憶體，手機最先受不了。",
    "⚠️ **第一名的台詞出貨是「兩個都說」，那就是現行行為**，不是這一頁新加的東西：名言在勝負底定的那一刻、嘲諷在 2.2 秒之後。改成「只嘲諷」才是改變行為（＝把已經在放的名言關掉）。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/victory-podium.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/render/RoundWinnerStage.ts 的 victoryPodiumPolicy()（每一回合從 Configs 登錄表重讀一次）→ planRoundWinnerShow() 的 cfg 預設值 → podiumSlotOrder / StorePreview 的剪輯與縮放；台詞那一格同時決定 ui/RoundEndVoice 與 audio/victoryTaunt 誰會出聲",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（內容登錄表是開機時載入的），之後的每一個回合結束都會重讀。不需要重開 game-server —— 這整段演出活在客戶端。",
  fields: [
    {
      path: "podiumSize",
      zh: "頒獎台站幾個人",
      note: "回合結束時中央排幾個 3D 模型。⚠️ 每一個都是一個獨立的 WebGL context，而瀏覽器同時大約只開得了 16 個 —— 這一格是這一頁唯一會直接吃顯示記憶體的東西，調高在手機上最先炸。排不滿的時候怎麼辦看下面那一格。",
    },
    {
      path: "podiumScope",
      zh: "排名要算誰",
      note: "只排勝方三人，還是這一回合上場過的所有座位。3v3 裡兩者幾乎永遠同解（最後活著的三個人就是勝方），**只有勝方有人中途斷線時才會分岔** —— 那時候 allFought 會讓敗方裡活最久的那位補進名次，winnerTeam 則是少一位。",
      optionLabels: {
        winnerTeam: "winnerTeam（只排勝方隊伍｜「回合勝利畫面」的字面意思）",
        allFought: "allFought（這一回合上場過的所有座位｜含敗方）",
      },
    },
    {
      path: "podiumFill",
      zh: "人數排不滿時",
      note: "排得出來的人比上面那一格少的時候要不要補人。⚠️ 補人是**設計偏好不是資料修補**：把剛剛被打倒的敵人擺上勝利頒獎台是一種玩法，不是一個更完整的畫面。空著的台階讀起來像 bug，所以出貨是「有幾個站幾個」。",
      optionLabels: {
        shrink: "shrink（有幾個站幾個｜出貨值）",
        opponents: "opponents（用敗方裡活最久的補滿）",
      },
    },
    {
      path: "podiumLayout",
      zh: "第一名站哪裡",
      note: "owner 2026-08-03「回合勝利出現的 3d model 是勝利角色 但現在不是」講的就是這一格：由左到右照名次排的話，三個人時**螢幕正中央站的是第二名**，而第二名依定義是這一回合倒下的人 —— 玩家的眼睛先看中間，於是「誰贏了」讀起來是錯的。",
      optionLabels: {
        rank: "rank（由左到右照名次｜三個人時正中央是第二名）",
        centreFirst: "centreFirst（金冠站正中央、銀左銅右｜出貨值）",
        soloWinner: "soloWinner（只站第一名一位｜最不會誤讀，但沒有隊伍三人的畫面）",
      },
    },
    {
      path: "winnerScale",
      zh: "第一名那張卡放大幾倍",
      note: "第一名相對其他人的尺寸倍率，同時決定它疊在上層。1 ＝ 三張一樣大，那時候「誰贏了」只剩皇冠顏色一個線索（金銀銅在暗底上並不好分）。往下調到 1 以下是刻意的反差玩法，不是壞掉。",
    },
    {
      path: "clipGold",
      zh: "第一名做什麼動作",
      note: "站上台的那一刻播哪一個動作剪輯。在這一格出現之前三個人一律站著不動 —— 也就是「勝利」和「在商店裡逛街」看起來一模一樣，這是玩家最直接感覺到「贏了但沒有反應」的地方。",
      optionLabels: VICTORY_PODIUM_CLIP_LABELS,
    },
    {
      path: "clipSilver",
      zh: "第二名做什麼動作",
      note: "同上，但這一格的重點是**不要跟第一名一樣**：三個人一起慶祝的話，「誰是第一」這個訊息就從畫面上完全消失了，只剩下皇冠顏色。",
      optionLabels: VICTORY_PODIUM_CLIP_LABELS,
    },
    {
      path: "clipBronze",
      zh: "第三名做什麼動作",
      note: "同上。把敗方補上台（上面「人數排不滿時」選 opponents）的玩法可以把這一格設成倒下，讓被補上來的人躺在台上 —— 那時候台上就同時說得出「誰贏了」和「誰輸了」。",
      optionLabels: VICTORY_PODIUM_CLIP_LABELS,
    },
    {
      path: "roundWinLine",
      zh: "第一名開口說什麼",
      note: "⚠️ 出貨是「兩個都說」，而那**就是現行行為**：名言在勝負底定的那一刻、嘲諷在 2.2 秒之後。所以選「只嘲諷」不是維持現狀，是把已經在放的名言關掉。選「只說名言」時，該英雄沒有名言剪輯就自動退回嘲諷，不會變成一片安靜。",
      optionLabels: {
        taunt: "taunt（只嘲諷敗方）",
        quote: "quote（只說自己的名言｜沒有剪輯時退回嘲諷）",
        both: "both（名言 → 2.2 秒後嘲諷｜出貨值，也是現行行為）",
      },
    },
    {
      path: "podiumZoneSource",
      zh: "頒獎台看哪一區的勝負",
      note: "一個回合有**兩個競技場、兩個勝方**，伺服器逐區都記了勝負。owner 2026-08-03「為什麼我最後活著 勝利的還是顯示別的隊伍」就是這裡：以前頒獎台自己再推導一次「誰贏」，而兩隊都是勝方時它挑戰績最好的那一隊。⚠️ 改這一格**不會**改變任何人的實際勝負或分數，只改變你死後／按了「前往觀戰」跑去看別區時，台上站的是誰。",
      optionLabels: {
        localSeat: "localSeat（永遠演你自己英雄站的那一區｜出貨值，owner 要的那個）",
        spectated: "spectated（演你鏡頭當下正在看的那一區）",
      },
    },
    {
      path: "roundPresentSec",
      zh: "頒獎台在螢幕上停幾秒",
      note: "回合結束後三位模型 + 灰幕佔著畫面幾秒，時間到就收掉、進商店。⚠️ 在這一格出現之前它是程式裡寫死的 **3.6 秒**，而嘲諷語音要到第 **2.2 秒**才開口 —— 只剩 1.4 秒空檔，而實測 60 支嘲諷剪輯的中位長度是 **3.29 秒** ⇒ **59/60（98%）被切在一半**（owner 2026-08-14：「回合勝利 語音還沒播完 就會進商店 語音也被截斷」）。⭐ 現在**語音不再被這一格切掉**（畫面收掉、聲音自己講完），所以這一格純粹是「你想看模型看多久」。出貨 5.5 秒 ＝ 2.2 + 3.3，大約蓋得住一半以上的剪輯。調大會延後進商店的時間，⚠️ 但它不會延長回合結算的秒數（那是 戰鬥系統 的 resolutionSec）。",
    },
  ],
  preserved: [],
};

// ───────────────────────────────────────── 體型與射程 (config/body-scale) ──

const BODY_SCALE_SPEC: ConfigDocSpec = {
  page: "bodyScale",
  collection: "config",
  docId: "body-scale",
  schemaTag: "config.body-scale@1",
  zod: zConfigBodyScaleDoc,
  title: "體型與射程",
  intro: [
    "owner 2026-08-01 實戰回饋：「身體放大倍數 會影響攻擊距離延長倍數」。放大的角色看起來手長卻打不到，是因為在這一頁出現之前，**伺服器根本不知道任何一位英雄有多大** —— 螢幕上的大小住在一份客戶端專用的檔案裡（content/models/_standin-overrides.json），它不在內容清單裡，遊戲伺服器從來讀不到。",
    "owner 同日更正：「**通常不會是等比倍率**，例如 2x body, 1.2x 攻擊距離；3x body 1.3x攻擊距離」。所以這一頁調的是一張**斷點表**而不是一個係數 —— 係數只畫得出一條直線，畫不出「1→2 加 0.2、2→3 只再加 0.1」這種遞減。",
    "⚠️ 這一頁**只管普攻射程**。技能施放距離與 AoE 半徑走 戰鬥系統 的 abilityRange（出貨 0.6，是刻意壓過的），**刻意不跟著體型連動** —— 再乘一次會讓那個 0.6 對大體型英雄悄悄失效。要不要一起連動是下一個決定。",
    "⚠️ 這一頁**會改變平衡**：出貨內容有 24 位英雄體型不是 1（0.6 ～ 3.0）。照出貨曲線，體型 3.0 的 godie-o030 普攻射程從 12.0 變成 15.6（單一決鬥區半徑是 24），體型 0.6 ～ 1.0 的那些人一格都沒有變。要退回舊行為就關掉總開關。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/body-scale.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/bodyScale.ts 的 attackRangeScaleFactor() → sim/baseBonus.ts finalizeStat() 的 rangeScale → Stat.AttackRange（每次 recomputeStats 都會呼叫）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.bodyScaleRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 護盾規則／格擋規則／嘲弄規則 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格，寫成「下一場生效」會害操作者以為功能壞了。",
  fields: [
    {
      path: "enabled",
      zh: "體型連動射程",
      note: "關掉＝攻擊距離完全不看體型，和這一頁出現之前一模一樣。把下面整張表的倍率都填 1 也是同一個結果，兩個都留著是因為「暫時關掉」和「調成不連動」在操作上是兩件事：關掉之後再打開，你調過的曲線還在。",
    },
  ],
  preserved: [],
  curve: {
    path: "attackRangeCurve",
    title: "體型 → 普攻射程倍率（斷點表）",
    intro: [
      "由上到下**體型由小到大**。表上沒有的體型走**線性內插**：出貨表裡 2.0 是 1.20、3.0 是 1.30，所以 2.5 拿到的是 1.25。",
      "⚠️ **兩端夾住，不會外推。** 比第一列小的體型一律拿第一列的倍率、比最後一列大的一律拿最後一列 —— 所以出貨表底下，體型 0.6 的小隻角色射程一格都不會少。要涵蓋更大的體型（例如殭屍王的 sizeMult），請**加一列**；不加的話它只會停在最後一列的倍率，不會自己長出去。這是刻意的：外推等於替你猜一條沒有人看過的斜率。",
      "倍率是乘在英雄卡的普攻射程上。近戰角色卡面通常是 1.6，遠程 6～12；乘完之後還有一條「貼身一定打得到」的地板（自己半徑＋對方半徑＋0.1），所以把倍率調很低不會讓近戰完全打不到人，只會讓遠程角色被迫貼上去。",
    ],
    x: {
      key: "bodyScale",
      zh: "體型（幾倍大）",
      note: "英雄卡上的 bodyScale。1 = 一般體型（出貨 89 位沒填這一格，等於 1）。出貨最小 0.6、最大 3.0。上界 10 是 小怪波 那一頁 殭屍王體型倍率 的出貨值 —— 想替放大後的王加一列時填得進來，同時擋住貼錯格。",
      min: 0.1,
      max: 10,
    },
    y: {
      key: "rangeMult",
      zh: "普攻射程倍率",
      note: "這個體型的人，普攻打得到卡面射程的幾倍遠。1 = 照卡面。上界 3 擋的是把百分比當倍率填（打 120 進去＝120 倍射程，那位英雄會從整張地圖外面開打）；下界 0.1 是「這個機制最多拿走九成射程」。",
      min: 0.1,
      max: 3,
    },
    minRows: 2,
    maxRows: 8,
    previewAt: [
      { x: 0.6, who: "出貨最小體型（godie-ofar 等）" },
      { x: 1, who: "一般體型（89 位沒填 bodyScale 的人）" },
      { x: 1.5, who: "godie-obla（斷點之間，看得出內插）" },
      { x: 2, who: "godie-u01f 黑化張飛" },
      { x: 2.5, who: "斷點之間" },
      { x: 3, who: "godie-o030 臭作（出貨最大）" },
      { x: 8, who: "假想的放大殭屍王（表外，被夾住）" },
    ],
  },
};

// ───────────────────────────────────────────── 回血規則 (config/regen) ──

const REGEN_SPEC: ConfigDocSpec = {
  page: "regenRules",
  collection: "config",
  docId: "regen",
  schemaTag: "config.regen@1",
  zod: zConfigRegenDoc,
  title: "回血與扣血規則",
  intro: [
    "⚠️ owner 2026-08-02 更正：「Berserker 是每秒**損失** 1%生命, 直到生命不足1%」。方向和 8/1 那句「回血 1%每秒」**相反**，而且多了一條 8/1 沒有的地板。所以出貨的英雄卡填的是**扣血** 1%，回血那一族目前沒有任何一位英雄在用。",
    "兩族欄位都是「英雄卡有填才啟動」：回血看 healthRegenPctOfMax（目前**沒有人**填），扣血看 healthDrainPctOfMax（只有 海克力斯 - Berserker 填了 0.01 ＝ 每秒 1%）。",
    "⚠️ **扣血不是傷害。** 它不走傷害管線，所以不吃 戰鬥系統 的傷害倍率、不會被護盾吸、不噴傷害數字、不算進任何人的輸出統計，也**扣不死人** —— 到了下面那條地板就停。要真的把人扣死，用的是天生技的真實傷害。",
    "⚠️ 扣血只在**戰鬥中**進行（和火圈、殭屍波同一條規矩），中場與商店不扣；回血則不設這道閘，維持既有行為。",
  ],
  consumer:
    "packages/shared/src/sim/regenRules.ts 的 healthRegenPerSec() / healthDrainPerSec() + applyHealthDrain()，由 sim/systems/RegenSystem.ts 每 tick 對每一個活著的單位呼叫；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.regenRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 護盾規則／格擋規則 同一個形態(#278)。",
  fields: [
    {
      path: "pctEnabled",
      zh: "百分比回血",
      note: "關掉＝英雄卡上填的百分比回血全部當作沒填，所有人只吃固定回血（＝這個機制出現之前）。⚠️ 出貨內容**目前沒有任何一位英雄**填百分比回血（2026-08-02 之前是 Berserker，那一格已經翻成扣血了），所以這一格現在開或關，場上都不會有任何差別 —— 它是留給下一位要用這個機制的英雄的。",
    },
    {
      path: "pctMode",
      zh: "百分比和固定回血的關係",
      note: "replace＝有填百分比的英雄不再計算固定回血，每秒就是「最大生命 × 百分比」。這就是 owner 說的「沒有保底」：add 模式下那條固定值是一條**與最大生命無關的地板**，血量被打到很低的時候它反而是主力，那正是要移除的東西。",
      optionLabels: {
        replace: "replace 百分比取代固定回血（出貨值＝owner 的「沒有保底」）",
        add: "add 百分比疊在固定回血上（＝等於保留一條地板）",
      },
    },
    {
      path: "floorPerSec",
      zh: "保底：每秒至少回幾點",
      note: "0＝沒有保底（出貨值，owner 的裁決）。它獨立於上面那格：沒填百分比的英雄也吃得到這條地板，所以它是「全場最低回血」而不是「百分比的下限」。上界 1000 是誤植守衛 —— Berserker 一級最大生命約 7,500，1% 是 75/秒，1000 已經是這條地板自己就能撐住一整場。",
    },
    {
      path: "applyEnvMultiplier",
      zh: "百分比要不要吃 戰鬥系統 的回血倍率",
      note: "開（出貨值）＝ 戰鬥系統 那一格的 healthRegen 仍然是「全遊戲回血快慢」的總閥，百分比也跟著動。關＝百分比變成一個不受全域調節影響的角色設定，只有固定回血那條吃倍率。",
    },
    {
      path: "championsOnly",
      zh: "百分比回血只給英雄",
      note: "開（出貨值）＝小怪、殭屍王與召喚物不吃百分比回血。關掉之後，一隻臉是某位有填百分比回血的英雄的殭屍王也會每秒回同樣比例的最大生命 —— 王的血量是英雄的好幾倍，那等於一堵打不動的牆。",
    },
    {
      path: "drainEnabled",
      zh: "百分比扣血（自傷）",
      note: "關掉＝英雄卡上填的自傷全部當作沒填，海克力斯 - Berserker 從此不再每秒掉血（＝ owner 2026-08-02 那句話出現之前）。線上發現扣血把某位英雄玩壞時，這一格是止血閥，不用改程式也不用重建映像。",
    },
    {
      path: "drainFloorPctOfMax",
      zh: "扣血停在最大生命的幾成",
      note: "0.01＝出貨值＝ owner 的「直到生命不足 1%」。它是**比例不是點數**：90,000 血的身體停在 900，100 血的身體停在 1。調高＝自傷更早收手（角色更耐打），調低＝可以被自己壓得更低。⚠️ 填 0 也不會扣死人 —— 扣血不走傷害管線，沒有人會判定死亡，停在 0 只會生出一個「0 血還活著」的單位，所以實作把有效地板夾在 1 點之上。",
    },
    {
      path: "drainFloorMode",
      zh: "碰到地板那一刻做什麼",
      note: "這兩個只有在「同時被敵人打」的時候看得出差別，而那正是它是一格選單而不是註解的原因。stop（出貨值）＝自傷自己收手，但**不會把血條往上拉**，敵人照樣一刀送他走 —— 這是自傷，不是無敵。clamp＝每 tick 把血條夾在地板上，被打到地板以下的人會被拉回來＝**免疫致死**，一隻殺不死的試煉怪。",
      optionLabels: {
        stop: "stop 停手，但敵人照樣殺得死他（出貨值＝owner 的裁決）",
        clamp: "clamp 夾在地板上＝免疫致死",
      },
    },
    {
      path: "drainChampionsOnly",
      zh: "扣血只給英雄",
      note: "開（出貨值）＝小怪、殭屍王與召喚物不吃自傷。關掉之後，一隻臉是 Berserker 的隨機英雄殭屍王會自己每秒掉 1% 最大生命 —— 那等於一堵會自己倒的牆，玩家站著看就贏了。",
    },
  ],
  preserved: [],
};

// ─────────────────────────────────────────── 對戰錄影 (config/replay) ──

const REPLAY_SPEC: ConfigDocSpec = {
  page: "replayPolicy",
  collection: "config",
  docId: "replay",
  schemaTag: "config.replay@1",
  zod: zConfigReplayDoc,
  title: "對戰錄影",
  intro: [
    "owner 2026-08-02：「請幫我預設打開，就算玩到一半就離開也應該有 replay 才對」。這一頁就是那個開關 —— 在它出現之前錄影**完全沒有開關**：`MatchRoom` 無條件開錄影檔，落地間隔與保留量寫死在程式裡，要動任何一個都得重建映像。",
    "⚠️ 「玩到一半就離開」本來就會留下一份錄影：錄影檔是**邊打邊寫**的（預設每 0.5 秒把緩衝交給磁碟），中途離場只是少了結尾那一行，列表會標成「未完成」，但仍然可以播。所以這一頁能改善的是「被硬砍時**最多丟幾秒**」，也就是下面的落地間隔。",
    "⚠️ 錄影是否真的寫得進磁碟**不在這一頁**。正式機曾經整段時間一場都沒錄到，原因是 `/data/replays` 的擁有者不是容器的 uid（EACCES），而那件事只有 `/healthz` 的 `replay.writable` 看得出來 —— 查法寫在 `docs/replay-observability.md`。這一頁全開也救不了一個寫不進去的目錄。",
    "⚠️ 錄影檔帶著每一位玩家的顯示名稱，所以下面兩格保留量同時是**個資保留期限**，不只是磁碟策略。",
  ],
  consumer:
    "apps/game-server/src/replay/policy.ts 的 replayPolicy() / replayRecordingEnabled() → MatchRoom.onCreate() 決定要不要 MatchRecorder.open()、Recorder.ts 的 flushMs() 設定落地間隔、store.ts 的 pruneReplays() 套用兩條保留量",
  effect:
    "**要重啟 game-server shard 才生效**（`Configs` 是開機時載入的內容登錄表，只有 戰鬥系統 與 基礎加成 有即時快取）。和 屬性上限／回血規則 同一個形態(#278)，這裡不假裝它是「下一場生效」。",
  fields: [
    {
      path: "enabled",
      zh: "錄影總開關",
      note: "出貨**開著**（owner 的裁決）。關掉之後這台 shard 上的每一場都完全不開錄影檔：後台「對戰回放」不會再有新的一列，也就沒有任何一場可以回放。留這一格是因為錄影是旁路 —— 磁碟快滿、或某一場的內容讓錄影器自己爆掉時，這是唯一不用重建映像就能止血的閥。⚠️ 讀不到內容文件時它**仍然是開的**（fail-open）：內容載入失敗不可以順手把錄影關掉，那正是 2026 年 8 月「一場都沒錄到」沒有人發現的形狀。",
    },
    {
      path: "flushIntervalMs",
      zh: "多久把錄影寫進磁碟一次（毫秒）",
      note: "它決定的是「**程序被硬砍時最多丟幾秒**」—— 容器重啟、部署、OOM 被殺的那一刻，還沒交給磁碟的那一段就沒了。出貨 500＝最多丟半秒。調小＝丟得更少，代價是每分鐘多幾次寫入；調大到 5000＝一次重啟可能吃掉五秒的操作。⚠️ **不可以是 0**：那等於每一個 tick 寫一次檔，而錄影器的第一條規矩是不准在 tick 路徑上做同步磁碟 I/O —— 那會直接讓場上的人卡頓。",
    },
    {
      path: "retainMaxFiles",
      zh: "磁碟上最多留幾份錄影",
      note: "超過的從最舊的開始刪（正在錄的那一場永遠不會被刪）。出貨 200；實測一場 4 分鐘 12 人的比賽壓縮後約 60 KB，所以 200 份約 12 MB。調成 1＝只留最新一場，昨天那一場明天就找不回來了。",
    },
    {
      path: "retainMaxAgeDays",
      zh: "超過幾天的錄影一律刪掉",
      note: "和上面那格取**先觸發**的。出貨 30 天。這一格是真正的「多久以前的那一場還看得到」，因為家庭測試一週打不到 200 場 —— 實際上會先撞到的是天數而不是份數。",
    },
  ],
  preserved: [],
};

/**
 * 掛上後台的設定文件。
 *
 * ⚠️ **加一份新的之前，先確認它有真的消費端。** 判準是能不能替
 * {@link ConfigDocSpec.consumer} 寫出一個具體的、production 會呼叫到的函式。
 * 寫不出來就不要掛 —— 見檔頭第 1 條。
 */

// ─────────────────────────────────── 殭屍王出場演出 (config/boss-intro) ──

const BOSS_INTRO_SPEC: ConfigDocSpec = {
  page: "bossIntro",
  collection: "config",
  docId: "boss-intro",
  schemaTag: "config.boss-intro@1",
  zod: zConfigBossIntroDoc,
  title: "殭屍王出場演出",
  intro: [
    "殭屍王走進場的那幾秒要演什麼：既有的恐怖音效之後，中央跳出一面提示 —— 大字名言、那位英雄的描述、攻略要點、弱點 —— 停留幾秒之後淡出。",
    "⚠️ **「那位英雄」不是固定的喪標麥可。** `mobWaves.boss.championSource` 的出貨值是 **隨機**，王每次上場借的是當回合抽到的那一位英雄的臉、模型與數值。所以這一頁調的是「演多久、講幾條」，逐英雄要講什麼是文件裡的 `champions` 表（這一頁不編輯它，但儲存時原封不動帶著走）。",
    "⚠️ **名言（quote）出貨全部是空的，那不是漏填。** 每位英雄的名言是 GH#139／#142，資料還不存在；編一句台詞塞進去等於把缺資料偽裝成功能。空的時候大字整段不畫，其餘幾段照常顯示。",
    "⚠️ 這一段提示全程不吃點擊、也不會蓋住血條或技能列（#107）：擺不下的時候它先丟描述、再丟攻略要點，真的放不下就整個不畫。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/boss-intro.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/hud/bossIntroModel.ts 的 bossIntroRules()／bossIntroContent()／bossIntroLifetime()，由 ui/hud/BossIntroOverlay.tsx 在 HudRoot 的渲染樹裡消費；文件走客戶端開機時 bootContent 灌進去的 Configs registry",
  effect:
    "**下一次客戶端重新載入時生效**（內容 bundle 是開機時讀進 Configs 的），不需要重開 game-server —— 這一段演出整段活在客戶端。",
  fields: [
    {
      path: "enabled",
      zh: "出場演出總開關",
      note: "關掉＝只剩既有的「殭屍王降臨」橫幅與 4.4 秒恐怖音效，名言／描述／攻略要點／弱點一格都不畫。這是止血閥：這一面提示會吃掉螢幕中央走廊好幾秒，線上覺得礙眼時要能在不重新部署的情況下整個關掉。",
    },
    {
      path: "introHoldSec",
      zh: "提示停留幾秒才開始淡出",
      note: "owner 明說五秒，所以出貨 5。⚠️ 這是**時間**不是節奏：它從王出場的那一刻起算，和恐怖音效（4.4 秒）平行跑，不是接在它後面。調小到 0 ＝ 出現的瞬間就開始淡出（等於只看得到淡出那段）。上界 30 是誤植守衛 —— 5 打成 50 會讓提示蓋著整場的前半。",
    },
    {
      path: "fadeSec",
      zh: "淡出花幾秒",
      note: "停留結束之後,面板從全不透明線性掉到透明所花的時間。0 ＝ 直接消失,讀起來像掉幀而不像結束,所以出貨 0.6。這一格加上上面那格就是提示在畫面上的總時間。",
    },
    {
      path: "descriptionMaxChars",
      zh: "描述最多顯示幾個字",
      note: "英雄文件裡的描述是完整的身世故事（喪標麥可那一份 400 字以上），整段搬到戰鬥畫面上就是一面牆。這一頁把描述的**非空行接成一段**再截到這個字數，超過的部分用刪節號收尾。⚠️ 刻意**不是**「只取第一段」——出貨的英雄文件幾乎都以一行標籤開頭（`故事：`換行才是本文），取第一段的話畫面上只會出現「故事：」三個字。**0 ＝ 不顯示描述那一段**（名言、攻略要點、弱點照常）。",
    },
    {
      path: "maxTips",
      zh: "最多列幾條攻略要點",
      note: "文件裡那位英雄寫了幾條就有幾條，這一格是上限。**0 ＝ 不顯示攻略要點那一段**。⚠️ 條數直接換算成面板高度：中央走廊在矮螢幕（橫向手機）只有八十幾 px，填太多的結果不是擠在一起，是整段被丟掉（丟棄順序：描述 → 攻略要點 → 弱點）。",
    },
    {
      path: "maxWeaknesses",
      zh: "最多列幾條弱點",
      note: "同上，但弱點是**最後才被丟掉**的那一段 —— 它是「現在要怎麼打」的答案，描述只是身世。**0 ＝ 不顯示弱點那一段**。",
    },
    // ── #291 版面高度那一組 ────────────────────────────────────────────────
    // owner 2026-08-03：「殭屍王出場的描述框 不夠大 描述還有很多沒顯示完」。
    // ⚠️ 這一組在後台缺席時，上面的 描述最多顯示幾個字 是**調了看不出差別**的：
    // 字數放大了，但版面仍然只算得出兩行的高度，多出來的字被外框的
    // `overflow: hidden` 吃掉。兩層各自在吃字，只開放其中一層等於沒開放。
    {
      path: "layout.descMaxLines",
      zh: "描述最多佔幾行",
      note: "這一格才是「描述框有多大」。上面的 描述最多顯示幾個字 決定截幾個字，這一格決定**畫得下幾行** —— 兩格取小的那一個才是玩家真正看得到的量，所以只調其中一格會出現「字數調大了但畫面一個字都沒多」。調大會往下擠掉攻略要點與弱點（丟棄順序見下面那張表），矮螢幕上更容易只剩名字。",
    },
    {
      path: "layout.descLineH",
      zh: "描述一行多高（px）",
      note: "⚠️ 這是**和面板 CSS 對齊的量**，不是美感值：它要等於描述那一行的字級 × 行高（出貨 12 × 1.35 ≈ 16.2，取 17）。填太小 → 算出來的高度比畫出來的矮，字會被外框截掉（就是 #291 那個缺陷）；填太大 → 描述底下留一塊沒有人用的空白，而且提早擠掉弱點。改字級的時候要一起改這一格。",
    },
    {
      path: "layout.descCharsPerLine",
      zh: "描述一行大約幾個字",
      note: "把字數換算成行數用的除數（字數 ÷ 這一格 = 需要幾行），不會改變畫面上真正的換行位置 —— 真正的換行是瀏覽器做的。它只影響**版面替描述保留多少高度**：估太少會保留過多高度、白白擠掉弱點；估太多會保留不足、描述又被截掉。出貨 36 是 460px 寬的面板扣掉左右留白之後 12px 中文字塞得下的量。",
    },
    {
      path: "layout.quoteH",
      zh: "大字名言那一行的高度（px）",
      note: "名言那一段在版面計算裡佔多高。⚠️ 出貨的名言**全部是空的**（資料是 GH#139／#142），而空的時候這一段整段不畫也不佔高度 —— 所以今天改這一格在畫面上看不到任何變化，要等名言真的填進去才有意義。填 0 等於名言有資料時也不替它留位置，字會和英雄名疊在一起。",
    },
    {
      path: "layout.nameH",
      zh: "英雄名那一行的高度（px）",
      note: "英雄名是**唯一一定會出現**的那一行（描述／要點／弱點都可能被丟掉，它不會），所以這一格加上下面的外框留白就是這面提示的最低高度 —— 中央走廊比它還矮的時候，整面提示會直接不畫。填太小會讓名字和底下的描述黏在一起。",
    },
    {
      path: "layout.headH",
      zh: "段落標題的高度（px）",
      note: "「攻略要點」「弱點」這兩個小標題各佔多高。只有那一段真的有內容時才會算進去，所以它和下面那一格一起決定「多列一條要點要多付多少高度」。填太小會讓標題和第一條列點擠在一起，看起來像列點多了一條。",
    },
    {
      path: "layout.rowH",
      zh: "一條列點的高度（px）",
      note: "攻略要點與弱點裡**每一條**佔多高，所以它會被條數乘起來：要點與弱點各 3 條時，這一格多 4px 就是版面多要 24px。走廊高度不夠時付不出這個高度的段落會被整段丟掉（不是擠成一團），所以調大它等於讓矮螢幕更早只剩名字。",
    },
    {
      path: "layout.padH",
      zh: "外框上下留白合計（px）",
      note: "面板外框上下加起來的內距，一律先算進去（不管有幾段內容）。它直接吃掉可以給描述與列點的高度，所以在橫向手機那種八十幾 px 的走廊裡，調大這一格最先犧牲掉的是弱點那一段。",
    },
  ],
  preserved: [
    {
      // #291 —— 走訪器把陣列一律歸成「不編輯的分支」，而這一格的合法值是
      // 三個字面字串的 enum。通用引擎唯一畫得出陣列的形狀是 `tables` 的
      // `stringList`，而它收的是**自由文字**：操作者打成 `descrption` 後台會放行、
      // 平台的嚴格 Zod 在 PUT 那一關才退回，理由是一句英文的 schema 錯誤。
      // 那比「這一頁不編輯它」更糟，所以它先走 preserved。
      path: "dropOrder",
      why: "走廊高度不夠時**先丟哪一段**（出貨 描述 → 攻略要點 → 弱點）。這一頁不編輯它，但每次儲存都原封不動帶著走 —— 掉了的話它會靜靜地退回出貨順序，於是「我明明設過先丟攻略要點」在下一次存檔之後就消失了，而畫面上只有在矮螢幕、而且剛好放不下的那幾場才看得出來。",
    },
    {
      path: "champions",
      why: "逐英雄的出場文案表（名言／攻略要點／弱點／推導依據）。這一頁不編輯它，但每次儲存都原封不動帶著走 —— 掉了的話王照樣會出場、面板照樣會跳，只是每一隻都只剩名字和描述，而畫面上完全看不出來少了東西。",
    },
  ],
};

// ────────────────────────────────── 道具卡片排版 (config/item-card) ────────

/**
 * 分類標籤的長度上界（#277 在字串上的形狀）。
 *
 * ⚠️ 它不是潔癖，是**兩個**真實後果：schema 是 `.min(1).max(12)`，所以 13 個字
 * 的標籤在 PUT 那一關會被平台退回；而就算繞過 PUT（覆蓋層寫入路徑今天不跑 Zod，
 * #283），客戶端 `itemCardTheme.acceptLabel` 對 `length > 12` 的值會**靜默退回
 * 出貨標籤** —— 操作者存了、頁面顯示已儲存、卡片上還是舊字。
 */
const ITEM_CARD_LABEL = /^[\s\S]{1,12}$/;
const ITEM_CARD_LABEL_ERROR =
  "分類標籤要 1～12 個字：超過 12 個字客戶端會靜默退回出貨標籤，畫面上看不出來被拒絕了";

/** 四個分類的中文，這一份表要和 `zItemCardCategory` 一模一樣（測試在比）。 */
const ITEM_CARD_CATEGORY_OPTIONS = [
  { value: "stat", zh: "stat 屬性加成（純數字，沒有觸發事件）" },
  { value: "active", zh: "active 主動效果（有一個離散的觸發事件）" },
  { value: "passive", zh: "passive 被動效果（常駐／每秒自動）" },
  { value: "debuff", zh: "debuff 負面控場（作用在敵人身上）" },
] as const;

const ITEM_CARD_SPEC: ConfigDocSpec = {
  page: "itemCard",
  collection: "config",
  docId: "item-card",
  schemaTag: "config.item-card@1",
  zod: zConfigItemCardDoc,
  title: "道具卡片排版",
  intro: [
    "owner 2026-08-02：「卡片道具的排版連在一起不好閱讀，關於效果及數值的部分應該要特殊顏色表示」。這一頁就是那份排版表：四個分類各自的名稱與顏色、數值與解說的顏色，以及下面三張決定「方括號裡的字算哪一類」的對照表。",
    "⚠️ **道具的 description 一個字都不會被這一頁改到。** owner 手寫的那 49 份原文是規格（`legendary49OwnerText.test.ts` 逐位元組比對），所以排版是在**畫的那一刻**解析出來的：`[焚身]` 這種方括號標記查下面的對照表決定顏色，`+87`／`30%`／`0.6秒` 這種數值自動抓出來上色。改這一頁＝改「同一段原文怎麼被畫出來」。",
    "⚠️ 四個渲染點（商店 / 三選一卡 / 裝備欄 hover / 圖鑑）讀的是**同一份**設定，所以同一個 `[焚身]` 不可能在四個畫面上是四個顏色。",
    "⚠️ 顏色是對卡片底色 `#12151d` 量過的：出貨六個顏色的對比度 5.93～15.15 全部過 4.5:1，四個分類彼此的 CIE76 ΔE 最小 57.7。換色之前請記得這兩件事 —— **太暗會讀不到**（低於 4.5:1），**兩個分類太接近就等於沒有分類**（ΔE 低於 ~25 就開始混淆）。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/item-card.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/components/itemCardTheme.ts 的 applyItemCardDoc()（由 ContentDb.load() 呼叫）→ getItemCardConfig() 餵給 packages/shared/src/content/itemCardText.ts 的 parseItemCard()／tokenizeCardLine()，四個渲染點（MerchantShop / AugmentDraftPanel / EquipmentBar / CodexDetail）畫的是它吐出來的 token",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。不需要重開 game-server —— 這整段排版活在客戶端。",
  fields: [
    {
      path: "categories.stat.label",
      zh: "屬性加成的分類名",
      note: "`[神速]`／`[閃避]` 這一族的分類名。⚠️ 這個字**不會印在卡片上** —— 玩家看到的是標記自己的原字（例如 `[神速]` 四個字本身），這一格只出現在滑鼠停在那個 chip 上時的**原生 tooltip**。它不影響哪些標記算這一類 —— 那是下面「標記 → 分類」那張表。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.stat.color",
      zh: "屬性加成的顏色",
      note: "這一類 chip 的文字與邊框色，出貨 #6FD3C4 青綠。它是四個分類裡最「安靜」的一個，因為屬性加成在卡片上出現得最頻繁 —— 換成高彩度的顏色會讓整張卡片被最不重要的那一類佔滿。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "categories.active.label",
      zh: "主動效果的分類名",
      note: "`[On-Hit]`／`[暴擊]`／`[衝刺]` 這一族的分類名（同上，只出現在 chip 的 tooltip）。判準是「有沒有一個離散的觸發事件」，不是「玩家要不要按鍵」—— 這四個分類全部都是自動發生的。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.active.color",
      zh: "主動效果的顏色",
      note: "出貨 #FFC24D 琥珀。⚠️ 它離數值色 #FFE9A3 的 ΔE 只有 32.7（四對裡最近的一對），再往淡黃調就會和那些 `+87`／`30%` 混成同一種顏色，而那正是 owner 要求「數值特殊顏色」時要分開的兩件事。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "categories.passive.label",
      zh: "被動效果的分類名",
      note: "`[無視]`／`[流星]`／`[格擋]` 這一族的分類名（同上，只出現在 chip 的 tooltip）。⚠️ 這一類同時是「查不到的標記落到哪一類」的出貨值 —— 所以**新標記**第一次出現時會借用它的顏色，但畫面上印的仍然是新標記自己的原字。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.passive.color",
      zh: "被動效果的顏色",
      note: "出貨 #A9B6FF 藍紫。它同時是所有**沒被登記過**的新標記的顏色（見最下面那一格），所以換色的影響範圍比另外三類大一點。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "categories.debuff.label",
      zh: "負面控場的分類名",
      note: "`[暈眩]`／`[緩慢]`／`[腐蝕]` 這一族的分類名（同上，只出現在 chip 的 tooltip）。它是唯一一類**作用在敵人身上**的效果，所以它的**顏色**比這個名字重要得多。",
      pattern: ITEM_CARD_LABEL,
      patternError: ITEM_CARD_LABEL_ERROR,
    },
    {
      path: "categories.debuff.color",
      zh: "負面控場的顏色",
      note: "出貨 #FF7BA6 粉紅。⚠️ 不要換成純紅：卡片上的紅在這個專案裡已經被「傷害／扣血」佔走了（傷害飄字 #FF5900、身體閃光 #FF2626），操作者會把控場讀成傷害。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "numberColor",
      zh: "數值的顏色",
      note: "**owner 那句話裡的「數值」就是這一格**：`+87`、`30%`、`*1.2`、`0.6秒`、`10-1000` 這些會被自動抓出來塗成這個顏色，不必在原文裡標任何東西。出貨 #FFE9A3 淡金對卡片底 15.15:1，是整張卡片上最亮的東西 —— 那是刻意的，玩家掃一張卡片時先找的就是數字。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "loreColor",
      zh: "解說／歷史的顏色",
      note: "`解說`／`歷史` 標題以下那一段散文的顏色，出貨 #8B93A6 灰。**它刻意比效果暗**（5.93:1，是六個顏色裡最低的一個）：那一段是身世不是規格，壓暗它玩家才會先讀到效果。調到和效果一樣亮，卡片就會退回 owner 抱怨的那個「連在一起」的狀態。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "unknownCategory",
      zh: "沒登記過的標記算哪一類",
      note: "下面那張表查不到的方括號標記落到這一類。它存在的理由是**新道具不可以讓卡片壞掉**：owner 明天寫一支用了新標記的道具，卡片照樣要畫得出 chip、有顏色、有分行，只是分類是這一格。⚠️ 這不是「錯誤處理」而是預設值，所以選一個最不會誤導人的：出貨選 passive（被動效果），因為把未知的東西說成「主動」或「負面」都是在講一件可能不是真的事。",
      optionLabels: Object.fromEntries(ITEM_CARD_CATEGORY_OPTIONS.map((o) => [o.value, o.zh])),
    },
  ],
  tables: [
    {
      path: "markers",
      shape: "recordEnum",
      title: "標記 → 分類（32 列）",
      intro: [
        "**這張表就是 owner 想改「`[On-Hit]` 算主動還是被動」時要改的地方。** 左邊是方括號裡的**原字**，右邊是它畫成哪一類的顏色。改一列存檔，四個畫面上同一個標記一起換色。",
        "⚠️ 左邊是**逐字比對**，一個字都不能差。`On-Hit` 與 `OnHit` 是兩列而不是一列，因為 owner 的原稿兩種都寫過，而原稿不准改 —— 表要去遷就原文，不是反過來。",
        "⚠️ 這張表**整批取代**，不和出貨值合併。刪掉一列＝那個標記從此落到「沒登記過的標記算哪一類」，不是「回到出貨分類」。（合併的話操作者刪掉的那一列會從預設值復活，變成一個查不出來的鬼。）",
        "⚠️ active↔passive 那條線是**判斷不是真理**：出貨用的判準是「有沒有一個離散的觸發事件」，所以 `[擴散]`（普攻濺射）算 active、`[流星]`（每秒自動）算 passive。不同意就改這張表，不要回去改程式。",
      ],
      key: {
        zh: "方括號裡的原字",
        note: "不含方括號本身。道具原文寫 `[焚身]`，這裡就填 `焚身`。前後不可以有空白 —— 比對是逐字的，多一個空格這一列就永遠不會命中，而畫面上只會看到那個標記變成「沒登記過」的顏色。",
        maxLen: 16,
      },
      value: {
        zh: "畫成哪一類",
        note: "決定這個標記的 chip 用哪一個分類的**顏色**（以及滑鼠停上去時 tooltip 顯示的分類名）。四個選項就是上面那四格顏色。",
        options: ITEM_CARD_CATEGORY_OPTIONS,
      },
      minRows: 1,
      maxRows: 300,
    },
    {
      path: "inlineValueMarkers",
      shape: "stringList",
      title: "方括號裡其實是「填一個值」的那幾個",
      intro: [
        "這張表上的字**不畫成 chip，改用數值色畫**。owner 有時候用方括號當「這裡填一個數字」的佔位符而不是關鍵字，而那種字塞進 chip 會變成一個二十字寬的分類標籤 —— 那就是排版壞掉。",
        "出貨只有一列，而且是實際存在的那一個：虛哭神去（godie-i007）的 `自身已損失的生命百分比數值(0~100)`。這不是為了通用性發明的欄位。",
        "⚠️ 這張表**先於**上面那張被查：同一個字兩邊都有的話，它會被畫成數值而不是 chip。",
      ],
      key: {
        zh: "方括號裡的原字",
        note: "同樣不含方括號、同樣逐字比對。判準很簡單：這個方括號裡的東西是一個**要被填進去的值**（所以裡面通常有數字或範圍），還是一個**關鍵字**（所以它該有分類顏色）。",
        maxLen: 40,
      },
      minRows: 0,
      maxRows: 50,
    },
    {
      path: "efficacyHeadings",
      shape: "stringList",
      title: "哪些整行的字是「效果區」的標題",
      intro: [
        "道具原文裡自成一行的 `效能` 這種字是**段落標題**而不是內容。它們不會被畫進卡片，只用來決定「這一行以下是效果還是解說」。",
        "⚠️ 比對前會先去掉結尾的全形／半形冒號，所以 `效能` 這一列同時認得 `效能：`（狂暴軒轅劍 godie-i02e 寫的就是後者），不必兩列都填。",
        "⚠️ 這張表**漏一個字的後果是看不見的**：一個沒被登記的標題會被當成一般內容畫進效果區，變成卡片上多出來的一行怪字，而不會有任何錯誤。",
      ],
      key: {
        zh: "標題原字",
        note: "整行完全等於這幾個字（去掉結尾冒號之後）才算標題。不要填半句話 —— 比對的是整行，不是「開頭包含」。",
        maxLen: 12,
      },
      minRows: 0,
      maxRows: 20,
    },
    {
      path: "loreHeadings",
      shape: "stringList",
      title: "哪些整行的字是「解說區」的標題",
      intro: [
        "同上，但這些標題**以下**的內容會用解說色畫（暗色），而且**不解析數值** —— 那一段是散文不是規格，把裡面的年份塗成數值色只會誤導人。",
        "出貨兩列：`解說` 與 `歷史`（狂暴軒轅劍拿 `歷史` 當解說標題，兩個都真的存在於原稿）。",
        "⚠️ 這一格**只決定「從哪一行開始變暗」**。`ItemCard.loreHeading`（記下命中的是哪一個字）在客戶端目前**零消費端** —— 標題字本身從來沒有被畫出來過。所以這裡的順序與拼字都只影響「暗色從哪裡開始」，不影響畫面上出現什麼字。",
      ],
      key: {
        zh: "標題原字",
        note: "同上，整行相等才算。⚠️ 把一個常用詞（例如 `效果`）加進來要小心：從那一行以下的所有內容都會變成暗色散文，而且數值不再上色 —— 這是這一頁最容易一次弄壞一整張卡片的地方。",
        maxLen: 12,
      },
      minRows: 0,
      maxRows: 20,
    },
  ],
  preserved: [],
};


/**
 * ⭐ GH#322 —— 2026-08-13 的平衡批新開了三份 config，但**沒有任何後台入口**。
 *
 * `configDocCoverage.test.ts` 抓到的正是這個：「這幾份 config 沒有任何後台入口，
 * 也沒有在豁免表上：要嘛做一頁，要嘛寫下為什麼不做」。
 * ⛔ 選「做一頁」而不是豁免 —— 這三份**全部是 owner 會調的平衡旋鈕**
 * （減傷天花板 / 位移級距 / 每級加成），豁免它們就是第一守則的三個住處缺第三個。
 */
const MAP_SPEC_SPEC: ConfigDocSpec = {
  page: "mapSpec",
  collection: "config",
  docId: "map-spec",
  schemaTag: "config.map-spec@1",
  zod: zConfigMapSpecDoc,
  title: "小地圖規格",
  intro: [
    "**所有動漫場地共用的一套規格**（GH#324，owner 2026-08-14）。⛔ 不要讓每張圖各自發明玩法 —— 七張圖只是套四個 layout template 之一。",
    "⭐ owner 的黃金鐵則：**「一張圖如果很壯觀但記不住，就簡化它；拿掉一個房間不影響玩法，就拿掉；垂直感能做成背景，就做成背景。玩家該跟玩家打，不是跟地圖打。」**",
    "⚠️ 這一頁調的是**產生器的驗收標準**，⛔ 不是任何一張已經產生出來的地圖 —— 改完要重跑 `pnpm map:gen` 才會影響輸出。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/map-spec.json`**。",
  ],
  consumer: "packages/shared/src/map/spec.ts（界與硬檢查清單；產生器與驗證器都從它 import）",
  effect: "**改完要重跑 `pnpm map:gen`**。⛔ 它不會回頭改已經產生的場地 —— 那些要重新產生。",
  fields: [
    { path: "grid.colsMin", zh: "地圖最小寬（格）", note: "可玩區域的寬度下界。⚠️ 這是**規格窗**不是硬界 —— 產生器會擋下窗外的地圖，但 Zod 的硬界更寬（那是誤讀保險絲，不是設計意見）。" },
    { path: "grid.colsMax", zh: "地圖最大寬（格）", note: "可玩區域的寬度上界。⚠️ 調大它 = 允許更大的圖 = 玩家更難記住地圖，那正是 owner 的黃金鐵則在防的事。" },
    { path: "grid.rowsMin", zh: "地圖最小高（格）", note: "可玩區域的深度下界。⚠️ 與寬度同理：這是**規格窗**，Zod 的硬界更寬（那是誤讀保險絲，不是設計意見）。" },
    { path: "grid.rowsMax", zh: "地圖最大高（格）", note: "可玩區域的深度上界。⚠️ 調大它 = 允許更大的圖 = 玩家更難記住，那正是黃金鐵則在防的事。" },
    { path: "grid.tileSize", zh: "一格 = 幾個世界單位", note: "⭐ 出貨 2.0：24×18 格 = 48×36 單位，與今天的對戰分區（半徑 24）**同尺度**，於是 AoE 級距、火圈上界與**全部 90 支技能的射程**一格都不用重算。⚠️ 調大它等於「順便重調全部技能」。" },
    { path: "traversal.secMin", zh: "橫跨時間下限（秒）", note: "玩家從地圖一側走到另一側的**估算**時間下界。太快 = 追人追不到、地圖沒有空間感。" },
    { path: "traversal.secMax", zh: "橫跨時間上限（秒）", note: "橫跨時間的上界。太慢 = 死一次要走很久才回得到戰場，整場節奏被地圖拖垮 —— 那就是「跟地圖打架」。" },
    { path: "traversal.referenceMoveSpeed", zh: "估算用的參考移速", note: "算橫跨時間的**分母**（世界單位／秒）。⚠️ 這**不是**遊戲裡的移速 —— 真正的移速在戰鬥系統倍率表；改這一格只會改變報告上的估算。" },
    { path: "topology.regionsMin", zh: "地圖區域數下限", note: "一張圖至少幾個命名區域（琵琶廳／庭院／月台…）。⚠️ 太少的話玩家報不出位置 —— 「我在中間」對隊友沒有任何資訊。" },
    { path: "topology.regionsMax", zh: "地圖區域數上限", note: "命名區域數的上界。⚠️ 太多就記不住 —— 而「一兩場之後能不能背下這張圖」正是黃金鐵則的第一句在守的東西。" },
    { path: "topology.regionsPreferred", zh: "最推薦的區域數", note: "owner 定的甜蜜點（5）。⚠️ 它**只影響報告上的提示**，⛔ 不擋輸出 —— 想擋要調上面的上下限。" },
    { path: "topology.deadEndsMax", zh: "死路上限", note: "沒有第二條出口的區域最多幾個。⚠️ 死路多會讓追人變成「堵住就贏」，被追的人完全沒有操作空間。" },
    { path: "topology.loopsMin", zh: "主要循環路線下限", note: "⭐ 迴圈是「被追時能不能繞回來」的**唯一**來源。0 = 被追上就等於死。" },
    { path: "topology.chokepointsMin", zh: "瓶頸數下限", note: "狹窄通道的數量下界。太少 = 沒有戰術地形，全場都是開闊地，追人只剩比誰移速快。" },
    { path: "topology.chokepointsMax", zh: "瓶頸數上限", note: "狹窄通道的數量上界。太多 = 到處卡住，變成跟地圖打架而不是跟玩家打架（黃金鐵則的最後一句）。" },
    { path: "topology.shortcutsMin", zh: "特殊捷徑下限", note: "捷徑數的下界。0 = 允許完全沒有捷徑。捷徑是「熟悉地圖的人才知道的路」，少一點無妨，⛔ 但不能多到讓距離感失效。" },
    { path: "topology.shortcutsMax", zh: "特殊捷徑上限", note: "捷徑數的上界。太多會讓地圖的距離感整個失效 —— 追擊變成猜謎，而不是判斷對手往哪跑。" },
    { path: "interactions.countMin", zh: "互動／任務點下限", note: "一張圖至少幾個可互動／任務點。⭐ 它們是除了火圈之外，逼玩家離開安全角落的另一個節奏來源。" },
    { path: "interactions.countMax", zh: "互動／任務點上限", note: "互動點數的上界。太多 = 玩家不知道該去哪一個，每個點的重要性都被稀釋掉。" },
    { path: "severity.deadEnds", zh: "死路超標時", note: "error = 產生器拒絕輸出、warn = 只記進報告、off = 不看。", optionLabels: { error: "擋下來（產生器拒絕輸出）", warn: "只記進報告", off: "不檢查" } },
    { path: "severity.loops", zh: "迴圈不足時", note: "error = 拒絕輸出、warn = 只記報告、off = 不看。⚠️ 調成 off 等於放棄「被追時能繞回來」的保證。", optionLabels: { error: "擋下來（產生器拒絕輸出）", warn: "只記進報告", off: "不檢查" } },
    { path: "severity.chokepoints", zh: "瓶頸數超出範圍時", note: "error = 產生器拒絕輸出、warn = 只記進報告、off = 不看。瓶頸是品味項，出貨設 warn。", optionLabels: { error: "擋下來（產生器拒絕輸出）", warn: "只記進報告", off: "不檢查" } },
    { path: "severity.shortcuts", zh: "捷徑數超出範圍時", note: "error = 拒絕輸出、warn = 只記報告、off = 不看。捷徑是品味項，出貨設 warn。", optionLabels: { error: "擋下來（產生器拒絕輸出）", warn: "只記進報告", off: "不檢查" } },
    { path: "severity.interactions", zh: "互動點數超出範圍時", note: "error = 拒絕輸出、warn = 只記報告、off = 不看。互動點數是品味項，出貨設 warn。", optionLabels: { error: "擋下來（產生器拒絕輸出）", warn: "只記進報告", off: "不檢查" } },
    { path: "severity.traversal", zh: "橫跨時間超出範圍時", note: "同上。⚠️ 它是**估算**（最長最短路徑 ÷ 參考移速），不是實測 —— 所以出貨設 warn。", optionLabels: { error: "擋下來（產生器拒絕輸出）", warn: "只記進報告", off: "不檢查" } },
    { path: "intro.enabled", zh: "戰鬥開場要不要報地圖名", note: "開（出貨值）＝ 每一回合戰鬥開始時在畫面上方打出這一場的地圖名字（「無限城」「希干希納」…）；關＝ 完全不畫。owner 2026-08-14：「戰鬥開始的時候不會顯示這是什麼地圖，請你記得要顯示出來」。⚠️ 報的是地圖的**顯示名**不是 id，而且分割畫面時一律不畫（一行橫跨全寬的大字會蓋住兩邊）。" },
    { path: "intro.holdSec", zh: "地圖名停留幾秒", note: "從戰鬥開始算起，名字整整不透明地停留這麼久，之後才開始淡出。2.5 秒（出貨值）是「看得完四個字又不擋開局」—— 一回合戰鬥只有 90 秒，提示佔掉的是玩家最需要看清場地的那幾秒。填 0 ＝ 直接進入淡出（等同幾乎不顯示）。",
    },
    { path: "intro.fadeSec", zh: "地圖名淡出幾秒", note: "停留結束之後花多久淡到全透明。0.8（出貨值）夠柔和又不拖泥帶水；填 0 ＝ 到時間直接消失。⚠️ 淡出是**逐幀算出來的透明度**不是 CSS 動畫，所以這一格填 0 是真的立刻不見，不會被瀏覽器的預設過場拖住。",
    },
    { path: "cornerLabel.enabled", zh: "戰鬥中小地圖上一直顯示地圖名", note: "開（出貨值）＝ 戰鬥全程在**小地圖的上緣**掛一行小字寫著這一回合在哪張圖打；關＝完全不畫。⭐ 沒有「貼哪一角」那一格是**刻意的**：標籤畫在小地圖自己那塊裡（小地圖畫的就是這張圖，地名是它的標題），所以小地圖搬家它就跟著搬（手機上小地圖在左上）—— 而且它佔用的新版面空間是 0。owner 2026-08-15：「場地名稱可以一直顯示在角落小字」。⚠️ 這一格跟上面的**開場報地名是兩件事**：那個是幾秒後就消失的開場大字，這個是整場都在的小標籤。關掉其中一個不會影響另一個 —— 想「只在開場報一次」就關這格，想「不要開場演出但隨時看得到」就關上面那格。",
    },
    { path: "cornerLabel.opacity", zh: "地名的不透明度", note: "0.62（出貨值）＝ 讀得到但不搶戰鬥的視線，也還看得見底下的地形。調到 1 會把小地圖最上緣那一條蓋成不透明。⚠️ 下界是 0.1 而不是 0：0 等於「開著但看不見」，那是最難查的壞法 —— 想關掉請用上面的開關，⛔ 不要把它調成 0。",
    },
  ],
  preserved: [],
};

// ── 戰鬥鏡頭（config/camera）—— GH#329 ─────────────────────────────────────
const CAMERA_SPEC: ConfigDocSpec = {
  page: "camera",
  collection: "config",
  docId: "camera",
  schemaTag: "config.camera@1",
  zod: zConfigCameraDoc,
  title: "戰鬥鏡頭",
  intro: [
    "⭐ owner 2026-08-15：「**最大視野減少兩節**(滑鼠滾輪)」—— 那一節就是下面的「最遠視野」。",
    "**「一節」不是一個單位，是一個換算**：瀏覽器滾一格的 `deltaY` 是 100–120，乘上「一單位滾輪推多少」（出貨 0.02）≈ 一節 2.0–2.4。所以「減兩節」＝ 40 → 36。",
    "⚠️ 在這一頁出現之前這四個數字**全部寫死在 client 的 CameraRig.ts**，而它們已經被改過三次 —— 每一次都是一輪 client rebuild + 一次完整部署。現在存檔就生效（客戶端重新載入 bundle 之後）。",
    "⛔ **這一頁不管俯角。** 68° 是從遮擋安全推出來的幾何線（道具高度上限 2.4 單位是照那個角度算的），⛔ 不是一格可以隨手拉的滑桿。",
  ],
  consumer: "apps/client/src/render/CameraRig.ts 的 cameraLimits()（滾輪與陣亡觀戰的夾限）",
  effect: "客戶端重新載入 bundle 之後生效；⛔ 不需要重啟 game-server（鏡頭純粹是客戶端的事）。",
  fields: [
    { path: "zoom.minDolly", zh: "最近視野（也是開局的預設鏡頭）", note: "滾輪能推到多近，單位是鏡頭到角色的距離。⭐ 它同時是**開局的預設值** —— 出貨的設計是「一進場就是最大」（#31a），所以調大它等於讓每一場都從比較遠的地方開始。⚠️ 下界 4：再近鏡頭會穿進角色身體裡（EX 演出用的特寫是 5，那是刻意的例外，不受這一格管）。",
    },
    { path: "zoom.maxDolly", zh: "最遠視野（owner 要減兩節的就是這一格）", note: "滾輪能拉到多遠。出貨 36 ＝ 原本的 40 減兩節。⚠️ 上界 120 不是裝飾：拉遠等於把整個競技場塞進同樣多的像素，角色會小到分不出誰是誰 —— 而 24×18 的場地對角線本來就只有 30 單位左右，拉到 60 以上畫面就幾乎全是地板。",
    },
    { path: "zoom.maxDollyDead", zh: "陣亡觀戰時的最遠視野", note: "死掉之後看整場用的。刻意比上面那格寬很多（出貨 90 對 36），因為觀戰時要看的是「這一場打成怎樣」而不是自己的操作。⚠️ 它**不可以小於**最遠視野 —— 存檔時會被擋下來，理由是那會讓「死了以後視野反而變窄」。",
    },
    { path: "zoom.wheelStep", zh: "一單位滾輪推多少（＝「一節」的換算）", note: "鏡頭距離 += 滾輪的 deltaY × 這一格。出貨 0.02，配上瀏覽器一節 100–120 的 deltaY ⇒ **一節約 2.0–2.4**。⭐ 這一格存在的理由就是讓「幾節」講得出來 —— 調大它滾一下跑更遠（比較跳），調小比較細膩但要滾很多下。⚠️ 觸控板的 deltaY 比滑鼠小很多，所以同一格對兩種裝置的手感不一樣。",
    },
  ],
  preserved: [],
};

const MITIGATION_SPEC: ConfigDocSpec = {
  page: "mitigation",
  collection: "config",
  docId: "mitigation",
  schemaTag: "config.mitigation@1",
  zod: zConfigMitigationDoc,
  title: "減傷規則",
  intro: [
    "LoL 式減傷四段的最後一格：**負抗性的放大上限**。護甲/魔抗被穿到負值時，傷害會被放大，這一格是那個放大倍率的天花板。",
    "⚠️ 沒有天花板的話，一件穿透道具疊到極端就會讓一發普攻打出天文數字 —— 這一格是保險絲，不是手感旋鈕。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/mitigation.json`**。",
  ],
  consumer: "packages/shared/src/sim/combat/penetration.ts 與 mitigate()（全專案唯一算減傷的地方）",
  effect: "**要重啟 game-server shard 才生效**。和 冷卻規則／吟唱規則 同一個形態(#278)。",
  fields: [
    {
      path: "negativeResistAmplifyCeiling",
      zh: "負抗性放大上限",
      note: "護甲/魔抗被穿成負數時，傷害最多被放大到幾倍。⚠️ 這是**保險絲**：調高等於允許穿透流一擊必殺，調低等於穿透道具的收益封頂。",
    },
  ],
  preserved: [],
};

const DISPLACEMENT_TIERS_SPEC: ConfigDocSpec = {
  page: "displacementTiers",
  collection: "config",
  docId: "displacement-tiers",
  schemaTag: "config.displacement-tiers@1",
  zod: zConfigDisplacementTiersDoc,
  title: "位移級距",
  intro: [
    "位移距離走**四級距**（小/中/大/極大），⛔ 技能不再寫死距離數字 —— 和 AoE 級距、冷卻規則同一個形態。",
    "⭐ **兩條梯子**：`travel` = 自己動（衝刺），`push` = 別人被推（擊退）。出貨分佈幾乎不重疊（衝刺 5.0–14.67、擊退 2.0–6.0），硬塞成一條會讓 14 支擊退全部擠進「小」。要合成一條就把兩張表填成一樣的數字。",
    "⚠️ **速度那一欄是安全欄位不是手感欄位**（GH#318）：穿牆的門檻是「每 tick 位移 > 身體半徑」，所以上限 = ⌊30 × 最小身體半徑 × 安全係數⌋。**關掉「夾住速度」穿牆就會回來**。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/displacement-tiers.json`**。",
  ],
  consumer: "packages/shared/src/content/displacementTiers.ts 的 resolveDisplacementTier（註冊時把級別翻成距離/速度）",
  effect: "**要重啟 game-server shard 才生效**，客戶端要重新載入 bundle。",
  fields: [
    { path: "enabled", zh: "級距總開關", note: "關掉之後技能照自己文件裡寫的距離走，等於這套級距沒有存在過。⚠️ 它**不會**連帶關掉速度夾限（那是下面獨立的一格）。" },
    { path: "clampSpeed", zh: "夾住位移速度（穿牆修復本體）", note: "⛔ **這一格才是 GH#318 的修復本體**，而且它**無條件套用**（跟有沒有填級別無關）。關掉它，出貨 35 個位移效果裡有 29 個會穿牆。" },
    { path: "safetyFactor", zh: "速度上限的安全係數", note: "速度上限 = ⌊30 × 最小身體半徑 × 這一格⌋。1.0 = 剛好貼著穿牆門檻，出貨 0.9 留一成餘裕。⚠️ 調高會讓位移更快但逼近穿牆。" },
    ...(["小", "中", "大", "極大"] as const).flatMap((tier) => [
      { path: `travel.${tier}.distance`, zh: `衝刺 · ${tier} · 距離`, note: `自己位移（衝刺類）在「${tier}」這一格走多遠。⚠️ 改它會同時影響**每一支**填了這個級別的技能。` },
      { path: `travel.${tier}.speed`, zh: `衝刺 · ${tier} · 速度`, note: `每秒幾單位。⚠️ 這是安全欄位：超過上限會被「夾住位移速度」那一格截掉，⛔ 不是拿來調手感的。` },
      { path: `push.${tier}.distance`, zh: `擊退 · ${tier} · 距離`, note: `被別人推（擊退類）在「${tier}」這一格推多遠。⚠️ 與衝刺是**兩條獨立的梯子**，改這裡不影響衝刺。` },
      { path: `push.${tier}.speed`, zh: `擊退 · ${tier} · 速度`, note: `每秒幾單位。⚠️ 同衝刺那一欄：這是**安全欄位不是手感欄位**，超過上限會被「夾住位移速度」截掉。` },
    ]),
  ],
  preserved: [],
};

export const CONFIG_DOC_SPECS: readonly ConfigDocSpec[] = [
  MAP_SPEC_SPEC,
  CAMERA_SPEC,
  MITIGATION_SPEC,
  DISPLACEMENT_TIERS_SPEC,
  MODEL_LOD_SPEC,
  VFX_CLEANUP_SPEC,
  GORE_SPEC,
  DAMAGE_COLORS_SPEC,
  SHIELD_SPEC,
  BLOCK_SPEC,
  CRIT_SPEC,
  BERSERK_SPEC,
  DISPEL_SPEC,
  CONTENT_LOAD_SPEC,
  AUTHORING_RULES_SPEC,
  COOLDOWN_RULES_SPEC,
  CAST_TIME_SPEC,
  AOE_TIERS_SPEC,
  STAT_NORMALIZATION_SPEC,
  WOUNDS_SPEC,
  WEAKNESS_SPEC,
  DAMAGE_RULES_SPEC,
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
];

export function specForPage(page: string): ConfigDocSpec | null {
  return CONFIG_DOC_SPECS.find((s) => s.page === page) ?? null;
}

// ────────────────────────────────────────────────────────────── 表格列 ─────

/** 一格在畫面上要知道的全部東西。 */
export interface ConfigFieldRow {
  path: string;
  label: ConfigFieldLabel;
  leaf: ScalarLeaf;
  /** 生效中的值（overlay ?? 出貨），讀不到文件時為 undefined */
  current: unknown;
  /** 出貨文件的值（讀不到時 undefined） */
  shipped: unknown;
  /** 這一格允許的範圍（number 專用，已經合併過 schema 與標籤表） */
  bounds: { min?: number; max?: number; exclusiveMin?: boolean; exclusiveMax?: boolean };
}

/** 從點路徑取值。中途遇到非物件就回 undefined，不丟例外。 */
export function getAt(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * schema 的上下界 ⊕ 標籤表補的上下界。
 *
 * 兩邊同時給 → 丟例外，因為那是兩份會 drift 的上界，而 drift 的症狀是
 * 「後台擋了但 PUT 沒擋」或反過來，兩個都很難看出來。`configForms.test.ts`
 * 直接跑這一支，所以重複來源在測試期就會炸。
 */
export function boundsFor(leaf: ScalarLeaf, label: ConfigFieldLabel): ConfigFieldRow["bounds"] {
  if (leaf.max !== undefined && label.max !== undefined) {
    throw new Error(`${leaf.path}: schema 已經有上界 ${leaf.max}，標籤表不可以再給一個`);
  }
  if (leaf.min !== undefined && label.min !== undefined) {
    throw new Error(`${leaf.path}: schema 已經有下界 ${leaf.min}，標籤表不可以再給一個`);
  }
  const min = leaf.min ?? label.min;
  const max = leaf.max ?? label.max;
  return {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(leaf.exclusiveMin ? { exclusiveMin: true } : {}),
    ...(leaf.exclusiveMax ? { exclusiveMax: true } : {}),
  };
}

/**
 * 一份 spec + 現在生效的文件 + 出貨文件 → 畫面上的每一列。
 *
 * ⚠️ 順序跟著**標籤表**走，不是跟著 schema 走：`Object.entries(shape)` 的順序是
 * 宣告順序，而宣告順序是給程式看的（`id` / `schema` 在最前面）。畫面的順序是
 * 給人看的，那是一個決定，所以它寫在標籤表裡。
 */
export function fieldRows(
  spec: ConfigDocSpec,
  current: unknown,
  shipped: unknown,
): ConfigFieldRow[] {
  const { leaves } = readSchema(spec.zod);
  const byPath = new Map(leaves.map((l) => [l.path, l]));
  return spec.fields.map((label) => {
    const leaf = byPath.get(label.path);
    if (!leaf) throw new Error(`${spec.docId}: 標籤表寫了 "${label.path}"，但 schema 沒有這個欄位`);
    return {
      path: label.path,
      label,
      leaf,
      current: getAt(current, label.path),
      shipped: getAt(shipped, label.path),
      bounds: boundsFor(leaf, label),
    };
  });
}

// ──────────────────────────────────────────────────────────── 驗證 ─────────

/**
 * 一格的輸入 → 要寫進文件的值，或一句中文的拒絕理由。
 *
 * **上界和下界一樣重要**（#277）：只擋下界的話，24 打成 240 會過後台，然後在
 * 下游被靜默夾掉或直接拖垮一台手機，而操作者看到的是「✓ 已儲存」。
 */
export function parseFieldInput(
  row: ConfigFieldRow,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const leaf = row.leaf;
  if (leaf.kind === "boolean") {
    if (raw === "true") return { ok: true, value: true };
    if (raw === "false") return { ok: true, value: false };
    return { ok: false, error: "只能是開啟或關閉" };
  }
  if (leaf.kind === "enum") {
    if (!leaf.options.includes(raw)) return { ok: false, error: `只能是 ${leaf.options.join(" / ")}` };
    return { ok: true, value: raw };
  }
  if (leaf.kind === "text") {
    if (raw.trim() === "") return { ok: false, error: "不可以是空的" };
    const { pattern, patternError } = row.label;
    if (pattern && !pattern.test(raw)) {
      return { ok: false, error: patternError ?? "格式不對" };
    }
    return { ok: true, value: raw };
  }
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "不可以是空的" };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, error: "要填一個數字" };
  if (leaf.int && !Number.isInteger(n)) return { ok: false, error: "要填整數" };
  const { min, max, exclusiveMin, exclusiveMax } = row.bounds;
  if (min !== undefined && (exclusiveMin ? n <= min : n < min)) {
    return { ok: false, error: `不可以${exclusiveMin ? "小於等於" : "小於"} ${min}` };
  }
  if (max !== undefined && (exclusiveMax ? n >= max : n > max)) {
    return { ok: false, error: `不可以${exclusiveMax ? "大於等於" : "大於"} ${max}` };
  }
  return { ok: true, value: n };
}

/** 畫面上顯示一個值的字面樣子。undefined → 「—」。 */
export function displayValue(v: unknown, label: ConfigFieldLabel): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "boolean") return v ? "開啟" : "關閉";
  if (typeof v === "string") return label.optionLabels?.[v] ?? v;
  return String(v);
}

/** 輸入框／下拉選單現在的字面值。 */
export function inputValue(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

// ──────────────────────────────────────────────────────────── 存檔 ─────────

/**
 * 把編輯疊到**整份**基底文件上。
 *
 * ⚠️ 基底是「現在生效的整份文件」（overlay ?? 出貨），不是一個新物件。這一行就是
 * 「不會把 `championStyles` 弄不見」那條規則：頁面只認得三格純量，但送出去的是
 * 整份文件，所以它不認得的東西一格都不會掉。
 *
 * 深拷貝之後才改，因為呼叫端還握著同一個 `base`（頁面用它畫「現在的值」）；就地
 * 改的話畫面會在 PUT 成功之前就顯示新值，而 PUT 失敗時操作者看到的是一個從來
 * 沒有存進去的狀態。
 */
export function applyEdits(base: unknown, edits: ReadonlyMap<string, unknown>): Record<string, unknown> {
  if (!base || typeof base !== "object") {
    throw new Error("沒有基底文件可以疊加 —— 這一次儲存會弄丟這份文件裡其他所有東西");
  }
  const out = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  // Map 迭代順序是插入順序（確定的），但存檔結果不可以跟操作者打字的先後有關，
  // 所以排序過再套。兩格路徑不會互相覆蓋，這只是讓行為可重現。
  for (const path of [...edits.keys()].sort()) {
    const keys = path.split(".");
    let cur: Record<string, unknown> = out;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      const next = cur[k];
      if (!next || typeof next !== "object" || Array.isArray(next)) cur[k] = {};
      cur = cur[k] as Record<string, unknown>;
    }
    cur[keys[keys.length - 1]!] = edits.get(path);
  }
  return out;
}

/**
 * 讀回來的文件是不是這一頁該編輯的那一份。
 *
 * schema 對不上一律當成「沒有」而不是「照樣讀」—— 把一份 combat-env 的表當成
 * model-lod 畫出來的話，操作者會看到一堆對不上的欄位，然後把倍率存成畫質階。
 */
export function docIfMatches(spec: ConfigDocSpec, doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return null;
  return (doc as { schema?: unknown }).schema === spec.schemaTag ? doc : null;
}

/** 給測試與稽核用：一格的欄位名被自動人類化之後長什麼樣（標籤不可以只是這個）。 */
export function autoLabelFor(path: string): string {
  return humanize(path.split(".").pop() ?? "");
}
