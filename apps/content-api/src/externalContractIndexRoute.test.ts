import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server";

let app: FastifyInstance | null = null;
let root: string | null = null;

afterEach(async () => {
  await app?.close();
  if (root) rmSync(root, { recursive: true, force: true });
  app = null;
  root = null;
});

describe("GET /content-api/external-contract-index", () => {
  it("bridges only the allow-listed Main contract route", async () => {
    root = mkdtempSync(join(tmpdir(), "ggd-contract-route-"));
    const externalProfileFetch = vi.fn(async () => new Response(JSON.stringify({
      schema: "ggd-editor-contract-index@1",
      digest: "contract",
      representations: [],
    }), { headers: { "content-type": "application/json" } }));
    app = buildServer({
      contentDir: root,
      backupDir: join(root, ".backups"),
      externalProfileHosts: ["profiles.example.test"],
      externalProfileFetch,
    });
    await app.ready();

    const ok = await app.inject({
      method: "GET",
      url: "/content-api/external-contract-index?profileUrl=" +
        encodeURIComponent("https://profiles.example.test/content/editor-target-profile.json") +
        "&href=" + encodeURIComponent("/api/v1/content-import/contract-index"),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ schema: "ggd-editor-contract-index@1" });

    const blocked = await app.inject({
      method: "GET",
      url: "/content-api/external-contract-index?profileUrl=" +
        encodeURIComponent("https://profiles.example.test/content/editor-target-profile.json") +
        "&href=" + encodeURIComponent("https://evil.example/api/v1/content-import/contract-index"),
    });
    expect(blocked.statusCode).toBe(403);
    expect(externalProfileFetch).toHaveBeenCalledOnce();
  });
});
