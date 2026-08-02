/**
 * 鑄技工坊 — THE ONE TEMPLATE RESOLVER, SHARED BY THE LOADER AND THE EDITOR.
 *
 * WHY THIS FILE EXISTS AT ALL. `registries.ts` used to resolve a template ref
 * inline and `throw` when it missed:
 *
 *     const t = templates.get(link.ref);
 *     if (t === undefined) throw new Error(`ability ${doc.id}: template …`);
 *
 * That throw sat inside `registerAll`'s `for` loop, so ONE bad `ref` in ONE
 * ability doc aborted the registration of EVERY champion, item, arena and config
 * in the process. On the client `main.tsx` catches it and fails OPEN to a 2-hero
 * skeleton — i.e. the 2026-08-01 outage shape: the site loads, the lobby loads,
 * the version badge is right, and the champion-select screen is simply empty.
 *
 * With template adoption at 0% that mine was inert. It stops being inert the
 * moment anything adopts templates, and `ForgeWriteback.FORGE_OWNED_MEMBERS`
 * already lists `"template"` — the Forge can SAVE such a doc today.
 *
 * ⚠️ THE POINT OF SHARING IT. CLAUDE.md's `buildIndexesValidates` lesson is
 * 「只在遠離現場的地方響的警報不是守衛」: a rule that only runs at the next
 * `registerAll()` is a rule the author never meets. So the editor's save path
 * (`ForgeWriteback`) calls THIS function, not a second re-implementation of it —
 * the thing that rejects a broken save is byte-for-byte the thing that would
 * have degraded the skill at boot.
 *
 * PURE: no module state, no I/O, and it NEVER throws. Every failure comes back
 * as data so the caller can decide between「擋下存檔」and「只降級這一支」.
 */
import type { AbilityTemplateCard, TemplateConflictPolicy, TemplateDoc } from "../schema/template";
import {
  expandStackOrThrow,
  mergeExpansion,
  normalizeTemplateBinding,
  type ExpandResult,
} from "./expand";

/**
 * WHERE the resolution died. Kept as three separate values rather than one
 * boolean because the three have different fixes: `binding` is a malformed
 * document, `ref` is a template that was renamed or never shipped, and `expand`
 * is a param outside its slot's range (or a `reject`-policy stack collision).
 */
export type TemplateFailurePhase = "binding" | "ref" | "expand";

export interface TemplateResolveFailure {
  readonly phase: TemplateFailurePhase;
  /** every ref the binding named, in card order — `[]` when the binding itself is unreadable */
  readonly refs: readonly string[];
  /** the subset of `refs` that resolves to no template doc (empty unless phase === "ref") */
  readonly missingRefs: readonly string[];
  readonly message: string;
}

export type TemplateResolution =
  | {
      readonly ok: true;
      readonly refs: readonly string[];
      readonly expansion: ExpandResult;
      /** the on-disk doc with the expander-owned members overlaid (NOT yet Zod-parsed) */
      readonly merged: Record<string, unknown>;
    }
  | { readonly ok: false; readonly failure: TemplateResolveFailure };

/** Does this doc claim to be template-authored at all? */
export function hasTemplateBinding(doc: Record<string, unknown>): boolean {
  const t = doc["template"];
  return t !== undefined && t !== null;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Resolve a template-authored ability doc into its merged form.
 *
 * ⚠️ It goes through `normalizeTemplateBinding` + `expandStackOrThrow`, i.e. the
 * STACK path, and that is deliberate rather than incidental. The schema has
 * accepted three binding shapes since 2026-07-31 (`{ref,params}` / an array /
 * `{cards,onConflict}`) and the Forge writes all three, while the old inline
 * resolver only ever read `link.ref` — so an array-shaped binding looked up
 * `templates.get(undefined)`, missed, and detonated the whole registration.
 * A 1-card stack expands byte-identically to the legacy `expand(t, params)`
 * (proved over every enabled shipped template in `stack.test.ts`), so routing
 * everything through one path costs nothing and closes that hole.
 */
export function resolveTemplateExpansion(
  doc: Record<string, unknown>,
  templates: ReadonlyMap<string, TemplateDoc>,
): TemplateResolution {
  let cards: readonly AbilityTemplateCard[];
  let onConflict: TemplateConflictPolicy;
  try {
    const normalized = normalizeTemplateBinding(doc["template"]);
    cards = normalized.cards;
    onConflict = normalized.onConflict;
  } catch (e) {
    return {
      ok: false,
      failure: { phase: "binding", refs: [], missingRefs: [], message: messageOf(e) },
    };
  }

  const refs = cards.map((c) => c.ref);
  const missingRefs = refs.filter((r) => !templates.has(r));
  if (missingRefs.length > 0) {
    return {
      ok: false,
      failure: {
        phase: "ref",
        refs,
        missingRefs,
        message:
          `template ${missingRefs.map((r) => `"${r}"`).join(", ")} not found in ` +
          `ability-templates (binding names ${refs.length} card(s))`,
      },
    };
  }

  try {
    const expansion = expandStackOrThrow(
      cards.map((c) => ({ template: templates.get(c.ref)!, params: c.params })),
      onConflict,
    );
    return { ok: true, refs, expansion, merged: mergeExpansion(doc, expansion) };
  } catch (e) {
    return {
      ok: false,
      failure: { phase: "expand", refs, missingRefs: [], message: messageOf(e) },
    };
  }
}
