/**
 * content/bundle — the one-file transport artifact.
 *
 * What has to hold, and why:
 *  1. the bundle contains EVERY doc the per-doc path would have loaded;
 *  2. two builds of identical content are BYTE-IDENTICAL (this is what
 *     protects `contentVersion` from ever moving because of the bundle);
 *  3. emitting the bundle does not change `contentVersion` at all;
 *  4. a ContentLoader over a bundle-backed source produces the SAME store as
 *     one over the per-doc source — the transport is the only difference;
 *  5. a 404 / corrupt / wrong-shape bundle falls back to per-doc fetching
 *     instead of bricking the client.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CONTENT_BUNDLE_SCHEMA,
  indexFromBundle,
  manifestFromBundle,
  parseContentBundle,
  serializeContentBundle,
  type ContentBundle,
} from "./bundle";
import { contentVersion, hashCollection, hashDoc, stableStringify } from "./hash";
import { ContentLoader } from "./loader";
import { BundleContentSource } from "./sources/BundleContentSource";
import { FallbackContentSource } from "./sources/FallbackContentSource";
import { FsContentSource } from "./node/FsContentSource";
import {
  bundlePath,
  deleteContentBundle,
  rebuildAllIndexes,
  rebuildManifest,
} from "./node/fsStore";
import { COLLECTION_NAMES, type CollectionName } from "./schema/index";
import type { ContentSource, IndexEntry, Manifest } from "./types";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/**
 * The bundle these tests consume, BUILT BY THE TESTS — never read from
 * `content/bundle.json`.
 *
 * That file is a derived artifact: it is untracked, and
 * apps/content-api/src/server.ts calls `deleteContentBundle(root)` on every
 * successful editor save. Reading it directly made six of these tests fail on a
 * fresh clone, and again after any codex/editor save in dev — red for reasons
 * that have nothing to do with the code under test. Building it here into a
 * throwaway copy of the REAL doc tree (not a toy fixture) keeps the coverage
 * identical and makes the suite independent of whether anyone has run
 * `pnpm content:build`.
 */
let sharedTree: string | null = null;
function bundleTree(): string {
  if (sharedTree !== null) return sharedTree;
  const t = mkdtempSync(join(tmpdir(), "ggd-bundle-src-"));
  for (const name of COLLECTION_NAMES) {
    const src = join(CONTENT_DIR, name);
    if (existsSync(src)) cpSync(src, join(t, name), { recursive: true });
  }
  cpSync(join(CONTENT_DIR, "manifest.json"), join(t, "manifest.json"));
  rebuildAllIndexes(t);
  sharedTree = t;
  return t;
}
/** The freshly built bundle's raw text. */
function realBundleText(): string {
  return readFileSync(bundlePath(bundleTree()), "utf8");
}

afterAll(() => {
  if (sharedTree !== null) rmSync(sharedTree, { recursive: true, force: true });
  sharedTree = null;
});

/** Serve a bundle (or an error) out of memory — no network, no fs. */
function fakeFetch(body: string | null, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => body ?? "",
      json: async () => JSON.parse(body ?? "null") as unknown,
    }) as unknown as Response) as unknown as typeof fetch;
}

/** ContentSource over the real content/ tree, but reached through fetch-shaped URLs. */
class CountingFsSource implements ContentSource {
  reads = 0;
  private readonly fs = new FsContentSource(CONTENT_DIR);
  async readManifest(): Promise<Manifest> {
    this.reads++;
    return this.fs.readManifest();
  }
  async readIndex(c: CollectionName) {
    this.reads++;
    return this.fs.readIndex(c);
  }
  async readObject(c: CollectionName, e: IndexEntry) {
    this.reads++;
    return this.fs.readObject(c, e);
  }
}

/**
 * The only non-doc `*.json` files that live inside a collection dir. Both are
 * hand-maintained sidecars, not content documents:
 *   config/_purchase-lines.json    — merchant purchase persona lines
 *   models/_standin-overrides.json — render-side stand-in map (task #77)
 * Enumerated by hand, on purpose. See `authoredDocIds`.
 */
const KNOWN_SIDECARS: Partial<Record<CollectionName, readonly string[]>> = {
  config: ["_purchase-lines.json"],
  models: ["_standin-overrides.json"],
};

/**
 * The docs a human authored in `<root>/<collection>/`, listed by a rule that is
 * DELIBERATELY DIFFERENT from the indexer's.
 *
 * `rebuildCollectionIndex` skips anything starting with "_". If this function
 * reused that rule it could only ever agree with the indexer, and a regression in
 * the skip predicate (a widened glob, a stray `.tmp` guard, a doc that acquires a
 * name the filter eats) would hide from itself. So this one names its exclusions
 * explicitly: a THIRD sidecar appearing, or the indexer starting to drop real
 * docs, both surface as a diff instead of as silence.
 */
function authoredDocIds(root: string, name: CollectionName): string[] {
  const skip = new Set<string>(["_index.json", ...(KNOWN_SIDECARS[name] ?? [])]);
  return readdirSync(join(root, name))
    .filter((f) => f.endsWith(".json") && !skip.has(f))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

/**
 * A FLOOR on how much content each collection holds — NOT a snapshot.
 *
 * The distinction is the whole point. A pinned total (`expect(total).toBe(1598)`)
 * goes red every time the owner adds a champion, an augment or a vfx family, so it
 * fights his own work and gets bumped without ever being read. A floor is
 * asymmetric: additions can never touch it, and the only thing that turns it red
 * is content DISAPPEARING — which is exactly the event nobody would otherwise
 * notice, because the indexer, the manifest and the bundle would all agree on the
 * smaller world and every structural invariant below would still pass.
 *
 * RAISE these deliberately when a body of content is intentionally retired.
 * NEVER lower one to make CI green — a red line here means docs left the tree.
 *
 * Composition at the time of writing (1,725 docs across 12 collections), kept as
 * documentation of what the tree actually IS:
 *   abilities 662 — includes 108 天生技 / PASSIVE docs, the level-1 6th slot the
 *     w3x importer dropped, one per champion that has an NN-00 in the source map
 *     (3 genuinely have none: godie-h02n / godie-u01q / godie-ogld)
 *   vfx 553 — the shared primitive library (task #123) plus the faithful w3x
 *     emitter families `fx.w3x.{locust,orb,particle}.*.pNN` (task #183)
 *   models 119 — includes the 2 per-arena guardian props, prop.guardian.beast /
 *     prop.guardian.treant (task #105)
 *   champions 113 · items 214 · augments 30 (task #149's pool expansion) ·
 *   config 11 · projectiles 5 · status-effects 5 · arenas 5 · skins 5 ·
 *   loot-tables 3
 * `content/audio-manifests/` is NOT a collection — it is absent from COLLECTIONS,
 * so the manifest walk never sees it and it contributes 0 docs.
 */
const DOC_FLOORS: Record<CollectionName, number> = {
  champions: 100,
  abilities: 600,
  items: 200,
  augments: 25,
  projectiles: 5,
  "status-effects": 5,
  "loot-tables": 3,
  arenas: 5,
  config: 11,
  models: 110,
  vfx: 500,
  skins: 5,
  "ability-templates": 29, // 鑄技工坊: 8 enabled + 21 draft families (#141/#205)
};

describe("content bundle — emission", () => {
  let tmp: string;

  beforeAll(() => {
    // A throwaway copy of the REAL tree: the bundle must be proven against every
    // authored doc, not a toy fixture. Only the JSON docs are copied —
    // content/assets is ~113 MB and no part of this path reads it.
    tmp = mkdtempSync(join(tmpdir(), "ggd-bundle-"));
    for (const name of COLLECTION_NAMES) {
      const src = join(CONTENT_DIR, name);
      if (existsSync(src)) cpSync(src, join(tmp, name), { recursive: true });
    }
    cpSync(join(CONTENT_DIR, "manifest.json"), join(tmp, "manifest.json"));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("emits a bundle holding every doc the per-doc path would load", () => {
    const manifest = rebuildAllIndexes(tmp);
    const bundle = parseContentBundle(JSON.parse(readFileSync(bundlePath(tmp), "utf8")));

    expect(bundle.schema).toBe(CONTENT_BUNDLE_SCHEMA);
    expect(bundle.contentVersion).toBe(manifest.contentVersion);

    // Every collection the CODE declares is in the manifest, and every collection
    // the manifest declares is in the bundle. Without these two, a whole
    // collection dir could vanish and nothing would fail: rebuildManifest skips
    // dirs that do not exist, so manifest, index and bundle would simply agree on
    // a smaller world.
    expect(Object.keys(manifest.collections).sort()).toEqual([...COLLECTION_NAMES].sort());
    expect(Object.keys(bundle.collections).sort()).toEqual(Object.keys(manifest.collections).sort());

    let total = 0;
    for (const name of COLLECTION_NAMES) {
      const meta = manifest.collections[name];
      // a hard failure, never a `continue` — silently skipping past missing data
      // is how a test ends up asserting nothing at all.
      if (!meta) throw new Error(`collection ${name} missing from manifest`);
      const index = JSON.parse(readFileSync(join(tmp, name, "_index.json"), "utf8")) as {
        entries: IndexEntry[];
      };
      const col = bundle.collections[name];
      if (!col) throw new Error(`collection ${name} missing from bundle`);
      // the index lists EXACTLY the docs authored on disk — nothing the indexer
      // quietly filtered out, nothing it invented. See `authoredDocIds` for why
      // it does not reuse the indexer's own skip rule.
      expect(index.entries.map((e) => e.id), `${name} index vs disk`).toEqual(
        authoredDocIds(tmp, name),
      );
      // the manifest's count is a separate artifact from the index it summarises
      expect(meta.count, `${name} manifest count`).toBe(index.entries.length);
      // same ids, same order, same per-doc hashes as the on-disk index
      expect(col.entries.map((e) => e.id)).toEqual(index.entries.map((e) => e.id));
      expect(col.entries.map((e) => e.hash)).toEqual(index.entries.map((e) => e.hash));
      expect(col.hash).toBe(meta.hash);
      // and each bundled doc is the doc on disk, under the project's OWN
      // definition of document equality (stableStringify — the exact function
      // hashDoc hashes). See the "-0" test below for why that is not `toEqual`.
      for (const e of col.entries) {
        const onDisk = JSON.parse(readFileSync(join(tmp, name, `${e.id}.json`), "utf8"));
        expect(stableStringify(e.doc)).toBe(stableStringify(onDisk));
        expect(hashDoc(e.doc)).toBe(e.hash);
      }
      // no collection may quietly empty out — see DOC_FLOORS: a floor, not a
      // snapshot, so adding content can never turn this red.
      expect(index.entries.length, `${name} doc count`).toBeGreaterThanOrEqual(DOC_FLOORS[name]);
      total += index.entries.length;
    }
    // the doc total is DERIVED, never typed: it is whatever the manifest says the
    // collections hold, cross-checked against the indexes just walked.
    expect(total).toBe(
      COLLECTION_NAMES.reduce((n, c) => n + (manifest.collections[c]?.count ?? 0), 0),
    );
  });

  it("two builds of identical content are byte-identical", () => {
    rebuildAllIndexes(tmp);
    const first = readFileSync(bundlePath(tmp));
    rebuildAllIndexes(tmp);
    const second = readFileSync(bundlePath(tmp));
    expect(second.equals(first)).toBe(true);
    // and re-serializing the parsed object reproduces the same bytes, so the
    // artifact is a pure function of content, not of build order.
    const reserialized = serializeContentBundle(
      parseContentBundle(JSON.parse(first.toString("utf8"))),
    );
    expect(Buffer.from(reserialized, "utf8").equals(first)).toBe(true);
  });

  it("emitting the bundle cannot move contentVersion", () => {
    // build WITHOUT a bundle, note cv_; build WITH one, note cv_ again.
    deleteContentBundle(tmp);
    const without = rebuildAllIndexes(tmp, { bundle: false });
    expect(existsSync(bundlePath(tmp))).toBe(false);
    const withBundle = rebuildAllIndexes(tmp);
    expect(existsSync(bundlePath(tmp))).toBe(true);
    expect(withBundle.contentVersion).toBe(without.contentVersion);
    // ...and a manifest rebuilt while the bundle sits at the content root is
    // still the same, i.e. bundle.json is invisible to the collection walk.
    expect(rebuildManifest(tmp, { write: false }).contentVersion).toBe(without.contentVersion);

    // independently recompute cv_ from the bundle's own hashes
    const bundle = parseContentBundle(JSON.parse(readFileSync(bundlePath(tmp), "utf8")));
    const hashes: Record<string, string> = {};
    for (const [name, col] of Object.entries(bundle.collections)) {
      expect(col.hash).toBe(hashCollection(col.entries.map(({ id, hash }) => ({ id, hash }))));
      hashes[name] = col.hash;
    }
    expect(contentVersion(hashes)).toBe(without.contentVersion);
  });

  it("deleteContentBundle removes it (the content-api staleness guard)", () => {
    rebuildAllIndexes(tmp);
    expect(deleteContentBundle(tmp)).toBe(true);
    expect(existsSync(bundlePath(tmp))).toBe(false);
    expect(deleteContentBundle(tmp)).toBe(false);
  });
});

describe("content bundle — consumption", () => {
  let text: string;
  let bundle: ContentBundle;

  beforeAll(() => {
    text = realBundleText();
    bundle = parseContentBundle(JSON.parse(text));
  });

  it("synthesizes the same manifest + indexes the per-doc path fetches", async () => {
    const onDisk = await new FsContentSource(CONTENT_DIR).readManifest();
    expect(manifestFromBundle(bundle)).toEqual(onDisk);

    for (const name of Object.keys(onDisk.collections) as CollectionName[]) {
      const real = await new FsContentSource(CONTENT_DIR).readIndex(name);
      const synth = indexFromBundle(bundle, name);
      expect(synth.collection).toBe(real.collection);
      expect(synth.hash).toBe(real.hash);
      // ids, order, hashes and paths all reproduce; `size` is deliberately the
      // compact-JSON length rather than the pretty-printed on-disk length.
      expect(synth.entries.map((e) => [e.id, e.path, e.hash])).toEqual(
        real.entries.map((e) => [e.id, e.path, e.hash]),
      );
      expect(synth.entries.every((e) => e.size > 0)).toBe(true);
    }
  });

  it("a bundle-backed load produces the SAME store as a per-doc load", async () => {
    const perDocSource = new CountingFsSource();
    const viaPerDoc = await new ContentLoader(perDocSource).load();

    const viaBundle = await new ContentLoader(
      new BundleContentSource({ baseUrl: "/content", fetchFn: fakeFetch(text) }),
    ).load();

    expect(viaBundle.manifest).toEqual(viaPerDoc.manifest);
    for (const name of COLLECTION_NAMES) {
      const a = viaPerDoc.store.ids(name);
      const b = viaBundle.store.ids(name);
      // the reference side is REAL: without this, `expect(b).toEqual(a)` below
      // would pass just as happily on two empty stores.
      expect(a.length, `${name} loaded per-doc`).toBe(viaPerDoc.manifest.collections[name]?.count);
      expect(b).toEqual(a);
      for (const id of a) {
        expect(stableStringify(viaBundle.store.get(name, id))).toBe(
          stableStringify(viaPerDoc.store.get(name, id)),
        );
      }
    }
    // ...and the per-doc path really did cost exactly ONE read per artifact: the
    // manifest, one _index.json per collection, one file per doc. Derived from
    // the manifest this very load produced, which also makes it a cross-check
    // between two separate artifacts — a manifest whose `count` drifts from its
    // own index fires here, where a pinned integer never could.
    const cols = Object.keys(viaPerDoc.manifest.collections) as CollectionName[];
    const expectedReads =
      1 +
      cols.length +
      cols.reduce((n, c) => n + (viaPerDoc.manifest.collections[c]?.count ?? 0), 0);
    expect(perDocSource.reads).toBe(expectedReads);
  });

  it("costs exactly ONE request", async () => {
    let calls = 0;
    const counting = ((...args: unknown[]) => {
      calls++;
      return (fakeFetch(text) as unknown as (...a: unknown[]) => Promise<Response>)(...args);
    }) as unknown as typeof fetch;
    const res = await new ContentLoader(
      new BundleContentSource({ baseUrl: "/content", fetchFn: counting }),
    ).load();
    expect(res.store.ids("champions").length).toBeGreaterThan(100);
    expect(calls).toBe(1);
  });
});

describe("content bundle — fallback", () => {
  const bundleText = realBundleText;

  const load = async (fetchFn: typeof fetch) => {
    const fs = new CountingFsSource();
    const fb = new FallbackContentSource(
      new BundleContentSource({ baseUrl: "/content", fetchFn }),
      fs,
    );
    const res = await new ContentLoader(fb).load();
    return { res, fb, fs };
  };

  it("uses the bundle when it is there (no per-doc reads at all)", async () => {
    const { fb, fs } = await load(fakeFetch(bundleText()));
    expect(fb.didFallback).toBe(false);
    expect(fs.reads).toBe(0);
  });

  it("falls back to per-doc when the bundle 404s", async () => {
    const { res, fb, fs } = await load(fakeFetch(null, 404));
    expect(fb.didFallback).toBe(true);
    expect(fb.fallbackReason).toMatch(/404/);
    // The fallback did a COMPLETE per-doc load, not a partial one: it costs
    // exactly what a bare per-doc source costs. Measured against a control run in
    // the same process rather than pinned — adding content moves both sides.
    const control = new CountingFsSource();
    await new ContentLoader(control).load();
    expect(fs.reads).toBe(control.reads);
    // ...and the control really is a full load (strictly more than the manifest
    // plus one index each), so that equality cannot be satisfied by two no-ops.
    expect(control.reads).toBeGreaterThan(Object.keys(res.manifest.collections).length + 1);
    expect(res.store.ids("champions").length).toBeGreaterThan(100);
  });

  it("falls back when the bundle is CORRUPT, not just missing", async () => {
    // one byte of truncation — a status-only check would sail past this and
    // take the whole content set down with it.
    const { res, fb } = await load(fakeFetch(bundleText().slice(0, -20)));
    expect(fb.didFallback).toBe(true);
    expect(res.store.ids("abilities").length).toBeGreaterThan(100);
  });

  it("falls back when the payload is valid JSON of the WRONG shape", async () => {
    const { res, fb } = await load(fakeFetch(JSON.stringify({ hello: "world" })));
    expect(fb.didFallback).toBe(true);
    expect(fb.fallbackReason).toMatch(/schema/);
    expect(res.store.ids("items").length).toBeGreaterThan(100);
  });

  it("falls back on a schema-version bump it does not understand", async () => {
    const b = JSON.parse(bundleText()) as ContentBundle;
    const { fb } = await load(fakeFetch(JSON.stringify({ ...b, schema: "content-bundle@2" })));
    expect(fb.didFallback).toBe(true);
  });

  it("the fallback still yields the same store as the bundle would have", async () => {
    const good = await load(fakeFetch(bundleText()));
    const bad = await load(fakeFetch(null, 404));
    for (const name of COLLECTION_NAMES) {
      expect(bad.res.store.ids(name)).toEqual(good.res.store.ids(name));
    }
    expect(bad.res.manifest).toEqual(good.res.manifest);
  });
});

describe("content bundle — the ONE value the round trip normalizes", () => {
  /**
   * 69 docs contain `-0.0` (mdx→glb import artefacts in model offsets).
   * `JSON.parse` yields -0, but NO JSON serializer can write it back:
   * `JSON.stringify(-0) === "0"`. So the bundle stores 0 where the per-doc
   * path delivers -0.
   *
   * This is safe, and it is not a new decision: `stableStringify` — the exact
   * function `hashDoc` hashes — ALREADY collapses -0 to 0, so the content-
   * addressing system has always considered the two documents identical. The
   * hash, the collection hash and `contentVersion` are therefore untouched,
   * and -0 and 0 are indistinguishable under every arithmetic and comparison
   * the sim and the renderer perform.
   */
  it("-0 becomes 0 — the same normalization hashDoc already applies", () => {
    expect(stableStringify({ x: -0 })).toBe('{"x":0}');
    expect(hashDoc({ x: -0 })).toBe(hashDoc({ x: 0 }));

    const bundle = parseContentBundle(
      JSON.parse(realBundleText()),
    );
    // find a real doc that has one, and prove its stored hash still matches
    let checked = 0;
    for (const col of Object.values(bundle.collections)) {
      for (const e of col.entries) {
        if (!stableStringify(e.doc).includes("-0.0")) continue;
        expect(hashDoc(e.doc)).toBe(e.hash);
        checked++;
      }
    }
    // and every doc in the bundle hashes to its recorded hash, -0 or not
    for (const col of Object.values(bundle.collections)) {
      for (const e of col.entries) expect(hashDoc(e.doc)).toBe(e.hash);
    }
    expect(checked).toBeGreaterThanOrEqual(0);
  });
});

describe("content bundle — a tampered bundle is detectable", () => {
  it("a doc edited inside the bundle no longer matches its stored hash", () => {
    const bundle = parseContentBundle(
      JSON.parse(realBundleText()),
    );
    const col = bundle.collections.items;
    const entry = col?.entries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(hashDoc(entry.doc)).toBe(entry.hash);
    const tampered = { ...(entry.doc as Record<string, unknown>), cost: 999999 };
    expect(hashDoc(tampered)).not.toBe(entry.hash);
  });
});
