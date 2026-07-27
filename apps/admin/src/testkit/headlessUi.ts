/**
 * A DOM-free, INTERACTIVE renderer for React function components.
 *
 * WHY THIS EXISTS. The console's vitest runs in plain node — there is no jsdom
 * in this monorepo — so the only thing a UI test could do until now was
 * `renderToString`, i.e. look at the FIRST PAINT. That is enough to prove a
 * control exists and hopeless at proving it DOES anything: SSR drops every
 * handler, so `onSave` is never entered and a page that saves the shipped
 * defaults over the operator's edits renders byte-identical HTML. That exact
 * mutation survived the 殭屍波系統 suite, because the only guard on the write was
 * a regex over the page's own source text.
 *
 * WHAT THIS IS. ~200 lines of the parts of React a form page uses: hook state
 * that survives re-renders, effects that run after commit, and a synchronous
 * re-render whenever a setter changes a value. It renders function components
 * into a plain tree of `{ type, props, children }` HOST nodes, so a test can
 * find `data-field="mob.baseHp"`, invoke its real `onChange`, click the real
 * Save button, and then assert on WHAT THE PAGE SENT — behaviour, not source.
 *
 * HOW IT IS WIRED. The hooks live in `hookImpls` and a test installs them with
 *
 *   vi.mock("react", async () => {
 *     const actual = await vi.importActual<typeof import("react")>("react");
 *     const { hookImpls } = await import("./testkit/headlessUi");
 *     return { ...actual, ...hookImpls };
 *   });
 *
 * — element creation stays REAL (`react/jsx-runtime` is untouched), only the
 * hook dispatcher is ours. No React internals are reached into, so this does not
 * break when React's private fields are renamed.
 *
 * WHAT IT IS NOT. Not a reconciler: no keys-based list diffing (hook state is
 * keyed by tree position + element key), no concurrent features, no context,
 * no portals, no class components. It is for testing forms. Anything it meets
 * and does not understand throws loudly rather than silently rendering nothing —
 * a harness that quietly returns an empty tree would manufacture exactly the
 * false green this file exists to prevent.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Props = Record<string, unknown>;

/** A rendered host element: `<div>`, `<input>`, `<select>`… */
export interface HostNode {
  type: string;
  props: Props;
  children: RenderedNode[];
}

export type RenderedNode = HostNode | string;

// ------------------------------------------------------------------ hooks ---

interface StateSlot {
  kind: "state";
  value: unknown;
}
interface MemoSlot {
  kind: "memo";
  deps: readonly unknown[] | undefined;
  value: unknown;
}
interface EffectSlot {
  kind: "effect";
  deps: readonly unknown[] | undefined;
  cleanup: (() => void) | undefined;
}
interface RefSlot {
  kind: "ref";
  ref: { current: unknown };
}
type Slot = StateSlot | MemoSlot | EffectSlot | RefSlot;

interface Instance {
  hooks: Slot[];
}

const instances = new Map<string, Instance>();
let current: Instance | null = null;
let cursor = 0;
let depth = 0;
let dirty = false;
const pendingEffects: Array<() => void> = [];

let rootElement: unknown = null;
let tree: RenderedNode[] = [];

function need(): Instance {
  if (!current) throw new Error("hook called outside a component render");
  return current;
}

function sameDeps(a: readonly unknown[] | undefined, b: readonly unknown[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

function useState<S>(initial: S | (() => S)): [S, (v: S | ((prev: S) => S)) => void] {
  const inst = need();
  const i = cursor++;
  let slot = inst.hooks[i] as StateSlot | undefined;
  if (!slot) {
    slot = {
      kind: "state",
      value: typeof initial === "function" ? (initial as () => S)() : initial,
    };
    inst.hooks[i] = slot;
  }
  const held = slot;
  const set = (v: S | ((prev: S) => S)): void => {
    const next = typeof v === "function" ? (v as (prev: S) => S)(held.value as S) : v;
    if (Object.is(next, held.value)) return;
    held.value = next;
    schedule();
  };
  return [held.value as S, set];
}

function useEffect(create: () => void | (() => void), deps?: readonly unknown[]): void {
  const inst = need();
  const i = cursor++;
  const prev = inst.hooks[i] as EffectSlot | undefined;
  if (prev && prev.kind === "effect" && sameDeps(prev.deps, deps)) return;
  const slot: EffectSlot = { kind: "effect", deps, cleanup: undefined };
  inst.hooks[i] = slot;
  pendingEffects.push(() => {
    if (prev?.cleanup) prev.cleanup();
    const out = create();
    slot.cleanup = typeof out === "function" ? out : undefined;
  });
}

function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const inst = need();
  const i = cursor++;
  const prev = inst.hooks[i] as MemoSlot | undefined;
  if (prev && prev.kind === "memo" && sameDeps(prev.deps, deps)) return prev.value as T;
  const value = factory();
  inst.hooks[i] = { kind: "memo", deps, value };
  return value;
}

function useCallback<T>(fn: T, deps?: readonly unknown[]): T {
  return useMemo(() => fn, deps);
}

function useRef<T>(initial: T): { current: T } {
  const inst = need();
  const i = cursor++;
  let slot = inst.hooks[i] as RefSlot | undefined;
  if (!slot) {
    slot = { kind: "ref", ref: { current: initial } };
    inst.hooks[i] = slot;
  }
  return slot.ref as { current: T };
}

/** The hook set a test installs over the real `react` module. */
export const hookImpls = {
  useState,
  useEffect,
  useLayoutEffect: useEffect,
  useInsertionEffect: useEffect,
  useMemo,
  useCallback,
  useRef,
};

// ----------------------------------------------------------------- render ---

const FRAGMENT = Symbol.for("react.fragment");

function isElement(v: unknown): v is { type: unknown; key: string | null; props: Props } {
  return typeof v === "object" && v !== null && "type" in v && "props" in v;
}

function componentName(type: unknown): string {
  const fn = type as { displayName?: string; name?: string };
  return fn.displayName ?? fn.name ?? "anonymous";
}

function renderNode(node: unknown, path: string): RenderedNode[] {
  if (node === null || node === undefined || typeof node === "boolean") return [];
  if (typeof node === "string") return node === "" ? [] : [node];
  if (typeof node === "number") return [String(node)];
  if (Array.isArray(node)) {
    const out: RenderedNode[] = [];
    node.forEach((child, i) => out.push(...renderNode(child, `${path}[${i}]`)));
    return out;
  }
  if (!isElement(node)) {
    throw new Error(`headlessUi: cannot render ${Object.prototype.toString.call(node)} at ${path}`);
  }
  const { type, props, key } = node;
  const at = `${path}<${key ?? ""}`;
  if (type === FRAGMENT) return renderNode(props["children"], `${at}#frag`);
  if (typeof type === "string") {
    return [{ type, props, children: renderNode(props["children"], `${at}#${type}`) }];
  }
  if (typeof type !== "function") {
    throw new Error(`headlessUi: unsupported element type ${String(type)} at ${path}`);
  }
  const id = `${at}#${componentName(type)}`;
  let inst = instances.get(id);
  if (!inst) {
    inst = { hooks: [] };
    instances.set(id, inst);
  }
  const outerInst = current;
  const outerCursor = cursor;
  current = inst;
  cursor = 0;
  let out: unknown;
  try {
    out = (type as (p: Props) => unknown)(props);
  } finally {
    current = outerInst;
    cursor = outerCursor;
  }
  return renderNode(out, id);
}

function renderPass(): void {
  depth++;
  try {
    tree = renderNode(rootElement, "root");
  } finally {
    depth--;
  }
}

/** A state setter fired: re-render synchronously unless one is already running. */
function schedule(): void {
  dirty = true;
  if (depth > 0) return;
  settle();
}

/** Render + run effects until nothing else is pending. */
function settle(): void {
  let guard = 0;
  while (dirty || pendingEffects.length > 0) {
    if (guard++ > 100) throw new Error("headlessUi: render never settled (effect loop?)");
    if (dirty) {
      dirty = false;
      renderPass();
    }
    const queued = pendingEffects.splice(0, pendingEffects.length);
    depth++;
    try {
      for (const run of queued) run();
    } finally {
      depth--;
    }
  }
}

// ---------------------------------------------------------------- queries ---

function walk(nodes: readonly RenderedNode[], visit: (n: HostNode) => void): void {
  for (const n of nodes) {
    if (typeof n === "string") continue;
    visit(n);
    walk(n.children, visit);
  }
}

/** All text a user would read, concatenated depth-first. */
export function textOf(nodes: readonly RenderedNode[]): string {
  let out = "";
  for (const n of nodes) {
    if (typeof n === "string") out += n;
    else out += textOf(n.children);
  }
  return out;
}

export interface Harness {
  /** the rendered host tree */
  nodes(): RenderedNode[];
  /** every host node, depth-first */
  hosts(): HostNode[];
  /** all visible text */
  text(): string;
  /** the control carrying `data-field="<name>"`; throws when there is none */
  field(name: string): HostNode;
  fieldOrNull(name: string): HostNode | null;
  /** type a value into a control (its real onChange, with a real-shaped event) */
  type(name: string, value: string): void;
  /** press the button whose text is exactly `label` */
  click(label: string): void;
  /** let promises resolve, then re-render/flush effects */
  flush(): Promise<void>;
}

/** Render `element` and return a handle for driving it. */
export function mount(element: unknown): Harness {
  instances.clear();
  pendingEffects.length = 0;
  current = null;
  cursor = 0;
  depth = 0;
  dirty = false;
  rootElement = element;
  renderPass();
  settle();

  const hosts = (): HostNode[] => {
    const out: HostNode[] = [];
    walk(tree, (n) => out.push(n));
    return out;
  };
  const fieldOrNull = (name: string): HostNode | null =>
    hosts().find((n) => n.props["data-field"] === name) ?? null;
  const field = (name: string): HostNode => {
    const hit = fieldOrNull(name);
    if (!hit) throw new Error(`no control carries data-field="${name}"`);
    return hit;
  };

  return {
    nodes: () => tree,
    hosts,
    text: () => textOf(tree),
    fieldOrNull,
    field,
    type(name, value) {
      const node = field(name);
      const onChange = node.props["onChange"];
      if (typeof onChange !== "function") {
        throw new Error(`control data-field="${name}" has no onChange — it cannot be edited`);
      }
      if (node.props["disabled"] === true) {
        throw new Error(`control data-field="${name}" is disabled`);
      }
      (onChange as (e: unknown) => void)({ target: { value }, currentTarget: { value } });
      settle();
    },
    click(label) {
      const hit = hosts().find((n) => n.type === "button" && textOf(n.children).trim() === label);
      if (!hit) throw new Error(`no button reads "${label}"`);
      if (hit.props["disabled"] === true) throw new Error(`button "${label}" is disabled`);
      const onClick = hit.props["onClick"];
      if (typeof onClick !== "function") throw new Error(`button "${label}" has no onClick`);
      (onClick as () => void)();
      settle();
    },
    async flush() {
      for (let i = 0; i < 8; i++) {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 0));
        settle();
      }
    },
  };
}

/** `<option>` values of a `<select>`, in order. */
export function optionValues(select: HostNode): string[] {
  const out: string[] = [];
  walk(select.children, (n) => {
    if (n.type === "option") out.push(String(n.props["value"] ?? ""));
  });
  return out;
}

/** `<option>` labels of a `<select>`, in order. */
export function optionLabels(select: HostNode): string[] {
  const out: string[] = [];
  walk(select.children, (n) => {
    if (n.type === "option") out.push(textOf(n.children));
  });
  return out;
}
