/**
 * The minimap's fire-ring rim (task #195) — it must track the REPLICATED
 * radius, not the round clock.
 *
 * Before #195 `Minimap.tsx` drew the rim at the zone boundary under the comment
 * 「the sim has no shrinking-ring entity, so the map must not draw one」 —
 * recorded as row P1-3(d) in docs/_false-completions.md, because the sim WAS
 * burning people at the time. Now the sim owns a radius and replicates it, so
 * the map draws that, and this locks the relationship.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dangerRimSpecFor } from "./minimapMath";

const ZONE_R = 24;
const base = { phase: "combat", fireRingTicks: 1800, zoneRadius: ZONE_R };

describe("minimap danger rim tracks fireRingRadius (firering-shrink)", () => {
  it("draws AT the replicated radius, not at the zone boundary", () => {
    cover("firering-shrink");
    for (const r of [18.125, 12.25, 6.375, 0.5]) {
      const spec = dangerRimSpecFor({ ...base, fireRingRadius: r });
      expect(spec).not.toBeNull();
      expect(spec!.radius).toBe(r);
      expect(spec!.radius).toBeLessThan(ZONE_R);
    }
  });

  it("urgency climbs from 0 at the first shrink tick to ~1 when closed", () => {
    cover("firering-shrink");
    const a = dangerRimSpecFor({ ...base, fireRingRadius: 23.9 })!;
    const b = dangerRimSpecFor({ ...base, fireRingRadius: 12.25 })!;
    const c = dangerRimSpecFor({ ...base, fireRingRadius: 0.5 })!;
    expect(a.urgency).toBeGreaterThan(0);
    expect(a.urgency).toBeLessThan(0.02);
    expect(b.urgency).toBeCloseTo(0.4896, 3);
    expect(c.urgency).toBeGreaterThan(0.97);
    expect(a.urgency).toBeLessThan(b.urgency);
    expect(b.urgency).toBeLessThan(c.urgency);
  });

  it("draws NOTHING before the ring moves, when disarmed, or out of combat", () => {
    cover("firering-shrink");
    // armed but not yet ignited: radius still == the zone boundary
    expect(dangerRimSpecFor({ ...base, fireRingTicks: 0, fireRingRadius: ZONE_R })).toBeNull();
    // disarmed
    expect(dangerRimSpecFor({ ...base, fireRingTicks: -1, fireRingRadius: 10 })).toBeNull();
    // not combat (intermission / settlement / champ select)
    for (const phase of ["intermission", "resolution", "matchEnd", "champSelect"]) {
      expect(dangerRimSpecFor({ ...base, phase, fireRingRadius: 10 })).toBeNull();
    }
    // degenerate geometry
    expect(dangerRimSpecFor({ ...base, zoneRadius: 0, fireRingRadius: 10 })).toBeNull();
    expect(dangerRimSpecFor({ ...base, fireRingRadius: 0 })).toBeNull();
  });

  it("the false comment is GONE from Minimap.tsx, and the clock no longer drives it", () => {
    cover("firering-shrink");
    const src = readFileSync(join(__dirname, "Minimap.tsx"), "utf8");
    // P1-3(d): the claim that the sim has no shrinking ring
    expect(src).not.toMatch(/no shrinking-ring entity/);
    expect(src).not.toMatch(/the map must not draw one/);
    // the rim must not be gated on the ROUND CLOCK any more
    expect(src).not.toMatch(/FIRE_RING_SEC/);
    // …it must go through the tested rule
    expect(src).toMatch(/dangerRimSpecFor/);
  });
});
