/**
 * ⭐⭐ **積木清冊（`ggd-bricks@1`）** —— GH#989。
 *
 * owner 2026-09-05（逐字）：
 * > 「[後台編輯器及codex編輯器] 是**堆積木**的角色 **要充分了解有哪些積木**,
 * >  而 main 遊戲主程式 是**做出積木**供使用的角色」
 * > 「所以後台編輯器的**抽象化、完整性、視覺化可操作性**很重要，
 * >  因為**所有功能都要可 JSON 操作設定**」
 *
 * ── ⭐ 這一份存在的理由 ────────────────────────────────────────────────────
 * 「有哪些積木」在此之前要讀**四份**契約才拼得出來
 * （runtime-capabilities ／ type-catalog ／ brick-census ／ editor-coverage），
 * ⛔ 而**沒有一份**回答「這顆積木在後台／在 Codex 編輯器**有沒有表單**」——
 * 也就是 owner 那句「**完整性**」量得到的樣子。
 *
 * ⇒ 這一份是**推導**出來的（⛔ 不是手寫的清單）：同一個 `buildCapabilityManifest()`
 *   ＋ 模板 registry ＋ vfx Zod enum ＋ 出貨內容 ＋ **後台自己的走訪器**。
 *   ⚠️ 第〇·五守則逐字記過：手寫的 `SIM_CAPABILITIES` **撒過兩次謊**，
 *   而外部編輯器看不到我們的 registry ⇒ ⛔ 沒有辦法發現我們在說謊。
 *
 * ── ⛔ 刻意沒有產生時間戳 ─────────────────────────────────────────────────
 * 同 `caps:export`：任何隨時鐘變動的欄位都會讓逐位元組 `--check` 永遠不相等，
 * 於是它被放寬 —— ⭐ 而一條被放寬的閘等於沒有閘。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildCapabilityManifest } from "@ggd/shared/content/editorCapabilities";
import { zEffectDefUnion } from "@ggd/shared/content/schema/effect";
import { zConditionLeaf } from "@ggd/shared/content/schema/condition";
import { zHookDefBase } from "@ggd/shared/content/schema/effects/_hook";
import { zVfxPrimitiveKind, zVfxPresentation } from "@ggd/shared/content/schema/vfx";
import { PRESET_FIELDS } from "@ggd/shared/content/modelFxPreset";
import { CONFIG_DOC_SPECS } from "../../apps/admin/src/configForms";
import { readSchema } from "../../apps/admin/src/configForms/engine";
import { PRIMITIVE_KINDS, ELEMENT_IDS, GROUND_DECAL_IDS } from "../../apps/admin/src/vfxForge";

// ────────────────────────────────────────────────────────────────── 型別 ────

export type BrickLayer =
  | "effect"
  | "hook"
  | "leaf"
  | "template"
  | "vfx-prim"
  | "vfx-subtype"
  | "model-preset";

export interface BrickParam {
  name: string;
  /** `number` / `enum` / `boolean` / `string` / `object` / `array` / … —— 從 Zod 或槽位型別讀出來 */
  type: string;
  /** ⭐ 這一格是**級距**（第〇·四守則：文件只寫級別名，值在載入時從共用表解析） */
  tier?: boolean;
  /** enum 的可選值 */
  values?: string[];
  optional?: boolean;
  /** 模板槽位才有：實測預設 */
  default?: unknown;
  /** ⭐ 模板槽位才有：`default` 的**出處**（`j:` / `census:` / `owner:` / `derived:` / `taxonomy:` / `inert`） */
  origin?: string;
  /** ⛔ 這一格在出貨設定下產不出任何東西 —— 值就是**理由** */
  inert?: string;
}

export interface Brick {
  id: string;
  layer: BrickLayer;
  params: BrickParam[];
  /** ⭐ 後台有沒有一格表單碰得到這顆積木（量法見 `adminFormSource`） */
  adminForm: boolean;
  /** ⚠️ ⭐ **代理值** —— 量法見 `editorFormSource`，⛔ 不是「apps/editor 真的有表單」 */
  editorForm: boolean;
  /** 今天被幾份出貨文件用到 */
  usedBy: number;
  /** ⭐ 這顆積木的**存在**是從哪裡推導出來的（⛔ 不是散文，是一個查得到的住處） */
  origin: string;
}

// ───────────────────────────────────────────────────── Zod 內省（小工具） ────

interface ZodLike {
  _def?: {
    typeName?: string;
    options?: unknown[];
    values?: unknown[];
    innerType?: unknown;
    schema?: unknown;
    type?: unknown;
  };
  shape?: Record<string, unknown>;
}

/** ⭐ 剝掉 optional / nullable / default / effects 等包裝，回到真正的節點。 */
function unwrap(z: unknown): ZodLike {
  let cur = z as ZodLike;
  for (let i = 0; i < 12; i += 1) {
    const t = cur?._def?.typeName;
    if (
      t === "ZodOptional" ||
      t === "ZodNullable" ||
      t === "ZodDefault" ||
      t === "ZodEffects" ||
      t === "ZodLazy" ||
      t === "ZodBranded" ||
      t === "ZodReadonly"
    ) {
      const inner = cur._def?.innerType ?? cur._def?.schema ?? cur._def?.type;
      if (inner === undefined) return cur;
      if (typeof inner === "function") {
        cur = (inner as () => unknown)() as ZodLike;
        continue;
      }
      cur = inner as ZodLike;
      continue;
    }
    return cur;
  }
  return cur;
}

function isOptional(z: unknown): boolean {
  const t = (z as ZodLike)?._def?.typeName;
  return t === "ZodOptional" || t === "ZodDefault";
}

const ZOD_TYPE_NAMES: Record<string, string> = {
  ZodNumber: "number",
  ZodString: "string",
  ZodBoolean: "boolean",
  ZodEnum: "enum",
  ZodNativeEnum: "enum",
  ZodLiteral: "literal",
  ZodArray: "array",
  ZodObject: "object",
  ZodTuple: "tuple",
  ZodUnion: "union",
  ZodDiscriminatedUnion: "union",
  ZodRecord: "record",
  ZodUnknown: "unknown",
  ZodAny: "unknown",
};

function describeZod(z: unknown): { type: string; values?: string[] } {
  const n = unwrap(z);
  const t = n?._def?.typeName ?? "";
  const type = ZOD_TYPE_NAMES[t] ?? t.replace(/^Zod/, "").toLowerCase() ?? "unknown";
  if (t === "ZodEnum") {
    const vs = (n._def?.values ?? []) as unknown[];
    return { type: "enum", values: vs.map(String) };
  }
  return { type };
}

/** ⭐ 級距欄位 —— 第〇·四守則的那一族（值在載入時從共用表解析）。 */
function isTierField(name: string): boolean {
  return /Tier$/.test(name);
}

function shapeOf(z: unknown): Record<string, unknown> {
  const n = unwrap(z);
  return (n?.shape ?? {}) as Record<string, unknown>;
}

/** 判別式聯集的每一支 —— `kind` 的字面值 → 那一支的欄位 shape。 */
function unionOptionsByKind(union: unknown): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  const opts = ((union as ZodLike)?._def?.options ?? []) as unknown[];
  for (const opt of opts) {
    const shape = shapeOf(opt);
    const kindNode = unwrap(shape["kind"]);
    const lit = (kindNode?._def as { value?: unknown } | undefined)?.value;
    if (typeof lit === "string") out.set(lit, shape);
  }
  return out;
}

function paramsFromShape(shape: Record<string, unknown>): BrickParam[] {
  return Object.entries(shape)
    .filter(([k]) => k !== "kind")
    .map(([name, node]) => {
      const d = describeZod(node);
      const p: BrickParam = { name, type: d.type };
      if (d.values) p.values = d.values;
      if (isTierField(name)) p.tier = true;
      if (isOptional(node)) p.optional = true;
      return p;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ───────────────────────────────────────────────────────── 出貨內容的量 ────

interface ContentScan {
  /** effect kind → 用到它的**技能文件**數 */
  effectKinds: Map<string, number>;
  /** hook event → 用到它的技能文件數 */
  hookEvents: Map<string, number>;
  /** condition leaf kind → 用到它的技能文件數 */
  leafKinds: Map<string, number>;
  /** 模板文件 id → 引用數（⭐ 文件級 `template.ref/.stack` **＋ 節點級 `spawnModelFx.preset`**） */
  templateDocRefs: Map<string, number>;
  /** 模板文件 id → 只算節點級 `preset` 的那一半 */
  presetRefs: Map<string, number>;
  /** vfx primitive → 用到它的文件數 */
  vfxPrimitives: Map<string, number>;
  /** vfx presentation → 用到它的文件數 */
  vfxPresentations: Map<string, number>;
}

function bump(m: Map<string, number>, k: string, n = 1): void {
  m.set(k, (m.get(k) ?? 0) + n);
}

function readJsonDir(root: string, rel: string): Array<[string, unknown]> {
  const dir = join(root, rel);
  const out: Array<[string, unknown]> = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    out.push([f, JSON.parse(readFileSync(join(dir, f), "utf8"))]);
  }
  return out;
}

/**
 * ⭐ 一份文件裡出現過的 `<key>` 字串值（⛔ 去重到**文件**層 —— 「幾支技能在用」
 * 才是「這塊積木有沒有人拿」的答案，⛔ 不是「總共貼了幾個節點」）。
 */
function stringValuesAt(doc: unknown, key: string): Set<string> {
  const out = new Set<string>();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (!n || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === key && typeof v === "string") out.add(v);
      walk(v);
    }
  };
  walk(doc);
  return out;
}

/** ⭐ 節點級 `spawnModelFx.preset`（⛔ **只有**那個 kind 的節點，不是任何一個叫 preset 的欄位）。 */
function presetsOf(doc: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o["kind"] === "spawnModelFx" && typeof o["preset"] === "string") out.push(o["preset"]);
    for (const v of Object.values(o)) walk(v);
  };
  walk(doc);
  return out;
}

/**
 * ⭐ 一份文件裡出現過的 hook event —— **`hooks` 陣列裡的 `on`**，
 * ⛔ 不是任何一個叫 `on` 的欄位（那會把別的 schema 的同名欄位算進來）。
 */
function hookEventsOf(doc: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (!n || typeof n !== "object") return;
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === "hooks" && Array.isArray(v)) {
        for (const h of v) {
          const on = (h as Record<string, unknown> | null)?.["on"];
          if (typeof on === "string") out.add(on);
        }
      }
      walk(v);
    }
  };
  walk(doc);
  return out;
}

/** 文件級 `template` 的三種寫法（字串／`{ref}`／`{stack:[…]}`）。 */
function docTemplateRefs(t: unknown): string[] {
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.flatMap(docTemplateRefs);
  if (t && typeof t === "object") {
    const o = t as { ref?: unknown; stack?: unknown };
    if (typeof o.ref === "string") return [o.ref];
    if (Array.isArray(o.stack)) return o.stack.flatMap(docTemplateRefs);
  }
  return [];
}

export function scanContent(root: string): ContentScan {
  const s: ContentScan = {
    effectKinds: new Map(),
    hookEvents: new Map(),
    leafKinds: new Map(),
    templateDocRefs: new Map(),
    presetRefs: new Map(),
    vfxPrimitives: new Map(),
    vfxPresentations: new Map(),
  };
  for (const [, doc] of readJsonDir(root, "content/abilities")) {
    const d = doc as { template?: unknown };
    // ⛔⛔ **不可以只讀頂層的 `effects` / `hooks`。** 2026-09-05 量到：出貨技能的
    //   hooks 有 **109 份**住在 `passive.ranks[].hooks`、只有 9 份在 `effects[].hooks`
    //   ⇒ 一個只讀 `doc.hooks` 的掃描會讓 33 個 hook event **全部**是零採用，
    //   ⭐ 而「零採用」正是「這塊積木要不要留」的排序依據（第一·五守則的形狀：
    //   一個看起來已經量過的東西，量的不是你以為的那個）。
    // ⇒ ⭐ 走**整份文件**，再用 manifest 的名單分流。名字空間不重疊已驗
    //   （effect ∩ leaf ＝ ∅、effect ∩ hook ＝ ∅）。
    for (const k of stringValuesAt(doc, "kind")) bump(s.effectKinds, k);
    for (const on of hookEventsOf(doc)) bump(s.hookEvents, on);
    // condition leaf —— 只看 `condition` / `victimCondition` 子樹裡的 `kind`。
    const condKinds = new Set<string>();
    const collectConds = (n: unknown): void => {
      if (Array.isArray(n)) {
        for (const x of n) collectConds(x);
        return;
      }
      if (!n || typeof n !== "object") return;
      for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
        if (k === "condition" || k === "victimCondition") {
          for (const c of stringValuesAt(v, "kind")) condKinds.add(c);
        }
        collectConds(v);
      }
    };
    collectConds(doc);
    for (const k of condKinds) bump(s.leafKinds, k);
    // 模板 —— ⭐ 兩條路都算（見 `adoption()` 的盲點紀錄）。
    const refs = new Set(docTemplateRefs(d.template));
    const presets = presetsOf(doc);
    for (const p of presets) {
      bump(s.presetRefs, p);
      refs.add(p);
    }
    for (const r of refs) bump(s.templateDocRefs, r);
  }
  for (const [, doc] of readJsonDir(root, "content/vfx")) {
    const d = doc as { primitive?: unknown; presentation?: unknown };
    if (typeof d.primitive === "string") bump(s.vfxPrimitives, d.primitive);
    if (typeof d.presentation === "string") bump(s.vfxPresentations, d.presentation);
  }
  // ⭐ `config/vfx-families.json` 與 `config/vfx-ability-art.json` 也綁 primitive
  //   —— 它們是這一層今天**最大的**消費端，⛔ 漏掉會讓 13 個輪廓看起來零採用。
  for (const rel of ["content/config/vfx-families.json", "content/config/vfx-ability-art.json"]) {
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(join(root, rel), "utf8"));
    } catch {
      continue;
    }
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) {
        for (const x of n) walk(x);
        return;
      }
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (typeof o["primitive"] === "string") bump(s.vfxPrimitives, o["primitive"]);
      for (const v of Object.values(o)) walk(v);
    };
    walk(doc);
  }
  return s;
}

// ────────────────────────────────────────────────────────── 後台的量尺 ────

/**
 * ⭐⭐ 後台**真的碰得到什麼** —— 問後台**自己的走訪器**（`readSchema`），
 * ⛔ 不是掃原始碼字串（失敗形態⑥：掃字串代替行為）。
 *
 * ⚠️ ⭐ 而「名字對上就算」是**不可靠的**，這一次量到了：
 * `damage-colors:blockFlashMode` 的選項是 `[steel|damage|none]`
 * ⇒ 一個天真的「effect kind `damage` 在後台的 enum 選項裡」會回 **true**，
 * ⛔ 而那一格跟 `damage` 這顆積木**一點關係都沒有**。
 * 同族：`damage-colors:text.heal` 不是 `heal` 這顆積木、
 * `arena-rules:overflow.grantGold` 不是 `grantGold` 這顆積木。
 *
 * ⇒ ⭐ 所以判準改成**兩條各自可靠的**：
 * ① **enum 型積木**（vfx-prim / vfx-subtype）：後台存在一格 enum 葉節點，
 *    其選項**涵蓋整層的完整 enum** ⇒ 後台真的挑得到這一顆（⛔ 不可能誤判：
 *    一格同時收得下 13 個輪廓的下拉，就是那個下拉）。
 * ② **註冊表型積木**（effect / hook / leaf / template / model-preset）：
 *    後台的表單註冊表裡存在一份 spec **開得了這顆積木所住的 collection**。
 *    ⚠️ 今天 `CONFIG_DOC_SPECS` 70 份**全部** `collection: "config"`
 *    ⇒ 住 `abilities` / `ability-templates` / `vfx` 的積木**一顆都沒有** ——
 *    ⭐ 那不是一個保守的估計，那是後台今天的樣子（#992 要修的正是它）。
 */
export interface AdminSurface {
  /** 後台開得了的 collection（今天只有 `config`） */
  collections: Set<string>;
  /** 每一格 enum 葉節點的選項集合 */
  enumOptionSets: string[][];
  leafCount: number;
  specCount: number;
}

export function adminSurface(): AdminSurface {
  const collections = new Set<string>();
  const enumOptionSets: string[][] = [];
  let leafCount = 0;
  for (const spec of CONFIG_DOC_SPECS) {
    collections.add(spec.collection);
    const r = readSchema(spec.zod as never);
    leafCount += r.leaves.length;
    for (const l of r.leaves) if (l.options.length > 0) enumOptionSets.push([...l.options]);
  }
  // ⭐⭐ **通用引擎不是後台的全部。** `config.vfx-families@1` 走的是**專頁**
  //   （🎨 特效鑄造所），而 `configDocCoverage.ts:205` 的豁免理由逐字寫著
  //   「通用引擎長出 record 型欄位支援的那一天，這一列就該退場」。
  // ⇒ ⛔ 只量 `configForms/` 會把 13 個輪廓報成「後台沒有表單」——
  //   ⭐ 而那正是第〇·五守則點名最貴的一種謊：「宣告 unsupported 但引擎其實有
  //   → **對方白白繞路**」。⚠️ 那一頁的下拉本身就是從同一份 Zod enum 推導的
  //   （`vfxForge.ts:100 PRIMITIVE_KINDS = enumOptions(...)`）⇒ 收它是**問出貨的那支**。
  enumOptionSets.push([...PRIMITIVE_KINDS], [...ELEMENT_IDS], [...GROUND_DECAL_IDS]);
  return { collections, enumOptionSets, leafCount, specCount: CONFIG_DOC_SPECS.length };
}

function adminCoversEnum(surface: AdminSurface, members: readonly string[]): boolean {
  return surface.enumOptionSets.some((opts) => members.every((m) => opts.includes(m)));
}

// ───────────────────────────────────────────────────── Codex 那一半（代理） ────

/**
 * ⚠️⚠️ ⭐ **這是代理值，⛔ 不是量到的。**
 *
 * 「`apps/editor` 真的有表單的欄位」住 **Codex 的目錄** ⇒ ⛔ 這支產生器量不到它。
 * 今天用 `ggd-editor-coverage.json` 的 `required`（＝「編輯器**應該**要有的欄位」）
 * 當代理，⭐ 而每一列都帶著 `editorFormSource` 明說它是代理值 ——
 * ⛔ 不要把它讀成「Codex 已經做好了」。
 *
 * 需要 Codex 回傳的收據寫在 `ggd-bricks.json` 的 `editorFormNeededFromCodex`。
 */
const COVERAGE_GROUP: Partial<Record<BrickLayer, string>> = {
  effect: "effectKind",
  hook: "hookEvent",
  leaf: "conditionLeaf",
  template: "templateFamily",
};

interface Coverage {
  required?: Array<{ group?: string; name?: string }>;
}

export function coverageIndex(root: string): Map<string, Set<string>> {
  const by = new Map<string, Set<string>>();
  let cov: Coverage;
  try {
    cov = JSON.parse(
      readFileSync(join(root, "docs/editor-contract/ggd-editor-coverage.json"), "utf8"),
    ) as Coverage;
  } catch {
    return by;
  }
  for (const r of cov.required ?? []) {
    if (typeof r.group !== "string" || typeof r.name !== "string") continue;
    if (!by.has(r.group)) by.set(r.group, new Set());
    by.get(r.group)!.add(r.name);
  }
  return by;
}

// ───────────────────────────────────────────────────────────── 模板槽位 ────

interface ParamSlotLike {
  type?: string;
  default?: unknown;
  min?: number;
  max?: number;
  unit?: string;
  values?: string[];
  optional?: boolean;
  inert?: string;
  origin?: string;
}

interface TplDocLike {
  id?: string;
  family?: string;
  status?: string;
  params?: Record<string, ParamSlotLike>;
}

export function templateDocs(root: string): TplDocLike[] {
  return readJsonDir(root, "content/ability-templates").map(([f, d]) => {
    const doc = d as TplDocLike;
    return { ...doc, id: doc.id ?? f.slice(0, -5) };
  });
}

function slotToParam(name: string, slot: ParamSlotLike): BrickParam {
  const p: BrickParam = { name, type: slot.type ?? "unknown" };
  if (isTierField(name)) p.tier = true;
  if (slot.values && slot.values.length > 0) p.values = [...slot.values];
  if (slot.optional === true) p.optional = true;
  if (slot.default !== undefined) p.default = slot.default;
  if (slot.origin !== undefined) p.origin = slot.origin;
  if (slot.inert !== undefined) p.inert = slot.inert;
  return p;
}

// ────────────────────────────────────────────────────────────── 組裝 ────

export interface BricksDoc {
  schema: "ggd-bricks@1";
  note: string;
  capabilityFingerprint: string;
  adminFormSource: string;
  editorFormSource: string;
  editorFormNeededFromCodex: string;
  counts: Record<string, number>;
  /** ⭐ 閘的棘輪讀這一格：缺表單的積木**逐顆列名** */
  gaps: Array<{ id: string; layer: BrickLayer; missing: string[] }>;
  bricks: Brick[];
}

/** ⭐ 閘只管這四層（票文 Scope 4）——其餘層今天沒有「表單」這個問題的答案。 */
export const GATED_LAYERS: readonly BrickLayer[] = ["effect", "hook", "template", "vfx-subtype"];

export function buildBricks(root: string): BricksDoc {
  const m = buildCapabilityManifest();
  const scan = scanContent(root);
  const admin = adminSurface();
  const cov = coverageIndex(root);
  const tpls = templateDocs(root);

  const effectShapes = unionOptionsByKind(zEffectDefUnion);
  const leafShapes = (() => {
    const out = new Map<string, Record<string, unknown>>();
    const opts = ((zConditionLeaf as unknown as ZodLike)?._def?.options ?? []) as unknown[];
    for (const opt of opts) {
      const shape = shapeOf(opt);
      const lit = (unwrap(shape["kind"])?._def as { value?: unknown } | undefined)?.value;
      if (typeof lit === "string") out.set(lit, shape);
    }
    return out;
  })();
  const hookParams = paramsFromShape(shapeOf(zHookDefBase));

  const bricks: Brick[] = [];
  const editorHas = (layer: BrickLayer, id: string): boolean => {
    const g = COVERAGE_GROUP[layer];
    return g !== undefined && (cov.get(g)?.has(id) ?? false);
  };
  // ⭐ 註冊表型積木住哪個 collection —— 後台開不開得了它，問的是這個。
  const HOME: Record<BrickLayer, string> = {
    effect: "abilities",
    hook: "abilities",
    leaf: "abilities",
    template: "ability-templates",
    "model-preset": "ability-templates",
    "vfx-prim": "vfx",
    "vfx-subtype": "vfx",
  };
  const adminOpensHome = (layer: BrickLayer): boolean => admin.collections.has(HOME[layer]);

  // ① effect（47）
  for (const kind of m.effectKinds) {
    bricks.push({
      id: kind,
      layer: "effect",
      params: paramsFromShape(effectShapes.get(kind) ?? {}),
      adminForm: adminOpensHome("effect"),
      editorForm: editorHas("effect", kind),
      usedBy: scan.effectKinds.get(kind) ?? 0,
      origin: "registry:EFFECT_HANDLERS（packages/shared/src/content/editorCapabilities.ts）",
    });
  }
  // ② hook（33）
  for (const ev of m.hookEvents) {
    bricks.push({
      id: ev,
      layer: "hook",
      // ⚠️ hook 的參數是**整族共用**的（`zHookDefBase`）—— ⛔ 沒有 per-event 的形狀，
      //    所以這 33 顆的 params 逐顆相同，⭐ 那是事實不是複製貼上。
      params: hookParams,
      adminForm: adminOpensHome("hook"),
      editorForm: editorHas("hook", ev),
      usedBy: scan.hookEvents.get(ev) ?? 0,
      origin: "zod:zHookEvent（packages/shared/src/content/schema/hook.ts）",
    });
  }
  // ③ condition leaf（6）
  for (const leaf of m.conditionLeafKinds) {
    bricks.push({
      id: leaf,
      layer: "leaf",
      params: paramsFromShape(leafShapes.get(leaf) ?? {}),
      adminForm: adminOpensHome("leaf"),
      editorForm: editorHas("leaf", leaf),
      usedBy: scan.leafKinds.get(leaf) ?? 0,
      origin: "zod:zConditionLeaf（packages/shared/src/content/schema/condition.ts）",
    });
  }
  // ④ template family（35）—— 參數住模板文件（那才有級距／inert／出處）
  const docsByFamily = new Map<string, TplDocLike[]>();
  for (const d of tpls) {
    if (typeof d.family !== "string") continue;
    const list = docsByFamily.get(d.family) ?? [];
    list.push(d);
    docsByFamily.set(d.family, list);
  }
  for (const fam of m.templateFamilies) {
    const docs = (docsByFamily.get(fam) ?? []).sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
    const params: BrickParam[] = [];
    const seen = new Set<string>();
    for (const d of docs) {
      for (const [n, slot] of Object.entries(d.params ?? {})) {
        if (seen.has(n)) continue;
        seen.add(n);
        params.push(slotToParam(n, slot));
      }
    }
    params.sort((a, b) => a.name.localeCompare(b.name));
    bricks.push({
      id: fam,
      layer: "template",
      params,
      adminForm: adminOpensHome("template"),
      editorForm: editorHas("template", fam),
      usedBy: docs.reduce((n, d) => n + (scan.templateDocRefs.get(String(d.id)) ?? 0), 0),
      origin:
        docs.length > 0
          ? `template@1:${docs.map((d) => `content/ability-templates/${d.id}.json`).join(" ")}`
          : "expand.ts:FAMILIES（引擎認得，⛔ 而今天沒有任何模板文件宣告它）",
    });
  }
  // ⑤ vfx 輪廓（13）
  for (const prim of zVfxPrimitiveKind.options) {
    bricks.push({
      id: prim,
      layer: "vfx-prim",
      params: [],
      adminForm: adminCoversEnum(admin, zVfxPrimitiveKind.options),
      editorForm: editorHas("vfx-prim", prim),
      usedBy: scan.vfxPrimitives.get(prim) ?? 0,
      origin: "zod:zVfxPrimitiveKind（packages/shared/src/content/schema/vfx.ts）",
    });
  }
  // ⑥ vfx 表示形（4）
  for (const pres of zVfxPresentation.options) {
    bricks.push({
      id: pres,
      layer: "vfx-subtype",
      params: [],
      adminForm: adminCoversEnum(admin, zVfxPresentation.options),
      editorForm: editorHas("vfx-subtype", pres),
      usedBy: scan.vfxPresentations.get(pres) ?? 0,
      origin: "zod:zVfxPresentation（packages/shared/src/content/schema/vfx.ts）",
    });
  }
  // ⑦ model preset —— ⭐「哪幾份模板是 `spawnModelFx.preset` 的表」是**推導**的：
  //    它的槽位與 `PRESET_FIELDS`（唯一那張對照表）有交集就是。
  const presetFieldSet = new Set<string>(PRESET_FIELDS as readonly string[]);
  for (const d of tpls.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const names = Object.keys(d.params ?? {});
    const hit = names.filter((n) => presetFieldSet.has(n));
    if (hit.length === 0) continue;
    bricks.push({
      id: String(d.id),
      layer: "model-preset",
      params: hit.sort().map((n) => slotToParam(n, d.params![n]!)),
      adminForm: adminOpensHome("model-preset"),
      editorForm: editorHas("model-preset", String(d.id)),
      usedBy: scan.presetRefs.get(String(d.id)) ?? 0,
      origin: `PRESET_FIELDS ∩ content/ability-templates/${d.id}.json.params`,
    });
  }

  const gaps = bricks
    .filter((b) => GATED_LAYERS.includes(b.layer))
    .filter((b) => !b.adminForm || !b.editorForm)
    .map((b) => ({
      id: b.id,
      layer: b.layer,
      missing: [...(b.adminForm ? [] : ["adminForm"]), ...(b.editorForm ? [] : ["editorForm"])],
    }))
    .sort((a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id));

  const byLayer: Record<string, number> = {};
  for (const b of bricks) byLayer[b.layer] = (byLayer[b.layer] ?? 0) + 1;

  return {
    schema: "ggd-bricks@1",
    note:
      "⭐ 積木清冊 —— 「有哪些積木、每一顆在哪個編輯器有表單、誰在用」的**唯一**一份答案（GH#989）。" +
      "⛔ 產物：改 `tools/brick-census/bricks.ts` 再 `pnpm bricks:build`，⛔ 不要手改。" +
      "⛔ 刻意沒有產生時間戳（隨時鐘變的欄位會讓 `--check` 永遠不相等）。",
    capabilityFingerprint: m.fingerprint,
    adminFormSource:
      `apps/admin/src/configForms.ts::CONFIG_DOC_SPECS（${admin.specCount} 份）→ 後台自己的 ` +
      `readSchema()（${admin.leafCount} 個可編輯葉節點）＋ 🎨 特效鑄造所專頁的 PRIMITIVE_KINDS/ELEMENT_IDS/GROUND_DECAL_IDS。` +
      "① enum 型積木：存在一格 enum 葉節點，其選項涵蓋整層的完整 enum。" +
      `② 註冊表型積木：存在一份 spec 開得了該積木所住的 collection（今天只有 [${[...admin.collections].sort().join(", ")}]）。` +
      "⛔ 刻意不用「名字對上就算」—— `damage-colors:blockFlashMode` 的選項是 [steel|damage|none]，" +
      "那會把 effect kind `damage` 誤判成有表單。",
    editorFormSource:
      "⚠️ **代理值** —— `docs/editor-contract/ggd-editor-coverage.json` 的 `required`" +
      "（＝「編輯器**應該**要有的欄位」），⛔ 不是「apps/editor 真的有表單」。" +
      "`apps/editor` 是 Codex 的目錄，這支產生器量不到它。",
    editorFormNeededFromCodex:
      "⭐ 請 Codex 提供一支 `--check` 或一份 JSON 收據：對 `ggd-bricks.json` 的每一顆 `id`" +
      "（`layer` ∈ effect / hook / leaf / template / vfx-prim / vfx-subtype / model-preset）" +
      "回答「apps/editor 今天**真的渲染得出**這顆積木的表單嗎」，" +
      "並附上那個表單的元件路徑當出處。⛔ 收據來之前這一欄一律是代理值。",
    counts: {
      total: bricks.length,
      ...byLayer,
      gated: bricks.filter((b) => GATED_LAYERS.includes(b.layer)).length,
      gaps: gaps.length,
      missingAdminForm: bricks.filter((b) => GATED_LAYERS.includes(b.layer) && !b.adminForm).length,
      missingEditorForm: bricks.filter((b) => GATED_LAYERS.includes(b.layer) && !b.editorForm)
        .length,
      zeroAdoption: bricks.filter((b) => b.usedBy === 0).length,
    },
    gaps,
    bricks: bricks.sort(
      (a, b) => a.layer.localeCompare(b.layer) || a.id.localeCompare(b.id),
    ),
  };
}

// ─────────────────────────────────────────────────────────── 人讀的那一份 ────

export function renderBricksMd(doc: BricksDoc): string {
  const L: string[] = [];
  L.push("# 積木清冊 —— `ggd-bricks@1`");
  L.push("");
  L.push("> ⛔ **這是產物。** 改 `tools/brick-census/bricks.ts` 再 `pnpm bricks:build`。");
  L.push("");
  L.push(
    "owner 2026-09-05：「[後台編輯器及codex編輯器] 是**堆積木**的角色 **要充分了解有哪些積木**, " +
      "而 main 遊戲主程式 是**做出積木**供使用的角色」",
  );
  L.push("");
  L.push(`capability 指紋：\`${doc.capabilityFingerprint}\``);
  L.push("");
  L.push("## 一眼看完");
  L.push("");
  L.push("| | |");
  L.push("|---|---:|");
  for (const [k, v] of Object.entries(doc.counts)) L.push(`| ${k} | ${v} |`);
  L.push("");
  L.push("## 兩個編輯器的表單怎麼量的");
  L.push("");
  L.push(`- **adminForm**：${doc.adminFormSource}`);
  L.push(`- **editorForm**：${doc.editorFormSource}`);
  L.push(`- **要 Codex 給的收據**：${doc.editorFormNeededFromCodex}`);
  L.push("");
  const layers = [...new Set(doc.bricks.map((b) => b.layer))];
  for (const layer of layers) {
    const rows = doc.bricks.filter((b) => b.layer === layer);
    L.push(`## \`${layer}\`（${rows.length}）`);
    L.push("");
    L.push("| 積木 | 參數 | 級距 | inert | 後台表單 | 編輯器表單(代理) | 誰在用 |");
    L.push("|---|---:|---:|---:|---|---|---:|");
    for (const b of rows) {
      const tiers = b.params.filter((p) => p.tier === true).length;
      const inert = b.params.filter((p) => p.inert !== undefined).length;
      L.push(
        `| \`${b.id}\` | ${b.params.length} | ${tiers} | ${inert} | ${b.adminForm ? "✅" : "⛔"} | ${b.editorForm ? "✅" : "⛔"} | ${b.usedBy} |`,
      );
    }
    L.push("");
  }
  L.push("## 缺表單的積木（閘讀這一節）");
  L.push("");
  if (doc.gaps.length === 0) {
    L.push("⭐ 零缺口。");
  } else {
    L.push("| 積木 | 層 | 缺什麼 |");
    L.push("|---|---|---|");
    for (const g of doc.gaps) L.push(`| \`${g.id}\` | ${g.layer} | ${g.missing.join(" + ")} |`);
  }
  L.push("");
  return `${L.join("\n")}\n`;
}
