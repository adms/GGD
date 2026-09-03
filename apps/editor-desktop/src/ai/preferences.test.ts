import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAiPreference, writeAiPreference } from "./preferences";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("desktop AI preference", () => {
  it("distinguishes a first launch from an explicit off choice", () => {
    const root = mkdtempSync(join(tmpdir(), "ggd-ai-preference-"));
    roots.push(root);
    expect(readAiPreference(root)).toEqual({ mode: "off", configured: false });
    writeAiPreference(root, "off");
    expect(readAiPreference(root)).toEqual({ mode: "off", configured: true });
    writeAiPreference(root, "local");
    expect(readAiPreference(root)).toEqual({ mode: "local", configured: true });
  });
});
