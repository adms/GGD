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
import { envFactor, getDisplayEnv } from "../displayFinal";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";

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

// ---------------------------------------------------------------------------
// ability PROSE rescale (說明數值最終化)
//
// The flat `description` prose bakes BASE WC3 numbers into the sentence
// ("60秒冷卻時間", "造成650傷害"), while the structured meta chips beside it
// already show the post-combat-env FINAL via displayFinal. That contradiction —
// a "15s" chip next to "60秒冷卻" prose, or "325 real" damage shown as "650" — is
// the reported bug.
//
// `rescaleAbilityProse` rewrites the LITERALS that a combat-env multiplier
// actually scales to their final, reading each factor from the SAME env table
// displayFinal/useDisplayEnv resolve against (never a hard-coded number, so it
// tracks a live combat-env edit), and appends "（WC3原 …）" so the source stays
// visible. TWO factors are applied, each independently and only when non-neutral:
//   • cooldown literals  ×envFactor("cooldown")     → "60秒冷卻時間" → "15秒…（WC3原 60秒）"
//   • damage literals    ×envFactor("damageDealt")  → "造成650傷害" → "造成325傷害（WC3原 650）"
// Every OTHER number — heal / shield / mana / duration / stat — is left
// byte-for-byte untouched (those factors are ×1.0). The two passes anchor on
// disjoint keywords (冷卻/cooldown vs 傷害/damage), so a cooldown number is never
// re-read as damage and vice-versa; the shared "（WC3原" guard keeps it
// idempotent across repeated calls. Only flat numeric literals are touched —
// formula damage ("力量*3額外傷害", "(40+敏捷*1)傷害") has no bare number directly
// against 傷害 and is deliberately skipped.
// ---------------------------------------------------------------------------

/** Dim disclaimer for a prose block whose residual literals are WC3 originals. */
export const WC3_PROSE_CAPTION = "數值以介面標示為準（WC3 原文）";

/**
 * The cooldown-literal shapes we rewrite. Four alternatives, each capturing the
 * NUMBER in its own group so the replacer knows which matched:
 *   1. `NN秒冷卻[時間]`  — "60秒冷卻時間", "0.5 秒冷卻"   → (num, suffix)
 *   2. `冷卻[時間]NN秒`  — "冷卻時間30秒", "冷卻30秒"     → (prefix, num, 秒)
 *   3. `NNs cooldown`    — "3s cooldown"                  → (num, suffix)
 *   4. `cooldown NNs`    — "cooldown 3s"                  → (prefix, num, s)
 * NN is an integer or decimal; incidental whitespace between the number and the
 * unit is tolerated (the map's "0.5 秒冷卻" carries a space). Case-insensitive
 * for the English shapes; the trailing negative lookahead stops a "N seconds"
 * from being mis-read as "N s".
 */
const NUM_SRC = "\\d+(?:\\.\\d+)?";
/**
 * ⭐ 逐階斜線串（`60/50/40/30`）也要吃得下。
 *
 * ⚠️ 這一格在 說明推導（票號待開） 之前是**單一數字**，而卡面上的逐階寫法（13-01 / 44-03）
 * 因此只有**最後一階**被乘 —— 「60/50/40/**30**秒冷卻」變成
 * 「60/50/40/6秒冷卻」，一句比原本更難懂的謊話。
 * 佔位符 `{{cd}}` 算繪出來的就是這種串（而且現在有 83 處新的），
 * ⇒ ⛔ 這一條不修就是把一個已知缺陷放大 83 倍。
 */
const RANKS_SRC = `${NUM_SRC}(?:\\s*/\\s*${NUM_SRC})*`;

const COOLDOWN_PROSE_RE = new RegExp(
  [
    `(${RANKS_SRC})(\\s*秒\\s*冷卻(?:時間)?)`, // 1: NN + 秒冷卻[時間]
    `(冷卻(?:時間)?\\s*)(${RANKS_SRC})(\\s*秒)`, // 2: 冷卻[時間] + NN + 秒
    `(${NUM_SRC})(\\s*s\\s+cooldown)`, // 3: NNs cooldown
    `(cooldown\\s+)(${NUM_SRC})(\\s*s)(?![a-z])`, // 4: cooldown NNs
  ].join("|"),
  "gi",
);

/**
 * Round a numeric literal string by a combat-env factor (integer result).
 * ⭐ 逐階串**逐階乘**，⛔ 不是只乘其中一個（見 {@link RANKS_SRC} 的說明）。
 */
function scaleProseLiteral(literal: string, factor: number): string {
  return literal
    .split("/")
    .map((t) => String(Math.round(Number(t.trim()) * factor)))
    .join("/");
}

/**
 * The damage-literal shapes we rewrite. Each alternative captures the NUMBER in
 * its own group so the replacer knows which matched, and every alternative
 * anchors on the 傷害 / damage keyword directly against the number so a cooldown
 * number ("60秒…") is never mistaken for damage, and a formula multiplier
 * ("力量*3額外傷害", "(40+敏捷*1)傷害") — which has no bare number touching 傷害 —
 * is left alone:
 *   1. `造成NNN[點]傷害`  — "造成650傷害", "造成550點傷害" → (prefix, num, suffix)
 *   2. `NNN[ ]點傷害`     — "650點傷害", "650 點傷害"       → (num, suffix)
 *   3. `[deal ]NNN damage` — "deal 650 damage", "650 damage" → (num, suffix)
 * NN is an integer or decimal; incidental whitespace is tolerated. The English
 * shape is case-insensitive. NOTE: 損害 (a synonym the map uses for "200點損害")
 * is intentionally NOT matched — only the 傷害 / damage phrasings are in scope.
 */
const DAMAGE_PROSE_RE = new RegExp(
  [
    `(造成\\s*)(${RANKS_SRC})(\\s*(?:點\\s*)?傷害)`, // 1: 造成 NNN [點]傷害
    `(${RANKS_SRC})(\\s*點\\s*傷害)`, // 2: NNN 點傷害
    `(${NUM_SRC})(\\s+damage)`, // 3: [deal] NNN damage
  ].join("|"),
  "gi",
);

/** Rewrite every cooldown literal in `description` by the (non-neutral) factor. */
function rescaleCooldownLiterals(description: string, factor: number): string {
  return description.replace(
    COOLDOWN_PROSE_RE,
    (
      _m: string,
      g1?: string,
      g2?: string,
      g3?: string,
      g4?: string,
      g5?: string,
      g6?: string,
      g7?: string,
      g8?: string,
      g9?: string,
      g10?: string,
    ): string => {
      let orig: string;
      let rebuilt: string;
      if (g1 !== undefined) {
        orig = g1;
        rebuilt = scaleProseLiteral(g1, factor) + g2!;
      } else if (g4 !== undefined) {
        orig = g4;
        rebuilt = g3! + scaleProseLiteral(g4, factor) + g5!;
      } else if (g6 !== undefined) {
        orig = g6;
        rebuilt = scaleProseLiteral(g6, factor) + g7!;
      } else {
        orig = g9!;
        rebuilt = g8! + scaleProseLiteral(g9!, factor) + g10!;
      }
      return `${rebuilt}（WC3原 ${orig}秒）`;
    },
  );
}

/** Rewrite every damage literal in `description` by the (non-neutral) factor. */
function rescaleDamageLiterals(description: string, factor: number): string {
  return description.replace(
    DAMAGE_PROSE_RE,
    (
      _m: string,
      g1?: string,
      g2?: string,
      g3?: string,
      g4?: string,
      g5?: string,
      g6?: string,
      g7?: string,
    ): string => {
      let orig: string;
      let rebuilt: string;
      if (g2 !== undefined) {
        // 1: 造成 NNN [點]傷害
        orig = g2;
        rebuilt = g1! + scaleProseLiteral(g2, factor) + g3!;
      } else if (g4 !== undefined) {
        // 2: NNN 點傷害
        orig = g4;
        rebuilt = scaleProseLiteral(g4, factor) + g5!;
      } else {
        // 3: [deal] NNN damage
        orig = g6!;
        rebuilt = scaleProseLiteral(g6!, factor) + g7!;
      }
      return `${rebuilt}（WC3原 ${orig}）`;
    },
  );
}

/**
 * Rewrite the combat-env-scaled LITERALS in a description to their post-combat-
 * env finals, reading each factor off `env` (defaults to the ambient displayFinal
 * table). Applies TWO independent passes, each a no-op when its factor is neutral:
 *   • cooldown ×envFactor("cooldown")    — "60秒冷卻時間" → "15秒冷卻時間（WC3原 60秒）"
 *   • damage   ×envFactor("damageDealt") — "造成650傷害" → "造成325傷害（WC3原 650）"
 * Returns the string unchanged when nothing scaled matches, when both factors are
 * neutral (1.0 — base already equals final), or when it has already been
 * annotated. Heal / shield / mana / duration / stat numbers are never touched.
 * Pure and node-testable: pass the env table explicitly.
 */
export function rescaleAbilityProse(
  description: string,
  env: CombatEnvMultipliers = getDisplayEnv(),
): string {
  if (!description) return description;
  // defensive against a double pass — never annotate an already-annotated string
  if (description.includes("（WC3原")) return description;
  let out = description;
  // cooldown pass — skip the rewrite (and its "（WC3原 …）" note) under a neutral
  // or rejected factor, where base already equals final.
  const cooldownFactor = envFactor("cooldown", env);
  if (Number.isFinite(cooldownFactor) && cooldownFactor !== 1) {
    out = rescaleCooldownLiterals(out, cooldownFactor);
  }
  // damage pass — same neutrality guard, keyed on the SAME env the sim scales
  // damage by (damageDealt). Runs after cooldown; the passes anchor on disjoint
  // keywords so neither re-reads the other's number.
  const damageFactor = envFactor("damageDealt", env);
  if (Number.isFinite(damageFactor) && damageFactor !== 1) {
    out = rescaleDamageLiterals(out, damageFactor);
  }
  return out;
}
