/**
 * ⛔ **卡片上寫的數字，必須是引擎裡真的那個數字。**
 *
 * ── 為什麼這一支要存在（owner 2026-08-19 的問題）─────────────────────────────
 *
 * owner：「我怎麼記得上次技能普查 JSON 與說明一致你已經 100% 通過了？」
 *
 * ⚠️ 那個 100% 是**另一件事**。2026-08-18 的普查三欄逐字是：
 *   ① 施放得出來 98.06%  ② 真的產生效果 97.61%  ③ **是不是純 JSON 100%**
 * ③ 問的是「有沒有人為單一技能寫 if」（第〇·五守則），⛔ 不是「說明與 JSON 一致」；
 * ② 問的是「有沒有任何一個數字會動」（{@link ./abilityNoOpEffects}），
 * ⛔ 也不是「卡面**承諾的那件事**有沒有發生」。
 *
 * ⇒ **描述↔JSON 一致性從來沒有被量過。** 這一支是第一次量它。
 *
 * ── 這一族與三個姊妹閘的分界（⛔ 不要合併）────────────────────────────────
 *
 * | 閘 | 它問的 | 它為什麼看不到這一族 |
 * |---|---|---|
 * | `noOpModifierClaims` | 這條 modifier 改得動任何數字嗎 | 「25秒冷卻」對上 `cooldown:[60]` —— 兩個都是**真的**數字 |
 * | `abilityNoOpEffects` | 這段效果改得動任何數字嗎 | 同上：一發 350 傷害改得動，只是卡面寫 1500 |
 * | `abilityCastClaims` | 輸入有沒有人讀 / `[召喚]` 有沒有身體 | 它只看**標籤**，⛔ 不讀內文的數字 |
 * | Zod schema | 欄位在不在界內 | 兩邊各自合法 |
 *
 * ⇒ 這一族的載體是**描述文字與 JSON 欄位之間的關係**，而每一半單獨看都是對的。
 * 這正是「配對式後置條件」那條教訓的技能版：**只驗名詞抓不到關係故障。**
 *
 * ── ⛔ 先剝掉「…」（CLAUDE.md 第〇·六守則②）────────────────────────────────
 *
 * owner 2026-08-12：「技能內文說明會有一個 **「」代表角色施展技能的對白，
 * 不是真正的效果**，請不要被迷惑了」。已量到的誤報：44-04 心臟麻痺的台詞
 * 「⋯**在35秒後**宣布勝利吧。」會被讀成一支有 35 秒時序的技能。
 * 實作與 `tools/skill-remake/batch1.py::_mechanics_text()` 逐字同構
 * （整段 `「…」`、含跨行，⛔ 不是「行首是「的那幾行」）。
 *
 * ── 判準：⛔ 保守。寧可漏報，不可誤報 ──────────────────────────────────────
 *
 * 一條會誤報的規則會逼下一個人放寬斷言，而**一條被放寬的閘等於沒有閘**。
 * 所以每一條規則都必須是「**同一個單位、同一個語意**」的直接對照：
 *   · 冷卻／耗魔 → 對 `cooldown[]` / `manaCost[]`（秒對秒、點對點，零換算）
 *   · 持續 → 對效果樹上任何一格 `duration`（同樣是秒）
 *   · 傷害 → 對效果樹上任何一格傷害量
 * ⛔ **幾何（施法距離／範圍）刻意不判**：卡面數字是 w3x 單位、引擎是 GGD 單位
 * （`GGD_PER_WC3 = 11/600`），中間還有 `combatEnv.abilityRange` 與 `radiusTier`
 * 兩層 —— 那是三個換算疊起來，任何比對都會是猜的。⭐ 而且 owner 2026-08-19 已經
 * 裁決幾何要改成**五級距詞**（`skillTiers.ts`），所以正解是那些數字整個消失，
 * ⛔ 不是在這裡發明一個換算容差。
 */
import type { AbilityDef } from "../sim/content/defs";
import { abilityQuantities, renderAbilityText } from "./abilityProse";

/** 一支技能上的一處不一致。 */
export interface Mismatch {
  /** 規則代號（穩定，棘輪名單用它比對） */
  readonly rule: MismatchRule;
  /** 卡面上那一句（原文片段） */
  readonly claim: string;
  /** 為什麼它與 JSON 不符 */
  readonly why: string;
}

export type MismatchRule =
  | "cooldown-mismatch"
  | "mana-mismatch"
  | "duration-absent"
  | "damage-absent"
  | "mana-restore-absent"
  | "hp-pct-absent"
  | "tag-no-mechanism";

/** 棘輪名單的鍵：`<abilityId>|<rule>`。⛔ 不含理由 —— 理由會隨數值調整而變。 */
export const mismatchKey = (abilityId: string, m: Mismatch): string => `${abilityId}|${m.rule}`;

/**
 * ⛔ 剝掉**角色對白**。⚠️ 整段 `「…」`、含跨行、含行中。
 * 見 CLAUDE.md 第〇·六守則②與 `batch1.py::_mechanics_text()`。
 */
export const mechanicsText = (desc: string): string => desc.replace(/「[^」]*」/gs, "");

/** 描述的**第一行**＝標籤列。內文裡的 `[MP]`／`[定身]` 是強調不是機制承諾。 */
export const leadTags = (desc: string): string[] =>
  [...(desc.split("\n")[0] ?? "").matchAll(/\[([^[\]]+)]/g)].map((m) => m[1]!);

/** 把 `350/550/750/950` 這種逐階寫法拆成數字。 */
const splitRanks = (s: string): number[] =>
  s
    .split("/")
    .map((t) => Number.parseFloat(t.trim()))
    .filter((n) => Number.isFinite(n));

const NUM = String.raw`\d+(?:\.\d+)?`;
const RANKS = `${NUM}(?:\\s*/\\s*${NUM})*`;

/** 一組「卡面寫了什麼數字」。`text` 是原文片段，出現在紅字訊息裡。 */
interface NumClaim {
  readonly text: string;
  readonly values: readonly number[];
}

const collect = (src: string, res: readonly RegExp[]): NumClaim[] => {
  const out: NumClaim[] = [];
  for (const re of res) {
    for (const m of src.matchAll(re)) {
      const values = splitRanks(m[1]!);
      if (values.length > 0) out.push({ text: m[0]!.trim(), values });
    }
  }
  return out;
};

/**
 * 卡面上的冷卻宣稱。兩種寫法都收：`25秒冷卻時間`（w3x 匯入）與
 * `冷卻 30/25/20/15秒`（owner 新版規格）。
 */
export const cooldownClaims = (t: string): NumClaim[] =>
  collect(t, [
    new RegExp(`(${RANKS})\\s*秒冷卻`, "g"),
    new RegExp(`冷卻(?:時間)?\\s*[:：]?\\s*(${RANKS})\\s*秒`, "g"),
  ]);

/** 卡面上的耗魔宣稱：`消耗[MP] 250/350/450/550`、`消耗MP150`、`耗[MP] 50/100`。 */
export const manaClaims = (t: string): NumClaim[] =>
  collect(t, [new RegExp(`(?:消耗|耗)\\s*(?:\\[MP]|MP|魔力|法力)\\s*(${RANKS})`, "g")]);

/** 卡面上的持續時間宣稱：`持續12秒`、`可持續8秒`、`持續 4/5/6 秒`。 */
export const durationClaims = (t: string): NumClaim[] =>
  collect(t, [new RegExp(`持續\\s*(${RANKS})\\s*秒`, "g")]);

/**
 * 卡面上的傷害宣稱：`造成瞬間350點傷害`、`造成 350/550/750/950 + 100% [AP]點傷害`。
 *
 * ⚠️ `造成` 與數字之間允許一小段修飾語（`瞬間`／`直線上`／`前方圓形[範圍]`），
 * 但**不跨句**（`[^。，、\n]`）—— 跨句會把下一件事的數字認成傷害。
 */
export const damageClaims = (t: string): NumClaim[] =>
  collect(t, [new RegExp(`造成[^。，、\\n]{0,10}?(${RANKS})\\s*(?:點|\\+)`, "g")]).filter(
    // ⛔ 兩種**不是一發傷害量**的寫法，量到會誤報：
    // ① `造成自身力量*3+…`／`造成敏捷*3+…` —— 那個 3 是**係數**不是點數
    //    （25-01 北斗懺悔拳、48-04 騎英之疆繩，被讀成「卡面 3 點 vs 引擎 300」＝ 300 倍落差）
    // ② `造成範圍內敵人減少3點護甲` —— 那是**減益**不是傷害（92-03 消化液）
    (c) => !/[*×]/.test(c.text) && !/(減少|降低|下降)/.test(c.text),
  );

/**
 * 卡面上的**回魔**宣稱：`每位式神的犧牲都能讓木乃香獲得150點魔力`（14-02 式神炸裂）。
 * ⛔ 只收「獲得／回復／恢復」，⛔ 不收「消耗」—— 後者是成本不是效果。
 */
export const manaRestoreClaims = (t: string): NumClaim[] =>
  collect(t, [
    new RegExp(`(?:獲得|回復|恢復)\\s*(${RANKS})\\s*點?\\s*(?:的)?\\s*(?:魔力|MP|法力)`, "g"),
  ]);

/**
 * 卡面上的**最大生命百分比**宣稱：`目標[最大生命]6/8/10/12%`（13-02 龍頭戲畫。牙突）。
 * 兩種語序都收（`最大生命…N%` 與 `N%…最大生命`）。
 */
export const hpPctClaims = (t: string): NumClaim[] =>
  collect(t, [
    new RegExp(`(?:最大生命|最大血量|生命上限)[^\\n%]{0,8}?(${RANKS})\\s*%`, "g"),
    new RegExp(`(${RANKS})\\s*%\\s*\\[?(?:目標)?\\[?(?:最大生命|最大血量|生命上限)`, "g"),
  ]);

/* ────────────────────────────────────────────────────────────────────────── */

/** 效果樹上所有節點（含巢狀 `onHit` / `branches` / `perRank` / `passive` …）。 */
function* walk(n: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(n)) {
    for (const v of n) yield* walk(v);
  } else if (n !== null && typeof n === "object") {
    yield n as Record<string, unknown>;
    for (const v of Object.values(n as Record<string, unknown>)) yield* walk(v);
  }
}

const numbersUnder = (v: unknown, out: Set<number>): void => {
  if (typeof v === "number") {
    if (Number.isFinite(v)) out.add(Math.round(v * 100) / 100);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) numbersUnder(x, out);
    return;
  }
  if (v !== null && typeof v === "object") {
    for (const x of Object.values(v as Record<string, unknown>)) numbersUnder(x, out);
  }
};

/** 帶「一段時間」語意的欄位名（`duration` / `durationSec` / `slowDuration` …）。 */
const isDurationKey = (k: string): boolean => /duration/i.test(k);

/**
 * 帶「一發傷害量」語意的欄位名。
 *
 * ⛔ 刻意**不**包含泛用的 `value` / `amount` 以外的東西：這一條的價值在零誤報，
 * 而「效果樹上任何一個數字」會讓 48-03 那種整段落空的技能**照樣過關**
 * （它的 350 點單體傷害逐字就住在 `amount` 裡）。
 */
const DAMAGE_KEYS = ["amount", "base", "damage", "bonusDamage", "perHit"] as const;

/**
 * 「這裡有一個**最大生命百分比**」的表達面。
 * ⭐ 一個都沒有 ⇒ 卡面寫的「目標最大生命 X%」在引擎裡不存在。
 */
const MAX_HP_PCT_KEYS = [
  "hpPct",
  "healthPct",
  "pctMaxHealth",
  "perDamagePctOfMaxHealth",
  "healthDrainPctOfMax",
  "surviveHpPct",
] as const;

/** 「這裡會**還**魔力給誰」的表達面（`restore.manaPct` / 資源互換 / 事件轉換）。 */
const MANA_GAIN_KEYS = ["manaPct"] as const;
const MANA_GAIN_KINDS = ["swapResource", "eventValueConversion"] as const;

interface Numbers {
  readonly cooldown: readonly number[];
  readonly mana: readonly number[];
  readonly duration: Set<number>;
  readonly damage: Set<number>;
  readonly kinds: Set<string>;
  /**
   * 這棵樹上出現過的**表達面**，給 {@link TAG_NEEDS_KIND} 用。三種前綴：
   * `stat:<屬性>`（modifier 掛在誰身上）、`on:<事件>`（掛在哪個 hook）、
   * `field:<欄位>`（有沒有填那一格）。
   *
   * ⚠️ 沒有這一層的時候，`[迴避]` 這條規則對 **13 份**出貨文件誤報 —— 引擎的
   * 迴避是 `stat: "evasion"` 的 modifier（`sim/combat/evasion.ts`），⛔ 從來
   * 就沒有一個叫 `evasion` 的 effect kind 在被內容使用；而聖杯側的 `[迴避]`
   * 有一半是**「迴避成功時」**（`on: "onEvade"`）。誤報會逼下一個人放寬斷言，
   * 而一條被放寬的閘等於沒有閘。
   */
  readonly faces: Set<string>;
  readonly hasMaxHpPct: boolean;
  readonly hasManaGain: boolean;
}

/** 把一份**登錄表裡的** `AbilityDef` 攤平成「引擎真的有的數字」。 */
export function abilityNumbers(def: AbilityDef): Numbers {
  const duration = new Set<number>();
  const damage = new Set<number>();
  const kinds = new Set<string>();
  const faces = new Set<string>();
  let hasMaxHpPct = false;
  let hasManaGain = false;
  const roots: unknown[] = [def.effects, def.passive, def.marks];
  for (const root of roots) {
    for (const node of walk(root)) {
      if (typeof node.kind === "string") kinds.add(node.kind);
      if ((MANA_GAIN_KINDS as readonly string[]).includes(String(node.kind))) hasManaGain = true;
      // 掛在 `maxHealth` 上的 modifier 也是一種最大生命百分比的表達面。
      if (node.stat === "maxHealth") hasMaxHpPct = true;
      // ⭐ `resourcePct` 是**結構化**的表達面 —— 它自己說「哪一種資源、以哪個基準」，
      // 所以 ⛔ 不能只把 "resourcePct" 加進 MAX_HP_PCT_KEYS（那會讓「目標**當前魔力** X%」
      // 也被算成最大生命百分比）。消費端 `sim/effects/dynamicTerms.ts:233 resourcePctAmount()`：
      // `basis === "max"` → 讀 max ⇒ 只有 health × max 這一格才算數。
      // ⚠️ GH#468：漏掉它讓**已經修好**的寫法必然誤報，然後被塞進 baseline ＝ 把守衛關掉。
      const rp = (node as { resourcePct?: { resource?: unknown; basis?: unknown } }).resourcePct;
      if (rp && rp.resource === "health" && rp.basis === "max") hasMaxHpPct = true;
      if (typeof node.stat === "string") faces.add(`stat:${node.stat}`);
      if (typeof node.on === "string") faces.add(`on:${node.on}`);
      if (node.exclusiveGroup !== undefined) faces.add("field:exclusiveGroup");
      for (const [k, v] of Object.entries(node)) {
        if (isDurationKey(k)) numbersUnder(v, duration);
        if ((DAMAGE_KEYS as readonly string[]).includes(k)) numbersUnder(v, damage);
        if (v !== undefined && (MAX_HP_PCT_KEYS as readonly string[]).includes(k)) hasMaxHpPct = true;
        if (v !== undefined && (MANA_GAIN_KEYS as readonly string[]).includes(k)) hasManaGain = true;
      }
    }
  }
  return {
    cooldown: def.cooldown ?? [],
    mana: def.manaCost ?? [],
    duration,
    damage,
    kinds,
    faces,
    hasMaxHpPct,
    hasManaGain,
  };
}

const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(0.01, b * 0.005);
const anyNear = (v: number, pool: Iterable<number>): boolean => {
  for (const p of pool) if (near(v, p)) return true;
  return false;
};
const fmt = (xs: Iterable<number>): string => [...new Set([...xs])].join(" / ") || "（空）";

/**
 * 標籤 ⇒ 效果樹上至少要有其中一個**表達面**。
 * 一格可以是 effect kind、`stat:<屬性>`、`on:<hook 事件>` 或 `field:<欄位>`
 * （見 {@link Numbers.faces}）—— 同一個機制在 GGD 常常有不只一種寫法，
 * ⛔ 只認 kind 會對出貨內容誤報。
 *
 * ⚠️ 只收「除了這幾種寫法之外**沒有別的表達方式**」的標籤 —— 泛用的
 * `[主動]`／`[被動]`／`[範圍]`／`[AP加成]` 是**分類**不是機制承諾，⛔ 不進來。
 * ⛔ `[召喚]` 也不進來：`abilityCastClaims` 已經在守它，兩支一起紅＝同一件事被罰兩次。
 * ⛔ `[破魔]` 刻意**退出**：出貨內容裡它有兩個互不相容的讀法（燒對方的魔 vs
 * 降魔抗，例 92-02 消化液 `stat: mr`），任何單一條件都會誤判其中一半。
 */
export const TAG_NEEDS_KIND: Readonly<Record<string, readonly string[]>> = {
  護盾: ["shield", "manaBarrier"],
  "吸收（護盾）": ["shield", "manaBarrier"],
  治療: ["heal", "restore"],
  回復: ["heal", "restore", "applyBuff", "stat:lifesteal", "stat:healthRegen", "stat:manaRegen"],
  擊退: ["knockback"],
  拉扯: ["knockback"],
  衝刺: ["dash", "leap", "blink"],
  跳躍: ["leap", "dash"],
  瞬移: ["blink", "dash"],
  淨化: ["dispel"],
  // ⭐ 互斥組增益就是 owner 版「變身」的落地方式（state.exclusive-group@1，
  // 例 15-02 疾風迅雷「[變身]為唯一狀態」）—— ⛔ 不是只有 championForm 算數。
  變身: ["championForm", "field:exclusiveGroup"],
  // ⭐ 引擎的迴避是 `stat: "evasion"`（sim/combat/evasion.ts），⛔ 沒有內容在用
  // `kind: "evasion"`；聖杯側的 `[迴避]` 有一半是「迴避成功時」的 hook。
  迴避: ["evasion", "stat:evasion", "on:onEvade"],
  燒魔: ["spendMana", "swapResource"],
  投影: ["summon", "proxyCast"],
};

/**
 * 一支技能上所有的不一致。
 *
 * ⚠️ 輸入必須是**登錄表裡那一份**（`Abilities.get(id)`），⛔ 不是磁碟 JSON：
 * 104 支技能的 `effects` 在磁碟上是空的、真正的內容住在 `template.ref` 裡，
 * 由 `registerAll` 展開（失敗形態⑤：被測的不是出貨的那個）。
 */
export function scanAbility(def: AbilityDef & { description?: string }): Mismatch[] {
  // ⭐ 說明推導（票號待開） —— 先把佔位符**算繪**掉，再抽數字。
  // ⚠️ 少了這一行，一支已經改成 `{{cd}}秒冷卻` 的技能會讓每一條規則都抽到
  //    **零個數字**，於是這支閘對它永遠是綠的 —— 一條被無聲關掉的閘。
  // ⚠️ 出貨路徑（`Abilities.get`）拿到的說明**已經**算繪過，這一行是 no-op；
  //    會真的用到它的是後台/編輯器手上那份**磁碟形狀**的草稿。
  const desc = renderAbilityText(def.description ?? "", abilityQuantities(def));
  if (desc.trim() === "") return [];
  const t = mechanicsText(desc);
  const n = abilityNumbers(def);
  const out: Mismatch[] = [];

  for (const c of cooldownClaims(t)) {
    if (c.values.every((v) => anyNear(v, n.cooldown))) continue;
    out.push({
      rule: "cooldown-mismatch",
      claim: c.text,
      why: `JSON 的 cooldown 是 ${fmt(n.cooldown)} —— 卡面寫的秒數一個都對不上`,
    });
  }
  for (const c of manaClaims(t)) {
    if (c.values.every((v) => anyNear(v, n.mana))) continue;
    out.push({
      rule: "mana-mismatch",
      claim: c.text,
      why: `JSON 的 manaCost 是 ${fmt(n.mana)} —— 卡面寫的耗魔一個都對不上`,
    });
  }
  for (const c of durationClaims(t)) {
    if (c.values.some((v) => anyNear(v, n.duration))) continue;
    out.push({
      rule: "duration-absent",
      claim: c.text,
      why:
        n.duration.size === 0
          ? "效果樹上一格 duration 都沒有 —— 卡面承諾的「持續」不存在"
          : `效果樹上的 duration 是 ${fmt(n.duration)} 秒 —— 對不上`,
    });
  }
  for (const c of damageClaims(t)) {
    if (c.values.some((v) => anyNear(v, n.damage))) continue;
    out.push({
      rule: "damage-absent",
      claim: c.text,
      why:
        n.damage.size === 0
          ? "效果樹上一發傷害都沒有 —— 卡面承諾的點數不存在"
          : `效果樹上的傷害量是 ${fmt(n.damage)} —— 對不上`,
    });
  }
  for (const c of manaRestoreClaims(t)) {
    if (n.hasManaGain) break;
    out.push({
      rule: "mana-restore-absent",
      claim: c.text,
      why: "效果樹上沒有任何**還魔力**的表達面（restore.manaPct / swapResource / eventValueConversion）",
    });
  }
  for (const c of hpPctClaims(t)) {
    if (n.hasMaxHpPct) break;
    out.push({
      rule: "hp-pct-absent",
      claim: c.text,
      why: `效果樹上沒有任何**最大生命百分比**的表達面（${MAX_HP_PCT_KEYS.join(" / ")} 或 maxHealth modifier）`,
    });
  }
  for (const tag of new Set(leadTags(desc))) {
    const need = TAG_NEEDS_KIND[tag];
    if (need === undefined || need.some((k) => n.kinds.has(k) || n.faces.has(k))) continue;
    out.push({
      rule: "tag-no-mechanism",
      claim: `[${tag}]`,
      why: `標籤承諾了 ${need.join(" / ")}，效果樹裡一個都沒有（有的是 ${[...n.kinds].sort().join(", ") || "（空）"}）`,
    });
  }
  return out;
}
