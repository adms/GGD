/**
 * 傳說武器 SAY WHAT THEY DO — the 效能 block ⇔ the modifiers (task #108).
 *
 * A legendary is never bought: it arrives through the 三選一 draft (owner
 * 2026-08-01 put `legendary-weapons` on BOTH round 2 and round 5 —
 * 「隨機三選一發放道具 都改成棱彩武器道具」, see content/config/arena-rules.json)
 * or the 傳說寶玉 roll, and the only thing the player reads before picking is
 * the item's authored prose. So that prose is a promise the sim has to keep.
 * Every stat-line in it («攻擊力+87», «總生命-50%», «魔抗+66.7%», …) must be
 * backed by an identical modifier, and — the direction that catches the more
 * dangerous drift — no legendary may carry a stat its 效能 block never claims.
 *
 * The owner's `description` IS the spec. It is hand-written, so this file's job
 * is to READ it faithfully, not to constrain how it may be phrased. It exists
 * because the failure it guards against is a CONTENT edit (a rescale, a
 * re-import, a hand-tuned number) touching one side of the pair and not the
 * other, which no code review of packages/ would ever see. That is also why it
 * reads content/ rather than a fixture.
 *
 * ── WHAT IT READS, AND WHAT IT DELIBERATELY DOES NOT ────────────────────────
 * · UNTAGGED lines are STAT lines. Every one shaped like 「標籤±數值[%]」 must be
 *   read by {@link LABEL_RULES}, or fall under a NAMED exemption
 *   ({@link ATTRIBUTE_WHY} / {@link FORMULA_EXEMPT}) that says why item@1 has no
 *   primitive for it. There is no "skip" — an unreadable stat-line is a failure,
 *   because a label nobody parses is a promise nobody checks.
 * · 「[標籤] …」 lines are MECHANIC lines (procs, actives, auras, set bonuses).
 *   Their effect coverage is audited by tools/legendary-status/status.py, not
 *   here. This file reads them only through {@link TAG_READERS} — the handful of
 *   tags that DO carry a stat promise (神速 / 伸長 / 迴避) and the crit tooltip.
 *   Anything a tagged line promises with a MODIFIER is still caught in the other
 *   direction: an unannounced modifier fails 「no legendary carries a stat its
 *   效能 block never claims」 regardless of which line should have declared it.
 *
 * ⚠️ 2026-08-01 CORRECTION (第三守則). This header used to name 死之王的長槍's
 * 「額外17%攻擊力增加」 as an example of an inexpressible aura with no modifier
 * by design. That is now false twice over: owner's text reads 「攻擊力額外增加
 * 17%」 and the doc carries a real `ad pctAdd 0.17`. It is parsed like any other
 * stat-line. tools/legendary-status/status.py carries the same correction — it
 * had classified that line as impossible and reported an implemented field as
 * missing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import type { ItemDoc } from "../../content/schema/item";
import type { ChampionDoc } from "../../content/schema/champion";
import type { LootTableDoc } from "../../content/schema/lootTable";
import { Stat } from "../stats/statTypes";
import { ModOp } from "../stats/modifiers";
import { LEGENDARY_POOL_TABLE } from "./itemTiers";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");

/**
 * The champion base crit multiplier. An item's `critDamage` is a flat DELTA
 * into `(base + Σflat)`, so a 「造成2倍傷害」 tooltip means +0.25 — not 2.
 * Pinned against the real roster below.
 */
const CRIT_BASE = 1.75;

/** How the WRITTEN number relates to the value stored on the modifier. */
type Reading =
  /** 「攻擊力+87」 — as written, no ％ in the text. */
  | "flat"
  /** 「最大生命+10%」 — written N％, modifier N/100, and the op is a percentage op. */
  | "pct"
  /** 「吸血+15％」 — written N％ but the modifier is a FLAT 0..1 rate, not a % op. */
  | "rate"
  /** 「攻擊速度上限+10」 — the written number is the CEILING, not a delta (#189/GH#286). */
  | "cap"
  /**
   * 「魔抗+40%」 — owner 2026-08-01:「魔抗的 % 是減傷比例」. The text states the
   * DAMAGE REDUCTION r, the modifier stores the resistance that produces it:
   * mr = 100·r/(1−r). 40% ⇒ 66.7, 66.7% ⇒ 200 (which is also
   * ITEM_MODIFIER_LIMITS.mr, i.e. the band max — see schema/common.ts).
   */
  | "reduction";

interface LabelRule {
  label: string;
  stat: Stat;
  /**
   * ⭐ 同一個數字**同時**付的第二格屬性（GH#309）。今天只有「全能吸血」——
   * omnivamp = 普攻吸血 + 技能吸血，引擎裡是 `Stat.Lifesteal` + `Stat.SpellVamp`
   * 兩條屬性（分流在 sim/combat/damage.ts）。
   *
   * ⛔ 不可以改成「同一個 label 寫兩列」—— 這張表刻意把 label 歧義當成失敗
   * （readLine 的「2 rules matched」），而那個拒絕是對的：兩列會讓「一行文案
   * 配幾個 modifier」變成靠表的順序決定，而檔頭第一句就是「ORDER IS IRRELEVANT」。
   */
  alsoStat?: Stat;
  op: ModOp;
  reading: Reading;
}

/**
 * Every 效能 label owner's prose uses, and how the text maps onto a modifier.
 *
 * ⚠️ ORDER IS IRRELEVANT AND MUST STAY IRRELEVANT. Every rule is anchored to the
 * WHOLE (space-stripped) line, which is the only reason this table can hold
 * labels that contain each other. The overlap test below pins the resolutions
 * that a substring parser would get wrong, and {@link readLine} treats "two
 * rules matched the same line" as a failure so a future label cannot quietly
 * become ambiguous.
 *
 * The overlapping families, all shipped simultaneously since 2026-08-01:
 *   生命 ⊂ 最大生命 ⊂ 每秒回復最大生命,  生命 ⊂ 每秒生命回復 / 每秒回復生命
 *   魔力 ⊂ 最大魔力,  魔力回復速度 ⊂ 每秒魔力回復速度
 *   AP ⊂ 總AP ⊂ 總AP額外,  攻擊力 ⊂ 攻擊力額外增加,  攻擊速度 ⊂ 攻擊速度上限
 *   移動速度 ⊂ 總移動速度,  吸血 ⊂ 普攻吸血 / 全能吸血
 */
const LABEL_RULES: LabelRule[] = [
  // ── 生命 ─────────────────────────────────────────────────────────────────
  { label: "生命", stat: Stat.MaxHealth, op: ModOp.Flat, reading: "flat" },
  { label: "最大生命", stat: Stat.MaxHealth, op: ModOp.PercentAdd, reading: "pct" },
  // 「總X」/「X額外」 is owner's word for 「加在最終值上的 %」 = PercentAdd.
  // 天堂之劍's 「總生命-50%」 is why the sign is parsed rather than assumed
  // positive: it is the only NEGATIVE stat-line in the pool, and reading it as
  // +50% would turn the item's whole cost into a bonus.
  { label: "總生命", stat: Stat.MaxHealth, op: ModOp.PercentAdd, reading: "pct" },
  { label: "每秒回復生命", stat: Stat.HealthRegen, op: ModOp.Flat, reading: "flat" },
  { label: "每秒生命回復", stat: Stat.HealthRegen, op: ModOp.Flat, reading: "flat" },
  // ── 魔力 ─────────────────────────────────────────────────────────────────
  { label: "魔力", stat: Stat.MaxMana, op: ModOp.Flat, reading: "flat" },
  { label: "MP", stat: Stat.MaxMana, op: ModOp.Flat, reading: "flat" },
  { label: "最大魔力", stat: Stat.MaxMana, op: ModOp.PercentAdd, reading: "pct" },
  { label: "每秒回魔", stat: Stat.ManaRegen, op: ModOp.Flat, reading: "flat" },
  { label: "每秒魔力回復", stat: Stat.ManaRegen, op: ModOp.Flat, reading: "flat" },
  { label: "每秒魔力回復速度", stat: Stat.ManaRegen, op: ModOp.Flat, reading: "flat" },
  /*
   * 魔力回復速度 IS DECLARED TWICE, and the ％ decides which one applies.
   *
   * 惡夢魔王碎片 (godie-i067) writes 「魔力回復速度+50」 for a FLAT 50 mana/sec
   * (its authoringNote records the owner clamping 64 → 50, the
   * ITEM_MODIFIER_LIMITS.manaRegen band). The older catalogue writes
   * 「魔力回復速度+300%」 for a pctAdd 3.0 (godie-i044, godie-i04i, godie-i05s…,
   * all currently delisted from the pool but one re-curation away from being
   * back in it). Both readings are real, so both are declared; the ％ in the
   * text is the discriminator and the whole-line anchoring keeps them apart.
   */
  { label: "魔力回復速度", stat: Stat.ManaRegen, op: ModOp.Flat, reading: "flat" },
  { label: "魔力回復速度", stat: Stat.ManaRegen, op: ModOp.PercentAdd, reading: "pct" },
  // ── 攻擊 ─────────────────────────────────────────────────────────────────
  { label: "攻擊力", stat: Stat.AttackDamage, op: ModOp.Flat, reading: "flat" },
  { label: "總攻擊", stat: Stat.AttackDamage, op: ModOp.PercentAdd, reading: "pct" },
  { label: "攻擊力額外增加", stat: Stat.AttackDamage, op: ModOp.PercentAdd, reading: "pct" },
  { label: "攻擊速度", stat: Stat.AttackSpeed, op: ModOp.PercentAdd, reading: "pct" },
  // 上限解鎖 (#189 / GH#286). `capRaise`'s value is the CEILING the modifier
  // lifts the stat to (10.0), not a bonus — so the label has to say 上限 and the
  // number is read as an absolute. The 2026-08-01 pool phrases this inside the
  // 「[神速] …」 line instead (see TAG_READERS); this rule stays because the bare
  // form is still legal prose and dropping it would leave it unread.
  { label: "攻擊速度上限", stat: Stat.AttackSpeed, op: ModOp.CapRaise, reading: "cap" },
  // ── 法術 ─────────────────────────────────────────────────────────────────
  { label: "AP", stat: Stat.AbilityPower, op: ModOp.Flat, reading: "flat" },
  { label: "法術強度", stat: Stat.AbilityPower, op: ModOp.Flat, reading: "flat" },
  { label: "AP", stat: Stat.AbilityPower, op: ModOp.PercentAdd, reading: "pct" },
  { label: "總AP", stat: Stat.AbilityPower, op: ModOp.PercentAdd, reading: "pct" },
  { label: "總AP額外", stat: Stat.AbilityPower, op: ModOp.PercentAdd, reading: "pct" },
  // ── 防禦 ─────────────────────────────────────────────────────────────────
  { label: "裝甲", stat: Stat.Armor, op: ModOp.Flat, reading: "flat" },
  { label: "防禦", stat: Stat.Armor, op: ModOp.Flat, reading: "flat" },
  { label: "總防禦", stat: Stat.Armor, op: ModOp.PercentAdd, reading: "pct" },
  { label: "魔法抗性", stat: Stat.MagicResist, op: ModOp.Flat, reading: "flat" },
  { label: "魔抗", stat: Stat.MagicResist, op: ModOp.Flat, reading: "reduction" },
  // ── 機動 ─────────────────────────────────────────────────────────────────
  { label: "移動速度", stat: Stat.MoveSpeed, op: ModOp.Flat, reading: "flat" },
  // ── 0..1 比率:文案寫 N％,modifier 存 N/100,但 op 是 Flat 不是百分比 op ──
  { label: "吸血", stat: Stat.Lifesteal, op: ModOp.Flat, reading: "rate" },
  { label: "普攻吸血", stat: Stat.Lifesteal, op: ModOp.Flat, reading: "rate" },
  // ⭐ 「全能吸血」是**兩格**（GH#309，2026-08-11）：omnivamp = 普攻吸血 +
  //    技能吸血，而引擎裡那是 `Stat.Lifesteal` 與 `Stat.SpellVamp` 兩條屬性
  //    （分流在 sim/combat/damage.ts，閘是 `pkt.origin.startsWith("ability:")`）。
  //    ⛔ 不是第三條屬性 —— statTypes.ts 的 SpellVamp 註解就是這樣寫的。
  //    所以同一個 label 出兩列，和上面 `AP` 出兩列（flat / pctAdd）同一個形狀。
  // ⭐ 「全能吸血」是**一條規則付兩格屬性**（GH#309，2026-08-11）：omnivamp =
  //    普攻吸血 + 技能吸血，而引擎裡那是 `Stat.Lifesteal` 與 `Stat.SpellVamp`
  //    兩條屬性（分流在 sim/combat/damage.ts，閘是 `pkt.origin.startsWith("ability:")`）。
  //    ⛔ 不可以寫成兩列同 label —— 這張表刻意拒絕 label 歧義（「2 rules matched」），
  //    而那個拒絕是對的：兩列會讓「一行文案配幾個 modifier」變成靠表的順序決定。
  //    ⭐ 所以規則多一格 `alsoStat`，語意是「同一個數字**同時**付這兩格」。
  { label: "全能吸血", stat: Stat.Lifesteal, alsoStat: Stat.SpellVamp, op: ModOp.Flat, reading: "rate" },
  { label: "閃避", stat: Stat.Evasion, op: ModOp.Flat, reading: "rate" },
  // 2026-08-10 owner：至尊魔戒「附加技能吸血 20%」。`吸血` ⊄ `技能吸血` 的
  // 前綴關係跟上面 `普攻吸血` / `全能吸血` 完全一樣,靠整行錨定分開。
  { label: "技能吸血", stat: Stat.SpellVamp, op: ModOp.Flat, reading: "rate" },
  // 2026-08-10 owner：晨曦之光 30% / 仙后座 50%「CD 時間再減少」。
  { label: "冷卻縮減", stat: Stat.CooldownReduction, op: ModOp.Flat, reading: "rate" },
];

/**
 * 「總移動速度*1.2」 — the MULTIPLIER form. ×1.2 on the final value is
 * `ModOp.PercentMult` 0.2, so the modifier's number is (written − 1). Written
 * as its own table because the connector is 「*」, not 「+」/「−」: folding it into
 * {@link LABEL_RULES} would let a sign-parsing bug read 1.2 as +1.2 (= +120%).
 */
const MULT_RULES: { label: string; stat: Stat; op: ModOp }[] = [
  { label: "總移動速度", stat: Stat.MoveSpeed, op: ModOp.PercentMult },
];

/**
 * 光魔杖's 「AP+ (目前MP的 5%)」 — the only `ModOp.PercentOf` line in the pool.
 *
 * ⚠️ 2026-08-01: THE TEXT AND THE DOC NOW AGREE. This paragraph used to record
 * a KNOWING approximation — the prose said 目前 MP (CURRENT mana) while the doc
 * stored `from: maxMana`, because `PercentOf` read the resolved stat block and
 * there was no current-resource source to point at. The note ended with 「if a
 * current-resource source ever exists, this goes red and someone re-reads the
 * line」, and that is exactly what happened: `StatModifier.fromResource`
 * (sim/stats/resourceStats.ts) landed, the doc moved to `fromResource: "mp"`,
 * and this guard went red until it was re-read. It now asserts the EXACT
 * reading, so a regression back to `maxMana` — which would silently pay full AP
 * on an empty mana bar — is a red test rather than a footnote.
 */
const PERCENT_OF_RE = /^AP\+[(（]目前MP的(\d+(?:\.\d+)?)%[)）]$/;

/**
 * 「6%機率造成10倍暴擊傷害」 (天堂之劍) and 「20%機率造成 2倍傷害」 (斬龍刀)
 * → critChance N/100 + critDamage (M − CRIT_BASE).
 *
 * NOT anchored, because owner's 2026-08-01 phrasing continues past the tooltip
 * (天堂之劍 adds 「，暴擊時吸血回復100%傷害」) and starts with a 「[暴擊]」/
 * 「[暴擊吸血]」 tag. 「倍(?:暴擊)?傷害」 covers both spellings and the `\s*`
 * covers 斬龍刀's space. Kept deliberately tight — 「%機率造成」 must be
 * adjacent — so the pool's other proc lines (「7%機率產生造成 100% AP …」,
 * 「6%機率造成255傷害」, 「3%機率造成敵方 20%生命傷害」) cannot match it.
 */
const CRIT_RE = /(\d+(?:\.\d+)?)%機率造成\s*(\d+(?:\.\d+)?)倍(?:暴擊)?傷害/;

/**
 * 力量 / 敏捷 / 智慧 / 力敏智 — a NAMED exemption, not a skip.
 *
 * These are hero ATTRIBUTES (see champion@1 `attributes`), and `item@1` has no
 * attribute modifier primitive at all: `Stat` (sim/stats/statTypes.ts) has no
 * STR/AGI/INT member, so there is nothing an item could grant. That is a
 * different statement from 「no rule can read this」 — it has been checked and
 * the answer is a definite "impossible today", which is why it is spelled out
 * here instead of falling through the unknown-label failure. Shipped lines:
 * 四魂之玉 「力敏智+30」, 朗基努斯之槍 「力量+12」/「敏捷+12」.
 *
 * If an attribute primitive is ever added, delete this exemption — the unknown
 * label failure will then correctly demand a rule.
 */
const ATTRIBUTE_RE = /^(力量|敏捷|智慧|力敏智)([+-])?\d/;
const ATTRIBUTE_WHY = "力/敏/智 是英雄屬性,Stat 表上沒有對應的 item modifier 原語";

/**
 * Stat-shaped lines whose number is a FORMULA evaluated in combat, not a
 * constant modifier. Each one names why item@1 cannot express it — an
 * exemption with no reason is a skip-list.
 */
const FORMULA_EXEMPT: { re: RegExp; why: string }[] = [
  {
    // 奇門盾甲 「每秒回復最大生命+1%」
    re: /^每秒回復最大生命[+-]/,
    why: "「每秒回復最大生命的 N%」隨 maxHealth 浮動,是週期治療;healthRegen 是絕對值/秒",
  },
  {
    // 落魂的嗜血劍 「每秒損失 3%現存生命」
    re: /^每秒損失\d+(?:\.\d+)?%現存生命/,
    why: "「每秒損失現存生命的 N%」是週期自傷,沒有負向 regen 原語",
  },
];

/**
 * The 「[標籤] …」 lines that DO carry a stat promise. Everything else tagged is
 * a mechanic line audited by tools/legendary-status/status.py.
 *
 * These readers are the one place a sub-line (non-anchored) match is allowed,
 * and it is confined to a named tag precisely so the anchoring discipline that
 * protects {@link LABEL_RULES} is not quietly abandoned across the file.
 */
const TAG_READERS: Record<string, (line: string) => Omit<Claim, "line">[]> = {
  /*
   * 「[神速] 攻擊速度上限提升至 10 (預設上限為4)」            (無盡連刃)
   * 「[神速] 攻擊速度+200%，攻速上限提升到10 (預設上限為4)」  (落魂的嗜血劍)
   * 「[神速] 攻擊速度+100%，上限提升至10 (預設上限為4)」      (消失的密室)
   * — one line carrying up to two modifiers. 「(預設上限為4)」 is the ordinary
   * cap quoted for contrast and must NOT be read as a claim, which is why the
   * cap pattern demands 提升[至到] rather than just 上限.
   */
  神速: (line) => {
    const out: Omit<Claim, "line">[] = [];
    const cap = /上限提升[至到]\s*(\d+(?:\.\d+)?)/.exec(line);
    if (cap) out.push({ stat: Stat.AttackSpeed, op: ModOp.CapRaise, value: Number(cap[1]), tolerance: TOL });
    const add = /攻擊速度\s*\+\s*(\d+(?:\.\d+)?)%/.exec(line);
    if (add) out.push({ stat: Stat.AttackSpeed, op: ModOp.PercentAdd, value: Number(add[1]) / 100, tolerance: TOL });
    return out;
  },
  /*
   * 貫雷槍 「[伸長] 近戰攻擊距離+4；遠戰攻擊距離+2」 — ONE weapon whose stat
   * block differs by the wielder's body, shipped as two `range flat` modifiers
   * discriminated by `requires.attackType` (see zGatedItemStatModifier). The
   * claim carries the same discriminator so the two never satisfy each other.
   */
  伸長: (line) => {
    const out: Omit<Claim, "line">[] = [];
    const melee = /近戰攻擊距離\s*\+\s*(\d+(?:\.\d+)?)/.exec(line);
    if (melee) out.push({ stat: Stat.AttackRange, op: ModOp.Flat, value: Number(melee[1]), attackType: "melee", tolerance: TOL });
    const ranged = /遠戰攻擊距離\s*\+\s*(\d+(?:\.\d+)?)/.exec(line);
    if (ranged) out.push({ stat: Stat.AttackRange, op: ModOp.Flat, value: Number(ranged[1]), attackType: "ranged", tolerance: TOL });
    return out;
  },
  /*
   * 仙后座 「[迴避] 25%物理傷害迴避，迴避成功時瞬間移動 (前進一小段距離)」 —
   * the value comes BEFORE the label, so no 標籤+數值 rule can reach it.
   * (幻之匕首's 「[閃避] 閃避 + 10%」 is the ordinary shape and is read by the
   * 閃避 LABEL_RULE, tag prefix and all.)
   */
  迴避: (line) => {
    const m = /(\d+(?:\.\d+)?)%物理傷害迴避/.exec(line);
    return m ? [{ stat: Stat.Evasion, op: ModOp.Flat, value: Number(m[1]) / 100, tolerance: TOL }] : [];
  },
};

/** Default float slack. Widened only for 魔抗, where the text rounds — see {@link mrTolerance}. */
const TOL = 1e-6;

/**
 * 魔抗's slack, expressed as the text's OWN precision rather than a round
 * number. owner writes the damage reduction to at most one decimal, so r is
 * known to ±0.05 percentage points; propagating that through mr = 100·r/(1−r)
 * gives d(mr) = 0.0005 · 100/(1−r)². 「魔抗+40%」 ⇒ 66.667 ± 0.14 (doc: 66.7 ✓,
 * a typo'd 67 ✗); 「魔抗+66.7%」 ⇒ 200.30 ± 0.45 (doc: 200 ✓, 199 or 201 ✗).
 */
function mrTolerance(r: number): number {
  const gap = 1 - r;
  return (0.0005 * 100) / (gap * gap);
}

const EFFICACY_HEAD = /^效能[:：]?$/;
/** The prose sections a 效能 block runs into. Everything after one is lore. */
const SECTION_HEAD = /^(解說|歷史|背景|說明)[:：]?$/;

/**
 * A line carrying 「[標籤]」 anywhere — 死之王套裝's line writes 「額外 [標籤] …」,
 * so this must SEARCH, not anchor.
 *
 * Two constants for one pattern on purpose: `matchAll` requires the `g` flag,
 * and a `g` regex carries `lastIndex` across `.test()` calls — a shared
 * instance would answer false on every other line and silently let mechanic
 * prose into the stat-line path.
 */
const TAG_RE = /\[([^\]]+)\]/g;
const HAS_TAG = /\[[^\]]+\]/;

/**
 * Any 「標籤±數值[%]」 line at all — a claim the parser is REQUIRED to know.
 * Tested against the space-stripped line, so it covers 「MP + 600」,
 * 「總 AP 額外 + 100%」 and 「攻擊力額外增加 17%」 (no connector at all) as well as
 * the bare 「攻擊力+87」. The label class excludes digits and the connectors, so
 * prose that merely ENDS in a number (「…可以額外獲得 10點智慧，上限 160」) is not
 * mistaken for a claim.
 */
const CLAIM_SHAPE = /^([^+\-*%\d[\]]+)([+\-*])?(\d+(?:\.\d+)?)(%?)$/;

/** Full-width punctuation → ASCII. Owner's text mixes ＋ ％ × freely. */
function normalize(line: string): string {
  return line.replace(/＋/g, "+").replace(/－/g, "-").replace(/％/g, "%").replace(/×/g, "*").replace(/　/g, " ").trim();
}

/**
 * {@link normalize} plus every space removed. The label tables match on THIS,
 * which is what makes 「MP + 600」/「MP+600」 and 「總 AP 額外 + 100%」/「總AP額外+100%」
 * one rule instead of six.
 */
function collapse(line: string): string {
  return normalize(line).replace(/\s+/g, "");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TAG_PREFIX = "(?:\\[[^\\]]+\\])?";
const SIGN_NUM = "([+-])?(\\d+(?:\\.\\d+)?)";

/**
 * Whole-line anchored, always. 「每秒回復生命+8.29」 CONTAINS 「生命+8.29」, and a
 * substring parser would silently read it as +8 maxHealth and then fail against
 * the healthRegen modifier. Since 2026-08-01 the table has a dozen more such
 * pairs (see {@link LABEL_RULES}), so this is load-bearing, not defensive.
 */
const COMPILED = LABEL_RULES.map((r) => ({
  ...r,
  re: new RegExp(`^${TAG_PREFIX}${escapeRe(r.label)}${SIGN_NUM}${r.reading === "flat" || r.reading === "cap" ? "" : "%"}$`),
}));

const COMPILED_MULT = MULT_RULES.map((r) => ({
  ...r,
  re: new RegExp(`^${TAG_PREFIX}${escapeRe(r.label)}\\*(\\d+(?:\\.\\d+)?)$`),
}));

interface Claim {
  stat: Stat;
  op: ModOp;
  value: number;
  /** `ModOp.PercentOf` only — the source stat. */
  from?: Stat;
  /**
   * `ModOp.PercentOf` only — the source RESOURCE, when the percentage is taken
   * of a LIVE pool rather than of another stat. 光魔杖's 「目前MP」.
   */
  fromResource?: "hp" | "mp";
  /** 貫雷槍: the `requires.attackType` the matching modifier must carry. */
  attackType?: "melee" | "ranged";
  /** Allowed absolute error on the modifier's value. */
  tolerance: number;
  line: string;
}

interface Read {
  claims: Claim[];
  /** Which rules fired. More than one = the table has become ambiguous. */
  rules: string[];
  /** Set when a named exemption applies; the line is then deliberately unclaimed. */
  exempt: string | null;
}

/** Everything one 效能 line promises, or why it promises nothing checkable. */
function readLine(raw: string): Read {
  const line = normalize(raw);
  const flat = collapse(raw);
  const claims: Claim[] = [];
  const rules: string[] = [];

  // Named exemptions first: "checked, and item@1 provably cannot express it" is
  // a different verdict from "no rule reads this", and only the latter is a bug.
  if (ATTRIBUTE_RE.test(flat)) return { claims: [], rules: [], exempt: ATTRIBUTE_WHY };
  for (const f of FORMULA_EXEMPT) if (f.re.test(flat)) return { claims: [], rules: [], exempt: f.why };

  const crit = CRIT_RE.exec(line);
  if (crit) {
    rules.push("暴擊 tooltip");
    claims.push({ stat: Stat.CritChance, op: ModOp.Flat, value: Number(crit[1]) / 100, tolerance: TOL, line });
    claims.push({ stat: Stat.CritDamage, op: ModOp.Flat, value: Number(crit[2]) - CRIT_BASE, tolerance: TOL, line });
  }

  const po = PERCENT_OF_RE.exec(flat);
  if (po) {
    rules.push("AP+(目前MP的N%)");
    claims.push({ stat: Stat.AbilityPower, op: ModOp.PercentOf, fromResource: "mp", value: Number(po[1]) / 100, tolerance: TOL, line });
  }

  for (const r of COMPILED_MULT) {
    const m = r.re.exec(flat);
    if (!m) continue;
    rules.push(`${r.label}*N`);
    claims.push({ stat: r.stat, op: r.op, value: Number(m[1]) - 1, tolerance: TOL, line });
  }

  for (const r of COMPILED) {
    const m = r.re.exec(flat);
    if (!m) continue;
    rules.push(`${r.label} (${r.reading})`);
    const written = (m[1] === "-" ? -1 : 1) * Number(m[2]);
    if (r.reading === "reduction") {
      const ratio = written / 100;
      claims.push({ stat: r.stat, op: r.op, value: (100 * ratio) / (1 - ratio), tolerance: mrTolerance(ratio), line });
    } else {
      const value = r.reading === "pct" || r.reading === "rate" ? written / 100 : written;
      claims.push({ stat: r.stat, op: r.op, value, tolerance: TOL, line });
      // 一條規則付兩格（今天只有「全能吸血」）—— 見上面那張表的說明。
      if (r.alsoStat !== undefined)
        claims.push({ stat: r.alsoStat, op: r.op, value, tolerance: TOL, line });
    }
  }

  for (const t of line.matchAll(TAG_RE)) {
    const read = TAG_READERS[t[1]!.trim()];
    if (!read) continue;
    const got = read(line);
    if (got.length === 0) continue;
    rules.push(`[${t[1]!.trim()}]`);
    for (const c of got) claims.push({ ...c, line });
  }

  return { claims, rules, exempt: null };
}

/** The 效能 lines of a doc, i.e. what the player reads as the item's stats. */
function efficacyLines(doc: ItemDoc): string[] {
  const lines = (doc.description ?? "").split("\n").map((l) => l.trim());
  const head = lines.findIndex((l) => EFFICACY_HEAD.test(l));
  if (head < 0) return [];
  const body = lines.slice(head + 1);
  const end = body.findIndex((l) => SECTION_HEAD.test(l));
  return (end < 0 ? body : body.slice(0, end)).filter((l) => l.length > 0);
}

/** Every modifier the 效能 text promises. Mechanic/prose lines yield none. */
function parseClaims(lines: string[]): Claim[] {
  return lines.flatMap((l) => readLine(l).claims);
}

/** The identity a claim and a modifier must share to be about the same thing. */
function key(stat: Stat, op: ModOp, attackType?: string): string {
  return `${stat}|${op}|${attackType ?? ""}`;
}

let pool: ItemDoc[];
let champions: ChampionDoc[];

beforeAll(async () => {
  const store = (await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store;
  const byId = new Map(store.all<ItemDoc>("items").map((d) => [d.id as string, d]));
  const table = store.all<LootTableDoc>("loot-tables").find((t) => t.id === LEGENDARY_POOL_TABLE);
  if (!table) throw new Error(`content/loot-tables/${LEGENDARY_POOL_TABLE}.json is missing`);
  pool = table.entries.map((e) => {
    const doc = byId.get(e.itemId as string);
    if (!doc) throw new Error(`legendary ${e.itemId} has no content doc`);
    return doc;
  });
  champions = store.all<ChampionDoc>("champions");
});

describe("傳說武器 say what they do (效能 ⇔ modifiers)", () => {
  it("every 效能 stat-line is backed by an identical modifier", () => {
    cover("eco-legendary-desc-matches-modifiers");
    // A load-sanity floor, not a pinned count: the pool is re-curated freely
    // (25 → 14 → 49 as of owner's 2026-08-01 棱彩三選一 rebuild), and the sibling
    // econ-legendary-not-purchasable guards this same table at >= 6. The real
    // assertion is the per-item loop.
    expect(pool.length).toBeGreaterThanOrEqual(6);
    const broken: string[] = [];
    for (const doc of pool) {
      const lines = efficacyLines(doc);

      /*
       * ⚠️ RE-AIMED 2026-08-01. This used to be
       *     expect(lines.length, `… has no 效能 block — the draft card shows
       *       nothing`).toBeGreaterThan(0);
       * and 死之王的意志 (godie-i060) — 傳說 → [斬殺] → [緩慢] → [死之王套裝],
       * no 效能 header at all — made it red. The old WORDING is what retired,
       * not the intent: owner saw that card render empty and ruled 「卡片應該要
       * 顯示全部敘述阿」, so `weaponEffectDescription`
       * (apps/client/src/ui/panels/draftCardStyle.ts) now renders the ENTIRE
       * authored prose and falls back to the derived stat read only when there
       * is none. A doc without a 效能 header therefore shows plenty.
       *
       * What is still true, and is what the assertion now protects:
       *   1. the card is built from `description`, so an empty one really does
       *      collapse back to resolveChoice's bare 「300 g」;
       *   2. no 效能 block means THIS guard reads no promise from that doc — so
       *      it must not carry modifiers either, or the player is handed numbers
       *      nothing in the prose is being checked against.
       */
      expect(
        (doc.description ?? "").trim().length,
        `${doc.name} (${doc.id}) has an empty description — the draft card falls back to resolveChoice's bare gold text`,
      ).toBeGreaterThan(0);
      if (lines.length === 0) {
        expect(
          doc.modifiers ?? [],
          `${doc.name} (${doc.id}) has no 效能 block yet carries modifiers — no line of prose is being checked against them`,
        ).toEqual([]);
      }

      for (const line of lines) {
        const read = readLine(line);
        if (read.rules.length > 1) {
          broken.push(`${doc.name} 「${line}」 → ${read.rules.length} rules matched (${read.rules.join(", ")}); the label table is ambiguous`);
        }
      }

      const mods = doc.modifiers ?? [];
      /*
       * [暴擊吸血] (天堂之劍) does NOT ride `critChance`/`critDamage` any more.
       *
       * The reader above still turns 「N%機率造成M倍暴擊傷害」 into those two
       * claims, because that IS what the sentence says in stat terms and 斬龍刀
       * still pays it that way. 天堂之劍 pays it through `item@1.critStrike`
       * instead (sim/combat/critStrike.ts), for the reason that file's header
       * gives: a `critDamage` DELTA empowers every crit the champion lands, and
       * 「暴擊時吸血回復100%傷害」 cannot be said with `Stat.Lifesteal` at all.
       *
       * So a doc carrying `critStrike` has its crit line checked against THAT
       * block — same two numbers, different home — and the two stat claims are
       * dropped rather than left to fail. Dropping them silently would be the
       * hole; the assertions immediately below are what replaces them.
       */
      const critStrike = doc.critStrike;
      if (critStrike) {
        const critLine = lines.map(normalize).find((l) => CRIT_RE.test(l));
        expect(critLine, `${doc.name} carries critStrike but no 「N%機率造成M倍」 line to justify it`).toBeDefined();
        const [, chance, multiplier] = CRIT_RE.exec(critLine!)!;
        expect(critStrike.chance, `${doc.name} critStrike.chance`).toBeCloseTo(Number(chance) / 100, 6);
        expect(critStrike.damageMult, `${doc.name} critStrike.damageMult`).toBeCloseTo(Number(multiplier), 6);
        expect(
          mods.some((m) => m.stat === Stat.CritChance || m.stat === Stat.CritDamage),
          `${doc.name} carries critStrike AND a crit modifier — that is ${Number(chance) / 100} + ${Number(chance) / 100} crit chance, half of it on the old semantics`,
        ).toBe(false);
      }
      for (const claim of parseClaims(lines)) {
        if (critStrike && (claim.stat === Stat.CritChance || claim.stat === Stat.CritDamage)) continue;
        const exact = mods.filter((m) => key(m.stat, m.op, m.requires?.attackType) === key(claim.stat, claim.op, claim.attackType));
        if (exact.length !== 1) {
          const sameStat = mods.filter((m) => m.stat === claim.stat);
          const detail = sameStat.length > 0 ? sameStat.map((m) => `${m.op} ${m.value}`).join(" / ") : "none";
          broken.push(
            `${doc.name} 「${claim.line}」 → ${exact.length} ${claim.stat} ${claim.op}` +
              `${claim.attackType ? ` (${claim.attackType})` : ""} modifiers, want exactly 1; the doc's ${claim.stat} modifiers are: ${detail}`,
          );
          continue;
        }
        const mod = exact[0]!;
        if (Math.abs(mod.value - claim.value) > claim.tolerance) {
          broken.push(`${doc.name} 「${claim.line}」 → ${claim.stat} ${mod.value}, text claims ${claim.value} (±${claim.tolerance})`);
        }
        if (claim.from !== undefined && mod.from !== claim.from) {
          broken.push(`${doc.name} 「${claim.line}」 → ${claim.stat} ${claim.op} reads from ${mod.from}, the text reads as ${claim.from}`);
        }
        // 「目前MP」 vs 「最大MP」 is a whole mechanic, not a rounding difference:
        // at half mana the two pay different numbers and only one of them is
        // what the card says. Asserted separately from `from` so the failure
        // message names WHICH source the doc picked.
        if (claim.fromResource !== undefined && mod.fromResource !== claim.fromResource) {
          broken.push(
            `${doc.name} 「${claim.line}」 → ${claim.stat} ${claim.op} reads ` +
              `${mod.fromResource ?? `from ${mod.from}`}, the text reads as the LIVE ${claim.fromResource}`,
          );
        }
      }
    }
    expect(broken, "a legendary's 效能 block promises what its modifiers do not pay").toEqual([]);
  });

  it("no legendary carries a stat its 效能 block never claims", () => {
    // The direction that matters most for a DRAFT item: an unclaimed modifier
    // is power the player cannot see when choosing, so the 三選一 stops being a
    // decision. It also catches a stat-line whose label drifted (the claim
    // vanishes, the modifier is left orphaned).
    //
    // Keyed on stat + op + requires.attackType, not on stat alone, because the
    // 2026-08-01 pool ships docs with TWO modifiers on one stat: 天地崩裂魔杖
    // (ap flat 87 AND ap pctAdd 0.1), 消失的密室 (as pctAdd 1.0 AND as capRaise
    // 10), 貫雷槍 (range flat 4 melee AND range flat 2 ranged). Under the old
    // stat-only key, ONE announced line would have covered for both.
    const hidden: string[] = [];
    for (const doc of pool) {
      const claimed = new Set(parseClaims(efficacyLines(doc)).map((c) => key(c.stat, c.op, c.attackType)));
      for (const mod of doc.modifiers ?? []) {
        if (!claimed.has(key(mod.stat, mod.op, mod.requires?.attackType))) {
          hidden.push(`${doc.name} (${doc.id}) grants ${mod.stat} ${mod.op} ${mod.value}, unannounced`);
        }
      }
    }
    expect(hidden, "a legendary grants a stat its 效能 block never mentions").toEqual([]);
  });

  it("reads EVERY 「標籤+數值」 line — an unknown stat label is a failure, not a skip", () => {
    // The parser ignores effect prose by design, which is exactly how a NEW
    // stat label (say 移動速度+30 before 移動速度 was in the table) would slip
    // through as "not a claim" and be checked by nothing.
    //
    // SCOPE, stated so it cannot be widened by accident: an UNTAGGED line
    // shaped like a stat-line must be read by a rule or by a NAMED exemption.
    // 「[標籤] …」 lines are mechanic prose (tools/legendary-status/status.py is
    // their auditor) and are covered here only where a TAG_READER claims them —
    // which the second half of this test pins so those readers cannot rot.
    const unknown: string[] = [];
    for (const doc of pool) {
      for (const line of efficacyLines(doc)) {
        if (HAS_TAG.test(line)) continue;
        if (!CLAIM_SHAPE.test(collapse(line))) continue;
        const read = readLine(line);
        if (read.claims.length === 0 && read.exempt === null) unknown.push(`${doc.name} (${doc.id}) 「${line}」`);
      }
    }
    expect(unknown, "a 效能 stat-line no rule in LABEL_RULES can read — it is checked by nothing").toEqual([]);

    // Every TAG_READER must still be reached by the shipped pool AND still
    // produce a claim. A reader whose phrasing owner has since rewritten would
    // otherwise sit there green while the modifiers it covers become invisible
    // to the unannounced-modifier test.
    const deaf: string[] = [];
    for (const tag of Object.keys(TAG_READERS)) {
      const lines = pool.flatMap((d) => efficacyLines(d).filter((l) => l.includes(`[${tag}]`)));
      if (lines.length === 0) {
        deaf.push(`[${tag}] has a TAG_READER but no line in the pool carries it`);
        continue;
      }
      for (const l of lines) if (TAG_READERS[tag]!(normalize(l)).length === 0) deaf.push(`[${tag}] reader read nothing out of 「${l}」`);
    }
    expect(deaf, "a TAG_READER that no longer reads its own shipped line").toEqual([]);
  });

  /*
   * THE OVERLAP TEST — the one that pins WHY the anchoring exists.
   *
   * Every case below is a line whose label is a strict superstring or substring
   * of another label in the table. A substring parser (or a table read in the
   * wrong order) resolves them to the WRONG stat while still producing a
   * plausible-looking number, which is the failure mode that survives review:
   * 「每秒回復生命+8.29」 read as maxHealth +8, 「每秒魔力回復速度+13」 read as
   * 魔力 +13, 「總生命-50%」 read as +50%. Asserting on the pool alone would not
   * pin these, because the pool only contains ONE of each pair at a time.
   */
  it("resolves overlapping labels by whole-line anchoring, not by substring or table order", () => {
    const cases: [line: string, want: string][] = [
      // 生命 family
      ["生命+872", "maxHealth flat 872"],
      ["最大生命+10%", "maxHealth pctAdd 0.1"],
      ["總生命-50%", "maxHealth pctAdd -0.5"],
      ["每秒回復生命+8.29", "healthRegen flat 8.29"],
      ["每秒生命回復+12", "healthRegen flat 12"],
      ["每秒回復最大生命+1%", "EXEMPT"],
      // 魔力 family
      ["魔力+1000", "maxMana flat 1000"],
      ["MP + 600", "maxMana flat 600"],
      ["最大魔力+20%", "maxMana pctAdd 0.2"],
      ["每秒回魔+8", "manaRegen flat 8"],
      ["每秒魔力回復+18", "manaRegen flat 18"],
      ["每秒魔力回復速度+13", "manaRegen flat 13"],
      ["魔力回復速度+50", "manaRegen flat 50"],
      ["魔力回復速度+300%", "manaRegen pctAdd 3"],
      // AP family
      ["AP+130", "ap flat 130"],
      ["AP + 87", "ap flat 87"],
      ["AP+33%", "ap pctAdd 0.33"],
      ["總AP + 10%", "ap pctAdd 0.1"],
      ["總 AP 額外 + 100%", "ap pctAdd 1"],
      ["AP+ (目前MP的 5%)", "ap percentOf 0.05"],
      // 攻擊 family
      ["攻擊力+87", "ad flat 87"],
      ["總攻擊+10%", "ad pctAdd 0.1"],
      ["攻擊力額外增加 17%", "ad pctAdd 0.17"],
      ["攻擊速度+120%", "as pctAdd 1.2"],
      ["攻擊速度上限+10", "as capRaise 10"],
      ["[神速] 攻擊速度+100%，上限提升至10 (預設上限為4)", "as capRaise 10 + as pctAdd 1"],
      // 防禦 / 機動 / 比率
      ["防禦+40", "armor flat 40"],
      ["總防禦+10%", "armor pctAdd 0.1"],
      ["裝甲+100", "armor flat 100"],
      ["移動速度+2", "ms flat 2"],
      ["總移動速度*1.2", "ms pctMult 0.2"],
      ["吸血+15％", "lifesteal flat 0.15"],
      ["普攻吸血+20%", "lifesteal flat 0.2"],
      // GH#309（2026-08-11）：全能吸血是**兩格** —— 一條規則付 lifesteal + spellVamp。
      ["全能吸血+30%", "lifesteal flat 0.3 + spellVamp flat 0.3"],
      ["[閃避] 閃避 + 10%", "evasion flat 0.1"],
      ["[迴避] 25%物理傷害迴避，迴避成功時瞬間移動 (前進一小段距離)", "evasion flat 0.25"],
      // crit + attributes + mechanic prose that must stay unread
      ["[暴擊] 20%機率造成 2倍傷害", "critChance flat 0.2 + critDamage flat 0.25"],
      ["[暴擊吸血] 6%機率造成10倍暴擊傷害，暴擊時吸血回復100%傷害", "critChance flat 0.06 + critDamage flat 8.25"],
      ["力敏智+30", "EXEMPT"],
      ["力量+12", "EXEMPT"],
      ["[On-Hit] 6%機率造成255傷害，持續3秒", "NONE"],
      ["[緩慢] 8%的機率造成敵方緩速，移動速度 -2，持續 0.6秒", "NONE"],
      ["[疊層] 每殺死一名英雄可以額外獲得 10點智慧，上限 160", "NONE"],
    ];
    const got = cases.map(([line]) => {
      const read = readLine(line);
      if (read.exempt !== null) return "EXEMPT";
      if (read.claims.length === 0) return "NONE";
      return read.claims.map((c) => `${c.stat} ${c.op} ${Number(c.value.toFixed(6))}`).join(" + ");
    });
    expect(got, "a label resolved to the wrong stat/op — the anchoring or the table order broke").toEqual(cases.map(([, want]) => want));

    // 魔抗 is checked separately because its value is a CONVERSION, not the
    // written number: owner 2026-08-01 「魔抗的 % 是減傷比例」 ⇒ mr = 100r/(1−r).
    for (const [line, mr] of [["魔抗+40%", 66.667], ["魔抗+66.7%", 200.3]] as const) {
      const claims = readLine(line).claims;
      expect(claims.map((c) => `${c.stat} ${c.op}`), line).toEqual(["mr flat"]);
      expect(claims[0]!.value, `${line} → 減傷比例換算`).toBeCloseTo(mr, 1);
    }

    // Every named exemption must still match something the pool ships. A dead
    // exemption is cover for a line nobody reads any more.
    const shipped = pool.flatMap((d) => efficacyLines(d)).map(collapse);
    for (const f of FORMULA_EXEMPT) {
      expect(shipped.some((l) => f.re.test(l)), `FORMULA_EXEMPT ${f.re} matches no shipped line — dead cover`).toBe(true);
    }
    expect(shipped.some((l) => ATTRIBUTE_RE.test(l)), "ATTRIBUTE_RE matches no shipped line — dead cover").toBe(true);
  });

  it("the crit legendaries express 「N%機率造成M倍傷害」 as chance + (M − champion base)", () => {
    // Same relation w3x-item-crit-multiplier asserts tree-wide at import time;
    // restated here over the legendary pool because a crit legendary is one a
    // player is DRAFTED into, and because the relation is the one place a
    // legendary's text and its modifier disagree numerically (天堂之劍: 10 in
    // the text, +8.25 in the doc) — i.e. the one a rescale gets wrong silently.
    const bases = [...new Set(champions.map((c) => c.baseStats.critDamage))];
    expect(bases, "the roster disagrees on the base crit multiplier").toEqual([CRIT_BASE]);

    // Which crit items sit in the pool is curation that moves freely, so this
    // pins the INVARIANT, not the membership: at least one crit legendary must
    // be present so the relation below is actually exercised rather than
    // vacuously green. Today: 斬龍刀 (godie-i06d, 20% / 2x) and 天堂之劍
    // (godie-i01n, 6% / 10x — note its tooltip says 暴擊傷害, not 傷害).
    const crit = pool.filter((d) => efficacyLines(d).some((l) => CRIT_RE.test(normalize(l))));
    expect(crit.length, "no crit legendary in the pool — the relation below never runs").toBeGreaterThanOrEqual(1);
    for (const doc of crit) {
      const line = normalize(efficacyLines(doc).find((l) => CRIT_RE.test(normalize(l)))!);
      const [, chance, multiplier] = CRIT_RE.exec(line)!;
      if (doc.critStrike) {
        // THE OTHER HOME (2026-08-01). `critStrike.damageMult` is the TOTAL
        // multiplier, not a delta — that is the whole point of moving it off
        // `Stat.CritDamage`, which could only ever be an offset from the
        // champion's base and therefore applied to every crit they landed.
        // So the relation here is `damageMult === M`, with no CRIT_BASE term.
        expect(doc.critStrike.chance, `${doc.name} critStrike.chance`).toBeCloseTo(Number(chance) / 100, 6);
        expect(doc.critStrike.damageMult, `${doc.name} critStrike multiplier is TOTAL, not a delta`).toBeCloseTo(Number(multiplier), 6);
        continue;
      }
      const val = (stat: Stat) => (doc.modifiers ?? []).find((m) => m.stat === stat)?.value;
      expect(val(Stat.CritChance), `${doc.name} critChance`).toBeCloseTo(Number(chance) / 100, 6);
      expect(val(Stat.CritDamage), `${doc.name} has no critDamage — it would crit for nothing extra`).toBeDefined();
      expect(CRIT_BASE + val(Stat.CritDamage)!, `${doc.name} crit multiplier`).toBeCloseTo(Number(multiplier), 6);
    }
    // AND AT LEAST ONE OF EACH HOME IS EXERCISED, so neither branch above can
    // rot into dead code while the test stays green (失敗形態 ③).
    expect(crit.some((d) => d.critStrike !== undefined), "no critStrike legendary — that branch is dead").toBe(true);
    expect(crit.some((d) => d.critStrike === undefined), "no modifier-form crit legendary — that branch is dead").toBe(true);
  });
});
