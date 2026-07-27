/**
 * settlementStay — the settlement screen must NOT leave on its own.
 *
 * owner, 2026-07-27: 「戰鬥勝利/失敗 最後結算的時候要停留 不要自動轉到大廳」.
 *
 * There was an AUTO_ADVANCE_SEC countdown in MatchEndPanel that called
 * viewRankChange() the moment it reached 0. A timer is the wrong shape for the
 * one screen where a player reads their grade, their KDA, their damage and the
 * ranking that auto-scrolls to their own row (#36) — and it fired hardest
 * exactly when there was most to read, because a winner's card is withheld for
 * the chicken firework first.
 *
 * Source-level assertions on purpose. The defect is the EXISTENCE of a timer,
 * and "no setInterval reaches viewRankChange" is a property of the file that a
 * render test cannot state — a jsdom render can only ever say "it did not
 * navigate during the 40 ms I watched", which is exactly what a 12-second
 * countdown would also say.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "MatchEndPanel.tsx");
const source = (): string => readFileSync(SRC, "utf8");

/** Strip block + line comments so a comment ABOUT the timer never passes as one. */
function code(): string {
  return source()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("#193 / owner 2026-07-27 — the settlement stays put", () => {
  it("has no auto-advance countdown left", () => {
    const c = code();
    expect(c).not.toMatch(/AUTO_ADVANCE_SEC/);
    expect(c).not.toMatch(/secsLeft/);
    // the caption that promised the jump
    expect(c).not.toMatch(/後自動前往/);
  });

  it("no timer anywhere in this file can navigate", () => {
    // The strong form: whatever timers remain (the chicken hold, the 名言
    // delay) must not reach a navigation call. Written as "no navigation
    // appears inside any setInterval/setTimeout body" rather than "no timers",
    // because the presentation ones are legitimate and must survive.
    const c = code();
    const timerBodies = [...c.matchAll(/set(?:Interval|Timeout)\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,/g)]
      .map((m) => m[1] ?? "")
      .concat([...c.matchAll(/set(?:Interval|Timeout)\(\s*\(\)\s*=>\s*([^,]+),/g)].map((m) => m[1] ?? ""));
    for (const body of timerBodies) {
      expect(body).not.toContain("viewRankChange");
      expect(body).not.toContain("returnToLobby");
    }
  });

  it("the exit is still reachable — staying must not mean being trapped", () => {
    // The counterpart failure to the one being fixed: delete the countdown AND
    // the button it replaced, and the player sits on the settlement forever.
    //
    // 返回大廳 is now the ONLY exit on this screen, deliberately. 「查看戰績變化」
    // used to be a second one (it called viewRankChange, which navigates); owner
    // 2026-07-27 made it expand the per-round chart IN PLACE instead. See
    // matchEndProgress.test.ts, which owns that half.
    const c = code();
    expect(c).toMatch(/onClick=\{\(\) => void returnToLobby\(\)\}/);
  });

  it("the presentation timers ARE still there", () => {
    // Guard on the guard: if a future edit strips every setTimeout from this
    // file the assertions above pass vacuously while the chicken firework hold
    // and the 名言 delay are both gone.
    const c = code();
    expect(c).toContain("MATCH_PANEL_HOLD_MS");
    expect(c).toContain("MATCH_QUOTE_DELAY_MS");
  });
});
