/**
 * AssetManager's LOADING CONTRACT, driven against real .glb bytes off disk.
 *
 * This is a runtime proof, not an arithmetic one: `globalThis.fetch` is
 * replaced with a stub that serves the repo's real `content/` tree and RECORDS
 * every request (method + url), then the real AssetManager, the real glTF
 * loader plugin and a real Babylon NullEngine scene run end to end. What the
 * counters say is literally what the network would have seen.
 *
 * Three things are pinned here:
 *
 *  • ONE request per file, and it is a GET. The old code awaited a HEAD probe
 *    before every LoadAssetContainerAsync purely to keep a 404 out of the
 *    loader's error log — which doubled the serialized round trips of every
 *    single model in the game (~19 per match). `res.ok` on the GET is the same
 *    existence check for half the latency.
 *  • The bytes are SHARED across scenes, the containers are NOT. An
 *    AssetContainer is scene-bound (its meshes die with its scene), so each
 *    AssetManager must get its own; the download behind it must not repeat.
 *  • A missing file still resolves null, without the loader ever seeing it —
 *    ChampionView.tryUpgradeToGlb and dressArena both read null as "keep the
 *    procedural stand-in".
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  AssetManager,
  DEFAULT_ASSET_BYTE_BUDGET,
  cachedAssetBytes,
  clearAssetByteCache,
} from "./AssetManager";
import { setModelLodManifest, setModelLodTier, type LodManifest } from "./modelLod";

/** the same tree the client fetches /content/ from */
const CONTENT_DIR = join(__dirname, "../../../../content");
const MERCHANT = "assets/models/shop/merchant.glb";
const CART = "assets/models/shop/merchant_cart.glb";

interface Req {
  method: string;
  url: string;
}

let requests: Req[];
let realFetch: typeof globalThis.fetch | undefined;

/** Serve content/ off disk, counting every hit. Anything else is a 404. */
function installFetchStub(): void {
  requests = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    requests.push({ method: init?.method ?? "GET", url });
    if (!url.startsWith("/content/")) return new Response(null, { status: 404 });
    try {
      const buf = readFileSync(join(CONTENT_DIR, url.slice("/content/".length)));
      return new Response(new Uint8Array(buf), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  }) as unknown as typeof globalThis.fetch;
}

function makeScene(): { engine: NullEngine; scene: Scene } {
  const engine = new NullEngine();
  return { engine, scene: new Scene(engine) };
}

describe("AssetManager", () => {
  beforeEach(() => {
    installFetchStub();
    clearAssetByteCache();
  });
  afterEach(() => {
    if (realFetch) globalThis.fetch = realFetch;
    clearAssetByteCache();
  });

  it("loads a real .glb with ONE GET and no HEAD probe", async () => {
    cover("asset-manager-single-request");
    const { engine, scene } = makeScene();
    const container = await new AssetManager(scene).load(MERCHANT);

    expect(container).not.toBeNull();
    expect(container!.meshes.length).toBeGreaterThan(0);
    expect(container!.animationGroups.length).toBeGreaterThan(0);
    // exactly one request, and it is not the old existence probe
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([`GET /content/${MERCHANT}`]);
    expect(requests.some((r) => r.method === "HEAD")).toBe(false);

    scene.dispose();
    engine.dispose();
  });

  it("re-uses the bytes across SCENES but never the container", async () => {
    cover("asset-manager-shared-bytes");
    const a = makeScene();
    const b = makeScene();

    const first = await new AssetManager(a.scene).load(MERCHANT);
    const requestsAfterFirst = requests.length;
    const second = await new AssetManager(b.scene).load(MERCHANT);

    expect(requests.length).toBe(requestsAfterFirst); // round 2 hits the network zero times
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // distinct containers, each owned by (and instantiable into) its own scene
    expect(second).not.toBe(first);
    expect(first!.scene).toBe(a.scene);
    expect(second!.scene).toBe(b.scene);

    // …and disposing the FIRST scene must not damage the second container —
    // this is exactly what a static container cache would have got wrong.
    a.scene.dispose();
    a.engine.dispose();
    expect(second!.meshes.every((m) => !m.isDisposed())).toBe(true);
    const inst = second!.instantiateModelsToScene((n) => `probe-${n}`, false, {
      doNotInstantiate: true,
    });
    expect(inst.rootNodes.length).toBeGreaterThan(0);

    b.scene.dispose();
    b.engine.dispose();
  });

  it("a missing file resolves null (procedural fallback stays) and is not re-probed", async () => {
    cover("asset-manager-missing-null");
    const { engine, scene } = makeScene();
    const assets = new AssetManager(scene);

    expect(await assets.load("assets/models/champions/does-not-exist.glb")).toBeNull();
    expect(requests.length).toBe(1); // the 404 came from the GET, not a probe

    // a SECOND manager on a SECOND scene reuses the cached negative result
    const other = makeScene();
    expect(await new AssetManager(other.scene).load("assets/models/champions/does-not-exist.glb")).toBeNull();
    expect(requests.length).toBe(1);

    other.scene.dispose();
    other.engine.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("accounts the bytes it holds and clears them on demand", async () => {
    cover("asset-manager-shared-bytes");
    const { engine, scene } = makeScene();
    const assets = new AssetManager(scene);
    await assets.load(CART);
    const onDisk = readFileSync(join(CONTENT_DIR, CART)).byteLength;
    expect(cachedAssetBytes()).toBe(onDisk);
    clearAssetByteCache();
    expect(cachedAssetBytes()).toBe(0);
    scene.dispose();
    engine.dispose();
  });

  /**
   * The byte cache is BOUNDED, and this drives the bound for real rather than
   * trusting it: the whole .glb corpus is 34.8 MB and champ-select loads a
   * model per hover, so an unbounded shared cache would pin all of it in the JS
   * heap for the session. Eviction is safe precisely BECAUSE the per-scene
   * container cache is what guarantees no mid-match re-fetch — losing bytes
   * costs a download, never a wrong container.
   */
  it("evicts least-recently-used bytes to stay under its budget", async () => {
    cover("asset-manager-shared-bytes");
    const barrel = "assets/models/props/barrel_small.glb";
    const rock = "assets/models/hex/rock.glb";
    const rockBytes = readFileSync(join(CONTENT_DIR, rock)).byteLength;
    const barrelBytes = readFileSync(join(CONTENT_DIR, barrel)).byteLength;
    // room for exactly ONE of the two files below
    clearAssetByteCache(rockBytes + 1);

    const a = makeScene();
    const assets = new AssetManager(a.scene);
    await assets.load(rock);
    expect(cachedAssetBytes()).toBe(rockBytes);
    // the newest payload is always kept (it is the one being returned); the
    // older one is what goes, so the cache converges on the working set
    await assets.load(barrel);
    expect(cachedAssetBytes()).toBe(barrelBytes);

    // proof of WHICH one went: a new scene re-downloads the evicted file only
    const before = requests.length;
    const b = makeScene();
    const other = new AssetManager(b.scene);
    expect(await other.load(barrel)).not.toBeNull(); // still cached — no request
    expect(requests.length).toBe(before);
    expect(await other.load(rock)).not.toBeNull(); // evicted — one fresh GET
    expect(requests.length).toBe(before + 1);

    b.scene.dispose();
    b.engine.dispose();
    a.scene.dispose();
    a.engine.dispose();
    expect(DEFAULT_ASSET_BYTE_BUDGET).toBe(24 * 1024 * 1024);
  });

  it("survives a thrown fetch (offline / relative URL under Node) and stays retryable", async () => {
    cover("asset-manager-missing-null");
    const { engine, scene } = makeScene();
    globalThis.fetch = (async () => {
      requests.push({ method: "GET", url: "boom" });
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof globalThis.fetch;

    expect(await new AssetManager(scene).load(CART)).toBeNull();
    // a transient failure is NOT cached — the next scene may try again
    const other = makeScene();
    expect(await new AssetManager(other.scene).load(CART)).toBeNull();
    expect(requests.length).toBe(2);

    other.scene.dispose();
    other.engine.dispose();
    scene.dispose();
    engine.dispose();
  });
});

/**
 * MODEL LOD (task #115) — the request-level half.
 *
 * The trap this task was named for is a quality control that renders a
 * dropdown and swaps nothing, so the assertion here is deliberately about the
 * URL THAT WAS FETCHED, not about a resolver's return value. The stub above
 * serves the repo's real content/ tree, so a `-small.glb` that was never
 * generated would 404 and the container would come back null — these cases
 * fail if the tier files stop shipping, not just if the wiring regresses.
 */
describe("AssetManager × model LOD tier", () => {
  beforeEach(() => {
    installFetchStub();
    clearAssetByteCache();
    setModelLodManifest(
      JSON.parse(
        readFileSync(join(CONTENT_DIR, "assets/models/_lod.json"), "utf-8"),
      ) as LodManifest,
    );
  });
  afterEach(() => {
    if (realFetch) globalThis.fetch = realFetch;
    clearAssetByteCache();
    setModelLodManifest(null);
    setModelLodTier("high");
  });

  it("fetches the -small file at the low preset and the authored file at high", async () => {
    cover("asset-manager-lod-swap");
    const high = makeScene();
    setModelLodTier("high");
    const full = await new AssetManager(high.scene).load(MERCHANT);
    expect(requests.map((r) => r.url)).toEqual([`/content/${MERCHANT}`]);

    const low = makeScene();
    setModelLodTier("small");
    const small = await new AssetManager(low.scene).load(MERCHANT);
    expect(requests.map((r) => r.url)).toEqual([
      `/content/${MERCHANT}`,
      "/content/assets/models/shop/merchant-small.glb",
    ]);

    // …and the file that came back really is the cheaper one
    const tris = (c: NonNullable<typeof full>) =>
      c.meshes.reduce((n, m) => n + (m.getTotalIndices?.() ?? 0) / 3, 0);
    expect(small).not.toBeNull();
    expect(tris(small!)).toBeLessThan(tris(full!));

    low.scene.dispose();
    low.engine.dispose();
    high.scene.dispose();
    high.engine.dispose();
  });

  it("keys the container cache on the RESOLVED path, so a tier change is not swallowed", async () => {
    cover("asset-manager-lod-cache-key");
    const { engine, scene } = makeScene();
    const assets = new AssetManager(scene);

    setModelLodTier("high");
    await assets.load(MERCHANT);
    setModelLodTier("mid");
    await assets.load(MERCHANT);

    // Keying on the AUTHORED path would return the already-cached full-fat
    // container here and issue no second request — the setting would look
    // wired and do nothing, which is precisely the #115 failure mode.
    expect(requests.map((r) => r.url)).toEqual([
      `/content/${MERCHANT}`,
      "/content/assets/models/shop/merchant-mid.glb",
    ]);

    scene.dispose();
    engine.dispose();
  });

  it("a model with no generated tier is fetched unchanged (no 404 probe)", async () => {
    cover("asset-manager-lod-passthrough");
    const { engine, scene } = makeScene();
    setModelLodTier("small");
    const untiered = "assets/models/imported/holo.glb";
    expect(await new AssetManager(scene).load(untiered)).not.toBeNull();
    expect(requests.map((r) => r.url)).toEqual([`/content/${untiered}`]);

    scene.dispose();
    engine.dispose();
  });
});
