/**
 * Editor state (Zustand): selected doc, dirty draft, inline + server (422)
 * validation errors keyed by DATA path ("effects.0.amount.flat").
 */
import { create } from "zustand";
import type { CollectionName, FieldIssue } from "@ggd/shared/content";

export type ErrorMap = Record<string, string[]>;
export type RawInputs = Record<string, { text: string; kind: "json" | "number" }>;

export interface EditorState {
  collection: CollectionName | null;
  docId: string | null;
  /** last saved version */
  original: unknown;
  /** working copy (immutable updates) */
  draft: unknown;
  dirty: boolean;
  draftKey: string | null;
  restoredDraft: boolean;
  rawInputs: RawInputs;
  serverErrors: ErrorMap;
  past: unknown[];
  future: unknown[];

  select(collection: CollectionName, docId: string, doc: unknown): void;
  restore(collection: CollectionName, docId: string, original: unknown, draft: unknown, draftKey: string, rawInputs?: RawInputs): void;
  updateRaw(dataPath: string, text: string, kind: "json" | "number"): void;
  clearSelection(): void;
  /** immutable set at a dot/data path; marks dirty */
  update(dataPath: string, value: unknown): void;
  /** replace the whole draft (JSON fallback editor) */
  replaceDraft(doc: unknown): void;
  undo(): void;
  redo(): void;
  markSaved(doc: unknown): void;
  setServerErrors(issues: FieldIssue[]): void;
  clearServerErrors(): void;
}

/** Immutable deep-set along a dot path; numeric segments index arrays. */
export function setIn(obj: unknown, dataPath: string, value: unknown): unknown {
  if (dataPath === "") return value;
  const [head, ...rest] = dataPath.split(".");
  const key = head!;
  const idx = /^\d+$/.test(key) ? Number(key) : null;
  const restPath = rest.join(".");
  if (idx !== null) {
    const arr = Array.isArray(obj) ? [...obj] : [];
    arr[idx] = rest.length === 0 ? value : setIn(arr[idx], restPath, value);
    return arr;
  }
  const rec = typeof obj === "object" && obj !== null && !Array.isArray(obj)
    ? { ...(obj as Record<string, unknown>) }
    : {};
  if (rest.length === 0 && value === undefined) {
    delete rec[key];
  } else {
    rec[key] = rest.length === 0 ? value : setIn(rec[key], restPath, value);
  }
  return rec;
}

export function getIn(obj: unknown, dataPath: string): unknown {
  if (dataPath === "") return obj;
  let cur: unknown = obj;
  for (const seg of dataPath.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function issuesToErrorMap(issues: FieldIssue[]): ErrorMap {
  const map: ErrorMap = {};
  for (const i of issues) {
    (map[i.path] ??= []).push(i.message);
  }
  return map;
}

export const useEditorStore = create<EditorState>((set) => ({
  collection: null,
  docId: null,
  original: null,
  draft: null,
  dirty: false,
  draftKey: null,
  restoredDraft: false,
  rawInputs: {},
  serverErrors: {},
  past: [],
  future: [],

  select: (collection, docId, doc) =>
    set({ collection, docId, original: doc, draft: doc, draftKey: `document/${collection}/${docId}`, restoredDraft: false, rawInputs: {}, dirty: false, serverErrors: {}, past: [], future: [] }),
  restore: (collection, docId, original, draft, draftKey, rawInputs = {}) =>
    set({ collection, docId, original, draft, draftKey, rawInputs, restoredDraft: true, dirty: !sameJson(original, draft) || Object.keys(rawInputs).length > 0, serverErrors: {}, past: [], future: [] }),
  updateRaw: (dataPath, text, kind) => set((s) => ({ rawInputs: { ...s.rawInputs, [dataPath]: { text, kind } }, dirty: true })),
  clearSelection: () =>
    set({ collection: null, docId: null, original: null, draft: null, draftKey: null, restoredDraft: false, rawInputs: {}, dirty: false, serverErrors: {}, past: [], future: [] }),
  update: (dataPath, value) =>
    set((s) => pushDraft(s, setIn(s.draft, dataPath, value))),
  replaceDraft: (doc) => set((s) => pushDraft(s, doc)),
  undo: () => set((s) => {
    if (s.past.length === 0) return s;
    const draft = s.past[s.past.length - 1];
    return {
      draft,
      rawInputs: {},
      past: s.past.slice(0, -1),
      future: [s.draft, ...s.future].slice(0, HISTORY_LIMIT),
      dirty: !sameJson(draft, s.original),
      serverErrors: {},
    };
  }),
  redo: () => set((s) => {
    if (s.future.length === 0) return s;
    const draft = s.future[0];
    return {
      draft,
      rawInputs: {},
      past: [...s.past, s.draft].slice(-HISTORY_LIMIT),
      future: s.future.slice(1),
      dirty: !sameJson(draft, s.original),
      serverErrors: {},
    };
  }),
  markSaved: (doc) => set({ original: doc, draft: doc, dirty: false, serverErrors: {} }),
  setServerErrors: (issues) => set({ serverErrors: issuesToErrorMap(issues) }),
  clearServerErrors: () => set({ serverErrors: {} }),
}));

const HISTORY_LIMIT = 100;

function sameJson(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

function pushDraft(
  state: Pick<EditorState, "draft" | "original" | "past" | "future">,
  draft: unknown,
): Pick<EditorState, "draft" | "dirty" | "past" | "future" | "serverErrors"> {
  if (sameJson(state.draft, draft)) {
    return { draft: state.draft, dirty: !sameJson(state.draft, state.original), past: state.past, future: state.future, serverErrors: {} };
  }
  return {
    draft,
    dirty: !sameJson(draft, state.original),
    past: [...state.past, state.draft].slice(-HISTORY_LIMIT),
    future: [],
    serverErrors: {},
  };
}
