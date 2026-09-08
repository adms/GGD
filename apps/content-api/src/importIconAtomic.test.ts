import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ImportStore } from "./importStore";

const fault = vi.hoisted(() => ({ nextWrite: false }));
vi.mock("node:fs", async (load) => {
  const fs = await load<typeof import("node:fs")>();
  return { ...fs, writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
    if (fault.nextWrite) {
      fault.nextWrite = false;
      fs.writeFileSync(args[0], "half");
      throw Object.assign(new Error("injected disk write failure"), { code: "EIO" });
    }
    return fs.writeFileSync(...args);
  } };
});
const roots: string[] = [];
afterEach(() => { fault.nextWrite = false; for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it("a partial disk write never becomes an immutable icon object and retry succeeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "ggd-icon-atomic-")); roots.push(dir);
  const source = Buffer.from("complete original image"); const normalized = Buffer.from("complete normalized image");
  const processor = { preserveAlpha: true, processorFingerprint: "test" };
  const store = new ImportStore({ dir });
  fault.nextWrite = true;
  expect(() => store.putNormalizedIcon(source, normalized, processor)).toThrow("injected disk write failure");
  expect(readdirSync(join(dir, "objects/icon-sources"))).toEqual([]);
  const result = new ImportStore({ dir }).putNormalizedIcon(source, normalized, processor);
  expect(result.contentSha256).toBe(`sha256:${createHash("sha256").update(normalized).digest("hex")}`);
  expect(readFileSync(join(dir, "objects/icon-sources", result.sourceSha256.slice(7)))).toEqual(source);
  expect(readFileSync(join(dir, "objects/icons", result.contentSha256.slice(7) + ".webp"))).toEqual(normalized);
});
