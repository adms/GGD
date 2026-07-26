/**
 * The always-on ping chip (task #272) — its state machine, its label ladder and
 * the box it paints.
 *
 * Client vitest runs in a `node` env and the include glob is `*.test.ts`, so
 * this is a .ts suite using React.createElement (same as VersionBadge.test.ts).
 * In that env `document` is absent, `PingChip`'s <body> portal falls back to
 * inline rendering, and the markup stays assertable.
 *
 * ⚠️ NOTE WHAT THIS FILE CANNOT PROVE. Every test here builds its own input
 * object; none of them run GameApp. Deleting `<PingChip />` from GlobalChrome,
 * or the `perfBus.pingSamples = cs.pingSamples` lines from GameApp.samplePerf,
 * leaves every assertion below green while the chip shows nothing or lies. Those
 * lines are pinned by ./pingChipWiring.test.ts and ./globalChrome.test.ts.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { HUD_STAMP_BAND, hudPingChipContentPx } from "./hud/hudLayout";
import {
  PING_STALE_MS,
  estimateLabelPx,
  formatJitter,
  formatPing,
  pingChipState,
  pingChipText,
  type PingChipInput,
} from "./pingReadout";
import { PING_CHIP_ATTR, PING_CHIP_Z, PingChipView, pingChipStyle } from "./PingChip";

/** A live, healthy, in-match reading. Each test perturbs ONE thing. */
const LIVE: PingChipInput = {
  showPing: true,
  netMode: "live",
  netSnapshots: 120,
  pingMs: 42,
  jitterMs: 6,
  pingSamples: 30,
  pingAgeMs: 120,
  snapshotGapMs: 33,
  connection: "good",
};

const DESKTOP = hudPingChipContentPx(1280);

describe("the chip never prints a number it did not measure (ping-honest-states)", () => {
  it("before the first ack it says 量測中 — NOT a confident 0 ms", () => {
    cover("ping-honest-states");
    // THE headline lie this state exists to prevent. perfBus.pingMs is 0 from
    // page load until the first input-ack round trip completes, and 「0 ms」 is
    // the most flattering number the chip could possibly print.
    const s = pingChipState({ ...LIVE, pingMs: 0, pingSamples: 0, pingAgeMs: Infinity });
    expect(s.kind).toBe("unmeasured");
    expect(s.displayPingMs).toBe(-1);
    const text = pingChipText(s, DESKTOP);
    expect(text).toContain("量測中");
    expect(text).not.toMatch(/\b0\s*ms/);
  });

  it("a frozen estimate is labelled 停滯 — standing still is not a fast connection", () => {
    cover("ping-honest-states");
    // net/IntentSender sends nothing without a pending order, so a player who
    // stops moving stops producing seqs, the ack stops advancing and the EMA
    // sits at its last value indefinitely. Same after death (GameApp's
    // `if (seat && es)` gate stops calling noteAck at all).
    const fresh = pingChipState({ ...LIVE, pingAgeMs: PING_STALE_MS });
    expect(fresh.kind).toBe("live");
    const frozen = pingChipState({ ...LIVE, pingAgeMs: PING_STALE_MS + 1 });
    expect(frozen.kind).toBe("stale");
    // the last true reading is KEPT (it is not wrong, it is old) and named
    expect(frozen.displayPingMs).toBe(42);
    expect(pingChipText(frozen, DESKTOP)).toContain("停滯");
    expect(pingChipText(frozen, DESKTOP)).toContain("42");
  });

  it("「慢」 and 「斷」 are different states — the acceptance criterion for 1-4", () => {
    cover("ping-honest-states");
    // 拔網路要能分辨「慢」與「斷」. A bad-but-live link is `poor`; a link whose
    // snapshot stream has stopped is `offline`, and only the second says 斷線.
    const slow = pingChipState({ ...LIVE, pingMs: 260, connection: "poor", snapshotGapMs: 120 });
    expect(slow.kind).toBe("live");
    expect(pingChipText(slow, DESKTOP)).toContain("延遲");
    expect(pingChipText(slow, DESKTOP)).toContain("260");

    const cut = pingChipState({ ...LIVE, connection: "offline", snapshotGapMs: 4200 });
    expect(cut.kind).toBe("lost");
    const text = pingChipText(cut, DESKTOP);
    expect(text).toContain("斷線");
    // it reports HOW LONG, so 「is it hung or is it me」 is answerable at a glance
    expect(text).toContain("4.2s");
    // and it does NOT keep flashing the last good ping as if it were current
    expect(text).not.toContain("42");
  });

  it("a replay says 重播, because RTT is absent there BY CONSTRUCTION", () => {
    cover("ping-honest-states");
    // The replay page receives snapshots exactly like a match, so every other
    // signal says "connected"; but nobody sends input into a recording, so no
    // ack can ever come back. Without this the chip would read 量測中 forever.
    const s = pingChipState({ ...LIVE, netMode: "replay", pingSamples: 0, pingMs: 0 });
    expect(s.kind).toBe("replay");
    expect(pingChipText(s, DESKTOP)).toContain("重播");
  });

  it("hides when there is no stream at all, and when the player turned it off", () => {
    cover("ping-honest-states");
    // login / lobby / after teardown: perfBus is a process-global plain object,
    // so "0 snapshots" is the only honest statement about a page with no match.
    expect(pingChipState({ ...LIVE, netSnapshots: 0 }).kind).toBe("hidden");
    // `Show ping` was a DEAD switch before #272 (it gated one row of an overlay
    // that is itself off by default). This is the first time it does anything.
    expect(pingChipState({ ...LIVE, showPing: false }).kind).toBe("hidden");
    expect(pingChipText(pingChipState({ ...LIVE, showPing: false }), DESKTOP)).toBe("");
  });

  it("a local bot match shows its REAL (tiny) RTT — that is not a fake 0", () => {
    cover("ping-honest-states");
    // MEASURED CORRECTION to the brief: there is no server-less path.
    // RoomConnection.connectDev creates a real Colyseus room even offline, so a
    // bot match has a genuine round trip; it is simply ~1-3ms on loopback.
    const s = pingChipState({ ...LIVE, pingMs: 2, jitterMs: 0, pingSamples: 5 });
    expect(s.kind).toBe("live");
    expect(pingChipText(s, DESKTOP)).toContain("2 ms");
  });
});

describe("colour is never the only channel (ping-chip-label)", () => {
  it("every visible state carries a WORD as well as a colour", () => {
    cover("ping-chip-label");
    const cases: [PingChipInput, string, string][] = [
      [{ ...LIVE, connection: "good" }, "順暢", "#47cc6a"],
      [{ ...LIVE, connection: "fair", pingMs: 98, jitterMs: 20 }, "普通", "#f2c637"],
      [{ ...LIVE, connection: "poor", pingMs: 210, jitterMs: 50 }, "延遲", "#e5483f"],
      [{ ...LIVE, connection: "offline", snapshotGapMs: 3000 }, "斷線", "#e5483f"],
      [{ ...LIVE, pingAgeMs: 9999 }, "停滯", "#8d97ad"],
      [{ ...LIVE, pingSamples: 0 }, "量測中", "#8d97ad"],
    ];
    for (const [input, word, color] of cases) {
      const s = pingChipState(input);
      expect(s.color).toBe(color);
      expect(pingChipText(s, DESKTOP), `state ${s.kind} must say "${word}" in words too`).toContain(
        word,
      );
    }
    // good and poor share no colour AND no word — a colour-blind reader can
    // still tell them apart from the text alone.
    expect(pingChipState({ ...LIVE, connection: "good" }).color).not.toBe(
      pingChipState({ ...LIVE, connection: "poor" }).color,
    );
  });

  it("the ladder drops the WORD before the NUMBER, and keeps an ASCII marker", () => {
    cover("ping-chip-label");
    const poor = pingChipState({ ...LIVE, connection: "poor", pingMs: 210, jitterMs: 50 });
    // widest → both numbers; narrow → the number plus a non-colour marker
    expect(pingChipText(poor, 400)).toBe("延遲 210 ms · 抖動 50 ms");
    expect(pingChipText(poor, 60)).toBe("延遲 210ms");
    expect(pingChipText(poor, 40)).toBe("210ms!");
    expect(pingChipText(poor, 26)).toBe("210!");
    // even at an absurd budget the number survives — the ladder's last rung IS
    // the number, so "colour only" can never happen.
    expect(pingChipText(poor, 1)).toContain("210");
  });

  it("clamps the displayed numbers so a spike cannot widen the box", () => {
    cover("ping-chip-label");
    expect(formatPing(42.4)).toBe("42");
    expect(formatPing(999)).toBe("999");
    expect(formatPing(4321)).toBe("999+");
    expect(formatPing(-5)).toBe("0");
    expect(formatJitter(6.6)).toBe("7");
    expect(formatJitter(250)).toBe("99+");
    // width model sanity: CJK counts as a full em, ASCII as 0.6
    expect(estimateLabelPx("abc", 10)).toBeCloseTo(18, 6);
    expect(estimateLabelPx("順暢", 10)).toBeCloseTo(20, 6);
  });
});

describe("the chip's box (ping-chip-box)", () => {
  it("is confined to the reserved band and can never take a click", () => {
    cover("ping-chip-box");
    const s = pingChipStyle();
    expect(s.position).toBe("fixed");
    expect(s.bottom).toBe(0);
    expect(s.left).toBe(0);
    expect(s.top).toBeUndefined(); // never a top chip
    expect(s.boxSizing).toBe("content-box");
    expect(s.height).toBe(HUD_STAMP_BAND);
    expect(s.overflow).toBe("hidden");
    expect(s.whiteSpace).toBe("nowrap");
    // THE property that makes painting above every panel safe at any z-index
    expect(s.pointerEvents).toBe("none");
    // below the build stamp: if a future layer lands between them, the stamp is
    // the one a screenshot cannot do without
    expect(PING_CHIP_Z).toBeLessThan(2147483646);
    // tabular figures, so a changing ping cannot shift the clip point
    expect(s.fontVariantNumeric).toBe("tabular-nums");
    // the CSS width cap is the same arithmetic hudPingChipContentPx does
    expect(String(s.maxWidth)).toBe("max(0px, min(142px, calc(50vw - 148px)))");
    expect(hudPingChipContentPx(1280)).toBe(142);
    expect(hudPingChipContentPx(375)).toBeCloseTo(187.5 - 148, 6);
  });

  it("renders the text, the marker attribute and the state colour", () => {
    cover("ping-chip-box");
    const html = renderToStaticMarkup(
      createElement(PingChipView, { text: "順暢 42 ms · 抖動 6 ms", color: "#47cc6a", visible: true }),
    );
    expect(html).toContain("順暢 42 ms");
    expect(html).toContain(PING_CHIP_ATTR);
    expect(html).toMatch(/position:fixed/);
    expect(html).toMatch(/bottom:0/);
    expect(html).toMatch(/left:0/);
    expect(html).toMatch(/pointer-events:none/);
    expect(html).toContain(`height:${HUD_STAMP_BAND}px`);
    // aria-hidden: it is decoration for a screenshot, not something to announce
    expect(html).toContain("aria-hidden");
  });

  it("hides by DISPLAY, not by unmounting — entering a match costs no React work", () => {
    cover("ping-chip-box");
    const html = renderToStaticMarkup(
      createElement(PingChipView, { text: "", color: "#8d97ad", visible: false }),
    );
    expect(html).toContain("display:none");
  });
});
