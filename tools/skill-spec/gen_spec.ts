/**
 * 產生《技能標記機制與效果規則說明》—— **完全從出貨的 schema + registry + 內容推導**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼這一支必須存在（owner 2026-08-16）
 *
 *   「請你給我一張完整即時的技能標記機制與效果規則說明 md
 *     這個檔案應該是由**真實使用的 JSON 動態產生**出來
 *     並且**每次 deploy 都會重 build 避免多檔案內容不一致**」
 *
 * 這個 repo 現在有**六份**在講同一件事的文件，其中四份是手寫的：
 *
 *   | 檔 | 誰寫的 |
 *   |---|---|
 *   | `docs/editor-contract/ggd-runtime-capabilities.md` | ✅ `pnpm caps:export` |
 *   | `docs/engine-atlas.json` / `.html`                 | ✅ `pnpm atlas` |
 *   | `docs/效果標籤詞彙表v2.md`                          | ⛔ 手寫 |
 *   | `docs/_status-effect-tag-vocabulary.md`            | ⛔ 手寫（自稱「資料來源：content/status-effects/*.json」） |
 *   | `docs/技能編輯器引擎須知 20260811.md`               | ⛔ 手寫（自稱「指紋…對帳過」） |
 *   | `skill-tag-manifest.json`                          | ⛔ 手寫（自稱 `generated:`） |
 *
 * ⚠️ 手寫檔宣稱自己有資料來源，正是 CLAUDE.md 第三守則點名的形狀：
 * **「已驗證」「資料來源」「對帳過」這類宣稱本身不會過期，被它們描述的事實會。**
 * `editorCapabilities.ts` 的檔頭已經記錄過同一族的兩次說謊（`knockback` 寫 false
 * 但早就有了、`invulnerable` 整列漏掉），而那份表的結論逐字是：
 * 「a flag defended by prose outlives the prose's expiry date and **nothing goes red**」。
 *
 * ② 這一份與 `caps:export` 的分工（⛔ 不是第二份能力清單）
 *
 *   · `ggd-runtime-capabilities.md` 回答「**這個名字存不存在**」——
 *     一張 supported/unsupported 的勾選表，給外部編輯器 pin base 用。
 *   · 這一份回答「**它怎麼用**」—— 每個 effect 有哪些參數、參數的上下界是多少、
 *     每個 hook 什麼時候發、持有者是誰、target 是誰、出貨內容裡誰在用它。
 *
 *   兩者**共用同一個 `buildCapabilityManifest()`**，所以它們不可能互相矛盾：
 *   名詞來自同一個推導，這裡只是多長出參數那一層。
 *
 * ③ ⛔ 刻意沒有時間戳（與 `tools/capability-export/export.ts` 同一個理由）
 *
 * 任何隨時鐘變動的欄位都會讓「重新產生 → 逐位元組比對」永遠不相等，於是 `--check`
 * 只能被放寬成模糊比對，而**一條被放寬的閘等於沒有閘**。身分由 `fingerprint` 帶，
 * 它只在引擎事實真的變了的時候變。
 *
 * ④ 「每次 deploy 都會重 build」落在哪裡
 *
 *   · `pnpm content:build` 會連帶跑這一支（root package.json）——
 *     CLAUDE.md 規定每一次 `content/` 編輯都要跑它，所以內容一動文件就跟著動。
 *   · `packages/shared/src/ops/skillSpecFresh.test.ts` 用 `--check` 真的把這支跑
 *     起來（⛔ 不是掃字串）。文件過期 = `pnpm test` 紅 = 部署協定第 1 步就擋下來。
 *
 *   ⚠️ 刻意**不**在 `host-deploy.sh` 裡產生：那台機器是 `git pull` 來的，在遠端
 *   產生文件只會造出一份沒有人 commit 的工作區漂移 —— 那正是 2026-08-02
 *   「未追蹤來源被烘進產物」事故的形狀。閘要在**編輯發生的當下**響，不是在部署時。
 *
 * 用法：
 *   npx tsx tools/skill-spec/gen_spec.ts            # 產生／更新
 *   npx tsx tools/skill-spec/gen_spec.ts --check    # 過期就回非零（閘）
 *   npx tsx tools/skill-spec/gen_spec.ts --out <路徑>
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { buildCapabilityManifest } from "../../packages/shared/src/content/editorCapabilities";
import { zEffectDef, zHookDef, SOURCE_GRANT_SHAPE } from "../../packages/shared/src/content/schema/effect";
import { zAugmentDoc } from "../../packages/shared/src/content/schema/augment";
import { zEffectCondition } from "../../packages/shared/src/content/schema/condition";
import { zScaling } from "../../packages/shared/src/content/schema/common";
import {
  zVfxDoc,
  zVfxOrient,
  zRibbonDoc,
  zVfxAbilityFamilyBinding,
  zVfxFamilyTuning,
  // GH#384 —— 逐技能特效綁定的三格（§13.7）。
  zVfxPrimBinding,
  zVfxFamilyBinding,
  zVfxPromotedBinding,
  zVfxOwnerBinding,
  // GH#392 —— 穿在骨頭上的模型（§13.8）。
  zAttachmentDoc,
} from "../../packages/shared/src/content/schema/vfx";
import {
  zAbilityVfxLayer,
  ABILITY_VFX_LAYER_HARD_CAP,
  DEFAULT_MAX_ABILITY_VFX_LAYERS,
} from "../../packages/shared/src/content/schema/abilityVfx";
// ⭐ 文件授權面（GH#380）—— §14 的七張表全部從這幾份出貨 Zod 推導。
import { zAbilityDef } from "../../packages/shared/src/content/schema/ability";
import { zMarkSpec } from "../../packages/shared/src/content/schema/mark";
import { zProjectileDoc } from "../../packages/shared/src/content/schema/projectile";
import { zStatusEffectDoc } from "../../packages/shared/src/content/schema/statusEffect";
import { zItemDoc } from "../../packages/shared/src/content/schema/item";
import { zChampionDoc } from "../../packages/shared/src/content/schema/champion";
import { zTemplateDoc } from "../../packages/shared/src/content/schema/template";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { ModOp } from "../../packages/shared/src/sim/stats/modifiers";
import { ContentLoader } from "../../packages/shared/src/content/loader";
import { FsContentSource } from "../../packages/shared/src/content/node/FsContentSource";
import { registerAll } from "../../packages/shared/src/content/registries";
import { Abilities } from "../../packages/shared/src/sim/content/registry";
// ⭐ 說明推導（票號待開） —— 佔位符詞彙**只有一份**（`abilityProse.ts`），文件從它長出來。
import {
  INDEXED_SLOTS,
  PLACEHOLDER_RE,
  PROSE_SLOT_DOC,
  PROSE_SLOT_KEYS,
  parseSlot,
} from "../../packages/shared/src/content/abilityProse";
// ⭐ 卡面值 ↔ 實際值那一半（`{{cd!}}`）—— 逐軸的決定只有一份，文件從它長出來。
import { LIVE_RULES, LIVE_SUFFIX } from "../../packages/shared/src/content/renderAbilityText";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");

export const DEFAULT_OUT = join(REPO, "docs/技能標記機制與效果規則.md");
/**
 * ⭐ 說明推導（票號待開） —— **算繪好的**技能說明（id → 玩家真的看到的那段字）。
 *
 * 為什麼要有這一份：`content/abilities/*.json` 裡住的是**帶佔位符**的原文
 *（`{{cd}}秒冷卻`），而算繪器是 TypeScript。任何**不是 TS** 的下游
 *（`tools/reference/gen_readme_lists.py` 的 README／參考文件、外部編輯器）
 * 要嘛印出裸的 `{{cd}}`，要嘛**自己再寫一份算繪** —— 而第二份算繪正是
 * `abilityProse.ts` 檔頭那條紅線。⇒ 由**唯一**那支算繪器把結果寫出來給它們讀。
 *
 * ⛔ 它不是第二個住處：這一份是**產物**，`--check` 逐位元組比對，過期就紅。
 */
export const DEFAULT_PROSE_OUT = join(REPO, "docs/editor-contract/ggd-ability-prose.json");

/**
 * ⭐ GH#467 —— 一個 effect kind 現在住在哪個檔。
 *
 * 分片之前這一格答不出來（40 個 kind 擠在 `schema/effect.ts` 的一個 union 裡，
 * 4,754 行），所以「改 `chainLightning` 的 `decay` 上界」這種事只能靠搜字串。
 *
 * ⛔ 這一行**去磁碟上找**，找不到就不印 —— 它必須是量到的，不是一句照慣例寫死的
 * 宣稱。⚠️ 慣例本身（檔名 == kind，兩個目錄都有）由
 * `packages/shared/src/content/schema/effects/effectShardWiring.test.ts` 守著，
 * 它把四個方向互相釘住；這裡只是把結果寫給讀文件的人看。
 */
const KIND_SHARD_DIRS: readonly [label: string, dir: string][] = [
  ["欄位與上下界", "packages/shared/src/content/schema/effects"],
  ["TS 型別", "packages/shared/src/sim/effects/variants"],
];

function kindShardFiles(kind: string): string | null {
  const hits = KIND_SHARD_DIRS.filter(([, d]) => existsSync(join(REPO, d, `${kind}.ts`))).map(
    ([label, d]) => `\`${d}/${kind}.ts\`（${label}）`,
  );
  return hits.length ? hits.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// 手寫的那一半 —— `curated.json`，以及把它與引擎對帳的兩個方向
// ---------------------------------------------------------------------------

interface StructuralFact {
  title: string;
  body: string[];
  /**
   * 這條事實依賴的**引擎事實**。⭐ 沒有這一格的話，這一段就只是另一份會過期的散文
   * ——`docs/效果標籤詞彙表v2.md` 寫著「今天真的存在的 kind 有 24 個」而引擎已經有
   * 37 個，正是這個形狀。有了它，引擎一改，產生器就回非零並指名是哪一條。
   */
  assert?: { file: string; absent?: string; present?: string; reason: string };
}

interface Curated {
  effectKinds: Record<string, string>;
  hookEvents: Record<string, string>;
  conditionLeaves: Record<string, string>;
  statusAxes: Record<string, string>;
  retiredTokens: { token: string; what: string; why: string }[];
  structuralFacts: StructuralFact[];
}

export const CURATED_PATH = join(HERE, "curated.json");

function loadCurated(): Curated {
  return JSON.parse(readFileSync(CURATED_PATH, "utf8")) as Curated;
}

/**
 * ⭐ **兩個方向都要關**（與 `editorCapabilities.test.ts` 同一個道理）：
 *
 *   · 手寫檔有、引擎沒有 → **回非零**。那是一份在說謊的詞彙表，而照著它設計的卡片
 *     上線就是死的（`onLevelUp` 曾經在文件裡活了好幾個月，發射點是零）。
 *   · 引擎有、手寫檔沒有 → **不擋，但要印在文件上**（「待命名」）。漏一個中文名不會
 *     讓內容壞掉，但它必須看得見 —— 無聲才是缺陷（第二守則）。
 */
function reconcileLabels(
  labels: Record<string, string>,
  real: readonly string[],
  what: string,
): { unnamed: string[]; lies: string[] } {
  const realSet = new Set(real);
  const lies = Object.keys(labels).filter((t) => !realSet.has(t));
  const unnamed = real.filter((t) => !(t in labels));
  if (lies.length > 0) {
    throw new Error(
      `⛔ curated.json 的 ${what} 有 ${lies.length} 個引擎不認得的 token：${lies.join("、")}\n` +
        `   它們要嘛打錯字，要嘛已經被刪／改名 —— 移到 retiredTokens，或修正拼字。\n` +
        `   （一份會說謊的詞彙表比沒有詞彙表更糟：照著它做的內容上線就是死的。）`,
    );
  }
  return { unnamed, lies };
}

/** 把 `structuralFacts[].assert` 拿去對真的原始碼跑一遍。 */
function checkStructuralFact(f: StructuralFact): void {
  if (!f.assert) return;
  const p = join(REPO, f.assert.file);
  if (!existsSync(p)) {
    throw new Error(`⛔ 結構事實「${f.title}」指到一個不存在的檔：${f.assert.file}`);
  }
  const src = readFileSync(p, "utf8");
  if (f.assert.absent !== undefined && src.includes(f.assert.absent)) {
    throw new Error(
      `⛔ 結構事實過期了：「${f.title}」\n` +
        `   它成立的前提是 ${f.assert.file} 裡**沒有** \`${f.assert.absent}\`，而它現在有。\n` +
        `   ${f.assert.reason}\n` +
        `   → 改 tools/skill-spec/curated.json 的那一條，不要改這支程式。`,
    );
  }
  if (f.assert.present !== undefined && !src.includes(f.assert.present)) {
    throw new Error(
      `⛔ 結構事實過期了：「${f.title}」\n` +
        `   它成立的前提是 ${f.assert.file} 裡**有** \`${f.assert.present}\`，而它不見了。\n` +
        `   ${f.assert.reason}\n` +
        `   → 改 tools/skill-spec/curated.json 的那一條，不要改這支程式。`,
    );
  }
}

// ---------------------------------------------------------------------------
// zod 內省 —— 把 schema 變成一張參數表
// ---------------------------------------------------------------------------

interface Field {
  name: string;
  type: string;
  optional: boolean;
  bounds: string;
  desc: string;
}

type AnyDef = {
  typeName?: string;
  innerType?: z.ZodTypeAny;
  schema?: z.ZodTypeAny;
  type?: z.ZodTypeAny;
  getter?: () => z.ZodTypeAny;
  checks?: { kind: string; value?: number }[];
  values?: string[];
  value?: unknown;
  options?: z.ZodTypeAny[];
  shape?: () => Record<string, z.ZodTypeAny>;
};

/** 剝掉 optional / default / effects / lazy 這些包裝，同時記住有沒有 optional 與說明。 */
function unwrap(s: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean; desc: string } {
  let optional = false;
  let desc = s.description ?? "";
  let cur: z.ZodTypeAny = s;
  for (let i = 0; i < 16; i++) {
    const d = cur._def as AnyDef;
    if (d.typeName === "ZodOptional" || d.typeName === "ZodNullable" || d.typeName === "ZodDefault") {
      optional = true;
      cur = d.innerType as z.ZodTypeAny;
    } else if (d.typeName === "ZodEffects") {
      cur = (d.schema ?? d.type) as z.ZodTypeAny;
    } else if (d.typeName === "ZodLazy" && d.getter) {
      cur = d.getter();
    } else if (d.typeName === "ZodBranded" || d.typeName === "ZodReadonly") {
      cur = (d.type ?? d.innerType) as z.ZodTypeAny;
    } else break;
    if (!desc) desc = cur.description ?? "";
  }
  return { inner: cur, optional, desc };
}

const TYPE_ZH: Record<string, string> = {
  ZodString: "文字",
  ZodNumber: "數字",
  ZodBoolean: "是/否",
  ZodArray: "陣列",
  ZodObject: "物件",
  ZodEnum: "列舉",
  ZodNativeEnum: "列舉",
  ZodLiteral: "固定值",
  ZodUnion: "多選一",
  ZodDiscriminatedUnion: "多選一",
  ZodRecord: "字典",
  ZodTuple: "定長陣列",
  ZodAny: "任意",
  ZodUnknown: "任意",
};

/**
 * 被十幾個 effect kind 共用的形狀，只寫一次、其餘的指過去。
 *
 * ⚠️ 判準是**參照相等**（`=== zScaling`），⛔ 不是名字比對 —— 名字比對會在
 * 有人複製貼上一個長得一樣但其實是另一個 schema 的時候安靜地說謊。
 */
const SHARED_SHAPES: readonly { schema: z.ZodTypeAny; label: string }[] = [
  { schema: zScaling, label: "數值式（見 §2.4）" },
];

function typeLabel(s: z.ZodTypeAny): string {
  for (const sh of SHARED_SHAPES) if (s === sh.schema) return sh.label;
  const d = s._def as AnyDef;
  const tn = d.typeName ?? "?";
  if (tn === "ZodEnum" && d.values) return d.values.map((v) => `\`${v}\``).join(" / ");
  if (tn === "ZodNativeEnum") {
    const vals = Object.values((d as unknown as { values: Record<string, string> }).values ?? {});
    return vals.map((v) => `\`${v}\``).join(" / ");
  }
  if (tn === "ZodLiteral") return `\`${String(d.value)}\``;
  if (tn === "ZodArray") {
    const el = unwrap((d as unknown as { type: z.ZodTypeAny }).type).inner;
    for (const sh of SHARED_SHAPES) if (el === sh.schema) return `${sh.label}[]`;
    const inner = (el._def as AnyDef).shape?.();
    if (inner) return `物件[]：\`{ ${Object.keys(inner).join(", ")} }\``;
    return `${TYPE_ZH[(el._def as AnyDef).typeName ?? ""] ?? "?"}[]`;
  }
  if (tn === "ZodObject") {
    // 一層展開就夠：作者要的是「裡面有哪幾格」，完整細節在 schema 裡。
    const inner = (d.shape?.() ?? {}) as Record<string, z.ZodTypeAny>;
    const keys = Object.keys(inner);
    if (keys.length > 0) return `物件：\`{ ${keys.join(", ")} }\``;
  }
  return TYPE_ZH[tn] ?? tn.replace(/^Zod/, "");
}

function boundsLabel(s: z.ZodTypeAny): string {
  const d = s._def as AnyDef;
  const isString = d.typeName === "ZodString";
  const isArray = d.typeName === "ZodArray";
  const unit = isString ? " 字" : isArray ? " 項" : "";
  const parts: string[] = [];
  let isInt = false;
  for (const c of d.checks ?? []) {
    if (c.kind === "int") isInt = true;
    else if (c.kind === "min") parts.push(`≥ ${c.value}${unit}`);
    else if (c.kind === "max") parts.push(`≤ ${c.value}${unit}`);
  }
  // 陣列的長度限制不在 `checks` 裡，住在 `minLength` / `maxLength`。
  if (isArray) {
    const a = d as unknown as { minLength?: { value: number }; maxLength?: { value: number } };
    if (a.minLength) parts.push(`≥ ${a.minLength.value} 項`);
    if (a.maxLength) parts.push(`≤ ${a.maxLength.value} 項`);
  }
  if (isInt) parts.unshift("整數");
  return parts.join("、");
}

/** 一句話說明：吃 `.describe()`，切到第一個句號／換行，避免表格被撐爛。 */
function oneLine(desc: string, max = 200): string {
  const flat = desc.replace(/\s*\n\s*/g, " ").replace(/\|/g, "／").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function fieldsOf(obj: z.ZodTypeAny, skip: readonly string[] = []): Field[] {
  const shape = (unwrap(obj).inner._def as AnyDef).shape?.();
  if (!shape) return [];
  const out: Field[] = [];
  for (const [name, raw] of Object.entries(shape)) {
    if (skip.includes(name)) continue;
    const u = unwrap(raw);
    out.push({
      name,
      type: typeLabel(u.inner),
      optional: u.optional,
      bounds: boundsLabel(u.inner),
      desc: oneLine(u.desc),
    });
  }
  return out;
}

/**
 * 從 schema 原始碼抽欄位的 TSDoc。
 *
 * ⚠️ 為什麼需要這一支：`effect.ts` 那一族用 `.describe()`（內省讀得到），
 * 但 `vfx.ts` / `abilityVfx.ts` 用的是 `/** … *\/` 註解 —— 那些字**不在 Zod 物件裡**，
 * 所以 {@link fieldsOf} 對特效那一面會回一整欄空白的「說明」。
 *
 * ⛔ 解法不是在這裡手抄一份說明（那就是第二個真相來源，而且它會安靜地與 schema
 * 漂開）。這一支跟 {@link hookDocs} 是同一個做法：**去讀那份原始碼**。
 *
 * `from` / `to` 把掃描夾在一段裡 —— 同一個檔裡 `texture` 出現在 `vfx@1` 與
 * `ribbon@1` 兩處而語意不同，不夾會拿到錯的那一句。
 */
function tsdocFields(file: string, from: string, to: string): Map<string, string> {
  const src = readFileSync(join(REPO, file), "utf8");
  const i = src.indexOf(from);
  if (i < 0) {
    throw new Error(
      `⛔ ${file} 裡找不到 \`${from}\` —— 特效欄位的說明會整欄變空白，而那看起來` +
        `跟「這些欄位沒有說明」一模一樣。修 gen_spec.ts 的錨點，⛔ 不要讓它靜靜地空掉。`,
    );
  }
  const j = src.indexOf(to, i);
  const seg = src.slice(i, j < 0 ? undefined : j);
  const out = new Map<string, string>();
  // `/** … */` 後面（可能隔幾行 `//` 註解）緊跟著 `欄位名:` 的那一段就是它的說明。
  const re = /\/\*\*([\s\S]*?)\*\/\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    const body = m[1]!
      .split("\n")
      .map((l) => l.replace(/^\s*\*\s?/, "").trimEnd())
      .join("\n")
      .replace(/\{@link\s+([^}]+)\}/g, "`$1`")
      .trim();
    if (body && !out.has(m[2]!)) out.set(m[2]!, body);
  }
  return out;
}

/**
 * {@link fieldsOf} 的說明欄補件：內省拿不到的，從原始碼的 TSDoc 補上。
 *
 * ⚠️ `zRef()` 把 `ref?:vfx` 這種**機器標記**放在 `.description` 裡，於是那一格
 * 看起來「有說明」而人讀不懂。所以機器標記也要被 TSDoc 蓋掉 —— 但**保留在括號裡**，
 * 因為「這是一個軟參照」本身是作者要知道的事。
 */
function withDocs(fields: Field[], ...maps: Map<string, string>[]): Field[] {
  return fields.map((f) => {
    const machineTag = /^ref\??:/.test(f.desc);
    if (f.desc && !machineTag) return f;
    for (const m of maps) {
      const d = m.get(f.name);
      if (d) return { ...f, desc: machineTag ? `${oneLine(d)}（\`${f.desc}\`）` : oneLine(d) };
    }
    return f;
  });
}

/** 把 `zEffectDef` 這種 discriminated union 拆成 kind → 欄位表。 */
function unionArmsByKind(schema: z.ZodTypeAny): Map<string, z.ZodTypeAny> {
  const root = unwrap(schema).inner;
  const opts = (root._def as AnyDef).options ?? [];
  const out = new Map<string, z.ZodTypeAny>();
  for (const arm of opts) {
    const a = unwrap(arm).inner;
    const shape = (a._def as AnyDef).shape?.();
    const kind = shape?.["kind"];
    if (!kind) continue;
    const lit = (unwrap(kind).inner._def as AnyDef).value;
    if (typeof lit === "string") out.set(lit, a);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 從原始碼抽 hook 事件的語意（TSDoc 是唯一寫著「持有者是誰」的地方）
// ---------------------------------------------------------------------------

/** `modifiers.ts` 的 `HookEvent` 聯集：每個成員前面那段 `/** … *\/` 就是它的語意。 */
function hookDocs(): Map<string, string> {
  const src = readFileSync(join(REPO, "packages/shared/src/sim/stats/modifiers.ts"), "utf8");
  const start = src.indexOf("export type HookEvent");
  const end = src.indexOf('| "onStatusApplied";', start);
  const seg = src.slice(start, end + 40);
  const out = new Map<string, string>();
  const re = /\/\*\*([\s\S]*?)\*\/\s*\|\s*"([A-Za-z]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    const body = m[1]!
      .split("\n")
      .map((l) => l.replace(/^\s*\*ce?\s?/, "").replace(/^\s*\*\s?/, "").trimEnd())
      .join("\n")
      .replace(/\{@link\s+([^}]+)\}/g, "`$1`")
      .trim();
    out.set(m[2]!, body);
  }
  return out;
}

/** `WorldHookSystem.ts` 的廣播表：scope 決定「這一則發給誰」。 */
function worldHookScopes(): Map<string, { simEvent: string; scope: string }> {
  const src = readFileSync(join(REPO, "packages/shared/src/sim/systems/WorldHookSystem.ts"), "utf8");
  const out = new Map<string, { simEvent: string; scope: string }>();
  const re = /simEvent:\s*"([A-Za-z]+)",\s*\n?\s*hook:\s*"([A-Za-z]+)",\s*\n?\s*scope:\s*"([a-z]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.set(m[2]!, { simEvent: m[1]!, scope: m[3]! });
  return out;
}

const SCOPE_ZH: Record<string, string> = {
  world: "世界廣播（場上每一位活著的單位）",
  actor: "當事人",
  allies: "當事人的隊友",
};

/** 直接發（不經廣播表）的那幾個：從 `fireHooks(` 呼叫點掃出來。 */
function directFireSites(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) {
        const src = readFileSync(p, "utf8");
        const re = /fireHooks\(\s*world,\s*[A-Za-z0-9_.]+,\s*"([A-Za-z]+)"/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const rel = p.slice(REPO.length + 1);
          const list = out.get(m[1]!) ?? [];
          if (!list.includes(rel)) list.push(rel);
          out.set(m[1]!, list);
        }
      }
    }
  };
  walk(join(REPO, "packages/shared/src/sim"));
  for (const list of out.values()) list.sort();
  return out;
}

// ---------------------------------------------------------------------------
// 掃出貨內容 —— 「誰在用它」這一欄必須是量到的，不是我猜的
// ---------------------------------------------------------------------------

interface Slot {
  docs: Set<string>;
  hits: number;
  /** 出貨內容裡真的存在的一個實例 —— 範例必須是**抄得動的**，所以不自己編。 */
  example?: { doc: string; collection: string; json: unknown };
}

interface Usage {
  /** effect kind → 用到它的文件數 */
  effectKinds: Map<string, Slot>;
  hookEvents: Map<string, Slot>;
  conditionLeaves: Map<string, Slot>;
  /**
   * 特效授權面（GH#372）：`<寫在哪>.<欄位>` → 誰在用 + 一個抄得動的實例。
   * ⭐ 這一格讓「橫放的柱狀砲」那種例子是**量到的**（哪一份出貨文件真的寫了
   * `orient.pitchDeg`），⛔ 不是我在產生器裡點名一個檔名 —— 點名的那一刻它就開始過期。
   */
  vfxSurface: Map<string, Slot>;
  /**
   * 文件授權面（GH#380）：`<schema 標籤>.<欄位>` → 誰在用。
   * ⭐ 和 `vfxSurface` 同一個理由 —— 「`castType` 出貨內容裡有幾份真的寫了」
   * 是量到的，⛔ 不是我在產生器裡宣稱的。
   */
  docSurface: Map<string, Slot>;
  statusTags: Map<string, number>;
  statuses: string[];
  collections: Map<string, number>;
  augments: { id: string; name: string; tier: string; weight: number; hooks: string[]; mods: number }[];
}

/** 集合的偏好順序：範例優先取增益卡（本文件的主要讀者），再來道具、技能。 */
/** 900 字元以上的範例沒有人抄得動，寧可不給。 */
const EXAMPLE_MAX_CHARS = 900;

const EXAMPLE_RANK: Record<string, number> = { augments: 0, items: 1, abilities: 2, "ability-templates": 3 };

/** 大小 —— 一個 200 行的範例沒有人抄得動，寧可換一個小的。 */
function jsonSize(v: unknown): number {
  return JSON.stringify(v)?.length ?? Infinity;
}

function scanContent(): Usage {
  const u: Usage = {
    effectKinds: new Map(),
    hookEvents: new Map(),
    conditionLeaves: new Map(),
    vfxSurface: new Map(),
    docSurface: new Map(),
    statusTags: new Map(),
    statuses: [],
    collections: new Map(),
    augments: [],
  };
  const root = join(REPO, "content");

  /**
   * ⚠️ `kind` 是**兩個**東西的判別欄：effect（`{kind:"damage"}`）與條件葉
   * （`{kind:"stat", subject:…}`）。分辨它們的**不是**欄位名，是**位置** ——
   * 條件只出現在 `condition` / `victimCondition` 底下。所以走訪要帶模式，
   * ⛔ 不可以只看 `kind` 就記帳（第一版就是這樣，條件葉全部被記成 effect kind）。
   */
  const CONDITION_KEYS = ["condition", "victimCondition"];

  const bump = (m: Map<string, Slot>, k: string, doc: string, collection: string, node: unknown): void => {
    const e = m.get(k) ?? { docs: new Set<string>(), hits: 0 };
    e.docs.add(doc);
    e.hits += 1;
    const rank = EXAMPLE_RANK[collection] ?? 9;
    const curRank = e.example ? (EXAMPLE_RANK[e.example.collection] ?? 9) : 99;
    const size = jsonSize(node);
    if (!e.example || rank < curRank || (rank === curRank && size < jsonSize(e.example.json))) {
      if (size <= EXAMPLE_MAX_CHARS) e.example = { doc, collection, json: node };
    }
    m.set(k, e);
  };

  const walkJson = (node: unknown, docId: string, collection: string, inCondition: boolean): void => {
    if (Array.isArray(node)) {
      for (const n of node) walkJson(n, docId, collection, inCondition);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (typeof o["kind"] === "string") {
      bump(inCondition ? u.conditionLeaves : u.effectKinds, o["kind"], docId, collection, o);
    }
    if (typeof o["on"] === "string" && Array.isArray(o["effects"])) bump(u.hookEvents, o["on"], docId, collection, o);
    for (const [k, v] of Object.entries(o)) {
      walkJson(v, docId, collection, inCondition || CONDITION_KEYS.includes(k));
    }
  };

  const walkDir = (dir: string, collection: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        // ⛔ `_` 開頭的目錄（`_legacy`）不進出貨 bundle，把它算進「誰在用」會讓
        // 一個早就退役的用法看起來還活著。
        if (e.name.startsWith("_")) continue;
        walkDir(p, collection === "" ? e.name : collection);
        continue;
      }
      if (!e.name.endsWith(".json") || e.name === "_index.json") continue;
      if (collection === "assets") continue;
      // ⛔ `content/` 頂層的三個檔（`bundle.json` / `manifest.json` /
      // `editor-target-profile.json`）是**產物**，而 `bundle.json` 把每一份文件都
      // 內嵌了一次。把它們算進「誰在用」= 每個用量都被數兩遍，而且範例會指到一個
      // 沒有人在編輯的檔。頂層檔的 collection 是空字串，這就是它們的判準。
      if (collection === "") continue;
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
      } catch {
        continue;
      }
      const id = typeof doc["id"] === "string" ? doc["id"] : e.name.replace(/\.json$/, "");
      u.collections.set(collection, (u.collections.get(collection) ?? 0) + 1);
      walkJson(doc, id, collection, false);

      // ── 特效授權面的用量（GH#372）────────────────────────────────────
      // ⚠️ 走的是**頂層鍵**而不是 `walkJson`：`walkJson` 只認得 `kind` 與 `on`，
      // 而特效的授權面一格 `kind` 都沒有 —— 那正是它整片從合約裡消失的原因。
      if (collection === "vfx") {
        const shape = doc["schema"] === "ribbon@1" ? "ribbon@1" : "vfx@1";
        for (const [k, v] of Object.entries(doc)) {
          if (v === undefined) continue;
          bump(u.vfxSurface, `${shape}.${k}`, id, collection, doc);
          // `orient` 是巢狀的：只記 `orient` 會讓三格子欄位的用量永遠是 0。
          if (shape === "vfx@1" && k === "orient" && v !== null && typeof v === "object") {
            for (const ok of Object.keys(v as Record<string, unknown>)) {
              bump(u.vfxSurface, `vfx@1.orient.${ok}`, id, collection, doc);
            }
          }
        }
      }
      // GH#390 —— 家族原型那一層的用量。⛔ 和下面 `abilities` 那一段是**同一個
      // 迴圈的兩個鍵**,不是兩段程式:少了這一段,§13.6 每一列的「幾份文件在用」
      // 會整欄是 0,而那是「這一格沒有人用」與「我沒有去數」長得一模一樣的那種錯。
      if (doc["schema"] === "config.vfx-families@1" && doc["families"] !== null && typeof doc["families"] === "object") {
        for (const [famId, tuning] of Object.entries(doc["families"] as Record<string, unknown>)) {
          if (!tuning || typeof tuning !== "object") continue;
          for (const k of Object.keys(tuning as Record<string, unknown>)) {
            bump(u.vfxSurface, `config.vfx-families@1.families[].${k}`, famId, collection, {
              [famId]: tuning,
            });
          }
        }
      }
      if (doc["schema"] === "config.vfx-families@1" && doc["abilities"] !== null && typeof doc["abilities"] === "object") {
        for (const [abilityId, bind] of Object.entries(doc["abilities"] as Record<string, unknown>)) {
          if (!bind || typeof bind !== "object") continue;
          for (const k of Object.keys(bind as Record<string, unknown>)) {
            bump(u.vfxSurface, `config.vfx-families@1.abilities[].${k}`, abilityId, collection, {
              [abilityId]: bind,
            });
          }
        }
      }
      // GH#384 —— 逐技能特效綁定（分類／證據／晉升）三格各自的用量。
      // ⛔ 少了這一段，§13.7 每一列的「幾份文件在用」會整欄是 0，而
      //「這一格沒有人用」與「我沒有去數」在那張表上長得一模一樣。
      if (
        doc["schema"] === "config.vfx-ability-art@1" &&
        doc["bindings"] !== null &&
        typeof doc["bindings"] === "object"
      ) {
        for (const [abilityId, row] of Object.entries(doc["bindings"] as Record<string, unknown>)) {
          if (!row || typeof row !== "object") continue;
          for (const [cell, body] of Object.entries(row as Record<string, unknown>)) {
            if (!body || typeof body !== "object") continue;
            for (const k of Object.keys(body as Record<string, unknown>)) {
              bump(u.vfxSurface, `config.vfx-ability-art@1.bindings.${cell}.${k}`, abilityId, collection, {
                [abilityId]: row,
              });
            }
          }
        }
      }
      if (collection === "abilities" && Array.isArray(doc["vfxLayers"])) {
        for (const layer of doc["vfxLayers"] as Record<string, unknown>[]) {
          if (!layer || typeof layer !== "object") continue;
          for (const k of Object.keys(layer)) {
            bump(u.vfxSurface, `ability@1.vfxLayers[].${k}`, id, collection, doc["vfxLayers"]);
          }
        }
      }

      // ── 文件授權面的用量（GH#380）────────────────────────────────────
      // ⚠️ 和上面同一個理由走**頂層鍵**：`walkJson` 只認得 `kind` 與 `on`，而
      //    「這一支射多遠、是指定還是範圍」那一層一格 `kind` 都沒有 —— 那正是
      //    它和特效面在 2026-08-18 之前一起從合約裡消失的原因。
      const schemaTag = typeof doc["schema"] === "string" ? doc["schema"] : "";
      if (schemaTag) {
        for (const [k, v] of Object.entries(doc)) {
          if (v === undefined) continue;
          bump(u.docSurface, `${schemaTag}.${k}`, id, collection, doc);
        }
        // `marks[]` 是巢狀的一層，而且 `ability@1` 與 `item@1` 共用**同一份** spec ——
        // 兩邊的用量都記在同一個鍵上，否則道具那邊的疊層看起來像沒有人用。
        for (const mk of (Array.isArray(doc["marks"]) ? doc["marks"] : []) as unknown[]) {
          if (!mk || typeof mk !== "object") continue;
          for (const k of Object.keys(mk as Record<string, unknown>)) {
            bump(u.docSurface, `ability@1.marks[].${k}`, id, collection, doc["marks"]);
          }
        }
      }

      if (collection === "status-effects") {
        u.statuses.push(id);
        for (const t of (doc["tags"] as string[] | undefined) ?? [])
          u.statusTags.set(t, (u.statusTags.get(t) ?? 0) + 1);
      }
      if (collection === "augments") {
        u.augments.push({
          id,
          name: String(doc["name"] ?? id),
          tier: String(doc["tier"] ?? "?"),
          weight: Number(doc["weight"] ?? 0),
          hooks: ((doc["hooks"] as { on?: string }[] | undefined) ?? []).map((h) => String(h.on)),
          mods: ((doc["modifiers"] as unknown[] | undefined) ?? []).length,
        });
      }
    }
  };
  walkDir(root, "");
  u.augments.sort((a, b) => a.tier.localeCompare(b.tier) || b.weight - a.weight);
  return u;
}

// ---------------------------------------------------------------------------
// 產生 Markdown
// ---------------------------------------------------------------------------

function fieldTable(fields: Field[]): string[] {
  if (fields.length === 0) return ["（沒有參數）", ""];
  const out = ["| 參數 | 型別 | 必填 | 範圍 | 說明 |", "|---|---|---|---|---|"];
  for (const f of fields) {
    out.push(
      `| \`${f.name}\` | ${f.type} | ${f.optional ? "選填" : "**必填**"} | ${f.bounds || "—"} | ${f.desc || "—"} |`,
    );
  }
  out.push("");
  return out;
}

/**
 * 同一張參數表，多一欄「出貨內容用量」。
 *
 * ⭐ 那一欄不是裝飾：`spriteSheet` 寫在 schema 裡而 634 份出貨文件**一份都沒用過**，
 * 而「引擎收得下」與「有人真的讓它跑起來過」是兩件事。0 份的格子照抄有風險，
 * 這一欄讓那個風險看得見。
 */
function fieldTableWithUsage(fields: Field[], prefix: string, usage: Map<string, Slot>): string[] {
  if (fields.length === 0) return ["（沒有參數）", ""];
  const out = ["| 參數 | 型別 | 必填 | 範圍 | 出貨用量 | 說明 |", "|---|---|---|---|---:|---|"];
  for (const f of fields) {
    const u = usage.get(`${prefix}${f.name}`);
    out.push(
      `| \`${f.name}\` | ${f.type} | ${f.optional ? "選填" : "**必填**"} | ${f.bounds || "—"} | ` +
        `${u ? `${u.docs.size} 份` : "**0**"} | ${f.desc || "—"} |`,
    );
  }
  out.push("");
  return out;
}

function usageCell(u: Slot | undefined): string {
  if (!u) return "**0 份**（引擎有、內容沒人用）";
  const sample = [...u.docs].sort().slice(0, 3).join("、");
  return `${u.docs.size} 份（${sample}${u.docs.size > 3 ? " …" : ""}）`;
}

/**
 * 出貨內容裡真的存在的一段 JSON。
 *
 * ⭐ 範例**一律從 `content/` 抄**，⛔ 不自己編 —— 一個手寫的範例只要 schema 動過
 * 就會變成一段「照著抄會被拒絕」的程式碼，而它長得跟正確的一模一樣。
 * 從出貨內容抄的範例有一條免費的保證：它今天真的通過驗證，因為它今天真的在跑。
 */
function exampleBlock(u: Slot | undefined, pathOverride?: string): string[] {
  if (!u?.example) return [];
  const { doc: id, collection } = u.example;
  const where = pathOverride ?? `content/${collection}/${id}.json`;
  return [
    `<details><summary>出貨內容裡的實例 — \`${where}\`</summary>`,
    "",
    "```json",
    JSON.stringify(u.example.json, null, 2),
    "```",
    "",
    "</details>",
    "",
  ];
}

/**
 * ⭐ 五級距 —— 「級別 → 數字」的**全部**表，以及卡面值到場上實際值的那一乘。
 *
 * ⚠️ 為什麼這一節要在這裡：這份文件回答「它**怎麼用**」，而一個作者填了
 * `radiusTier: "中"` 之後最想知道的下一件事就是「中是多大」。在 2026-08-21 之前
 * 這份文件一個級距值都沒印，於是唯一寫著數字的地方是幾段**手打的散文**，
 * 而那些散文已經被量到過期（連級別名都少了一格）。
 *
 * ⭐ 表是**現場掃 `content/config/` 得到的**：任何一份 `config.*-tiers@1` 都會自己
 * 出現在下面，⛔ 不需要有人記得回來加一列。數字一格都不手打。
 */
export function tierLadderSection(): string[] {
  const dir = join(REPO, "content/config");
  const TIER_DOC_RE = /^config\.[a-z-]+-tiers@\d+$/;
  const docs: Record<string, unknown>[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, unknown>;
    if (TIER_DOC_RE.test(String(doc["schema"] ?? ""))) docs.push(doc);
  }
  const isNumMap = (v: unknown): v is Record<string, number> =>
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    Object.values(v).length > 0 &&
    Object.values(v).every((x) => typeof x === "number");

  const SKIP = new Set(["id", "schema", "note", "version", "enabled"]);
  const body = (d: Record<string, unknown>): [string, unknown][] =>
    Object.entries(d).filter(([k]) => !SKIP.has(k));

  // ⭐ 級別名是**推出來的**（各張表最常見的那一組鍵），⛔ 不是寫死的五個字 ——
  //   GH#463 才剛把它們整體左移過一格，一份抄本會在下一次改名時就地說謊。
  // ⚠️ 票**一份文件只投一次**：`{distance,speed}` 在位移那一份裡出現 10 次，
  //    級別名在整個 `content/config/` 裡只出現 8 次 —— 逐次投票會選錯那一組。
  //    級別名的判準是「**跨文件**共用」，那正是「五軸共用同一組名字」這件事本身。
  const votes = new Map<string, number>();
  const scan = (v: unknown, take: (keys: string[]) => void): void => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return;
    take(Object.keys(v));
    for (const x of Object.values(v)) scan(x, take);
  };
  for (const d of docs) {
    const seen = new Set<string>();
    for (const [, v] of body(d)) scan(v, (keys) => void seen.add(keys.join("｜")));
    for (const k of seen) votes.set(k, (votes.get(k) ?? 0) + 1);
  }
  const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (winner === undefined) {
    throw new Error("content/config 裡找不到任何一張級距表 —— 解析器與出貨設定分家了");
  }
  const LEVELS = winner[0].split("｜");
  const isLadder = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).join("｜") === winner[0];

  // 一份級距文件裡「級別 → 數字」的每一張表。三種形狀，⛔ 都不靠鍵名認：
  //   ① `radius.<級別>` 直接是數字            → 一張表
  //   ② `seconds.<形狀>.<級別>` 再一層         → 每個形狀一張
  //   ③ `travel.<級別>.{distance,speed}` 格子是物件 → 每個葉鍵一張
  const ladders: { id: string; rows: [string, Record<string, number>][] }[] = [];
  for (const d of docs) {
    const rows: [string, Record<string, number>][] = [];
    const harvest = (label: string, v: unknown): void => {
      if (!isLadder(v)) {
        if (v !== null && typeof v === "object" && !Array.isArray(v)) {
          for (const [k, x] of Object.entries(v)) harvest(label ? `${label} · ${k}` : k, x);
        }
        return;
      }
      const cells = LEVELS.map((lv) => v[lv]);
      if (cells.every((c) => typeof c === "number")) {
        rows.push([label, Object.fromEntries(LEVELS.map((lv, i) => [lv, cells[i] as number]))]);
        return;
      }
      if (!cells.every((c) => isNumMap(c))) return;
      for (const leaf of Object.keys(cells[0] as Record<string, number>)) {
        rows.push([
          `${label} · ${leaf}`,
          Object.fromEntries(LEVELS.map((lv, i) => [lv, (cells[i] as Record<string, number>)[leaf]!])),
        ]);
      }
    };
    for (const [k, v] of body(d)) harvest(k, v);
    if (rows.length > 0) ladders.push({ id: String(d["id"] ?? d["schema"]), rows });
  }

  const env = (
    JSON.parse(readFileSync(join(dir, "combat-env.json"), "utf8")) as {
      multipliers: Record<string, number>;
    }
  ).multipliers;

  const L = [
    "---",
    "",
    "## 0.5 五級距 —— 級別是**什麼數字**，以及它跟原始欄位誰贏",
    "",
    "填了級別欄位（`radiusTier` / `rangeTier` / `cooldownTier` / `damageTier` /",
    "`distanceTier`）就 ⛔ **不要**填它旁邊那格原始值。兩格都填 → **級別贏**，",
    "原始值被整格取代（⛔ 不是相加、⛔ 不是取大）。⭐ 要留特例的唯一寫法是**不填級別**。",
    "",
    "⚠️ 這件事發生在**註冊時**，⛔ 不在 JSON 裡 —— 所以任何直接讀技能 JSON 的工具",
    "（外部編輯器、報表、你自己的 grep）看到的原始值**可能不是引擎跑的那個數字**。",
    "",
  ];
  for (const l of ladders) {
    const names = Object.keys(l.rows[0]![1]);
    L.push(`**\`${l.id}\`**`, "");
    L.push("| 表 | " + names.join(" | ") + " |");
    L.push("|---|" + "--:|".repeat(names.length));
    for (const [label, row] of l.rows) {
      L.push(`| ${label} | ` + names.map((n) => String(row[n] ?? "—")).join(" | ") + " |");
    }
    L.push("");
  }
  L.push(
    "⚠️ 上面每一格都是**卡面值**。場上實際值還要再乘「戰鬥系統」頁的一格全域倍率：",
    "",
    "| 軸 | 倍率 | 出貨值 |",
    "|---|---|---:|",
    `| 冷卻 | \`cooldown\` | **${env["cooldown"]}** |`,
    `| 施法距離 · AoE 半徑 | \`abilityRange\` | **${env["abilityRange"]}** |`,
    `| 傷害 | \`damageDealt\` | **${env["damageDealt"]}** |`,
    "",
    "⛔ **不要拿卡面秒去算 DPS** —— 冷卻那一格的倍率離 1 最遠。",
    "",
  );
  return L;
}

export function buildSpecMarkdown(): string {
  const man = buildCapabilityManifest();
  const usage = scanContent();
  const cur = loadCurated();
  // ⭐ 兩個方向都跑，⛔ 而且在寫任何一行之前跑 —— 說謊的詞彙表不可以產出文件。
  const unnamedEffects = reconcileLabels(cur.effectKinds, man.effectKinds, "effectKinds").unnamed;
  const unnamedHooks = reconcileLabels(cur.hookEvents, man.hookEvents, "hookEvents").unnamed;
  const unnamedLeaves = reconcileLabels(cur.conditionLeaves, man.conditionLeafKinds, "conditionLeaves").unnamed;
  for (const f of cur.structuralFacts) checkStructuralFact(f);
  const zh = (m: Record<string, string>, k: string): string => m[k] ?? "**待命名**";
  const docs = hookDocs();
  const scopes = worldHookScopes();
  const direct = directFireSites();
  const effects = unionArmsByKind(zEffectDef);

  const L: string[] = [];
  /** ⚠️ 要吃 `p(...lines)` —— 只收一個參數的版本會把每一張表截成只剩表頭。 */
  const p = (...lines: string[]): void => void L.push(...(lines.length === 0 ? [""] : lines));

  // ── 檔頭 ────────────────────────────────────────────────────────────
  p("# GGD 技能標記機制與效果規則");
  p();
  p("> ⛔ **這份檔案是產生出來的，不要手改。**");
  p(">");
  p("> ```bash");
  p("> pnpm spec:build      # 重新產生");
  p("> pnpm spec:check      # 過期就回非零（`pnpm test` 會跑它）");
  p("> ```");
  p(">");
  p("> 來源：出貨的 Zod schema（參數與上下界）＋ 出貨的註冊表（哪些機制真的有處理器）");
  p("> ＋ `content/**/*.json`（誰在用它）。所以它**不可能**與引擎不一致 —— 不一致的那一刻");
  p("> `skillSpecFresh.test.ts` 就會紅。");
  p(">");
  p(`> 引擎指紋 \`${man.schema} / ${man.fingerprint}\`。`);
  p("> ⛔ 刻意沒有產生日期：任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，");
  p("> 於是 `--check` 只能被放寬成模糊比對，而一條被放寬的閘等於沒有閘。");
  p();
  p("## 這份與 `ggd-runtime-capabilities.md` 的分工");
  p();
  p("| 文件 | 回答什麼 | 給誰 |");
  p("|---|---|---|");
  p("| `docs/editor-contract/ggd-runtime-capabilities.md` | 「這個名字**存不存在**」—— supported / unsupported 勾選表 | 外部編輯器 pin base |");
  p("| **本檔** | 「它**怎麼用**」—— 參數、上下界、觸發時機、持有者方向、誰在用 | 設計卡片／技能的人 |");
  p();
  p("兩者共用同一個 `buildCapabilityManifest()`，所以名詞那一層不可能互相矛盾。");
  p();

  // ── 0 技能說明的佔位符（說明推導（票號待開））──────────────────────────────────────
  // ⭐ 用量是**數出來的**（出貨 `content/abilities/*.json` 的說明），⛔ 不是手寫的。
  const proseUse = new Map<string, number>();
  for (const f of readdirSync(join(REPO, "content/abilities"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const desc = (
      JSON.parse(readFileSync(join(REPO, "content/abilities", f), "utf8")) as {
        description?: unknown;
      }
    ).description;
    if (typeof desc !== "string") continue;
    for (const m of desc.matchAll(PLACEHOLDER_RE)) {
      const slot = parseSlot(m[1]!, m[2]!);
      if (slot !== undefined) proseUse.set(slot.slot, (proseUse.get(slot.slot) ?? 0) + 1);
    }
  }
  p("---");
  p();
  p("## 0. 技能說明（`description`）—— ⛔ 不可以手打機制數字");
  p();
  p("一段說明裡的**冷卻／耗魔／傷害／施法距離／範圍**一律寫成**佔位符**，");
  p("由引擎在註冊時從**同一份 JSON** 算繪出來（`packages/shared/src/content/abilityProse.ts`，");
  p("接在 `registerAll` 的級距解析正上方 —— 全專案**唯一**的算繪處）。");
  p();
  p("⛔ **為什麼不可以手打**：一句「45秒冷卻」與 `cooldown: [45,45,45,45]` 是**兩個住處**，");
  p("而它們之間沒有守衛。級距表一改、倍率一轉，說明就地變成謊話 ——");
  p("`content:build` 綠、Zod 綠、全套測試綠。佔位符讓這一族的謊話**在結構上寫不出來**：");
  p("`{{cd}}` 沒有自己的值，它**就是** `cooldown[]`。");
  p();
  p("| 佔位符 | 是什麼 | 從哪一格推導 | 算繪成 | 出貨內容用到 |");
  p("|---|---|---|---|---:|");
  for (const k of PROSE_SLOT_KEYS) {
    const d = PROSE_SLOT_DOC[k];
    p(`| \`{{${k}}}\` | ${d.zh} | \`${d.from}\` | ${d.renders} | ${proseUse.get(k) ?? 0} |`);
  }
  p();
  p("· 語法逐字是 `{{鍵}}`，鍵是小寫英文。⛔ 不吃空白（`{{ cd }}` 不算）。");
  p(`· 只有 \`${INDEXED_SLOTS.join("` / `")}\` 可以帶序號：\`{{dmg2}}\` = 效果樹上**第 2 個**傷害葉。`);
  p(
    `· 結尾加 \`${LIVE_SUFFIX}\` = **實際值**：\`{{cd}}\` 是**卡面秒**（\`config.cooldown-tiers@1\` 那三張表的空間），` +
      `\`{{cd${LIVE_SUFFIX}}}\` 是玩家**真的等到**的秒（卡面 × \`combatEnv.cooldown\`，再過 \`config.cooldown-rules@1\` 的秒數地板）。`,
  );
  p("  ⛔ 兩個都是真的，它們住在**不同的空間** —— 語法表達不出第二種的話，作者只能把它手打回去。");
  p("· **解不開的佔位符會原樣印在卡片上**（`{{dmg3}}` 就是 `{{dmg3}}`），⛔ 引擎不會替你");
  p("  退回一個看起來合理的數字 —— 一個裸的佔位符是刺眼的，一個憑空的 `0` 不是。");
  p();
  p(`**⭐ 哪幾軸有實際值（\`{{鍵${LIVE_SUFFIX}}}\`）** —— ⛔ 判準只有一條：**這一軸的「實際」`);
  p("是不是一個單一因子**？不是的話就沒有，因為一個看起來合理、實際上算錯的數字比一個裸的");
  p("佔位符糟得多。⚠️ 沒有實際值的軸寫成 `{{鍵!}}` 會**原樣印在卡片上**，⛔ 不會退回卡面值。");
  p();
  p("| 佔位符 | 實際值 | 為什麼 |");
  p("|---|---|---|");
  for (const k of PROSE_SLOT_KEYS) {
    const r = LIVE_RULES[k];
    p(
      `| \`{{${k}${LIVE_SUFFIX}}}\` | ${r.kind === "factor" ? `× \`combatEnv.${r.env}\`` : "⛔ 沒有"} | ${r.why} |`,
    );
  }
  p();
  p("**⭐ 為什麼傷害／冷卻／耗魔是數字、距離／範圍是級距詞** —— owner 2026-08-19 逐字：");
  p("「所有**卡面範圍跟距離說明**都應該要跟著改五級距（**傷害/冷卻/耗魔要明確數值**");
  p("不然很難讓玩家判斷取捨）」。⛔ 這不是排版偏好，是玩家要拿來算取捨的東西。");
  p();
  p("**⛔ 兩種段落一個字都不會被動到**");
  p();
  p("| 段落 | 為什麼 |");
  p("|---|---|");
  p("| `「…」` | **角色對白不是效果**。44-04 心臟麻痺的「在35秒後宣布勝利吧」是台詞，⛔ 不是一支有 35 秒時序的技能。整段受保護（含跨行、含行中） |");
  p("| `（GGD 註記 …）` | 那是**當初為什麼這樣做**的紀錄；機械改寫它等於把歷史改成看起來像現在的樣子 |");
  p();
  p("⚠️ **外部編輯器的自動建議也適用**：讀說明去猜機制之前要先剝掉 `「…」`，");
  p("否則產出的 JSON 會多出台詞裡那個不存在的機制。");
  p();

  // ── 0.5 五級距 ──────────────────────────────────────────────────────
  p(...tierLadderSection());

  // ── 1 總覽 ──────────────────────────────────────────────────────────
  p("---");
  p();
  p("## 1. 總覽");
  p();
  p("| 詞彙 | 引擎有 | 出貨內容用到 | 零使用 |");
  p("|---|---:|---:|---:|");
  const rowFor = (label: string, all: readonly string[], used: Map<string, { docs: Set<string> }>): void => {
    const usedCount = all.filter((k) => used.has(k)).length;
    p(`| ${label} | ${all.length} | ${usedCount} | **${all.length - usedCount}** |`);
  };
  rowFor("effect 種類", man.effectKinds, usage.effectKinds);
  rowFor("hook 事件（觸發時機）", man.hookEvents, usage.hookEvents);
  p(
    `| 條件葉 | ${man.conditionLeafKinds.length} | ${man.conditionLeafKinds.filter((k) => usage.conditionLeaves.has(k)).length} | **${man.conditionLeafKinds.filter((k) => !usage.conditionLeaves.has(k)).length}** |`,
  );
  p(`| 屬性 \`Stat\` | ${Object.keys(Stat).length} | — | — |`);
  p(`| 運算 \`ModOp\` | ${Object.keys(ModOp).length} | — | — |`);
  p(`| 技能模板家族 | ${man.templateFamilies.length} | — | — |`);
  p(`| 狀態效果文件 | ${usage.statuses.length} | — | — |`);
  p(`| 狀態標籤（相異） | ${usage.statusTags.size} | — | — |`);
  p();
  p("**出貨內容規模**");
  p();
  p("| 集合 | 文件數 |");
  p("|---|---:|");
  for (const [c, n] of [...usage.collections].sort((a, b) => b[1] - a[1])) p(`| \`${c}\` | ${n} |`);
  p();

  // ── 2 屬性與運算 ────────────────────────────────────────────────────
  p("---");
  p();
  p("## 2. 屬性與運算 —— 一條 `modifier` 寫得出什麼");
  p();
  p("一條 modifier 的形狀固定是 `{ stat, op, value }`。");
  p();
  p("### 2.1 屬性 `stat`");
  p();
  p("| | | | |");
  p("|---|---|---|---|");
  const stats = Object.values(Stat);
  for (let i = 0; i < stats.length; i += 4) {
    p(`| ${stats.slice(i, i + 4).map((s) => `\`${s}\``).join(" | ")} |${"  |".repeat(Math.max(0, 4 - stats.slice(i, i + 4).length))}`);
  }
  p();
  p("### 2.2 運算 `op`");
  p();
  p("| `op` | 意思 |");
  p("|---|---|");
  p("| `flat` | 直接加一個絕對值 |");
  p("| `pctAdd` | 加進**同一個加法區**（兩份 +50% = +100%） |");
  p("| `pctMult` | 自己一個**乘區**（兩份 +50% = ×2.25）。⚠️ 乘層數是**線性**的：3 層 ×10% = +30% |");
  p("| `override` | 直接覆蓋掉 |");
  p("| `capRaise` | 把這條屬性的**上限抬到** `value`。多來源取 max（5 和 7 給 7，不是 12） |");
  p("| `percentOf` | 取另一條屬性／即時資源的百分比（要一起寫 `from` 或 `fromResource`） |");
  p();
  p("### 2.3 `modifier` 的完整欄位");
  p();
  p(...fieldTableOfStatModifier());
  p();
  p("### 2.4 數值式 —— 傷害／治療／護盾的「多少」怎麼寫");
  p();
  p("十幾個 effect 的 `amount` 都是這個形狀，所以只寫在這裡一次。");
  p("四格可以**同時**存在，最後相加。");
  p();
  p(...fieldTable(fieldsOf(zScaling)));
  p("```json");
  p('{ "flat": 40, "ratios": [{ "stat": "ap", "coeff": 0.3 }] }   // 40 +（30% 法強）');
  p("```");
  p();

  // ── 3 hook 事件 ─────────────────────────────────────────────────────
  p("---");
  p();
  p("## 3. 觸發時機 `hook` —— 什麼時候發、發給誰");
  p();
  p("⚠️ **方向是這一節最容易寫錯的東西。** 「持有者」是卡片／技能掛在誰身上，");
  p("「target」是 hook 裡 `target: \"event\"` 指到的那個人。兩者在「別人對我做了什麼」");
  p("這一族（被暈眩／被反彈／迴避成功／護盾被打破）是**反的**。");
  p();
  p("### 3.1 一覽");
  p();
  p("| 事件 | 中文 | 發給誰 | 出貨內容用量 |");
  p("|---|---|---|---|");
  for (const ev of man.hookEvents) {
    const sc = scopes.get(ev);
    const where = sc ? SCOPE_ZH[sc.scope] ?? sc.scope : direct.has(ev) ? "當事人（直接發射）" : "—";
    p(`| \`${ev}\` | ${zh(cur.hookEvents, ev)} | ${where} | ${usageCell(usage.hookEvents.get(ev))} |`);
  }
  if (unnamedHooks.length > 0) p("", `⚠️ 還沒有中文名的：${unnamedHooks.map((t) => `\`${t}\``).join(" · ")}`);
  p();
  p("### 3.2 觸發器 `hook` 自己的欄位");
  p();
  p(...fieldTable(fieldsOf(zHookDef, ["effects"])));
  p("`effects` = 這個時刻要跑的效果陣列，內容見第 5 節。");
  p();
  p("### 3.3 逐一");
  p();
  for (const ev of man.hookEvents) {
    p(`#### \`${ev}\` —— ${zh(cur.hookEvents, ev)}`);
    p();
    const sc = scopes.get(ev);
    if (sc) {
      p(`- **發射點**：\`WorldHookSystem\` 廣播表，來源事件 \`${sc.simEvent}\`，作用域 **${SCOPE_ZH[sc.scope] ?? sc.scope}**`);
    }
    const d = direct.get(ev);
    if (d && d.length > 0) p(`- **發射點**：${d.map((f) => `\`${f.replace("packages/shared/src/sim/", "")}\``).join("、")}`);
    p(`- **出貨內容用量**：${usageCell(usage.hookEvents.get(ev))}`);
    const doc = docs.get(ev);
    if (doc) {
      p();
      for (const line of doc.split("\n")) p(line.startsWith("─") || line.trim() === "" ? "" : `> ${line}`);
    }
    p();
    p(...exampleBlock(usage.hookEvents.get(ev)));
  }

  // ── 4 條件 ──────────────────────────────────────────────────────────
  p("---");
  p();
  p("## 4. 條件 —— 怎麼把一段效果關起來");
  p();
  p("條件可以掛在**觸發器**上（整條不跑）或掛在**單一 effect** 上（只有這一段不跑）。");
  p();
  p("| 條件葉 | 中文 | 出貨內容用量 |");
  p("|---|---|---|");
  for (const leaf of man.conditionLeafKinds)
    p(`| \`${leaf}\` | ${zh(cur.conditionLeaves, leaf)} | ${usageCell(usage.conditionLeaves.get(leaf))} |`);
  if (unnamedLeaves.length > 0) p("", `⚠️ 還沒有中文名的：${unnamedLeaves.map((t) => `\`${t}\``).join(" · ")}`);
  p();
  for (const leaf of man.conditionLeafKinds) {
    const ex = exampleBlock(usage.conditionLeaves.get(leaf));
    if (ex.length > 0) {
      p(`**\`${leaf}\`**`);
      p();
      p(...ex);
    }
  }
  p("**所有分支的欄位聯集**（有些能力是「既有葉子多一格」，只看葉子名會漏）：");
  p();
  p(man.conditionLeafFields.map((f) => `\`${f}\``).join(" · "));
  p();
  {
    const f = fieldsOf(zEffectCondition);
    if (f.length > 0) {
      p("**條件根節點的欄位**");
      p();
      p(...fieldTable(f));
    }
  }

  // ── 5 effect 種類 ───────────────────────────────────────────────────
  p("---");
  p();
  p("## 5. Effect 種類 —— 每一種真的做得到什麼");
  p();
  p("下面每一種都**在出貨引擎裡有處理器**（清單由註冊表推導）。不在這張表上的名稱");
  p("一律被拒絕，遊戲端回 `unsupported-runtime`。");
  p();
  p("`condition` 這一格每一種都有，語意一樣（見第 4 節），所以逐節不重複列。");
  p();
  p("⭐ **每一節多了一行「定義檔」**（GH#467）—— 一個 kind 一個檔，檔名恆等於 kind。");
  p("要改一個 kind 的欄位或上下界，只要動那一個檔，⛔ 不必再擠進一份 4,754 行的 union。");
  p("那一行是**去磁碟上找出來的**（找不到就不印），⛔ 不是一句照著慣例寫死的宣稱。");
  p();
  for (const kind of [...effects.keys()].sort()) {
    const arm = effects.get(kind)!;
    p(`### \`${kind}\` —— ${zh(cur.effectKinds, kind)}`);
    p();
    const where = kindShardFiles(kind);
    if (where) p(`**定義檔**：${where}`);
    if (where) p();
    p(`**出貨內容用量**：${usageCell(usage.effectKinds.get(kind))}`);
    p();
    p(...fieldTable(fieldsOf(arm, ["kind", "condition"])));
    p(...exampleBlock(usage.effectKinds.get(kind)));
  }

  // ── 6 授權格 ────────────────────────────────────────────────────────
  p("---");
  p();
  p("## 6. 授權格 —— `modifiers` / `hooks` 以外還能給什麼");
  p();
  p("這幾格是**道具與三選一增益卡共用**的來源授權。它們解決的是同一個問題：");
  p("「這一場每次攻擊 20% 機率 3 倍傷害」如果退化成加 `critChance` / `critDamage`");
  p("兩條**聚合**屬性，會讓身上**每一次**暴擊都變那個倍率，而不是這張卡自己那一次。");
  p();
  for (const [name, schema] of Object.entries(SOURCE_GRANT_SHAPE)) {
    p(`### \`${name}\``);
    p();
    const u = unwrap(schema as z.ZodTypeAny);
    if (u.desc) p(`> ${oneLine(u.desc, 400)}`, "");
    p(...fieldTable(fieldsOf(schema as z.ZodTypeAny)));
  }

  // ── 7 標記與狀態標籤 ────────────────────────────────────────────────
  p("---");
  p();
  p("## 7. 標記、層數與狀態標籤");
  p();
  p("### 7.1 三種「疊」是三件不同的事");
  p();
  p("| 寫法 | 疊的是什麼 | 語意 |");
  p("|---|---|---|");
  p("| `applyStatus.stacks` | 狀態的**層數** | 加/減 N 層；`refresh` 決定續期是延長還是保留 |");
  p("| `applyBuff.stackKey` | **同一格**來源收合 | 收合後 `pctMult` 是**線性**的（3 層 ×10% = +30%） |");
  p("| `applyBuff` **不填** `stackKey` | 每次施加**各自一格**來源 | 於是 `pctMult` 變成複利 (1+v)^N |");
  p();
  p("⚠️ 要複利就不要填 `stackKey`，要線性就填 —— 這是作者的選擇，不是引擎的限制。");
  p();
  p(`### 7.2 狀態標籤詞彙（從 ${usage.statuses.length} 份 \`content/status-effects/*.json\` 的 \`tags\` 推導）`);
  p();
  p("條件葉 `status-tag` 選得到的就是這些。");
  p();
  p("| 標籤 | 幾份狀態帶它 |");
  p("|---|---:|");
  for (const [t, n] of [...usage.statusTags].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])))
    p(`| \`${t}\` | ${n} |`);
  p();
  p("**所有狀態效果 id**");
  p();
  p([...usage.statuses].sort().map((s) => `\`${s}\``).join(" · "));
  p();

  // ── 7.3 狀態軸（applyStatus 的五根）+ 7.4 結構事實 ──────────────────
  p("### 7.3 `applyStatus` 的五根軸");
  p();
  p("⚠️ 這五根是**全部** —— `applyStatus` 沒有屬性軸。要改屬性用 `applyBuff`。");
  p();
  p("| 軸 | 中文 | 說明 |");
  p("|---|---|---|");
  for (const [k, v] of Object.entries(cur.statusAxes)) {
    const [name, ...rest] = v.split(" —— ");
    p(`| \`${k}\` | ${name} | ${rest.join(" —— ") || "—"} |`);
  }
  p();

  p("---");
  p();
  p("## 8. ⚠️ 會撞到的牆 —— 卡片寫得出來，但在這些情境裡不會發生");
  p();
  p("這一節是**推導不出來**的工程事實，所以它手寫在 `tools/skill-spec/curated.json`。");
  p("⭐ 但每一條都帶一個**對原始碼跑的斷言** —— 引擎一改，`pnpm spec:build` 就回非零");
  p("並指名是哪一條過期了。⛔ 它不會像散文那樣無聲地爛掉。");
  p();
  for (const f of cur.structuralFacts) {
    p(`### ${f.title}`);
    p();
    p(...f.body);
    p();
    if (f.assert) {
      const what = f.assert.absent !== undefined ? `**沒有** \`${f.assert.absent}\`` : `**有** \`${f.assert.present}\``;
      p(`> 🔒 這一條由產生器盯著：\`${f.assert.file}\` 裡必須${what}。`);
      p();
    }
  }

  p("---");
  p();
  p("## 9. ⛔ 文件上出現過、但**引擎沒有**的名字");
  p();
  p("⚠️ 它們散落在舊版詞彙表裡，照著寫的 JSON 會被拒收或安靜地什麼都不做。");
  p("留在這裡是因為**知識不可以無聲消失** —— 「考慮過、沒有做」本身是資訊。");
  p();
  p("| 名字 | 原本想做什麼 | 為什麼今天不能用 |");
  p("|---|---|---|");
  for (const r of cur.retiredTokens) p(`| \`${r.token}\` | ${r.what} | ${r.why} |`);
  p();

  // ── 8 模板家族 ──────────────────────────────────────────────────────
  p("---");
  p();
  p("## 10. 技能模板家族");
  p();
  p("模板 = 參數化的技能骨架，填參數就展開成一組 effect。清單由展開器本人過濾，");
  p("所以不會宣稱一個展不開的家族。");
  p();
  p(man.templateFamilies.map((f) => `\`${f}\``).join(" · "));
  p();

  // ── 9 不可用 / 已知壞掉 ─────────────────────────────────────────────
  p("---");
  p();
  p("## 11. ⛔ 引擎會主動拒絕 / 會安靜收下的東西");
  p();
  p("### 11.1 `unsupported` —— 用了會被**明確拒絕**（回 `unsupported-runtime`）");
  p();
  p(man.unsupported.length === 0 ? "（目前沒有）" : man.unsupported.map((t) => `- \`${t}\``).join("\n"));
  p();
  p("### 11.2 ⛔ `knownBroken` —— 枚舉裡有、schema 收得下、**但會被安靜地收下然後什麼都不發生**");
  p();
  p("⚠️ 這一格比 11.1 危險：9.1 會報錯，這裡不會。設計卡片時把它們當成不存在。");
  p();
  if (man.knownBroken.length === 0) {
    p("（目前沒有）");
  } else {
    p("| 名稱 | 壞在哪 | issue |");
    p("|---|---|---|");
    for (const b of man.knownBroken) p(`| \`${b.token}\` | ${oneLine(b.what)} | ${b.issue} |`);
  }
  p();

  // ── 10 三選一增益卡附錄 ─────────────────────────────────────────────
  p("---");
  p();
  p("## 12. 附錄：回合獎勵三選一（`augment@1`）");
  p();
  p("### 12.1 一張卡寫得出什麼");
  p();
  p(...fieldTable(fieldsOf(zAugmentDoc, ["schema"])));
  p("⚠️ 增益卡是**抽到就掛**、沒有階級概念（建來源時不帶 rank），所以掛在卡上的");
  p("hook payload 只讀得到 `perRank` 的第 1 欄。");
  p();
  p("### 12.2 出貨的卡現在長什麼樣");
  p();
  const byTier = new Map<string, typeof usage.augments>();
  for (const a of usage.augments) {
    const list = byTier.get(a.tier) ?? [];
    list.push(a);
    byTier.set(a.tier, list);
  }
  p("| 階級 | 張數 | 權重合計 | 純屬性（零觸發） | 有觸發 |");
  p("|---|---:|---:|---:|---:|");
  for (const tier of ["silver", "gold", "prismatic"]) {
    const list = byTier.get(tier) ?? [];
    const flat = list.filter((a) => a.hooks.length === 0).length;
    p(`| ${tier} | ${list.length} | ${list.reduce((s, a) => s + a.weight, 0)} | ${flat} | ${list.length - flat} |`);
  }
  p();
  p("| 階級 | id | 卡名 | 權重 | 觸發時機 | 屬性條數 |");
  p("|---|---|---|---:|---|---:|");
  for (const tier of ["silver", "gold", "prismatic"]) {
    for (const a of byTier.get(tier) ?? [])
      p(`| ${tier} | \`${a.id}\` | ${a.name} | ${a.weight} | ${a.hooks.length ? a.hooks.map((h) => `\`${h}\``).join("＋") : "—（常駐）"} | ${a.mods} |`);
  }
  p();
  p("### 12.3 ⭐ 設計卡片時最該看的一格");
  p();
  {
    const unusedHooks = man.hookEvents.filter((h) => !usage.hookEvents.has(h));
    const augHooks = new Set(usage.augments.flatMap((a) => a.hooks));
    const notInAugments = man.hookEvents.filter((h) => !augHooks.has(h));
    p(`- 引擎有 **${man.hookEvents.length}** 個觸發時機，三選一增益卡只用了 **${augHooks.size}** 個。`);
    p(`- 增益卡**完全沒用過**的 ${notInAugments.length} 個：${notInAugments.map((h) => `\`${h}\``).join(" · ")}`);
    if (unusedHooks.length > 0)
      p(`- 全出貨內容（含技能與道具）都沒用過的 ${unusedHooks.length} 個：${unusedHooks.map((h) => `\`${h}\``).join(" · ")}`);
    const flat = usage.augments.filter((a) => a.hooks.length === 0).length;
    p(
      `- **${flat} / ${usage.augments.length} 張是零觸發的純屬性棒**（${Math.round((flat / Math.max(1, usage.augments.length)) * 100)}%）—— 這是「抽到也翻不了盤」的直接來源。`,
    );
  }
  p();

  // ── 13 特效授權面 ───────────────────────────────────────────────────
  p("---");
  p();
  p("## 13. 特效（VFX）授權面 —— 一份 `vfx@1` 與一層 `vfxLayers` 寫得出什麼");
  p();
  p("⚠️ **這一節在 2026-08-18 之前完全不存在**（GH#372），而少的不是一個欄位，");
  p("是**整個面**：`vfx@1` 的每一格與 `ability@1.vfxLayers[]` 的每一格覆寫，");
  p("對讀這份文件的人（與外部編輯器）都是不存在的。⛔ 它的失敗方式是最安靜的一種 ——");
  p("沒有任何錯誤，只是**不知道有這些格子**，於是做出來的技能一律沒有特效參數。");
  p();
  p("兩層的分工（和第〇·五守則一樣的兩層）：");
  p();
  p("| 層 | 寫在哪 | 是什麼 |");
  p("|---|---|---|");
  p("| **模板** | `content/vfx/<id>.json` | 一份粒子定義。**被很多支技能共用** |");
  p("| **這一支的覆寫** | `content/abilities/<id>.json` 的 `vfxLayers[]` | 同一份模板，這一支放大／轉色／改仰角／延後播 |");
  p();
  p("⭐ 所以「想改一支技能的特效」**幾乎不需要新增 vfx 文件** —— 加一層覆寫就好。");
  p("⚠️ 反過來也成立：改一份 `content/vfx/` 文件會動到**每一支**引用它的技能。");
  p();
  {
    const vfxDocs = tsdocFields("packages/shared/src/content/schema/vfx.ts", "const zVfxDocBase = z", "type VfxDocShape");
    const orientDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "export const zVfxOrient = z",
      "export type VfxOrient",
    );
    const ribbonDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "export const zRibbonDoc = z",
      "export type RibbonDoc",
    );
    const bindDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "export const zVfxAbilityFamilyBinding = z",
      "export type VfxAbilityFamilyBinding",
    );
    // GH#390 —— 四個時機的 TSDoc 住在**共用的那一份** `vfxSoundCueShape`（一個模板，
    // 兩個地方用）。⛔ 少了這一張 map，`soundLaunch` 那四列的說明欄會整欄空白，
    // 而那看起來跟「這幾格沒有說明」一模一樣（tsdocFields 檔頭記的同一個坑）。
    const cueDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "const vfxSoundCueShape = {",
      "} as const;",
    );
    const familyDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "export const zVfxFamilyTuning = z",
      "export type VfxFamilyTuning",
    );
    const layerDocs = tsdocFields(
      "packages/shared/src/content/schema/abilityVfx.ts",
      "export const zAbilityVfxLayer = z",
      "export type AbilityVfxLayer",
    );
    // GH#384 —— 逐技能綁定那三格的 TSDoc（同一支抽取器，第三／四／五張表）。
    const primBindDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "export const zVfxPrimBinding = z",
      "export type VfxPrimBinding",
    );
    const famBindDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "export const zVfxFamilyBinding = z",
      "export type VfxFamilyBinding",
    );
    const promoBindDocs = tsdocFields(
      "packages/shared/src/content/schema/vfx.ts",
      "export const zVfxPromotedBinding = z",
      "export type VfxPromotedBinding",
    );

    p("### 13.1 `vfx@1` —— 一份粒子模板");
    p();
    p(...fieldTableWithUsage(withDocs(fieldsOf(zVfxDoc, ["id", "schema"]), vfxDocs), "vfx@1.", usage.vfxSurface));
    p("⚠️ **ABSENT ≠ ZERO**：少一格的意思是「用引擎的預設」，⛔ 不是 0。");
    p("`alpha: 0` 是「明確要求完全透明」—— 也就是看不見。清空一格要把 key 整個拿掉。");
    p();
    p(...exampleBlock(usage.vfxSurface.get("vfx@1.blendMode")));

    p("### 13.2 `vfx@1.orient` —— 方位（⭐ 巢狀，只看 13.1 只看得到 `orient` 這個名字）");
    p();
    const orientFields = withDocs(fieldsOf(zVfxOrient), orientDocs);
    p(`這 ${orientFields.length} 格是「這一招朝哪個方向噴」。⛔ 在它之前，\`beam\` / \`bolt\` / \`dash\` / \`slash\``);
    p("這些**有方向的形狀，每一次施法都朝同一個方向噴**，跟打誰完全無關。");
    p();
    p(...fieldTableWithUsage(orientFields, "vfx@1.orient.", usage.vfxSurface));
    p("⭐ 預設 `yaw 0 / pitch 90 / swirl 0` 是**恆等變換** —— 沒寫 `orient` 的文件");
    p("走的是一位元不差的舊路徑。所以「橫放的柱狀砲」不是新程式，是既有的柱狀");
    p("primitive 加一格 `pitchDeg: 0`：");
    p();
    p(...exampleBlock(usage.vfxSurface.get("vfx@1.orient.pitchDeg")));
    p("而「旋轉」是 `swirlDegPerSec`：");
    p();
    p(...exampleBlock(usage.vfxSurface.get("vfx@1.orient.swirlDegPerSec")));

    p("### 13.3 `ability@1.vfxLayers[]` —— 這一支技能自己的特效堆疊");
    p();
    p(`一支技能最多 **${ABILITY_VFX_LAYER_HARD_CAP}** 層（schema 硬擋），`);
    p(`出貨預設上限 **${DEFAULT_MAX_ABILITY_VFX_LAYERS}** 層（後台 \`config.vfx-families@1.maxAbilityVfxLayers\` 可調）。`);
    p("`vfxLayers` **在的時候就是這支技能的完整堆疊**，由上往下依序播 ——");
    p("所以**第一層通常就把原本的 `vfxKey` 再寫一次**。");
    p();
    p(
      ...fieldTableWithUsage(
        withDocs(fieldsOf(zAbilityVfxLayer), layerDocs, bindDocs),
        "ability@1.vfxLayers[].",
        usage.vfxSurface,
      ),
    );
    p("⚠️ `anchor`（骨頭掛點）**刻意不在這張表上** —— 施法特效走的是不做骨頭綁定的");
    p("那條播放路徑，開一格 `anchor` 等於開一個寫了會被吃掉的欄位。");
    p();
    p(...exampleBlock(usage.vfxSurface.get("ability@1.vfxLayers[].delayMs")));

    p("### 13.4 `ribbon@1` —— 掛在骨頭後面的拖尾（住在同一個 `vfx` 集合）");
    p();
    p("同一個資料夾裡的**第二種**文件，靠 `schema` 欄位分辨。它不是粒子，是一條");
    p("跟著骨頭掃出來的帶子（刀光那一族）。");
    p();
    p(...fieldTableWithUsage(withDocs(fieldsOf(zRibbonDoc, ["id", "schema"]), ribbonDocs), "ribbon@1.", usage.vfxSurface));
    p(...exampleBlock(usage.vfxSurface.get("ribbon@1.lifespanSec")));

    p("### 13.5 `config.vfx-families@1.abilities[]` —— 後台那一張逐技能覆寫表");
    p();
    p("⚠️ **這是第三個授權位置，而且它不在任何一份技能文件裡** ——");
    p("它住在 `content/config/vfx-families.json`（＝後台可以改的那一張表），");
    p("鍵是技能 doc 的 id。同一顆 w3x 素材「這一支放大、那一支轉紅」就寫在這裡。");
    p();
    p("| 和 13.3 的差別 | |");
    p("|---|---|");
    p("| `vfxLayers[]` | 技能**自己**的堆疊，跟著內容一起出貨 |");
    p("| 這一張表 | **後台**的覆寫，改了不用動技能文件（第一守則的形狀） |");
    p();
    p(
      ...fieldTableWithUsage(
        withDocs(fieldsOf(zVfxAbilityFamilyBinding), bindDocs, cueDocs),
        "config.vfx-families@1.abilities[].",
        usage.vfxSurface,
      ),
    );
    p("⭐ `anchor` 在**這一張**表上是有效的（它走的是會綁骨頭的那條路），");
    p("在 13.3 的層堆疊上沒有 —— 兩張表 pick 的是同一份 Zod 定義，差別只在誰消費得了。");
    p();
    // ⚠️ 這一格的「一份文件」是**一支技能的 entry**，不是一個檔 —— 路徑要指到
    //    它真正住的地方，⛔ 不可以讓通用組路徑的那一行編出 `content/config/<技能>.json`。
    p(
      ...exampleBlock(
        usage.vfxSurface.get("config.vfx-families@1.abilities[].w3xScale"),
        "content/config/vfx-families.json → abilities",
      ),
    );

    p("### 13.6 `config.vfx-families@1.families[]` —— 21 個**家族原型**（含特效自帶的音效）");
    p();
    p("⭐ 這是 13.5 覆寫的**那個東西**。258 支技能不是 258 份設定，是 21 個原型 +");
    p("一張覆寫表 —— 形狀（`primitive`）、顏色（`element`）、大小、高度**與四個時機的音效**");
    p("都在這一層決定，逐支那一張表只填「這一支哪裡不一樣」。");
    p();
    p("**特效自帶的音效**（GH#390）。WC3 把特效與音效綁在一起：mdx 的事件軌在四個時機上掛音。");
    p("`soundLaunch` / `soundImpact` / `soundLoop` / `soundDissipate` 四格填的是");
    p("**`config.audio-map@1.sfx` 的 key**（例 `explosion`、`projectileHit`），");
    p("⛔ 不是檔名也不是 URL —— 音量／冷卻／同時發聲數住在 audio-map 那一份，");
    p("播放走既有的空間化管線，所以玩家的總音量與 SFX 開關自動適用。");
    p();
    p("| | |");
    p("|---|---|");
    p("| 兩層 | `abilities[<id>].soundX` **逐格**蓋 `families[<fam>].soundX`，⛔ 不是整組換掉 |");
    p("| 循環 | 每 `soundLoopMs` **重播一次**，`soundLoopMaxMs` 絕對到期時自動回收並改播消散音 |");
    p("| 填錯 | audio-map 沒有那個 key ⇒ **這個時機安靜**，⛔ 不報錯（所以請對照 audio-map 填） |");
    p("| 總開關 | `config.vfx-families@1.soundEnabled`（省略 = 開） |");
    p();
    p(
      ...fieldTableWithUsage(
        withDocs(fieldsOf(zVfxFamilyTuning), familyDocs, cueDocs),
        "config.vfx-families@1.families[].",
        usage.vfxSurface,
      ),
    );
    p(
      ...exampleBlock(
        usage.vfxSurface.get("config.vfx-families@1.families[].soundLaunch"),
        "content/config/vfx-families.json → families",
      ),
    );

    p("### 13.7 `config.vfx-ability-art@1.bindings` —— **哪一支技能畫哪一組特效**");
    p();
    p("⚠️ **這一整面在 2026-08-19 之前不在任何一份 JSON 裡**（GH#384）：617 筆");
    p("「技能 id → 特效參數」住在 `apps/client/src/render/vfx/` 的三張 TypeScript");
    p("常數表。⛔ 外部編輯器看不到 TypeScript，**而且不會知道自己漏了** ——");
    p("它產得出效果、產得出粒子模板，卻永遠決定不了「這一招用哪一個」。");
    p();
    p("住在 `content/config/vfx-ability-art.json`，鍵是**技能 doc 的 id**（`godie-e001.q`）。");
    p("一列有三格，⛔ 它們不是三選一而是三個層級 —— 解析順序是");
    p("**晉升 > 家族證據 > 名字分類**，後台 `config.vfx-families@1.abilities[]`（13.5）再蓋在最上面：");
    p();
    p("| 授權位置 | 是什麼 | 誰有 |");
    p("|---|---|---|");
    p("| `config.vfx-ability-art@1.bindings.prim` | 讀技能中文名分出來的**元素 + 形狀**，`fx.prim.*` 的來源 | 每一支（基準線） |");
    p("| `config.vfx-ability-art@1.bindings.family` | 原作**證明**的家族原型 + 那個呼叫點自己的數值 | 258 支 |");
    p("| `config.vfx-ability-art@1.bindings.promoted` | 原作藝術真的出貨成 emitter 文件的那些，直接指名 doc | 34 支 |");
    // ⚠️ 這張表與下面那幾個 fieldTable 是**手抄的四格**。加第五格時兩處都要補,
    // ⛔ 漏掉的話 `vfxSurfaceInContract.test.ts` 會紅 —— 那正是 2026-08-20 抓到
    // `bindings.owner` 沒進對外契約的方式（外部編輯器看不到的格子）。
    p("| `config.vfx-ability-art@1.bindings.owner` | ⭐ **owner 的設計覆寫** —— 贏過原作證據,但輸給後台 live。`why` 必填 | 逐支指定 |");
    p();
    p("⚠️ **ABSENT ≠ 1.0**：`scale` / `tint` / `flyHeight` 缺席的意思是「原作沒有為");
    p("這個呼叫點寫過一個值」，⛔ 不是「原作寫了 1.0」—— 前者走家族預設，後者會把家族");
    p("預設乘掉。`paramSource` 就是為了讓這個區別看得見才存在的（`ref` = 這個呼叫點自己");
    p("寫的、`model` = 這個模型在全部引用裡只有唯一一個值）。");
    p();
    p("⭐ `family` 那一格是**推導出來的**，⛔ 不要手改：");
    p("`pnpm exec tsx apps/client/src/render/vfx/generateAbilityArtContent.ts`");
    p("從 `tools/w3x-import` 的兩份普查產物重新算，而 `w3xFamilyArt.test.ts` 逐欄比對。");
    p("`prim` 與 `promoted` 沒有上游（一個是人讀名字分的、一個是人挑的），所以那兩格");
    p("**這份 JSON 就是它們的家**，產生器逐位保留。");
    p();
    p(
      ...fieldTableWithUsage(
        withDocs(fieldsOf(zVfxPrimBinding), primBindDocs),
        "config.vfx-ability-art@1.bindings.prim.",
        usage.vfxSurface,
      ),
    );
    p(
      ...fieldTableWithUsage(
        withDocs(fieldsOf(zVfxFamilyBinding), famBindDocs),
        "config.vfx-ability-art@1.bindings.family.",
        usage.vfxSurface,
      ),
    );
    p(
      ...fieldTableWithUsage(
        withDocs(fieldsOf(zVfxPromotedBinding), promoBindDocs),
        "config.vfx-ability-art@1.bindings.promoted.",
        usage.vfxSurface,
      ),
    );
    p(
      ...fieldTableWithUsage(
        fieldsOf(zVfxOwnerBinding),
        "config.vfx-ability-art@1.bindings.owner.",
        usage.vfxSurface,
      ),
    );
    p(
      ...exampleBlock(
        usage.vfxSurface.get("config.vfx-ability-art@1.bindings.family.paramSource"),
        "content/config/vfx-ability-art.json → bindings",
      ),
    );
  }

  // ── 13.8 骨頭掛件（GH#392）──────────────────────────────────────────
  {
    p("### 13.8 `attachment@1` —— **穿在骨頭上的模型**（WC3 的 `Asph` 球體）");
    p();
    p("⚠️ 這是 `content/vfx/` 的**第三種** schema（另外兩種是 `vfx@1` 粒子與 `ribbon@1` 緞帶），");
    p("⛔ **它不走 `vfxLayers`** —— 那條路解析的是 `VfxDefs`，一個 `attachment@1` 的 id");
    p("填進 `vfxLayers[].vfxKey` 執行期會被靜靜跳過。掛件綁在");
    p("`config.ambient-vfx@1.bindings` 上，鍵是 **modelKey 或 championId**（形態感知 ——");
    p("悟空兩態共用同一個 modelKey，只有 championId 分得出超三）。");
    p();
    p("⭐ 它比「附著」多做兩件事，而那兩件正是 2026-08-19 之前缺的：");
    p("**跟隨**（`follow`，每幀跟著骨頭的世界矩陣走，⛔ 不是生成當下取一次座標）與");
    p("**自己播動畫**（`anim`／`animLoop`）—— 後者缺席時，悟空的超三頭從上架起就是**定格**的。");
    p();
    p("⚠️ `points` 一格掛一份拷貝（= WC3 的 `atac`），所以「雙手各一顆球」是");
    p("`points: [\"left,hand\", \"right,hand\"]`，⛔ 不是兩份文件。");
    p();
    p(
      ...fieldTableWithUsage(
        fieldsOf(zAttachmentDoc),
        "attachment@1.",
        usage.vfxSurface,
      ),
    );
  }

  // ── 14 文件授權面 ───────────────────────────────────────────────────
  p("---");
  p();
  p("## 14. 文件授權面 —— 一支技能／一件道具／一個狀態**本身**寫得出什麼");
  p();
  p("⚠️ **這一節在 2026-08-19 之前完全不存在**（GH#380），而它少的比 §13 更基本：");
  p("前面十二節講的是**效果**（打多少、掛什麼狀態），這一節才是");
  p("「**這一支是指定還是範圍、射得多遠、多久放一次、耗多少魔**」。");
  p("量到的：`castType` / `range` / `hitRadius` / `craftRole` / `authoringNote`");
  p("在這份文件裡各出現 **0 次** —— ⛔ 而那不會報錯，只會讓每一支新技能的那幾格");
  p("都是引擎的預設值。`status-effect@1` 那一列更直接：欄位是 0 就代表**做不出新狀態**。");
  p();
  p("⚠️ `id` 與 `schema` 兩格**每一份文件都有**（`id` 是檔名那一個，`schema` 是版本標籤），");
  p("所以下面每一張表都把它們拿掉了 —— 它們不是這個面的內容。");
  p();
  {
    /**
     * ⭐ **一張表，⛔ 不是七段程式**（第零守則⑨）。一列 = 一個授權位置：
     * 出貨的 Zod、TSDoc 說明的錨點、以及一句「它是什麼」。
     * ⚠️ 欄位名／型別／上下界全部由 `fieldsOf()` 從那份 Zod 推導，所以 schema 多一格
     * 不必回來改這裡。
     */
    const surfaces: {
      key: string;
      title: string;
      schema: z.ZodTypeAny;
      docs: Map<string, string>;
      notes: string[];
    }[] = [
      {
        key: "ability@1",
        title: "一支技能的骨架",
        schema: zAbilityDef,
        docs: tsdocFields("packages/shared/src/content/schema/ability.ts", "export const zAbilityDef = z", "export const zAbilityDoc = zAbilityDef"),
        notes: [
          "⭐ `effects` 那一格的內容是前面十二節，⛔ 這張表講的是**它外面那一層**。",
          "⚠️ `castType` 與 `range` / `radius` 一起決定「這一招怎麼指」——",
          "填了 `targeted` 卻不給 `range`，遊戲端拿的是引擎預設，⛔ 不是你想的那個距離。",
        ],
      },
      {
        key: "ability@1.marks[]",
        title: "疊層計數器（⭐ 巢狀；`item@1.marks[]` 是**同一份**定義）",
        schema: zMarkSpec,
        docs: tsdocFields("packages/shared/src/content/schema/mark.ts", "export const zMarkSpec = z", "export type MarkSpecDoc"),
        notes: [
          "只看 `ability@1` 只看得到 `marks` 這個名字，看不到裡面這八格。",
          "⚠️ `durationSec: -1` = **永久**；`resetOn` 管的是回合邊界，兩者是**兩根獨立的軸**。",
        ],
      },
      {
        key: "projectile@1",
        title: "飛行物 —— `spawnProjectile` 的 `projectileKey` 指到的那份文件",
        schema: zProjectileDoc,
        docs: tsdocFields("packages/shared/src/content/schema/projectile.ts", "export const zProjectileDef = z", "export const zProjectileDoc = zProjectileDef"),
        notes: [
          "⛔ `spawnProjectile` 進了合約而**它指到的文件沒有** —— 於是「飛得多快、",
          "碰撞半徑多大、穿幾個人」這三件事沒有任何一份文件講過。",
        ],
      },
      {
        key: "status-effect@1",
        title: "一個狀態的身分（`applyStatus` 的 `statusId` 指到這裡）",
        schema: zStatusEffectDoc,
        docs: tsdocFields("packages/shared/src/content/schema/statusEffect.ts", "export const zStatusEffectDoc = z", "export type StatusEffectDoc"),
        notes: [
          "⚠️ **狀態的行為不在這份文件裡** —— 這份只給身分（名字／圖示／正負面／`tags`），",
          "真正的機制由引擎依 `tags` 執行。所以新增一個狀態＝挑對 `tags`，",
          "⛔ 不是在這裡寫一段效果。可用的 `tags` 見前面的狀態章節。",
        ],
      },
      {
        key: "item@1",
        title: "一件道具",
        schema: zItemDoc,
        docs: tsdocFields("packages/shared/src/content/schema/item.ts", "export const zItemDef = z", "export const zItemDoc = zItemDef"),
        notes: [
          "⭐ `craftRole` 決定它在商店／抽獎裡**站哪一格**，填錯不會報錯，只會出現在錯的地方。",
          "⚠️ `authoringNote` 有硬字數上限；寫爆了要**另存全文**再留一行指標，",
          "⛔ 不要把原文剪短塞回去。",
        ],
      },
      {
        key: "champion@1",
        title: "一位英雄",
        schema: zChampionDoc,
        docs: tsdocFields("packages/shared/src/content/schema/champion.ts", "export const zChampionDef = z", "export const zChampionDoc = zChampionDef"),
        notes: ["`abilities` 是**技能 id 的清單**，每一支的內容住在自己的 `ability@1` 文件裡。"],
      },
      {
        key: "template@1",
        title: "參數化的技能骨架（鑄技工坊）",
        schema: zTemplateDoc,
        docs: tsdocFields("packages/shared/src/content/schema/template.ts", "export const zTemplateDoc = z", "export type TemplateDoc"),
        notes: [
          "⛔ 它不是另一種技能：一支技能用 `template: {ref, params}` 引用它，",
          "展開器在註冊時把 `effects` 那一半填出來。`params` 的型別／上下界寫在這份文件裡。",
        ],
      },
    ];
    let n = 0;
    for (const s of surfaces) {
      n += 1;
      p(`### 14.${n} \`${s.key}\` —— ${s.title}`);
      p();
      for (const line of s.notes) p(line);
      if (s.notes.length > 0) p();
      p(
        ...fieldTableWithUsage(
          withDocs(fieldsOf(s.schema, ["id", "schema"]), s.docs),
          `${s.key}.`,
          usage.docSurface,
        ),
      );
    }
  }

  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** `zStatModifier` 走的是 `.superRefine`，用固定表比內省穩，欄位語意也更好讀。 */
function fieldTableOfStatModifier(): string[] {
  return fieldTable([
    { name: "stat", type: "列舉（見 2.1）", optional: false, bounds: "", desc: "改哪一條屬性" },
    { name: "op", type: "列舉（見 2.2）", optional: false, bounds: "", desc: "怎麼改" },
    { name: "value", type: "數字", optional: false, bounds: "", desc: "改多少。百分比寫小數（0.35 = 35%）" },
    { name: "from", type: "列舉（見 2.1）", optional: true, bounds: "", desc: "`percentOf` 專用：取哪一條屬性的百分比" },
    { name: "fromResource", type: "`hp` / `mp`", optional: true, bounds: "", desc: "`percentOf` 專用：取**即時**資源的百分比" },
    { name: "scopeSlot", type: "技能格", optional: true, bounds: "", desc: "只對某一格技能生效" },
    { name: "scopeAbilityId", type: "文字", optional: true, bounds: "≤ 64 字", desc: "只對某一支技能生效" },
  ]);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * id → **算繪之後**的說明。⚠️ 走的是 `registerAll` 那一份（模板展開 + 級距解析
 * 之後），⛔ 不是磁碟原文 —— 104 支模板技的效果樹在磁碟上是空的。
 */
function buildProseJson(): string {
  const rendered: Record<string, string> = {};
  for (const id of [...Abilities.ids()].sort()) {
    const def = Abilities.get(id) as unknown as { description?: unknown };
    if (typeof def?.description === "string" && def.description !== "") {
      rendered[id] = def.description;
    }
  }
  return (
    JSON.stringify(
      {
        schema: "ggd-ability-prose@1",
        note:
          "算繪之後的技能說明（玩家看到的字）。來源是 content/abilities/*.json 的佔位符原文，" +
          "由 packages/shared/src/content/abilityProse.ts 唯一那支算繪器產生。⛔ 不要手改。",
        rendered,
      },
      null,
      2,
    ) + "\n"
  );
}

async function main(argv: readonly string[]): Promise<number> {
  const check = argv.includes("--check");
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? resolve(argv[outIdx + 1] ?? "") : DEFAULT_OUT;
  const proseOut = outIdx >= 0 ? undefined : DEFAULT_PROSE_OUT;

  const md = buildSpecMarkdown();
  // ⭐ 算繪好的說明要走**註冊表**（模板展開 + 級距解析之後），⛔ 不是磁碟原文。
  registerAll((await new ContentLoader(new FsContentSource(join(REPO, "content"))).load()).store);
  const proseJson = buildProseJson();

  if (proseOut !== undefined) {
    if (check) {
      if (!existsSync(proseOut) || readFileSync(proseOut, "utf8") !== proseJson) {
        process.stderr.write(
          `⛔ ${proseOut} 已經過期 —— 技能說明或它推導的數字改過了。\n` +
            `   跑 \`pnpm spec:build\` 然後 \`git add docs/\`。⛔ 不要改測試。\n`,
        );
        return 1;
      }
    } else {
      writeFileSync(proseOut, proseJson);
    }
  }

  if (check) {
    if (!existsSync(out)) {
      process.stderr.write(`⛔ 技能規則說明還沒產生：${out}\n   跑 \`pnpm spec:build\`。\n`);
      return 1;
    }
    const cur = readFileSync(out, "utf8");
    if (cur !== md) {
      process.stderr.write(
        `⛔ ${out} 已經過期 —— 引擎的 schema／註冊表／內容改過了，但這份文件沒跟上。\n` +
          `   跑 \`pnpm spec:build\` 然後 \`git add docs/\`。⛔ 不要改測試。\n`,
      );
      return 1;
    }
    process.stdout.write(`✅ 技能規則說明是最新的（${md.split("\n").length} 行）\n`);
    return 0;
  }

  writeFileSync(out, md);
  process.stdout.write(`✅ 寫出 ${out}（${md.split("\n").length} 行）\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  // ⛔ 不用 top-level await —— tsx 這裡的輸出格式是 cjs，它會 transform 失敗。
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
