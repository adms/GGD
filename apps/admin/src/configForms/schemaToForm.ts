/**
 * `schemaToForm()` —— 後台設定表單的**語意那一半也從 Zod 推導**（GH#992 Scope 1）。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 它要治的病，以及為什麼藥不是「再拆一次檔」
 * ════════════════════════════════════════════════════════════════════════════
 * `configForms.ts` 的檔頭寫著這支引擎的形狀是「**結構自動、語意強制手寫**」，
 * 而那句話在 2026-08-27 拆檔（`configForms.ts` 5,783 行 → 16 份 `specs/*.ts`）
 * 之後**一個字都沒有變**：結構仍然從 Zod 走出來，語意仍然是一格一格打的。
 *
 * ⭐ 當場量到的（2026-09-05，`CONFIG_DOC_SPECS` 逐份走 `walkZod`，⛔ 不是引用票文）：
 *
 * | | |
 * |---|---:|
 * | 註冊的 spec | **71**（住 17 個檔） |
 * | 手寫的 `fields[]` 標籤 | **963** |
 * | schema 走出來的純量葉 | **1,140** |
 * | 葉子帶著 `.describe()` 的 | **173**（15.2%） |
 * | ⭐ 同時有 `.describe()` **與**手寫 `note` 的 | **164** |
 * | ⭐ 那 164 對裡**逐字相等**的 | **0** |
 *
 * ⇒ 最後兩列就是第〇·四守則的病灶本身：**同一句人話有兩個住處，而它們已經漂了**。
 * ⛔ 第〇·七守則的「拆檔」治不了它（檔已經拆過了）—— 這是「一行接線」病：
 * 每加一個 Zod 欄位就要在別的檔補一列手寫標籤，⭐ 而那一列是**機械的**。
 * ⇒ 藥是**自動推導**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 翻不過去就去實作那個標籤（第〇·五守則），⛔ 不是用現有欄位湊一個像的
 * ════════════════════════════════════════════════════════════════════════════
 * 一格後台欄位需要的東西比 `.describe()` 的**一個字串**多：短名（`zh`）、
 * 「它影響什麼」（`note`）、enum 每一個選項的中文（`optionLabels`）。
 * ⛔ 用 `humanize(path)` 生一個「Max Pooled Rings」當短名**不是**推導，那是近似 ——
 * `configForms.ts` 的檔頭逐字說過那「不叫可調，那叫 JSON 編輯器」。
 *
 * ⇒ 所以這裡**實作缺的標籤**：`.describe()` 裡的**行首指令**。
 *
 * ```ts
 * enabled: z.boolean().describe(
 *   "@zh 級距總開關\n" +
 *   "@note 關掉之後 msGrowthTier / asGrowthTier 不解析，每一位回到英雄卡上手寫的成長。",
 * ),
 * ladder: z.enum(["A", "B"]).describe(
 *   "@zh 用哪一把梯子\n" +
 *   "@note owner 2026-08-21 給的兩個候選，出貨 A。\n" +
 *   "@opt A A（預設・保守）\n" +
 *   "@opt B B（激進）",
 * ),
 * ```
 *
 * | 指令 | 給誰 | 幾次 |
 * |---|---|---|
 * | `@zh <短名>` | `ConfigFieldLabel.zh` | 1 |
 * | `@note <正文>` | `ConfigFieldLabel.note`（可跨行，直到下一個 `@`） | 1 |
 * | `@opt <值> <中文>` | `ConfigFieldLabel.optionLabels[值]` | 每個 enum 選項一次 |
 * | `@order <整數>` | 畫面排序鍵（⛔ 不是宣告順序） | 0–1 |
 *
 * ⚠️ **刻意沒有 `@min` / `@max`**：上下界住 Zod，`boundsFor()` 已經在「兩份上界」
 * 上丟例外。⭐ 一個指令如果會造出第二個住處，它就不該存在（第〇·四守則）。
 *
 * ⚠️ **⛔ 沒有指令的 `.describe()` 一律整段當 `note`** —— 今天那 173 個描述因此
 * 一個字都不用改就有值；它們缺的只是 `@zh`，⭐ 而 {@link handWrittenResidue}
 * 會逐格指名這件事。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠️ 今天推導不到的（誠實列出來，⛔ 不要假裝它們不存在）
 * ════════════════════════════════════════════════════════════════════════════
 * · **`pattern` / `patternError`**（27 格：`item-card` 10 · `damage-colors` 9 · `range-guide` 8）——
 *   Zod **有** `.regex()`，⛔ 但 `walkZod` 的 `UIText` 不帶它（`apps/editor/src/form/uiSchema.ts`）。
 *   ⇒ 缺的標籤是「把 `ZodString` 的 regex check 帶進 IR」，而那個檔在**另一條**
 *   路徑柵欄裡 ⇒ 這一批只**指名**它，⛔ 不在這裡另寫一支走訪器（那就是第二份會漂的
 *   「Zod 長什麼樣」的知識 —— `engine.ts` 的檔頭正是為了不要那個才重用 walker 的）。
 * · **補上下界**（33 格，全部在 `config.arena-rules@1`）—— 正解是把界寫回 Zod，
 *   ⛔ 不是在這裡開一個 `@max` 指令。
 */
import { walkZod } from "../../../editor/src/form/walk";
import type { UINode } from "../../../editor/src/form/uiSchema";
import {
  DOC_META_PATHS,
  elsewhereCovers,
  type ConfigDocSpec,
  type ConfigFieldLabel,
  type ConfigZodSchema,
} from "./engine";

/** 走訪器歸類成「可以填一個值」的四種節點。與 `readSchema()` 同一組，刻意。 */
const SCALAR_KINDS: ReadonlySet<UINode["kind"]> = new Set(["number", "boolean", "enum", "text"]);

/** 行首指令的正則。`@zh` / `@note` / `@order` 吃一段值，`@opt` 吃「值 + 中文」。 */
const DIRECTIVE = /^@(zh|note|opt|order)[ \t]+([\s\S]*?)(?=\n@(?:zh|note|opt|order)[ \t]|$)/gm;

/** 一格從 Zod 推導出來的表單欄位。⭐ 形狀刻意就是 {@link ConfigFieldLabel}。 */
export interface DerivedField extends ConfigFieldLabel {
  /** 點路徑的前綴（`growth.A.ms.極大` → `growth.A.ms`）；頂層純量是 `""`。 */
  group: string;
  /** 畫面排序鍵：`@order` 給的數字，沒給就是**宣告順序**。 */
  order: number;
}

/** 一份 schema 推導出來的整張表單。 */
export interface SchemaForm {
  fields: DerivedField[];
  /** 依 `group` 收攏，順序跟著各組**第一格**的 `order` 走。 */
  groups: { key: string; paths: string[] }[];
}

/**
 * 這一格**今天還必須手寫**的理由。⛔ 空陣列才代表「推導取代得了手寫」。
 *
 * ⚠️ 每一個值都指名**缺的標籤**，⛔ 不是「推導不出來」這種說不出下一步的話。
 */
export type HandWrittenReason = "zh" | "note" | "optionLabels" | "pattern" | "bounds";

/** 一格的欠帳。 */
export interface HandWrittenRow {
  path: string;
  reasons: HandWrittenReason[];
}

/** `.describe()` 拆成指令。沒有任何指令 ⇒ 整段是 `note`（今天 173 個描述走這條）。 */
function parseDirectives(raw: string | undefined): {
  zh?: string;
  note?: string;
  opt: Record<string, string>;
  order?: number;
} {
  const opt: Record<string, string> = {};
  if (!raw) return { opt };
  const out: { zh?: string; note?: string; opt: Record<string, string>; order?: number } = { opt };
  let matched = false;
  for (const m of raw.matchAll(DIRECTIVE)) {
    matched = true;
    const value = m[2]!.trim();
    switch (m[1]) {
      case "zh":
        out.zh = value;
        break;
      case "note":
        out.note = value;
        break;
      case "order": {
        const n = Number(value);
        if (Number.isFinite(n)) out.order = n;
        break;
      }
      case "opt": {
        // 「<選項字面值><空白><中文>」——選項值本身不含空白（Zod enum 的值）。
        const sep = value.search(/[ \t]/);
        if (sep > 0) opt[value.slice(0, sep)] = value.slice(sep + 1).trim();
        break;
      }
    }
  }
  if (!matched) out.note = raw.trim();
  return out;
}

/** schema 的純量葉，帶著描述與 enum 選項（`readSchema()` 把描述丟掉了）。 */
function scalarLeaves(zod: ConfigZodSchema): UINode[] {
  const out: UINode[] = [];
  const visit = (node: UINode): void => {
    if (node.path !== "" && DOC_META_PATHS.includes(node.path)) return;
    if (node.kind === "object") {
      for (const f of node.fields) visit(f);
      return;
    }
    if (SCALAR_KINDS.has(node.kind)) out.push(node);
  };
  visit(walkZod(zod, "", "文件"));
  return out;
}

/**
 * 一份 Zod schema → 一張表單（欄位 · 分組 · 順序）。
 *
 * ⚠️ 只放**推導得出來**的東西：`.describe()` 沒有 `@zh` 的那一格就**沒有** `zh`，
 * ⛔ 不會回填一個 `humanize(path)` —— 一個編出來的短名會讓 {@link handWrittenResidue}
 * 看起來已經還清，而操作者拿到的是一格看不懂的英文（`configForms.ts` 檔頭）。
 */
export function schemaToForm(zod: ConfigZodSchema): SchemaForm {
  const fields: DerivedField[] = scalarLeaves(zod).map((leaf, i) => {
    const d = parseDirectives((leaf as { description?: string }).description);
    const segs = leaf.path.split(".");
    return {
      path: leaf.path,
      // `zh` 缺席時填空字串（型別要求它在）—— ⭐ 判「有沒有推導出來」一律問
      // `handWrittenResidue()`，⛔ 不是看這一格長不長。
      zh: d.zh ?? "",
      note: d.note ?? "",
      ...(Object.keys(d.opt).length > 0 ? { optionLabels: d.opt } : {}),
      group: segs.length > 1 ? segs.slice(0, -1).join(".") : "",
      order: d.order ?? i,
    };
  });
  fields.sort((a, b) => a.order - b.order);
  const groups: SchemaForm["groups"] = [];
  const seen = new Map<string, string[]>();
  for (const f of fields) {
    let bucket = seen.get(f.group);
    if (!bucket) {
      bucket = [];
      seen.set(f.group, bucket);
      groups.push({ key: f.group, paths: bucket });
    }
    bucket.push(f.path);
  }
  return { fields, groups };
}

/**
 * 一格**只有 Zod 給不出來的那一半**：`pattern` / `patternError`（走訪器不帶 regex）與
 * 補的上下界（正解是寫回 Zod，⛔ 這裡只是過渡）。`zh` / `note` / `optionLabels` 也收，
 * 但那是**覆寫**，⛔ 不是第二個住處 —— 棘輪會把它算成欠帳。
 */
export interface FieldOverride extends Partial<ConfigFieldLabel> {
  path: string;
}

/**
 * 一份 spec 的 `fields[]` **從 Zod 推導**，手寫的只剩覆寫（GH#992 Scope 1 第二批）。
 *
 * ⭐ 順序＝schema 的宣告順序（或 `@order`）—— 一個決定只住一個地方（第〇·四守則）；
 * 覆寫**合併**進同一格（`{...derived, ...override}`），⛔ 不是接在後面變成第二筆
 * （那會讓 `configForms.test.ts` 的「恰好一筆」紅）。
 *
 * ⚠️ `except` 給 `elsewhere`（別頁在編的那幾格這一頁不畫）—— 只有 arena-rules 用得到。
 * ⚠️ 覆寫指到一條 schema 沒有的路徑 ⇒ 原樣附在最後，讓 `fieldRows()` 用它既有的
 *   訊息炸出來（「標籤表寫了 X，但 schema 沒有這個欄位」），⛔ 不在這裡靜默丟掉。
 */
export function derivedFields(
  zod: ConfigZodSchema,
  overrides: readonly FieldOverride[] = [],
  opts: { except?: (path: string) => boolean } = {},
): ConfigFieldLabel[] {
  const byPath = new Map(overrides.map((o) => [o.path, o]));
  const out: ConfigFieldLabel[] = [];
  for (const f of schemaToForm(zod).fields) {
    if (opts.except?.(f.path)) continue;
    const o = byPath.get(f.path);
    byPath.delete(f.path);
    out.push(o ? { ...f, ...o } : f);
  }
  for (const o of byPath.values()) out.push(o as ConfigFieldLabel);
  return out;
}

/**
 * 一份 spec 裡**今天還必須手寫**的欄位，逐格帶著理由。
 *
 * ⭐ 這是棘輪量的那個數字（`packages/shared/src/ops/adminFormsHandWrittenRatchet.test.ts`）：
 * 一份 schema 補上 `@zh` / `@opt` ⇒ 那幾列從這裡消失 ⇒ 棘輪要求把基準線調低。
 *
 * ⚠️ 走的是 spec 的 `fields[]`（＝**真的畫在畫面上**的那些），⛔ 不是 schema 的葉子：
 * `elsewhere` 涵蓋的葉子這一頁本來就不畫，把它們算進欠帳等於替一份不存在的手寫記帳。
 */
export function handWrittenResidue(spec: ConfigDocSpec): HandWrittenRow[] {
  const derived = new Map(schemaToForm(spec.zod).fields.map((f) => [f.path, f]));
  const rows: HandWrittenRow[] = [];
  for (const label of spec.fields) {
    if (elsewhereCovers(spec, label.path)) continue;
    const d = derived.get(label.path);
    const reasons: HandWrittenReason[] = [];
    if (!d?.zh) reasons.push("zh");
    if (!d?.note) reasons.push("note");
    if (label.optionLabels && !Object.keys(label.optionLabels).every((k) => d?.optionLabels?.[k]))
      reasons.push("optionLabels");
    if (label.pattern) reasons.push("pattern");
    if (label.min !== undefined || label.max !== undefined) reasons.push("bounds");
    if (reasons.length > 0) rows.push({ path: label.path, reasons });
  }
  return rows;
}

// ══════════════════════════════════════════════════════════════════════════
// ⭐ 整份 spec 從 Zod 推導（GH#992 AC①「新增一份 config 只需要 Zod 那一份」）
// ══════════════════════════════════════════════════════════════════════════
//
// 欄位那一半已經由 {@link derivedFields} 推導；剩下的**文件層**語意（標題／段落／誰讀它／
// 什麼時候生效／左欄那一列／不編輯的分支為什麼要帶著走）在此之前仍然逐份手打在
// `specs/*.ts` —— 而它們**每一格都有一個 Zod 節點可以住**：根節點的 `.describe()`
// 收文件層指令，非純量分支的 `.describe()` 收 `@preserve <為什麼>`。
//
// | 指令（根節點） | 給誰 |
// |---|---|
// | `@title <標題>` | `ConfigDocSpec.title` |
// | `@intro <段落>`（可重複，每一次一段） | `intro[]` |
// | `@consumer <誰真的會讀這份文件>` | `consumer`（`configForms.test.ts` 會驗那個檔真的存在） |
// | `@effect <存檔之後什麼時候生效>` | `effect` |
// | `@nav <emoji> <分組> <標籤>` | `nav`（左欄那一列由 `ui/App.tsx` 自動長出來） |
// | `@preserve <掉了會怎樣>`（放在**分支**上） | `preserved[]` |
//
// ⛔ `page` **不是**指令：它是 `store.ts` 的 `Page` union 的字面型別（GH#807），
//   而 TS 拿不到執行期字串的字面型別 ⇒ 它由呼叫端那一行給（`specFromZod(zod, "woundRules")`）。
//   那一行同時是 `CONFIG_DOC_SPECS` 的順序（一個決定），所以「一份 config ＝ Zod ＋ 一行」。
// ⛔ `docId` / `schemaTag` 也不是指令：`schema: z.literal("config.wounds@1")` 已經寫著，
//   再打一次就是第二個住處（`configDocCoverage.test.ts` 本來就要求 id ＝ 檔名 ＝ 那一段）。

const DOC_DIRECTIVE =
  /^@(title|intro|consumer|effect|nav|preserve)[ \t]+([\s\S]*?)(?=\n@(?:title|intro|consumer|effect|nav|preserve)[ \t]|$)/gm;

interface DocDirectives {
  title?: string;
  intro: string[];
  consumer?: string;
  effect?: string;
  nav?: ConfigDocSpec["nav"];
  preserve?: string;
}

function parseDocDirectives(raw: string | undefined): DocDirectives {
  const out: DocDirectives = { intro: [] };
  if (!raw) return out;
  for (const m of raw.matchAll(DOC_DIRECTIVE)) {
    const value = m[2]!.trim();
    switch (m[1]) {
      case "title":
        out.title = value;
        break;
      case "intro":
        out.intro.push(value);
        break;
      case "consumer":
        out.consumer = value;
        break;
      case "effect":
        out.effect = value;
        break;
      case "preserve":
        out.preserve = value;
        break;
      case "nav": {
        // `<emoji> <分組> <標籤>` —— 分組名不含空白（畫面·演出 / 五級距·數值 …），標籤可以含。
        const [emoji, section, ...label] = value.split(/[ \t]+/);
        if (emoji && section && label.length > 0) out.nav = { emoji, section, label: label.join(" ") };
        break;
      }
    }
  }
  return out;
}

/** 走訪器歸類成「不編輯的分支」的那些（與 `readSchema()` 的 `default:` 那一支同一組）。 */
const BRANCH_KINDS: ReadonlySet<UINode["kind"]> = new Set([
  "array",
  "tuple",
  "record",
  "discriminatedUnion",
  "unknown",
]);

/** 一份 spec 裡**還不能**從 Zod 推導的那幾格（曲線／對照表／別頁在編的／欄位覆寫）。 */
export interface SpecExtras {
  curve?: ConfigDocSpec["curve"];
  tables?: ConfigDocSpec["tables"];
  elsewhere?: ConfigDocSpec["elsewhere"];
  overrides?: readonly FieldOverride[];
}

/**
 * 一份 Zod schema ＋ 一個路由 key ⇒ 一整份 {@link ConfigDocSpec}。
 *
 * ⚠️ 缺 `@title` / `@consumer` / `@effect` 就**丟例外**（模組載入期）：一份沒有這三格的
 * 設定頁畫出來是空白標題與一句空的「誰讀它」，而 `configForms.test.ts` 對 `consumer`
 * 的檢查（那個檔真的存在）本來就會紅 —— 這裡只是把紅提前到 import 那一刻並指名文件。
 * ⚠️ 非純量分支沒有 `@preserve` ⇒ **不**在這裡補一句 —— 留給 `configForms.test.ts`
 * 「每一個分支都被宣告過」那一條紅並指名（同一條閘，⛔ 不開第二條）。
 */
export function specFromZod<P extends string>(
  zod: ConfigZodSchema,
  page: P,
  extras: SpecExtras = {},
): ConfigDocSpec<P> {
  const root = walkZod(zod, "", "文件");
  if (root.kind !== "object") throw new Error(`specFromZod(${page}): 根節點不是 z.object`);
  const doc = parseDocDirectives(root.description);
  const schemaNode = root.fields.find((f) => f.path === "schema");
  const schemaTag = schemaNode?.kind === "literal" ? String(schemaNode.value) : "";
  const docId = /^config\.(.+)@\d+$/.exec(schemaTag)?.[1];
  if (!docId) throw new Error(`specFromZod(${page}): schema 欄位不是 config.<id>@N 的字面值（${schemaTag}）`);
  for (const k of ["title", "consumer", "effect"] as const) {
    if (!doc[k]) throw new Error(`specFromZod(${page}): ${docId} 的 Zod 根節點缺 @${k}`);
  }
  const preserved: ConfigDocSpec["preserved"] = [];
  for (const f of root.fields) {
    if (DOC_META_PATHS.includes(f.path) || !BRANCH_KINDS.has(f.kind)) continue;
    if (f.path === extras.curve?.path || extras.tables?.some((t) => t.path === f.path)) continue;
    const why = parseDocDirectives(f.description).preserve;
    if (why) preserved.push({ path: f.path, why });
  }
  const elsewhere = extras.elsewhere;
  const except = elsewhere
    ? (path: string): boolean => elsewhere.some((e) => path === e.path || path.startsWith(`${e.path}.`))
    : undefined;
  return {
    page,
    collection: "config",
    docId,
    schemaTag,
    zod,
    title: doc.title!,
    intro: doc.intro,
    consumer: doc.consumer!,
    effect: doc.effect!,
    fields: derivedFields(zod, extras.overrides ?? [], except ? { except } : {}),
    preserved,
    ...(doc.nav ? { nav: doc.nav } : {}),
    ...(extras.curve ? { curve: extras.curve } : {}),
    ...(extras.tables ? { tables: extras.tables } : {}),
    ...(elsewhere ? { elsewhere } : {}),
  };
}
