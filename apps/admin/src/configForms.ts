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
  zConfigRangeTiersDoc,
  // 冷卻五級距（GH#445）／傷害五級距（GH#447）／回魔地板（GH#446）—— 走 barrel，
  // 同上面那一族。⚠️ 三份都是新的 schema tag，union 漏一行就是 2026-08-02 的形狀。
  zConfigCooldownTiersDoc,
  zConfigDamageTiersDoc,
  zConfigManaEconomyDoc,
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
  zConfigUiLexiconDoc,
  // 混音（owner 2026-08-17）。⚠️ 它的 Zod 住在 `schema/audioMixDoc.ts`，但
  // `schema/index.ts` 有把它 re-export 出來（和 mapSpecDoc 同一條路），所以這裡
  // 走 barrel 而不是深路徑 —— 深路徑那條沒有守衛在看，遲早會指到搬走的檔案。
  zConfigAudioMixDoc,
  // 練習模式（GH#343）—— 同上，schema/index.ts 有 re-export，走 barrel。
  zConfigPracticeDoc,
  // 排名獎勵（owner 2026-08-17）—— 同上，schema/index.ts 有 re-export，走 barrel。
  zConfigRankingDoc,
  // 地端產圖的風格（owner 2026-08-17）—— 同上，schema/index.ts 有 re-export。
  zConfigIconStyleDoc,
  // 技能範圍指引 + 地面預告通道（GH#376）—— 走 barrel（`schema/index.ts` 的
  // `export * from "./config"`），同 zConfigGoreDoc 那一族。
  zConfigRangeGuideDoc,
  // 競技場規則（GH#410）—— 走 barrel，同上面那一族。⚠️ 這一份是全 repo 唯一一份
  // 被四頁共同編輯的 config，所以它是唯一用得到 `ConfigDocSpec.elsewhere` 的。
  zConfigArenaRulesDoc,
} from "@ggd/shared/content";
// ⚠️ 同上的深路徑理由：這兩份 Zod 住自己的檔案（欄位理由長、且 sim 直接吃）。
import { DEFAULT_STAT_NORMALIZATION } from "@ggd/shared/content/statNormalization";
import { zConfigMitigationDoc } from "@ggd/shared/content/schema/mitigationDoc";
import { zConfigMapSpecDoc } from "@ggd/shared/content/schema/mapSpecDoc";
import { zConfigCameraDoc } from "@ggd/shared/content/schema/config";
import { zConfigDisplacementTiersDoc } from "@ggd/shared/content/schema/displacementDoc";
// ⛔ 級距名只有一份（GH#414）—— 後台不重打一組字串。
import { SKILL_TIER_NAMES } from "@ggd/shared/content/skillTiers";
// ⛔ 形狀名（單體／範圍／變身）也只有一份 —— 後台不重打一組字串（同上一行）。
import { COOLDOWN_SHAPES, DEFAULT_COOLDOWN_TIERS } from "@ggd/shared/content/cooldownTiers";
// ⛔ 傷害級距的五個數字也只有一份 —— 相稱性下拉的選項說明從它推導。
import { DEFAULT_DAMAGE_TIERS } from "@ggd/shared/content/damageTiers";
// ⭐ GH#445 —— 「傷害相對冷卻偏低」那一條警示的說明是**現算**的（哪幾格、低幾 %、
//    要跳到哪一級），⛔ 不是後台手寫的一段會過期的散文。
import { describeLowDamageCells } from "@ggd/shared/content/lowDamageCells";
// ⭐ GH#465 三選一 —— 下拉的**選項標籤與說明都是算出來的**（每個模型的十格），
//    ⛔ 不是手寫「這是方案 B」那種對操作者不構成資訊的字。
import {
  DEFAULT_AIM_RISK_MULT,
  DEFAULT_EXPECTED_HITS,
  PROPORTIONALITY_MODELS,
  describeProportionalityModels,
  tableForModel,
} from "@ggd/shared/content/proportionality";
// ⚠️ 深路徑 import：`config.victory-podium@1` 的 Zod 住在自己的檔案裡（欄位的理由
// 很長，而且客戶端 render/** 直接吃它），`content/schema/index.ts` **沒有**再匯出
// 一次，所以這裡走 package.json 的 `"./*"` 子路徑。`laneConfigDocs.test.ts` 走的是
// 同一條。
import { zConfigVictoryPodiumDoc } from "@ggd/shared/content/schema/victoryPodium";
// 創建新英雄的警示開關（GH#480）—— 深路徑：這一份的 Zod 與**規則清單本體**住同一個
// 檔（schema 的 `rules` 物件是從 `NEW_HERO_WARN_RULES` 推導的），⛔ 拆開就會 drift。
import {
  NEW_HERO_CHECKS_DOC_ID,
  NEW_HERO_CHECKS_SCHEMA,
  zConfigNewHeroChecksDoc,
} from "@ggd/shared/content/newHeroChecks";
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

/**
 * 一個**這一頁刻意不畫**的純量葉節點 —— GH#410 的逃生口。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼需要它（而且為什麼它不是一個漏洞）
 * ════════════════════════════════════════════════════════════════════════════
 * `configForms.test.ts` 的「每一個葉節點都恰好有一筆標籤」是**雙向**的，而那個
 * 雙向正是這支引擎的價值：schema 長一格而沒有人寫人話 → 紅。
 *
 * 但 `config.arena-rules@1` 打破了它的一個隱含前提：**一份文件只有一頁在編**。
 * 那一份有三頁手刻的專屬頁（殭屍波系統 / 傳說武器三選一 / 對戰設定）各自編一塊，
 * 而剩下的八個頂層區塊一頁都沒有（GH#410 量到的）。把整份掛上通用引擎的話，
 * 「每一格都要有標籤」會逼這一頁替 `mobWaves` 那 150 格再寫一次人話 ——
 * 那不是覆蓋率，那是**第二份會 drift 的標籤表**。
 *
 * ⭐ 所以逃生口的形狀和 {@link PreservedBranch} 一模一樣：**一列一個看得見的
 * 決定 + 一行說得出「那它在哪裡編」**。⛔ 它不是一個布林旗標、也不是「這一頁只
 * 畫我列的那些」——後者會讓漏接重新變成靜默的。
 *
 * ⚠️ 存檔仍然安全：`applyEdits` 只寫**被改過**的路徑，其餘的鍵從基底文件原封
 * 不動抄過去。所以列在這裡的欄位不會因為這一頁存檔而消失。
 */
export interface ElsewhereField {
  /**
   * 點路徑。**整個子樹**：`mobWaves` 一列涵蓋 `mobWaves.boss.maxHp`，
   * 一格純量就寫它自己（`offerCount`）。
   */
  path: string;
  /**
   * **那它在哪裡編** —— 這一行要指得出一頁後台（或說得出為什麼今天沒有人編它）。
   * 留白 = 三個月後沒有人知道這一列是「已經有人管」還是「漏掉了」。
   */
  why: string;
}

/** `path` 這一格是不是被 `spec.elsewhere` 的某一列涵蓋（自己或子樹）。 */
export function elsewhereCovers(spec: ConfigDocSpec, path: string): boolean {
  return (spec.elsewhere ?? []).some((e) => path === e.path || path.startsWith(`${e.path}.`));
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
   * 這一頁**刻意不畫**的純量葉節點，逐列寫出「那它在哪裡編」（GH#410）。
   *
   * ⛔ 只有 `config.arena-rules@1` 用得到它，而且那是有原因的：它是唯一一份
   * **同時被四頁編輯**的文件。⚠️ 新文件不要開這一格 —— 一份新文件如果需要它，
   * 真正的問題是那份文件該拆成兩份，見 {@link ElsewhereField}。
   */
  elsewhere?: readonly ElsewhereField[];
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
    {
      path: "purgeVictoryFxOnCombatStart",
      zh: "開打就掐掉上一回合的勝利煙火",
      note: "上面每一格管的都是「池子」，這一格管的是另一種殘留：上一回合的勝利煙火還在天上飛，而下一回合已經開打了。開著＝下一回合開打的那一幀把還在飛的煙火停掉，並且把勝利偵測重新武裝（所以這一回合的煙火照樣放得出來）—— 場地乾淨，出貨值。關掉＝煙火可以飄進下一回合當表演；⚠️ 它同時是**止血閥**：萬一「強制停掉」這個動作本身造成閃爍、或連這一回合的煙火一起吃掉，關這一格就回到舊行為，不必重新 build 客戶端。",
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
    // ⭐ GH#465 —— 相稱性。⛔ 十五格不是手打的（第零守則⑨：N 個同型 = K 個模板
    //    + 一張表）；形狀名與級距名都從 shared 的常數來，⛔ 後台不另立一組字串。
    {
      path: "proportionality.enabled",
      zh: "相稱性檢查總開關",
      note: "關掉之後，「付得多、打得少、傷害又低」的組合**完全不會**出現在編輯器的警告清單裡。⚠️ 關掉不會讓那些技能上不了線 —— 這一整族本來就只警告不擋。",
    },
    // ⭐ GH#465 三選一（owner 2026-08-20「fix #465, 3 suggestions?」）——
    //    ⛔ 我沒有替他挑，三條路都做成一格下拉，出貨 = **今天的行為**。
    {
      path: "proportionality.model",
      zh: "相稱性模型（三選一）",
      // ⛔ 四個選項的標籤把**那個模型的範圍五格**帶上，⛔ 不是只寫一個代號 ——
      //    「這是方案 B」對操作者不構成資訊，「範圍＝大/極大/極大/極大/極大」才是。
      optionLabels: Object.fromEntries(
        PROPORTIONALITY_MODELS.map((m) => [
          m,
          m === "custom"
            ? "custom 手填（吃下面十五格）"
            : `${m}：範圍＝${SKILL_TIER_NAMES.map(
                (t) =>
                  tableForModel(
                    m,
                    DEFAULT_COOLDOWN_TIERS.seconds,
                    DEFAULT_DAMAGE_TIERS.damage,
                    DEFAULT_EXPECTED_HITS,
                    DEFAULT_AIM_RISK_MULT,
                  )["範圍"][t],
              ).join("/")}`,
        ]),
      ),
      note:
        "**哪一個模型推導下面那十五格。** 這一格存在的理由是 owner 自己的兩句話打架：" +
        "2026-08-19 手填「範圍・極小要配傷害**大**」，2026-08-20 給的公式算出來是「**小**」" +
        "（差 3 倍／兩級）。⛔ 三條路都做出來了，⭐ 出貨是 **formula ＝ 今天的行為**。" +
        describeProportionalityModels(
          DEFAULT_COOLDOWN_TIERS.seconds,
          DEFAULT_DAMAGE_TIERS.damage,
          DEFAULT_EXPECTED_HITS,
          DEFAULT_AIM_RISK_MULT,
        ) +
        "⚠️ 改這一格會**同時**改掉範圍那五條警告，⛔ 不影響任何技能上不上得了線。",
    },
    // ⭐ 方案 C 的第二個係數 —— 與「打到幾個人」刻意分開。
    ...COOLDOWN_SHAPES.map((shape) => ({
      path: `proportionality.aimRiskMult.${shape}`,
      zh: `${shape}・瞄準風險倍率`,
      note:
        `一支「${shape}」形狀的技能**有多容易一個人都沒打到** —— 要求傷害再乘這個數字。` +
        "**1 ＝ 沒有額外要求**（＝ 公式本身）。⚠️ **只有上面的模型選 `aimRisk` 時才生效**。" +
        "⭐ 它與「期望命中人數」刻意是**兩格**：「打到幾個人」與「有多容易完全落空」是" +
        "兩件不同的事，混成一格的代價是 owner 親口說的「**2 個人**」會被改寫成 0.67 人，" +
        "而那格 config 從此在說謊。⚠️ 出貨「範圍」那格是**反算**出來的：切到 `aimRisk` " +
        "就會重現 owner 2026-08-19 手填的「範圍・極小 → 大」。",
    })),
    // ⭐ owner 2026-08-20 給的那個係數 —— 十五格現在是**從這三個數字推導**出來的。
    ...COOLDOWN_SHAPES.map((shape) => ({
      path: `proportionality.expectedHits.${shape}`,
      zh: `${shape}・期望命中人數`,
      note:
        `一支「${shape}」形狀的技能，一次期望打到幾個人。⭐ 它是 GH#465 整張表的**唯一係數**：` +
        "要求傷害 = 單位輸出率 × 這一格的卡面冷卻 ÷ 這個數字。owner 2026-08-20：" +
        "「**30/6秒=5，所以是 5 倍差距**，但由於是極小還是有可能位於 **2 個人的命中範圍，" +
        "所以再除 2**，最後結論**約等於 2.5 倍**」。⚠️ 量到的是 **1.33 人**，" +
        "owner 自己進位成 **2** —— 那是他的裁決，⛔ 不是四捨五入。" +
        "⛔ **填 0 ＝ 這個形狀豁免**（出貨「變身」就是 0：它的回報軸不是傷害，" +
        "對它要求最低傷害等於逼作者在變身技上填傷害）。" +
        "⚠️ 調小這個數字會**同時收緊**該形狀的五格；調大會放鬆。",
    })),
    ...COOLDOWN_SHAPES.flatMap((shape) =>
      SKILL_TIER_NAMES.map((tier) => ({
        path: `proportionality.minDamageTier.${shape}.${tier}`,
        zh: `${shape}・冷卻 ${tier} → 傷害至少`,
        // ⛔ 五個選項的說明從 `DEFAULT_DAMAGE_TIERS` 推導，⛔ 不抄字面值
        //    （第二守則：測試／後台裡抄一份出貨值就是第四個住處）。
        optionLabels: Object.fromEntries(
          SKILL_TIER_NAMES.map((t) => [t, `${t}（${DEFAULT_DAMAGE_TIERS.damage[t]} 傷害）`]),
        ),
        note:
          `一支「${shape}」形狀、冷卻級距填「${tier}」的技能，傷害級距至少要到哪一格才算相稱。` +
          "填「極小」＝**不構成限制**（那是傷害軸的第一格）。⚠️ 違反只**警告不擋**。" +
          "⚠️ ⛔ **這一格只有在上面的「相稱性模型」選 `custom` 時才生效** —— 其餘三個模型" +
          "都是**現推**的（改了模型，十五格自己跟著動）。⇒ 想做**刻意的單格破例**，" +
          "先把模型切到 `custom`，這裡才是效力來源。" +
          "⭐ 出貨值 = `formula` 推出來的那一份（owner 2026-08-20 的 2.5× 邏輯）：要求傷害 = " +
          "單位輸出率 × 這一格的卡面冷卻 ÷「期望命中人數」。",
      })),
    ),
  ],
  preserved: [],
};

/**
 * 創建新英雄的**警示開關**（GH#480）。
 *
 * ⚠️ 這一頁與 編輯器創作規則 是**兩層不同的東西**，刻意分開：那一頁調的是
 * 「一支技能的冷卻該落在哪個區間」（規則的**內容**），這一頁調的是
 * 「哪幾條規則要在作者存檔的那一刻跳出來」（規則的**開關**）。
 */
const NEW_HERO_CHECKS_SPEC: ConfigDocSpec = {
  page: "newHeroChecks",
  collection: "config",
  docId: NEW_HERO_CHECKS_DOC_ID,
  schemaTag: NEW_HERO_CHECKS_SCHEMA,
  zod: zConfigNewHeroChecksDoc,
  title: "新英雄檢查警示",
  intro: [
    "建立一位新英雄時，**按下建立的那一刻**要跳哪幾條警示。owner 2026-08-20：「⋯**生成代入與檢查跳警示**都要記得更新，特別是 **script 程式自動化跟警示**的部分」。",
    "⭐ 七條**全部只警告、一條都不擋**（owner 2026-08-12：「只是個警告標記，並不會擋」）。唯一標成 block 的是「超出 Zod 上下界」，而那是**事實陳述** —— 伺服器真的會 422，⛔ 不是這一頁決定要擋。",
    "⚠️ 關掉一條的代價是**它變回靜默**：那個問題仍然存在，只是要等到 `content:build`（或更晚，等到玩家撞上）才會被發現。⛔ 關掉之前先想清楚「那誰會告訴作者？」",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/new-hero-checks.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/newHeroChecks.ts 的 newHeroChecksFromDoc()（唯一知道這幾格怎麼作用的地方）← apps/admin 的 heroForgePage.ts（鑄英雄工坊的目錄載入）與 heroTemplate.ts（新英雄模板頁），以及 authoringRules.ts 把同一份開關送給外部編輯器",
  effect:
    "**後台這兩頁下一次重新載入時生效**（它們開頁時抓一次這份文件）；外部編輯器則是下一次讀 `/authoring-rules` 端點就變。",
  fields: [
    {
      path: "rules.empty-column",
      zh: "六欄留白",
      note: "說明／施展距離／範圍／傷害／冷卻／耗魔 這一格該有而是空的或 0 時跳。⚠️ 不適用的組合不算（self 技沒有施展距離）。關掉它，一位六欄全空的新英雄可以一路存進內容庫而 `content:build` 全綠。",
    },
    {
      path: "rules.out-of-bounds",
      zh: "超出 Zod 上下界",
      note: "界線**從出貨 schema 讀**，⛔ 不抄字面值。這一類寫進去伺服器會 422，所以關掉它不會讓那份草稿存得進去 —— 只會讓作者填完整張表才在儲存時吃到一串英文錯誤。",
    },
    {
      path: "rules.principle-band",
      zh: "冷卻不在原則區間",
      note: "冷卻落在「編輯器創作規則」那一頁的單體／範圍區間外時跳。⚠️ owner 說的是「原則上」，所以它保留刻意破例的空間 —— 如果你的這一批英雄就是要破例，關掉它比讓作者習慣忽略警告好。",
    },
    {
      path: "rules.claim-mismatch",
      zh: "說明的數字對不上 JSON",
      note: "卡面寫「25 秒冷卻」而 `cooldown` 是 60 時跳（冷卻／耗魔／持續／傷害四類）。⛔ 模板技整條不判 —— 它的 effects 在磁碟上本來就是空的，判下去 100% 誤報，而一條會誤報的警示會被下一個人整條關掉。",
    },
    {
      path: "rules.no-op-effect",
      zh: "說了但不會發生",
      note: "整棵效果樹一個數字都動不到時跳（第一·五守則：卡片上不可以有「說了但不會發生」的字）。關掉它，一張印著效果、遊戲裡什麼都不發生的技能卡會完全靜默地上線。",
    },
    {
      path: "rules.dialogue-claim",
      zh: "機制數字寫進了台詞",
      note: "⭐「」裡是**角色對白不是效果** —— 寫在裡面的冷卻／耗魔／傷害／持續引擎一格都不讀。這是七條裡唯一沒有前例的一條：既有的每一支都只做到「剝掉台詞」，於是作者永遠不知道他剛剛寫了一句不會生效的話。",
    },
    {
      // ⭐ GH#445 —— owner 2026-08-20：「**傷害太低要跳出警告清單給我，後台跟 codex
      //    編輯器也同步跳警告**」。⛔ 這一格的說明**不是手寫的**：
      //    `describeLowDamageCells()` 現算「哪幾格、低幾 %、要跳到哪一級」，
      //    所以後台看到的話與 `docs/傷害偏低警告清單.md`、與 codex 端點
      //    **不可能分岔**（它們是同一個函式的三個呼叫點）。
      path: "rules.low-damage-cell",
      zh: "傷害相對冷卻偏低",
      note:
        `${describeLowDamageCells()}` +
        "⚠️ 這一條**沒有門檻可以在這裡調**：判準是「低於錨點」，而錨點是傷害五級距表" +
        "自己的起點。⇒ 要放寬就去調上游那三張表（**冷卻五級距** / **傷害五級距** / " +
        "**編輯器創作規則**的「期望命中人數」），這一條下一秒就跟著動。" +
        "⭐ 同一份推導還有兩個消費端：`pnpm lowdmg:build` 產的 " +
        "`docs/傷害偏低警告清單.md`，以及「創建新英雄」的冷卻預設 —— " +
        "生成的新技能**不會出生在**這幾格裡。",
    },
    {
      path: "minSample",
      zh: "中位數的最小樣本數",
      note: "六欄預設值從出貨技能語料取中位數時，同一桶（同槽位＋同施放型態）少於這個數就往上一層退（槽位 → 全語料 → 保守值）。調小＝更貼那一格的同型技能但更容易被三五支離群值帶偏；調大＝更穩但多數格子會退到全語料中位數。⚠️ 上界 200：出貨語料才 420 支，填 800 等於每一格都退到最後的保守值，而畫面上看起來完全正常。",
    },
    {
      path: "autofillDescription",
      zh: "自動代入技能說明",
      note: "新技能出生時要不要用**同一組數字**生一段機制說明（「指定單一敵人，施法距離 9.5，造成 160 點傷害。冷卻 32.5 秒，消耗[MP] 60。」）。⭐ 開著的價值是「說明↔JSON 一致」依構造成立；關掉之後那一格是空的，而空說明在卡片上就是一片空白。",
    },
  ],
  // 兩格純量 + 一個固定形狀的 rules 物件，沒有不編輯的分支要原封帶走。
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
  title: "AoE 範圍五級距",
  intro: [
    "技能的範圍**寫級別不寫數字**。owner 2026-08-11：「重新對應範圍只有 小／中／大／超大，**原則上不寫範圍數字**」（⚠️ 那是 08-11 的**四級**舊詞彙；GH#463 已換成他 08-19 的 極小/小/中/大/極大，值不變、名字整體左移一格）。技能 JSON 填 `radiusTier: \"中\"`，這一頁決定「中」是多少半徑。",
    "⭐ 這一頁存在的理由就是**單一住處**：把數字寫在每支技能上等於 115 個住處，想把「中」從 4.5 調成 5.0 要改 115 個檔案。填了級別的技能，改這一格全部一起動。",
    "⭐ owner 2026-08-19（GH#414）：「正規化成**五級距**」。第五格「極大」是新加的，前四格**一個數字都沒有動** —— 所以 110 支填了級別的技能手感完全不變。",
    "五個級別的意思：極小 ≈ 同時打到 5 人 ／ 小 ≈ 10 人 ／ 中 ≈ 1/4 競技場 ／ 大 ≈ 1/3 競技場 ／ 極大 ≈ 1/2 競技場。",
    "⭐ 這五個數字**不是挑的**：它們是「決鬥區半徑 24 的 1/8 · 3/16 · 1/4 · 1/3 · 1/2」。其中 1/4 與 1/3 是 owner 自己指定的錨，其餘由同一條分母數列延伸。同一條梯子也產出位移級距與施法距離級距（`packages/shared/src/content/skillTiers.ts`）。",
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
    // ⛔ 級距名從 `SKILL_TIER_NAMES` 來，⛔ 不在這裡手打五格 —— 隔壁位移那一頁
    //    （DISPLACEMENT_TIERS_SPEC）早就這樣寫了，而這一頁沒有跟上。
    //    GH#463 改名時，手打的那五格就是唯一沒有自動跟上的地方：
    //    `radius.超大` 變成一個 schema 裡不存在的路徑，而它的紅是在 admin 的
    //    標籤對帳測試才爆出來的 —— ⚠️ 那已經離現場很遠了。
    ...SKILL_TIER_NAMES.map((tier, i) => ({
      path: `radius.${tier}`,
      zh: `${tier} — 半徑`,
      note:
        `填 \`radiusTier: "${tier}"\` 的技能實際掃多大。改這一格，樹上每一支標成「${tier}」的技能同時跟著變。` +
        // 語意來自 owner 2026-08-11 的原話（那時是四級：小/中/大/超大），
        // GH#463 換成他 08-19 的五個名字之後，語意跟著整體左移一格。
        [
          "約同時打到 5 人（原 WC3 100~200）。",
          "約同時打到 10 人（原 WC3 200~300）。",
          "設計意圖是 1/4 競技場（決鬥區半徑 24 ÷ 4），原 WC3 300~500 那一批落在這裡。",
          "1/3 競技場（24 ÷ 3）。原 WC3 500 以上。",
          "1/2 競技場（24 ÷ 2）。⚠️ 上界 24 ＝ 決鬥區半徑：大於它就是全場命中，那要走不設 radius 的寫法，⛔ 不是把這一格填爆。",
        ][i],
    })),
  ],
  // 五格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 施法距離級距 (config/range-tiers) ─

const RANGE_TIERS_SPEC: ConfigDocSpec = {
  page: "rangeTiers",
  collection: "config",
  docId: "range-tiers",
  schemaTag: "config.range-tiers@1",
  zod: zConfigRangeTiersDoc,
  title: "施法距離五級距",
  intro: [
    "owner 2026-08-19：「**可施展技能的距離普遍超遠**」。技能的施法距離**寫級別不寫數字**，技能 JSON 填 `rangeTier: \"中\"`，這一頁決定「中」是多遠。",
    "⚠️ 「超遠」的根因**不是換算係數錯**。係數（`GGD_PER_WC3 = 11/600`）經 owner 自己的校準點驗證過是對的。根因是**這一軸在 GH#414 之前完全沒有表** —— 量到 404 筆施法距離，中位數 11、**最大 29.33**，而決鬥區半徑只有 24：有技能打得比整個決鬥區還遠。",
    "⭐ 梯級與 AoE **完全同一條**（決鬥區半徑 24 的 1/8 · 3/16 · 1/4 · 1/3 · 1/2）。同一個字在兩軸上指向同一個絕對值 —— 一支「大」的技能打得到 6，炸開也是 6。那是 owner 說的「統一」最強的讀法。",
    "⚠️ 這五個是**卡面值**。玩家實際吃到的是它再乘「戰鬥系統」頁的 `abilityRange`（出貨 0.8），與 AoE 完全同一個形態。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/range-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/rangeTiers.ts 的 resolveRangeTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能註冊時把 rangeTier 翻成 range；standalone 與 champion-embedded 兩條路共用同一個答案",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 AoE 級距同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `rangeTier` 不解析（填了也不生效），技能只剩手寫的 `range`。⚠️ 關掉**不會**讓技能失去射程 —— 手寫值一直都在。",
    },
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `range.${tier}`,
      zh: `${tier} — 施法距離`,
      note: `填 \`rangeTier: "${tier}"\` 的技能打得到多遠（卡面值）。⚠️ 改這一格，樹上每一支標成「${tier}」的技能同時跟著變。`,
    })),
  ],
  // 五格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 冷卻級距 (config/cooldown-tiers) ─

const COOLDOWN_SHAPE_WHY: Record<string, string> = {
  單體: "打一個人的技能。⭐ 極小那一格 **6 秒**是 owner 的 Q1 反算出來的：卡面 6 秒 ＝ **1.2 實際秒**，連續 20 次 ＝ 24 秒內要能殺死對方。",
  範圍: "打一片的技能。整張表比單體貴 **2–5 倍**，那就是「打到很多人」的代價 —— 也是傷害級距只需要**一張**表的原因（同一個懲罰不收兩次）。",
  變身: "變身／長持續增益。⚠️ 與範圍**同一組數字**是 owner 給的，⛔ 不是我複製貼上：這一類的價值來自「一場只有幾次」。",
};

const COOLDOWN_TIER_WHY = [
  "**下限例外**（owner 2026-08-19：「極大跟極小都是屬於卡上下限的例外而非線性規則」）。單體這一格是整套系統的錨 —— 傷害級距的極小也是從它反算的。",
  "線性段的第一格。",
  "線性段的中間。⚠️ 出貨 358 支有冷卻的技能，中位是 **55 秒** —— 也就是說大部分技能今天落在「大」附近，而傷害只有中位 532。那個落差就是 GH#447 說的「AP 太弱勢」。",
  "線性段的最後一格。",
  "**上限例外**（同極小）。⚠️ 這一格 × 範圍表 ＝ 120 卡面秒 ＝ 24 實際秒，一回合放得出兩次左右。",
];

const COOLDOWN_TIERS_SPEC: ConfigDocSpec = {
  page: "cooldownTiers",
  collection: "config",
  docId: "cooldown-tiers",
  schemaTag: "config.cooldown-tiers@1",
  zod: zConfigCooldownTiersDoc,
  title: "冷卻五級距",
  intro: [
    "owner 2026-08-19 逐字：「冷卻的階段只會分幾種 一樣是**極小小中大極大** ／ **單體 6/15/30/45/60** ／ **範圍 30/45/60/90/120** ／ **變身或持續增益狀態 30/45/60/90/120** ／ **不計入系統倍率及減少 CD 等效果**」。技能 JSON 填 `cooldownTier: \"中\"`，這一頁決定「中」是幾秒。",
    "⭐ 這十五格是 owner **直接給滿的規格**，所以它們是**照抄**的 —— ⛔ 沒有像 AoE／施法距離／位移那樣套一條推導梯子。再推一次就是拿「編輯器產生的 JSON」去蓋「owner 的新版說明」，那違反優先序階梯。",
    "⚠️ 這裡的秒數是**卡面秒**（owner：「不計入系統倍率」）。玩家實際等到的 ＝ 這一格 × 「戰鬥系統」頁的 `cooldown`（出貨 **0.2**）× 暴走倍率，再被「冷卻規則」頁的秒數地板夾一次。⇒ 單體·極小 6 卡面秒 ＝ **1.2 實際秒**。",
    "⚠️ 「6 為什麼不在 15 的整除格點上」不是算術副作用。owner 2026-08-19：「**極大跟極小都是屬於卡上下限的例外而非線性規則**」—— 線性段（小／中／大）的範圍÷單體 ＝ 3.0／2.0／2.0，全部落在他給的「2–5× 上下限參考準則」內。",
    "⚠️ 級距是**一支技能一格**，⛔ 不是逐等級各一格：解析時整條冷卻陣列的每一階都被寫成同一個值。想做「升階冷卻下降」的技能就**不要**填級別，手寫陣列一直都合法。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cooldown-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/cooldownTiers.ts 的 resolveCooldownTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能與道具註冊時把 cooldownTier 翻成 cooldown；standalone 與 champion-embedded 兩條路共用同一個答案",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 AoE／施法距離級距同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `cooldownTier` 不解析（填了也不生效），技能只剩手寫的 `cooldown` 陣列 —— ⭐ 那就是**一鍵回到舊的那一套秒數**。⚠️ 關掉**不會**讓技能失去冷卻。",
    },
    {
      path: "autoShape",
      zh: "沒填形狀時自動判斷",
      note: "技能沒填 `cooldownShape` 時，要不要從它自己的內容推（有變身 → 變身；有範圍 → 範圍；其餘 → 單體）。⚠️ 關掉的代價是**沒填的一律當單體**，也就是範圍大絕會靜默拿到便宜的那張表（30 秒而不是 60 秒），而卡片、schema、測試全部正常。",
    },
    ...COOLDOWN_SHAPES.flatMap((shape) =>
      SKILL_TIER_NAMES.map((tier, i) => ({
        path: `seconds.${shape}.${tier}`,
        zh: `${shape}・${tier} — 卡面秒`,
        note:
          `填 \`cooldownTier: "${tier}"\` 且形狀是「${shape}」的技能要等幾**卡面**秒（實際 ×0.2）。` +
          `改這一格，樹上每一支落在這一格的技能同時跟著變。${COOLDOWN_SHAPE_WHY[shape]}${COOLDOWN_TIER_WHY[i]}`,
      })),
    ),
  ],
  // 十五格純量 + 兩個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 傷害級距 (config/damage-tiers) ─

const DAMAGE_TIER_WHY = [
  "⭐ **這一格是整張表的錨**，而且它是**算出來的**：三個錨點各自要求「該級中位有效血量 ÷ owner 的 20 次，進位到 50 的倍數」⇒ **LV30 要 700 · LV50 要 1,150 · LV99 要 2,400**（量到的中位有效血量 13,927 / 22,437 / 47,008）。出貨走**滿足得了的最高**那一個 ＝ **LV50 的 1,150**。⚠️ 一定要**進位** —— 捨去會差幾個 % 違反 owner 的 Q1，而且沒有任何東西會紅。",
  "＝ 錨 × (15 ÷ 6)。",
  "＝ 錨 × (30 ÷ 6)。⚠️ 對照：今天出貨技能在 LV30 的**中位**滿階傷害是 **735**，也就是血條的 5.3%，要 **19 發**才殺得死一個人。",
  "＝ 錨 × (45 ÷ 6)。",
  "＝ 錨 × (60 ÷ 6)。＝ LV30 中位有效血量的 **83%** / LV50 的 **51%** / LV99 的 **24%**。⚠️ 上界 **13,927** ＝ **LV30（hard limit）**的中位有效血量：超過它的一發就是**一發秒殺**，那不是傷害級距而是另一種設計。⭐ 取最早會遇到它的那一級，⛔ 不是 LV50/LV99 —— 這一條同時是「哪一個錨點出貨」的天花板（LV99 要的極大是 24,000，1.72 倍，直接出局）。",
];

const DAMAGE_TIERS_SPEC: ConfigDocSpec = {
  page: "damageTiers",
  collection: "config",
  docId: "damage-tiers",
  schemaTag: "config.damage-tiers@1",
  zod: zConfigDamageTiersDoc,
  title: "傷害五級距",
  intro: [
    "owner 2026-08-19：「**可以重新設計拉高**，畢竟之前檢討過 **AP 太弱勢**，我們幾乎要拉到高等級才能開始追平普通攻擊無風險的傷害」。技能在 `amount` 裡填 `damageTier: \"中\"`，這一頁決定「中」是多少基礎傷害。",
    "⛔ **2026-08-20 重錨**：舊的 500／1250／2500／3750／5000 是拿 **Lv18** 算的。owner 2026-08-20 更正：「我的錨點有講過是 **LV 30/50/99 三個**，至少要滿足 **30(hard limit)**，能 **50 比較好(soft limit)**, **99 是極限**」。",
    "⭐ 五個數字**不是挑的**，是從**三個錨點 + 冷卻表**推導的：每一級要求的錨 ＝ 該級中位有效血量 ÷ owner 的 20 次（進位到 50 的倍數）⇒ LV30 要 700・LV50 要 1,150・LV99 要 2,400；出貨走**滿足得了的最高**那一個 ＝ **LV50 ⇒ 1,150**，其餘 ＝ 1,150 × 單體冷卻 ÷ 6。這正是 owner Q4 的意思 ——「**已經有傷害相應的冷卻跟耗魔做限制**」，貴的技能貴在它落在冷卻表的哪一格，⛔ 不是靠一條沒有錨的超線性曲線。",
    "⭐ **三個錨點的達成率**（打死該級中位英雄要幾發「極小」，門檻 20 發）：**LV30 12.1 發 ✅ hard limit**・**LV50 19.5 發 ✅ soft limit**・**LV99 40.9 發 ❌ 極限**（差 2.04 倍）。LV99 要把錨拉到 2,400，那會讓「極大」變成 24,000 ＝ LV30 中位血量的 1.72 倍，**每一發極大都是即死** —— 所以它出局的理由是一條寫在程式裡的天花板，⛔ 不是我挑的。",
    "⚠️ LV99 的缺口**不是這五格調得掉的**：血量比傷害長得快（Lv18→LV99 中位有效血量 ×5.19，中位滿階傷害只 ×2.14）。要補它得動成長曲線，⛔ 不是把這一頁填爆。",
    "⭐ 只有**一張**表，⛔ 沒有「單體一張、範圍一張」：形狀的代價整個住在冷卻軸上（範圍表比單體貴 2–5 倍），再在傷害軸打一次折就是同一個懲罰收兩次。驗算：單體·極大 5000÷60 ＝ 83／卡面秒 ×1 人；範圍·極大 5000÷120 ＝ 42／卡面秒 ×1.85 人 ＝ 77 —— 兩者幾乎相等。",
    "⚠️ 「範圍·極小」是這個讀法唯一壞掉的一格（500÷30×1.33 ＝ 22，只有單體極小的 1/3.8）。owner 的答案是「**那一格要求傷害是大／極大**」，而它住在「編輯器創作規則」頁的相稱性表，⛔ 不是把這張表拆成兩張。",
    "⚠️ 填了 `damageTier` 的那一格，`flat` 與 `perRank` 會被級距**取代**（⛔ 不是相加）；`ratios` / `attrRatios` 不受影響 —— 那兩條是**成長**，不是基礎值。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/damage-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/damageTiers.ts 的 resolveDamageTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能與道具註冊時把 amount.damageTier 翻成 amount.flat",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 冷卻五級距 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `damageTier` 不解析，技能回到自己手寫的 `flat` / `perRank` —— ⭐ 那就是**一鍵回到今天的那一套傷害**（中位 532）。⚠️ 關掉**不會**讓技能不再造成傷害。",
    },
    ...SKILL_TIER_NAMES.map((tier, i) => ({
      path: `damage.${tier}`,
      zh: `${tier} — 基礎傷害`,
      note:
        `填 \`damageTier: "${tier}"\` 的那一格實際打多少（卡面值，上場還要乘「戰鬥系統」頁的 \`damageDealt\` 與對方的減免）。` +
        `改這一格，樹上每一處標成「${tier}」的傷害同時跟著變。${DAMAGE_TIER_WHY[i]}`,
    })),
  ],
  // 五格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 魔力經濟 (config/mana-economy) ─

const MANA_ECONOMY_SPEC: ConfigDocSpec = {
  page: "manaEconomy",
  collection: "config",
  docId: "mana-economy",
  schemaTag: "config.mana-economy@1",
  zod: zConfigManaEconomyDoc,
  title: "魔力經濟（建議滿魔時間）",
  intro: [
    "owner 2026-08-19 逐字：「應該是去**調整回魔**，找到一個平衡⋯**平均回魔不超過 15 秒就可以滿魔再一輪，最糟的情形也不超過 20 秒**」。",
    "⛔ **2026-08-20 降級**：它本來是一條**硬地板**（程式把回魔拉到 池÷15）。owner 2026-08-20 更正：「refillSeconds:15 => **時間是建議原則 不是死程式邏輯**，你要**量給我以後給我例外清單判斷**，一樣錨點」⇒ 現在「滿魔秒數」是**建議目標**，要不要真的拉由下面的「**超標時真的把回魔拉上去**」決定，⭐ 而它出貨是**關的**。",
    "⭐ **2026-08-20：owner 決定了方向，⛔ 而它不是打開下面那個開關。** 逐字：「那我覺得**智慧影響回魔可以增加更多**、**初始回魔也增加少許**，同時**20 秒的限制可以調高到 30 秒**」⇒ 三個動作全部落在**別的三頁**：戰鬥系統的 `intToManaRegen` **0.07 → 0.21**、基礎加成的 `manaRegen` **0 → 10**、以及最糟門檻 **20 → 30 秒**（＝這一頁「滿魔秒數」的新上界）。",
    "⭐ **例外清單在 `docs/魔力回復例外清單.md`**（`pnpm mana:audit` 產生，逐隻英雄 × LV30/50/99 三個錨點）。量到的（71 隻裸裝）：**調前**中位滿魔 42.1 / 38.0 / 34.5 秒、超過 30 秒 **68 / 66 / 62 隻**；**調後**中位 **15.8 / 14.1 / 13.2 秒**、超過 30 秒 **1 / 1 / 1 隻**。⭐ owner 的新門檻（30 秒）三個錨點都只剩 1 隻超標；建議值 15 秒在 LV50／LV99 達成，LV30 是 15.8 秒（超 5%）。",
    "⚠️ 剩下的那一隻是 `godie-h02k` 熊貓，而他是**結構性**的例外：INT 2、intGrowth 0 ⇒ **智慧那根軸碰不到他**，係數再拉高他也不動（調後仍是 38.8／36.4／34.0 秒，而那一段全部來自扁平的基礎加成）。他只吃得到「基礎加成」那一格扁平的回魔。⚠️ 沒有撞到屬性上限 `manaRegen` 926：撞到的仍然只有 `godie-h020` 莉娜一隻（調前調後都是），⛔ 所以這一批沒有動上限。",
    "⭐ 打開之後規則寫在**時間**上而不是倍率上：`每秒回魔 ≥ 魔力池 ÷ 滿魔秒數`。一個倍率會對每位英雄乘出**不同的**滿魔時間（高智力本來就快，乘完更快），而 owner 給的是一個**時間**保證。",
    "⭐ 調的是**回魔**不是耗魔 —— 那是 owner 親自轉的向。拉高耗魔要動 342 支技能的卡面數字（342 個住處），調回魔只動這一頁，而玩家感受到的是同一件事（「放完要等」）。",
    "⚠️ 就算打開，它也**解不了**「範圍技連續 8 次才需要等」與「連續四個大範圍技能後一定要等」—— 那兩條要動的是每支技能的耗魔，也就是 owner 這一則否決掉的方向。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/mana-economy.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/manaEconomy.ts 的 manaRegenPerSec（全專案唯一知道這條地板怎麼算的地方）← sim/systems/RegenSystem.ts 每一 tick，經由 MatchController 在 tick 0 之前定格到 world.manaEconomy",
  effect:
    "**從下一場比賽開始生效**（`Configs` 是 boot 時載入的，所以後台存檔之後要重啟 game-server shard）。比賽中途不會變 —— 規則在 tick 0 之前就定格了。",
  fields: [
    {
      path: "enabled",
      zh: "魔力經濟總開關",
      note: "關掉之後這一整條規則不存在（連「建議」的語意都沒有）—— ⭐ 那就是一鍵 rollback。⚠️ 它與下面那一格**不是**同一件事：這一格關的是整條規則，下面那一格只決定「知道超標之後動不動手」。",
    },
    {
      path: "refillSeconds",
      zh: "從空到滿的建議秒數",
      note: "⭐ owner 2026-08-20：「時間是**建議原則** 不是死程式邏輯」⇒ 它是一個**被稽核的目標**，⛔ 不是保證。只有兩個讀者：① 下面那個開關打開時的地板算式（魔力池 ÷ 這個數）② `pnpm mana:audit` 判斷誰超標的門檻。出貨 **15**（owner：「平均回魔不超過 15 秒就可以滿魔再一輪」）。⚠️ 上界 **30** 是 owner 自己給的數字（2026-08-19「最糟的情形也不超過 20 秒」→ 2026-08-20「**20 秒的限制可以調高到 30 秒**」），⛔ 不是防手滑的柵欄。",
    },
    {
      path: "enforceFloor",
      zh: "超標時真的把回魔拉上去",
      note: "⭐ 出貨 **關**，而 2026-08-20 之後它**更沒有理由打開**：owner 選的是「**智慧**影響回魔增加更多」，而地板會把每一位英雄拉到同一個滿魔時間、**與他的智力無關** —— 那正好是相反的方向。關著 ＝ 上面那個秒數純粹是一條建議，回魔**逐位元**等於屬性管線算出來的 `manaRegen`（調完之後中位滿魔 LV30 15.8s／LV50 14.1s／LV99 13.2s）。打開 ＝ 回到 2026-08-19 的硬地板 `每秒回魔 ≥ 魔力池 ÷ 建議秒數`。⚠️ 它是**地板不是取代**：本來就回得比它快的英雄一格都不會被動到，否則這條規則會反過來削弱高智力英雄。⚠️ 打開之前先看 `docs/魔力回復例外清單.md`。",
    },
    {
      path: "championsOnly",
      zh: "只套在英雄身上",
      note: "出貨 **開**。關掉之後殭屍與守衛塔身上帶魔力的那些也吃這條地板 —— ⚠️ 一條為英雄節奏設計的地板套到怪物身上會讓它們變成另一種東西，而沒有人要求過。⚠️ 它只在上面那個開關打開時有意義。",
    },
  ],
  // 四格純量，沒有不編輯的分支要原封帶走。
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
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/dispel.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。⭐ 反過來也成立：**這一頁就是線上唯一真的生效的地方** —— 平衡值要上線，在這裡改並存檔，⛔ 不是改那個檔案再 deploy。",
    "⭐ **「解除全部負面狀態」現在是真的**（owner 2026-08-18「理論上淨化就是解掉所有負面狀態阿」）：下面的「一發淨化每一池最多拔幾層」出貨值是 **50**，實務上等於不設限；**這一格最高填到 60**（owner 同一則的追加「上限改成 60, 後台可調」）。⛔ 這個數字不是「總共只有 26 種可淨化減益」那樣算出來的 —— 引擎是**一筆一筆**算的（同一種減速由 30 隻殭屍各掛一次就是 30 筆），所以筆數沒有種類數那個天花板。",
    "⭐ **想做一張連 [狂戰士]／[暴走] 這種正向增益也一起解掉的淨化？** 那是**逐張卡**的三格，不是這一頁的開關（這一頁只管「作者沒表態時的預設」）。在那一份技能／寶具的 dispel 效果上填：①「極性」＝ buff（只拔增益）或 any（正負一起拔），出貨預設是 debuff＝只拔減益；②「清哪幾池」把「增益來源」勾起來；③ 而**被拔的那一份增益自己也要同意** —— 它的 applyBuff 要填「可被驅散＝是」而且「極性＝buff」。三格缺一，勾了也一筆都不會掉，而且**畫面上跟正常一模一樣**（這是刻意的：沒有人預期自己買的裝備被敵人剝掉，所以「不知道」不當成「是」）。想讓所有沒表態的增益一律可拔，就是下面那格「沒標『可驅散』的增益來源算不算可拔」——⚠️ 那一格是全域的，打開之後**所有人的裝備被動**都變成可以被敵方淨化剝走。",
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
      note: "全域上限：文件沒寫層數時用它，**文件寫了也夾不過它**。一句話管到底，避免出現兩個會分歧的上限。⭐ **出貨 50＝實務上「全部」**（owner 2026-08-18「理論上淨化就是解掉所有負面狀態阿」），**這一格填得到 60**（同一則追加「上限改成 60, 後台可調」）—— 卡面寫「解除全部負面狀態」的那些技能，靠的就是這一格。填 1＝每發只解一層（很弱但很好懂）。⚠️ **調低它會讓卡面說謊**：好幾張卡的文案寫著「淨化全部可淨化的減益」，而引擎只會拔到你填的這個數字，多的**靜默消失**（⛔ 沒有任何東西會叫，也不會有任何測試變紅）。要做弱淨化請去那一份文件填層數，不要動這一格。",
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
  title: "場地環境：火焰、圓盤外背景與場景特色",
  intro: [
    "這一頁管的是同一份文件（`config/ambient-vfx`）裡的三件事：**場地環境火焰**（GH#251）、**圓盤外的 2D 景深背景**（GH#324）與**場景特色**（配色／會動的打光／裝飾散佈，GH#362）。⚠️ 它們合在一頁不是分類偷懶 —— 通用表單引擎是**整份文件存回去**的，同一份文件拆成兩頁會讓兩頁互相蓋掉對方的欄位。",
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
    {
      path: "scenery.enabled",
      zh: "場地要不要有各自的場景特色",
      note: "開（出貨值）＝ 每張場地用自己的地板／牆壁染色、自己的燈（而且**燈會動**）、自己那一組散佈裝飾；關＝ 13 張場地全部退回同一組灰石板配色加同一顆不會動的太陽，也就是 owner 2026-08-18 抱怨的那個樣子。⭐ 這一格是**一鍵 rollback**：整批換皮不喜歡就關掉，不必回滾一次部署。",
    },
    {
      path: "scenery.maxPropsPerZone",
      zh: "每個對戰分區最多長幾件特色裝飾",
      note: "地圖文件用「規則」描述裝飾（例如「沿著 0.9 倍半徑擺 18 根柱子」），這一格是展開出來的件數上限。每一件是一次模型實例化加一塊接觸陰影 —— 手機掉幀時先調這一格，比關掉整個功能溫和。40（出貨值）比出貨場地實際用量還高，所以現在一件都不會被砍；它擋的是作者一次填八條規則那種上千件的情況。⚠️ 砍的是**規則順序的後面**，所以地圖作者要把最能代表這張圖的規則寫在最前面。",
    },
    {
      path: "scenery.outlineShells",
      zh: "下載來的水晶布景要不要保留自帶的黑色描邊",
      note: "開（出貨值）＝ 維持今天畫面上的樣子。`content/assets/models/scenery-cc0/` 的 16 件水晶／斷牆／破甕（crystal-crossroads 那一系列）在原作者那邊是卡通描邊風格，每一件都多帶一層向外翻的黑色輪廓殼（材質名逐字叫 `Outliner_Mat`）；關＝ 只把那層殼藏起來，本體原封不動。⭐ 為什麼會是一格開關而不是直接決定：GGD 的英雄是平面著色的方塊人，**沒有描邊**，所以那 16 件站在場上會自帶一圈黑邊、跟旁邊的東西不同調 —— 這是喜好問題不是缺陷，所以選擇權留在這裡。⚠️ 順帶的效果是那 16 件的繪製呼叫會少掉大約一半（描邊殼是獨立的一份幾何），手機掉幀時關掉它比拿掉整批裝飾溫和。",
    },
    {
      path: "scenery.animateLights",
      zh: "場地的燈要不要真的會動",
      note: "開（出貨值）＝ 每張圖的光照它自己的波形變化（呼吸／搖曳／掃掠／雷雨），影子會轉、亮度會起伏；關＝ **保留**這張圖的燈光顏色與角度，但停在波形的起點，變回一盞不動的燈。⭐ 這一格單獨切掉「動」那一半是刻意的：對閃爍敏感的玩家要的是「留下配色、拿掉閃爍」，而不是連場景特色一起失去。",
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
    {
      path: "iconFillPct",
      zh: "道具圖示佔一格的百分比",
      note: "裝備欄／商店那一格方框裡，圖示自己佔掉幾成邊長。100＝填滿整格（出貨值）。⚠️ 這一格是為了修一個看得見的落差：商店裝備格是流動寬度（實測約 84px）而圖示的邊長寫死 38px，也就是只佔了 45%，於是格子裡有一大圈空白、圖案本身小到看不出是哪一件。調小＝圖示縮回格子中央、四周留白變多（想讓格線與數字更明顯時用）；調到 100＝圖示貼齊格子邊。⛔ 它不改格子本身的大小，也不改任何一件道具的效果。",
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
    { path: "spawn.minWallClearanceBodyRadii", zh: "⭐ 出生點離牆至少幾個身體半徑", note: "GH#364：owner 2026-08-18 的截圖裡，英雄生在**貼著外牆的一條窄走道**上，旁邊就是圖外，火圈在收 —— 只能等死。根因是產生器挑「最左／最右的可走格」，量到的離牆距離**七張圖全部是 1.00**（身體半徑 0.6 ⇒ 旁邊只剩 0.4，動不了）。出貨 3 ＝ 1.8 個單位 ＝ **你自己那 1 個半徑 + 旁邊還有一整個身體寬度可以側移**。⚠️ 用身體半徑而不是「內縮幾格」，是因為一格等於幾個單位本身就是上面那一格欄位 —— 寫成格數的話同一個設定在兩張圖上是兩個距離。⚠️ 調大它會讓合格的落點變少，圖太擠時產生器會**拒絕輸出**（那是刻意的，⛔ 不是靜靜地少給一個座位）。" },
    { path: "spawn.maxPocketPathFactor", zh: "⭐ 出生點到火圈口袋的路徑上限（× 分區半徑）", note: "從出生點**繞過牆走**到火圈「停止縮圈」那塊口袋，最遠可以走多少 —— 上限 = 這一格 × 分區半徑。⚠️ 是路徑長度，⛔ 不是直線距離：芙莉蓮的迷宮中央有一道貫穿的牆，直線 17.6 的座位實際要走 28。出貨 0.8 是**量出來的**：0.75 會把兩隊最近的一對座位壓到 28.0，而全遊戲最長的射程是 29.33（兩支天生技）—— 那等於開場就互相在射程內；0.8 的最近一對是 34.0，還在外面。往上調到 0.9 則幾乎擋不到出貨最糟的那張圖，一把只剩 1 個單位餘裕的尺等於沒有尺。" },
    { path: "nav.headroom", zh: "⭐ 通道淨空餘裕（× 最大身體直徑）", note: "場地上**任何一條路**至少要多寬 —— 門檻 = **最大身體直徑 × 這一格**。調高＝通道更寬、殭屍不會卡在牆縫裡，代價是場地更空曠、掩體更少；調低＝場地更緊湊，但胖一點的怪就會塞不過去。⭐ 最大身體半徑是**從出貨的殭屍波設定推導**的（今天是特殊殭屍 1.08），⛔ 不是寫死的公尺數 —— 你把 `special.radiusMult` 調胖，門檻自己跟著長，⛔ 不必有人記得回來改地圖。出貨 1.5 ⇒ 門檻 3.24 單位 ＝ 特殊殭屍走過去**兩側各還剩半個身體**。⚠️ owner 2026-08-19：「地圖路徑**缺口大一點 不要那麼小氣** 導致**來回測量修改**」—— GH#387（中央牆把場地切成兩半）與 GH#388（柱環死路口袋）修完的餘裕只有 0.92 / 0.43 單位，而那一格每週在動，所以這一格存在的理由是**不用再回頭量一次**。填 1 = 「剛好塞得下」＝ 等於關掉這把尺。⚠️ 調高之後有些場地會不合格（守衛會指名是哪一張、切成幾塊），那時要改的是**那張圖的幾何**，⛔ 不是把這一格調回去。" },
    { path: "nav.minSpawnRoomBodyRadii", zh: "⭐ 生成點的活動空間下限（× 身體半徑）", note: "GH#398：一隻剛生出來的殭屍，至少要能往某個方向**直線走掉幾個自己的半徑**。⚠️ 它與上面那一格是**兩件事**：上面問「這條路夠不夠寬」（一條通道的性質），這一格問「**這一個落點**離不離得開」（一個點的性質）——一張通道全部合格的圖照樣可以把殭屍生在牆與石頭之間的縫裡。出貨 1 是**量出來的**，不是挑順眼的：13 張圖 × 每區 × 三種身體 × 12 個方向 = 900 個生成點，分佈是**雙峰**且中間全空 —— 4 個只有 **0.31**（`arena.dota` 的殭屍**王**，卡在 r=2.1 的石頭與外牆之間 0.28 單位，那正是「某些殭屍站著不動」），其餘 896 個全部 ≥ **2.00**。填 1 落在空隙正中央，兩邊各留 3 倍餘裕。⚠️ 調高會讓更多落點被判不合格 —— 生成搜尋會往旁邊挪（⛔ 不是把殭屍倒在場中央），太高則每一張圖都擠不下。⚠️ 這一格調的是**驗收標準**（守衛擋不擋得下一張新圖），與 `通道淨空餘裕` 一樣在 runtime 一行都沒讀；runtime 用的是同一個常數的出貨值，⛔ 刻意不讓後台把它調成 0。" },
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

// ── 戰鬥鏡頭（config/camera）—— GH#332 ─────────────────────────────────────
const CAMERA_SPEC: ConfigDocSpec = {
  page: "camera",
  collection: "config",
  docId: "camera",
  schemaTag: "config.camera@1",
  zod: zConfigCameraDoc,
  title: "戰鬥鏡頭",
  intro: [
    "⭐ owner 2026-08-18（GH#361）：「**預設視角是偏低離地板太近**（預設應該是**離地板最高**，可縮放離地板更近），但**可以縮放最高的視角太高了，至少要砍低一半高度**」",
    "⇒ 兩件事：① 「開局預設鏡頭」變成**自己的一格**（以前它等於「最近視野」），出貨值＝「最遠視野」，也就是**一進場就離地板最高**；② 「最遠視野」36 → **18**，眼高從 33.4 砍到 16.7 單位（正好一半，那是 owner 要的**下限** —— 還嫌高就把這一格再往下調）。",
    "⚠️ **這是推翻 #31a 的設計改版，不是修 bug。** #31a 當時要「預設＝最近」，記下來的理由只有一句「**讓角色在畫面上盡可能大**」—— owner 2026-08-18 判定那個取捨換來的「離地板太近」更難忍受。**一鍵 rollback**：把「開局預設鏡頭」填成跟「最近視野」一樣的數字，就完全回到舊行為。",
    "⭐ 前一輪 owner 2026-08-15：「最大視野減少兩節(滑鼠滾輪)」。**「一節」不是一個單位，是一個換算**：瀏覽器滾一格的 `deltaY` 是 100–120，乘上「一單位滾輪推多少」（出貨 0.02）≈ 一節 2.0–2.4。",
    "⚠️ 在這一頁出現之前這些數字**全部寫死在 client 的 CameraRig.ts**，而它們已經被改過四次 —— 每一次都是一輪 client rebuild + 一次完整部署。現在存檔就生效（客戶端重新載入 bundle 之後）。",
    "⛔ **這一頁不管俯角。** 68° 是從遮擋安全推出來的幾何線（道具高度上限 2.4 單位是照那個角度算的），⛔ 不是一格可以隨手拉的滑桿。",
  ],
  consumer: "apps/client/src/render/CameraRig.ts 的 cameraLimits()（開局預設鏡頭、滾輪與陣亡觀戰的夾限）",
  effect: "客戶端重新載入 bundle 之後生效；⛔ 不需要重啟 game-server（鏡頭純粹是客戶端的事）。",
  fields: [
    { path: "zoom.minDolly", zh: "最近視野（玩家滾輪能拉到的最貼地）", note: "滾輪能推到多近，單位是鏡頭到角色的距離。⛔ **它已經不是開局預設了**（GH#361 之前是）—— 預設改成下面那一格。所以現在調它只影響「玩家最多能拉多近」。⚠️ 下界 4：再近鏡頭會穿進角色身體裡（EX 演出用的特寫是 5，那是刻意的例外，不受這一格管）。",
    },
    { path: "zoom.defaultDolly", zh: "⭐ 開局預設鏡頭（GH#361：出貨＝離地板最高）", note: "每一場**一進場**時鏡頭離角色多遠。出貨 18 ＝ 跟「最遠視野」一樣，也就是 owner 要的「**預設離地板最高，玩家再自己縮放拉近**」。⭐ **一鍵 rollback**：填成跟「最近視野」一樣的數字（出貨 10）就完全回到 #31a 的舊行為（一進場就貼著角色）。⚠️ 它**必須落在「最近視野」與「最遠視野」之間**，否則存檔會被擋下來 —— 落在區間外的預設會在進場當下被夾回端點，於是後台顯示的數字跟遊戲裡的不是同一個。⚠️ 這一格也決定手把 R3 縮放圈往哪個方向走：預設在最遠端時 R3 一節一節**往內**推，預設在最近端時**往外**拉，最後一下都是歸位。",
    },
    { path: "zoom.maxDolly", zh: "最遠視野（GH#361 砍了一半的就是這一格）", note: "滾輪能拉到多遠，同時也是出貨的**開局預設**。出貨 18 ＝ 原本 36 的一半（owner 2026-08-18「可以縮放最高的視角太高了，至少要砍低一半高度」；眼高 = 距離 × sin68°，所以 33.4 → 16.7 單位）。⭐ 那是他要求的**下限** —— 還嫌高就繼續往下調，⚠️ 但記得「開局預設鏡頭」如果比它大會被擋下來，兩格要一起調。⚠️ 上界 120 不是裝飾：拉遠等於把整個競技場塞進同樣多的像素，角色會小到分不出誰是誰 —— 而 24×18 的場地對角線本來就只有 30 單位左右。",
    },
    { path: "zoom.maxDollyDead", zh: "陣亡觀戰時的最遠視野", note: "死掉之後看整場用的。刻意比上面那格寬很多（出貨 90 對 18），因為觀戰時要看的是「這一場打成怎樣」而不是自己的操作。⚠️ GH#361 砍的是**活著**的最遠視野，這一格**刻意沒有跟著砍** —— 觀戰本來就是要看全場。覺得死掉之後拉太遠就調這一格。⚠️ 它**不可以小於**最遠視野 —— 存檔時會被擋下來，理由是那會讓「死了以後視野反而變窄」。",
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

// ────────────────────────────────────────────────── 混音 (config/audio-mix) ─

const AUDIO_MIX_SPEC: ConfigDocSpec = {
  page: "audioMix",
  collection: "config",
  docId: "audio-mix",
  schemaTag: "config.audio-mix@1",
  zod: zConfigAudioMixDoc,
  title: "混音",
  intro: [
    "⭐ owner 2026-08-17：「**其他角色語音應該是自己的一半**」。這一頁就是那個比例。",
    "⚠️ 它**疊在**空間化衰減之上，不取代它：遠處的敵人本來就比較小聲，這一格是把「不是我」那一整族（敵人／隊友／小怪）整體再壓下去。所以調它不會讓遠近的差別消失。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/audio-mix.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "apps/client/src/audio/voiceAudience.ts 的「其他角色」音量（文件由 ContentDb 載入時餵進去；接線本身屬於 #339 那一條 lane，這一頁只負責讓它可調）",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時才讀內容覆蓋層）。⛔ 不需要重啟 game-server —— 語音整段活在客戶端。",
  fields: [
    {
      path: "voice.othersGain",
      zh: "其他角色的語音音量（相對於自己）",
      note: "敵人、隊友與小怪講話時，相對於**你自己的角色**要多大聲。0.5＝一半（出貨值，owner 2026-08-17 的原話）；1＝跟自己一樣大聲，也就是這一格出現之前的行為，所以填 1 就是一鍵 rollback；0＝其他人完全不出聲（⚠️ 那會讓「我打中了」這個用耳朵接收的回饋整個消失，不建議）。調小＝自己的角色更聽得清楚，代價是一場團戰聽起來比較空。",
    },
  ],
  preserved: [],
};

// ───────────────────────────────────────────── 練習模式 (config/practice) ─

const PRACTICE_SPEC: ConfigDocSpec = {
  page: "practice",
  collection: "config",
  docId: "practice",
  schemaTag: "config.practice@1",
  zod: zConfigPracticeDoc,
  title: "練習模式",
  intro: [
    "⭐ owner 2026-08-17：「新增練習模式，可以選擇場地及角色，但**進入不會有對戰**，可以使用各種功能測試碼，以及**即時生成殭屍**等特殊單位」。這一頁是那間沙盒房的五格規則。",
    "⚠️ 練習房是**單人沙盒**：沒有敵隊、不結算、⛔ 不發水晶、⛔ 不動 MMR、⛔ 不寫任何玩家資料。正因為它對經濟與排名零影響，「在練習房裡開放測試碼」才不是經濟漏洞。",
    "⚠️ 這一頁**不影響任何一場正式比賽** —— 一間房要先被開成練習房才會讀到這份文件。要整個關掉就把總開關關掉，那就是一鍵 rollback。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/practice.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/game-server/src/match/MatchController.ts（相位機不配對手／不結束、火圈與自動復活）與 apps/game-server/src/match/cheatGate.ts（練習房開放測試碼）",
  effect: "**要重啟 game-server shard 才生效**。和 冷卻規則／減傷規則 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "練習模式總開關",
      note: "關掉之後，大廳按了練習模式也只會開出一間**普通的房**（有對手、時間到就結算、測試碼照舊只在 dev 開）——也就是這個功能出現之前的行為，所以它就是一鍵 rollback。",
    },
    {
      path: "endlessCombat",
      zh: "戰鬥階段永不結束",
      note: "開著（出貨值）＝ 進去就一直待在場上，⛔ 不會因為時間到或場上只剩一隊被踢回商店 —— 這是「進入不會有對戰」那句話真正的機制。關掉＝照正常回合流程跑（沒有對手所以幾乎立刻進中場），適合拿來測商店與三選一的接線。",
    },
    {
      path: "autoMobWaves",
      zh: "自動殭屍波",
      note: "關掉（出貨值）＝ 場上乾淨，殭屍**只由測試碼的生怪指令**產生，所以要看一隻特定的怪不會被一整波蓋掉。開著＝連波次排程一起跑，用來看「一波一波湧進來」在這張場地上長什麼樣子。⚠️ 兩種模式下生怪指令都能用。",
    },
    {
      path: "fireRing",
      zh: "火圈",
      note: "關掉（出貨值）＝ 不燒。練習房沒有「把回合逼到結束」這件事要做，而一個會慢慢燒死你的沙盒沒辦法拿來慢慢看特效。開著＝照這張場地的火圈設定走，用來確認縮圈半徑與燒傷節奏。",
    },
    {
      path: "autoRevive",
      zh: "自動復活",
      note: "開著（出貨值）＝ 倒下的下一 tick 就滿血站起來，所以被自己召來的殭屍王打死不會讓整場練習卡住。關掉＝照正常規則（要隊友來復活圈救，而練習房沒有隊友），適合拿來測死亡表演與觀戰畫面。",
    },
    {
      path: "spawnBatch",
      zh: "生怪指令的預設數量",
      note: "測試碼按一次生怪、又**沒有指定數量**時，一次生幾隻。⚠️ 它是預設值不是上限：真正的天花板是小怪波設定的「每區同時存活上限」，生怪撞到就停，所以這一格調大不會讓練習房被自己生出來的怪淹掉。",
    },
  ],
  preserved: [],
};

// ─────────────────────────────────────────── 排名獎勵 (config/ranking) ─

const RANKING_SPEC: ConfigDocSpec = {
  page: "ranking",
  collection: "config",
  docId: "ranking",
  schemaTag: "config.ranking@1",
  zod: zConfigRankingDoc,
  title: "排名獎勵",
  intro: [
    "⭐ owner 2026-08-17：「**MMR 倍率跟賽季積分也是類似的規則**，獎勵大家多打真人賽，並且**真實記錄 vs 特定玩家的幾勝幾敗**來影響 MMR & 賽季積分」。這一頁就是那兩件事的全部參數。",
    "⚠️ 這一組真人倍率與**藍水晶那一組是分開的兩份**（可以各自調，出貨值刻意一致）：operator 想加碼經濟獎勵而不動排名、或反過來，都不該被迫連動。要改水晶那一半請去 商店經濟。",
    "⭐ **賽季積分吃滿倍率、MMR 只吃 5%**，這是設計判斷不是做一半：Elo 是一個**收斂到真實實力的估計值**，直接乘 13 會讓排名劇烈震盪，而且**打一場 bot 局就把它拉回去**（bot 局倍率是 1，同一個實力估計被兩種尺度輪流拉扯，估得更差）。想讓 MMR 也吃滿就把「MMR 吃多少倍率」調到 100。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ranking.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "apps/platform/internal/ranking/standingsoverride.go 的 StandingsRulesNow()（每一場結算重讀覆蓋層）→ standings.go 的 SeasonPointsMulPct / RatingKMulPct / RivalryTotalPct",
  effect:
    "**存檔就生效，下一場結算就是新規則。** ⛔ 不需要重啟任何東西 —— platform 在每一場結算的當下重讀覆蓋層（⚠️ 和 M幣 那一段不一樣，那一段要重啟）。",
  fields: [
    {
      path: "humanMultiplier.minHumans",
      zh: "真人門檻（幾人才算真人賽）",
      note: "**整場**至少要有幾個真人，這一場才拿得到倍率；沒到門檻倍率就是 1，賽季積分與 MMR 都照原本的量走。⚠️ 數的是整場**不分陣營**（owner:「不論哪個陣營」），⛔ 不是自己這一隊 —— 所以一個人帶一個朋友進來就開得起加成。調到 1＝連單人 bot 局都算真人賽，那會讓刷 bot 局變成最有效率的爬分路線。",
    },
    {
      path: "humanMultiplier.offset",
      zh: "倍率加成（真人數 + 這一格）",
      note: "倍率 = 真人數 **+ 這一格**。2 個真人 × 出貨 1 ⇒ 3 倍，12 人滿房 ⇒ 13 倍（owner 的原話）。調到 0＝倍率就等於真人數本身（2 人只有 2 倍）。⚠️ 它把**每一級**都往上推，動的是整條曲線的高度不是只有起點。",
    },
    {
      path: "humanMultiplier.maxMultiplier",
      zh: "倍率上限",
      note: "倍率的天花板（出貨 13 = 12 人滿房 +1）。⚠️ 它是**保險絲**：房間人數上限哪天變大時，沒有這一格就會讓一場的產出跟著人數無限長。調低＝滿房與半房的差別被抹平，多找人一起打的誘因跟著消失。",
    },
    {
      path: "share.seasonPointsPct",
      zh: "賽季積分吃多少倍率",
      note: "賽季積分（含每位英雄的積分）吃多少真人倍率。100（出貨值）＝ 吃滿，13 倍的房就是 13 倍的名次分；50＝只吃一半的增幅；0＝賽季積分完全不理會真人數。⚠️ 只放大**正的**名次分 —— 把 −30 的懲罰乘 13 不是獎勵，而 owner 那句話是「獎勵大家多打真人賽」。",
    },
    {
      path: "share.ratingPct",
      zh: "MMR 吃多少倍率",
      note: "MMR（Elo）的 K 值吃多少增幅，出貨 **25** —— 13 倍的房讓 K 變成 4 倍，再由下面那格夾在 3 倍。⭐ 刻意不吃滿：Elo 是**收斂到真實實力的估計值**，把一場的變動乘 13 會讓排名劇烈震盪。真人賽該多算的那一半，主力交給下面的「bot 局 MMR 折扣」去**縮小 bot 賽**，而不是無限放大真人賽。調到 100＝ MMR 也吃滿倍率（排名會很暴力）；0＝ MMR 完全不受真人數影響，只剩宿敵加成。",
    },
    {
      path: "share.ratingMaxPct",
      zh: "MMR 單場變動上限",
      note: "Elo 的 K 值最多變成原本的百分之幾（出貨 300 = 3 倍）。⚠️ **宿敵加成也算在這個天花板裡**，所以它是「一場最多能撼動排名多少」的單一保險絲。100＝完全不放大，也就是排名側的加成整個關掉。",
    },
    {
      path: "share.botKPct",
      zh: "bot 局 MMR 折扣",
      note: "**純 bot 局**（真人數沒到「最少真人數」）的 Elo K 值只算百分之幾，出貨 **40**。⭐ owner 2026-08-17：「bot AI 的行為模式太容易被克制，並沒有太高的鑑別度」——一場 bot 局**資訊量低**，本來就該少移動排名一點。⚠️ 這是 Elo 的 K 本來的語意（這一場有多值得相信），⛔ 不是懲罰。0＝ bot 局完全不動 MMR；100＝ bot 局跟真人局一樣重（這一格關掉）。⛔ 只影響 MMR，**不影響**水晶、賽季積分與英雄積分。",
    },
    {
      path: "rivalry.basePct",
      zh: "宿敵加成・基礎值",
      note: "勝負持平、而且**初次交手**時，打贏這個對手額外拿到的百分比。它是整條曲線的高度，下面兩格都是從這個數字往下折。0＝整個宿敵系統關掉，也就是這個功能出現之前的行為（一鍵 rollback）。",
    },
    {
      path: "rivalry.halfLife",
      zh: "宿敵加成・淨勝衰減",
      note: "對這個人的**淨勝場**每增加大約這麼多，加成砍半。出貨 3 ⇒ 贏一個過去把你打爆的對手加成最高，而重複輾壓同一個人時淨勝一路上升、加成一路掉。調大＝加成掉得慢，輾壓同一個人比較久還有賺頭。",
    },
    {
      path: "rivalry.repeatHalfLife",
      zh: "宿敵加成・重複對戰衰減（反刷分）",
      note: "⭐ **這一格是反刷分的閘**：這一對**打過的總場數**每增加大約這麼多，加成砍半 —— ⛔ 不管勝負怎麼分。⚠️ 少了它，兩個帳號輪流讓對方贏就能把**淨勝永遠壓在 0**，於是上一格永遠不生效、加成永遠是滿的。有了它之後，同一對帳號打得越多這條路的產出越接近零，**跟不同的人打**才拿得到加成。調大＝互餵分的窗口變寬，⛔ 調大之前先想清楚這一點。",
    },
    {
      path: "rivalry.maxPct",
      zh: "宿敵加成・單場總上限",
      note: "一場之內**所有**被打敗的對手的宿敵加成加起來的上限（單一對手也吃這個上限）。它擋的是「一場打贏六個宿敵」把加成疊成天文數字。⚠️ MMR 那一側還要再吃一次上面的「MMR 單場變動上限」，賽季積分那一側只吃這一格。",
    },
  ],
  preserved: [],
};

// ─────────────────────────────────────── 圖示畫風 (config/icon-style) ─

const ICON_STYLE_SPEC: ConfigDocSpec = {
  page: "iconStyle",
  collection: "config",
  docId: "icon-style",
  schemaTag: "config.icon-style@1",
  zod: zConfigIconStyleDoc,
  title: "圖示畫風",
  intro: [
    "⭐ owner 2026-08-17：圖示要**地端生成**，兩階段 ——「第一階段生成**特徵**，第二階段生成**風格（日本 2D RPG）**，精緻但**不要過度花俏複雜**的顏色內容」。這一頁就是**第二階段**那一段風格，以及兩階段共用的取樣火候。",
    "⚠️⚠️ **這一頁跟其他每一頁的生效時機都不一樣。** 別的設定是遊戲執行時讀的，改了下一場就不同；這一份是**產圖那台機器**讀的 —— 它只在**下一次跑產圖時生效，⛔ 不影響任何一張已經產出的圖**。改完之後畫面上不會有任何變化，要重跑產圖（`python3 tools/icon-gen/local/batch.py --force`）才看得到差別。",
    "⚠️ 第一階段畫的是**「這張圖畫的是什麼」**（哪一位英雄、哪一張聖杯願望），那份特徵表住在 `tools/icon-gen/local/keywords.py`，⛔ 不在這一頁。這一頁只管**畫風**。兩者分開是刻意的：把風格詞寫進第一階段，主體會被塗成一團看不出是什麼的東西 —— 那正是兩階段當初要修的缺陷。",
    "⚠️⚠️ **要在跑產圖的那台機器上改這一頁。** 產圖器讀的是 repo 裡的 `content/config/icon-style.json`；在**線上** admin 存檔寫的是伺服器 `data/` 的耐久覆蓋層，⛔ 那份覆蓋層不會回到任何人的工作區，所以線上改完再去本機跑產圖，畫出來的還是舊風格。在 localhost 的後台／編輯器改就沒這個問題（那條路直接寫 repo 檔案）。",
  ],
  consumer:
    "tools/icon-gen/local/keywords.py 的 load_icon_style() → pass2_prompt()（風格與負向提示詞）與 batch.py 的取樣參數預設值（strength / 步數 / CFG / 邊長）",
  effect:
    "**下一次跑產圖時生效，⛔ 不影響已經產出的圖。** 遊戲端、game-server 都不讀這份文件，所以⛔ 不需要重啟任何東西。",
  fields: [
    {
      path: "stylePrompt",
      zh: "風格提示詞（第二階段·正向）",
      note: "整張圖的畫風就是這一段。出貨值把 owner 的原話落成可畫的詞：日本 2D RPG 手繪選單插畫、清楚的墨線輪廓、兩階柔和賽璐璐上色、**約四色的限制色盤**、自然不刺眼的色調、單一主體置中。⛔ 不要在這裡寫「畫什麼」（角色、武器、火焰）—— 那會把每一張圖都拉向同一個主體，也就是兩階段當初要修的缺陷。",
    },
    {
      path: "negativePrompt",
      zh: "排除提示詞（第二階段·負向）",
      note: "明著不要的東西。除了老三樣（文字／浮水印／邊框／畸形）之外，出貨值特別排除**霓虹 · 過飽和 · 彩虹漸層 · 過度發光 · 雜亂細節** —— 那幾個字就是「過度花俏複雜的顏色」的機器版本。⚠️ 這裡多寫一個詞的代價是**那個東西整批消失**，所以只放**風格**詞：寫 `fire` 會讓所有火焰技能的圖示一起沒有火。",
    },
    {
      path: "strength",
      zh: "風格覆蓋強度",
      note: "第二階段被允許把第一階段那張圖改掉多少。出貨 0.58 ——「保留得住主體、又真的換得掉畫風」的實測落點（0.45 量到的結果是畫風根本沒套上去，出來的是打光漂亮的 3D 產品照）。調高 → 畫風更統一，但**主體會開始被塗掉**（0.8 以上幾乎等於重畫一張新圖，看不出是哪一招）；調低 → 主體很安全，但風格幾乎沒套上去，看起來還是半成品。這一格是這一頁最值得先試的旋鈕。",
    },
    {
      path: "pass1Steps",
      zh: "第一階段步數（特徵）",
      note: "決定「看不看得出畫的是什麼」，所以它是**辨識度**的旋鈕。出貨 26。往下調省時間但輪廓會糊；往上調到 40 以上幾乎看不出差別，只是讓全量那一批多跑好幾分鐘。",
    },
    {
      path: "pass1Guidance",
      zh: "第一階段有多聽話（CFG）",
      note: "出貨 7.5。調高＝更貼特徵描述，代價是構圖僵硬、顏色容易燒；調低＝更自然，但常常畫出描述以外的東西 —— 三選一同時出三張時「根本分不出哪張是哪張」多半是從這裡開始的。",
    },
    {
      path: "pass2Steps",
      zh: "第二階段步數（風格）",
      note: "出貨 30。⚠️ 它跟「風格覆蓋強度」**相乘**才是真正的工作量（第二階段只跑 strength 那一段），所以兩格一起調大，時間是相乘不是相加的。",
    },
    {
      path: "pass2Guidance",
      zh: "第二階段有多聽話（CFG）",
      note: "出貨 7.0。**這一格對「顏色會不會太花」最敏感**：調高會把畫風推向高飽和的動漫海報（＝ owner 明說不要的那一種），想更收斂就往 6～7 調，通常比改文字提示詞有效。",
    },
    {
      path: "size",
      zh: "存檔邊長（像素）",
      note: "出貨 128。全 app 最大的使用面是登入頁跑馬燈的 54 CSS px（DPR 2 ＝ 108 裝置像素），128 已經超取樣。⚠️ 模型一律在**模型自己的原生邊長**（SD1.5 512／SDXL 1024）算完再縮，所以這一格**不影響產圖時間**，只影響檔案大小與放大時的銳利度。",
    },
  ],
  preserved: [
    {
      path: "loras",
      why: "⭐ GH#457 掛在產圖模型上的 **LoRA 清單**（`[{path, weight}]`，路徑相對於 `tools/icon-gen/models/`）。**這一頁畫不出它** —— 通用走訪器只長得出純量欄位，`{路徑, 強度}` 的陣列一律歸成不編輯的分支，所以它走「原封不動帶著走」這條路：⛔ 掉了的話下一次產圖會**整批換一個畫風**，而畫面上完全看不出來（`content/config/icon-style.json` 裡它就消失了）。要改它請直接改那份 JSON，或用 localhost 的內容編輯器。⚠️ 順帶：LoRA 檔本身是 gitignore 的本機檔，所以在**線上** admin 填一個路徑一定是空的 —— 那也是這一格不做成輸入框的第二個理由。",
    },
  ],
};

const DISPLACEMENT_TIERS_SPEC: ConfigDocSpec = {
  page: "displacementTiers",
  collection: "config",
  docId: "displacement-tiers",
  schemaTag: "config.displacement-tiers@1",
  zod: zConfigDisplacementTiersDoc,
  title: "位移級距",
  intro: [
    "位移距離走**五級距**（極小/小/中/大/極大），⛔ 技能不再寫死距離數字 —— 和 AoE 級距、施法距離級距、冷卻規則同一個形態。",
    "⭐ owner 2026-08-19：「將技能相關設定**正規化成五級距**，並且將相關**文件 JSON 編輯器 後台設定 都統一**」，而他指名的五個字是「**極小 小 中 大 極大**」。⛔ **沒有「超大」這一級**：GH#463 之前這一頁與 AoE 那一頁的第四格是兩個不同的名字，統一時我一度挑了他 08-11 的四級舊詞彙（小/中/大/超大），已經改回來 —— 現在兩張表逐字共用 `SKILL_TIER_NAMES`。⚠️ 那次改名**值一格都沒動**，只有名字整體左移一格。",
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
    // ⛔ 級距名從 `SKILL_TIER_NAMES` 來，⛔ 不在這裡重打一組 —— 重打就是第二個
    //    住處，而它會在下一次改級距數的時候安靜地漏掉一格。
    ...SKILL_TIER_NAMES.flatMap((tier) => [
      { path: `travel.${tier}.distance`, zh: `衝刺 · ${tier} · 距離`, note: `自己位移（衝刺類）在「${tier}」這一格走多遠。⚠️ 改它會同時影響**每一支**填了這個級別的技能。` },
      { path: `travel.${tier}.speed`, zh: `衝刺 · ${tier} · 速度`, note: `每秒幾單位。⚠️ 這是安全欄位：超過上限會被「夾住位移速度」那一格截掉，⛔ 不是拿來調手感的。` },
      { path: `push.${tier}.distance`, zh: `擊退 · ${tier} · 距離`, note: `被別人推（擊退類）在「${tier}」這一格推多遠。⚠️ 與衝刺是**兩條獨立的梯子**，改這裡不影響衝刺。` },
      { path: `push.${tier}.speed`, zh: `擊退 · ${tier} · 速度`, note: `每秒幾單位。⚠️ 同衝刺那一欄：這是**安全欄位不是手感欄位**，超過上限會被「夾住位移速度」截掉。` },
    ]),
  ],
  preserved: [],
};

// ───────────────────────────────────── 介面用語 (config/ui-lexicon) ─

const UI_LEXICON_SPEC: ConfigDocSpec = {
  page: "uiLexicon",
  collection: "config",
  docId: "ui-lexicon",
  schemaTag: "config.ui-lexicon@1",
  zod: zConfigUiLexiconDoc,
  title: "介面用語（Fate）",
  intro: [
    "玩家在抽卡畫面與商店看到的那幾個 Fate 用語。owner 2026-08-16：「記得這些替換的介面提示等用語，應該是一個 JSON 檔，可以在後台替換設定」。",
    "⛔ 它只管「叫什麼」，不管「做什麼」。後台與 augment@1 的 silver / gold / prismatic 一個字都沒動，改這裡不會動到任何一份技能、道具或武器內容。",
    "⛔ 迴避／格擋／彈反／淨化／復活這一族的機制詞**刻意不在這一頁**（規則 §5：不能為了 Fate 味犧牲可讀性）。要改那些字得改程式。",
  ],
  consumer:
    "apps/client/src/content/ContentDb.ts 的 applyUiLexiconDoc() → apps/client/src/ui/panels/fateLexicon.ts 的每一個讀取函式 → 抽卡面板標頭／提示、武器卡片、商店回絕訊息",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時才讀內容覆蓋層）。已經開著的抽卡面板不會中途換字。",
  fields: [
    {
      path: "grail.systemName",
      zh: "聖杯願望・系統名",
      note: "每回合抽增益卡時，面板正中央那四個字。⛔ 玩家端只看得到這個，「三選一」是內部說法。填空字串存不進去（schema 下限 1 字）。",
    },
    {
      path: "grail.prompt",
      zh: "聖杯願望・面板提示",
      note: "系統名下面那一行。⚠️ 它要同時講「這是什麼」與「選完會怎樣」—— 只寫世界觀的話，第一次玩的人不知道選完才能繼續逛商店。",
    },
    {
      path: "grail.inscribeVerb",
      zh: "聖杯願望・選取動詞",
      note: "「已○○○○」那一句的動詞（出貨「刻入靈基」）。玩家不是「獲得一張卡」。⚠️ 目前只有選完的提示句在用它。",
    },
    {
      path: "grail.inscriptionsTitle",
      zh: "聖杯願望・已選列表標題",
      note: "列出這一場已經刻進去的願望時的標題（出貨「靈基刻印」）。⚠️ 那個面板還沒做，改這一格現在畫面上看不到變化。",
    },
    {
      path: "noblePhantasm.systemName",
      zh: "寶具・系統名",
      note: "抽傳說武器時面板標頭的後綴（出貨「寶具顯現」）。⛔ 不要填成聖杯那一組的字 —— 武器是裝備層，混在一起會讓玩家以為武器也在改遊戲規則。",
    },
    {
      path: "noblePhantasm.defaultRank",
      zh: "寶具・預設 Rank",
      note: "每張武器卡左邊那兩個字（出貨 EX，因為目前開放的武器都是 EX 等級）。四個字以內，太長會把卡片撐開。",
    },
    {
      path: "noblePhantasm.defaultClass",
      zh: "寶具・預設種別",
      note: "沒有在逐把對照表裡指定的武器算哪一種（出貨「對人」＝效果集中，最保守）。⚠️ 種別是**規模**不是強弱 —— 對人寶具不代表弱。",
    },
  ],
  preserved: [
    {
      path: "grail.ranks",
      why: "silver / gold / prismatic → C／A／EX 級願望的對照。⛔ 通用引擎沒有「自由文字 record」這種欄位型別（它只畫固定形狀的純量葉，以及值是 enum 的對照表），硬塞會變成一格連鍵都能打錯的文字框，而打錯鍵的後果是那一階**靜靜地退回英文 tier**。要改先走 內容管理 的 JSON 編輯器。⚠️ 通用引擎長出自由文字 record 欄位的那一天，這四列都該搬進 fields。",
    },
    {
      path: "noblePhantasm.classNames",
      why: "11 種寶具種別的中文全名（對軍 → 對軍寶具）。同上：自由文字 record。",
    },
    {
      path: "noblePhantasm.itemClass",
      why: "逐把武器的種別覆寫。⚠️ 這是 owner 最會改的一張表（種別是設計判斷），但它同樣是自由文字 record —— 通用引擎畫不了，先走 內容管理 的 JSON 編輯器。⭐ 把值改成 Zod enum 之後就能用 recordEnum 表格畫出來，那是這一列的到期條件。",
    },
    {
      path: "shopLines",
      why: "三條商店回絕訊息的 Fate 版。同上：自由文字 record，通用引擎畫不了。⚠️ 鍵必須與 shopFeedback.ts 的 ShopEventReason 一致，打錯鍵不會報錯、只是那一條永遠不會被用到 —— 這正是它現在不適合放進一格自由輸入框的理由。",
    },
  ],
};

// ────────────────────────────── 範圍指引與預告 (config/range-guide) ─────────

const RANGE_GUIDE_SPEC: ConfigDocSpec = {
  page: "rangeGuide",
  collection: "config",
  docId: "range-guide",
  schemaTag: "config.range-guide@1",
  zod: zConfigRangeGuideDoc,
  title: "範圍指引與預告",
  intro: [
    "owner 2026-08-18（GH#367）：「技能缺乏範圍指引（可參考 LoL 的新手模式與教學），理論上**按著技能按鈕或 hover 時**要能顯示可施展的範圍才對（**特殊顏色框框 + 顏色半透明填滿**）」。這一頁上半就是那兩個圈。",
    "下半是 #228 的**地面預告**：別人（或你自己）起手一個技能時，畫在地板上那一圈警告。它分三條通道 —— 自己放的、隊友放的、打向你的 —— 而「怎麼一眼分出來」是這一頁真正的問題。",
    "⚠️ **兩半在同一頁是刻意的，因為它們互相定義。** 「自己」的預告出貨顏色就是上半那個命中範圍圈的琥珀（自己的預告要和剛剛瞄準的那一圈連續），「來襲」的紅則刻意離兩組預覽色都很遠。分成兩頁的話，調了一邊忘了另一邊的那一天不會有任何東西提醒你。",
    "⚠️ **不要只靠顏色分辨自己與來襲。** 觀戰死亡時整個畫面會去飽和（#85），色盲玩家也讀不到色相 —— 所以每條通道另外還有三個非色相載體：填滿色、不透明度、虛線、脈動。動顏色的時候請至少留一個非顏色的差異。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/range-guide.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/rangeGuideConfig.ts 的 applyRangeGuideDoc()（由 ContentDb.load 呼叫）→ rangeGuide() 被 ui/abilityRangeGuide.ts 的 hover 計時器與 render/AimIndicator.ts 的 paintCircle() 讀走畫那兩個圈，telegraph 那一半由同一支推進 vfx/telegraphChannel.ts 的 applyTelegraphChannelStyles()，再由 paletteFor() 交給 TelegraphLayer 畫地面預告",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。已經畫在地上的圈不會中途換色。",
  fields: [
    {
      path: "hoverDelayMs",
      zh: "滑過技能圖示幾毫秒才浮出範圍圈",
      note: "⚠️ 不可以是 0：技能列是六格緊鄰的按鈕，游標從畫面一端掃到另一端會**依序**經過全部六格，零延遲＝地板上連閃六個圈。出貨 140 短到「我停下來看」仍然像即時，長到「路過」不會觸發（和一般 tooltip 的 ~150 同一個量級）。調大＝要停更久才看得到，對手殘的玩家會以為功能壞了。",
    },
    {
      path: "hoverOpensBanner",
      zh: "滑過也打開頂端的說明橫幅",
      note: "出貨**關**：滑過只出地板範圍圈，橫幅留給真的按下去（滑鼠按住／手指／手把／按住 QWERF D）。理由是技能格自己**本來就有** anchored tooltip 在講同一段文字，開著的話同一段字會在畫面上出現兩次，而且游標掃過技能列時橫幅會閃六次。開起來＝滑過就看得到完整說明，適合教學／新手場，代價就是上面那個閃爍。",
    },
    {
      path: "rangeColor",
      zh: "施法距離圈的顏色",
      note: "外面那個大圈 —— 回答「我打得到多遠」。出貨 #73BFFF 藍，刻意和命中範圍圈的琥珀分開：兩個圈同時畫在腳下，同色系的話玩家分不出哪一圈是射程、哪一圈是會被炸到的範圍。⚠️ 也不要換成接近隊伍色的顏色，會被讀成隊伍標示。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "rangeFillAlpha",
      zh: "距離圈的填滿濃度",
      note: "出貨 0.09 刻意很淡：這個圈是**整個施法距離**（大技能十幾個單位直徑），填太濃會把腳下的地板、屍體、掉落物全部染成一片藍，反而看不到要打誰。0＝只剩一圈框（想要最乾淨畫面的人選這個），往上調＝範圍更好判斷但場面更髒。",
    },
    {
      path: "aoeColor",
      zh: "命中範圍圈的顏色",
      note: "裡面那個小圈 —— 回答「它會落在哪」，也是玩家真正要瞄的那一圈。出貨 #FF9E3B 琥珀。⚠️ 改它要**連下面「自己的預告」一起改**：那兩個出貨值是同一個顏色，為的是「我瞄的那一圈」和「我放出去之後地上那一圈」看起來是同一件事。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "aoeFillAlpha",
      zh: "命中範圍圈的填滿濃度",
      note: "出貨 0.2，比距離圈濃一倍多：這個圈小得多，而且它回答的是「我站在裡面會不會被打到」——那是一個**面積**問題，只有填滿才一眼答得出來，一條線答不出來。調到 0 等於退回 #367 之前那種「地上一條線」的觀感。",
    },
    {
      path: "rimAlpha",
      zh: "兩個圈外框的不透明度",
      note: "框要比填滿實得多，否則邊界糊掉、玩家判斷不出「再往前一步是不是就超出射程」。出貨 0.85。調低到接近填滿的濃度時，兩個圈會看起來像兩片色斑而不是兩個範圍。",
    },
    {
      path: "rimThickness",
      zh: "外框粗細（世界單位）",
      note: "⚠️ 這是**絕對**寬度不是半徑的比例，而那是刻意的：用比例的話大技能的框會粗得像另一個 AoE，小技能的框細到看不見。出貨 0.18（角色體半徑 0.6，所以大約是身寬的三分之一）。調太粗會讓小範圍技能的框把自己的圈整個填滿。",
    },
    {
      path: "telegraph.self.ring",
      zh: "自己的預告 · 外圈顏色",
      note: "**你自己**起手技能時，地板上那一圈的邊。出貨和上面的命中範圍圈同一個琥珀，讓「我剛剛瞄的」和「我現在放的」看起來連續。⚠️ 改它之前先想清楚要不要一起改上面那一格，否則自己的兩個階段會變成兩個顏色。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.self.fill",
      zh: "自己的預告 · 填滿顏色",
      note: "同一圈的魔法陣填滿色（畫面上圈太多時這一條會被降級成只有外框，那時看不到它）。出貨與外圈同色 —— 自己的預告不需要吸引注意，它只是在說「這是我放的」。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.self.alpha",
      zh: "自己的預告 · 最大不透明度",
      note: "出貨 0.6，刻意比來襲的低：你已經知道自己按了什麼，這一圈只是確認，⛔ 不該是畫面上最吵的東西。調到和來襲一樣高＝自己丟一個大招會把對面正在瞄你的那一圈蓋掉。",
    },
    {
      path: "telegraph.self.dashed",
      zh: "自己的預告 · 虛線邊",
      note: "出貨**開**。它是「這一圈是我的」唯一一個**不靠顏色**的分辨器 —— 去飽和的觀戰畫面（#85）與色盲玩家只讀得到它。⚠️ 關掉的話，自己與來襲就只剩色相與亮度兩個差異；要關就請同時把兩邊的顏色拉得更開。",
    },
    {
      path: "telegraph.self.pulseHz",
      zh: "自己的預告 · 急迫脈動（Hz）",
      note: "起手末段的閃動頻率。出貨 0（不動）：會動的東西會抓走眼睛，而你不需要對自己的技能做反應。開起來＝自己的圈也會跳，代價是「畫面上在動的那一圈＝我要躲」這個規則失效。",
    },
    {
      path: "telegraph.ally.ring",
      zh: "隊友的預告 · 外圈顏色",
      note: "隊友起手時地板上那一圈的邊。出貨 #59CCFF 隊伍青 —— 它說的是「有東西會落在那裡，但不是衝著你來」。⚠️ 要離來襲的紅夠遠：這兩個是你在場上最常隔著半個競技場、而且旁邊沒有另一個可以比較的顏色。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.ally.fill",
      zh: "隊友的預告 · 填滿顏色",
      note: "同一圈的填滿色。出貨與外圈同色，而且這一條通常被降級成只有外框 —— 隊友的技能是背景資訊，不是要你反應的事。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.ally.alpha",
      zh: "隊友的預告 · 最大不透明度",
      note: "出貨 0.45，三條通道裡最低：一場四人團戰的地板上，隊友的圈數量最多而重要性最低。調高＝更清楚看得到隊友要打哪，代價是自己腳下那一圈與來襲那一圈都會被淹掉。",
    },
    {
      path: "telegraph.ally.dashed",
      zh: "隊友的預告 · 虛線邊",
      note: "出貨**關**（實線）。隊友那一條目前靠「最低的不透明度」與青色來分辨，實線讓它看起來像背景而不是一個要處理的東西。開起來＝多一個不靠顏色的分辨器，但會和自己的那一圈撞語彙。",
    },
    {
      path: "telegraph.ally.pulseHz",
      zh: "隊友的預告 · 急迫脈動（Hz）",
      note: "出貨 0。同自己那一格的理由，而且更強：隊友的圈在團戰裡數量最多，讓它們一起跳＝整個地板都在閃，那會把真正該躲的那一圈藏起來。",
    },
    {
      path: "telegraph.incoming.ring",
      zh: "來襲的預告 · 外圈顏色",
      note: "**打向你**的技能（施法者關係還沒解析出來時也走這一條，因為失敗要往危險那邊倒）。出貨 #FF3824 危險紅，刻意離上面兩個預覽圈都很遠 —— #228 之前這一圈是琥珀，和自己的瞄準預覽同色，那就是玩家回報「預告特效不明顯」的主因。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.incoming.fill",
      zh: "來襲的預告 · 填滿顏色",
      note: "同一圈的魔法陣填滿色。出貨 #FF5C33 比外圈亮一階，讓「面積」在滿地都是圈的時候仍然讀得出來 —— 這是三條通道裡唯一一條出貨就實心填滿的。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.incoming.alpha",
      zh: "來襲的預告 · 最大不透明度",
      note: "出貨 0.95，三條裡最高，而且**必須**最高：這是唯一一條玩家非反應不可的通道。調低到和隊友那條差不多＝「該躲的」和「不用管的」在畫面上一樣大聲，等於這三條通道白分了。",
    },
    {
      path: "telegraph.incoming.dashed",
      zh: "來襲的預告 · 虛線邊",
      note: "出貨**關**（實線＝「這是真的要落下來的」）。它和上面「自己的預告 · 虛線邊」是**同一個決定的兩半** —— 兩邊都設成一樣（都虛或都實）等於把這個不靠顏色的分辨器丟掉，那時請務必把兩邊的顏色與不透明度拉開。",
    },
    {
      path: "telegraph.incoming.pulseHz",
      zh: "來襲的預告 · 急迫脈動（Hz）",
      note: "起手最後三分之一才開始的閃動，出貨 6 Hz。它是「快落地了」這件事**唯一**不靠亮度也不靠顏色的訊號，所以去飽和的觀戰畫面與色盲玩家都讀得到。0＝關掉脈動，這一圈就只剩亮度爬升在報時間。",
    },
  ],
  preserved: [],
};

// ─────────────────────────────── 競技場規則 (config/arena-rules) — GH#410 ──
//
// ⚠️ 這一份是全 repo **唯一**一份被四頁共同編輯的 config 文件，而 GH#410 量到的
// 缺口就是那個結構的後果：三頁手刻的專屬頁各編一塊（殭屍波系統 / 傳說武器三選一 /
// 對戰設定），而**沒有任何一頁認領剩下的**，於是 rounds · overflow · flowers ·
// reviveCircles · guardianTower · goldDrop · ultUnlockRound · exUnlockRound
// 八個頂層區塊一格都調不到 —— 治療花的回血、守護塔的 HP 與齊射、復活圈的詠唱、
// 掉金、大絕與 EX 解鎖回合，每一格改一次都要完整部署。
//
// ⭐ 共同根因**不是**「八個區塊各自被漏掉」，是**一個**結構性的洞：
// `arena-rules` 走的是 configDocCoverage 的**文件層**豁免（OWN_PAGE），
// 而文件層豁免一旦成立，欄位層就再也沒有任何守衛在數 —— 通用引擎的
// 「每一個葉節點都有標籤」只跑在 CONFIG_DOC_SPECS 上，而它不在裡面。
// ⇒ 修法是把它**放進** CONFIG_DOC_SPECS（於是那條雙向守衛開始管它），
// 已經有專屬頁的區塊走 `elsewhere` 逐列宣告「它在哪一頁編」。
const ARENA_RULES_SPEC: ConfigDocSpec = {
  page: "arenaTuning",
  collection: "config",
  docId: "arena-rules",
  schemaTag: "config.arena-rules@1",
  zod: zConfigArenaRulesDoc,
  title: "競技場規則",
  intro: [
    "一場比賽的**場上規則**：治療花、復活圈、守護塔、陣亡投幣，加上大絕／EX 解鎖回合、最後一回合、bot 怎麼花錢、以及 #261 那 70 把普通武器上不上架。",
    "⭐ 這一頁補的是 GH#410 —— 這幾格在 2026-08-20 之前**一格都調不到**（只走「原封不動帶著走」），改一個數字要改 repo、重建映像、重啟容器。",
    "⚠️ 同一份文件還有三頁在編別的區塊：**殭屍波系統**（mobWaves）、**傳說武器三選一**（三選一規則／撞卡裁決／寶具貨架／劣勢權重）、**對戰設定**（卡片張數）。下面的欄位刻意**不重複**那三頁的任何一格 —— 同一個數字兩個輸入框，改了哪一個會贏是操作者猜不出來的。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/arena-rules.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
    "⚠️ **一個機制整塊缺席時（`overflow` / `gacha`）這一頁不畫它** —— 那兩塊在出貨文件裡不存在（＝機制關著），而通用引擎只寫你改過的那幾格，半塊送出去會讓整份 arena-rules 被 Zod 退回，於是**整份內容載入失敗、退回骨架英雄**（2026-08-02 那次線上事故的形狀）。要打開它們請走「內容管理」貼整塊 JSON。",
  ],
  consumer:
    "apps/game-server/src/match/arenaRules.ts 的 resolveArenaRules() → rulesFromDoc()，再由 MatchController 在 tick 0 之前轉成 ticks 灌進 SimWorld（flowerRules / reviveRules / guardianRules / coinRules / weaponShelfOpen / ultGateOverride）",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場（`Configs` 登錄表是開機時載入的）。⛔ 進行中的那一場不會中途換規則 —— 這幾組值在 MatchController 建構時就定格了。和 淨化規則／基礎加成 同一個形態（#278）。",
  fields: [
    // ── 節奏門檻 ────────────────────────────────────────────────────────────
    {
      path: "ultUnlockRound",
      zh: "大絕（R）解鎖回合",
      note: "從第幾回合起，R 不再吃「英雄等級 6/11/16」那道原作閘，任何等級都學得起來。調大＝前期打法更依賴 QWE，調小＝第一回合就有大絕互丟。⚠️ 它只鬆開等級閘，⛔ 不會自動幫玩家點技能。",
      max: 99,
    },
    {
      path: "exUnlockRound",
      zh: "EX 技能解鎖回合",
      note: "有 EX 技能的英雄從第幾回合起按得動 F。原作是等級 30 的閘，在競技場被映射成一個回合門檻。調大＝EX 變成只有終盤才看得到的殺手鐧；調小＝每一場都會出現，而那會讓沒有 EX 的英雄相對變弱。",
      max: 99,
    },
    {
      path: "finalRound",
      zh: "賽制的最後一回合",
      note: "打完這一回合就全場結算，而且**這一回合是全員同一張地圖的大亂鬥**。⚠️ 改大之前先確認回合表（rounds）真的排到那一回合 —— 沒排到的回合會落到 overflow 規則上，而 overflow 在出貨文件裡整塊缺席，等於那幾回合沒有任何金幣與等級發放。",
    },
    // ── 商店 ────────────────────────────────────────────────────────────────
    {
      path: "weaponShelfOpen",
      zh: "普通武器道具上不上架（#261）",
      note: "開啟後，#261「暫時下架」的那 70 把普通武器道具會回到中場商店，玩家可以直接用金幣買；關著時商店只剩「能力屬性強化」與「傳說寶玉」兩項服務。⛔ 它**不影響**三選一卡與傳說寶玉抽獎 —— 那兩條路從 #261 當天起就沒有被關過（owner 原話：「隨機三選一仍然可以隨機到」）。⛔ 也不管寶具，寶具是「傳說武器三選一」那一頁的另一格。",
    },
    {
      path: "botShop.buyWeapons",
      zh: "bot 會不會花錢買東西",
      note: "關掉之後 bot 整場一毛都不花（每位英雄手寫的推薦出裝已經退場，所以沒有第二條買裝路徑）—— 那會讓 bot 在中後期明顯變成沙包。開著時它們照玩家的規則買隨機寶具。",
    },
    {
      path: "botShop.priceMult",
      zh: "bot 的價格倍率",
      note: "bot 買東西時標價乘上這個數（owner 2026-08-18：「消耗金錢是半價」）。調小＝bot 買得起更多裝、對玩家更有壓力；調大到 1 以上＝bot 幾乎買不起東西。⚠️ 它只改 bot 付多少，⛔ 不改玩家看到的價格。",
    },
    // ── 治療花 ──────────────────────────────────────────────────────────────
    {
      path: "flowers.firstSpawnSec",
      zh: "治療花 · 開打後幾秒長第一朵",
      note: "每個競技場各自計時。調小＝開場的血量壓力被立刻抵消，調大＝前期換血更有代價。⚠️ 它和回合長度綁在一起看才有意義：一朵都還沒長出來回合就結束了的話，這個機制等於不存在。",
      max: 600,
    },
    {
      path: "flowers.respawnSec",
      zh: "治療花 · 被摘掉後幾秒再長",
      note: "從**上一朵死掉**的那一刻算起，不是從上一次生成算起。這一格決定「搶花」值不值得：調小＝花變成背景資源，調大＝每一朵都是一次真的攻防。",
      max: 600,
    },
    {
      path: "flowers.maxAlivePerZone",
      zh: "治療花 · 每場地同時最多幾朵",
      note: "同時站在場上的朵數上限。>1 會讓兩隊各摘各的、搶花的互動整個消失 —— 出貨 1 是刻意的。",
      max: 20,
    },
    {
      path: "flowers.hp",
      zh: "治療花 · 生命值",
      note: "花是可攻擊物件，這一格決定「摘一朵要花多久」。調高＝遠程英雄摘得動、近戰要站著打很久（等於一次站樁的風險）；調到很低＝誰路過誰摘走，搶花就不成立了。",
      max: 100000,
    },
    {
      path: "flowers.healPctMax",
      zh: "治療花 · 回復自身最大生命的比例",
      note: "0.18 = 回復**摘花者自己**最大生命的 18%，⛔ 不是一個固定數值 —— 所以坦與脆皮拿到的回復量自動成比例，不用逐英雄調。0 = 只補魔不補血。",
    },
    {
      path: "flowers.manaPctMax",
      zh: "治療花 · 回復自身最大魔力的比例",
      note: "同上，比的是摘花者自己的最大魔力。⚠️ 對法系英雄來說這一格常常比回血那一格更值錢：沒魔力的法師等於沒有技能。",
    },
    {
      path: "flowers.burstRadius",
      zh: "治療花 · 爆開時的友軍波及半徑",
      note: "以**花**為圓心，這個半徑內的**友軍**一起吃到回復。調大＝摘花變成團隊行為（大家要聚過來），調小＝只有摘的人拿得到，那會讓花變成個人資源。",
      max: 40,
    },
    // ── 復活圈 ──────────────────────────────────────────────────────────────
    {
      path: "reviveCircles.channelSec",
      zh: "復活圈 · 需要累積詠唱幾秒",
      note: "隊友必須**累積**站在圈裡這麼久才會把人拉回來（⛔ 不需要連續，離開只是暫停累積）。這一格是這個機制唯一的代價：調太小＝團戰中隨手復活，調太大＝一場都用不出來。",
      max: 120,
    },
    {
      path: "reviveCircles.radius",
      zh: "復活圈 · 圈的半徑",
      note: "詠唱與爭奪都判這個範圍。調大＝救人的隊友可以站遠一點、比較安全；調小＝救人等於站進屍體上，那是敵人最想打的位置。",
      max: 40,
    },
    {
      path: "reviveCircles.decayMult",
      zh: "復活圈 · 沒人站時的進度倒退倍率",
      note: "圈裡沒有人時，進度以「填充速度 × 這個數」倒退。1 = 填多久就退多久，出貨 2 = 退得比填快一倍（所以「摸一下就跑」累積不起來）。0 = 進度永遠不掉，那會讓多次短暫進圈等於一次長詠唱。",
      max: 20,
    },
    {
      path: "reviveCircles.revivesPerTeamPerRound",
      zh: "復活圈 · 每隊每回合最多救回幾次",
      note: "⚠️ 這是**回合會不會結束**的那一格：調太高會讓一隊被打倒之後無限復活，回合永遠打不完。0 = 整個機制關掉（圈還是會出現，但救不起來）。",
      max: 20,
    },
    {
      path: "reviveCircles.reviveHpPctMax",
      zh: "復活圈 · 復活時回到自身最大生命的比例",
      note: "比的是**被救者自己**的最大生命。調高＝救回來就能繼續打，等於一次完整的重來；調低＝救回來是一個半死的人，敵人可以立刻再收一次。",
    },
    {
      path: "reviveCircles.reviveManaPctMax",
      zh: "復活圈 · 復活時回到自身最大魔力的比例",
      note: "同上，比的是被救者自己的最大魔力。調 0＝復活後沒有技能可用，那讓「先救誰」變成一個真的取捨。",
    },
    {
      path: "reviveCircles.contestPauses",
      zh: "復活圈 · 敵人站進來會不會凍結進度",
      note: "⚠️ **出貨關著，而那是 owner 2026-08-14 的裁決**（「LoL 競技場的玩法是敵人不影響復活圈」），⛔ 不是一個沒做完的功能。打開它在紙上很合理，實際後果是這個機制**幾乎永遠用不出來**：屍體就躺在剛才打架的地方，敵人本來就在圈裡。",
    },
    {
      path: "reviveCircles.damageInterrupts",
      zh: "復活圈 · 受傷會不會中斷詠唱",
      note: "出貨關著。打開＝救人的隊友只要被任何一下打到就前功盡棄，而團戰裡沒有人打不到 —— 效果和上面那一格一樣是「這個機制不存在」，只是換一個理由。",
    },
    {
      path: "reviveCircles.ccInterrupts",
      zh: "復活圈 · 被控制會不會中斷詠唱",
      note: "出貨**開著**：暈眩／擊飛／定身應該打斷救人，否則控制技在這個互動上完全無效。⚠️ 它和上面兩格的差別是**可以反應**：控制技有前搖與冷卻，敵人是「用一個技能換掉一次救人」，不是「站著就贏」。",
    },
    // ── 守護塔 ──────────────────────────────────────────────────────────────
    {
      path: "guardianTower.hpBase",
      zh: "守護塔 · 第 1 回合的生命值",
      note: "塔的血量決定「拆一座要花多久」，而那段時間就是圍毆時對手可以來搶最後一擊的窗口。調太低＝第一個發現它的人白拿獎勵，調太高＝沒有人有空拆它，整個機制在場上不存在。",
      max: 10000000,
    },
    {
      path: "guardianTower.hpGrowthPerRound",
      zh: "守護塔 · 每回合生命成長率",
      note: "實際血量 = 基礎 ×（1 + 這個數 ×（回合−1））。0 = 每一回合一樣硬，於是後期一秒被拆；調高＝後期的塔要整隊一起才拆得動。⚠️ 它和下面的傷害成長要一起看，只調一邊會讓塔變成純沙包或純陷阱。",
      max: 10,
    },
    {
      path: "guardianTower.armor",
      zh: "守護塔 · 護甲（物理減傷）",
      note: "塔吃的是結構減傷，這一格決定物理輸出打它有多吃虧。調高＝逼玩家用法傷拆塔（等於偏袒法系英雄），出貨 0 是刻意的中立值。⚠️ 上界是**防手滑柵欄**（把 0 打成一串 0），⛔ 不是平衡上的建議值。",
      max: 1000,
    },
    {
      path: "guardianTower.magicResist",
      zh: "守護塔 · 魔法抗性",
      note: "上一格的法傷版。出貨兩邊**不對稱**（護甲 0、魔抗 17.65）是原作的數字，效果是物理隊拆塔比較快。兩格拉平＝誰來拆都一樣，那也是一個合法的設計選擇。⚠️ 上界同上，是防手滑柵欄。",
      max: 1000,
    },
    {
      path: "guardianTower.radius",
      zh: "守護塔 · 碰撞半徑",
      note: "塔的身體有多大 —— 它同時決定近戰要站多近才打得到，以及它會不會擋住走位。調大會讓場中央變成一個真的障礙物。",
      max: 20,
    },
    {
      path: "guardianTower.maxHitPctMaxHp",
      zh: "守護塔 · 單發傷害上限（佔塔最大生命的比例）",
      note: "一發最多只能打掉塔最大生命的這個比例（出貨 0.15 ＝ 至少要七下）。它擋的是「一個爆發技一次拆掉整座塔」，也就是讓最後一擊仍然是一個**可以被搶**的時刻。調到 1 = 解除限制。",
    },
    {
      path: "guardianTower.volleyPeriodSec",
      zh: "守護塔 · 幾秒放一次齊射",
      note: "醒著的塔每隔這麼久打一次它的主要傷害來源清單。調小＝拆塔期間承受的傷害線性變多（塔更像一個 DPS 檢定），調大＝拆塔幾乎沒有代價。",
      max: 120,
    },
    {
      path: "guardianTower.volleyWindupSec",
      zh: "守護塔 · 齊射前的預告時間",
      note: "地板亮起來到真的落下之間有多久 —— 這就是玩家**閃得掉**的那段時間。調到很小＝視覺上還是有預告，但實際上不可能反應，那會讓玩家覺得是隨機扣血。",
      max: 10,
    },
    {
      path: "guardianTower.volleyMarks",
      zh: "守護塔 · 一次齊射標記幾個人",
      note: "每次挑「對它輸出最多」的前幾名蓋標記。1 = 只懲罰主坦，調高＝整隊一起被打，於是「一起拆塔」的收益下降。上界 24 ＝ 一場的總人數（再高沒有意義）。",
      max: 24,
    },
    {
      path: "guardianTower.volleyRadius",
      zh: "守護塔 · 每個標記的爆炸半徑",
      note: "落點周圍這個範圍內的人一起吃傷害 —— 它把「被標記」變成一件會牽連隊友的事，所以被標到的人要跑開。調到很小＝隊形完全不重要。",
      max: 40,
    },
    {
      path: "guardianTower.volleyDamageBase",
      zh: "守護塔 · 第 1 回合的每標記傷害",
      note: "齊射的基礎傷害。它和上面的「單發上限」是一對：塔限制玩家的爆發，這一格是塔自己的爆發。調太高＝沒有人敢拆，調太低＝拆塔是免費的。",
      max: 100000,
    },
    {
      path: "guardianTower.volleyDamageGrowthPerRound",
      zh: "守護塔 · 每回合傷害成長率",
      note: "實際傷害 = 基礎 ×（1 + 這個數 ×（回合−1））。0 = 後期的塔傷害不變，於是它只是一個血包。⚠️ 和「生命成長率」要一起調：只長血不長傷害＝拆得久但不痛，那是最無聊的組合。",
      max: 10,
    },
    {
      path: "guardianTower.volleyRampPct",
      zh: "守護塔 · 連續齊射的加成（每次 +）",
      note: "同一次清醒期間第 n 發的傷害 = 基礎 × min(上限, 1 + 這個數 ×(n−1))。它是**反拖延**裝置：站在塔邊磨很久會越來越痛。0 = 關掉，塔的傷害永遠一樣。",
      max: 10,
    },
    {
      path: "guardianTower.volleyRampMax",
      zh: "守護塔 · 連續齊射加成的上限倍率",
      note: "上一格能疊到幾倍為止（出貨 2 ＝ 最多兩倍）。⚠️ 沒有它的話一場長時間的塔戰會變成必死，而那不是懲罰拖延，是禁止拆塔。",
      max: 20,
    },
    {
      path: "guardianTower.dormancySec",
      zh: "守護塔 · 沒被碰幾秒後睡著",
      note: "睡著＝停止齊射，而且**威脅名單與連續加成一起歸零**。這一格決定「打一下就跑、等它睡了再回來」這個玩法可不可行：調大＝跑掉也沒用，調小＝拆塔可以分很多次做。",
      max: 300,
    },
    {
      path: "guardianTower.rewardGold",
      zh: "守護塔 · 給最後一擊的金幣",
      note: "只付給**最後一擊**那一個人，⛔ 不分紅 —— 那個「不分紅」正是塔存在的理由：它製造一個隊友之間也會搶的瞬間。調高＝搶最後一擊值得為它冒險。",
      max: 1000000,
    },
    {
      path: "guardianTower.restoreHpPct",
      zh: "守護塔 · 最後一擊者回復自身最大生命的比例",
      note: "出貨 1 ＝ 直接補滿。這是拆塔真正的價值：一次不用回商店的完整補給。調低＝塔變成純金幣，於是低血的人不會為了它冒險。",
    },
    {
      path: "guardianTower.restoreManaPct",
      zh: "守護塔 · 最後一擊者回復自身最大魔力的比例",
      note: "同上的魔力版，出貨也是補滿。對法系英雄來說這一格常常比回血更關鍵 —— 它決定「拆塔」是不是法師的續戰手段。",
    },
    {
      path: "guardianTower.buffDurationSec",
      zh: "鎮守之力 · 持續幾秒",
      note: "最後一擊者拿到的繼承齊射能持續多久。它是拆塔獎勵裡**唯一會影響接下來的戰鬥**的那一半：調長＝拆完塔的人帶著一個小型塔去打人，調到 0 ＝ 這個獎勵消失。",
      max: 600,
    },
    {
      path: "guardianTower.heirPulsePct",
      zh: "鎮守之力 · 脈衝傷害（佔塔齊射傷害的比例）",
      note: "帶著這個增益的人會週期性對身邊敵人造成「塔的齊射傷害 × 這個數」。⚠️ 它是**推導**的不是固定值，所以塔的傷害被調強時這個獎勵自動跟著強，⛔ 不用兩邊各調一次。",
      max: 10,
    },
    {
      path: "guardianTower.heirPulseRadius",
      zh: "鎮守之力 · 脈衝半徑",
      note: "以帶著增益的人為圓心。調大＝他變成一個必須被拉開的近戰威脅，調小＝只有貼身才吃得到，於是對遠程英雄等於沒有這個獎勵。",
      max: 40,
    },
    // ── 陣亡投幣 ────────────────────────────────────────────────────────────
    {
      path: "goldDrop.coinValue",
      zh: "陣亡投幣 · 一枚幣多少金",
      note: "被打倒的玩家可以把身上沒花完的金幣一枚一枚丟到地上，任何人撿走。這一格是**一枚**的面額 —— 它同時決定丟一枚的手感（面額太小＝丟不完）與撿到的價值。",
      max: 100000,
    },
    {
      path: "goldDrop.coinsPerRound",
      zh: "陣亡投幣 · 每人每回合最多丟幾枚",
      note: "硬上限（owner 的「最多 10 枚」）。它擋的是「死掉的人把整個身家倒在地上」——那會讓死亡變成一次資源轉移而不是損失。乘上面的面額就是一個人一回合最多能送出去多少金。",
    },
    {
      path: "goldDrop.dropRadius",
      zh: "陣亡投幣 · 幣落在屍體周圍多遠",
      note: "幣排成一圈落在屍體周圍這個半徑上。調大＝散得開、撿的人要多跑幾步（也更容易被埋伏），調小＝一堆幣疊在同一點，看起來像只有一枚。",
      max: 20,
    },
    {
      path: "goldDrop.pickupRadius",
      zh: "陣亡投幣 · 走多近會自動撿起",
      note: "活著的英雄靠近到這個距離就收走。調大＝路過就掃光，調小＝要精準走位才撿得到（那會讓幣常常留在地上直到回合結束）。",
      max: 20,
    },
    {
      path: "goldDrop.coinRadius",
      zh: "陣亡投幣 · 幣本身的體積半徑",
      note: "純視覺／模型大小，⛔ 它不與任何東西碰撞。調大＝地上的幣在混戰中看得見（這是它唯一的作用），調太大＝一堆幣把腳下的地板效果全蓋住。",
      max: 5,
    },
  ],
  // ⚠️ 這七條分支不是「忘了做」——走訪器只長得出純量欄位，而這七條各自有自己的
  // 編輯路徑（或還沒有）。少一條 = 這一頁存檔時把它從線上文件裡刪掉。
  preserved: [
    {
      path: "rounds",
      why: "**整張回合排程**（每一回合發幾等、幾金、自動學哪幾格、發哪一級聖杯願望／哪一張寶具表）。它是 `z.record`（鍵是回合編號，不是固定欄位），通用引擎列不出「有哪些鍵」，畫出來會是一頁空的 —— 和 `per-level-bonus` / `stat-caps.caps` / `vfx-ability-art.bindings` 是同一個引擎缺口的第四個實例。⛔ 掉了的話整場比賽一毛金幣一級經驗都不發，而畫面上完全看不出來。",
    },
    {
      path: "weaponTiers",
      why: "[EX解放] / [EX∅ 根源] 的出現窗口與機率。它在**傳說武器三選一**那一頁有真的表格編輯器（`configRows.ts`，GH#355），這一頁只負責原封不動帶著走 —— 掉了的話那兩階寶具整批抽不到，而三選一照樣發卡，所以看起來只是「運氣不好」。",
    },
    {
      path: "augmentTiers",
      why: "聖杯願望的階級升級表（GH#357「階級由劣勢決定」），與 `weaponTiers` 同一個引擎、同一頁編輯。掉了的話回合表排什麼等級就發什麼，劣勢方再也拿不到升級 —— 而那正是這個機制存在的全部理由。",
    },
    {
      path: "retiredLootTables",
      why: "已退場的抽獎池（owner 2026-08-01 的裁決）。⚠️ 它擋的是**後台耐久覆蓋層**那條路（#283 那裡沒有 Zod），掉了之後有人把 `quest-rewards` 排回某個回合就會真的發出去。編輯它的地方是「傳說武器三選一」那一頁。",
    },
    {
      path: "legendaryShelf.randomOnlyTables",
      why: "隨機限定的抽獎表名單（那幾張表裡的寶具永遠不上架，只能抽到）。同在「傳說武器三選一」那一頁編輯。掉了的話那些道具會靜靜地出現在商店裡 —— 買得到，而且沒有任何東西會叫。",
    },
    {
      path: "itemDraft.excludedCraftRoles",
      why: "三選一與傳說寶玉**都不會發**的 craftRole 清單（出貨 token / service）。同在「傳說武器三選一」那一頁編輯。掉了的話兌換券與商店服務會混進獎勵池，玩家會抽到一張「能力屬性強化」當作三選一。",
    },
    {
      path: "mobWaves.schedule",
      why: "殭屍波的**逐回合覆寫表**（第 6/7/8/9 回合的每波上限與同時存活上限，第 10 回合歸零）。它在**殭屍波系統**那一頁編輯。掉了的話後段回合會退回基礎值，殭屍海突然變成小貓兩三隻，而回合照常進行。",
    },
  ],
  // ⚠️ 這十列是 GH#410 的**逃生口**（見 `ElsewhereField` 的長註解）：這一份是全
  // repo 唯一一份被四頁共同編輯的文件，所以「每一個葉節點都有標籤」必須能宣告
  // 「那一格在別頁」。⛔ 每一列都要指得出**哪一頁**，或說得出為什麼今天沒人編。
  elsewhere: [
    {
      path: "mobWaves",
      why: "殭屍波系統（`apps/admin/src/mobWaves.ts` + ui/MobWavesPage.tsx）整頁在編這一塊 —— 生怪節奏、小怪／精英／殭屍王的三套數值、分紅結算、血條。⛔ 在這裡再畫一次那 150 格＝第二份會 drift 的標籤表。",
    },
    {
      path: "itemDraft",
      why: "傳說武器三選一（`apps/admin/src/itemDraft.ts` + ui/ItemDraftPage.tsx）在編：候選不足時發短卡／借表／重複補滿、備援獎池、單張卡抽取上限。",
    },
    {
      path: "grailDraft",
      why: "傳說武器三選一那一頁的「聖杯顯現規則」區塊（`apps/admin/src/grailDraft.ts`）在編：靈基適性條件、槽位多樣性、偏好加權、舊池收不收。",
    },
    {
      path: "legendaryShelf",
      why: "傳說武器三選一那一頁的「寶具能不能直接買」區塊在編：上架開關、統一價倍率、賣出退款率。⚠️ 那三格與這一頁的「普通武器道具上不上架」是**兩個不同的貨架**（owner 2026-08-17 只讓寶具上架），刻意分開。",
    },
    {
      path: "draftConflict",
      why: "傳說武器三選一那一頁的「同一回合撞卡時發哪一個」（#340）。它有五個選項而且每一個都附一段「玩家會看到什麼」，那種說明放在通用長表單的一格下拉旁邊讀不完。",
    },
    {
      path: "bothDraftsExtraSec",
      why: "傳說武器三選一那一頁在編（owner 2026-08-18「商店時間要延長 10 秒鐘」）。它只在**真的兩張都發出去**的回合才加，與上面那格撞卡裁決是同一個決定的兩半，所以同頁。",
    },
    {
      path: "disadvantageWeights",
      why: "傳說武器三選一那一頁在編（GH#355 已補上的三格純量：回合勝場差／裝備價值差／近期戰績差）。它決定「誰算劣勢方」，而劣勢值同時餵給寶具與聖杯兩張升級表，所以和那兩張表同頁。",
    },
    {
      path: "offerCount",
      why: "對戰設定（`apps/admin/src/matchConfig.ts`）在編，傳說武器三選一那一頁**唯讀**顯示它。⚠️ 它同時管聖杯願望與寶具兩種卡的張數 —— 在這裡再開一個輸入框會讓操作者以為自己只改了其中一種。",
    },
    {
      path: "overflow",
      why: "⛔ **今天沒有任何一頁在編它，而且這一頁刻意不畫** —— 這一塊在出貨文件裡**整塊缺席**（＝機制關著），而通用引擎只寫被改過的那幾格，於是填一格會送出半塊 `overflow`，被 Zod 的 `.strict()` 整份退回 → 內容載入整份失敗 → 骨架英雄（2026-08-02 事故的形狀）。要打開它請走「內容管理」貼整塊 JSON。⚠️ 通用引擎長出「整塊啟用／停用」的開關那一天，這一列該退場。",
    },
    {
      path: "gacha",
      why: "⛔ 同 `overflow`：**整塊缺席**的舊版每回合免費抽獎（現在的做法是回合表的 `weaponLootTable` 三選一）。它在出貨文件裡不存在，畫出來只會請操作者寫出半塊文件。⚠️ 這個機制正式退場的那一天，這一列應該連同 schema 的欄位一起刪掉，⛔ 不是留著一個沒有人記得的舊路徑。",
    },
  ],
};

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
  GORE_SPEC,
  DAMAGE_COLORS_SPEC,
  // 範圍指引與預告（GH#376）。⚠️ 同 AUDIO_MIX_SPEC 那一段：這一列要跟 store.ts 的
  // `Page` union / `SESSION_REQUIRED_PAGES` 與 App.tsx 的導覽列一起，才到得了
  // 操作者手上；而且要跟 `apps/client/src/content/ContentDb.ts` 的
  // `applyRangeGuideDoc(...)` 那一行一起，才到得了**地板上**。
  RANGE_GUIDE_SPEC,
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
  MANA_ECONOMY_SPEC,
  UI_LEXICON_SPEC,
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
