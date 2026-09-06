/**
 * 通用設定文件編輯器的**引擎** —— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * 這裡是「結構自動」的那一半：Zod 走訪（{@link readSchema}）、一格的型別與上下界
 * （{@link ConfigFieldRow} / {@link boundsFor}）、輸入解析與整份文件的套用。
 * 「語意手寫」的那一半（56 份標籤表）住 `./specs/*`，有序註冊表住門面
 * `../configForms.ts` —— 三者的分工與理由寫在門面的檔頭，⛔ 不在這裡重講一次。
 */
// 重用 `/editor` 的 Zod 走訪器而不是在後台再寫一支。理由和第一守則同源：兩支走訪器
// 就是兩份會 drift 的「Zod 長什麼樣」的知識，而它們的分歧會以「後台少了一個欄位」
// 的形態出現 —— 那正是這張單要修的東西。
// ⚠️ 它是別條 lane 的檔案（#238 動過）。`configForms.test.ts` 針對這三份 schema 釘住
// 走訪結果，所以那支走訪器的輸出形狀一改，紅的是這裡而不是遊戲。
import { walkZod } from "../../../editor/src/form/walk";
import { humanize, type UINode } from "../../../editor/src/form/uiSchema";
import type { ConfigCurveSpec } from "../configCurve";
import type { ConfigTableSpec } from "../configTables";
/**
 * `ZodTypeAny`，**不從 `"zod"` 取**。
 *
 * `apps/admin` 沒有把 zod 列進自己的 `dependencies`，所以 `import type
 * { ZodTypeAny } from "zod"` 在 `tsc -p apps/admin` 底下是 TS2307（執行期沒事，
 * 因為型別 import 會被抹掉 —— 也就是說那是一個**只有 typecheck 會抓到**的錯，
 * 而 `pnpm -s typecheck | grep error` 永遠 match 不到它）。從走訪器的參數推回來
 * 拿到的是同一個型別，而它的解析走 `apps/editor` 自己的 zod。
 */
export type ConfigZodSchema = Parameters<typeof walkZod>[0];

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

/**
 * 一份設定文件的「語意」宣告。
 *
 * ⭐ **`P` 是後台路由 key 的字面型別**（GH#807）。在它之前 `page` 是 `string`，
 * 於是 `store.ts` 的 `Page` union 只能**再手打一次** 59 個路由名 —— 那是第〇·七守則
 * 點名的「一行接線」病：每加一份設定就要在別的檔案補一行，而那一行是**機械的**
 * （59/59 全部照抄），⛔ 不是一個決定。
 *
 * ⇒ 逐份 spec 宣告成 `ConfigDocSpec<"audioMix">`，`CONFIG_DOC_SPECS` 就帶得動
 * 字面型別，`store.ts` 的 `ConfigDocPage` 直接從**出貨註冊表**推導出來。
 * ⚠️ 預設值 `string` 讓所有「不在乎是哪一頁」的消費端（`specForPage` 的回傳值、
 * `configDocCoverage`、十幾支測試）一個字都不用改。
 */
export interface ConfigDocSpec<P extends string = string> {
  /** 後台路由 key。⭐ 逐份宣告成字面值 —— `store.ts` 的 `Page` union 從它推導。 */
  page: P;
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
   * ⭐ 左欄那一列（GH#992 Scope 1 第二批）—— 從 Zod 根節點的 `@nav <emoji> <分組> <標籤>`
   * 推導（`specFromZod()`）。有這一格的 spec，`ui/App.tsx` 的 `NAV` 會**自動**長出一列
   * （排在那一組的最後）；⛔ 沒有這一格的 spec 仍然要在 `NAV` 手打一列 —— 那是
   * 位置的決定（「緊接在 X 後面」），⛔ 不是接線。
   */
  nav?: { label: string; emoji: string; section: string };
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
