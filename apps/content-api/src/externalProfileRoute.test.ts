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

describe("POST /content-api/external-target-profile", () => {
  it("bridges one allow-listed profile without exposing an open proxy", async () => {
    root = mkdtempSync(join(tmpdir(), "ggd-profile-route-"));
    const externalProfileFetch = vi.fn(async () => new Response(JSON.stringify({
      schema: "ggd-editor-target-profile@1",
      supportedModes: ["bootstrap"],
    }), { headers: { "content-type": "application/json" } }));
    app = buildServer({
      contentDir: root,
      backupDir: join(root, ".backups"),
      externalProfileHosts: ["profiles.example.test"],
      externalProfileFetch,
    });
    await app.ready();

    const ok = await app.inject({
      method: "POST",
      url: "/content-api/external-target-profile",
      payload: { url: "https://profiles.example.test/editor-target-profile.json" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ schema: "ggd-editor-target-profile@1" });
    expect(externalProfileFetch).toHaveBeenCalledOnce();

    const blocked = await app.inject({
      method: "POST",
      url: "/content-api/external-target-profile",
      payload: { url: "https://127.0.0.1/private" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(externalProfileFetch).toHaveBeenCalledOnce();
  });
});
