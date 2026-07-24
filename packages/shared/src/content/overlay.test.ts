/**
 * content-overlay-merge (task #189): the pure overlay merge that lays the
 * durable data/ overlay over the shipped content tree. No fs/clock/network —
 * a fake base ContentSource drives every case.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { hashDoc, hashCollection, contentVersion } from "./hash";
import type { CollectionName } from "./schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "./types";
import {
  OverlayContentSource,
  emptyOverlayBundle,
  isOverlayEmpty,
  splitOverlayKey,
  type OverlayBundle,
} from "./overlay";

// A tiny in-memory base with two collections. Docs are opaque objects; the
// merge never validates them (the loader's Zod does).
function fakeBase(): ContentSource {
  const docs: Record<string, Record<string, unknown>> = {
    "champions/a": { id: "a", name: "Aaa" },
    "champions/b": { id: "b", name: "Bbb" },
    "items/sword": { id: "sword", tier: 1 },
  };
  const byCollection: Record<string, string[]> = {
    champions: ["a", "b"],
    items: ["sword"],
  };
  const index = (collection: string): CollectionIndex => {
    const entries: IndexEntry[] = byCollection[collection]!.map((id) => {
      const doc = docs[`${collection}/${id}`]!;
      return { id, path: `${collection}/${id}.json`, hash: hashDoc(doc), size: 1 };
    });
    return {
      collection: collection as CollectionName,
      hash: hashCollection(entries.map((e) => ({ id: e.id, hash: e.hash }))),
      entries,
    };
  };
  return {
    async readManifest(): Promise<Manifest> {
      const hashes: Record<string, string> = {};
      const collections: Manifest["collections"] = {};
      for (const c of Object.keys(byCollection)) {
        const idx = index(c);
        hashes[c] = idx.hash;
        collections[c as CollectionName] = { hash: idx.hash, count: idx.entries.length, path: `${c}/_index.json` };
      }
      return { contentVersion: contentVersion(hashes), collections };
    },
    async readIndex(collection: CollectionName): Promise<CollectionIndex> {
      if (!byCollection[collection]) throw new Error(`no such collection ${collection}`);
      return index(collection);
    },
    async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
      const d = docs[`${collection}/${entry.id}`];
      if (!d) throw new Error(`no ${collection}/${entry.id}`);
      return d;
    },
  };
}

describe("overlay bundle helpers", () => {
  it("recognises the empty overlay as the identity", () => {
    cover("content-overlay-merge");
    expect(isOverlayEmpty(emptyOverlayBundle())).toBe(true);
    expect(isOverlayEmpty(null)).toBe(true);
    expect(isOverlayEmpty({ generation: 3, docs: { "champions/a": {} }, deleted: {} })).toBe(false);
    expect(splitOverlayKey("champions/godie-e001.ex")).toEqual({ collection: "champions", id: "godie-e001.ex" });
    expect(splitOverlayKey("nope")).toBeNull();
  });
});

describe("OverlayContentSource", () => {
  it("an EMPTY overlay is a pure passthrough — manifest + cv unchanged", async () => {
    cover("content-overlay-merge");
    const base = fakeBase();
    const src = new OverlayContentSource(base, emptyOverlayBundle());
    expect(await src.readManifest()).toEqual(await base.readManifest());
    expect(await src.readIndex("champions" as CollectionName)).toEqual(
      await base.readIndex("champions" as CollectionName),
    );
  });

  it("EDIT: replaces the doc, re-hashes its index entry, and moves the cv", async () => {
    cover("content-overlay-merge");
    const base = fakeBase();
    const edited = { id: "a", name: "改過的" };
    const overlay: OverlayBundle = { generation: 1, docs: { "champions/a": edited }, deleted: {} };
    const src = new OverlayContentSource(base, overlay);

    // readObject returns the overlay doc
    const idx = await src.readIndex("champions" as CollectionName);
    const entryA = idx.entries.find((e) => e.id === "a")!;
    expect(await src.readObject("champions" as CollectionName, entryA)).toEqual(edited);
    // its hash reflects the new content
    expect(entryA.hash).toBe(hashDoc(edited));
    // the untouched doc is unchanged
    expect(idx.entries.find((e) => e.id === "b")!.hash).toBe(hashDoc({ id: "b", name: "Bbb" }));
    // the manifest cv changed vs base
    const baseCv = (await base.readManifest()).contentVersion;
    const mergedCv = (await src.readManifest()).contentVersion;
    expect(mergedCv).not.toBe(baseCv);
    expect(mergedCv).toMatch(/^cv_[0-9a-f]{12}$/);
  });

  it("ADD: an overlay-only doc appears in the index and is readable", async () => {
    cover("content-overlay-merge");
    const base = fakeBase();
    const added = { id: "c", name: "新英雄" };
    const src = new OverlayContentSource(base, { generation: 1, docs: { "champions/c": added }, deleted: {} });
    const idx = await src.readIndex("champions" as CollectionName);
    expect(idx.entries.map((e) => e.id)).toEqual(["a", "b", "c"]); // sorted
    const entryC = idx.entries.find((e) => e.id === "c")!;
    expect(await src.readObject("champions" as CollectionName, entryC)).toEqual(added);
    expect((await src.readManifest()).collections.champions!.count).toBe(3);
  });

  it("DELETE: a tombstoned doc leaves the merged index entirely", async () => {
    cover("content-overlay-merge");
    const base = fakeBase();
    const src = new OverlayContentSource(base, { generation: 1, docs: {}, deleted: { "champions/b": true } });
    const idx = await src.readIndex("champions" as CollectionName);
    expect(idx.entries.map((e) => e.id)).toEqual(["a"]);
    expect((await src.readManifest()).collections.champions!.count).toBe(1);
  });

  it("is deterministic: the same overlay yields the same merged cv", async () => {
    cover("content-overlay-merge");
    const overlay: OverlayBundle = {
      generation: 7,
      docs: { "champions/a": { id: "a", name: "X" }, "items/sword": { id: "sword", tier: 2 } },
      deleted: { "champions/b": true },
    };
    const cv1 = (await new OverlayContentSource(fakeBase(), overlay).readManifest()).contentVersion;
    // a DIFFERENT generation but identical content merges to the same cv
    const cv2 = (
      await new OverlayContentSource(fakeBase(), { ...overlay, generation: 99 }).readManifest()
    ).contentVersion;
    expect(cv1).toBe(cv2);
  });
});
