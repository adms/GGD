import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImportStore } from "./importStore";
import { readHeroTemplateVersion } from "./heroTemplateHistory";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
it("a fresh service recognizes only the exact retained server source, never self-approved snapshots", () => {
  const root = mkdtempSync(join(tmpdir(), "recast-template-history-"));
  try {
    const store = new ImportStore({ dir: root });
    const digest = "sha256:7737c132c32231e336a95ad3052ea0092a0eaba31a4d45504f74f734e908cd15";
    const template = readHeroTemplateVersion(store, "tpl-effect-sequence", digest)!;
    expect(template.params.recast).toBeUndefined(); expect(contentSha256(template)).toBe(digest);
    template.name = "changed";
    expect(readHeroTemplateVersion(store, "tpl-effect-sequence", contentSha256(template))).toBeUndefined();
    expect(readHeroTemplateVersion(store, "tpl-another", digest)).toBeUndefined();
    expect(contentSha256(readHeroTemplateVersion(store, "tpl-effect-sequence", digest))).toBe(digest);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
