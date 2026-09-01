/**
 * codexLabels — display formatting for the codex (pure, node-testable).
 *
 * These are UI CHROME strings (stat names, bucket names, operators), NOT
 * content: no champion / item / ability name, description or number may ever
 * appear in this file — those are fetched. See codexLive.test.ts.
 */
import { castTypeLabel } from "../components/abilityText";
import { requirementShortLabel } from "@ggd/shared/sim/content/requirement";
import type { CastType } from "@ggd/shared/sim/content/defs";
import type { CodexItemBucket, CodexModifier, CodexSlot } from "@ggd/shared/codex/codexTypes";

/** Stat key → the Chinese label the rest of the HUD uses. */
const STAT_LABEL: Record<string, string> = {
  maxHealth: "生命",
  healthRegen: "生命回復",
  maxMana: "魔力",
  manaRegen: "魔力回復",
  ad: "攻擊力",
  ap: "法術強度",
  armor: "護甲",
  mr: "魔法抗性",
  as: "攻擊速度",
  ms: "移動速度",
  critChance: "爆擊率",
  critDamage: "爆擊傷害",
  cdr: "冷卻縮減",
  lifesteal: "吸血",
  range: "攻擊距離",
};

export function statLabel(stat: string): string {
  return STAT_LABEL[stat] ?? stat;
}

/** Trim float noise without lying about the value (1.7999999 → 1.8). */
export function num(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/**
 * `{stat:"ad",op:"flat",value:30}` → `攻擊力 +30`; percent ops keep their unit.
 *
 * A row carrying a 職業限定閘 is SUFFIXED with who it is for —
 * 「攻擊距離 +4（近戰）」. Without it, 貫雷槍's authored 「近戰+4；遠戰+2」 renders
 * as two bare 攻擊距離 rows that flatly contradict each other, and the reader's
 * only available conclusion is that the page (or the item) is broken.
 *
 * `requirementShortLabel` is the SHOP CARD's renderer, imported rather than
 * re-implemented: the codex and the shelf must not be able to describe the same
 * gate two different ways, and it derives the sentence from the very object
 * `resolveGatedModifiers` gates on.
 */
export function formatModifier(m: CodexModifier): string {
  const label = statLabel(m.stat);
  const gate = requirementShortLabel(m.requires);
  const suffix = gate === null ? "" : `（${gate}）`;
  if (m.op === "pctAdd" || m.op === "pctMul") {
    const pct = num(m.value * 100);
    return `${label} ${m.op === "pctMul" ? "×" : m.value >= 0 ? "+" : ""}${m.op === "pctMul" ? num(m.value) : `${pct}%`}${suffix}`;
  }
  return `${label} ${m.value >= 0 ? "+" : ""}${num(m.value)}${suffix}`;
}

/** Per-rank arrays render as `12 / 12 / 12`; a flat array collapses to one value. */
export function formatPerRank(values: readonly number[]): string {
  if (values.length === 0) return "—";
  const uniq = [...new Set(values)];
  return (uniq.length === 1 ? uniq : values).map(num).join(" / ");
}

const BUCKET_LABEL: Record<CodexItemBucket, string> = {
  final: "成品",
  component: "素材",
  "recipe-book": "製作書",
  "quest-reward": "任務獎勵",
  // ⭐ GH#912 —— 回合抽選發的寶具。⛔ 不是用錢買的，⛔ 也不是任務給的
  //   （⚠️ 這個遊戲**沒有任何任務**，而舊標籤讓玩家以為這些拿不到）。
  "loot-drop": "回合抽選",
  "token-no-op": "無效果代幣",
  "with-modifiers": "有屬性加成",
  "no-modifiers": "無屬性加成",
};

export function bucketLabel(bucket: CodexItemBucket): string {
  return BUCKET_LABEL[bucket] ?? bucket;
}

/** Ability slot accent colours — Q/W/E/R cool, EX gold (it is the unlock). */
export const SLOT_COLOR: Record<CodexSlot, string> = {
  Q: "#6f8fe0",
  W: "#59c2d6",
  E: "#7fd18a",
  R: "#e08fd0",
  EX: "#f2c637",
};

const ROLE_LABEL: Record<string, string> = {
  fighter: "戰士",
  bruiser: "鬥士",
  mage: "法師",
  marksman: "射手",
  tank: "坦克",
  support: "輔助",
  assassin: "刺客",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

export function attackTypeLabel(attackType: string): string {
  return attackType === "melee" ? "近戰" : attackType === "ranged" ? "遠程" : attackType;
}

/** Cast type via the HUD's own mapping; unknown strings pass through. */
export function castLabel(castType: string): string {
  const known: readonly string[] = ["targeted", "skillshot", "ground", "self", "dash"];
  return known.includes(castType) ? castTypeLabel(castType as CastType) : castType;
}
