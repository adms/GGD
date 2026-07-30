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
  zConfigGoreDoc,
  zConfigModelLodDoc,
  zConfigShieldDoc,
  zConfigStealthDoc,
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
  SHIELD_SPEC,
  STEALTH_SPEC,
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
