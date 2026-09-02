import { describe, expect, it } from "vitest";
import { appModeFromPathname, pathnameForAppMode } from "./appRoute";

describe("top-level editor routes", () => {
  it.each([
    ["/editor/vfx-forge", { kind: "vfx-forge" }],
    ["/editor/vfx-forge/", { kind: "vfx-forge" }],
    ["/editor/forge", { kind: "forge" }],
    ["/editor/export", { kind: "export" }],
  ] as const)("opens %s on the matching authoring screen", (pathname, expected) => {
    expect(appModeFromPathname(pathname)).toEqual(expected);
  });

  it("falls back to the collection browser for unknown or root paths", () => {
    expect(appModeFromPathname("/editor/")).toEqual({ kind: "collection", collection: "champions" });
    expect(appModeFromPathname("/editor/not-a-screen")).toEqual({ kind: "collection", collection: "champions" });
  });

  it("builds shareable paths from Vite's base path", () => {
    expect(pathnameForAppMode({ kind: "vfx-forge" }, "/editor/")).toBe("/editor/vfx-forge");
    expect(pathnameForAppMode({ kind: "forge" }, "/editor/")).toBe("/editor/forge");
    expect(pathnameForAppMode({ kind: "export" }, "/editor/")).toBe("/editor/export");
    expect(pathnameForAppMode({ kind: "collection", collection: "abilities" }, "/editor/")).toBe("/editor/");
  });
});
