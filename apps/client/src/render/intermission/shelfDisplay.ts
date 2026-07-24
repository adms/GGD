/**
 * shelfDisplay — the market's FUNCTIONAL SHELVES (task #94), as plain numbers.
 *
 * ---------------------------------------------------------------------------
 * THE HALF OF #94 THAT WAS NEVER BUILT
 * ---------------------------------------------------------------------------
 * #94 is two requests: put the shop card on the LEFT with the scene mirrored to
 * match, and give the stall 「功能性貨架」 — shelves that actually hold and show
 * the goods. The first half shipped (`SHOP_CARD_SIDE` + the `mirrorX` pass in
 * layout.ts) and the second did not: the pitch is an awning, a cart, crates,
 * barrels and two chests (`DRESSING`), and NOT ONE of them displays anything
 * that is for sale. There is no shelf prop in the scene at all — and none in
 * the CC0 packs either, which is presumably why it stalled.
 *
 * So the rack is BUILT, not loaded: posts and planks are boxes, and the goods
 * on them are small primitives tinted by which shelf of the catalogue they came
 * from. That has a second benefit the .glb route could not have had — it
 * survives `IntermissionScene.test.ts`, where no model is fetchable and every
 * `AssetManager.load` resolves null. The dressing disappears there; the shelves
 * do not.
 *
 * ---------------------------------------------------------------------------
 * "FUNCTIONAL" MEANS IT SHOWS THE REAL CATALOGUE
 * ---------------------------------------------------------------------------
 * A rack with decorative blobs on it would be more dressing. What makes these
 * shelves functional is that {@link layoutShelfGoods} is fed the SAME shelves
 * the card is rendering — `groupCatalogue()`'s 攻擊 / 法術 / 防禦 buckets from
 * `ui/panels/shopGrouping.ts`, already filtered by #70's `shopCatalogue()` and
 * by the operator's whitelist — one plank per shelf, in the card's own order,
 * tinted with the card's own colours, and goods you ALREADY OWN go dark. Sell
 * something and its good lights back up. The 3D market and the panel cannot
 * drift, because they are the same list.
 *
 * The catalogue is longer than a rack, so each plank shows its first
 * {@link GOODS_PER_PLANK} (cheapest first — `groupCatalogue` already sorts that
 * way, and the cheap end is what a browsing player is choosing between). The
 * rack is a display, not a second catalogue: the card remains the place you buy.
 *
 * ---------------------------------------------------------------------------
 * WHERE IT STANDS, AND WHY IT CANNOT HIDE THE 店員
 * ---------------------------------------------------------------------------
 * Task #103's rule for this scene is absolute: nothing may stand between the
 * fixed camera and the shopkeeper. The eye→merchant ray crosses the rack's
 * depth (z 1.0) at x ≈ −0.20, and the rack's box starts at x ≈ 0.38 — 0.58 u
 * of clearance, well past the 0.41 u margin #103 spent on the champion's centre
 * line and on the SAME side of the ray, so it cannot be eaten by a future nudge
 * of the merchant. shelfDisplay.test.ts casts that segment against the rack's
 * real box every run.
 *
 * Depth was chosen against the LIVE frame, not on paper. At the first-tried
 * z 1.5 the rack sat behind the counter line and read as background timber; at
 * z 1.0 it stands at the open front of the pitch, ~1 u nearer the lens, and the
 * goods are legible at a glance — which is the entire point of a display shelf.
 * It also has to stay inside the free half the LEFT-docked card leaves AND
 * inside the frame: 57–79 % of screen width at 16:9, 60–89 % on a narrow 4:3
 * (where the mirrored composition pans everything right), so it clears the
 * card's 45 % edge and never runs off the right. Authored in the same pre-mirror
 * frame as everything else in layout.ts and reflected with `mirrorPoint`, so a
 * flip of `SHOP_CARD_SIDE` carries the shelves with the rest of the set.
 */
import { CAMERA_POSITION, mirrorPoint, yawToward, type Rgb } from "./layout";

/** Authored (pre-mirror) ground position; see the note above for the margin. */
const AUTHORED = { x: -1.05, z: 1.0 } as const;
const PLACED = mirrorPoint(AUTHORED);
/**
 * A rack you can read has to present its plank FRONTS, so the facing is derived
 * from the actual camera rather than authored: square to the lens, then turned
 * 17° so it is a three-quarter and not a flat elevation. Derived from the placed
 * (post-mirror) position and the placed eye, so it needs no mirroring of its own
 * and follows either one if it moves — the same trick as CHAMPION_YAW.
 */
const TOWARD_CAMERA = yawToward(PLACED, { x: CAMERA_POSITION.x, z: CAMERA_POSITION.z });

/** Ground footprint + carpentry of the rack. Metres (= world units). */
export interface ShelfRack {
  /** centre of the rack on the ground plane (ALREADY mirrored) */
  readonly x: number;
  readonly z: number;
  /** facing, radians, project convention `rotation.y = atan2(fx, fz)` */
  readonly yaw: number;
  /** overall carcass size */
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** square section of the four corner posts */
  readonly postSize: number;
  /** plank thickness; goods sit on `plankY[i] + plankThickness / 2` */
  readonly plankThickness: number;
  /** height of each plank's mid-line, LOW to HIGH */
  readonly plankY: readonly number[];
}

/**
 * Authored x −1.05 → mirrored +1.05: to the merchant's screen-RIGHT, at the
 * open front of the stall so it reads as that stall's shelving rather than as
 * furniture that wandered in. z 1.0 puts it in FRONT of the counter (stall
 * z 1.2) where a customer would actually browse, and near enough the lens that
 * a 0.22 u good is readable. 1.55 u tall is below the merchant's eye line
 * (1.62) — a rack you look OVER, which is what keeps the shot's subject his face.
 */
export const SHELF_RACK: ShelfRack = {
  ...PLACED,
  yaw: TOWARD_CAMERA + 17 * (Math.PI / 180),
  width: 1.5,
  depth: 0.42,
  height: 1.55,
  postSize: 0.075,
  plankThickness: 0.05,
  plankY: [0.42, 0.9, 1.38],
};

/** Most goods one plank can show without them touching. */
export const GOODS_PER_PLANK = 5;

/**
 * Which catalogue shelf each plank displays, TOP plank first — the card's own
 * reading order (`SHELF_ORDER` in ui/panels/shopGrouping.ts), so a player's eye
 * travels down the rack the way it travels down the list. Services are not
 * here: 傳說寶玉 and 能力屬性強化 are ACTIONS, not stock, and a physical shelf
 * cannot hold them.
 */
export const SHELF_ROWS: readonly string[] = ["offense", "magic", "defense"];

/**
 * Plank tints. Warm/cool/green, matching how the card already reads the three
 * shelves, and deliberately saturated: at this distance a good is ~14 px of
 * screen, so hue is the only channel that survives.
 */
export const SHELF_TINT: Readonly<Record<string, Rgb>> = {
  offense: { r: 0.93, g: 0.36, b: 0.28 },
  magic: { r: 0.42, g: 0.62, b: 0.98 },
  defense: { r: 0.44, g: 0.85, b: 0.55 },
};

/** Fallback tint for a shelf id with no entry above (a future group). */
export const SHELF_TINT_DEFAULT: Rgb = { r: 0.85, g: 0.78, b: 0.6 };

/** The shape `layoutShelfGoods` needs from a catalogue entry. */
export interface ShelfGoodInput {
  readonly itemId: string;
  /** `ShelfId` from ui/panels/shopGrouping.ts — kept a plain string so the
   *  render layer does not import the UI layer's enum. */
  readonly shelf: string;
  /** true when this champion is already carrying it (the good goes dark) */
  readonly owned: boolean;
}

/** One good, placed in the RACK'S OWN local frame (pre-rotation, y from ground). */
export interface PlacedGood {
  readonly itemId: string;
  readonly shelf: string;
  readonly owned: boolean;
  /** local offsets: x across the plank, y the good's CENTRE, z the depth */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** the good's own size (a cube edge / sphere diameter) */
  readonly size: number;
  readonly tint: Rgb;
  /** which plank, 0 = LOWEST (matches `rack.plankY` indexing) */
  readonly plank: number;
}

/**
 * Edge of a good. Sized against the LIVE frame: at 0.17 u the goods were
 * unreadable specks in a dusk market at 7 u; 0.22 reads as an object on a shelf
 * while still leaving air between five of them on a 1.5 u plank (the spacing
 * assertion in the test is what keeps those two facts consistent).
 */
const GOOD_SIZE = 0.22;

/**
 * Lay the catalogue's shelves onto the rack's planks.
 *
 * Deterministic and total: unknown shelf ids are dropped rather than piled onto
 * a default plank (the card would not show them on 攻擊/法術/防禦 either, and a
 * mystery good on a shelf teaches the player something false), and a shelf with
 * more goods than fit is truncated, never overlapped.
 */
export function layoutShelfGoods(
  goods: readonly ShelfGoodInput[],
  rack: ShelfRack = SHELF_RACK,
): PlacedGood[] {
  const out: PlacedGood[] = [];
  // SHELF_ROWS is authored TOP-first; plankY is indexed LOW-first
  SHELF_ROWS.forEach((shelf, row) => {
    const plank = rack.plankY.length - 1 - row;
    if (plank < 0) return;
    const y = rack.plankY[plank];
    if (y === undefined) return;
    const mine = goods.filter((g) => g.shelf === shelf).slice(0, GOODS_PER_PLANK);
    if (mine.length === 0) return;
    // centre the row: n goods share the plank's usable width evenly
    const usable = rack.width - rack.postSize * 2 - GOOD_SIZE;
    const step = mine.length > 1 ? usable / (mine.length - 1) : 0;
    const start = mine.length > 1 ? -usable / 2 : 0;
    mine.forEach((g, i) => {
      out.push({
        itemId: g.itemId,
        shelf: g.shelf,
        owned: g.owned,
        x: start + step * i,
        // sits ON the plank: half a plank up, then half a good up
        y: y + rack.plankThickness / 2 + GOOD_SIZE / 2,
        z: 0,
        size: GOOD_SIZE,
        tint: SHELF_TINT[g.shelf] ?? SHELF_TINT_DEFAULT,
        plank,
      });
    });
  });
  return out;
}

/**
 * The rack's axis-aligned world footprint (its rotated box, bounded). Used by
 * the sightline test and by anyone placing something near it — a rotated
 * rectangle's AABB half-extents are `|w/2·cos| + |d/2·sin|` per axis.
 */
export function shelfFootprint(rack: ShelfRack = SHELF_RACK): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
} {
  const c = Math.abs(Math.cos(rack.yaw));
  const s = Math.abs(Math.sin(rack.yaw));
  const hx = (rack.width / 2) * c + (rack.depth / 2) * s;
  const hz = (rack.width / 2) * s + (rack.depth / 2) * c;
  return {
    minX: rack.x - hx,
    maxX: rack.x + hx,
    minZ: rack.z - hz,
    maxZ: rack.z + hz,
    maxY: rack.height,
  };
}
