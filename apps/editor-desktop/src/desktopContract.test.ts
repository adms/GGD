import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop delivery contract", () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
  it("ships both macOS and Windows targets and keeps the renderer local", () => {
    expect(pkg.build.mac.target).toEqual(expect.arrayContaining(["dmg", "zip"]));
    expect(pkg.build.win.target).toEqual(expect.arrayContaining(["nsis", "portable"]));
    expect(pkg.build.extraResources).toEqual(expect.arrayContaining([
      { from: "../editor/dist", to: "editor" },
      { from: "../admin/dist", to: "admin" },
    ]));
  });
});
