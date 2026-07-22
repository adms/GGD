/**
 * Ability-text helpers for the HUD (pure, node-testable — no DOM, no React).
 *
 * The imported roster encodes the hero number in the ability NAME as an
 * "NN-0X " / "NN-00X " prefix — a 1-3 digit hero number, a dash, a 2-3 digit
 * skill number and a trailing space (e.g. "19-01 斷未", "22-002 月光下的決鬥者").
 * The in-game bar shows the CLEAN skill name; the full numbered name stays
 * available for the tooltip header.
 */
import type { CastType } from "@ggd/shared/sim/content/defs";
import type { TooltipMeta } from "./Tooltip";

/** Leading "<hero>-<skill> " number tag (hero 1-3 digits, skill 2-3 digits). */
const ABILITY_NUMBER_PREFIX = /^\d{1,3}-\d{2,3}\s+/;

/**
 * Strip the leading hero/skill number tag from an ability name.
 *   "19-01 斷未"            → "斷未"
 *   "22-002 月光下的決鬥者" → "月光下的決鬥者"
 * Names without the tag are returned unchanged; a name that is ONLY a tag
 * (nothing after) is left intact rather than reduced to an empty string.
 */
export function stripAbilityNumber(name: string): string {
  const stripped = name.replace(ABILITY_NUMBER_PREFIX, "");
  return stripped.length > 0 ? stripped : name;
}

/**
 * Read the optional human `description` off a content def (ability / item).
 * The sim's `AbilityDef`/`ItemDef` TS types don't declare it — only the Zod
 * doc schemas do (task #8 backfill) — but the runtime docs carry it, so this
 * reads it defensively (param is `unknown` because the sim types have no such
 * field). Empty/absent descriptions collapse to `undefined` so callers can
 * branch on presence.
 *
 * PREFERS THE ROLE MARKUP (task #114). When the doc carries `descriptionRoles`
 * — the same text with the w3x colour codes recovered as `[c=role]…[/c]`
 * semantic tags — that is returned instead of the flat `description`, so a
 * caller passing this straight into <Tooltip body> gets the colour-normalised
 * version for free. Plain `description` (colours stripped) stays the fallback
 * for docs the importer has not re-run over yet. Either way <Tooltip> renders
 * a string with no markup as-is, so this is safe before the field exists.
 */
export function docDescription(def: unknown): string | undefined {
  const d = def as { description?: unknown; descriptionRoles?: unknown } | null | undefined;
  const roles = d?.descriptionRoles;
  if (typeof roles === "string" && roles.length > 0) return roles;
  const plain = d?.description;
  return typeof plain === "string" && plain.length > 0 ? plain : undefined;
}

// ---------------------------------------------------------------------------
// description colour ROLES (task #114)
//
// The w3x tooltips colour numbers inline with `|cAARRGGBB…|r` codes, but the
// source is wildly inconsistent — the same "damage" number appears in a dozen
// near-identical reds across the map. Rather than ship raw hex, the importer
// (tools/w3x-import/w3xlib/wts.py) classifies each colour into a SEMANTIC ROLE
// and re-emits the text as `[c=role]…[/c]` markup; this module is the single
// source of truth for the role vocabulary, the hex→role classifier (kept
// byte-for-byte in sync with the Python side), and the one normalised colour
// each role renders as. Game tooltips, the codex and the editor preview all
// read role → colour from here, so the whole app speaks one palette.
// ---------------------------------------------------------------------------

/** The semantic roles a coloured span in a description can carry. */
export type DescRole = "damage" | "physical" | "duration" | "heal" | "mana" | "magic" | "generic";

/**
 * Role → the ONE normalised colour it renders as (dark-panel legible). This is
 * the whole point of the task: whatever inconsistent red the source used for a
 * damage number, it renders as exactly this red everywhere.
 */
export const ROLE_COLOR: Record<DescRole, string> = {
  damage: "#ff6b5e",
  physical: "#ffa24b",
  duration: "#f2c637",
  heal: "#5fd17a",
  mana: "#5aa2ff",
  magic: "#b98bff",
  generic: "#dfe6f2",
};

/**
 * Exact-hex overrides for source colours whose hue would mis-classify — the
 * pale "name"/highlight tints the map uses for non-numeric emphasis, which by
 * hue alone would read as physical/mana but are semantically neutral. Keyed by
 * lowercase RRGGBB (alpha dropped). Everything else falls to the hue rule.
 */
const ROLE_OVERRIDES: Record<string, DescRole> = {
  ffdead: "generic", // navajo-white — item/keyword names
  c3dbff: "generic", // pale blue highlight
  ffffff: "generic",
  c0c0c0: "generic",
};

/**
 * Classify a WC3 colour into a semantic role. Accepts `RRGGBB` or `AARRGGBB`
 * (alpha dropped), case-insensitive. TOTAL — never returns "unknown": a small
 * override table handles the neutral tints, then a deterministic HSV rule maps
 * every remaining colour by hue, with low-saturation/near-grey folding to
 * `generic`. Mirror of `classify_role` in w3xlib/wts.py.
 */
export function classifyRole(hex: string): DescRole {
  const h = hex.toLowerCase().replace(/[^0-9a-f]/g, "");
  const rgb = h.length === 8 ? h.slice(2) : h.slice(-6);
  if (rgb.length < 6) return "generic";
  const override = ROLE_OVERRIDES[rgb];
  if (override) return override;
  const r = parseInt(rgb.slice(0, 2), 16) / 255;
  const g = parseInt(rgb.slice(2, 4), 16) / 255;
  const b = parseInt(rgb.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const sat = max === 0 ? 0 : d / max;
  if (d < 0.06 || sat < 0.18) return "generic";
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  if (hue < 20 || hue >= 330) return "damage";
  if (hue < 45) return "physical";
  if (hue < 70) return "duration";
  if (hue < 165) return "heal";
  if (hue < 255) return "mana";
  return "magic";
}

/** One run of description text, optionally carrying a role colour. */
export interface DescSegment {
  readonly text: string;
  readonly role?: DescRole;
}

const ROLE_MARKUP_RE = /\[c=([a-z-]+)\]([\s\S]*?)\[\/c\]/g;

/** True when a string carries any `[c=role]…[/c]` role markup. */
export function hasRoleMarkup(s: string): boolean {
  ROLE_MARKUP_RE.lastIndex = 0;
  return ROLE_MARKUP_RE.test(s);
}

/**
 * Split a description into coloured/plain runs. `[c=role]text[/c]` becomes a
 * segment carrying that role (an unrecognised role tag degrades to a plain
 * run rather than throwing); text outside any tag is a role-less run. A string
 * with no markup returns a single plain segment, so this is a safe no-op on the
 * flat descriptions that predate the importer re-run. Mirror of the emitter in
 * w3xlib/wts.py (`to_role_markup`).
 */
export function parseRoleMarkup(s: string): DescSegment[] {
  const out: DescSegment[] = [];
  let last = 0;
  ROLE_MARKUP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROLE_MARKUP_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const role = m[1] as DescRole;
    out.push(role in ROLE_COLOR ? { text: m[2]!, role } : { text: m[2]! });
    last = ROLE_MARKUP_RE.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.length > 0 ? out : [{ text: s }];
}

/** Compact Chinese label for an ability cast type (tooltip meta row). */
const CAST_TYPE_LABEL: Record<CastType, string> = {
  targeted: "鎖定",
  skillshot: "技能預測",
  ground: "地面指定",
  self: "自身",
  dash: "位移",
};

export function castTypeLabel(castType: CastType): string {
  return CAST_TYPE_LABEL[castType] ?? castType;
}

// ---------------------------------------------------------------------------
// shared ability-number meta (task #125: 數字可信)
//
// The ONE place that turns an ability's authored numbers into tooltip chips, so
// the in-game AbilityBar tooltip and the champ-select skill profile show the
// SAME rows — and the same POST-MULTIPLIER finals. The cooldown row is emitted
// as `{ base, factor: "cooldown" }`, so <Tooltip> multiplies it by the live
// combat-env `cooldown` factor (0.25 → base 35s shows 8.75s). Mana COST is NOT
// scaled — the env table has `maxMana`/`manaRegen` for the POOL and REGEN but no
// cost multiplier — so it is emitted as a literal `value`. Cast type is a label.
// ---------------------------------------------------------------------------

/** The authored numbers a meta row set reads (base, pre-multiplier). */
export interface AbilityMetaInput {
  /** 施法方式; omit for slots that don't show one (EX with a bespoke label passes castLabel). */
  castType?: CastType;
  /** pre-built 施法 label (EX already has one); wins over castType when set. */
  castLabel?: string;
  /** base cooldown seconds at the shown rank (pre combat-env). */
  cooldownSec?: number;
  /** base mana cost at the shown rank; omitted/0 → no 魔力 row. */
  manaCost?: number;
}

/**
 * Build the tooltip meta chips for an ability, cooldown carried as a scaled
 * `{ base, factor: "cooldown" }` so <Tooltip> renders the live final. Shared by
 * the ability bar and the champ-select profile so a cooldown can never disagree
 * between them, or with the sim.
 */
export function abilityMetaChips(input: AbilityMetaInput): TooltipMeta[] {
  const meta: TooltipMeta[] = [];
  const cast = input.castLabel ?? (input.castType ? castTypeLabel(input.castType) : undefined);
  if (cast) meta.push({ label: "施法", value: cast });
  if (input.cooldownSec !== undefined) {
    meta.push({ label: "冷卻", base: input.cooldownSec, factor: "cooldown", unit: "s" });
  }
  if (input.manaCost !== undefined && input.manaCost > 0) {
    meta.push({ label: "魔力", value: `${input.manaCost}` });
  }
  return meta;
}
