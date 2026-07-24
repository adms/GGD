/**
 * padMenuCapture — the one bit that says "a menu owns the pad right now, so the
 * combat pad must not ALSO drive the champion" (task #197).
 *
 * The DOM focus-nav layer (ui/PadFocusNav) and the combat pad system
 * (input/GamepadInput's MultiGamepadSystem) both read the SAME physical pad. In
 * live combat that is fine — the focus layer stands down (focusNavActive is
 * false) and the champion has the pad. But in champ-select, the intermission
 * shop/draft, the match-end screen, and any modal/overlay open over combat, the
 * focus layer is driving menus with the D-pad and A — and if the combat map ALSO
 * cast Q on that same A press (a no-op the server rejects, but with a refusal
 * cue) the player would hear a rejected-cast blip on every menu click.
 *
 * So the focus layer raises this flag while it owns PAD 0 (the menu pad, which
 * is the first connected pad, i.e. player 0's), and MultiGamepadSystem skips
 * player 0 while it is set. Couch players 1..3 keep their own pads (they pick
 * champions with their own A during champ-select). A plain boolean, not a store:
 * it has no wire representation and is read once per frame on both sides.
 */
let capturingPad0 = false;

/** The focus-nav layer calls this each frame with whether it owns pad 0. */
export function setPadMenuCapture(active: boolean): void {
  capturingPad0 = active;
}

/** Does a menu currently own pad 0? (MultiGamepadSystem checks this per frame.) */
export function isPadMenuCapturing(): boolean {
  return capturingPad0;
}
