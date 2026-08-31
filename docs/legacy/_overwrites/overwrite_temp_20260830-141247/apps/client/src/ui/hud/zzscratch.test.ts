import { describe, it } from "vitest";
import { HUD_SLOTS, hudSlotRect, hudSlotCorner, hudSlotOffset, hudSlotHeight, hudSlotWidth, type HudRect, type HudSlotId, type HudViewport } from "./hudLayout";
import { touchControlsRect } from "./touchControlsRect";

const VPS: HudViewport[] = [
  { width: 844, height: 390 },
  { width: 852, height: 393 },
  { width: 780, height: 360 },
];
function inter(a: HudRect, b: HudRect): HudRect | null {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}
describe("scratch", () => {
  it("dump", () => {
    for (const vp of VPS) {
      console.log(`\n### ${vp.width}x${vp.height}`);
      for (const c of ["top-left","top-right","bottom-left","bottom-right"] as const) {
        const rows = HUD_SLOTS.filter((s) => hudSlotCorner(s.id as HudSlotId, true) === c);
        console.log(` corner ${c}:`);
        for (const s of rows) {
          const r = hudSlotRect(s.id as HudSlotId, vp, true);
          console.log(`   ${s.id.padEnd(14)} off=${hudSlotOffset(s.id as HudSlotId,true)} h=${hudSlotHeight(s.id as HudSlotId,true,vp)} w=${hudSlotWidth(s.id as HudSlotId,true,vp)} rect=${JSON.stringify(r)}`);
        }
      }
      console.log(" touch buttons:");
      for (const b of touchControlsRect(vp).buttons) console.log(`   ${b.id.padEnd(8)} ${JSON.stringify(b.rect)}`);
      console.log(" cluster:", JSON.stringify(touchControlsRect(vp).cluster));
      // total overlaps
      const tot: string[] = [];
      for (const s of HUD_SLOTS) {
        const sr = hudSlotRect(s.id as HudSlotId, vp, true);
        for (const b of touchControlsRect(vp).buttons) {
          const hit = inter(sr, b.rect);
          if (hit) tot.push(`${s.id}×${b.id}=${hit.w}×${hit.h}`);
        }
      }
      console.log(" overlaps:", tot.join(" | "));
    }
  });
});
