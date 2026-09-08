import type { FloatingTextEntry } from "../../../client/src/vfx/FloatingTextFx";
import { combatTextLane } from "../../../client/src/ui/combatText";

export interface ForgeFloatingText {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  fontSize: number;
}

/** Consume the shipped pool; lifetime, drift, staggering and scale stay in VfxSystem. */
export function projectFloatingTexts(
  entries: readonly FloatingTextEntry[],
  project: (x: number, y: number, z: number) => { sx: number; sy: number; visible: boolean },
): ForgeFloatingText[] {
  return entries.flatMap(entry => {
    if (!entry.active || entry.alpha <= 0) return [];
    const pose = project(entry.x + entry.driftX, entry.y + entry.lift, entry.z + entry.driftZ);
    if (!pose.visible) return [];
    return [{ id: `${entry.slot}:${entry.gen}`, text: entry.text,
      x: pose.sx + combatTextLane(entry.lane), y: pose.sy,
      color: `rgb(${entry.r}, ${entry.g}, ${entry.b})`, alpha: entry.alpha,
      fontSize: Math.max(1, Math.round(20 * entry.sizeScale)),
    }];
  });
}
