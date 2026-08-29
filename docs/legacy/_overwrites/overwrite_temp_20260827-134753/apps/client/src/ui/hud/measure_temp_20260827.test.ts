import { describe, it } from "vitest";
import { hudSlotRect, type HudViewport } from "./hudLayout";
import { touchControlsRect } from "./touchControlsRect";
import { hudClusterRects, SHIPPED_HUD_CLUSTER } from "./hudBottomCluster";

describe("measure", () => {
  it("dump", () => {
    const vps: HudViewport[] = [
      { width: 375, height: 667 },
      { width: 844, height: 390 },
      { width: 852, height: 393 },
      { width: 780, height: 360 },
    ];
    for (const vp of vps) {
      const plate = hudClusterRects(vp, true, { resources: true, abilities: false }).resources!;
      // eslint-disable-next-line no-console
      console.log(`\n== ${vp.width}x${vp.height} plate`, JSON.stringify(plate));
      for (const b of touchControlsRect(vp).buttons) {
        // eslint-disable-next-line no-console
        console.log("   btn", b.id, JSON.stringify(b.rect));
      }
      for (const s of ["leave", "scoreboard", "audio-toggle", "settings", "cheats", "equipment"]) {
        // eslint-disable-next-line no-console
        console.log("   slot", s, JSON.stringify(hudSlotRect(s as never, vp, true)));
      }
    }
    // eslint-disable-next-line no-console
    console.log("shipped", JSON.stringify(SHIPPED_HUD_CLUSTER));
  });
});
