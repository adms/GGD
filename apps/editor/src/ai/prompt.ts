/**
 * Pure helpers for the editor's AI-icon + AI-fill controls: which collections
 * can carry an icon, where the generated PNG lands, and how a prompt/context is
 * built from a doc's authored fields (name + description + tags + a few traits).
 *
 * Everything here is side-effect free so it is directly unit-testable (the
 * editor test suite runs in node with no DOM) — the React panel is a thin shell
 * over these functions.
 */

/** Collections whose docs have a top-level `icon` field (see the Zod schemas). */
export type IconKind = "champions" | "abilities" | "items";

const ICON_KINDS: readonly IconKind[] = ["champions", "abilities", "items"];

/** Collection name -> icon kind, or null when the collection has no icon. */
export function iconKindFor(collection: string): IconKind | null {
  return (ICON_KINDS as readonly string[]).includes(collection) ? (collection as IconKind) : null;
}

/**
 * Content-relative asset path the Accept flow writes the PNG to and stores in
 * the doc's `icon` field: `assets/icons/<kind>/<docId>.png`. Matches the
 * extraction pipeline's layout (task #33) so the client resolver finds it.
 */
export function iconAssetPath(kind: IconKind, docId: string): string {
  return `assets/icons/${kind}/${docId}.png`;
}

/** Loosely-typed view of the authored fields we read for prompting. */
interface DocFields {
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  role?: unknown;
  attackType?: unknown;
  slot?: unknown;
  castType?: unknown;
  tier?: unknown;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(asString).filter((s) => s.length > 0) : [];
}

const KIND_SUBJECT: Record<IconKind, string> = {
  champions: "a MOBA champion portrait icon",
  abilities: "a MOBA ability / spell icon",
  items: "a MOBA item icon",
};

const STYLE_SUFFIX =
  "centered square emblem, single bold readable silhouette, high contrast, " +
  "painterly dark-fantasy arena game art, no text, no lettering, no border.";

/**
 * Build the icon-generation prompt, prefilled from the doc. Skips absent
 * fields so a bare template doc still yields a usable prompt. Deterministic
 * (stable line order) so the panel's textarea and the tests agree.
 */
export function buildIconPrompt(kind: IconKind, doc: unknown): string {
  const d = (doc ?? {}) as DocFields;
  const name = asString(d.name);
  const desc = asString(d.description);
  const tags = asStringArray(d.tags);

  const traits: string[] = [];
  if (kind === "champions") {
    if (asString(d.role)) traits.push(`role: ${asString(d.role)}`);
    if (asString(d.attackType)) traits.push(`${asString(d.attackType)} attacker`);
  } else if (kind === "abilities") {
    if (asString(d.slot)) traits.push(`slot: ${asString(d.slot)}`);
    if (asString(d.castType)) traits.push(`${asString(d.castType)} cast`);
  } else {
    if (d.tier != null && asString(d.tier)) traits.push(`tier ${asString(d.tier)}`);
  }

  const lines: string[] = [`Icon art for ${KIND_SUBJECT[kind]}.`];
  if (name) lines.push(`Name: ${name}.`);
  if (traits.length) lines.push(`Traits: ${traits.join(", ")}.`);
  if (desc) lines.push(`Description: ${desc}.`);
  if (tags.length) lines.push(`Tags: ${tags.join(", ")}.`);
  lines.push(`Style: ${STYLE_SUFFIX}`);
  return lines.join("\n");
}

/** Default free-text style hint the panel seeds its Style input with. */
export const DEFAULT_ICON_STYLE = "painterly dark-fantasy game icon";

/** Field leaf-keys the "AI 填空" button offers to fill (free-text content). */
const FILLABLE_FIELDS = new Set([
  "description",
  "name",
  "text",
  "flavor",
  "flavour",
  "lore",
  "tooltip",
  "title",
  "summary",
  "note",
  "notes",
]);

/** Whether the small "AI 填空" button should appear beside a given text field. */
export function isFillableField(leafKey: string): boolean {
  return FILLABLE_FIELDS.has(leafKey);
}

/** Request payload for POST /api/v1/ai/text. */
export interface TextFillRequest {
  prompt: string;
  field: string;
  context: string;
}

/**
 * Compact the doc down to the small set of authored fields that give the text
 * model useful context, dropping bulky/structural blocks (abilities, effects,
 * modifiers, stat blocks, schema discriminator) so the context stays small and
 * relevant.
 */
function docContext(doc: unknown): Record<string, unknown> {
  const d = (doc ?? {}) as Record<string, unknown>;
  const keep = ["id", "name", "role", "attackType", "slot", "castType", "tier", "cost", "tags", "description"];
  const out: Record<string, unknown> = {};
  for (const k of keep) {
    if (d[k] !== undefined) out[k] = d[k];
  }
  return out;
}

const FIELD_INSTRUCTION: Record<string, string> = {
  description:
    "Write a concise, flavorful in-game description (1-3 sentences). No stats or numbers, just tone and fantasy.",
  name: "Suggest a single evocative name. Return only the name, no quotes.",
};

/** Build the {prompt, field, context} body for an AI 填空 request. */
export function buildTextPrompt(field: string, doc: unknown): TextFillRequest {
  const d = (doc ?? {}) as { name?: unknown };
  const name = asString(d.name);
  const subject = name ? `"${name}"` : `this ${field}`;
  const instruction =
    FIELD_INSTRUCTION[field] ?? `Write the "${field}" field for ${subject}. Keep it short and fitting.`;
  const prompt = name && field !== "name" ? `${instruction} Subject: ${subject}.` : instruction;
  return { prompt, field, context: JSON.stringify(docContext(doc)) };
}
