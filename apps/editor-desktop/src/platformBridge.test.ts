import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerDesktopPlatformBridge } from "./platformBridge";

describe("desktop cloud bridge", () => {
  it("forwards exact archive bytes, actor authorization and operation identity", async () => {
    const app = Fastify();
    const upstream = vi.fn(async () => new Response(new Uint8Array([80, 75, 1]), { headers: { "content-type": "application/zip" } }));
    registerDesktopPlatformBridge(app, "https://game.example.invalid", upstream as typeof fetch, () => "http://127.0.0.1:3000");
    try {
      const body = Buffer.from([80, 75, 255, 0]);
      const result = await app.inject({ method: "POST", url: "/api/v1/hero-submissions?version=1", headers: { origin: "http://127.0.0.1:3000", authorization: "Bearer fixture", "content-type": "application/zip", "x-ggd-operation-id": "one-op" }, payload: body });
      expect(result.statusCode).toBe(200);
      const [url, request] = upstream.mock.calls[0]! as unknown as [URL, RequestInit];
      expect(url.href).toBe("https://game.example.invalid/api/v1/hero-submissions?version=1");
      expect(request.body).toEqual(Uint8Array.from(body));
      expect((request.headers as Headers).get("authorization")).toBe("Bearer fixture");
      expect((request.headers as Headers).get("x-ggd-operation-id")).toBe("one-op");
      expect(request.redirect).toBe("error");
      expect(result.rawPayload).toEqual(Buffer.from([80, 75, 1]));
    } finally { await app.close(); }
  });
  it("keeps CAS and field errors intact and rejects other browser origins", async () => {
    const app = Fastify(); const upstream = vi.fn(async () => new Response(JSON.stringify({ code: "REVISION_CONFLICT", message: "new draft" }), { status: 409, headers: { "content-type": "application/json" } }));
    registerDesktopPlatformBridge(app, "https://game.example.invalid", upstream as typeof fetch, () => "http://127.0.0.1:3000");
    try {
      const denied = await app.inject({ method: "POST", url: "/api/v1/hero-works/draft", headers: { origin: "https://other.example.invalid" }, payload: {} });
      expect(denied.statusCode).toBe(403); expect(upstream).not.toHaveBeenCalled();
      const conflict = await app.inject({ method: "POST", url: "/api/v1/hero-works/draft", payload: { expectedRevision: 0 } });
      expect(conflict.statusCode).toBe(409); expect(conflict.json().code).toBe("REVISION_CONFLICT");
    } finally { await app.close(); }
  });
  it("fails clearly without a selected cloud platform", async () => {
    const app = Fastify(); const upstream = vi.fn(); registerDesktopPlatformBridge(app, null, upstream);
    try { expect((await app.inject({ method: "GET", url: "/api/v1/me" })).statusCode).toBe(503); expect(upstream).not.toHaveBeenCalled(); }
    finally { await app.close(); }
  });
});
