/**
 * The intermission market's COMPOSITION, pinned as numbers (task #38).
 *
 * These are the claims the staging makes about itself — the merchant is behind
 * his own counter, the awning clears his head, the hero has its back to us
 * while looking at the merchant, and the whole cast fits in the free 55% that
 * the shop card does not cover. Each is checkable without a GPU, so a later
 * nudge to any coordinate cannot silently break the frame.
 *
 * THE CARD MOVED LEFT (「請你把說明頁改到左半邊」) and the whole shot was
 * mirrored with it, so the free half is now the RIGHT one. These assertions
 * follow the mirror rather than being relaxed: the composition claims are the
 * same claims, reflected. `freeEdge` below is derived from SHOP_CARD_SIDE, so
 * moving the card again updates the tests instead of breaking them.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { writeCameraDrift } from "../menu/procedural/math";
import {
  ATMOSPHERE,
  CAMERA_DRIFT,
  CAMERA_ENTER_POSE,
  CAMERA_FOV,
  CAMERA_POSE,
  CAMERA_POSITION,
  CAMERA_TARGET,
  CART,
  CHAMPION_STAND,
  CHAMPION_YAW,
  DRESSING,
  GROUND_RADIUS,
  LANTERN_POS,
  MERCHANT,
  PLAZA_RADIUS,
  SHOP_CARD_SIDE,
  SHOP_CARD_WIDTH_FRACTION,
  STALL,
  TILE_SCALE,
  TILE_STEP,
  TORCHES,
  arcPoseFor,
  bannerFor,
  grassRing,
  pavingTiles,
  silhouettes,
  yawToward,
} from "./layout";

/** Rendered height of a merchant-set piece = measured native height × scale. */
const NATIVE_HEIGHT = { stall: 1.0421, cart: 0.7961, merchant: 1.8367 };
/** Champions render normalised to this (modelScale.fixture.json "target"). */
const HERO_HEIGHT = 1.7;

/**
 * Project a world point to SCREEN FRACTIONS (0,0 = top-left, 1,1 = bottom-right)
 * through the scene's own fixed shot. Reproduces Babylon's left-handed look-at
 * basis exactly — zaxis = normalize(target − eye), xaxis = normalize(up × z),
 * yaxis = z × x — so what this asserts is what the camera will actually show.
 */
function screenProjector(aspect: number): (p: { x: number; y: number; z: number }) => { x: number; y: number } {
  const fwd = {
    x: CAMERA_TARGET.x - CAMERA_POSITION.x,
    y: CAMERA_TARGET.y - CAMERA_POSITION.y,
    z: CAMERA_TARGET.z - CAMERA_POSITION.z,
  };
  const fl = Math.hypot(fwd.x, fwd.y, fwd.z);
  const f = { x: fwd.x / fl, y: fwd.y / fl, z: fwd.z / fl };
  // xaxis = normalize(worldUp × f), worldUp = (0,1,0)
  const rx = { x: 1 * f.z - 0 * f.y, y: 0 * f.x - 0 * f.z, z: 0 * f.y - 1 * f.x };
  const rl = Math.hypot(rx.x, rx.y, rx.z);
  const right = { x: rx.x / rl, y: rx.y / rl, z: rx.z / rl };
  // yaxis = f × xaxis
  const up = {
    x: f.y * right.z - f.z * right.y,
    y: f.z * right.x - f.x * right.z,
    z: f.x * right.y - f.y * right.x,
  };
  const tanHalf = Math.tan(CAMERA_FOV / 2);
  return (p) => {
    const d = { x: p.x - CAMERA_POSITION.x, y: p.y - CAMERA_POSITION.y, z: p.z - CAMERA_POSITION.z };
    const depth = d.x * f.x + d.y * f.y + d.z * f.z;
    const ndcX = (d.x * right.x + d.y * right.y + d.z * right.z) / (depth * tanHalf * aspect);
    const ndcY = (d.x * up.x + d.y * up.y + d.z * up.z) / (depth * tanHalf);
    return { x: 0.5 + 0.5 * ndcX, y: 0.5 - 0.5 * ndcY };
  };
}

describe("intermission staging", () => {
  it("renders the measured heights the placement decision was made on", () => {
    cover("intermission-scale");
    expect(NATIVE_HEIGHT.cart * CART.scale).toBeCloseTo(2.548, 2);
    expect(NATIVE_HEIGHT.stall * STALL.scale).toBeCloseTo(2.084, 2);
    expect(NATIVE_HEIGHT.merchant * MERCHANT.scale).toBeCloseTo(1.75, 2);
  });

  it("the merchant reads as the adult behind the counter, and keeps his face", () => {
    cover("intermission-scale");
    const merchantH = NATIVE_HEIGHT.merchant * MERCHANT.scale;
    const awningH = NATIVE_HEIGHT.stall * STALL.scale;
    // a hair above the heroes — authority, not a giant
    expect(merchantH).toBeGreaterThan(HERO_HEIGHT);
    expect(merchantH - HERO_HEIGHT).toBeLessThan(0.15);
    // the awning clears his head, so the camera never loses his face
    expect(awningH - merchantH).toBeGreaterThan(0.3);
    // the cart is the tallest silhouette: the landmark
    expect(NATIVE_HEIGHT.cart * CART.scale).toBeGreaterThan(awningH);
  });

  it("the merchant stands BEHIND his counter, not in front of it", () => {
    cover("intermission-staging");
    expect(MERCHANT.z).toBeGreaterThan(STALL.z); // +Z is away from the camera
    // …and close enough to it to be serving, not loitering
    expect(MERCHANT.z - STALL.z).toBeLessThan(1);
  });

  it("the cart's canopy overlaps the stall so the two read as ONE pitch", () => {
    cover("intermission-staging");
    // cart footprint 1.48 × 2.97 at scale 3.2, stall 1.03 × 2.31 at scale 2.0
    const gap = Math.hypot(CART.x - STALL.x, CART.z - STALL.z);
    expect(gap).toBeLessThan((1.48 + 1.03) / 2 + 2.0); // silhouettes touch/overlap
    expect(gap).toBeGreaterThan(1.0); // …but the stall is not buried inside it
  });

  it("the hero has its back to us AND is looking at the merchant", () => {
    cover("intermission-staging");
    // facing is derived, so moving either piece keeps the gaze correct
    expect(CHAMPION_YAW).toBeCloseTo(yawToward(CHAMPION_STAND, MERCHANT), 10);
    const facing = { x: Math.sin(CHAMPION_YAW), z: Math.cos(CHAMPION_YAW) };
    const toMerchant = { x: MERCHANT.x - CHAMPION_STAND.x, z: MERCHANT.z - CHAMPION_STAND.z };
    const len = Math.hypot(toMerchant.x, toMerchant.z);
    expect((facing.x * toMerchant.x + facing.z * toMerchant.z) / len).toBeCloseTo(1, 6);
    // camera → hero and hero's facing point the same way ⇒ we see its back
    const toHero = { x: CHAMPION_STAND.x - CAMERA_POSITION.x, z: CHAMPION_STAND.z - CAMERA_POSITION.z };
    const toHeroLen = Math.hypot(toHero.x, toHero.z);
    expect((facing.x * toHero.x + facing.z * toHero.z) / toHeroLen).toBeGreaterThan(0.5);
  });

  it("the hero stands between camera and counter, closer to us than the stall", () => {
    cover("intermission-staging");
    expect(CHAMPION_STAND.z).toBeLessThan(STALL.z);
    expect(CHAMPION_STAND.z).toBeGreaterThan(CAMERA_POSITION.z);
  });
});

describe("intermission camera", () => {
  it("arcPoseFor inverts Babylon's ArcRotateCamera placement exactly", () => {
    cover("intermission-camera");
    const pose = arcPoseFor(CAMERA_POSITION, CAMERA_TARGET);
    // re-derive the world position from (alpha, beta, radius) and compare
    const x = CAMERA_TARGET.x + pose.radius * Math.cos(pose.alpha) * Math.sin(pose.beta);
    const y = CAMERA_TARGET.y + pose.radius * Math.cos(pose.beta);
    const z = CAMERA_TARGET.z + pose.radius * Math.sin(pose.alpha) * Math.sin(pose.beta);
    expect(x).toBeCloseTo(CAMERA_POSITION.x, 10);
    expect(y).toBeCloseTo(CAMERA_POSITION.y, 10);
    expect(z).toBeCloseTo(CAMERA_POSITION.z, 10);
    expect(pose).toEqual(CAMERA_POSE);
  });

  it("is a FIXED shot that breathes — it never orbits away from the frame", () => {
    cover("intermission-camera");
    expect(CAMERA_DRIFT.orbitSpeed).toBe(0); // orbit would destroy the composition
    const pose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
    let maxAlpha = 0;
    let maxRadius = 0;
    for (let t = 0; t <= 120; t += 0.25) {
      writeCameraDrift(pose, t, CAMERA_DRIFT);
      maxAlpha = Math.max(maxAlpha, Math.abs(pose.alpha - CAMERA_POSE.alpha));
      maxRadius = Math.max(maxRadius, Math.abs(pose.radius - CAMERA_POSE.radius));
    }
    // ±0.02 rad over ~20 s: alive, but far below "the camera moved"
    expect(maxAlpha).toBeLessThanOrEqual(0.021);
    expect(maxRadius).toBeLessThanOrEqual(0.08);
  });

  it("keeps merchant, cart and hero inside the free 55% the card does not cover", () => {
    cover("intermission-camera");
    // The shop card is LEFT-docked and owns 45%, so anything that must stay
    // READABLE has to project RIGHT of 45% of screen width. Checked at three
    // aspect ratios because the horizontal field — and therefore this margin —
    // is the one thing that changes with the window's shape.
    //
    // This is the assertion the user's complaint 「商店說明頁剛好檔到角色」 lands
    // on. It passed before the move because it was measuring the other side; it
    // is expressed against SHOP_CARD_SIDE now so a future side-swap can only
    // fail loudly, never pass while covering the hero.
    expect(SHOP_CARD_SIDE).toBe("left");
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
      const project = screenProjector(aspect);
      const cardEdge = SHOP_CARD_WIDTH_FRACTION; // the card ends at 45% of the width
      // silhouette EXTENTS of the pieces that must never be occluded. The
      // mirror swaps which side of each silhouette is the exposed one, so these
      // are now LEFT edges: the card encroaches from the left.
      const mustBeClear = {
        "merchant head (left edge)": { x: MERCHANT.x - 0.28, y: 1.75, z: MERCHANT.z },
        "cart canopy (left edge)": { x: CART.x - 0.74, y: 2.548, z: CART.z },
        "counter (left edge)": { x: STALL.x - 0.52, y: 1.0, z: STALL.z },
      };
      for (const [name, p] of Object.entries(mustBeClear)) {
        const s = project(p);
        expect(s.x, `${name} @${aspect.toFixed(2)} at ${(s.x * 100).toFixed(1)}%`).toBeGreaterThan(cardEdge);
        expect(s.x, `${name} @${aspect.toFixed(2)}`).toBeLessThan(1);
      }
      // the hero's CENTRE line stays clear too (a shoulder may tuck under the
      // card's translucent edge on a narrow 4:3 window — the head never does)
      const hero = project({ x: CHAMPION_STAND.x, y: 1.7, z: CHAMPION_STAND.z });
      expect(hero.x, `hero @${aspect.toFixed(2)} at ${(hero.x * 100).toFixed(1)}%`).toBeGreaterThan(cardEdge);
    }
  });

  it("frames the cart upper-right, the merchant on the upper third, hero in shot", () => {
    cover("intermission-camera");
    const project = screenProjector(16 / 9);
    const cart = project({ x: CART.x, y: 2.548, z: CART.z });
    expect(cart.x).toBeGreaterThan(2 / 3); // upper RIGHT third (mirrored)…
    expect(cart.y).toBeLessThan(1 / 3); // …and upper

    const head = project({ x: MERCHANT.x, y: 1.75, z: MERCHANT.z });
    expect(head.y).toBeGreaterThan(0.3);
    expect(head.y).toBeLessThan(0.48); // on/near the upper-third line

    // the hero anchors the lower half and is FULLY in shot, feet included
    const heroHead = project({ x: CHAMPION_STAND.x, y: 1.7, z: CHAMPION_STAND.z });
    const heroFeet = project({ x: CHAMPION_STAND.x, y: 0, z: CHAMPION_STAND.z });
    expect(heroHead.y).toBeGreaterThan(0.4);
    expect(heroFeet.y).toBeLessThanOrEqual(1); // not cropped by the bottom edge
    expect(heroFeet.y).toBeGreaterThan(heroHead.y);
  });

  it("puts the merchant in the CENTRE and the player's hero on the RIGHT (#146)", () => {
    cover("intermission-camera");
    // The user's ask 「旅行商人…3D model 在中央,玩家 model 在右方」: the merchant is
    // the centred focal point, the hero reads clearly to his right. Checked at
    // three aspect ratios because the horizontal field is what a window reshapes.
    // This is what the re-aim (CAMERA_TARGET) + the hero move (CHAMPION_STAND)
    // buy, so a future nudge to either cannot silently drift back to the old
    // "hero left of a centre-right merchant" framing the user complained about.
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
      const project = screenProjector(aspect);
      const merchant = project({ x: MERCHANT.x, y: 1.75, z: MERCHANT.z });
      const hero = project({ x: CHAMPION_STAND.x, y: 1.7, z: CHAMPION_STAND.z });
      // the merchant sits at screen CENTRE (within 10 % of dead-centre)…
      expect(Math.abs(merchant.x - 0.5), `merchant @${aspect.toFixed(2)} at ${(merchant.x * 100).toFixed(1)}%`).toBeLessThan(0.1);
      // …and the hero is clearly to his RIGHT (a comfortable margin, not a tie)
      expect(hero.x - merchant.x, `hero−merchant @${aspect.toFixed(2)}`).toBeGreaterThan(0.08);
    }
  });

  it("enters from further back and higher, then settles on the resting pose", () => {
    cover("intermission-camera");
    expect(CAMERA_ENTER_POSE.radius).toBeGreaterThan(CAMERA_POSE.radius);
    expect(CAMERA_ENTER_POSE.beta).toBeLessThan(CAMERA_POSE.beta); // higher up
  });
});

describe("intermission ground + dressing", () => {
  it("paves a 2 u grid over the plaza disc with correctly-scaled tiles", () => {
    cover("intermission-ground");
    // floor_tile_large.glb measures 4 × 4 u on disk
    expect(TILE_SCALE * 4).toBeCloseTo(TILE_STEP, 10);
    const tiles = pavingTiles();
    expect(tiles.length).toBeGreaterThan(40);
    for (const t of tiles) expect(Math.hypot(t.x, t.z)).toBeLessThanOrEqual(PLAZA_RADIUS);
    // grid, not a scatter: every coordinate is a multiple of the step
    for (const t of tiles) {
      expect(t.x % TILE_STEP).toBeCloseTo(0, 10);
      expect(t.z % TILE_STEP).toBeCloseTo(0, 10);
    }
    // no duplicate tile positions (a double-drawn tile z-fights)
    expect(new Set(tiles.map((t) => `${t.x},${t.z}`)).size).toBe(tiles.length);
  });

  it("the dark ground extends well past the paving, so nothing ends in a void", () => {
    cover("intermission-ground");
    expect(GROUND_RADIUS).toBeGreaterThan(PLAZA_RADIUS * 2);
  });

  it("rings the paving with grass and never inside the market floor", () => {
    cover("intermission-ground");
    const ring = grassRing();
    expect(ring.length).toBeGreaterThan(10);
    for (const h of ring) {
      const d = Math.hypot(h.x, h.z);
      expect(d).toBeGreaterThanOrEqual(PLAZA_RADIUS - 1);
      // never near the pitch itself
      expect(d).toBeGreaterThan(4);
    }
  });

  it("silhouettes ring the market at 9–13 u and stay out of the shot's throat", () => {
    cover("intermission-ground");
    const trees = silhouettes();
    expect(trees.length).toBeGreaterThan(6);
    for (const t of trees) {
      const d = Math.hypot(t.x, t.z);
      expect(d).toBeGreaterThanOrEqual(9);
      expect(d).toBeLessThanOrEqual(13);
      // nothing parks directly between the camera and the counter
      const betweenCamAndStall = t.z < 0 && Math.abs(t.x) < 2.5;
      expect(betweenCamAndStall).toBe(false);
    }
    // deterministic: same layout every boot
    expect(silhouettes()).toEqual(trees);
  });

  it("dresses only with models that ship in the KayKit packs already used", () => {
    cover("intermission-ground");
    const all = [...DRESSING, ...TORCHES, bannerFor(0), ...silhouettes()];
    for (const p of all) {
      expect(p.model).toMatch(/^assets\/models\/(props|hex)\//);
      expect(p.scale).toBeGreaterThan(0);
    }
  });

  it("gives each team its own banner and wraps out-of-range team ids", () => {
    cover("intermission-ground");
    expect(bannerFor(0).model).toContain("blue");
    expect(bannerFor(1).model).toContain("red");
    expect(bannerFor(2).model).toContain("green");
    expect(bannerFor(3).model).toContain("yellow");
    expect(bannerFor(4).model).toBe(bannerFor(0).model);
    expect(bannerFor(-1).model).toBe(bannerFor(3).model);
  });

  it("hangs the lantern under the cart canopy, not floating in the air", () => {
    cover("intermission-ground");
    expect(Math.hypot(LANTERN_POS.x - CART.x, LANTERN_POS.z - CART.z)).toBeLessThan(1);
    expect(LANTERN_POS.y).toBeLessThan(2.548); // under the canopy top
    expect(LANTERN_POS.y).toBeGreaterThan(1.75); // above the merchant's head
  });

  it("is the ANTI-ARENA: warm, fogged, softly bloomed — nothing strobes", () => {
    cover("intermission-mood");
    expect(ATMOSPHERE.fogDensity).toBeGreaterThan(0);
    expect(ATMOSPHERE.bloomWeight).toBeLessThan(0.5); // gentle glow, not a flash
    expect(ATMOSPHERE.bloomThreshold).toBeGreaterThan(0.8); // only lanterns bloom
  });
});
