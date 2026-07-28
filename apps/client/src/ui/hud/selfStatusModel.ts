/**
 * YOUR OWN STATUS EFFECTS — the pure model.
 *
 * owner, 2026-07-27: 「我也看不出來自己暈眩還是發生什麼事情，應該要有提示自己的
 * 負面/正面 buff」.
 *
 * The complaint is sharper than 「缺一個面板」. When a stun eats your input, the
 * game gives you NOTHING: the ability presses simply do not happen. From the
 * player's chair that is indistinguishable from a bug, and the natural response
 * is to mash harder — which is the opposite of what the mechanic wants.
 *
 * WHAT THE WIRE CARRIES, AND WHAT IT DELIBERATELY DOES NOT. `SeatState` now
 * sends two index-aligned arrays: the status doc ids and the ticks remaining on
 * each. Polarity (`buff` / `debuff`) and the display name are NOT sent — they
 * live on the `status-effect@1` content doc the client already has. Sending
 * them too would put one truth in two places and let them drift.
 *
 * Everything here is a pure function so the whole thing is testable without a
 * DOM, a render loop or a socket.
 */
import { StatusEffects } from "@ggd/shared/content/registries";
import { TICK_HZ } from "@ggd/shared/constants";

/** One row the HUD draws. */
export interface SelfStatusRow {
  /** status doc id — also the React key */
  id: string;
  /** 中文 display name from the content doc; falls back to the id */
  label: string;
  /** buff = 正面, debuff = 負面 */
  polarity: "buff" | "debuff";
  /** whole seconds left, rounded UP so a dying effect never reads 0 while active */
  secondsLeft: number;
  /**
   * True when this effect TAKES YOUR CONTROLS AWAY (stun / root and friends).
   * That is the case the owner actually hit, so it gets its own emphasis rather
   * than being one debuff among many.
   */
  disabling: boolean;
}

/**
 * Tags that mean "you cannot act". Taken from the content docs' own `tags`, not
 * from a second list of ids here — a new stun ships as content and is loud by
 * default rather than silently joining the ordinary debuffs.
 */
export const DISABLING_TAGS: readonly string[] = ["stun", "root", "silence", "sleep", "fear"];

/** Cap on rows drawn. Beyond this the bar stops being readable at a glance. */
export const SELF_STATUS_MAX_ROWS = 8;

/**
 * Project the wire arrays into rows, debuffs first.
 *
 * DEBUFFS LEAD ON PURPOSE: the question the player is asking is 「我怎麼了」,
 * and the answer is almost always a debuff. Within each group, the most urgent
 * (least time left) sits first, and disabling effects outrank everything.
 */
export function selfStatusRows(
  ids: readonly string[] | undefined,
  remainTicks: readonly number[] | undefined,
): SelfStatusRow[] {
  if (!ids || ids.length === 0) return [];
  const rows: SelfStatusRow[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) continue;
    // A tick count with no id beside it (or the reverse) is a projection bug,
    // not a status — drop it rather than render a nameless timer.
    const ticks = remainTicks?.[i];
    if (ticks === undefined || ticks <= 0) continue;

    const doc = StatusEffects.tryGet(id);
    const tags = doc?.tags ?? [];
    rows.push({
      id,
      label: doc?.name ?? id,
      polarity: doc?.polarity === "buff" ? "buff" : "debuff",
      // ceil: 0.4s left must read 「1」, never 「0」 — a visible 0 on a live
      // effect is the player being told the wrong thing at the worst moment
      secondsLeft: Math.ceil(ticks / TICK_HZ),
      disabling: tags.some((t) => DISABLING_TAGS.includes(t)),
    });
  }
  rows.sort((a, b) => {
    if (a.disabling !== b.disabling) return a.disabling ? -1 : 1;
    if (a.polarity !== b.polarity) return a.polarity === "debuff" ? -1 : 1;
    if (a.secondsLeft !== b.secondsLeft) return a.secondsLeft - b.secondsLeft;
    return a.id < b.id ? -1 : 1; // stable
  });
  return rows.slice(0, SELF_STATUS_MAX_ROWS);
}

/** Colours, one place, so the panel and its test cannot disagree. */
export const STATUS_COLORS = {
  disabling: "#ff4d6d",
  debuff: "#ff9f43",
  buff: "#6fdc9a",
} as const;

export function statusColor(row: SelfStatusRow): string {
  return row.disabling ? STATUS_COLORS.disabling : STATUS_COLORS[row.polarity];
}
