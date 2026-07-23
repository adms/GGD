/**
 * THE PER-ROUND COST OF THE MARKET — measured, not reasoned about.
 *
 * `IntermissionStage` builds a brand-new `IntermissionScene` on every mount,
 * i.e. once per intermission, and each scene owns its own `AssetManager`. The
 * container cache is per-instance BY NECESSITY (an AssetContainer is bound to
 * the Scene that created it and dies with it), so before the shared byte cache
 * every round re-downloaded the identical market: 13 distinct prop .glbs,
 * 2,228,424 B, of which merchant.glb alone is 1,598,564 B — plus the team
 * banner on top.
 *
 * This test stands up the REAL scene twice against the REAL content/ tree with
 * a counting fetch stub, and asserts the second round issues ZERO requests. It
 * also prints the byte totals, so the win is a number and not a claim.
 *
 * WHY NOT KEEP THE SCENE ALIVE INSTEAD: it would pin a second WebGL context,
 * engine, shadow generator and post-process pipeline for the whole match, and
 * `playEnterTransition` + IntermissionStage's `setTimeout(FADE_MS*4)` both
 * assume a FRESH scene — the entry ease is implied by construction. Sharing
 * only the bytes keeps every one of those assumptions true while removing the
 * part that actually costs a round trip.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { IntermissionScene } from "./IntermissionScene";
import { clearAssetByteCache } from "../AssetManager";

const CONTENT_DIR = join(__dirname, "../../../../../content");

// --- OffscreenCanvas 2D stub (the dust motes need a DynamicTexture) ---------
class StubGradient {
  addColorStop(): void {}
}
class StubCtx {
  fillStyle: unknown = "";
  globalAlpha = 1;
  createRadialGradient(): StubGradient {
    return new StubGradient();
  }
  createLinearGradient(): StubGradient {
    return new StubGradient();
  }
  clearRect(): void {}
  fillRect(): void {}
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(4) };
  }
  putImageData(): void {}
}
class StubCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): StubCtx {
    return new StubCtx();
  }
}

let hadOffscreen: boolean;
beforeAll(() => {
  hadOffscreen = "OffscreenCanvas" in globalThis;
  if (!hadOffscreen) (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = StubCanvas;
});
afterAll(() => {
  if (!hadOffscreen) delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

interface Round {
  requests: number;
  bytes: number;
  urls: string[];
}

let round: Round;
let realFetch: typeof globalThis.fetch | undefined;

function resetCounters(): void {
  round = { requests: 0, bytes: 0, urls: [] };
}

beforeEach(() => {
  realFetch = globalThis.fetch;
  resetCounters();
  clearAssetByteCache();
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    round.requests += 1;
    round.urls.push(url);
    try {
      const buf = readFileSync(join(CONTENT_DIR, url.slice("/content/".length)));
      round.bytes += buf.byteLength;
      return new Response(new Uint8Array(buf), { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  }) as unknown as typeof globalThis.fetch;
});
afterEach(() => {
  if (realFetch) globalThis.fetch = realFetch;
  clearAssetByteCache();
});

function openMarket(teamId: number): IntermissionScene {
  return new IntermissionScene(null as unknown as HTMLCanvasElement, {
    engineFactory: () => new NullEngine() as unknown as Engine,
    autoStart: false,
    now: () => 0,
    teamId,
  });
}

/** Wait until every .glb of the market has been fetched, placed and built. */
async function settle(scene: IntermissionScene): Promise<void> {
  for (let i = 0; i < 400 && !scene.isBuilt; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  // the banner is loaded off setTeam's own promise chain, after isBuilt flips
  await new Promise((r) => setTimeout(r, 50));
}

describe("intermission asset re-use across rounds", () => {
  it("round 2 re-opens the identical market with ZERO network requests", async () => {
    cover("intermission-asset-reuse");

    const t0 = Date.now();
    const first = openMarket(1);
    await settle(first);
    const ms1 = Date.now() - t0;
    const r1 = { ...round, urls: [...round.urls] };
    expect(first.isBuilt).toBe(true);
    expect(r1.requests).toBeGreaterThan(0);
    // every prop really did come down: the 13 market .glbs + the team banner
    expect(new Set(r1.urls).size).toBe(14);
    expect(r1.bytes).toBe(2_283_528);
    first.dispose();

    resetCounters();
    const t1 = Date.now();
    const second = openMarket(1);
    await settle(second);
    const ms2 = Date.now() - t1;
    expect(second.isBuilt).toBe(true);
    // the whole market rebuilt out of the shared byte cache
    expect(round.requests).toBe(0);
    expect(round.bytes).toBe(0);
    // …and it is a REAL market, not an empty one: the merchant is standing
    expect(second.scene.transformNodes.some((n) => n.name === "im-merchant")).toBe(true);
    expect(second.scene.transformNodes.some((n) => n.name === "im-banner")).toBe(true);
    second.dispose();

    // eslint-disable-next-line no-console
    console.log(
      `intermission market: round 1 = ${r1.requests} requests / ${r1.bytes} B / ${ms1} ms, ` +
        `round 2 = 0 requests / 0 B / ${ms2} ms (the residue is the glTF PARSE, which is ` +
        `scene-bound and cannot be shared)`,
    );
  }, 60_000);

  it("a fresh scene still owns its own live meshes after the previous one is disposed", async () => {
    cover("intermission-asset-reuse");
    const first = openMarket(0);
    await settle(first);
    first.dispose();

    const second = openMarket(0);
    await settle(second);
    const merchant = second.scene.transformNodes.find((n) => n.name === "im-merchant");
    expect(merchant).toBeDefined();
    const meshes = merchant!.getChildMeshes(false);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes.every((m) => !m.isDisposed())).toBe(true);
    expect(meshes.every((m) => m.getScene() === second.scene)).toBe(true);
    second.dispose();
  }, 60_000);
});
