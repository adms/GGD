/**
 * AssetManager — shared .glb loading. Each distinct path under content/
 * (e.g. "assets/models/champions/blocky-mage.glb") is fetched ONCE into an
 * AssetContainer and cached; every consumer instantiates from that container
 * (instantiateModelsToScene), so 12 champions on screen cost one GLB parse.
 * load() resolves null on any failure — callers keep their procedural
 * fallback (client-06). The glTF loader plugin is imported lazily inside
 * load() so headless tests never pull it in.
 *
 * ---------------------------------------------------------------------------
 * TWO CACHES, TWO LIFETIMES — and why
 * ---------------------------------------------------------------------------
 * 1. `this.cache` — path → AssetContainer, PER INSTANCE (= per Scene). An
 *    AssetContainer is scene-bound: its meshes, materials and textures are
 *    created on `this.scene` and die with it, and `instantiateModelsToScene`
 *    can only clone into that same scene. So a container may NEVER be shared
 *    across scenes — a static container cache would hand round 2 the disposed
 *    meshes of round 1. No LRU, no eviction: that is deliberate, it is what
 *    guarantees no mid-match re-fetch.
 *
 * 2. `byteCache` (module-level, SHARED by every instance) — url → the raw .glb
 *    bytes. Bytes are scene-agnostic, so this is the piece that CAN cross a
 *    scene boundary. It exists because `IntermissionScene` builds a brand-new
 *    Scene (and therefore a brand-new AssetManager) on every intermission, and
 *    re-downloaded its 13 prop .glbs — 2,228,424 B, of which merchant.glb alone
 *    is 1,598,564 B — EVERY ROUND. Round 2+ now parse from memory and issue
 *    zero requests. Bounded by byteBudget (LRU) so a long session that
 *    browses many champion models cannot pin the whole 34.8 MB .glb corpus in
 *    the JS heap; evicting only ever costs a re-fetch, never correctness,
 *    because cache (1) is what the no-re-fetch guarantee actually rests on.
 *
 * ---------------------------------------------------------------------------
 * WHY ONE GET AND NOT A HEAD PROBE
 * ---------------------------------------------------------------------------
 * This used to `await fetch(url, {method:"HEAD"})` before every load, purely so
 * a 404 would not spam glTF loader errors. Being awaited, it DOUBLED the
 * round-trip count of every model — ~19 extra serialized round trips per match
 * (about 10 champion models + 9 arena decor props). A single GET does the same
 * job strictly better: `res.ok` is the same existence check, and on success we
 * already hold the bytes the loader wants, so the loader is handed an
 * ArrayBufferView instead of a URL and never issues a request of its own.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { withContentVersion } from "../content/assetVersion";
import { resolveLodPath } from "./modelLod";
import { glbImageDigests, shareDuplicateTextures } from "./textureDedup";

/**
 * Ceiling on the shared raw-bytes cache. 24 MB holds the whole intermission
 * market (2.23 MB) plus a match's champion models many times over, and still
 * sits below the 34.8 MB total .glb corpus so browsing the roster in
 * champ-select cannot grow without bound.
 */
export const DEFAULT_ASSET_BYTE_BUDGET = 24 * 1024 * 1024;

let byteBudget = DEFAULT_ASSET_BYTE_BUDGET;

/**
 * One in-flight-or-resolved download. A class rather than an object literal so
 * the fetch body can refer to the entry it is filling in (to record its size,
 * and to un-cache itself on a transient failure) without a forward reference.
 */
class ByteEntry {
  /** resolved payload size; 0 while in flight and 0 for a cached 404 */
  size = 0;
  readonly promise: Promise<Uint8Array | null>;

  constructor(private readonly url: string) {
    this.promise = this.run();
  }

  private async run(): Promise<Uint8Array | null> {
    try {
      const res = await fetch(this.url);
      if (!res.ok) return null; // the existence check the HEAD probe used to do
      const bytes = new Uint8Array(await res.arrayBuffer());
      this.size = bytes.byteLength;
      cachedBytes += bytes.byteLength;
      evictDownToBudget(this.url);
      return bytes;
    } catch {
      // a THROWN fetch (offline, aborted, relative URL under Node) is transient:
      // forget it so a later scene may try again. A 404 is NOT forgotten — a
      // model that does not ship will not ship next round either.
      if (byteCache.get(this.url) === this) byteCache.delete(this.url);
      return null;
    }
  }
}

/** url → bytes. Module-level ON PURPOSE — see "TWO CACHES" above. */
const byteCache = new Map<string, ByteEntry>();
let cachedBytes = 0;

/** Move `url` to the MRU end of the insertion order and return its entry. */
function touch(url: string): ByteEntry | undefined {
  const entry = byteCache.get(url);
  if (entry) {
    byteCache.delete(url);
    byteCache.set(url, entry);
  }
  return entry;
}

/** Drop least-recently-used resolved payloads until back under the ceiling. */
function evictDownToBudget(keep: string): void {
  if (cachedBytes <= byteBudget) return;
  for (const [url, entry] of byteCache) {
    if (cachedBytes <= byteBudget) return;
    if (url === keep || entry.size === 0) continue; // in flight, or a cached 404
    byteCache.delete(url);
    cachedBytes -= entry.size;
  }
}

/**
 * Fetch a file's bytes once, process-wide. Resolves null when the file is
 * missing (404) or unreachable — the caller turns that into the null container
 * that keeps every procedural fallback in place.
 */
function loadBytes(url: string): Promise<Uint8Array | null> {
  const hit = touch(url);
  if (hit) return hit.promise;
  if (typeof fetch !== "function") return Promise.resolve(null);
  const entry = new ByteEntry(url);
  byteCache.set(url, entry);
  return entry.promise;
}

/** Bytes currently resident in the shared cache (diagnostics / tests). */
export function cachedAssetBytes(): number {
  return cachedBytes;
}

/**
 * Forget every cached payload and restore the default budget. Test-only —
 * production never needs this; evicting only ever costs a re-fetch.
 */
export function clearAssetByteCache(budget = DEFAULT_ASSET_BYTE_BUDGET): void {
  byteCache.clear();
  cachedBytes = 0;
  byteBudget = budget;
}

export class AssetManager {
  private readonly cache = new Map<string, Promise<AssetContainer | null>>();

  constructor(
    private readonly scene: Scene,
    private readonly baseUrl = "/content/",
  ) {}

  /**
   * Resolve an AssetContainer for a glb path relative to content/
   * (e.g. "assets/models/props/pillar.glb"), or null when unavailable.
   *
   * MODEL LOD (task #115). The authored path in is the model doc's; the path
   * actually FETCHED is `resolveLodPath`'s, which appends `-mid`/`-small` when
   * the active graphics preset asks for a lower tier and that tier was
   * generated. This is the ONE place the swap happens — every consumer
   * (ChampionView, GuardianView, FlowerView, StorePreview, IntermissionScene,
   * the audition harnesses) already funnels through here.
   *
   * The cache is keyed on the RESOLVED path, not the authored one: keying on
   * the authored path would hand back the previous tier's container after a
   * settings change and the setting would silently do nothing again.
   */
  load(path: string): Promise<AssetContainer | null> {
    const resolved = resolveLodPath(path);
    let pending = this.cache.get(resolved);
    if (!pending) {
      pending = this.loadUncached(resolved);
      this.cache.set(resolved, pending);
    }
    return pending;
  }

  private async loadUncached(path: string): Promise<AssetContainer | null> {
    try {
      // register the glTF loader on demand (render/-only Babylon surface)
      await import("@babylonjs/loaders/glTF");
      const url = this.baseUrl + path;
      // Content cache key. `?h=<contentVersion>` is the ONLY thing that flips
      // nginx from `no-cache` to `public, max-age=31536000, immutable`
      // (nginx.conf `map $arg_h $content_cache`), and the .glb corpus is
      // 36,525,948 B across 163 files — by far the largest revalidating set in
      // the game. Stamped ONLY on the byte fetch: `url` stays bare below so the
      // loader's `name`/`rootUrl` (and any sibling URI it resolves against
      // them) are unaffected. No-op until the manifest lands, so this needs no
      // ordering guarantee — see content/assetVersion.ts.
      const bytes = await loadBytes(withContentVersion(url));
      if (bytes === null) return null; // missing/unreachable — never reaches the loader
      const dot = url.lastIndexOf(".");
      const ext = dot < 0 ? "" : url.slice(dot).toLowerCase();
      const slash = url.lastIndexOf("/");
      if (ext !== ".glb") {
        // .gltf & friends resolve sibling .bin/texture URIs themselves, and the
        // loader refuses an ArrayBufferView for non-binary plugins — so hand it
        // the URL. Costs a second request, but the file is known to exist by
        // now, so this still never spams a 404 through the loader. Deliberately
        // NOT `?h=`-stamped: a .gltf resolves its sibling .bin/textures relative
        // to this URL and a query arg would follow them into paths nginx does
        // not serve. Nothing under content/ is .gltf today, so this costs
        // nothing; if that changes, stamp the siblings, not the parent.
        return await LoadAssetContainerAsync(url, this.scene);
      }
      const container = await LoadAssetContainerAsync(bytes, this.scene, {
        pluginExtension: ".glb",
        name: url.slice(slash + 1),
        rootUrl: url.slice(0, slash + 1),
      });
      // 🎽 內容相同的貼圖只留一塊 GPU 記憶體（GH#382）。⚠️ 一定要在 await 之後 ——
      // `LoadAssetContainerAsync` 到這裡才保證每一張貼圖的 InternalTexture 已經生出來。
      shareDuplicateTextures(this.scene, container, glbImageDigests(bytes));
      return container;
    } catch {
      return null; // caller keeps its procedural fallback
    }
  }
}
