/**
 * client-04 (client-screen-to-ground): the cursor ray is intersected with the
 * mathematical ground plane y=0 (pure ray/plane math — never mesh picking).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { intersectRayGround, pickUnit } from "./Picking";

describe("intersectRayGround (client-04)", () => {
  it("maps a straight-down ray to the point under it", () => {
    cover("client-screen-to-ground");
    const hit = intersectRayGround({ origin: { x: 3, y: 10, z: -2 }, dir: { x: 0, y: -1, z: 0 } });
    expect(hit).toEqual({ x: 3, z: -2 });
  });

  it("maps an angled camera ray onto (x,z) at y=0", () => {
    cover("client-screen-to-ground");
    // camera at (0,10,-10) looking diagonally down/forward
    const d = Math.sqrt(0 + 1 + 1);
    const hit = intersectRayGround({
      origin: { x: 0, y: 10, z: -10 },
      dir: { x: 0, y: -1 / d, z: 1 / d },
    })!;
    expect(hit.x).toBeCloseTo(0, 9);
    expect(hit.z).toBeCloseTo(0, 9); // 10 units forward from z=-10
  });

  it("returns null for parallel or away-facing rays", () => {
    cover("client-screen-to-ground");
    expect(
      intersectRayGround({ origin: { x: 0, y: 5, z: 0 }, dir: { x: 1, y: 0, z: 0 } }),
    ).toBeNull();
    expect(
      intersectRayGround({ origin: { x: 0, y: 5, z: 0 }, dir: { x: 0, y: 1, z: 0 } }),
    ).toBeNull();
  });

  it("pickUnit matches the server's circle model (nearest containing circle)", () => {
    cover("client-screen-to-ground");
    const units = [
      { id: 1, x: 0, z: 0, radius: 0.6 },
      { id: 2, x: 1.1, z: 0, radius: 0.6 },
    ];
    expect(pickUnit({ x: 0.1, z: 0 }, units)).toBe(1);
    expect(pickUnit({ x: 1.0, z: 0 }, units)).toBe(2); // closer to 2's center
    expect(pickUnit({ x: 9, z: 9 }, units)).toBeNull(); // outside every circle+slack
  });
});
