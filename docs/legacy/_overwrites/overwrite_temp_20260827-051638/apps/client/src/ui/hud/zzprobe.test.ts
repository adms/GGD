import { describe, it } from "vitest";
import { HUD_EDGE, HUD_GAP, HUD_SLOTS, HUD_STAMP_BAND, hudSlotRect, hudSlotHeight, hudSlotCorner, hudSlotOrder, type HudSlotId } from "./hudLayout";
describe("probe", () => {
  it("probe", () => {
    const vp = { width: 780, height: 360 };
    const stack = HUD_SLOTS.filter((s) => hudSlotCorner(s.id as HudSlotId, true) === "top-left")
      .sort((a, b) => hudSlotOrder(a.id as HudSlotId, true) - hudSlotOrder(b.id as HudSlotId, true));
    let acc = HUD_EDGE;
    for (const s of stack) {
      const h = hudSlotHeight(s.id as HudSlotId, true, vp);
      console.log(`${s.id} order=${hudSlotOrder(s.id as HudSlotId, true)} h=${h} top=${acc} bottom=${acc + h}`);
      acc += h + HUD_GAP;
    }
    const r = hudSlotRect("enemy-team", vp, true);
    console.log("enemy-team rect", JSON.stringify(r), "bottom", r.y + r.h, "budget", vp.height - HUD_STAMP_BAND, "HUD_GAP", HUD_GAP);
  });
});
