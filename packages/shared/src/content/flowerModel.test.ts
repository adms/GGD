/**
 * Healing flowers CLIENT half (task #34, docs/todo/flowers.md): the
 * prop.flower model doc is valid model@1 content and its CC0 .glb exists.
 *
 * IMPORTANT: reads the doc by DIRECT file path (not via ContentLoader)
 * because content/models/_index.json is only rebuilt by `content:build` in
 * the main session — this suite stays green before and after the reindex.
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { zModelDoc } from "./schema/model";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

describe("prop.flower model doc (flower-model-doc)", () => {
  const raw = readFileSync(join(CONTENT_DIR, "models/prop.flower.json"), "utf8");

  it("parses under the zModelDoc schema with the contract identity", () => {
    cover("flower-model-doc");
    const doc = zModelDoc.parse(JSON.parse(raw));
    expect(doc.id).toBe("prop.flower");
    expect(doc.schema).toBe("model@1");
    expect(doc.glbPath).toBe("assets/models/hex/waterlily.glb");
    // sim contract: planar collision radius 0.7
    expect(doc.collisionRadius).toBe(0.7);
    // waterlily_A is a MINIATURE hex-kit mesh (~0.145u across, 0.017u tall);
    // the doc's scale must blow it up to champion-relative size (~1.2u wide)
    expect(doc.scale).toBeGreaterThanOrEqual(6);
    expect(doc.scale).toBeLessThanOrEqual(12);
  });

  it("references a .glb that actually exists in the content mount", () => {
    cover("flower-model-doc");
    const doc = zModelDoc.parse(JSON.parse(raw));
    expect(existsSync(join(CONTENT_DIR, doc.glbPath))).toBe(true);
  });
});
