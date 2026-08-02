/**
 * lobbyLayout — the lobby LEFT COLUMN's split policy (GH#255).
 *
 * owner: 「原本排行榜移到朋友列表下半部，各佔左邊排的上下各半」— so the left
 * column carries TWO panels, 朋友列表 on top and 排行榜 underneath, each owning
 * half the column and scrolling inside itself.
 *
 * ---- WHY THIS IS A MODULE AND NOT SIX INLINE NUMBERS IN THE JSX ------------
 * "各佔上下各半" is a straight instruction on a desktop. On a phone it is a
 * DECISION: an iPhone in landscape is 844×390, and after the lobby's own 16px
 * padding a 50/50 split leaves each half roughly 170px — a friends list and a
 * ranked ladder both reduced to two visible rows. Splitting anyway and stacking
 * instead are both defensible, which is exactly what CLAUDE.md calls a decision
 * point: it belongs in a named policy with a default, not in a comment
 * defending whichever branch got written first.
 *
 * So the policy is data ({@link DEFAULT_LOBBY_LAYOUT}) and the split/stack
 * choice is one pure function ({@link resolveLeftColumnMode}) that the screen
 * calls — nothing about the layout is expressed only as a literal inside JSX.
 *
 * ⚠️ THIS IS NOT YET AN ADMIN FIELD. A real 後台 field has to land in three
 * places at once (content/config/*.json + schema/config.ts + apps/admin), and
 * two of those files are being edited by other lanes in this same run. The
 * shape here is deliberately the shape a config document would have, so wiring
 * it up later is a move, not a rewrite. See the lane report.
 *
 * ---- SAFE-AREA CONTRACT (#107) ---------------------------------------------
 * Every value here is flow layout — flex grow/basis/min-height. Nothing in this
 * module positions anything absolutely, so the left column cannot grow a claim
 * on the persistent chrome the header already reserves.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/** Which of the two left-column panels a slot holds. */
export type LeftColumnSlot = "friends" | "leaderboard";

/**
 * `split` — 上下各半, the owner's ask, and the default everywhere there is room.
 * `stack` — each panel keeps a readable minimum and the column scrolls as one.
 */
export type LeftColumnMode = "split" | "stack";

export interface Viewport {
  width: number;
  height: number;
}

export interface LobbyLayoutPolicy {
  /** Fixed width of the left column on a wide viewport, in px. */
  leftColumnWidthPx: number;
  /**
   * 朋友列表's share of the column height in `split` mode, 0..1. The ladder
   * takes the rest, so `0.5` is the owner's 各半 and the only shipped value.
   */
  friendsShare: number;
  /** In `stack` mode, the height each panel is guaranteed, in px. */
  minSlotHeightPx: number;
  /**
   * Below this column height, `split` stops being readable and we stack. 560px
   * ⇒ two ~270px halves at the floor, which still shows ~6 ladder rows.
   */
  splitMinHeightPx: number;
  /**
   * Below this viewport width the lobby's columns are already full-width and
   * stacked by ui/platform/ranking.css (`@media (max-width: 720px)`), so the
   * left column is a full-width band and halving it by height is meaningless.
   * Kept equal to that stylesheet's breakpoint on purpose.
   *
   * That equality IS guarded: `lobbyLayout.test.ts` parses ranking.css, finds
   * the media block that makes `.ggd-lobby-col` full-width and compares its
   * `max-width` against this number — so moving either one alone is red. (The
   * first version of that test asserted `toBe(720)` against a literal and
   * caught nothing; see the test for the mutation that proves the current one.)
   */
  stackBelowWidthPx: number;
}

/** Shipped values. `friendsShare: 0.5` is the owner's 「各佔…上下各半」. */
export const DEFAULT_LOBBY_LAYOUT: LobbyLayoutPolicy = {
  leftColumnWidthPx: 280,
  friendsShare: 0.5,
  minSlotHeightPx: 168,
  splitMinHeightPx: 560,
  stackBelowWidthPx: 720,
};

/**
 * The current viewport, or `null` when there is no window at all — server
 * rendering and the node-environment tests. `null` resolves to the desktop
 * default rather than the phone one: a lobby rendered without a window is a
 * snapshot, and the owner's layout is the one worth snapshotting.
 */
export function readViewport(): Viewport | null {
  if (typeof window === "undefined") return null;
  return { width: window.innerWidth, height: window.innerHeight };
}

/** The split/stack decision. Pure, so both branches are directly testable. */
export function resolveLeftColumnMode(
  vp: Viewport | null,
  policy: LobbyLayoutPolicy = DEFAULT_LOBBY_LAYOUT,
): LeftColumnMode {
  if (vp === null) return "split";
  if (vp.width < policy.stackBelowWidthPx) return "stack";
  if (vp.height < policy.splitMinHeightPx) return "stack";
  return "split";
}

/**
 * The style the left column itself carries. `minWidth: 0` + a fixed width is
 * what keeps a long friend name or a wide ladder row from pushing the whole
 * lobby sideways (the requirement's 「整頁不可以橫向溢出」).
 */
export function leftColumnStyle(policy: LobbyLayoutPolicy = DEFAULT_LOBBY_LAYOUT): CSSProperties {
  return {
    width: policy.leftColumnWidthPx,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };
}

/**
 * The style for one half of the left column.
 *
 * In `split` both slots get `flexBasis: 0` and a grow equal to their share, so
 * two shares of 0.5 are two exactly equal halves of whatever height the column
 * has — the assertion the guard reads back. `overflowY: "auto"` is the 「各自
 * 內部捲動」 half of the ask and `overflowX: "hidden"` is the 「不可以橫向溢出」
 * half; `minWidth: 0` lets the panel inside actually shrink instead of forcing
 * the column wider (a flex item's default `min-width: auto` would not).
 */
export function leftColumnSlotStyle(
  slot: LeftColumnSlot,
  mode: LeftColumnMode,
  policy: LobbyLayoutPolicy = DEFAULT_LOBBY_LAYOUT,
): CSSProperties {
  const share = slot === "friends" ? policy.friendsShare : 1 - policy.friendsShare;
  const common: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
    overflowY: "auto",
    overflowX: "hidden",
  };
  if (mode === "stack") {
    return { ...common, flexGrow: 0, flexShrink: 0, flexBasis: "auto", minHeight: policy.minSlotHeightPx };
  }
  return { ...common, flexGrow: share, flexShrink: 1, flexBasis: 0, minHeight: 0 };
}

/**
 * `resolveLeftColumnMode` bound to the live window. Re-resolves on resize and
 * on orientation change (a phone rotating between 390×844 and 844×390 crosses
 * BOTH thresholds in this policy, so missing the event would strand the column
 * in the wrong mode).
 */
export function useLeftColumnMode(policy: LobbyLayoutPolicy = DEFAULT_LOBBY_LAYOUT): LeftColumnMode {
  const [vp, setVp] = useState<Viewport | null>(() => readViewport());
  useEffect(() => {
    const onResize = (): void => setVp(readViewport());
    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return resolveLeftColumnMode(vp, policy);
}
