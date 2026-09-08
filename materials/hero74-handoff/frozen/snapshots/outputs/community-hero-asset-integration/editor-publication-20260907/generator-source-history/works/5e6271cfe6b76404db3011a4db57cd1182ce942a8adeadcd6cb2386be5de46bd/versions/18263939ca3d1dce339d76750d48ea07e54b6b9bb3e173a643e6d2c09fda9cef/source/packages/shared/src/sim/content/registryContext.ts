/**
 * Immutable content lookup contexts. Registry objects keep their existing API;
 * a host chooses the context for each execution without replacing global data.
 */
export interface RegistryContext { readonly id: string }
type Table = Map<string, unknown>;
type ContextData = { tables: Map<string, Table>; sealed: boolean };
const contexts = new WeakMap<RegistryContext, ContextData>();
const roots = new Map<string, Table>();
let synchronousContext: RegistryContext | null = null;
let hostContext: (() => RegistryContext | undefined) | null = null;

/** Node hosts supply AsyncLocalStorage.getStore; browser hosts need no Node API. */
export function installRegistryContextProvider(provider: () => RegistryContext | undefined): () => void {
  if (hostContext) throw new Error("a registry context provider is already installed");
  hostContext = provider;
  return () => { if (hostContext === provider) hostContext = null; };
}

function activeData(): ContextData | undefined {
  const context = activeRegistryContext();
  if (!context) return undefined;
  const data = contexts.get(context);
  if (!data) throw new Error("unknown content registry context");
  return data;
}

export function activeRegistryContext(): RegistryContext | undefined { return synchronousContext ?? hostContext?.(); }

function immutableCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const seen = new WeakSet<object>();
  const freeze = (entry: unknown): void => {
    if (!entry || typeof entry !== "object" || seen.has(entry)) return;
    const prototype = Object.getPrototypeOf(entry);
    if (!Array.isArray(entry) && prototype !== Object.prototype && prototype !== null) throw new Error("immutable runtime content must contain plain data");
    seen.add(entry); Object.values(entry).forEach(freeze); Object.freeze(entry);
  };
  freeze(copy); return copy;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value !== null && (typeof value === "object" || typeof value === "function") && "then" in value && typeof value.then === "function";
}

/** Internal storage used by both simulation and presentation registries. */
export class ContextualRegistryMap<K extends string, V> {
  private readonly root = new Map<K, V>();
  constructor(private readonly name: string) {
    if (roots.has(name)) throw new Error(`duplicate content registry: ${name}`);
    roots.set(name, this.root as Table);
  }
  private read(): Map<K, V> {
    const data = activeData();
    if (!data) return this.root;
    const table = data.tables.get(this.name);
    if (!table) throw new Error(`content context is missing registry: ${this.name}`);
    return table as Map<K, V>;
  }
  private write(): Map<K, V> {
    if (activeData()?.sealed) throw new Error(`immutable content context: ${this.name}`);
    return this.read();
  }
  get(key: K): V | undefined { return this.read().get(key); }
  set(key: K, value: V): void { this.write().set(key, value); }
  clear(): void { this.write().clear(); }
  values(): IterableIterator<V> { return this.read().values(); }
  keys(): IterableIterator<K> { return this.read().keys(); }
}

/** Capture the complete current official content after boot registration. */
export function captureRegistryContext(id: string): RegistryContext {
  const tables = activeData()?.tables ?? roots;
  const snapshot = Object.freeze({ id });
  contexts.set(snapshot, { sealed: true, tables: new Map([...tables].map(([name, table]) => [name, new Map([...table].map(([key, value]) => [key, immutableCopy(value)]))])) });
  return snapshot;
}

/** A full reload starts empty, regardless of registries left by another host. */
export function emptyRegistryContext(id: string): RegistryContext {
  const snapshot = Object.freeze({ id });
  contexts.set(snapshot, { sealed: true, tables: new Map([...roots.keys()].map((name) => [name, new Map()])) });
  return snapshot;
}

/** Use the existing registerAll seam to construct a new isolated snapshot. */
export function extendRegistryContext(base: RegistryContext, id: string, register: () => void): RegistryContext {
  const original = contexts.get(base);
  if (!original?.sealed) throw new Error("base content context must be immutable");
  if (register.constructor.name === "AsyncFunction") throw new Error("content registration must be synchronous");
  const snapshot = Object.freeze({ id });
  const tables = new Map([...original.tables].map(([name, table]) => [name, new Map(table)]));
  const data = { tables, sealed: false }; contexts.set(snapshot, data);
  const prior = synchronousContext; synchronousContext = snapshot;
  try {
    const result: unknown = register();
    if (isThenable(result)) throw new Error("content registration must be synchronous");
    for (const [name, table] of tables) {
      const baseTable = original.tables.get(name);
      for (const [key, value] of table) if (baseTable?.get(key) !== value) table.set(key, immutableCopy(value));
    }
    data.sealed = true; return snapshot;
  } catch (error) { contexts.delete(snapshot); throw error; }
  finally { synchronousContext = prior; }
}

/** Synchronous clients/replayers can scope one frame without a global reload. */
export function withRegistryContext<T>(context: RegistryContext, run: () => T): T {
  if (!contexts.get(context)?.sealed) throw new Error("content context must be immutable");
  if (run.constructor.name === "AsyncFunction") throw new Error("use the host context provider for asynchronous execution");
  const prior = synchronousContext; synchronousContext = context;
  try {
    const result = run();
    if (isThenable(result)) throw new Error("use the host context provider for asynchronous execution");
    return result;
  } finally { synchronousContext = prior; }
}
