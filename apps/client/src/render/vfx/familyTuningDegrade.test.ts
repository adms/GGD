/**
 * THE GUARD FOR「調一下家族旋鈕 → 91 支技能的特效整個消失」(GH#230 L2).
 *
 * THE DEFECT, reproduced before it was fixed. `fx.fam.*` docs are 78 STATIC
 * files whose id is (family, colour, quantised scale). The runtime resolves a
 * KEY and hands it to `ContentDb.vfxFor`. So every console knob that MOVES the
 * key — `families.*.scale`, `families.*.element`, per-ability `tint` /
 * `w3xScale` — computed a key with no file behind it:
 *
 *     vfxFor(key) = null → playCastVfx's doc set is empty → rung 1 refuses
 *     (`docs.length === 0`) → rung 3 → the generic `fx.prim.*` stand-in.
 *
 * `families.shockwaveRing.scale` 1 → 1.3 misses ALL 91 baked keys (asserted
 * below as a WITNESS, so nothing here can pass by accident of the key happening
 * to exist).
 *
 * HOW THIS FILE IS SHAPED, and why it is not failure ⑦ (掃屬性代替掃行為). Every
 * assertion travels the shipping path
 *      abilityId → w3xArtFor() → art.primary → ContentDb.vfxFor() → VfxDoc
 * against a real `ContentDb` boot-loaded from the REAL `content/` tree on disk,
 * exactly as `familyArtCoverage.test.ts` does it. Nothing here reads a doc
 * FIELD to decide whether the art exists, and nothing greps source.
 *
 * MUTATION LOG — every one of these was run, observed RED, and reverted:
 *   · `setFamilyTuning` → drop the `mintTunedFamilyDocs(doc)` call
 *       → 2 red: 「a key-moving knob…」 (the doc never grows) and
 *         「a knob that does NOT move the key…」 (alpha never lands)
 *   · `playableFamilyKey` → `return tuned` unconditionally (kill the snap)
 *       → 2 red: 「the row snaps to a BAKED doc」 (0 of 84 snapped) and the
 *         nearest-size assertion (84 wrong stand-ins)
 *   · `nearestBakedFamilyKey` → `const pool = variants` (drop same-colour)
 *       → 1 red: 82 abilities get a recoloured stand-in
 *   · the baked variant record → `scale: 1` (stop tracking the baked size)
 *       → 1 red: 56 abilities snap to a mis-sized doc
 *   · `bakedCatalogue` → add one invented key
 *       → 1 red: 「bakedFamilyKeys() IS the real directory listing」
 *   · `content/config/vfx-families.json` → shockwaveRing.alpha 1 → 0.6 without
 *     regenerating the docs
 *       → 1 red: 「the SHIPPED config mints nothing」 (16 docs would be re-minted)
 *
 * ONE MUTATION THAT DID NOT BITE, recorded because it says what is NOT guarded:
 * changing a CODE default (`W3X_ART_FAMILIES.shockwaveRing.alpha`) alone leaves
 * everything green — the shipped config overrides that field, so the runtime is
 * unaffected. The code↔config drift on the KEY-bearing fields is caught instead
 * by 「bakedFamilyKeys() IS the real directory listing」.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HttpContentSource,
  Arenas,
  Configs,
  Models,
  VfxDefs,
  type ConfigVfxFamiliesDoc,
  type VfxDoc,
} from "@ggd/shared/content";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import { ContentDb } from "../../content/ContentDb";
import { ensureContentLoaded, __resetContentBoot } from "../../content/bootContent";
import { w3xAbilityArtRows, w3xArtFor, setFamilyTuning, mintTunedFamilyDocs } from "./w3xAbilityArt";
import { bakedFamilyKeys, resolveAllFamilyArt, resolveFamilyArt } from "./familyTuning";

const CONTENT = fileURLToPath(new URL("../../../../../content/", import.meta.url));

/** fetch over the REAL content tree on disk (the browser's own URL shapes). */
function diskFetch(): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    if (!url.startsWith("/content/")) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    const file = join(CONTENT, url.slice("/content/".length));
    if (!existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    const body = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }) as unknown as typeof fetch;
}

let db: ContentDb;

/** the SHIPPED console doc — the exact bytes `ContentDb.load()` installs */
const SHIPPED: ConfigVfxFamiliesDoc = JSON.parse(
  readFileSync(join(CONTENT, "config", "vfx-families.json"), "utf8"),
) as ConfigVfxFamiliesDoc;

/** the `fx.fam.*` files that really exist */
const ON_DISK = new Set(
  readdirSync(join(CONTENT, "vfx"))
    .filter((f) => f.startsWith("fx.fam.") && f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length)),
);

/** the operator action that used to delete 91 abilities' art */
function withRingScale(scale: number): ConfigVfxFamiliesDoc {
  const next = JSON.parse(JSON.stringify(SHIPPED)) as ConfigVfxFamiliesDoc;
  next.families!.shockwaveRing!.scale = scale;
  return next;
}

/**
 * The 91 shockwaveRing abilities MINUS the ones `w3xAbilityArtRows()` promotes to
 * their own extracted emitters — those legitimately never reach the family row.
 */
const RING_IDS = resolveAllFamilyArt(null)
  .filter((r) => r.family === "shockwaveRing" && !w3xAbilityArtRows()[r.abilityId])
  .map((r) => r.abilityId);

const peak = (d: VfxDoc): number =>
  d.sizeStops ? Math.max(...d.sizeStops.map(([, s]) => s)) : d.size.start;

/** the brightest alpha anywhere in the ramp — what `alpha` multiplies */
const peakAlpha = (d: VfxDoc): number =>
  d.colorStops
    ? Math.max(...d.colorStops.map(([, c]) => c[3]))
    : Math.max(d.color.start[3], d.color.end[3]);

beforeAll(async () => {
  for (const r of [Champions, Abilities]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs]) r.clear();
  __resetContentBoot();
  const fn = diskFetch();
  vi.stubGlobal("fetch", fn);
  await ensureContentLoaded({ source: new HttpContentSource({ baseUrl: "/content", fetchFn: fn }) });
  db = new ContentDb();
  await db.load("arena.skeleton");
}, 60_000);

afterEach(() => {
  // every test installs its own tuning; put the shipped one back so the next
  // one cannot inherit a bumped ring
  setFamilyTuning(SHIPPED);
});

afterAll(() => {
  vi.unstubAllGlobals();
  __resetContentBoot();
});

describe("family tuning: the knob must never delete the effect", () => {
  it("sanity — the db really loaded, and 91 shockwaveRing abilities exist", () => {
    expect(db.ready).toBe(true);
    expect(db.vfxFor("fx.ember-bolt-cast")).not.toBeNull();
    expect(RING_IDS.length).toBeGreaterThan(70);
    expect(ON_DISK.size).toBe(78);
  });

  it("WITNESS: bumping the ring scale really does compute keys that no file backs", () => {
    // Without this, every assertion below could pass because the tuned key
    // happened to be one of the 78 baked ones (failure ④: an assertion whose
    // direction has nothing to do with the defect).
    const bumped = withRingScale(1.3);
    const unbacked = RING_IDS.map((id) => resolveFamilyArt(id, bumped)!.vfxKey).filter(
      (k) => !ON_DISK.has(k),
    );
    expect(unbacked.length, "the retune no longer moves any key — pick a different bump").toBe(
      RING_IDS.length,
    );
  });

  it("bakedFamilyKeys() IS the real directory listing (the snap target is not fiction)", () => {
    const baked = [...bakedFamilyKeys()].sort();
    expect(baked).toEqual([...ON_DISK].sort());
  });

  it("the SHIPPED config mints nothing — the runtime never shadows the bytes on disk", () => {
    // `generateFamilyContent.ts` derives content/config/vfx-families.json from
    // the very same constants as the docs, so an untouched console must be a
    // no-op here. A non-zero count means the three places (content config /
    // code defaults / baked docs) have drifted and players are silently being
    // served code-built docs instead of the ones in the bundle.
    //
    // Put the BYTES ON DISK back into the registry first. Without this the
    // assertion measures nothing: a previous `setFamilyTuning(SHIPPED)` would
    // already have minted the drifted docs, and the second call would find its
    // own output and report 0.
    for (const id of ON_DISK) {
      VfxDefs.register(JSON.parse(readFileSync(join(CONTENT, "vfx", `${id}.json`), "utf8")) as VfxDoc);
    }
    expect(mintTunedFamilyDocs(SHIPPED), "the shipped config no longer describes the baked docs").toBe(0);
  });

  it("a key-moving knob keeps EVERY effect AND actually makes it bigger", () => {
    setFamilyTuning(SHIPPED);
    const before = new Map<string, number>();
    for (const id of RING_IDS) {
      const doc = db.vfxFor(w3xArtFor(id)!.primary);
      expect(doc, `${id}: broken before the retune — this test is measuring nothing`).not.toBeNull();
      before.set(id, peak(doc!));
    }

    setFamilyTuning(withRingScale(1.3));
    const dead: string[] = [];
    const notBigger: string[] = [];
    for (const id of RING_IDS) {
      const art = w3xArtFor(id);
      if (!art) {
        dead.push(`${id}: w3xArtFor answered nothing`);
        continue;
      }
      const doc = db.vfxFor(art.primary);
      if (!doc) {
        dead.push(`${id}: vfxFor("${art.primary}") is null → the cast falls to fx.prim.*`);
        continue;
      }
      if (!art.primary.startsWith("fx.fam.shockwave-ring.")) {
        dead.push(`${id}: fell off the family onto ${art.primary}`);
        continue;
      }
      if (peak(doc) <= before.get(id)!) notBigger.push(`${id}: ${before.get(id)} → ${peak(doc)}`);
    }
    expect(dead, `${dead.length} ability(ies) lost their family art to a scale nudge`).toEqual([]);
    expect(notBigger, "the knob was swallowed — the doc did not grow").toEqual([]);
  });

  it("a per-ability w3xScale override also keeps the effect (the second reported knob)", () => {
    const id = RING_IDS[0]!;
    const tuned = JSON.parse(JSON.stringify(SHIPPED)) as ConfigVfxFamiliesDoc;
    tuned.abilities![id] = { ...(tuned.abilities?.[id] ?? { family: "shockwaveRing" }), w3xScale: 7.5 };
    expect(ON_DISK.has(resolveFamilyArt(id, tuned)!.vfxKey), "pick a scale the bake does not cover").toBe(
      false,
    );

    setFamilyTuning(tuned);
    const art = w3xArtFor(id)!;
    expect(art.primary.startsWith("fx.fam.shockwave-ring.")).toBe(true);
    expect(db.vfxFor(art.primary), `${id}: vfxFor("${art.primary}") is null`).not.toBeNull();
  });

  it("a knob that does NOT move the key still reaches the doc (alpha was inert before)", () => {
    setFamilyTuning(SHIPPED);
    const id = RING_IDS[0]!;
    const base = db.vfxFor(w3xArtFor(id)!.primary)!;
    const baseAlpha = peakAlpha(base);
    expect(baseAlpha).toBeGreaterThan(0);

    const tuned = JSON.parse(JSON.stringify(SHIPPED)) as ConfigVfxFamiliesDoc;
    tuned.families!.shockwaveRing!.alpha = 0.25;
    setFamilyTuning(tuned);
    const art = w3xArtFor(id)!;
    // the key is UNCHANGED — alpha is not part of the doc id, which is exactly
    // why this knob used to be inert: the runtime kept reading the baked file
    expect(art.primary).toBe(w3xArtFor(id)!.primary);
    const doc = db.vfxFor(art.primary);
    expect(doc, "the alpha knob deleted the doc").not.toBeNull();
    expect(peakAlpha(doc!), "alpha never reached the rendered doc").toBeLessThan(baseAlpha);
  });
});

describe("family tuning: the degraded content path still draws the family", () => {
  /**
   * `ContentDb.loadByFetch` (boot failed → skeleton registries) serves vfx from
   * a PRIVATE map that `VfxDefs` never sees, so minting into the registry
   * cannot help there. An empty registry is the only observable of that state,
   * and it is what this test reproduces: clear it, install the retune (mint is
   * skipped because nothing can read it), read the rows, then put the registry
   * back exactly as content boot had it and check the keys the rows CACHED.
   */
  it("when the registry cannot serve the tuned key, the row snaps to a BAKED doc", () => {
    const snapshot = VfxDefs.all();
    expect(snapshot.length).toBeGreaterThan(100);

    VfxDefs.clear();
    setFamilyTuning(withRingScale(1.3));
    const chosen = new Map<string, string>();
    for (const id of RING_IDS) chosen.set(id, w3xArtFor(id)!.primary);

    for (const d of snapshot) VfxDefs.register(d);

    const unplayable: string[] = [];
    for (const [id, key] of chosen) {
      if (!key.startsWith("fx.fam.shockwave-ring.")) {
        unplayable.push(`${id}: fell off the family onto ${key}`);
        continue;
      }
      if (!db.vfxFor(key)) unplayable.push(`${id}: vfxFor("${key}") is null`);
    }
    expect(unplayable, `${unplayable.length} ability(ies) would draw NOTHING`).toEqual([]);
    // and the snap really is a DEGRADE, not a coincidence: the tuned key it
    // replaced is one of the ones the witness proved has no file
    const tunedKeys = new Set(RING_IDS.map((id) => resolveFamilyArt(id, withRingScale(1.3))!.vfxKey));
    const snapped = [...chosen.values()].filter((k) => !tunedKeys.has(k));
    expect(snapped.length, "nothing was snapped — the fallback branch never ran").toBe(RING_IDS.length);
  });

  it("the snap keeps the FAMILY and the COLOUR, and lands on the NEAREST baked size", () => {
    // What the fallback SHOULD choose, computed from the directory listing
    // rather than from the code under test: same family + same colour, then
    // the smallest |Δscale|, ties on the key.
    const s = (k: string): number => Number(k.slice(k.lastIndexOf(".s") + 2));
    const expected = new Map<string, string>();
    for (const id of RING_IDS) {
      const tuned = resolveFamilyArt(id, withRingScale(1.3))!.vfxKey;
      const prefix = `${tuned.slice(0, tuned.lastIndexOf("."))}.`;
      const pool = [...ON_DISK].filter((k) => k.startsWith(prefix)).sort();
      expect(pool.length, `${id}: no baked doc shares the colour of ${tuned}`).toBeGreaterThan(0);
      let best = pool[0]!;
      for (const k of pool) if (Math.abs(s(k) - s(tuned)) < Math.abs(s(best) - s(tuned))) best = k;
      expected.set(id, best);
    }

    const snapshot = VfxDefs.all();
    VfxDefs.clear();
    setFamilyTuning(withRingScale(1.3));
    const wrong: string[] = [];
    for (const id of RING_IDS) {
      const key = w3xArtFor(id)!.primary;
      if (key !== expected.get(id)) wrong.push(`${id}: snapped to ${key}, nearest baked is ${expected.get(id)}`);
    }
    for (const d of snapshot) VfxDefs.register(d);

    expect(wrong, `${wrong.length} ability(ies) got the wrong stand-in (recoloured or mis-sized)`).toEqual([]);
  });
});
