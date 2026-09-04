import { describe, expect, it } from "vitest";
import { buildLocalIconBundleZip } from "./bundle";

const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" });

describe("local icon portable bundle", () => {
  it("is deterministic and refuses owner/path drift", async () => {
    const crypto = globalThis.crypto;
    const digestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    const digest = `sha256:${[...digestBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const icon = {
      schema: "ggd-editor-staged-icon@2" as const,
      kind: "abilities" as const,
      docId: "hero.q",
      contentPath: "assets/icons/abilities/hero.q.webp",
      sourcePath: "assets/icon/abilities/hero.q/source.webp",
      mimeType: "image/webp" as const,
      width: 512,
      height: 512,
      contentSha256: digest,
      bytes: 4,
      blob,
      sourcePreserved: true as const,
      baseSha256: null,
      sourceName: "hero.png",
      sourceMimeType: "image/png",
      sourceBytes: 99,
      stagedAt: "2026-09-04T00:00:00.000Z",
    };
    const a = await buildLocalIconBundleZip([icon]);
    const b = await buildLocalIconBundleZip([icon]);
    expect(a.bytes).toEqual(b.bytes);
    expect(a.archiveSha256).toBe(b.archiveSha256);
    expect(a.filename).toMatch(/^ggd-icons-[0-9a-f]{12}\.zip$/);
    await expect(buildLocalIconBundleZip([{ ...icon, contentPath: "assets/icons/items/no.webp" }])).rejects.toThrow(/owner/);
  });
});
