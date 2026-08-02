/**
 * Content curation (whitelist) — pure, node-testable logic behind the admin
 * 內容白名單 page.
 *
 * The whitelist is OPERATIONAL STATE, not content: a single durable JSON doc
 * (`data/curation/whitelist.json`, served by the platform at
 * `/api/v1/curation/whitelist`) listing the ids the game is allowed to use.
 * **A fresh install has EMPTY arrays** — the imported map is far too large to
 * ship wholesale, so nothing is playable until an operator selects it here.
 *
 * Everything in this module is a pure function over plain data so the page's
 * behaviour (filtering, shift-range multi-select, bulk enable/disable, counter
 * math, the starter set, the save diff and the post-save verification) is unit
 * tested without React or a browser.
 */

// ---------------------------------------------------------------- kinds ----

export type Kind = "champions" | "items" | "abilities";

export const KINDS: readonly Kind[] = ["champions", "items", "abilities"] as const;

/** Tab labels (zh-Hant, matching the user's wording 英雄/道具/技能). */
export const KIND_LABEL: Record<Kind, string> = {
  champions: "英雄",
  items: "道具",
  abilities: "技能",
};

export function isKind(v: string): v is Kind {
  return (KINDS as readonly string[]).includes(v);
}

// ------------------------------------------------------------- the doc ----

/** The durable whitelist document (contract shape). */
export interface WhitelistDoc {
  version: number;
  updatedAt: string;
  champions: string[];
  items: string[];
  abilities: string[];
}

/** A fresh, empty whitelist — the documented default for a new install. */
export function emptyWhitelist(): WhitelistDoc {
  return { version: 1, updatedAt: "", champions: [], items: [], abilities: [] };
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x !== "") out.push(x);
  return dedupeSorted(out);
}

/**
 * Sort + dedupe so two docs with the same content always compare equal.
 *
 * NOTE this dedupes **ids** (set semantics on a whitelist array), which is a
 * completely different question from "are these two champions the same
 * CHARACTER?". The console must never answer the latter: champion identity has
 * exactly one home, `packages/shared/src/content/championIdentity.ts` (the hero
 * 編號 carried by the ability names). Guessing it from a shared model or a
 * shared portrait is what erased 黑化Saber; guessing it here would instead make
 * a real champion un-enableable from the ops console. Every authored champion
 * stays individually listable and individually curatable.
 */
export function dedupeSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/**
 * Tolerant parser for whatever the platform returns. Accepts the bare doc, a
 * `{ whitelist: doc }` envelope, or garbage (→ empty doc); missing arrays
 * become empty rather than throwing, so the page never dies on a partial
 * response from a backend that is still being built.
 */
export function normalizeWhitelist(raw: unknown): WhitelistDoc {
  if (raw === null || typeof raw !== "object") return emptyWhitelist();
  const outer = raw as Record<string, unknown>;
  const inner =
    outer["whitelist"] && typeof outer["whitelist"] === "object"
      ? (outer["whitelist"] as Record<string, unknown>)
      : outer;
  const version = typeof inner["version"] === "number" ? inner["version"] : 1;
  const updatedAt = typeof inner["updatedAt"] === "string" ? inner["updatedAt"] : "";
  return {
    version,
    updatedAt,
    champions: stringArray(inner["champions"]),
    items: stringArray(inner["items"]),
    abilities: stringArray(inner["abilities"]),
  };
}

/** The enabled ids for one kind, as a Set (membership tests in render loops). */
export function enabledSet(doc: WhitelistDoc, kind: Kind): Set<string> {
  return new Set(doc[kind]);
}

// ------------------------------------------------------------ content ------

/** One selectable content row (a champion / item / ability doc, trimmed). */
export interface ContentRow {
  id: string;
  /** display name; falls back to the id until the doc is hydrated */
  name: string;
  /** content-relative w3x icon path ("assets/icons/…"), absent for stock art */
  icon?: string;
  /** champions only */
  role?: string;
  /** items only */
  cost?: number;
  /** items only */
  tier?: number;
  /** true once the full doc arrived (name/icon are real, not placeholders) */
  hydrated?: boolean;
}

export type EnabledFilter = "all" | "enabled" | "disabled";

export const FILTER_LABEL: Record<EnabledFilter, string> = {
  all: "全部",
  enabled: "已啟用",
  disabled: "未啟用",
};

/**
 * Substring search over id + name (+ role/tags-ish fields). ASCII is matched
 * case-insensitively; CJK is plain substring ("亞瑟" ⊂ "亞瑟王"), matching the
 * client's champ-select search so operators and players see the same hits.
 */
export function matchesQuery(row: ContentRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (row.id.toLowerCase().includes(q)) return true;
  if (row.name.toLowerCase().includes(q)) return true;
  if (row.role && row.role.toLowerCase().includes(q)) return true;
  return false;
}

/** Search + enabled/disabled filter, preserving the incoming row order. */
export function filterRows(
  rows: readonly ContentRow[],
  query: string,
  filter: EnabledFilter,
  enabled: ReadonlySet<string>,
): ContentRow[] {
  return rows.filter((r) => {
    if (!matchesQuery(r, query)) return false;
    if (filter === "enabled") return enabled.has(r.id);
    if (filter === "disabled") return !enabled.has(r.id);
    return true;
  });
}

// ----------------------------------------------------------- counters ------

export interface KindCounts {
  /** rows that exist in the content tree */
  total: number;
  /** whitelisted ids that exist in the content tree */
  enabled: number;
  /** rows passing the current search+filter */
  shown: number;
  /** of those, how many are enabled */
  shownEnabled: number;
  /** whitelisted ids with NO matching content doc (stale entries) */
  unknown: number;
}

/**
 * Counter math for the "已啟用 X / 共 Y" badge. `enabled` counts only ids that
 * still exist in the content tree, so a stale whitelist entry (content doc
 * deleted) can never inflate the number past the total — it is reported
 * separately as `unknown`.
 */
export function countKind(
  rows: readonly ContentRow[],
  enabled: ReadonlySet<string>,
  shown: readonly ContentRow[],
): KindCounts {
  const known = new Set(rows.map((r) => r.id));
  let enabledKnown = 0;
  for (const id of enabled) if (known.has(id)) enabledKnown++;
  return {
    total: rows.length,
    enabled: enabledKnown,
    shown: shown.length,
    shownEnabled: shown.filter((r) => enabled.has(r.id)).length,
    unknown: enabled.size - enabledKnown,
  };
}

// ---------------------------------------------------------- selection ------

/**
 * Multi-select state: the picked ids plus the shift-range anchor (an index
 * into the *visible* list at the time of the last plain click).
 */
export interface Selection {
  ids: readonly string[];
  anchor: number | null;
}

export const EMPTY_SELECTION: Selection = { ids: [], anchor: null };

/**
 * A row click. Plain click toggles the row and moves the anchor; shift-click
 * selects the whole inclusive range between the anchor and the clicked row
 * (additive, Finder/Explorer style) and leaves the anchor where it was. A
 * shift-click with no anchor behaves like a plain click.
 */
export function clickRow(
  sel: Selection,
  visibleIds: readonly string[],
  index: number,
  shift: boolean,
): Selection {
  const id = visibleIds[index];
  if (id === undefined) return sel;

  if (shift && sel.anchor !== null && sel.anchor >= 0 && sel.anchor < visibleIds.length) {
    const lo = Math.min(sel.anchor, index);
    const hi = Math.max(sel.anchor, index);
    const next = new Set(sel.ids);
    for (let i = lo; i <= hi; i++) {
      const rid = visibleIds[i];
      if (rid !== undefined) next.add(rid);
    }
    return { ids: [...next], anchor: sel.anchor };
  }

  const next = new Set(sel.ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return { ids: [...next], anchor: index };
}

/**
 * "Select all filtered" toggle: if every visible row is already selected the
 * visible rows are deselected, otherwise they are all added (selections on
 * rows hidden by the current filter are preserved either way).
 */
export function toggleSelectAll(sel: Selection, visibleIds: readonly string[]): Selection {
  const cur = new Set(sel.ids);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => cur.has(id));
  if (allSelected) {
    for (const id of visibleIds) cur.delete(id);
  } else {
    for (const id of visibleIds) cur.add(id);
  }
  return { ids: [...cur], anchor: null };
}

/** Drop selected ids that are no longer visible (after a filter change). */
export function pruneSelection(sel: Selection, visibleIds: readonly string[]): Selection {
  const visible = new Set(visibleIds);
  const ids = sel.ids.filter((id) => visible.has(id));
  return ids.length === sel.ids.length ? sel : { ids, anchor: null };
}

// --------------------------------------------------------------- bulk ------

/** POST /curation/whitelist/bulk body. */
export interface BulkRequest {
  kind: Kind;
  enable: string[];
  disable: string[];
}

/**
 * Apply a bulk change locally (the same semantics the platform applies
 * server-side): remove `disable`, then add `enable` — so an id appearing in
 * both ends up ENABLED. Result stays sorted + deduped.
 */
export function applyBulk(doc: WhitelistDoc, req: BulkRequest): WhitelistDoc {
  const next = new Set(doc[req.kind]);
  for (const id of req.disable) next.delete(id);
  for (const id of req.enable) next.add(id);
  return { ...doc, [req.kind]: dedupeSorted([...next]) };
}

/** Bulk enable/disable of a selection (the toolbar buttons). */
export function setEnabled(
  doc: WhitelistDoc,
  kind: Kind,
  ids: readonly string[],
  enable: boolean,
): WhitelistDoc {
  return applyBulk(doc, {
    kind,
    enable: enable ? [...ids] : [],
    disable: enable ? [] : [...ids],
  });
}

/** Single-row toggle. */
export function toggleId(doc: WhitelistDoc, kind: Kind, id: string): WhitelistDoc {
  return setEnabled(doc, kind, [id], !doc[kind].includes(id));
}

// ------------------------------------------------------- starter set -------

/** Content rows per kind (what the page has loaded). */
export type ContentByKind = Record<Kind, readonly ContentRow[]>;

/** The demo starter bundle, as served by GET /curation/whitelist/starter. */
export type StarterBundle = Record<Kind, string[]>;

/**
 * Parse the platform's starter bundle.
 *
 * The bundle is SERVER-OWNED (apps/platform/internal/curation/starter.go): a
 * hand-picked, documented set of champions + items + their full five-slot
 * ability kits, guarded by TestStarterSetMatchesContentTree against the real
 * content tree. (This paragraph used to name 「12 champions + 30 items + their
 * full 60-ability kits」 — the numbers moved to 53/104/265 at tasks #138 and
 * #82 and the sentence stayed. Counts belong in the response, not the comment.)
 * The console used to compute its own first-10-by-id heuristic here; that
 * produced a different, unvetted set than the one the platform applies and the
 * one `make seed-demo` installs, so the console now previews and applies the
 * SAME bundle everything else uses.
 *
 * Tolerant on purpose: a missing/garbage field reads as an empty list rather
 * than throwing, so the page survives a half-built backend.
 */
export function normalizeStarter(raw: unknown): StarterBundle {
  if (raw === null || typeof raw !== "object") {
    return { champions: [], items: [], abilities: [] };
  }
  const outer = raw as Record<string, unknown>;
  const inner =
    outer["starter"] && typeof outer["starter"] === "object"
      ? (outer["starter"] as Record<string, unknown>)
      : outer;
  return {
    champions: stringArray(inner["champions"]),
    items: stringArray(inner["items"]),
    abilities: stringArray(inner["abilities"]),
  };
}

/** Merge a starter set into a doc — purely ADDITIVE, never disables anything. */
export function mergeStarter(doc: WhitelistDoc, starter: StarterBundle): WhitelistDoc {
  let next = doc;
  for (const kind of KINDS) next = setEnabled(next, kind, starter[kind], true);
  return next;
}

/**
 * Enable EVERY authored id — the break-glass recovery action.
 *
 * This is NOT the starter set and NOT a default: it is the "I locked myself out
 * of my own install" escape hatch, behind a confirm in the UI. It enables
 * unvetted content wholesale (placeholder heroes, untextured models, 0g items),
 * which is exactly what the whitelist exists to prevent — so it is an operator's
 * deliberate, audited choice, never something that happens on its own.
 */
export function enableAll(doc: WhitelistDoc, content: ContentByKind): WhitelistDoc {
  let next = doc;
  for (const kind of KINDS) next = setEnabled(next, kind, content[kind].map((r) => r.id), true);
  return next;
}

/** Disable everything of every kind — back to the documented empty install. */
export function disableAll(doc: WhitelistDoc): WhitelistDoc {
  return { ...doc, champions: [], items: [], abilities: [] };
}

// ------------------------------------------------- save diff + verify ------

export interface KindDiff {
  kind: Kind;
  enable: string[];
  disable: string[];
}

/** Per-kind additions/removals between the server doc and the local draft. */
export function diffDoc(server: WhitelistDoc, draft: WhitelistDoc): KindDiff[] {
  const out: KindDiff[] = [];
  for (const kind of KINDS) {
    const before = new Set(server[kind]);
    const after = new Set(draft[kind]);
    const enable = [...after].filter((id) => !before.has(id)).sort();
    const disable = [...before].filter((id) => !after.has(id)).sort();
    if (enable.length > 0 || disable.length > 0) out.push({ kind, enable, disable });
  }
  return out;
}

/** True when the draft differs from the last known server state. */
export function isDirty(server: WhitelistDoc, draft: WhitelistDoc): boolean {
  return diffDoc(server, draft).length > 0;
}

export interface VerifyMismatch {
  kind: Kind;
  /** ids we saved that did NOT come back */
  missing: string[];
  /** ids that came back but were not in what we saved */
  extra: string[];
}

export interface VerifyResult {
  ok: boolean;
  mismatches: VerifyMismatch[];
}

/**
 * Post-save verification: compare what we sent with what a fresh GET returns.
 * "Save" only reports success when this passes, so an operator never sees a
 * green tick for a write the platform silently dropped.
 */
export function verifySaved(expected: WhitelistDoc, actual: WhitelistDoc): VerifyResult {
  const mismatches: VerifyMismatch[] = [];
  for (const kind of KINDS) {
    const want = new Set(expected[kind]);
    const got = new Set(actual[kind]);
    const missing = [...want].filter((id) => !got.has(id)).sort();
    const extra = [...got].filter((id) => !want.has(id)).sort();
    if (missing.length > 0 || extra.length > 0) mismatches.push({ kind, missing, extra });
  }
  return { ok: mismatches.length === 0, mismatches };
}

/** Human-readable summary of a diff for the Save button / confirmation line. */
export function describeDiff(diffs: readonly KindDiff[]): string {
  if (diffs.length === 0) return "沒有變更";
  return diffs
    .map((d) => {
      const parts: string[] = [];
      if (d.enable.length > 0) parts.push(`+${d.enable.length}`);
      if (d.disable.length > 0) parts.push(`-${d.disable.length}`);
      return `${KIND_LABEL[d.kind]} ${parts.join(" / ")}`;
    })
    .join("、");
}
