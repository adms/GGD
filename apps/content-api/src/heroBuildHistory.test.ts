import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { buildAuthoringProcessor } from "@ggd/shared/content/import/authoringProcessor";
import { snapshotHeroGenerator, snapshotHeroProcessor } from "@ggd/shared/content/import/heroBuildSources";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { retainHeroBuildSources } from "./heroBuildHistory";
import { ImportStore } from "./importStore";

const repo = resolve(import.meta.dirname, "../../..");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() { const root = mkdtempSync(join(tmpdir(), "ggd-build-source-")); roots.push(root); return root; }

it("restores exact generator and processor sources and lock files after restarting the history store", () => {
  const root = fixture(), dir = join(root, "history");
  const expected = buildAuthoringProcessor(repo).fingerprint;
  const saved = retainHeroBuildSources(repo, new ImportStore({ dir }), expected);
  const reopened = new ImportStore({ dir });
  for (const [kind, versionId, capture] of [["hero-generator", saved.generatorVersion, snapshotHeroGenerator], ["hero-processor", saved.processorVersion, snapshotHeroProcessor]] as const) {
    const files = reopened.readWorkFiles(`ggd-${kind}-source`, versionId)!;
    const target = join(root, kind);
    for (const [path, bytes] of files) if (path.startsWith("source/")) {
      const destination = join(target, path.slice(7)); mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
    }
    expect(readFileSync(join(target, "pnpm-lock.yaml"))).toEqual(readFileSync(join(repo, "pnpm-lock.yaml")));
    expect(capture(target).versionId).toBe(versionId);
    expect(contentSha256(JSON.parse(files.get("source-manifest.json")!.toString()))).toBe(versionId);
  }
  expect(retainHeroBuildSources(repo, reopened, expected)).toEqual(saved);
  expect(reopened.listWorkVersions("ggd-hero-generator-source")).toHaveLength(1);
  expect(reopened.active()).toBeNull();
});

it("rejects stale service fingerprints before retaining sources", () => {
  const store = new ImportStore({ dir: fixture() });
  expect(() => retainHeroBuildSources(repo, store, "000000000000")).toThrow("服務啟動版本不同");
  expect(store.listWorkVersions("ggd-hero-processor-source")).toEqual([]);
});

it("records a new generator version when a source dependency or the dependency lock changes", () => {
  const root = fixture(), initial = snapshotHeroGenerator(repo);
  for (const [path, bytes] of initial.files) if (path.startsWith("source/")) {
    const target = join(root, path.slice(7)); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  }
  expect(snapshotHeroGenerator(root).versionId).toBe(initial.versionId);
  const source = join(root, "packages/shared/src/content/heroForge.ts");
  writeFileSync(source, readFileSync(source, "utf8") + "\n// generator version test\n");
  const changed = snapshotHeroGenerator(root).versionId;
  expect(changed).not.toBe(initial.versionId);
  const lock = join(root, "pnpm-lock.yaml"); writeFileSync(lock, readFileSync(lock, "utf8") + "\n# dependency version test\n");
  expect(snapshotHeroGenerator(root).versionId).not.toBe(changed);
});
