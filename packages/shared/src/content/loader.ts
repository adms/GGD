/**
 * ContentLoader — readManifest → per-collection _index → objects →
 * schema.parse → ContentStore → validateReferences. Call `registerAll(store)`
 * afterwards to populate the registries. Transport is pluggable
 * (FsContentSource on the server, HttpContentSource in the browser).
 */
import { ZodError } from "zod";
import {
  ContentError,
  ContentLoadError,
  ManifestError,
  SchemaValidationError,
  zodIssues,
  type FieldIssue,
} from "./errors";
import { validateReferences } from "./refs";
import { COLLECTIONS, isCollectionName, type CollectionName } from "./schema/index";
import { ContentStore } from "./store";
import type { ContentSource, Manifest } from "./types";
import type { DanglingRefError } from "./errors";

export interface LoadResult {
  store: ContentStore;
  manifest: Manifest;
  /** dangling SOFT refs (vfx / status-effects not authored yet) */
  warnings: DanglingRefError[];
}

export class ContentLoader {
  constructor(private readonly source: ContentSource) {}

  /** Full load. Throws ContentLoadError if any doc is invalid or a hard ref dangles. */
  async load(): Promise<LoadResult> {
    const manifest = await this.source.readManifest();
    if (typeof manifest?.contentVersion !== "string" || !manifest.collections) {
      throw new ManifestError("manifest.json is malformed (contentVersion/collections missing)");
    }

    const store = new ContentStore();
    const errors: ContentError[] = [];

    for (const name of Object.keys(manifest.collections)) {
      if (!isCollectionName(name)) {
        errors.push(new ManifestError(`manifest lists unknown collection "${name}"`));
        continue;
      }
      const spec = COLLECTIONS[name];
      const index = await this.source.readIndex(name);
      for (const entry of index.entries) {
        let raw: unknown;
        try {
          raw = await this.source.readObject(name, entry);
        } catch (e) {
          errors.push(new ContentError(`${name}/${entry.id}: read failed — ${String(e)}`));
          continue;
        }
        try {
          const doc = spec.schema.parse(raw) as { id: string; schema: string };
          if (doc.id !== entry.id) {
            errors.push(
              new SchemaValidationError(name, entry.id, [
                idMismatchIssue(doc.id, entry.id),
              ]),
            );
            continue;
          }
          store.add(name, doc.id, doc);
        } catch (e) {
          if (e instanceof ZodError) {
            errors.push(new SchemaValidationError(name, entry.id, zodIssues(e)));
          } else {
            throw e;
          }
        }
      }
    }

    const refs = validateReferences(store);
    errors.push(...refs.errors);

    if (errors.length > 0) throw new ContentLoadError(errors);
    return { store, manifest, warnings: refs.warnings };
  }
}

function idMismatchIssue(docId: string, entryId: string): FieldIssue {
  return {
    path: "id",
    message: `doc id "${docId}" does not match index/filename id "${entryId}"`,
    code: "custom",
  };
}

/** Validate one raw doc against its collection schema (editor/content-api dry-run). */
export function validateDoc(
  collection: CollectionName,
  raw: unknown,
): { ok: true; doc: unknown } | { ok: false; issues: FieldIssue[] } {
  const res = COLLECTIONS[collection].schema.safeParse(raw);
  if (res.success) return { ok: true, doc: res.data };
  return { ok: false, issues: zodIssues(res.error) };
}
