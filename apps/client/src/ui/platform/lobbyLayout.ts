/**
 * lobbyLayout — the lobby LEFT COLUMN's split policy (GH#255, extended
 * 2026-08-03).
 *
 * owner 2026-08-02:「原本排行榜移到朋友列表下半部，各佔左邊排的上下各半」
 * owner 2026-08-03:「大廳 FRIEND 跟排位榜 中間，多出一個區域顯示所有大廳正在線上
 * 的玩家列表，並且名字旁邊有按鈕可以一鍵加入朋友」
 * owner 2026-08-19 (GH#454):「大廳新增 **宿敵排行榜**，把**最多輸贏的宿敵**列在
 * **朋友列表跟積分排行榜之間**」
 *
 * So the column now carries FOUR panels — 朋友列表 / 線上玩家 / 宿敵榜 / 排位榜,
 * in that order — instead of two halves.
 *
 * ⚠️ TWO panels now claim 「between 朋友 and 排位榜」 (線上玩家 in 2026-08-03,
 * 宿敵榜 in 2026-08-19). Both instructions stay true whichever of the two sits
 * first, so their relative order is a genuine A-or-B and it is a POLICY VALUE
 * (`splitOrder`) rather than the order somebody happened to type into the JSX.
 * Shipped: 宿敵榜 directly above the ladder, because the two boards read as one
 * block (「我跟誰打」 then 「大家排到哪」) while 線上玩家 belongs next to 朋友.
 *
 * ---- WHY THIS IS A MODULE AND NOT NINE INLINE NUMBERS IN THE JSX ------------
 * "各佔上下各半" was a straight instruction on a desktop. On a phone it is a
 * DECISION: an iPhone in landscape is 844×390, and after the lobby's own 16px
 * padding a three-way split leaves each slice roughly 110px — three panels all
 * reduced to a heading and one row. Splitting anyway and stacking instead are
 * both defensible, which is exactly what CLAUDE.md calls a decision point: it
 * belongs in a named policy with a default, not in a comment defending
 * whichever branch got written first.
 *
 * Every panel added since has added decisions, and each one is a field here
 * rather than a literal in the panel:
 *
 *  · `friendsShare` / `onlineShare` / `nemesisShare` / `leaderboardShare` — how
 *    the column is divided. The numbers themselves are owner tuning; what this
 *    module guarantees is that they are PERCENTAGES (they sum to 1) and that
 *    what renders equals what the policy says.
 *  · `splitOrder` / `nemesisSort` — the two GH#454 decisions (see above).
 *  · `alreadyFriendMode` — what an ALREADY-FRIEND row looks like in 線上玩家.
 *    Shipped `"greyed-button"`: the row stays, the button goes inert and reads
 *    「已加入」. The alternative (`"hide-row"`) is genuinely tempting and
 *    genuinely worse by default — a friend who silently disappears from the
 *    online list reads as "he went offline", which is a lie the UI tells with
 *    a straight face. It is a field and not a verdict because a player with
 *    forty friends may well want the other behaviour.
 *  · `stackOrder` — the order the panels take when the column stacks on
 *    a phone. Shipped the same order as the desktop
 *    split, but it is a separate value because "what I want at the top of a
 *    phone screen" is not forced to equal "what I want at the top of a 900px
 *    column".
 *
 * ⚠️ THE CONTENT MIRROR EXISTS, THE RUNTIME CONSUMER DOES NOT. Every field here
 * is also `content/config/lobby-layout.json` + `config.lobby-layout@1` in
 * packages/shared/src/content/schema/config.ts, and apps/admin's
 * laneConfigDocs.test.ts compares the three cell by cell — so adding a field
 * means adding it in ALL of them or that test goes red. What is still missing
 * is a consumer: LobbyScreen.tsx reads DEFAULT_LOBBY_LAYOUT, not the document,
 * so editing the document today changes nothing on screen. That gap is tracked
 * in apps/admin/src/configDocCoverage.ts (`lobby-layout`, DEFERRED) with a
 * machine-checked expiry, ⛔ not by this comment.
 * (An earlier version of this paragraph said the three files did not exist yet.
 * They do — 第三守則:註解會說謊。)
 *
 * ---- SAFE-AREA CONTRACT (#107) ---------------------------------------------
 * Every value here is flow layout — flex grow/basis/min-height. Nothing in this
 * module positions anything absolutely, so the left column cannot grow a claim
 * on the persistent chrome the header already reserves.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

/** Which of the four left-column panels a slot holds. */
export type LeftColumnSlot = "friends" | "online" | "nemesis" | "leaderboard";

/**
 * How the 宿敵榜 orders its rows. owner did not pick one, and all three are
 * defensible, so it is a field with a default rather than an `if` in the panel:
 *
 *  · `played`  交手次數 —— 最中性：跟誰打得最多（出貨值）
 *  · `rivalry` 恩怨值   —— 最有戲：勝負接近五五開的排前面
 *  · `bane`    苦主/剋星 —— 最刺激也最傷人：對你贏最多的排前面
 *
 * EVERY row carries the numbers all three need (W-L、勝率、恩怨值), so changing
 * this reorders the list and changes nothing else.
 */
export type NemesisSortMode = "played" | "rivalry" | "bane";

/**
 * `split` — the panels divide the column's height by their shares.
 * `stack` — each panel keeps a readable minimum and the column scrolls as one.
 */
export type LeftColumnMode = "split" | "stack";

/**
 * What 線上玩家 does with somebody who is ALREADY a friend.
 * `greyed-button` — the row stays, the button is inert and reads 「已加入」.
 * `hide-row`      — the row is dropped from the list entirely.
 */
export type AlreadyFriendMode = "greyed-button" | "hide-row";

export interface Viewport {
  width: number;
  height: number;
}

export interface LobbyLayoutPolicy {
  /** Fixed width of the left column on a wide viewport, in px. */
  leftColumnWidthPx: number;
  /** 朋友列表's share of the column height in `split` mode, 0..1. */
  friendsShare: number;
  /** 線上玩家's share of the column height in `split` mode, 0..1. */
  onlineShare: number;
  /** 宿敵榜's share of the column height in `split` mode, 0..1. */
  nemesisShare: number;
  /** 排位榜's share of the column height in `split` mode, 0..1. */
  leaderboardShare: number;
  /** How the 宿敵榜 orders its rows (GH#454). */
  nemesisSort: NemesisSortMode;
  /** Top-to-bottom order of the panels in `split` mode (desktop). */
  splitOrder: LeftColumnSlot[];
  /** How 線上玩家 renders somebody who is already a friend. */
  alreadyFriendMode: AlreadyFriendMode;
  /** Top-to-bottom order of the panels in `stack` mode (phone). */
  stackOrder: LeftColumnSlot[];
  /** In `stack` mode, the height each panel is guaranteed, in px. */
  minSlotHeightPx: number;
  /**
   * Below this column height, `split` stops being readable and we stack.
   * 560px ⇒ four ~140px slices at the floor — already tight, which is why the
   * threshold is a field the owner can raise rather than a constant.
   */
  splitMinHeightPx: number;
  /**
   * Below this viewport width the lobby's columns are already full-width and
   * stacked by ui/platform/ranking.css (`@media (max-width: 720px)`), so the
   * left column is a full-width band and dividing it by height is meaningless.
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

/**
 * Shipped values. The shares are expressed independently (rather than "friends
 * + the rest") so the document reads as four percentages, and their sum is a
 * checked contract — see {@link lobbyLayoutProblems}.
 */
export const DEFAULT_LOBBY_LAYOUT: LobbyLayoutPolicy = {
  leftColumnWidthPx: 280,
  friendsShare: 0.25,
  onlineShare: 0.15,
  nemesisShare: 0.2,
  leaderboardShare: 0.4,
  nemesisSort: "played",
  splitOrder: ["friends", "online", "nemesis", "leaderboard"],
  alreadyFriendMode: "greyed-button",
  stackOrder: ["friends", "online", "nemesis", "leaderboard"],
  minSlotHeightPx: 168,
  splitMinHeightPx: 560,
  stackBelowWidthPx: 720,
};

/**
 * The bounds every field has to carry when it becomes a real 後台 field, in the
 * exact shape the Zod document needs. It lives here, next to the defaults, so
 * whoever wires `config.lobby-layout@1` copies numbers instead of inventing
 * them — CLAUDE.md 第一守則:「欄位要有上界，不是只有下界」.
 *
 * ⚠️ It is not enforcement. Nothing in this module clamps: a silent clamp is
 * the #279 failure (「後台輸入被靜默吃掉」). The checker below REPORTS instead.
 */
export const LOBBY_LAYOUT_BOUNDS = {
  leftColumnWidthPx: { min: 180, max: 480, int: true },
  /** Each share alone: below 0.15 a panel is a heading with no rows. */
  friendsShare: { min: 0.15, max: 0.7, int: false },
  onlineShare: { min: 0.15, max: 0.7, int: false },
  nemesisShare: { min: 0.15, max: 0.7, int: false },
  leaderboardShare: { min: 0.15, max: 0.7, int: false },
  minSlotHeightPx: { min: 80, max: 600, int: true },
  splitMinHeightPx: { min: 320, max: 1200, int: true },
  stackBelowWidthPx: { min: 320, max: 1600, int: true },
} as const;

/**
 * The FALLBACK desktop order. owner placed both 線上玩家 and 宿敵榜 「between
 * 朋友 and 排位榜」, so the desktop order is now `policy.splitOrder`; this array
 * is what a hand-edited policy that lost a panel falls back to, and it is also
 * the shipped value.
 */
const SPLIT_ORDER: readonly LeftColumnSlot[] = ["friends", "online", "nemesis", "leaderboard"];

/** Every panel the column must contain, exactly once, in either mode. */
export const ALL_SLOTS: readonly LeftColumnSlot[] = ["friends", "online", "nemesis", "leaderboard"];

/**
 * Everything wrong with a policy, as human sentences — empty means valid.
 *
 * The sum rule is the one that matters and the one a reviewer's eye slides
 * past: flexbox does not care whether three grow factors add to 1 (they are
 * relative), so a policy of 0.5/0.5/0.5 would LAY OUT FINE while the document
 * claims 50%/50%/50%. That is a number in the admin console that means nothing,
 * which is how a 「40%」 field stops being a percentage. So the contract is
 * checked out loud rather than implied by the renderer.
 */
export function lobbyLayoutProblems(policy: LobbyLayoutPolicy): string[] {
  const out: string[] = [];
  const sum = ALL_SLOTS.reduce((acc, slot) => acc + slotShare(slot, policy), 0);
  if (Math.abs(sum - 1) > 1e-6) {
    out.push(`${ALL_SLOTS.length} 段的比例加起來必須是 1（100%），現在是 ${sum}`);
  }
  for (const [key, b] of Object.entries(LOBBY_LAYOUT_BOUNDS)) {
    const v = policy[key as keyof LobbyLayoutPolicy] as number;
    if (typeof v !== "number" || Number.isNaN(v)) out.push(`${key} 不是數字`);
    else if (v < b.min || v > b.max) out.push(`${key}=${v} 超出 ${b.min}..${b.max}`);
    else if (b.int && !Number.isInteger(v)) out.push(`${key}=${v} 必須是整數`);
  }
  for (const key of ["stackOrder", "splitOrder"] as const) {
    const order = policy[key];
    const seen = new Set(order);
    if (order.length !== ALL_SLOTS.length || seen.size !== ALL_SLOTS.length) {
      out.push(`${key} 必須剛好列出 ${ALL_SLOTS.length} 塊面板各一次，現在是 ${JSON.stringify(order)}`);
    } else {
      for (const s of ALL_SLOTS) if (!seen.has(s)) out.push(`${key} 少了 ${s}`);
    }
  }
  return out;
}

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
 * Top-to-bottom order of the panels for a mode: `policy.splitOrder` on a
 * desktop, `policy.stackOrder` on a phone. They are separate values because
 * "what I want at the top of a phone screen" is not forced to equal "what I
 * want at the top of a 900px column".
 *
 * Unknown/duplicate entries in a hand-edited policy fall back to SPLIT_ORDER
 * rather than dropping a panel off the screen — a missing friends list is worse
 * than an ignored preference, and `lobbyLayoutProblems` says so out loud.
 */
export function leftColumnSlots(
  mode: LeftColumnMode,
  policy: LobbyLayoutPolicy = DEFAULT_LOBBY_LAYOUT,
): LeftColumnSlot[] {
  const order = mode === "stack" ? policy.stackOrder : policy.splitOrder;
  const seen = new Set(order ?? []);
  const usable = !!order && order.length === ALL_SLOTS.length && seen.size === ALL_SLOTS.length &&
    ALL_SLOTS.every((s) => seen.has(s));
  return usable ? [...order] : [...SPLIT_ORDER];
}

/** One slot's declared share of the column height. */
export function slotShare(slot: LeftColumnSlot, policy: LobbyLayoutPolicy = DEFAULT_LOBBY_LAYOUT): number {
  if (slot === "friends") return policy.friendsShare;
  if (slot === "online") return policy.onlineShare;
  if (slot === "nemesis") return policy.nemesisShare;
  return policy.leaderboardShare;
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
 * The style for one of the column's slots.
 *
 * In `split` every slot gets `flexBasis: 0` and a grow equal to its share, so
 * the shares are exactly that percentage of whatever height the column has —
 * the proportions the guard reads back off the DOM.
 * `overflowY: "auto"` is the 「各自內部捲動」 half of the ask and
 * `overflowX: "hidden"` is the 「不可以橫向溢出」 half; `minWidth: 0` lets the
 * panel inside actually shrink instead of forcing the column wider (a flex
 * item's default `min-width: auto` would not).
 */
export function leftColumnSlotStyle(
  slot: LeftColumnSlot,
  mode: LeftColumnMode,
  policy: LobbyLayoutPolicy = DEFAULT_LOBBY_LAYOUT,
): CSSProperties {
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
  return { ...common, flexGrow: slotShare(slot, policy), flexShrink: 1, flexBasis: 0, minHeight: 0 };
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
