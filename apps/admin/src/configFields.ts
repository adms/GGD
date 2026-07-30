/**
 * Zod → 後台欄位：從 schema **推導**一份 config 文件有哪些可編輯的格子，
 * 而不是在後台再手抄一份清單。
 *
 * ── 為什麼不抄清單 ──────────────────────────────────────────────────────────
 * 這個 repo 的每一份 `config.*@1` 都同時活在三個地方（CLAUDE.md 第一守則）：
 * `content/config/*.json`、`packages/shared/src/content/schema/config.ts` 的
 * Zod、以及後台。前兩個有 `bundle.test.ts` 綁著；後台那一份歷來是**手抄的**，
 * 所以隔壁工作流往 Zod 加一格，後台完全不會知道 —— 頁面照樣渲染、照樣存檔，
 * 只是那一格永遠是 schema 的預設值，而操作者在畫面上看不出少了東西。
 *
 * `config.combat-feel@1` 現在就正在被 GH#216 那條 lane 改（它今晚才長出
 * `respectLiveSteering` 與 `ccPausesStall` 兩格）。所以這一支讀 Zod 本身：
 * lane 加一格 → `deriveFields` 立刻多回傳一格 → 標籤表少一條 → 測試紅。
 * 那個紅燈就是「後台漂走了」的唯一警報。
 *
 * ── 為什麼呼叫端 import schema 不會胖到 bundle ────────────────────────────
 * 這一支自己**不 import 任何東西**（見下面的 `ZodNode`）。而呼叫它的
 * `combatFeel.ts` / `matchConfig.ts` 會 import `zConfig*Doc`，那也一個 byte 都
 * 不多花：`api.ts` → `contentOverlay.ts` → `@ggd/shared/content` 的 `COLLECTIONS`
 * 已經把整棵 Zod schema 拉進**急切載入**的 admin bundle 了（那是 #283 的驗證閘）。
 * （`mobWaves.ts` 的檔頭寫「不能 import schema，會把 zod 拉進來」—— 那句話在
 *  #283 落地之後就過期了，zod 早就在 bundle 裡。這裡不重複那個假設。）
 *
 * ── 邊界：這支**只**認得「可以放進一個輸入框的東西」 ─────────────────────
 * 數字與布林會變成欄位；字串 / literal / record / array / enum 會被收進
 * `unsupported`，呼叫端要**明確**列出它預期看到哪些（`draft.tierSchedule`
 * 就是一個），這樣一份新的 record 冒出來時也會有人發現。
 */
/**
 * ⚠️ **不**從 `"zod"` import 型別。`apps/admin` 的 package.json 沒有把 zod 列為
 * 直接相依（zod 是 `@ggd/shared` 的相依），pnpm 的嚴格 node_modules 因此讓
 * `import type { ZodTypeAny } from "zod"` 在 `tsc --noEmit` 直接 TS2307。
 * 加一條相依會動到 lockfile，而 lockfile 是這個 repo 目前唯一會撞車的檔案 ——
 * 所以這裡用**結構型別**描述需要的那幾個欄位，一個相依都不加。
 *
 * 這只描述「走訪一棵 zod schema 需要的最小面」：`_def.typeName` 決定型別，
 * `_def.schema` / `_def.innerType` 是包裝層的內層，`shape` 是物件的欄位，
 * `unwrap()` 是 optional/nullable 的解包。
 */
interface ZodNode {
  _def: {
    typeName?: string;
    schema?: unknown;
    innerType?: unknown;
    checks?: { kind: string; value?: number; inclusive?: boolean }[];
  };
  unwrap?: () => unknown;
  shape?: Record<string, unknown>;
}

/** 一格的型別。`int` 是「必須是整數」的數字 —— tick 數與金錢都是。 */
export type FieldKind = "number" | "int" | "boolean";

export interface DerivedField {
  /** 從文件根算起的路徑，例如 `autoEngage.stallTicks` / `match.fireRing.startSec` */
  path: string;
  kind: FieldKind;
  /** Zod 宣告的下界；null = schema 沒有下界 */
  min: number | null;
  /** true = 下界是**開區間**（`z.number().positive()` 是 `> 0`，不是 `>= 0`） */
  minExclusive: boolean;
  /** Zod 宣告的上界；⚠️ null = schema **沒有上界**，呼叫端必須自己補一個 */
  max: number | null;
  maxExclusive: boolean;
  /**
   * 這一格自己是不是 `.optional()`（空白 = 不寫進文件）。
   * ⚠️ 和 `optionalAncestors` 不同：這一格可選，不代表整個區塊可選。
   */
  optional: boolean;
  /** 這一格頭上有哪些 `.optional()` 的**區塊**（例如 `match.fireRing`）。 */
  optionalAncestors: string[];
}

export interface DerivedSchema {
  fields: DerivedField[];
  /** 走到但放不進輸入框的葉子（record / array / string / literal / enum…） */
  unsupported: { path: string; typeName: string }[];
  /** 每一個 `.optional()` 的物件區塊 —— 頁面要替它畫一個「啟用／停用」開關 */
  optionalBlocks: string[];
}

type ZodDefLike = ZodNode["_def"];

/** 把任何東西當成一個 zod 節點來看它的 `_def`（缺 `_def` 時給一個空的）。 */
function defOf(s: unknown): ZodDefLike {
  const node = s as ZodNode | null | undefined;
  return node && typeof node === "object" && node._def ? node._def : {};
}

/**
 * 剝掉所有包裝層直到碰到真正的型別。
 *
 * ⚠️ `ZodEffects` 一定要剝：`config@1` 的 `match` 區塊掛了**兩個** `.refine()`
 * （火圈必須在硬底線之前收完，殭屍王延長之後也一樣），所以 `shape.match` 不是
 * `ZodObject` 而是兩層 `ZodEffects`。少了這一行，整個 `match` 區塊 —— 回合秒數、
 * 起始隊伍生命、火圈 —— 會被當成「無法編輯的葉子」整塊消失，而畫面上只會少
 * 一個區段，不會有任何錯誤。
 */
function unwrap(s: unknown): { node: unknown; optional: boolean; viaDefault: boolean } {
  let node = s;
  let optional = false;
  let viaDefault = false;
  for (;;) {
    const t = defOf(node).typeName;
    if (t === "ZodOptional" || t === "ZodNullable") {
      optional = true;
      node = (node as ZodNode).unwrap!();
      continue;
    }
    /**
     * `.default(…)` 讓一格在文件裡缺席也合法 —— 對「這一格可以留白嗎」來說和
     * `.optional()` 同義，但對**區塊開關**來說完全不同：缺席的 `.default()` 區塊
     * 會被 loader 的 `schema.parse` 補回來，所以它不是「關掉這個功能」的意思。
     * `match.fireRing.boss` 正是這種：`.default({})`，刪掉它不會關掉殭屍王延長。
     */
    if (t === "ZodDefault") {
      optional = true;
      viaDefault = true;
      node = defOf(node).innerType;
      continue;
    }
    if (t === "ZodEffects") {
      node = defOf(node).schema;
      continue;
    }
    return { node, optional, viaDefault };
  }
}

function boundsOf(s: unknown): Pick<DerivedField, "min" | "minExclusive" | "max" | "maxExclusive"> {
  const checks = defOf(s).checks ?? [];
  let min: number | null = null;
  let minExclusive = false;
  let max: number | null = null;
  let maxExclusive = false;
  for (const c of checks) {
    if (c.kind === "min" && typeof c.value === "number") {
      if (min === null || c.value > min) {
        min = c.value;
        minExclusive = c.inclusive === false;
      }
    }
    if (c.kind === "max" && typeof c.value === "number") {
      if (max === null || c.value < max) {
        max = c.value;
        maxExclusive = c.inclusive === false;
      }
    }
  }
  return { min, minExclusive, max, maxExclusive };
}

function isInt(s: unknown): boolean {
  return (defOf(s).checks ?? []).some((c) => c.kind === "int");
}

/**
 * 走一份 doc schema，回傳所有「填得進輸入框」的葉子。
 *
 * `id` 與 `schema` 兩格永遠跳過：它們是文件的身分，不是設定值，而且
 * `validateOverlayDoc` 會在 PUT 之前檢查 `id` 和路徑相符。
 */
export function deriveFields(root: unknown): DerivedSchema {
  const fields: DerivedField[] = [];
  const unsupported: { path: string; typeName: string }[] = [];
  const optionalBlocks: string[] = [];

  const visit = (path: string, schema: unknown, optionalAncestors: string[]): void => {
    const { node, optional, viaDefault } = unwrap(schema);
    const t = defOf(node).typeName;

    if (t === "ZodObject") {
      // ⚠️ 只有**真的 `.optional()`** 的區塊才是一個「有／沒有」的決策；
      // `.default({})` 的區塊刪掉會被 loader 補回來，畫一個開關給它是騙人的。
      const togglable = optional && !viaDefault && path !== "";
      const nextAncestors = togglable ? [...optionalAncestors, path] : optionalAncestors;
      if (togglable) optionalBlocks.push(path);
      const shape = (node as ZodNode).shape ?? {};
      for (const key of Object.keys(shape)) {
        const child = path === "" ? key : `${path}.${key}`;
        if (path === "" && (key === "id" || key === "schema")) continue;
        visit(child, shape[key], nextAncestors);
      }
      return;
    }
    if (t === "ZodNumber") {
      fields.push({
        path,
        kind: isInt(node) ? "int" : "number",
        ...boundsOf(node),
        optional,
        optionalAncestors,
      });
      return;
    }
    if (t === "ZodBoolean") {
      fields.push({
        path,
        kind: "boolean",
        min: null,
        minExclusive: false,
        max: null,
        maxExclusive: false,
        optional,
        optionalAncestors,
      });
      return;
    }
    unsupported.push({ path, typeName: t ?? "unknown" });
  };

  visit("", root, []);
  return { fields, unsupported, optionalBlocks };
}

// ------------------------------------------------------------ path utils ----

/** 讀一條點路徑上的值；中途缺物件就回 undefined。 */
export function getAtPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** 寫一條點路徑；中途缺物件就補一個。回傳同一個 root（原地修改）。 */
export function setAtPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split(".");
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    const next = cur[seg];
    if (!next || typeof next !== "object" || Array.isArray(next)) cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1] as string] = value;
}

/** 刪掉一條點路徑（用於「空白 = 不寫這一格」的 optional 欄位）。 */
export function deleteAtPath(root: Record<string, unknown>, path: string): void {
  const segs = path.split(".");
  let cur: unknown = root;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!cur || typeof cur !== "object") return;
    cur = (cur as Record<string, unknown>)[segs[i] as string];
  }
  if (cur && typeof cur === "object") delete (cur as Record<string, unknown>)[segs[segs.length - 1] as string];
}

// ------------------------------------------------------------- validation ---

/**
 * 一格的**生效**上下界 = Zod 的界，缺的那一邊由後台自己補（`consoleMax`）。
 *
 * ⚠️ 這不是保險起見。`config@1` 的 31 個數字欄位裡有 **22 個在 Zod 只有下界**
 * （`combatMaxSec: z.number().positive()`、`startingGold: z.int().min(0)` …）。
 * CLAUDE.md #277：「50 打成 500 會過後台」。schema 不是我的領域，所以護欄補在
 * 這裡，而且 `boundedFields` 那條測試要求**每一格都補到**。
 */
export interface FieldBounds {
  min: number;
  minExclusive: boolean;
  max: number;
  /** true = 上界是後台補的，schema 本身沒有 —— 畫面上要說出來 */
  maxFromConsole: boolean;
}

export function boundsFor(
  field: DerivedField,
  consoleMax: Readonly<Record<string, number>>,
): FieldBounds | null {
  if (field.kind === "boolean") return null;
  const extra = consoleMax[field.path];
  const max = field.max ?? extra;
  if (max === undefined) {
    throw new Error(
      `欄位 ${field.path} 兩邊都沒有上界 —— schema 沒宣告，後台也沒補。` +
        `這正是 #277 的形狀（50 打成 500 會過後台），請補進 CONSOLE_MAX。`,
    );
  }
  return {
    min: field.min ?? 0,
    minExclusive: field.min !== null && field.minExclusive,
    max,
    maxFromConsole: field.max === null,
  };
}

/**
 * 驗一格操作者打進去的字。回傳 null = 合法，否則是給人看的中文理由。
 *
 * 空字串在 `allowEmpty`（optional 欄位）時是合法的「不設定」；其餘一律拒絕 ——
 * 空字串 `Number("")` 是 0，靜靜地把「我還沒填」變成「我要 0」。
 */
export function validateNumeric(
  raw: string,
  bounds: FieldBounds,
  kind: FieldKind,
  allowEmpty: boolean,
): string | null {
  const text = raw.trim();
  if (text === "") return allowEmpty ? null : "不能空白";
  const n = Number(text);
  if (!Number.isFinite(n)) return "不是一個數字";
  if (kind === "int" && !Number.isInteger(n)) return "必須是整數";
  if (bounds.minExclusive ? n <= bounds.min : n < bounds.min) {
    return bounds.minExclusive ? `必須大於 ${bounds.min}` : `不能小於 ${bounds.min}`;
  }
  if (n > bounds.max) return `不能大於 ${bounds.max}`;
  return null;
}
