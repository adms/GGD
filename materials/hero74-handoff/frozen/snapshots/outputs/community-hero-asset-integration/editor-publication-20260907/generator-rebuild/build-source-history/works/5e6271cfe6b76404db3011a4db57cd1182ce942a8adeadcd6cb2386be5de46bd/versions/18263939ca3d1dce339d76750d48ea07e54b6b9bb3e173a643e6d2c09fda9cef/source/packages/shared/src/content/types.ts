/** Wire shapes for indexes/manifest + the pluggable ContentSource seam. */
import type { CollectionName } from "./schema/index";

export interface IndexEntry {
  id: string;
  /** path relative to the content root, e.g. "champions/sela.json" */
  path: string;
  /** 12-hex object content hash */
  hash: string;
  /** on-disk file size in bytes (progress UI) */
  size: number;
}

export interface CollectionIndex {
  collection: CollectionName;
  /** 12-hex collection hash (pure function of member {id, hash}) */
  hash: string;
  entries: IndexEntry[];
}

export interface ManifestCollection {
  hash: string;
  count: number;
  /** path of the collection index relative to the content root */
  path: string;
}

export interface Manifest {
  /** "cv_<12 hex>" — pure function of all content */
  contentVersion: string;
  collections: Partial<Record<CollectionName, ManifestCollection>>;
}

/**
 * Pluggable content transport: FsContentSource (node, server/scripts) and
 * HttpContentSource (fetch, client/editor) implement the same three reads.
 */
export interface ContentSource {
  readManifest(): Promise<Manifest>;
  readIndex(collection: CollectionName): Promise<CollectionIndex>;
  readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown>;
}
