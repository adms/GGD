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
  zConfigDamageColorsDoc,
  zConfigGoreDoc,
  zConfigModelLodDoc,
  zConfigBlockDoc,
  zConfigBodyScaleDoc,
  zConfigRegenDoc,
  zConfigShieldDoc,
  zConfigStealthDoc,
  zConfigTauntDoc,
  zConfigVfxCleanupDoc,
} from "@ggd/shared/content";
// 重用 `/editor` 的 Zod 走訪器而不是在後台再寫一支。理由和第一守則同源：兩支走訪器
// 就是兩份會 drift 的「Zod 長什麼樣」的知識，而它們的分歧會以「後台少了一個欄位」
// 的形態出現 —— 那正是這張單要修的東西。
// ⚠️ 它是別條 lane 的檔案（#238 動過）。`configForms.test.ts` 針對這三份 schema 釘住
// 走訪結果，所以那支走訪器的輸出形狀一改，紅的是這裡而不是遊戲。
import { walkZod } from "../../editor/src/form/walk";
import { humanize, type UINode } from "../../editor/src/form/uiSchema";

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
   * `configForms.test.ts` 的「文字欄位的 pattern 與 schema 判一樣的結果」用整份
   * 文件的 `spec.zod.safeParse` 交叉驗證，drift 當場紅。
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
  ],
  consumer:
    "apps/client/src/render/damagePalette.ts 的 applyDamageColorsDoc()（由 ContentDb.load 呼叫）→ damageTextColor() 被 ui/combatText.ts 的 combatTextStyle() 讀走畫飄字，damageFlashRgb() 被 render/combatFeedback.ts 的 flashColorFor() 讀走畫身體閃光",
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
  title: "場地環境火焰",
  intro: [
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
    "每位英雄的體型現在寫在英雄卡的 bodyScale（內容管理那邊改），這一頁只管**它怎麼換算成射程**：射程倍率 = 1 + (體型 − 1) × 係數。係數 1 = 完全等比例（出貨值，owner 的字面讀法）；0 = 完全不連動（＝這一頁出現之前的行為）。",
    "⚠️ 這一頁**只管普攻射程**。技能施放距離與 AoE 半徑走 戰鬥系統 的 abilityRange（出貨 0.6，是刻意壓過的），**刻意不跟著體型連動** —— 再乘一次會讓那個 0.6 對大體型英雄悄悄失效。要不要一起連動是下一個決定。",
    "⚠️ 這一頁**會改變平衡**：出貨內容有 24 位英雄體型不是 1（0.6 ～ 3.0），所以他們的普攻射程會同步變成 0.6 ～ 3.0 倍。最大的是 godie-o030（3.0 倍）。要退回舊行為把係數調成 0，或關掉總開關。",
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
      note: "關掉＝攻擊距離完全不看體型，和這一頁出現之前一模一樣。係數填 0 也是同一個結果，兩個都留著是因為「暫時關掉」和「調成不連動」在操作上是兩件事：關掉之後再打開，係數還在。",
    },
    {
      path: "attackRangeCoefficient",
      zh: "體型每多 1 倍，普攻射程延長幾倍",
      note: "1＝完全等比例（出貨值）：體型 3 倍的英雄射程也 3 倍。0.5＝體型 2 倍只多 50% 射程。0＝不連動。上界 3 擋的是把百分比當倍率填（打 100 進去等於 100 倍射程，那位英雄會從畫面外開打）。",
    },
    {
      path: "minScale",
      zh: "體型下界（算射程時）",
      note: "比這更小的身體不會讓射程再往下縮。它保護的是小型角色：出貨最小體型是 0.6，把這一格調到 0.6 以上等於「小隻的不吃這個懲罰」。",
    },
    {
      path: "maxScale",
      zh: "體型上界（算射程時）",
      note: "這是「不會從畫面外開打」的那條線。出貨最大體型 3.0，預設 4 留了餘裕。上界 10 剛好是 小怪波 那一頁的 殭屍王體型倍率 出貨值 —— 貼錯格會被擋在這裡。",
    },
  ],
  preserved: [],
};

// ───────────────────────────────────────────── 回血規則 (config/regen) ──

const REGEN_SPEC: ConfigDocSpec = {
  page: "regenRules",
  collection: "config",
  docId: "regen",
  schemaTag: "config.regen@1",
  zod: zConfigRegenDoc,
  title: "回血規則",
  intro: [
    "owner 2026-08-01 實戰回饋：「Berserker HP 回血 1%每秒，沒有保底」。在這一頁出現之前，回血只有一條**固定點數/秒**（英雄卡的 healthRegen ＋ 成長 ＋ 力量），整條路上沒有任何一項讀最大生命 —— 也就是說「每秒回最大生命的 1%」不是被設錯的數字，是一個**不存在的機制**。",
    "百分比本身寫在英雄卡（healthRegenPctOfMax，0.01 = 每秒 1%），出貨只有 海克力斯 - Berserker 填了。這一頁決定它和固定回血的關係，以及有沒有保底。",
    "⚠️ 「保底」查過三個可能的位置（基礎加成、屬性最終夾值、屬性上限表）都沒有生命回復的下限，所以現況本來就沒有保底 —— 這一格是把它變成可以**打開**的，不是把既有的關掉。",
  ],
  consumer:
    "packages/shared/src/sim/regenRules.ts 的 healthRegenPerSec()，由 sim/systems/RegenSystem.ts 每 tick 對每一個活著的單位呼叫；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.regenRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 護盾規則／格擋規則 同一個形態(#278)。",
  fields: [
    {
      path: "pctEnabled",
      zh: "百分比回血",
      note: "關掉＝英雄卡上填的百分比全部當作沒填，所有人只吃固定回血（＝這個機制出現之前）。開著也只影響有填百分比的英雄，其他 112 位一點差別都沒有。",
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
      zh: "百分比只給英雄",
      note: "開（出貨值）＝小怪、殭屍王與召喚物不吃百分比回血。關掉之後，一隻臉是 Berserker 的隨機英雄殭屍王也會每秒回 1% 最大生命 —— 王的血量是英雄的好幾倍，那等於一堵打不動的牆。",
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
export const CONFIG_DOC_SPECS: readonly ConfigDocSpec[] = [
  MODEL_LOD_SPEC,
  VFX_CLEANUP_SPEC,
  GORE_SPEC,
  DAMAGE_COLORS_SPEC,
  SHIELD_SPEC,
  BLOCK_SPEC,
  STEALTH_SPEC,
  TAUNT_SPEC,
  ARENA_FIRE_SPEC,
  BODY_SCALE_SPEC,
  REGEN_SPEC,
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
