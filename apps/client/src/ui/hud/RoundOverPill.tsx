/**
 * RoundOverPill — the 「Round over」 pill of the `resolution` phase.
 *
 * ── WHY IT LIVES IN ITS OWN FILE ─────────────────────────────────────────────
 * It used to be a local function inside `HudRoot.tsx`, which meant the only way
 * to test its PLACEMENT was to scan HudRoot's source for a substring. That is
 * failure shape ⑥ (「掃原始碼字串代替行為」) and it was measured to be vacuous:
 * keeping the `...hudSurfaceStyle("round-over", rect)` spread and appending one
 * `top: 120` line after it re-creates the reported bug exactly while every
 * scan-based test stays green.
 *
 * So the pill is split the same way `SpectateNotice` already is: a PURE view
 * that takes the resolved rect, plus a two-line hook wrapper. The view renders
 * under `react-dom/server` in this package's node vitest env, so
 * `hudSurfacePaint.test.ts` reads the `top` / `left` / `width` / `max-height`
 * off the REAL markup and compares them against the registry's rect — ALL FOUR
 * SIDES, because the collision sweep proved all four. (`max-height` was
 * presence-checked only until 2026-07-30; inflating it grows the box downward
 * out of the rectangle that was proven clear. See PLACEMENT_KEYS there.)
 *
 * ⚠️ Rendering the VIEW alone is still one hop short, and the hop is where the
 * measured bypasses lived: the two-line WRAPPER chooses what rect the view gets
 * (`{ ...resolved, y: 106 }` was enough to restore the reported bug with the
 * whole suite green). Since 2026-07-30 that guard also mounts `<RoundOverPill />`
 * itself, exactly as HudRoot does.
 *
 * ── WHERE IT GOES (#107 → #219) ──────────────────────────────────────────────
 * v0.9.12 pinned `left: 50%; top: 120`, which is INSIDE the spectate banner's
 * own 106..150 band in the one phase where both are up — half of the owner's
 * 2026-07-30 report 「你的競技場已分出勝負 擋住結算評價」. It now claims the
 * `round-over` row of the top-centre stack in `hud/hudSurfaces`, so the banner
 * stacks BELOW it instead of on it and both yield width to the 評價 card.
 *
 * `null` = this viewport has no honest room, and on a phone that is the right
 * answer: the 評價 card already leads with 「回合勝利 / 回合敗北」.
 */
import type { HudRect } from "./hudLayout";
import { hudSurfaceStyle } from "./hudSurfaces";
import { useHudSurface } from "./useHudSurface";
import { PANEL_BG, PANEL_BORDER, TEXT_MAIN } from "../theme";

/**
 * The pure half. ⚠️ Every coordinate in the returned element comes from
 * `hudSurfaceStyle` — adding a `top` / `left` / `transform` of your own here is
 * precisely the bug #219 exists to close, and `hudSurfacePaint.test.ts` reads
 * the rendered style back to prove it did not happen.
 */
export function RoundOverPillView({ rect }: { rect: HudRect | null }): React.JSX.Element | null {
  if (!rect) return null;
  return (
    <div
      data-hud-surface="round-over"
      style={{
        ...hudSurfaceStyle("round-over", rect),
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 30px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 10,
        color: TEXT_MAIN,
        fontSize: 17,
        fontWeight: "bold",
        pointerEvents: "none",
      }}
    >
      Round over
    </div>
  );
}

/** The shipped component: the registry's answer for this viewport + scene. */
export function RoundOverPill(): React.JSX.Element | null {
  const rect = useHudSurface("round-over");
  return <RoundOverPillView rect={rect} />;
}
