import { describe, it, expect, beforeAll, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));

import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VfxSystem } from "./VfxSystem";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { isFannedOutEvent } from "../../../game-server/src/net/eventFanout";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");

describe("probe e2e", () => {
  it("real sim → fanout → client draws arc", async () => {
    const shared = await import("@ggd/shared");
    console.log("SHARED KEYS:", Object.keys(shared).slice(0, 40).join(","));
    expect(typeof ContentLoader).toBe("function");
    expect(typeof FsContentSource).toBe("function");
    expect(typeof isFannedOutEvent).toBe("function");
    console.log("CONTENT_DIR", CONTENT_DIR);
  });
});
