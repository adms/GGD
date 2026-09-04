import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EDITOR_DESKTOP_SOURCE_SCHEMA, type EditorDesktopSourceInfo } from "@ggd/shared/editorDesktop";
import { buildServer } from "./server";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "ggd-desktop-source-"));
  roots.push(value);
  return value;
}

const source: EditorDesktopSourceInfo = {
  schema: EDITOR_DESKTOP_SOURCE_SCHEMA,
  kind: "remote",
  state: "current",
  sourceUrl: "https://ggd.adms.ai",
  contentBaseUrl: "https://ggd.adms.ai/content/",
  workspacePath: "/local/workspace",
  pinnedContentVersion: "cv_111111111111",
  latestRemoteContentVersion: "cv_111111111111",
  workingContentVersion: "cv_222222222222",
  offline: false,
  conflicts: [],
  compatibilityWarnings: [],
  contractStatus: "remote-target-profile",
  targetProfileDigest: "abcdef123456",
  message: "ok",
};

describe("desktop source bridge", () => {
  it("is absent on web servers and returns the shell-owned status when enabled", async () => {
    const ordinary = buildServer({ contentDir: root(), watch: false, logger: false });
    expect((await ordinary.inject({ method: "GET", url: "/content-api/desktop-source" })).statusCode).toBe(404);
    await ordinary.close();

    const desktop = buildServer({ contentDir: root(), watch: false, logger: false, desktopSource: () => source });
    const response = await desktop.inject({ method: "GET", url: "/content-api/desktop-source" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(source);
    await desktop.close();
  });
});
