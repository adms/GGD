import { describe, it } from "vitest";
import { HUD_SLOTS, hudSlotRect, type HudRect, type HudSlotId, type HudViewport } from "./hudLayout";
import { touchControlsRect } from "./touchControlsRect";
const VPS: HudViewport[] = [{width:844,height:390},{width:852,height:393},{width:780,height:360}];
function inter(a: HudRect, b: HudRect) {
  const x=Math.max(a.x,b.x), y=Math.max(a.y,b.y);
  const w=Math.min(a.x+a.w,b.x+b.w)-x, h=Math.min(a.y+a.h,b.y+b.h)-y;
  return w>0&&h>0?{w,h}:null;
}
describe("s",()=>{it("d",()=>{
  let area=0, atk=0; const rows:string[]=[];
  for (const vp of VPS) for (const s of HUD_SLOTS) {
    const sr = hudSlotRect(s.id as HudSlotId, vp, true);
    for (const b of touchControlsRect(vp).buttons) {
      const hit = inter(sr,b.rect);
      if (hit) { rows.push(`["${vp.width}x${vp.height}/${s.id}×${b.id}", "${hit.w}×${hit.h}"],`); area+=hit.w*hit.h; if(b.id==="attack") atk+=hit.w*hit.h; }
    }
  }
  console.log(rows.join("\n"));
  console.log(`ROWS=${rows.length} AREA=${Math.round(area)} ATTACK_AREA=${Math.round(atk)}`);
});});
