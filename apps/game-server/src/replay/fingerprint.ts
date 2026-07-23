/**
 * The replay identity key: what a recording must agree with before it may be
 * played back.
 *
 * `contentVersion` alone is NOT sufficient, and finding out why is what this
 * file exists for:
 *
 *   1. ORDER IS LOAD-BEARING BUT INVISIBLE TO cv_. `economy/draft.ts` rolls
 *      augments over `Augments.all()` and `MatchController.randomChampionPool`
 *      picks over `Champions.ids()` — both INSERTION order, both indexed with
 *      `world.rng`. Insertion order comes from each collection's `_index.json`
 *      entry order, but `hashCollection` SORTS entries before hashing. Two
 *      content trees with an identical cv_ can therefore roll different augments
 *      and different champions.
 *   2. SKELETON CONTENT COMES FROM CODE. `registerSkeletonContent()` runs in
 *      every MatchController constructor and injects champions, items, augments
 *      and a loot table into the SAME registries, after content. Editing
 *      skeleton.ts changes the draft and champion pools and moves no cv_.
 *
 * So the fingerprint hashes, for every registry the sim reads, the ids IN
 * REGISTRATION ORDER together with each document's own content hash. It is
 * computed ONCE per process (the registries are populated at boot and
 * `registerSkeletonContent` is idempotent) and cached.
 *
 * A pure CODE change — a tweak inside BasicAttackSystem, say — moves neither
 * cv_ nor this fingerprint. Nothing can make it: that is precisely what the
 * `buildStamp` below and, ultimately, the per-tick digest alarm are for.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashDoc, sha256Hex, stableStringify } from "@ggd/shared/content";
import { Arenas, Configs, Models, StatusEffects, VfxDefs } from "@ggd/shared/content";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "@ggd/shared/sim/content/registry";

/** Everything below is `{ ids(): string[]; tryGet(id): unknown }`-shaped. */
interface AnyRegistry {
  ids(): string[];
  tryGet(id: string): unknown;
}

/**
 * Registries in a FIXED order, so the fingerprint is a function of content and
 * nothing else. Only registries the SIM reads belong here — adding a purely
 * cosmetic one would make cosmetic edits refuse otherwise-valid replays.
 */
const FINGERPRINTED: readonly (readonly [string, AnyRegistry])[] = [
  ["champions", Champions as unknown as AnyRegistry],
  ["abilities", Abilities as unknown as AnyRegistry],
  ["items", Items as unknown as AnyRegistry],
  ["augments", Augments as unknown as AnyRegistry],
  ["projectiles", Projectiles as unknown as AnyRegistry],
  ["lootTables", LootTables as unknown as AnyRegistry],
  ["arenas", Arenas as unknown as AnyRegistry],
  ["configs", Configs as unknown as AnyRegistry],
  ["models", Models as unknown as AnyRegistry],
  ["statusEffects", StatusEffects as unknown as AnyRegistry],
  ["vfx", VfxDefs as unknown as AnyRegistry],
];

let cachedFingerprint: string | null = null;

/**
 * `rf_<16 hex>` over every sim registry: ids in registration order, each paired
 * with its document hash. Cached for the process lifetime.
 */
export function registryFingerprint(): string {
  if (cachedFingerprint) return cachedFingerprint;
  const parts: unknown[] = [];
  for (const [name, reg] of FINGERPRINTED) {
    const ids = reg.ids();
    const entries: [string, string][] = ids.map((id) => {
      const doc = reg.tryGet(id);
      // hashDoc throws only on an undefined root, which `ids()` rules out; a
      // circular/unserialisable doc would too, so fall back to the id alone
      // rather than taking the whole server down over a fingerprint.
      try {
        return [id, hashDoc(doc)];
      } catch {
        return [id, "unhashable"];
      }
    });
    parts.push([name, entries]);
  }
  cachedFingerprint = "rf_" + sha256Hex(stableStringify(parts)).slice(0, 16);
  return cachedFingerprint;
}

/** Test seam: forget the cached value (the registries changed under us). */
export function resetRegistryFingerprintCache(): void {
  cachedFingerprint = null;
}

let cachedBuildStamp: string | null = null;

/**
 * The code stamp. `GGD_BUILD_STAMP` wins (a real deploy bakes it in); otherwise
 * we resolve the git HEAD sha by READING `.git` directly — no subprocess in a
 * game server process — and fall back to "dev" when there is no checkout.
 */
export function buildStamp(): string {
  if (cachedBuildStamp) return cachedBuildStamp;
  const fromEnv = process.env.GGD_BUILD_STAMP?.trim();
  if (fromEnv) return (cachedBuildStamp = fromEnv);
  cachedBuildStamp = readGitHead() ?? "dev";
  return cachedBuildStamp;
}

/** Resolve `.git/HEAD` (possibly through a ref file) to a short sha. */
function readGitHead(): string | null {
  // apps/game-server/src/replay -> repo root
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let up = 0; up < 8; up++) {
    try {
      const head = readFileSync(join(dir, ".git", "HEAD"), "utf8").trim();
      if (head.startsWith("ref: ")) {
        const ref = head.slice(5).trim();
        const sha = readFileSync(join(dir, ".git", ref), "utf8").trim();
        return sha.slice(0, 12);
      }
      return head.slice(0, 12);
    } catch {
      dir = dirname(dir);
    }
  }
  return null;
}
