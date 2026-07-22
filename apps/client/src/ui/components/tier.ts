/**
 * tier.ts — PURE ranked-tier mapping (no React / no DOM) behind <TierBadge>.
 *
 * The Go platform (task #37) sends each ladder row a `tier` identifier and,
 * for the six non-apex tiers, a `division`. The CLIENT owns the presentation:
 * the EXACT Chinese label, the LoL-like crest color, and the roman division —
 * so this module is the single source of truth for "what does this tier look
 * like". It is deliberately tolerant of how the backend encodes `tier` /
 * `division` (english key, Chinese label, or numeric index) so the UI never
 * breaks while the backend half is still in flight:
 *
 *   tier      → "iron".."challenger" | "鐵".."菁英" | 0..8
 *   division  → 1..4 (1 = I highest, 4 = IV lowest) | "I".."IV" | null (apex)
 *
 * Nine tiers ascending; Iron..Diamond split into four divisions, Master /
 * Grandmaster / Challenger are apex (no division).
 */

export type TierKey =
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "emerald"
  | "diamond"
  | "master"
  | "grandmaster"
  | "challenger";

/** Ascending order (index === backend numeric tier when it sends an int). */
export const TIER_ORDER: readonly TierKey[] = [
  "iron",
  "bronze",
  "silver",
  "gold",
  "emerald",
  "diamond",
  "master",
  "grandmaster",
  "challenger",
] as const;

/** Apex tiers have NO divisions (ranked by absolute board position, LoL-faithful). */
export const APEX_TIERS: ReadonlySet<TierKey> = new Set<TierKey>(["master", "grandmaster", "challenger"]);

export type DivisionNum = 1 | 2 | 3 | 4;

export interface TierColors {
  /** crest gradient — light stop then dark stop */
  from: string;
  to: string;
  /** crest outline / bevel */
  edge: string;
  /** label + roman text color */
  text: string;
}

export interface TierVisual {
  key: TierKey | "unranked";
  /** EXACT Chinese label (鐵/銅/銀/金/翡翠/鑽石/大師/宗師/菁英) */
  label: string;
  english: string;
  apex: boolean;
  colors: TierColors;
}

interface TierDef {
  label: string;
  english: string;
  colors: TierColors;
}

// LoL-like palette: iron gray → challenger gold-white. Two-stop gradients keep
// the inline-SVG crest self-contained (no external art).
const TIERS: Record<TierKey, TierDef> = {
  iron: { label: "鐵", english: "Iron", colors: { from: "#7d7873", to: "#443f3b", edge: "#2c2926", text: "#d8d2cb" } },
  bronze: { label: "銅", english: "Bronze", colors: { from: "#b3743f", to: "#6e3f22", edge: "#4a2916", text: "#f0cba6" } },
  silver: { label: "銀", english: "Silver", colors: { from: "#c3cdd8", to: "#7c8b9c", edge: "#59677a", text: "#f2f6fb" } },
  gold: { label: "金", english: "Gold", colors: { from: "#f0c76b", to: "#b8862f", edge: "#8a611c", text: "#fff2cf" } },
  emerald: { label: "翡翠", english: "Emerald", colors: { from: "#4fd6a5", to: "#1f8f6d", edge: "#136349", text: "#dbfff1" } },
  diamond: { label: "鑽石", english: "Diamond", colors: { from: "#69d4ef", to: "#2b8fb5", edge: "#1c6684", text: "#e2f9ff" } },
  master: { label: "大師", english: "Master", colors: { from: "#c06ff0", to: "#7a34c0", edge: "#571f8f", text: "#f4e2ff" } },
  grandmaster: { label: "宗師", english: "Grandmaster", colors: { from: "#f0675f", to: "#b3352d", edge: "#7f211b", text: "#ffe2df" } },
  challenger: { label: "菁英", english: "Challenger", colors: { from: "#f7edc4", to: "#c9a54a", edge: "#8f7fb5", text: "#fffdf2" } },
};

const UNRANKED: TierVisual = {
  key: "unranked",
  label: "未定級",
  english: "Unranked",
  apex: false,
  colors: { from: "#3a4152", to: "#232936", edge: "#2c3448", text: "#8d97ad" },
};

/** Chinese-label → key (accepts the exact ladder labels as `tier`). */
const LABEL_TO_KEY: Record<string, TierKey> = Object.fromEntries(
  (Object.keys(TIERS) as TierKey[]).map((k) => [TIERS[k].label, k]),
) as Record<string, TierKey>;

/**
 * Coerce any backend `tier` encoding to a canonical key, or null when it is
 * absent / unrecognised (caller renders the "unranked" fallback).
 */
export function normalizeTier(input: unknown): TierKey | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    return TIER_ORDER[input] ?? null;
  }
  if (typeof input === "string") {
    const s = input.trim();
    if (s === "") return null;
    const lower = s.toLowerCase();
    if ((TIER_ORDER as readonly string[]).includes(lower)) return lower as TierKey;
    if (LABEL_TO_KEY[s]) return LABEL_TO_KEY[s];
    // numeric string index ("6")
    const n = Number(s);
    if (Number.isInteger(n)) return TIER_ORDER[n] ?? null;
  }
  return null;
}

/**
 * Coerce any backend `division` encoding to 1..4 (1 = I highest … 4 = IV
 * lowest), or null when absent / apex / unrecognised.
 */
export function normalizeDivision(input: unknown): DivisionNum | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return input >= 1 && input <= 4 ? (Math.trunc(input) as DivisionNum) : null;
  }
  if (typeof input === "string") {
    const s = input.trim().toUpperCase();
    if (s === "") return null;
    const roman: Record<string, DivisionNum> = { I: 1, II: 2, III: 3, IV: 4 };
    if (roman[s]) return roman[s];
    const n = Number(s);
    return n >= 1 && n <= 4 ? (Math.trunc(n) as DivisionNum) : null;
  }
  return null;
}

const ROMAN: Record<DivisionNum, string> = { 1: "I", 2: "II", 3: "III", 4: "IV" };

/** Roman numeral for a 1..4 division. */
export function divisionRoman(d: DivisionNum): string {
  return ROMAN[d];
}

/** True when the tier is apex (Master/Grandmaster/Challenger → no division). */
export function isApex(tier: unknown): boolean {
  const key = normalizeTier(tier);
  return key !== null && APEX_TIERS.has(key);
}

/** Full visual descriptor (label + colors + apex flag) for a tier. */
export function tierVisual(tier: unknown): TierVisual {
  const key = normalizeTier(tier);
  if (key === null) return UNRANKED;
  const def = TIERS[key];
  return { key, label: def.label, english: def.english, apex: APEX_TIERS.has(key), colors: def.colors };
}

/** EXACT Chinese label for a tier ("菁英", "翡翠", …); "未定級" when unknown. */
export function tierLabel(tier: unknown): string {
  return tierVisual(tier).label;
}

/**
 * Human rank text: "金 II" for a divisioned tier, "菁英" for apex, "未定級"
 * when unranked. Apex tiers never show a division even if one is passed.
 */
export function formatRank(tier: unknown, division?: unknown): string {
  const v = tierVisual(tier);
  if (v.key === "unranked") return v.label;
  if (v.apex) return v.label;
  const d = normalizeDivision(division);
  return d ? `${v.label} ${divisionRoman(d)}` : v.label;
}
