/**
 * adminui-content-load: the admin content-tree reader — index parse, doc→row
 * projection, icon URL resolution, and the bounded-concurrency streaming
 * loader that paints id rows immediately then hydrates names/icons (tolerating
 * individual doc failures).
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { contentAssetUrl, loadCollection, parseIndex, placeholderRow, rowFromDoc } from "./content";

describe("index + row projection (adminui-content-load)", () => {
  it("parseIndex keeps well-formed entries and drops junk", () => {
    cover("adminui-content-load");
    const raw = {
      entries: [
        { id: "godie-e001", path: "champions/godie-e001.json" },
        { id: "", path: "x.json" }, // empty id dropped
        { path: "no-id.json" }, // missing id dropped
        "nope", // non-object dropped
      ],
    };
    expect(parseIndex(raw)).toEqual([{ id: "godie-e001", path: "champions/godie-e001.json" }]);
    expect(parseIndex(null)).toEqual([]);
    expect(parseIndex({})).toEqual([]);
  });

  it("placeholderRow shows the id until hydration; rowFromDoc fills real fields", () => {
    cover("adminui-content-load");
    const ph = placeholderRow("godie-e002");
    expect(ph).toMatchObject({ id: "godie-e002", name: "godie-e002", hydrated: false });

    const champ = rowFromDoc("godie-e002", {
      name: "亞瑟王",
      role: "fighter",
      icon: "assets/icons/champions/godie-e002.png",
    });
    expect(champ).toMatchObject({ id: "godie-e002", name: "亞瑟王", role: "fighter", hydrated: true });
    expect(champ.icon).toBe("assets/icons/champions/godie-e002.png");

    const item = rowFromDoc("godie-i000", { name: "丈八蛇矛", cost: 10000, tier: 5 });
    expect(item).toMatchObject({ name: "丈八蛇矛", cost: 10000, tier: 5 });

    // a doc missing a name degrades to the id (still selectable)
    expect(rowFromDoc("weird", {}).name).toBe("weird");
    // a foreign (non-assets/) icon path is ignored
    expect(rowFromDoc("x", { icon: "http://evil/x.png" }).icon).toBeUndefined();
  });

  it("contentAssetUrl resolves assets/ icons and rejects foreign/absent paths", () => {
    cover("adminui-content-load");
    expect(contentAssetUrl("assets/icons/champions/x.png")).toBe("/content/assets/icons/champions/x.png");
    expect(contentAssetUrl(undefined)).toBeNull();
    expect(contentAssetUrl("http://evil/x.png")).toBeNull();
    expect(contentAssetUrl("../secret")).toBeNull();
  });
});

describe("streaming loader (adminui-content-load)", () => {
  function fakeFetch(map: Record<string, unknown>, fail: Set<string> = new Set()): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (fail.has(url)) return new Response("boom", { status: 500 });
      if (!(url in map)) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(map[url]), { status: 200 });
    }) as unknown as typeof fetch;
  }

  it("loads the index then hydrates every doc", async () => {
    cover("adminui-content-load");
    const map = {
      "/content/champions/_index.json": {
        entries: [
          { id: "a", path: "champions/a.json" },
          { id: "b", path: "champions/b.json" },
        ],
      },
      "/content/champions/a.json": { name: "Alpha", icon: "assets/icons/champions/a.png" },
      "/content/champions/b.json": { name: "Beta", role: "mage" },
    };
    const rows = await loadCollection("champions", { fetchFn: fakeFetch(map), concurrency: 2 });
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
    expect(rows[0]!.icon).toBe("assets/icons/champions/a.png");
    expect(rows.every((r) => r.hydrated)).toBe(true);
  });

  it("keeps the id-only placeholder for a doc that fails to load", async () => {
    cover("adminui-content-load");
    const map = {
      "/content/items/_index.json": {
        entries: [
          { id: "ok", path: "items/ok.json" },
          { id: "broken", path: "items/broken.json" },
        ],
      },
      "/content/items/ok.json": { name: "Fine", cost: 100, tier: 1 },
    };
    const rows = await loadCollection("items", {
      fetchFn: fakeFetch(map, new Set(["/content/items/broken.json"])),
    });
    expect(rows.find((r) => r.id === "ok")!.name).toBe("Fine");
    // the failed doc survives as its id (never breaks the page)
    const broken = rows.find((r) => r.id === "broken")!;
    expect(broken.name).toBe("broken");
    expect(broken.hydrated).toBe(false);
  });

  it("streams partial rows through onProgress before hydration completes", async () => {
    cover("adminui-content-load");
    const map = {
      "/content/abilities/_index.json": { entries: [{ id: "q", path: "abilities/q.json" }] },
      "/content/abilities/q.json": { name: "Q spell" },
    };
    const snapshots: number[] = [];
    await loadCollection("abilities", {
      fetchFn: fakeFetch(map),
      onProgress: (rows) => snapshots.push(rows.length),
    });
    // the very first onProgress fires with the id rows (before any doc lands)
    expect(snapshots[0]).toBe(1);
  });

  it("rejects when the index itself is unreachable (nothing to show)", async () => {
    cover("adminui-content-load");
    await expect(loadCollection("champions", { fetchFn: fakeFetch({}) })).rejects.toThrow();
  });
});
