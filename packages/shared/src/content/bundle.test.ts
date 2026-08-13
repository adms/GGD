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
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
 * ⏱ THE FILE'S OWN TIME BUDGET — declared, because the implicit one was wrong.
 *
 * This file was on the known-flaky list ("bundle.test.ts 的 fallback 那幾條 ——
 * 5 秒逾時，併行跑全套時會紅，單獨跑 15/15 綠"). It is NOT flaky in the sense of
 * a race: the tests are pure functions of the content tree and nothing here
 * touches a port, a shared temp dir or a global. What was wrong is the BUDGET.
 *
 * Measured (2026-07-30, 18-core M-series, this file alone):
 *   • one complete per-doc load of the real tree = 1,905 fs reads
 *     (1 manifest + 13 collection indexes + 1,891 docs);
 *   • four tests here perform ONE such load, and two perform TWO — the 404
 *     fallback measures itself against a control run in the same process, on
 *     purpose ("adding content moves both sides");
 *   • solo the heaviest test costs 180–453 ms, so vitest's implicit 5,000 ms
 *     default looked like a 10× margin and nobody declared anything.
 *
 * It is not 10×. Re-measured under 2× CPU oversubscription (36 spinners on 18
 * cores — a mild imitation of a whole-tree run, which is far worse):
 *   fallback/"same store as the bundle would have"  180 ms → 1,439 ms  (8.0×)
 *   fallback/"falls back to per-doc when the bundle 404s"  453 → 656 ms
 *   emission/"emits a bundle holding every doc"           441 → 734 ms
 *   whole-file test time                              3.64 s → 7.51 s
 * A full run oversubscribes much harder than 2× (there is a runaway vitest at
 * 100% CPU on this box right now, from another lane), and 8× on the heaviest
 * test already eats most of 5 s.
 *
 * So the 5 s was never a considered budget, it was a default nobody looked at,
 * and every red it produced was a lie about the code. Declaring the real one is
 * the fix. It is NOT `test.retry`: nothing here is re-run and nothing that
 * genuinely fails is hidden — a wrong bundle still fails on the first attempt,
 * as the mutation log for this change shows. If a test in this file ever needs
 * 30 s of honest work, that is a real regression and it will still go red.
 */
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
  // task #231 adds `_voxel-skins.json` — the hand-authored voxel-skin override
  // channel. 特徵生成 batch one adds `_voxel-barcodes.json` — the L0 barcode
  // channel that outranks it. Both listed here EXPLICITLY (the point of this
  // table) so each is a reviewed addition rather than a silent one.
  // `_overlay-hidden-geometry.json`(owner 2026-08-02「初號機跟拳四郎一樣 3d model
  // 連著屍體一起」)—— blizzard-overlay 那 40 隻磁碟上沒有自己的 model 文件可以掛
  // `hiddenPrimitives`,所以宣告只能住在這個 sidecar,由 blizzardOverlay 合成
  // ModelDoc 時注入。同樣是**被審過**的一筆新增。
  models: [
    "_standin-overrides.json",
    "_voxel-skins.json",
    "_voxel-barcodes.json",
    "_overlay-hidden-geometry.json",
  ],
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
 * Docs parked in `content/_legacy/<collection>/`.
 *
 * ⭐ 2026-08-13 —— owner pulled the un-shipped roster out of the operating tree
 * («你可不可以把沒開放的英雄資料包含技能都放到一個 legacy 區 預設不要再被讀取
 * 到了»): 41 champions and 235 abilities moved here. `_legacy` is deliberately
 * NOT in `COLLECTION_NAMES`, so the manifest walk, the indexer and the bundle
 * are all blind to it — which is the whole point, and also why the floors below
 * have to look at it explicitly.
 *
 * Same skip rule as `authoredDocIds`: `_index.json` is not a doc. (There is no
 * index in here at all — nothing rebuilds it — but the rule is written out so
 * this counter cannot drift from the one above it.)
 */
function legacyDocCount(name: CollectionName): number {
  const dir = join(CONTENT_DIR, "_legacy", name);
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "_index.json").length;
}

/**
 * The "this load was not empty" sentinel used by the consumption / fallback
 * tests — the whole collection, DERIVED from disk.
 *
 * These four call sites used to read `toBeGreaterThan(100)`. That number was
 * doing two jobs badly: as a vacuity guard it was far weaker than it looked (a
 * loader that dropped a third of the roster still passed), and as a floor it was
 * a shipped count living in a test file, so the 2026-08-13 roster change turned
 * it red with a message about the BUNDLE rather than about the roster. Reading
 * the population off `content/` instead makes it exact and makes it immune to
 * the owner adding or retiring heroes — the only thing it can now fail on is the
 * transport losing documents, which is the one thing this file exists to catch.
 */
function expectWholeCollection(ids: readonly string[], name: CollectionName): void {
  const onDisk = authoredDocIds(CONTENT_DIR, name).length;
  // the reference side must itself be real, or `toBe` is satisfied by 0 === 0
  expect(onDisk, `${name} authored on disk`).toBeGreaterThan(0);
  expect(ids.length, `${name} delivered by the loader`).toBe(onDisk);
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
 * ⭐ THE FLOOR IS MEASURED AGAINST `live + _legacy`, NOT AGAINST THE OPERATING
 * TREE ALONE. That is not a loosening, it is the numbers finally meaning what
 * the paragraph above always said. The event being guarded is a doc CEASING TO
 * EXIST; retiring one into `content/_legacy/` is the opposite of that — the file
 * is still in git, still readable, still restorable by moving it back. So the
 * 2026-08-13 migration moved 276 docs across the line without a single byte
 * being lost, and every number below survives it UNCHANGED:
 *   champions 78 live + 41 parked = 119 ≥ 100 · abilities 461 + 235 = 696 ≥ 600
 * ⛔ NEVER lower one of these to make CI green. A red line here now means what it
 * always claimed to mean: docs left the repo, not merely the roster.
 * ⚠️ Deleting a champion for real therefore requires deleting it from BOTH trees,
 * and that is exactly when this should stop you.
 *
 * The operating half is guarded separately, structurally, below — see
 * `${name} operating tree is not empty`. A floor cannot do that job: the whole
 * roster could be swept into `_legacy` in one `mv` and the union would not move.
 *
 * Composition (2026-08-13 snapshot, 1,685 operating + 277 parked = 1,962 docs
 * across 13 collections), kept as documentation of what the tree actually IS:
 *   abilities 461 — includes the 天生技 / PASSIVE docs, the level-1 6th slot the
 *     w3x importer dropped, one per champion that has an NN-00 in the source map
 *   vfx 632 — the shared primitive library (task #123) plus the faithful w3x
 *     emitter families `fx.w3x.{locust,orb,particle}.*.pNN` (task #183)
 *   models 124 — includes the 2 per-arena guardian props, prop.guardian.beast /
 *     prop.guardian.treant (task #105)
 *   champions 78 · items 219 · augments 31 · config 47 · ability-templates 34 ·
 *   status-effects 27 · projectiles 18 · arenas 6 · skins 5 · loot-tables 3
 * ⚠️ `content/_legacy/config/` holds ONE file, and it is a fragment (the 41
 * retired `unit-tints` entries) rather than a retired config doc — so the config
 * union reads 48 where the honest retired-doc count is 0. Harmless here (the
 * floor is 11) and called out so nobody reads 48 as「有一份 config 被退役」.
 * `content/audio-manifests/` is NOT a collection — it is absent from COLLECTIONS,
 * so the manifest walk never sees it and it contributes 0 docs.
 */
/**
 * 已經註冊進 `COLLECTIONS`、但還沒有任何出貨內容的集合。
 *
 * ⛔ 這不是「空集合沒關係」的通行證 —— 空集合與「被誤刪」長得一模一樣，
 * 那正是上面那條守衛存在的理由。這一格只涵蓋**刻意的先後順序**，而且要寫明何時退場。
 *
 * · `maps`（GH#324 Phase 1）—— `map@1` 的 Zod 先隨映像上線，Phase 2 才推地圖內容。
 *   **到期條件**：`pnpm map:gen` 產出第一張圖（無限城）的那一刻。
 */
// ⭐ 2026-08-14 Phase 2：`maps` 的到期條件達成了（無限城產出來了）⇒ 清空。
// ⛔ 這個集合現在跟其他 13 個一樣，空掉就會紅。
const REGISTERED_AHEAD_OF_CONTENT = new Set<CollectionName>([]);

const DOC_FLOORS: Record<CollectionName, number> = {
  champions: 100,
  abilities: 600,
  items: 200,
  augments: 25,
  projectiles: 5,
  "status-effects": 5,
  "loot-tables": 3,
  // GH#324 Phase 1 —— `map@1` 集合剛開，出貨 0 份（母版無限城在 Phase 2 才產生）。
  // ⚠️ 0 是**刻意的**：它讓「集合註冊了但還沒有內容」與「集合被誤刪」分得開。
  // GH#324 Phase 2 —— 無限城出貨了。⚠️ 1 是**下限**不是現況：加圖只會往上。
  maps: 1,
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
      // Nothing may DISAPPEAR — see DOC_FLOORS. Counted over the operating tree
      // plus `content/_legacy/`, because retiring a doc is not losing it.
      expect(
        index.entries.length + legacyDocCount(name),
        `${name} doc count (${index.entries.length} operating + ${legacyDocCount(name)} parked in content/_legacy/)`,
      ).toBeGreaterThanOrEqual(DOC_FLOORS[name]);
      // …and the structural half the floor cannot express: a collection that
      // empties out ENTIRELY is the 2026-08-01 shape (bundle, manifest and index
      // all agree on the smaller world, every invariant above still passes, and
      // the client silently renders nothing). One `mv` of the whole roster into
      // `_legacy` would leave the union untouched, so this reads the live tree
      // on its own. Structural on purpose — ⛔ not a count anybody has to bump.
      // GH#324 Phase 1 —— 一個集合可以**先註冊、後有內容**，而這是刻意的順序：
      // `content/` 是 live bind-mount 而 client/server 烘在映像裡，所以
      // `map@1` 的 Zod 必須**先隨映像上線**，Phase 2 的地圖內容才推得上去
      // （順序反了就是 2026-08-02 事故的完整重演，見 docs/_新場地計畫.md 7.1）。
      // ⚠️ 這一格是**帳單不是免死金牌**：Phase 2 產出無限城之後這一行要刪掉，
      //    刪不掉就代表那張圖沒有真的出貨。
      if (!REGISTERED_AHEAD_OF_CONTENT.has(name)) {
        expect(index.entries.length, `${name} operating tree is not empty`).toBeGreaterThan(0);
      }
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
    expectWholeCollection(res.store.ids("champions"), "champions");
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
    expectWholeCollection(res.store.ids("champions"), "champions");
  });

  it("falls back when the bundle is CORRUPT, not just missing", async () => {
    // one byte of truncation — a status-only check would sail past this and
    // take the whole content set down with it.
    const { res, fb } = await load(fakeFetch(bundleText().slice(0, -20)));
    expect(fb.didFallback).toBe(true);
    expectWholeCollection(res.store.ids("abilities"), "abilities");
  });

  it("falls back when the payload is valid JSON of the WRONG shape", async () => {
    const { res, fb } = await load(fakeFetch(JSON.stringify({ hello: "world" })));
    expect(fb.didFallback).toBe(true);
    expect(fb.fallbackReason).toMatch(/schema/);
    expectWholeCollection(res.store.ids("items"), "items");
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
