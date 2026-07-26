/**
 * pingChip — the PURE decision layer behind the always-on latency chip (#272).
 *
 * owner: 「請你顯示玩家 ping 值在跟版本號一樣都一直畫面上」
 *
 * Everything that can be decided without a DOM lives here: what state the
 * connection is in, what text says so, and which colour goes with it. The
 * component (./PingChip.tsx) does nothing but portal a <div> and write these
 * strings into it on a timer. That split is deliberate — this project's own
 * post-mortem of #271 says it in as many words: 「任何『掃描 DOM 然後替使用者
 * 按下去』的程式碼，判斷部分一律抽成純函式。留在 .tsx 裡 = 永遠不會有人測它」.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE ARE SIX STATES AND NOT JUST "A NUMBER"
 * ---------------------------------------------------------------------------
 * `perfBus.pingMs` is not safe to print on its own. It is 0 until the first
 * input-ack round trip completes, and it FREEZES — silently, at its last value
 * — in three ordinary situations:
 *   • the player is standing still (`net/IntentSender.update()` sends nothing
 *     without a pending order/aim, so no new seq → the ack never advances);
 *   • the player is dead or their entity left the state (GameApp's
 *     `if (seat && es)` gate stops calling `noteAck` entirely);
 *   • the page is a REPLAY — snapshots arrive but nobody sends input, so an ack
 *     cannot exist at all.
 * A chip that printed the raw number would show a confident 「0 ms」 at match
 * start and a confident 「42 ms」 ten minutes after the network died. Both are
 * lies, and they are exactly the lies an always-on chip is worst at telling,
 * because the owner will trust it.
 *
 * The owner's brief also names the single-player case: 「單機對 bot 沒有真實
 * RTT — 顯示一個假的 0 ms 是說謊」. MEASURED CORRECTION: there is no
 * server-less path. `net/RoomConnection.connectDev` creates a real Colyseus
 * "match" room even offline (the owner ruled that bots are server-authoritative
 * too), so a bot match has a genuine RTT — it is simply small (localhost). That
 * is an honest number and is shown as one. The dishonest number was never the
 * bot match; it was the 0 before the first ack, which now reads 「量測中」.
 *
 * ---------------------------------------------------------------------------
 * COLOUR IS NEVER THE ONLY CHANNEL
 * ---------------------------------------------------------------------------
 * Every state carries a WORD (順暢 / 普通 / 延遲 / 停滯 / 斷線 / 量測中) as well
 * as a colour, and the number is present in every form that has one. On the
 * narrowest viewport the word is the first thing the ladder drops — so the
 * shortest forms carry an ASCII marker (`~` fair, `!` poor, `?` stale) instead,
 * and the NUMBER is the last thing to go, never the first.
 */
import type { ConnectionQuality, NetMode } from "../perfBus";

/**
 * How long an RTT sample stays "current". Past this the chip says 停滯 rather
 * than continuing to present a frozen EMA as live.
 *
 * 3 s, not 1: a player who is merely between orders still produces acks every
 * few hundred ms, and flickering the state at every pause would be noise. A
 * player who has genuinely stopped (standing still, dead, in the settlement
 * screen) crosses 3 s immediately and stays there.
 *
 * ⚠️ The alternative fix — a keep-alive seq while idle — was deliberately NOT
 * taken: it changes what the client puts on the wire, which is protocol work in
 * another lane, not a HUD change.
 */
export const PING_STALE_MS = 3000;

/** Largest ping printed as a number; anything beyond reads `999+`. */
export const PING_DISPLAY_MAX = 999;
/** Largest jitter printed as a number. */
export const JITTER_DISPLAY_MAX = 99;

/** Font size the chip paints at — equal to the reserved band height. */
export const PING_CHIP_FONT_PX = 10;

export type PingChipKind = "hidden" | "replay" | "unmeasured" | "stale" | "lost" | "live";

/** Everything the chip needs, all of it already on the perfBus. */
export interface PingChipInput {
  /** the `Show ping` network setting (settings/types.ts). */
  showPing: boolean;
  netMode: NetMode;
  netSnapshots: number;
  pingMs: number;
  jitterMs: number;
  pingSamples: number;
  pingAgeMs: number;
  snapshotGapMs: number;
  connection: ConnectionQuality;
}

export interface PingChipState {
  kind: PingChipKind;
  /** colour token; NEVER the only carrier of the state (see the module doc). */
  color: string;
  /** label candidates, widest first — `pingChipText` picks by available px. */
  tiers: readonly string[];
  /** the numeric ping as displayed (−1 when there is no measurement). */
  displayPingMs: number;
}

const GREEN = "#47cc6a";
const AMBER = "#f2c637";
const RED = "#e5483f";
const GREY = "#8d97ad";

const QUALITY_COLOR: Record<ConnectionQuality, string> = {
  good: GREEN,
  fair: AMBER,
  poor: RED,
  offline: RED,
};

const QUALITY_WORD: Record<ConnectionQuality, string> = {
  good: "順暢",
  fair: "普通",
  poor: "延遲",
  offline: "斷線",
};

/** ASCII redundancy for the tiers too narrow to carry a Chinese word. */
const QUALITY_MARK: Record<ConnectionQuality, string> = {
  good: "",
  fair: "~",
  poor: "!",
  offline: "!",
};

/** Clamp + format a ping for display: `42`, `999+`. */
export function formatPing(ms: number): string {
  const n = Math.max(0, Math.round(ms));
  return n > PING_DISPLAY_MAX ? `${PING_DISPLAY_MAX}+` : String(n);
}

/** Clamp + format a jitter for display: `6`, `99+`. */
export function formatJitter(ms: number): string {
  const n = Math.max(0, Math.round(ms));
  return n > JITTER_DISPLAY_MAX ? `${JITTER_DISPLAY_MAX}+` : String(n);
}

const seconds = (ms: number): string =>
  (Number.isFinite(ms) ? Math.max(0, ms) / 1000 : 0).toFixed(1);

/**
 * THE STATE MACHINE. Order matters and each rule is here because the state
 * below it would otherwise print something untrue.
 */
export function pingChipState(i: PingChipInput): PingChipState {
  // 1. the player turned it off. `Show ping` was a DEAD switch before #272 (it
  //    only gated one row of an overlay that is itself off by default), so this
  //    is the first time toggling it does anything a player can see.
  if (!i.showPing) return hidden();

  // 2. no authoritative stream has EVER arrived → login, lobby, or a match that
  //    has been torn down. There is no connection to describe, so nothing is
  //    shown; an "offline" chip on the login screen would be noise, not news.
  if (i.netSnapshots <= 0) return hidden();

  // 3. a replay: snapshots without a player, so RTT is absent by construction.
  if (i.netMode === "replay") {
    return { kind: "replay", color: GREY, tiers: ["重播 · 無 RTT", "重播", "重播"], displayPingMs: -1 };
  }

  // 4. the stream itself has stopped. THIS is the 「分辨『慢』與『斷』」 half of
  //    the acceptance criterion, and it only became possible when
  //    classifyConnection learned to return `offline` on a long snapshot gap —
  //    before that, pulling the cable left the chip on `poor` forever.
  if (i.connection === "offline") {
    const s = seconds(i.snapshotGapMs);
    return { kind: "lost", color: RED, tiers: [`斷線 ${s}s 無封包`, `斷線 ${s}s`, "斷線", "斷"], displayPingMs: -1 };
  }

  // 5. connected, but no round trip has completed yet. The raw bus value here
  //    is 0 — the single most misleading number this chip could print.
  if (i.pingSamples <= 0) {
    return { kind: "unmeasured", color: GREY, tiers: ["量測中 — ms", "量測中", "— ms", "—"], displayPingMs: -1 };
  }

  const p = formatPing(i.pingMs);
  const j = formatJitter(i.jitterMs);

  // 6. the last measurement is old: standing still, dead, or in a settlement
  //    screen. The number is kept (it is the last true reading) and labelled.
  if (i.pingAgeMs > PING_STALE_MS) {
    return {
      kind: "stale",
      color: GREY,
      tiers: [`停滯 ${p} ms（${seconds(i.pingAgeMs)}s 前）`, `停滯 ${p}ms`, `${p}ms?`, `${p}?`],
      displayPingMs: Math.round(i.pingMs),
    };
  }

  // 7. live.
  const q = i.connection;
  return {
    kind: "live",
    color: QUALITY_COLOR[q],
    tiers: [
      `${QUALITY_WORD[q]} ${p} ms · 抖動 ${j} ms`,
      `${QUALITY_WORD[q]} ${p}ms`,
      `${p}ms${QUALITY_MARK[q]}`,
      `${p}${QUALITY_MARK[q]}`,
    ],
    displayPingMs: Math.round(i.pingMs),
  };
}

function hidden(): PingChipState {
  return { kind: "hidden", color: GREY, tiers: [], displayPingMs: -1 };
}

/**
 * Full-width (CJK / fullwidth punctuation) code points occupy one whole em in
 * the monospace stack this chip uses; everything else ~0.6em. `—` (U+2014) is
 * East-Asian AMBIGUOUS, so it is counted as wide — the conservative direction.
 */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦—]/;

/**
 * Estimated rendered width of a label, in px. An ESTIMATE, on purpose: the real
 * guarantee that the chip never leaves its band is `max-width` + `overflow:
 * hidden` in the style, which is enforced numerically by the band guard. This
 * only decides WHICH form looks best, so a font-metric surprise costs a slightly
 * conservative label, never a layout escape.
 */
export function estimateLabelPx(text: string, fontPx = PING_CHIP_FONT_PX): number {
  let w = 0;
  for (const ch of text) w += WIDE.test(ch) ? fontPx : fontPx * 0.6;
  return w;
}

/**
 * Pick the widest label that fits `contentPx`. Always returns something: if even
 * the narrowest tier is too wide the narrowest is returned anyway and the CSS
 * clips it — a clipped number still beats an empty chip, and the ladder is built
 * so that the last rung is the number itself.
 */
export function pingChipText(state: PingChipState, contentPx: number): string {
  if (state.tiers.length === 0) return "";
  for (const t of state.tiers) if (estimateLabelPx(t) <= contentPx) return t;
  return state.tiers[state.tiers.length - 1]!;
}
