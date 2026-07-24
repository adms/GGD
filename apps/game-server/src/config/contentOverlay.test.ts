/**
 * content-overlay-fetch (task #189): the game-server's boot fetch of the durable
 * data/ overlay is best-effort and fail-safe — every failure mode resolves to
 * `null` (no overlay applied) rather than throwing, so a missing/broken platform
 * never blocks the shard boot.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { fetchOverlayBundle, overlayBundleUrl, parseOverlayBundle } from "./contentOverlay";

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe("overlayBundleUrl", () => {
  it("targets the public bundle endpoint and trims a trailing slash", () => {
    cover("content-overlay-fetch");
    expect(overlayBundleUrl("http://platform:8080")).toBe("http://platform:8080/api/v1/content-overlay/bundle");
    expect(overlayBundleUrl("http://platform:8080/")).toBe("http://platform:8080/api/v1/content-overlay/bundle");
  });
});

describe("parseOverlayBundle", () => {
  it("accepts a well-formed bundle and keeps only truthy tombstones", () => {
    cover("content-overlay-fetch");
    const b = parseOverlayBundle({
      generation: 5,
      docs: { "champions/a": { id: "a" } },
      deleted: { "items/x": true, "items/y": false },
    });
    expect(b).not.toBeNull();
    expect(b!.generation).toBe(5);
    expect(Object.keys(b!.docs)).toEqual(["champions/a"]);
    expect(b!.deleted).toEqual({ "items/x": true });
  });

  it("rejects non-objects and wrong-typed docs/deleted", () => {
    cover("content-overlay-fetch");
    expect(parseOverlayBundle(null)).toBeNull();
    expect(parseOverlayBundle([1, 2])).toBeNull();
    expect(parseOverlayBundle({ docs: [], deleted: {} })).toBeNull();
    expect(parseOverlayBundle({ docs: {}, deleted: "no" })).toBeNull();
  });
});

describe("fetchOverlayBundle (fail-safe)", () => {
  it("returns the parsed bundle on a 200", async () => {
    cover("content-overlay-fetch");
    const fetchFn = (async () =>
      okResponse({ generation: 2, docs: { "champions/a": { id: "a" } }, deleted: {} })) as unknown as typeof fetch;
    const b = await fetchOverlayBundle("http://platform:8080", { fetchFn });
    expect(b?.generation).toBe(2);
  });

  it("returns null on a non-200, a throw, or a malformed body — never rejects", async () => {
    cover("content-overlay-fetch");
    const notOk = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const throws = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const garbage = (async () => okResponse({ nope: true })) as unknown as typeof fetch;
    expect(await fetchOverlayBundle("http://p", { fetchFn: notOk })).toBeNull();
    expect(await fetchOverlayBundle("http://p", { fetchFn: throws })).toBeNull();
    expect(await fetchOverlayBundle("http://p", { fetchFn: garbage })).toBeNull();
  });

  it("treats an EMPTY overlay as null (nothing to lay on)", async () => {
    cover("content-overlay-fetch");
    const empty = (async () => okResponse({ generation: 0, docs: {}, deleted: {} })) as unknown as typeof fetch;
    expect(await fetchOverlayBundle("http://p", { fetchFn: empty })).toBeNull();
  });
});
