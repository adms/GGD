/**
 * int-37 (shop-functional-shelves, task #94, second half).
 *
 * The rack that finally holds the goods is PROCEDURAL, so it is invisible to
 * the two guards that already protect this scene:
 *   · sightline.test.ts casts against shipped .glb triangles — there is no .glb
 *     here, so it would sweep straight past the rack and stay green;
 *   · layout.test.ts projects the placements in layout.ts — the rack is not one.
 * A prop that no guard can see is exactly how #103 (the 店員 hidden behind his
 * own stall) happened in the first place. So the rack brings its own guards, to
 * the same bar: ZERO blockers on the merchant, and every part of it inside the
 * free half the LEFT-docked card leaves.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CAMERA_FOV,
  CAMERA_POSITION,
  CAMERA_TARGET,
  CHAMPION_STAND,
  MERCHANT,
  SHOP_CARD_SIDE,
  SHOP_CARD_WIDTH_FRACTION,
} from "./layout";
import {
  GOODS_PER_PLANK,
  SHELF_RACK,
  SHELF_ROWS,
  SHELF_TINT,
  layoutShelfGoods,
  shelfFootprint,
  type ShelfGoodInput,
} from "./shelfDisplay";

/** Same pinhole projection layout.test.ts uses (Babylon's own view basis). */
function screenProjector(aspect: number): (p: { x: number; y: number; z: number }) => { x: number; y: number } {
  const fwd = {
    x: CAMERA_TARGET.x - CAMERA_POSITION.x,
    y: CAMERA_TARGET.y - CAMERA_POSITION.y,
    z: CAMERA_TARGET.z - CAMERA_POSITION.z,
  };
  const fl = Math.hypot(fwd.x, fwd.y, fwd.z);
  const f = { x: fwd.x / fl, y: fwd.y / fl, z: fwd.z / fl };
  const rx = { x: f.z, y: 0, z: -f.x };
  const rl = Math.hypot(rx.x, rx.y, rx.z);
  const right = { x: rx.x / rl, y: rx.y / rl, z: rx.z / rl };
  const up = {
    x: f.y * right.z - f.z * right.y,
    y: f.z * right.x - f.x * right.z,
    z: f.x * right.y - f.y * right.x,
  };
  const tanHalf = Math.tan(CAMERA_FOV / 2);
  return (p) => {
    const d = { x: p.x - CAMERA_POSITION.x, y: p.y - CAMERA_POSITION.y, z: p.z - CAMERA_POSITION.z };
    const depth = d.x * f.x + d.y * f.y + d.z * f.z;
    return {
      x: 0.5 + 0.5 * ((d.x * right.x + d.y * right.y + d.z * right.z) / (depth * tanHalf * aspect)),
      y: 0.5 - 0.5 * ((d.x * up.x + d.y * up.y + d.z * up.z) / (depth * tanHalf)),
    };
  };
}

/** Slab method: does the segment eye→target pierce the rack's world box? */
function segmentHitsBox(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  box: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number },
): boolean {
  const lo = [box.minX, 0, box.minZ];
  const hi = [box.maxX, box.maxY, box.maxZ];
  const o = [a.x, a.y, a.z];
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  let tMin = 0;
  let tMax = 1;
  for (let i = 0; i < 3; i++) {
    const di = d[i]!;
    const oi = o[i]!;
    if (Math.abs(di) < 1e-9) {
      if (oi < lo[i]! || oi > hi[i]!) return false;
      continue;
    }
    let t1 = (lo[i]! - oi) / di;
    let t2 = (hi[i]! - oi) / di;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** The three body heights #103's ray sweep samples on the 店員. */
const MERCHANT_SAMPLES = [
  { label: "head", y: 1.62 },
  { label: "chest", y: 1.2 },
  { label: "feet", y: 0.15 },
];

describe("shop shelves — staging (#94)", () => {
  it("never stands between the camera and the 店員, at any body height", () => {
    cover("shop-functional-shelves");
    const box = shelfFootprint();
    for (const { label, y } of MERCHANT_SAMPLES) {
      const hit = segmentHitsBox(CAMERA_POSITION, { x: MERCHANT.x, y, z: MERCHANT.z }, box);
      expect(hit, `rack blocks the merchant's ${label}`).toBe(false);
    }
    // and it must not creep toward the ray later: the eye→merchant line crosses
    // the rack's depth well to the -x side, and the rack starts a real margin
    // away on the +x side. Pinned so a nudge that erodes it fails HERE and not
    // in a screenshot three tasks later.
    const t = (SHELF_RACK.z - CAMERA_POSITION.z) / (MERCHANT.z - CAMERA_POSITION.z);
    const rayX = CAMERA_POSITION.x + t * (MERCHANT.x - CAMERA_POSITION.x);
    expect(box.minX - rayX).toBeGreaterThan(0.35);
  });

  it("does not hide the player's own champion either", () => {
    cover("shop-functional-shelves");
    // the hero is FOREGROUND (z −0.7), the rack is behind him — so the segment
    // eye→hero must clear the rack outright, at head and at feet
    const box = shelfFootprint();
    for (const y of [1.7, 0.1]) {
      const hit = segmentHitsBox(CAMERA_POSITION, { x: CHAMPION_STAND.x, y, z: CHAMPION_STAND.z }, box);
      expect(hit, `rack blocks the hero at y=${y}`).toBe(false);
    }
  });

  /**
   * BOTH edges, because the rack is squeezed between two of them. The card
   * encroaches from the LEFT at 45 %; the FRAME ends at 100 %, and the mirrored
   * composition pans everything right as the window narrows — on 4:3 the hero
   * already sits at 73 %, so a rack that looks comfortable on a 16:9 desktop is
   * the piece most likely to walk off the right edge on a phone.
   */
  it("stands entirely in the free half the LEFT-docked card leaves — and in frame", () => {
    cover("shop-functional-shelves");
    expect(SHOP_CARD_SIDE).toBe("left");
    const box = shelfFootprint();
    for (const aspect of [16 / 9, 4 / 3, 21 / 9]) {
      const project = screenProjector(aspect);
      // every corner of the carcass, so neither edge can be missed
      for (const x of [box.minX, box.maxX]) {
        for (const z of [box.minZ, box.maxZ]) {
          for (const y of [0, box.maxY]) {
            const s = project({ x, y, z });
            const at = `(${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}) @${aspect.toFixed(2)} = ${(s.x * 100).toFixed(1)}%`;
            expect(s.x, `rack corner under the shop card: ${at}`).toBeGreaterThan(SHOP_CARD_WIDTH_FRACTION);
            expect(s.x, `rack corner off the right edge: ${at}`).toBeLessThan(1);
          }
        }
      }
    }
  });

  it("is short enough to look OVER — the merchant's face is the subject", () => {
    cover("shop-functional-shelves");
    // 1.62 is the merchant's head sample; a rack taller than that would put
    // carpentry across his face from a lower camera angle
    expect(SHELF_RACK.height).toBeLessThan(1.62);
    // planks are inside the carcass, in ascending order, none on the floor
    const ys = [...SHELF_RACK.plankY];
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(ys[0]).toBeGreaterThan(0.1);
    expect(ys[ys.length - 1]).toBeLessThan(SHELF_RACK.height);
  });
});

const good = (itemId: string, shelf: string, owned = false): ShelfGoodInput => ({ itemId, shelf, owned });

describe("shop shelves — they hold the REAL catalogue (#94)", () => {
  it("puts each catalogue shelf on its own plank, top-first, and tints it", () => {
    cover("shop-functional-shelves");
    const placed = layoutShelfGoods([
      good("i.sword", "offense"),
      good("i.staff", "magic"),
      good("i.plate", "defense"),
    ]);
    expect(placed).toHaveLength(3);
    const byShelf = new Map(placed.map((p) => [p.shelf, p]));
    // SHELF_ROWS is authored top-first; plank 0 is the LOWEST board
    const top = SHELF_RACK.plankY.length - 1;
    expect(byShelf.get(SHELF_ROWS[0]!)!.plank).toBe(top);
    expect(byShelf.get(SHELF_ROWS[2]!)!.plank).toBe(top - 2);
    expect(byShelf.get("magic")!.tint).toEqual(SHELF_TINT.magic);
    // every good SITS ON its plank rather than floating or sinking into it
    for (const p of placed) {
      const plankTop = SHELF_RACK.plankY[p.plank]! + SHELF_RACK.plankThickness / 2;
      expect(p.y - p.size / 2).toBeCloseTo(plankTop, 6);
    }
  });

  it("never overflows a plank, and never overlaps two goods", () => {
    cover("shop-functional-shelves");
    const many = Array.from({ length: 12 }, (_, i) => good(`i.${i}`, "offense"));
    const placed = layoutShelfGoods(many);
    expect(placed).toHaveLength(GOODS_PER_PLANK);
    const xs = placed.map((p) => p.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!, "two goods would intersect").toBeGreaterThanOrEqual(placed[0]!.size);
    }
    // and the row stays inside the carcass, clear of the corner posts
    const half = SHELF_RACK.width / 2 - SHELF_RACK.postSize;
    for (const p of placed) expect(Math.abs(p.x) + p.size / 2).toBeLessThanOrEqual(half + 1e-9);
  });

  it("carries OWNERSHIP through, so an owned good can go dark and come back", () => {
    cover("shop-functional-shelves");
    const [owned] = layoutShelfGoods([good("i.sword", "offense", true)]);
    expect(owned!.owned).toBe(true);
    expect(owned!.itemId).toBe("i.sword");
    // selling it (owned false) re-lights the SAME slot, not a different one
    const [resold] = layoutShelfGoods([good("i.sword", "offense", false)]);
    expect(resold!.owned).toBe(false);
    expect(resold!.x).toBeCloseTo(owned!.x, 9);
  });

  it("drops a shelf it has no plank for rather than inventing one", () => {
    cover("shop-functional-shelves");
    // 服務 (傳說寶玉 / 屬性強化) are ACTIONS: a physical shelf cannot hold them
    expect(layoutShelfGoods([good("shop.orb", "service")])).toEqual([]);
    expect(layoutShelfGoods([good("i.boots", "mobility")])).toEqual([]);
    expect(layoutShelfGoods([])).toEqual([]);
  });
});
