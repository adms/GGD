/**
 * CooldownChrome — the cooldown overlay stack a single ability tile wears, so
 * the desktop bar, the touch arc and the couch chip cannot drift apart (#219).
 *
 * Three elements, in paint order:
 *   1. the RADIAL WIPE + flat dim (`cooldownWipeStyle`) — rotates and shrinks,
 *      which the bottom-anchored cast fill never does, so a cooling tile and a
 *      channelling tile can no longer read the same;
 *   2. the NUMBER (`cooldownNumberStyle`) — shadowed/stroked and tabular, with
 *      one decimal under 3 s so the last seconds visibly tick;
 *   3. the READY BLOOM — a 340 ms one-shot on the frame the cooldown ends.
 *
 * Mount it AFTER the tile's icon/name overlays and BEFORE the cast fill, inside
 * a parent with `position: relative` + `overflow: hidden` (every ability tile
 * already has both; the couch chip gained them with this change).
 *
 * The ready edge is the ONLY stateful part, and it lives here rather than in
 * the surfaces because the tiles are rendered inside IIFEs and `.map` callbacks
 * with early `return null`s — calling a hook there would be conditional. As a
 * component it gets its own, unconditional, hook order.
 */
import { useEffect, useRef, useState } from "react";
import {
  cooldownNumberStyle,
  cooldownReadyStyle,
  cooldownWipeStyle,
  isReadyEdge,
  READY_FLASH_MS,
  type CooldownView,
} from "../cooldownView";

/** Monotonic token so consecutive flashes remount the animated element. */
let flashSeq = 0;

/**
 * 0 while nothing to celebrate, else the token of the live ready-bloom. Reads
 * only the remaining seconds, so it works identically on all three surfaces.
 */
function useReadyFlash(cdSecs: number): number {
  const prev = useRef(cdSecs);
  const [token, setToken] = useState(0);
  useEffect(() => {
    const was = prev.current;
    prev.current = cdSecs;
    if (isReadyEdge(was, cdSecs)) {
      const mine = ++flashSeq;
      setToken(mine);
      const id = setTimeout(() => setToken((cur) => (cur === mine ? 0 : cur)), READY_FLASH_MS);
      return () => clearTimeout(id);
    }
    // a fresh cast cancels a bloom still on screen — never both at once
    if (cdSecs > 0) setToken(0);
    return undefined;
  }, [cdSecs]);
  return token;
}

export function CooldownChrome({
  cd,
  fontSize,
}: {
  cd: CooldownView;
  /** number size for this surface (52px tile 20 / 58px circle 20 / 24px chip 12) */
  fontSize: number;
}): React.JSX.Element | null {
  const flash = useReadyFlash(cd.cdSecs);
  if (!cd.onCd && flash === 0) return null;
  return (
    <>
      {cd.onCd && <div data-cd-wipe="" style={cooldownWipeStyle(cd.frac)} />}
      {cd.onCd && <div style={cooldownNumberStyle(fontSize)}>{cd.label}</div>}
      {flash !== 0 && <div key={flash} style={cooldownReadyStyle()} />}
    </>
  );
}
