import { describe, it } from "vitest";
import { hudSlotRect, hudSlotOffset, hudStackEnd, HUD_STAMP_BAND, HUD_SLOTS, type HudRect, type HudViewport } from "./hudLayout";
import { touchControlsRect } from "./touchControlsRect";

function isect(a: HudRect, b: HudRect): HudRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

const VPS: HudViewport[] = [
  { width: 844, height: 390 },
  { width: 852, height: 393 },
  { width: 780, height: 360 },
  { width: 375, height: 667 },
];

describe("probe", () => {
  it("dump", () => {
    console.log("HUD_STAMP_BAND", HUD_STAMP_BAND);
    for (const vp of VPS) {
      console.log("=== vp", vp.width, "x", vp.height);
      const eq = hudSlotRect("equipment", vp, true);
      console.log("  equipment", JSON.stringify(eq), "bottom", eq.y + eq.h);
      const et = hudSlotRect("enemy-team", vp, true);
      console.log("  enemy-team", JSON.stringify(et), "bottom", et.y + et.h);
      void eq;
      for (const slot of ["leave", "scoreboard", "audio-toggle", "settings", "cheats", "equipment"] as const) {
        const sr = hudSlotRect(slot, vp, true);
        for (const { id, rect } of touchControlsRect(vp).buttons) {
          const h = isect(rect, sr);
          if (h) console.log(`    ["${vp.width}x${vp.height}/${slot}\u00d7${id}", "${h.w}\u00d7${h.h}"],`);
        }
      }
    }
    console.log("--- touch top-right stack ---");
    for (const s of HUD_SLOTS) {
      console.log(s.id, "touchCorner", (s as { touchCorner?: string }).touchCorner ?? s.corner, "off", hudSlotOffset(s.id, true));
    }
    console.log("stackEnd top-right touch", hudStackEnd("top-right", true));
    console.log("stackEnd top-left touch", hudStackEnd("top-left", true));
  });
});
