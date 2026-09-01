import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop delivery contract", () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
  it("ships both macOS and Windows targets and isolates desktop renderers from web dist", () => {
    expect(pkg.build.mac.target).toEqual(expect.arrayContaining(["dmg", "zip"]));
    expect(pkg.build.win.target).toEqual(expect.arrayContaining(["nsis", "portable"]));
    expect(pkg.scripts["dist:mac"]).toContain("--universal");
    expect(pkg.scripts.smoke).toContain("--smoke-test");
    expect(pkg.build.mac.icon).toBe("../client/public/icons/icon-512.png");
    expect(pkg.build.win.icon).toBe(pkg.build.mac.icon);
    expect(existsSync(join(__dirname, "..", pkg.build.mac.icon))).toBe(true);
    expect(pkg.build.extraResources).toEqual(expect.arrayContaining([
      { from: "dist/renderer/editor", to: "editor" },
      { from: "dist/renderer/admin", to: "admin" },
    ]));
    expect(pkg.scripts["build:renderer"]).toContain("../editor-desktop/dist/renderer/editor");
    expect(pkg.scripts["build:renderer"]).toContain("../editor-desktop/dist/renderer/admin");
    expect(pkg.scripts["build:renderer"]).not.toContain("vite build --mode desktop &&");
  });
});
