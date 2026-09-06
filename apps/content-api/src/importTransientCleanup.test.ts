import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ImportStore } from "./importStore";
import { ImportTransientCleanup, IMPORT_TRANSIENT_RETENTION } from "./importTransientCleanup";

const roots: string[] = [];
const cursors: ImportTransientCleanup[] = [];
const NOW = Date.now() + 1000;
const old = NOW - 2 * IMPORT_TRANSIENT_RETENTION.iconCacheMs;
const digest = "a".repeat(64);
function root() { const dir = mkdtempSync(join(tmpdir(), "ggd-transient-cleanup-")); roots.push(dir); return dir; }
function write(path: string, bytes = "cached", date = old) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); utimesSync(path, date / 1000, date / 1000); }
function cleaner(dir: string) { const cursor = new ImportTransientCleanup(dir, () => NOW); cursors.push(cursor); return cursor; }
function cycle(cleanup: ImportTransientCleanup) {
  for (let count = 0; count < 1000; count++) {
    const result = cleanup.step(); expect(result.scanned).toBeLessThanOrEqual(256); expect(result.removed).toBeLessThanOrEqual(16); expect(result.errors).toBe(0);
    if (result.cycleComplete) return;
  }
  throw new Error("bounded cursor did not finish");
}
afterEach(() => { for (const cursor of cursors.splice(0)) cursor.close(); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("importer transient retention", () => {
  it("evicts expired cache copies but preserves complete immutable assets and official history", () => {
    const dir = root(); const store = new ImportStore({ dir });
    const icon = store.putNormalizedIcon(Buffer.from("source"), Buffer.from("webp"), { preserveAlpha: true, processorFingerprint: "test" });
    const version = store.putWorkVersion({ workId: "hero-one", projectId: "hero-one", packageDigest: `sha256:${digest}` }, new Map([[icon.path, Buffer.from("webp")]]));
    for (const group of ["icons", "icon-sources", "icon-receipts"]) for (const file of readdirSync(join(dir, "objects", group))) utimesSync(join(dir, "objects", group, file), old / 1000, old / 1000);
    for (const path of ["staging/official/asset.webp", "history/old.json", "candidates/old/package.json", "operations/op.json"]) write(join(dir, path));
    cycle(cleaner(dir));
    for (const group of ["icons", "icon-sources", "icon-receipts"]) expect(readdirSync(join(dir, "objects", group))).toEqual([]);
    expect(store.readWorkFile("hero-one", version.record.versionId, icon.path)).toEqual(Buffer.from("webp"));
    for (const path of ["staging/official/asset.webp", "history/old.json", "candidates/old/package.json", "operations/op.json"]) expect(readFileSync(join(dir, path), "utf8")).toBe("cached");
  });

  it("resumes bounded scans without starving entries after a large live prefix", () => {
    const dir = root();
    for (let i = 0; i < 600; i++) write(join(dir, "objects/icons", `${i.toString(16).padStart(64, "0")}.webp`), "recent", NOW);
    for (let i = 600; i < 650; i++) write(join(dir, "objects/icons", `${i.toString(16).padStart(64, "0")}.webp`));
    cycle(cleaner(dir));
    expect(readdirSync(join(dir, "objects/icons"))).toHaveLength(600);
  });

  it("removes crash leftovers one file at a time and retains active or committed work trees", () => {
    const dir = root(); const versions = join(dir, "works", digest, "versions");
    const pending = join(versions, `${digest}.pending-11111111-1111-4111-8111-111111111111`);
    for (let i = 0; i < 40; i++) write(join(pending, "assets", `${i}.webp`));
    utimesSync(pending, old / 1000, old / 1000);
    const recent = join(versions, `${digest}.pending-22222222-2222-4222-8222-222222222222`);
    write(join(recent, "assets/live.webp"), "in-progress", NOW);
    write(join(versions, digest, "assets/committed.webp"));
    cycle(cleaner(dir));
    expect(existsSync(pending)).toBe(false);
    expect(readFileSync(join(recent, "assets/live.webp"), "utf8")).toBe("in-progress");
    expect(existsSync(join(versions, digest, "assets/committed.webp"))).toBe(true);
  });

  it("refuses symlinks, unknown files and newly refreshed cache objects", () => {
    const dir = root(); const outside = root(); const secret = join(outside, `${digest}.webp`); write(secret, "untouched");
    mkdirSync(join(dir, "objects/icons"), { recursive: true });
    symlinkSync(secret, join(dir, "objects/icons", `${digest}.webp`));
    symlinkSync(outside, join(dir, "objects/icon-sources"));
    write(join(dir, "objects/icons/operator-notes.txt"));
    const store = new ImportStore({ dir });
    // A second store with regular cache directories exercises reuse/refresh.
    const refreshed = root(); const second = new ImportStore({ dir: refreshed });
    const args = [Buffer.from("source"), Buffer.from("icon"), { preserveAlpha: true, processorFingerprint: "test" }] as const;
    const icon = second.putNormalizedIcon(...args); const cached = join(refreshed, "objects/icons", icon.contentSha256.slice(7) + ".webp");
    utimesSync(cached, old / 1000, old / 1000); second.putNormalizedIcon(...args);
    cycle(cleaner(dir)); cycle(cleaner(refreshed));
    expect(readFileSync(secret, "utf8")).toBe("untouched");
    expect(existsSync(join(dir, "objects/icons/operator-notes.txt"))).toBe(true);
    expect(existsSync(cached)).toBe(true);
    expect(store.active()).toBeNull();
  });
});
