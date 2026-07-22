/** In-memory holder for one fully-parsed content set. */
import { COLLECTION_NAMES, type CollectionName } from "./schema/index";

export class ContentStore {
  private readonly cols = new Map<CollectionName, Map<string, unknown>>();

  constructor() {
    for (const c of COLLECTION_NAMES) this.cols.set(c, new Map());
  }

  add(collection: CollectionName, id: string, doc: unknown): void {
    this.cols.get(collection)!.set(id, doc);
  }

  has(collection: CollectionName, id: string): boolean {
    return this.cols.get(collection)!.has(id);
  }

  get<T = unknown>(collection: CollectionName, id: string): T {
    const doc = this.cols.get(collection)!.get(id);
    if (doc === undefined) throw new Error(`content store: missing ${collection}/${id}`);
    return doc as T;
  }

  tryGet<T = unknown>(collection: CollectionName, id: string): T | undefined {
    return this.cols.get(collection)!.get(id) as T | undefined;
  }

  all<T = unknown>(collection: CollectionName): T[] {
    return [...this.cols.get(collection)!.values()] as T[];
  }

  ids(collection: CollectionName): string[] {
    return [...this.cols.get(collection)!.keys()];
  }

  count(collection: CollectionName): number {
    return this.cols.get(collection)!.size;
  }

  totalCount(): number {
    let n = 0;
    for (const m of this.cols.values()) n += m.size;
    return n;
  }
}
