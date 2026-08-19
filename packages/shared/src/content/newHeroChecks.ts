/**
 * ⭐【創建新英雄 —— **存檔當下**就跳的警示】GH#480（承重的那一層）
 *
 * owner 2026-08-20：「⋯**生成代入與檢查跳警示**都要記得更新，
 * 特別是 **script 程式自動化跟警示**的部分」。
 *
 * ── ⛔ 為什麼不能等 `content:build` ────────────────────────────────────────
 *
 * 今天新英雄靠 `docs/new-hero-SOP`（#214）那份**人工清單**。清單是**判準**不是閘 ——
 * 漏一格不會有任何東西紅。而真正會紅的那些閘全部在**遠離現場**的地方：
 *   · `content:build` 要等到作者離開編輯器之後才跑
 *   · `descriptionClaims` / `abilityNoOpEffects` 是**全樹**掃描 + 棘輪名單，
 *     一位新英雄的問題會被淹在 baseline 裡
 * ⇒ CLAUDE.md 的原話：「**只在遠離現場的地方響的警報不是守衛**」。
 *   這一支就是把同一組判斷搬到**存檔的那一刻**。
 *
 * ── 六條規則，⭐ 每一條都**重用**既有的判斷，⛔ 不重寫 ──────────────────────
 *
 * | 規則 | 借用誰 | 它問什麼 |
 * |---|---|---|
 * | `empty-column` | 本檔（{@link ../content/newHeroDefaults.columnApplies}） | owner 點名的六欄，這一格該有而沒有 |
 * | `out-of-bounds` | **出貨 Zod**（`zAbilityDoc`/`zChampionDoc`）| 上下界 ⭐ **從 schema 讀，⛔ 不抄字面值** |
 * | `principle-band` | `config.authoring-rules@1` | 冷卻落在 owner 的原則區間外 |
 * | `claim-mismatch` | `descriptionClaims.scanAbility` | 說明的數字↔JSON 對不上（冷卻／耗魔／持續／傷害） |
 * | `no-op-effect` | `abilityNoOpEffects.analyseAbility` | 說了但**一個數字都動不到**（第一·五守則） |
 * | `dialogue-claim` | 本檔（{@link dialogueText}） | ⭐ 機制數字被寫進 `「…」`（第〇·六守則②） |
 *
 * ⚠️ **`dialogue-claim` 是唯一一條沒有前例的**，而它正是 owner 點名的那一條：
 * 「」裡是**角色對白不是效果**。既有的每一支（`batch1.py` / `descriptionClaims` /
 * `heroForgePage`）都只做到「**剝掉它**」—— 剝掉之後那段台詞就消失了，
 * 作者永遠不知道他把「冷卻 30 秒」寫進了台詞裡，而卡片上那句話**引擎不會讀**。
 * ⇒ 剝掉是為了不誤讀；**這一條是為了告訴作者他剛剛寫了一句不會生效的話。**
 *
 * ── ⛔ 模板技（`template`）的兩條規則**整條不判** ──────────────────────────
 *
 * `descriptionClaims.ts` 的檔頭已經記了這個坑：104 支技能的 `effects` 在磁碟上是
 * 空的，真正的內容住在 `template.ref` 裡，由 `registerAll` 展開（失敗形態⑤）。
 * 編輯器手上拿的是**磁碟形狀**，所以對模板技跑 `claim-mismatch` / `no-op-effect`
 * 會 100% 誤報 —— 而一條會誤報的閘會被下一個人放寬，放寬過的閘等於沒有閘。
 *
 * ── 第一守則：每一條都是一格後台開關 ───────────────────────────────────────
 *
 * {@link DEFAULT_NEW_HERO_CHECKS} 是出貨值，{@link newHeroChecksFromDoc} 讀
 * `config/new-hero-checks.json`（⚠️ 見該函式的註解：那份 JSON **還沒上架**）。
 * ⛔ 全部預設 **on** —— 第〇·六守則：「優先權大的更新後都是預設啟動」。
 */
import { z } from "zod";
import { zAbilityDoc } from "./schema/ability";
import { zChampionDoc } from "./schema/champion";
import {
  mechanicsText,
  cooldownClaims,
  manaClaims,
  damageClaims,
  durationClaims,
  scanAbility,
} from "./descriptionClaims";
import { analyseAbility } from "./abilityNoOpEffects";
import { NORMALIZED_STAT_KEYS } from "./statNormalization";
import {
  columnApplies,
  firstDamageAmount,
  NEW_HERO_ABILITY_COLUMNS,
  type NewHeroColumnKey,
} from "./newHeroDefaults";
import type { AbilityDef } from "../sim/content/defs";
import type { CastType } from "../sim/content/defs";

export type NewHeroWarnRule =
  | "empty-column"
  | "out-of-bounds"
  | "principle-band"
  | "claim-mismatch"
  | "no-op-effect"
  | "dialogue-claim";

/** 六條規則的次序 + 一句「它擋的是什麼」。⭐ 後台開關表與文件都從這裡推導。 */
export const NEW_HERO_WARN_RULES: readonly {
  readonly rule: NewHeroWarnRule;
  readonly zh: string;
  readonly note: string;
}[] = Object.freeze([
  Object.freeze({
    rule: "empty-column" as const,
    zh: "六欄留白",
    note: "說明／施展距離／範圍／傷害／冷卻／耗魔 這一格該有而是空的或 0。⚠️ 不適用的組合（self 技的施展距離）不算。",
  }),
  Object.freeze({
    rule: "out-of-bounds" as const,
    zh: "超出 Zod 上下界",
    note: "界線**從出貨 schema 讀**，⛔ 不抄字面值 —— 界改了這一條自動跟著改。這一類寫進去伺服器會 422。",
  }),
  Object.freeze({
    rule: "principle-band" as const,
    zh: "冷卻不在原則區間",
    note: "`config.authoring-rules@1` 的單體／範圍冷卻區間。⚠️ owner 說的是「原則上」—— 只警告，保留刻意破例的空間。",
  }),
  Object.freeze({
    rule: "claim-mismatch" as const,
    zh: "說明的數字對不上 JSON",
    note: "卡面寫 25 秒冷卻而 `cooldown` 是 60。⛔ 模板技整條不判（它的 effects 在磁碟上本來就是空的）。",
  }),
  Object.freeze({
    rule: "no-op-effect" as const,
    zh: "說了但不會發生",
    note: "整棵效果樹一個數字都動不到（第一·五守則）。⛔ 模板技整條不判。",
  }),
  Object.freeze({
    rule: "dialogue-claim" as const,
    zh: "機制數字寫進了台詞",
    note: "⭐「」裡是**角色對白不是效果**（第〇·六守則②）。寫在裡面的冷卻／耗魔／傷害／持續**引擎一格都不讀**。",
  }),
]);

export interface NewHeroWarning {
  /**
   * `block` = 這樣寫**存不進去**（伺服器的 Zod 會 422）—— 這是事實陳述，
   * ⛔ 不是我決定要擋。其餘一律 `warn`（owner 2026-08-12：「只是個警告標記，並不會擋」）。
   */
  readonly level: "warn" | "block";
  readonly rule: NewHeroWarnRule;
  /** 哪一份文件（`abilities/godie-h001.q`） */
  readonly doc: string;
  /** 哪一格（`cooldown` / `baseStats.maxHealth` / `description`） */
  readonly field: string;
  readonly message: string;
}

// ─────────────────────────────────────────────────────── 後台旋鈕（第一守則）─

export interface NewHeroChecksConfig {
  /** 逐條開關。⛔ 全部預設 on。 */
  readonly rules: Readonly<Record<NewHeroWarnRule, boolean>>;
  /** 中位數推導的最小樣本數（餵給 `deriveAbilityDefaults`）。 */
  readonly minSample: number;
  /** 建立新技能時要不要**自動代入**一段從數字生出來的說明。 */
  readonly autofillDescription: boolean;
}

export const NEW_HERO_CHECKS_DOC_ID = "new-hero-checks";
export const NEW_HERO_CHECKS_SCHEMA = "config.new-hero-checks@1";

export const DEFAULT_NEW_HERO_CHECKS: NewHeroChecksConfig = Object.freeze({
  rules: Object.freeze({
    "empty-column": true,
    "out-of-bounds": true,
    "principle-band": true,
    "claim-mismatch": true,
    "no-op-effect": true,
    "dialogue-claim": true,
  }),
  minSample: 8,
  autofillDescription: true,
});

export const zConfigNewHeroChecksDoc = z
  .object({
    id: z.literal(NEW_HERO_CHECKS_DOC_ID),
    schema: z.literal(NEW_HERO_CHECKS_SCHEMA),
    note: z.string().optional(),
    rules: z
      .object(
        Object.fromEntries(NEW_HERO_WARN_RULES.map((r) => [r.rule, z.boolean()])) as Record<
          NewHeroWarnRule,
          z.ZodBoolean
        >,
      )
      .strict(),
    /** 樣本少於這個數就往上一層退。上界 200 是誤植守衛（打成 800 = 每一格都退到 fallback）。 */
    minSample: z.number().int().min(1).max(200),
    autofillDescription: z.boolean(),
  })
  .strict();

/**
 * 讀後台文件；讀不到／形狀不對就回出貨值。
 *
 * ⚠️ **`content/config/new-hero-checks.json` 目前不存在，而且⛔ 現在還不可以放上去** ——
 * `config.new-hero-checks@1` 還沒有被登記進 `schema/config.ts` 的
 * `zConfigDoc` 判別聯集。一份聯集不認得的 config 文件會讓**整份內容載入失敗**
 * （2026-08-02 的生產故障就是這個形狀）。順序是：先登記聯集 + 後台頁，**再**放 JSON。
 */
export function newHeroChecksFromDoc(raw: unknown): NewHeroChecksConfig {
  const parsed = zConfigNewHeroChecksDoc.safeParse(raw);
  if (!parsed.success) return DEFAULT_NEW_HERO_CHECKS;
  const d = parsed.data;
  return {
    rules: Object.freeze({ ...d.rules }) as Readonly<Record<NewHeroWarnRule, boolean>>,
    minSample: d.minSample,
    autofillDescription: d.autofillDescription,
  };
}

// ────────────────────────────────────────────────────────────────── 第〇·六② ─

/**
 * ⭐ 說明裡**只有台詞**的那一段（`mechanicsText` 丟掉的那一半）。
 *
 * ⚠️ 與 `descriptionClaims.mechanicsText` 是同一條正則的**互補集**，
 * 所以兩者不可能對「哪裡是台詞」有不同的看法。整段 `「…」`、含跨行、含行中。
 */
export function dialogueText(desc: string): string {
  return [...desc.matchAll(/「[^」]*」/gs)].map((m) => m[0]).join("\n");
}

// ─────────────────────────────────────────────────────────────────── 檢查本體 ─

/** 一份要檢查的草稿。`collection` 決定用哪一個 Zod schema。 */
export interface NewHeroDocInput {
  readonly collection: "abilities" | "champions";
  readonly id: string;
  readonly doc: Readonly<Record<string, unknown>>;
}

export interface CheckOptions {
  readonly config?: NewHeroChecksConfig;
  /**
   * `config.authoring-rules@1` 的內容（`singleTargetCooldown` / `aoeCooldown`）。
   * ⛔ 沒傳 ⇒ `principle-band` 整條不判（⛔ 不猜區間）。
   */
  readonly authoringRules?: {
    readonly singleTargetCooldown?: { readonly min: number; readonly max: number };
    readonly aoeCooldown?: { readonly min: number; readonly max: number };
  };
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const firstRank = (v: unknown): number | undefined => {
  if (isNum(v)) return v;
  if (Array.isArray(v)) for (const x of v) if (isNum(x)) return x;
  return undefined;
};

const COLUMN_ZH: Readonly<Record<NewHeroColumnKey, string>> = Object.freeze(
  Object.fromEntries(NEW_HERO_ABILITY_COLUMNS.map((c) => [c.key, c.zh])) as Record<
    NewHeroColumnKey,
    string
  >,
);

/**
 * 效果樹上有沒有**任何**一發傷害。
 * ⭐ 借 `newHeroDefaults` 的走訪器 —— ⛔ 不寫第二份：兩份對「什麼算傷害」的看法
 * 一旦分岔，代入與警示就會對同一支技能給出相反的結論（而兩邊各自都是綠的）。
 */
const hasDamage = (effects: unknown): boolean => firstDamageAmount(effects) !== undefined;

/** 一份技能草稿上的所有警示。 */
function checkAbility(
  input: NewHeroDocInput,
  cfg: NewHeroChecksConfig,
  opts: CheckOptions,
): NewHeroWarning[] {
  const out: NewHeroWarning[] = [];
  const doc = input.doc;
  const where = `${input.collection}/${input.id}`;
  const push = (
    rule: NewHeroWarnRule,
    field: string,
    message: string,
    level: "warn" | "block" = "warn",
  ): void => {
    if (cfg.rules[rule]) out.push({ level, rule, doc: where, field, message });
  };

  const castType = (typeof doc["castType"] === "string" ? doc["castType"] : "self") as CastType;
  const slot = typeof doc["slot"] === "string" ? doc["slot"] : "";
  const templated = doc["template"] !== undefined;
  const desc = typeof doc["description"] === "string" ? doc["description"] : "";

  // ① 六欄留白 —— ⛔ 不適用的組合不算（self 技沒有施展距離）。
  const missing = (col: NewHeroColumnKey, why: string): void =>
    push("empty-column", col === "damage" ? "effects" : col, `【${COLUMN_ZH[col]}】${why}`);

  if (desc.trim() === "") missing("description", "是空的 —— 卡片上這位英雄的這一格什麼都不會寫。");
  if ((firstRank(doc["cooldown"]) ?? 0) === 0)
    missing("cooldown", "是 0 —— 這一格按下去可以連續施放，而多數情況那是「還沒填」不是設計。");
  if ((firstRank(doc["manaCost"]) ?? 0) === 0)
    missing("manaCost", "是 0 —— 沒有成本的技能不受魔力池限制。");
  if (columnApplies("range", castType, slot) && doc["rangeTier"] === undefined && (firstRank(doc["range"]) ?? 0) === 0)
    missing("range", `是 0，但施放型態是 ${castType} —— 引擎會要求貼著目標才放得出來。填 rangeTier 或 range。`);
  if (columnApplies("radius", castType, slot) && doc["radiusTier"] === undefined && !isNum(doc["radius"]))
    missing("radius", `沒填，但施放型態是 ${castType} —— 它會退回引擎預設半徑，而卡面上看不出來。填 radiusTier 或 radius。`);
  if (columnApplies("damage", castType, slot) && !templated && !hasDamage(doc["effects"]))
    missing("damage", "效果樹上一發傷害都沒有 —— 如果這支技能本來就不打傷害請忽略這一條。");

  // ② Zod 上下界 —— ⭐ 界線從**出貨 schema** 讀。
  const parsed = zAbilityDoc.safeParse(doc);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      push(
        "out-of-bounds",
        issue.path.join(".") || "(整份)",
        `${issue.message} —— 這樣寫伺服器會 422（界線來自出貨 Zod schema）。`,
        "block",
      );
    }
  }

  // ③ 原則界（冷卻）—— ⛔ 沒有規則文件就整條不判。
  const cd = firstRank(doc["cooldown"]);
  const band =
    castType === "ground" || castType === "skillshot"
      ? opts.authoringRules?.aoeCooldown
      : opts.authoringRules?.singleTargetCooldown;
  if (cd !== undefined && cd > 0 && band) {
    const kind = castType === "ground" || castType === "skillshot" ? "範圍" : "單體";
    if (cd < band.min || cd > band.max)
      push(
        "principle-band",
        "cooldown",
        `冷卻 ${cd} 秒不在${kind}技能的原則區間 ${band.min}–${band.max} 秒內（config.authoring-rules@1）。⚠️ 只警告不擋。`,
      );
  }

  // ④⑤ 說明↔JSON / 說了但不會發生 —— ⛔ 模板技整條不判（磁碟上的 effects 是空的）。
  if (!templated) {
    const def = doc as unknown as AbilityDef & { description?: string };
    for (const m of scanAbility(def)) {
      push("claim-mismatch", "description", `說明寫「${m.claim}」，但 ${m.why}。`);
    }
    for (const f of analyseAbility(def)) {
      push("no-op-effect", f.path, `${f.why}（第一·五守則：卡片上不可以有「說了但不會發生」的字）。`);
    }
  }

  // ⑥ ⭐ 機制數字被寫進台詞 —— 引擎**一格都不讀**。
  const said = dialogueText(desc);
  if (said !== "") {
    const found = [
      ...cooldownClaims(said).map((c) => ({ what: "冷卻", text: c.text })),
      ...manaClaims(said).map((c) => ({ what: "耗魔", text: c.text })),
      ...damageClaims(said).map((c) => ({ what: "傷害", text: c.text })),
      ...durationClaims(said).map((c) => ({ what: "持續", text: c.text })),
    ];
    for (const f of found) {
      push(
        "dialogue-claim",
        "description",
        `「${f.text}」寫在角色對白裡 —— ⛔ 台詞不是效果，這個${f.what}數字引擎一格都不讀。要它生效就把它移到台詞外面。`,
      );
    }
  }

  // ⚠️ 剝掉台詞之後說明整個空掉 = 這一格只有台詞，沒有任何機制文字。
  if (desc.trim() !== "" && mechanicsText(desc).trim() === "")
    push("dialogue-claim", "description", "整段說明都是角色對白 —— 剝掉「」之後一個字都不剩，玩家讀不到這支技能做什麼。");

  return out;
}

/** 十一項屬性 —— `NORMALIZED_STAT_KEYS` 是唯一一份清單，⛔ 不在這裡抄第二份。 */
const RUNTIME_FILLED = new Set(["ms", "armor", "mr"]);

function checkChampion(input: NewHeroDocInput, cfg: NewHeroChecksConfig): NewHeroWarning[] {
  const out: NewHeroWarning[] = [];
  const where = `${input.collection}/${input.id}`;
  const push = (
    rule: NewHeroWarnRule,
    field: string,
    message: string,
    level: "warn" | "block" = "warn",
  ): void => {
    if (cfg.rules[rule]) out.push({ level, rule, doc: where, field, message });
  };

  const base = (input.doc["baseStats"] ?? {}) as Record<string, unknown>;
  for (const stat of NORMALIZED_STAT_KEYS) {
    const v = base[stat];
    if (v === undefined) {
      push("empty-column", `baseStats.${stat}`, `十一項屬性缺了【${stat}】—— 引擎直接讀 baseStats[stat]，缺席時這位英雄的這一項是 0。`);
      continue;
    }
    // ⚠️ ms / armor / mr 出生時就是 0：它們**等著被正規化填**（heroForge 的註解）。
    if (isNum(v) && v === 0 && !RUNTIME_FILLED.has(stat))
      push("empty-column", `baseStats.${stat}`, `十一項屬性的【${stat}】是 0 —— 同定位中位數沒有代入，這位英雄的這一項比同儕整整少一格。`);
  }

  const parsed = zChampionDoc.safeParse(input.doc);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      push(
        "out-of-bounds",
        issue.path.join(".") || "(整份)",
        `${issue.message} —— 這樣寫伺服器會 422（界線來自出貨 Zod schema）。`,
        "block",
      );
    }
  }
  return out;
}

/**
 * ⭐ 一位新英雄整批草稿的警示 —— **存檔的那一刻**跑這一支。
 *
 * 回傳順序：文件順序 × 規則順序（穩定，畫面與 CLI 讀同一份）。
 */
export function checkNewHeroDocs(
  docs: readonly NewHeroDocInput[],
  opts: CheckOptions = {},
): NewHeroWarning[] {
  const cfg = opts.config ?? DEFAULT_NEW_HERO_CHECKS;
  const out: NewHeroWarning[] = [];
  for (const d of docs) {
    out.push(...(d.collection === "abilities" ? checkAbility(d, cfg, opts) : checkChampion(d, cfg)));
  }
  return out;
}
