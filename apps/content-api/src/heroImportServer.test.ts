import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildHeroImportServer } from "./heroImportServer";
import { HERO_IMPORT_PREFIX as prefix, heroImportHeaders, signHeroImport } from "@ggd/shared/content/node/heroImportAuth";

const repo = resolve(import.meta.dirname, "../../..");
const secret = "private-hero-import-fixture-20260906";
const dir = mkdtempSync(join(tmpdir(), "ggd-private-hero-import-"));
const app = buildHeroImportServer({ repoRoot: repo, contentDir: join(repo, "content"), importDir: dir, secret, gameVersion: "private-import-proof" });
beforeAll(() => app.ready());
afterAll(async () => { await app.close(); rmSync(dir, { recursive: true, force: true }); });

it("uses the same binary-body and operation-bound HMAC vector as the Go bridge", () => {
  const path = prefix + "/prepare-work";
  const headers = heroImportHeaders(secret, "POST", path, new Uint8Array([80, 75, 3, 4]), { "x-ggd-work-id": "work-proof", "x-ggd-operation-id": "operation-proof" }, 1788680000);
  expect(headers["x-ggd-import-auth"]).toBe("d718c9d0922b4af0b92c4a80de7daa6aff2197a9671acc5eedeb4542c5efa1a2");
  expect(signHeroImport(secret, "POST", path, { ...headers, "x-ggd-operation-id": "other" })).not.toBe(headers["x-ggd-import-auth"]);
});
it("rejects unsigned, stale, path-swapped and body-swapped requests before importer work", async () => {
  const url = prefix + "/active/target-profile";
  expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  expect((await app.inject({ method: "GET", url, headers: heroImportHeaders(secret, "GET", url, undefined, {}, 1788680000) })).statusCode).toBe(401);
  expect((await app.inject({ method: "GET", url: prefix + "/work-versions/hero/version", headers: heroImportHeaders(secret, "GET", url) })).statusCode).toBe(401);
  const upload = prefix + "/hero-package";
  const headers = { ...heroImportHeaders(secret, "POST", upload, new Uint8Array([1])), "content-type": "application/zip" };
  expect((await app.inject({ method: "POST", url: upload, headers, payload: Buffer.from([2]) })).statusCode).toBe(401);
});
it("offers the same work importer while official activation and Editor CRUD remain unreachable", async () => {
  const url = prefix + "/active/target-profile";
  const response = await app.inject({ method: "GET", url, headers: heroImportHeaders(secret, "GET", url) });
  expect(response.statusCode).toBe(200);
  expect(response.body).toContain("/prepare-work");
  expect(response.body).not.toContain('"path":"/apply"');
  for (const path of [prefix + "/apply", prefix + "/rollback", "/content-api/champions/hero"]) {
    expect((await app.inject({ method: "POST", url: path, headers: heroImportHeaders(secret, "POST", path) })).statusCode).toBe(404);
  }
  const malformed = prefix + "/hero-package", payload = new Uint8Array([1]);
  expect((await app.inject({ method: "POST", url: malformed, headers: { ...heroImportHeaders(secret, "POST", malformed, payload), "content-type": "application/zip" }, payload: Buffer.from(payload) })).statusCode).toBe(422);
});
