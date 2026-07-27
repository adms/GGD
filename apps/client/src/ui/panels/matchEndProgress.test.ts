/**
 * matchEndProgress — 「查看戰績變化」 must open the CHART, in place.
 *
 * THE DEFECT THIS OWNS
 * ────────────────────
 * The settlement's 查看戰績變化 / 查看排名變化 buttons both called
 * `store.viewRankChange()`, which is a NAVIGATION by construction:
 *
 *     viewRankChange() {
 *       set({ lobbyView: "play", showRankChange: true });
 *       void get().returnToLobby();          // ← it IS "go back to the lobby"
 *     }
 *
 * so pressing 「查看戰績變化」 left the match and landed on the lobby
 * leaderboard — on the one screen the owner had just asked to STAY on
 * (「戰鬥勝利/失敗 最後結算的時候要停留」). `viewRankChange` itself is CORRECT
 * and is deliberately untouched; the lobby path needs it. What is wrong is
 * calling it from here.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A RENDER TEST
 * ───────────────────────────────────────────────
 * MatchEndPanel pulls the whole HUD + app store graph, the Babylon-backed
 * portrait tile and the audio subsystem; mounting it in the node env would test
 * the harness, exactly as roundReportMount.test.ts reasoned for MerchantShop.
 * The CHART's own rendering is proven for real, against real markup, in
 * progressChartRender.test.ts — this file owns only the SEAM.
 *
 * That seam is the #265 failure shape: 「可以從渲染樹整個刪掉而測試全綠」. Delete
 * the `<ProgressChartPanel …/>` line and every other test in this repo still
 * passes, because nothing else asserts the component is reachable from a screen
 * a player can get to.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "MatchEndPanel.tsx");
const source = (): string => readFileSync(SRC, "utf8");

/** Strip comments so a comment ABOUT viewRankChange never passes as a call. */
function code(): string {
  return source()
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("the settlement button opens the chart, not the lobby", () => {
  it("MatchEndPanel does not call viewRankChange ANYWHERE", () => {
    // The regression, stated in the strongest available form. Not "the button
    // does not", but "this file does not" — because a hook alias, a memo or a
    // handler extracted a level up would slip past a narrower pattern.
    const c = code();
    expect(
      c.includes("viewRankChange"),
      "MatchEndPanel references viewRankChange again — that call navigates to " +
        "the lobby leaderboard, which is exactly what 「查看戰績變化」 was changed " +
        "to stop doing (owner 2026-07-27). The lobby's own path keeps it; this " +
        "screen must expand ProgressChartPanel in place instead.",
    ).toBe(false);
  });

  it("the 查看戰績變化 button toggles LOCAL state and nothing else", () => {
    const c = code();
    expect(c).toMatch(/查看戰績變化/);
    expect(c).toMatch(/onClick=\{\(\) => setShowProgress\(\(v\) => !v\)\}/);
  });

  it("imports and MOUNTS <ProgressChartPanel /> — the #265 shape", () => {
    const c = code();
    expect(c).toMatch(
      /import\s*\{\s*ProgressChartPanel\s*\}\s*from\s*"\.\/ProgressChartPanel"/,
    );
    const mounts = c.match(/<ProgressChartPanel\b/g) ?? [];
    expect(
      mounts.length,
      "MatchEndPanel.tsx never renders <ProgressChartPanel> — the whole feature " +
        "is unreachable from the settlement screen",
    ).toBe(1);
  });

  it("the mount is LIVE JSX — not commented out, not behind {false}", () => {
    for (const line of source().split("\n")) {
      if (!line.includes("<ProgressChartPanel")) continue;
      const trimmed = line.trim();
      expect(trimmed.startsWith("//"), `commented-out mount: ${trimmed}`).toBe(false);
      expect(trimmed.startsWith("*"), `mount inside a block comment: ${trimmed}`).toBe(false);
      expect(/\{\s*false\s*&&/.test(line), `mount gated off: ${trimmed}`).toBe(false);
    }
  });

  it("the mount is fed REAL data — the series and the advice, not literals", () => {
    // The 「算出來但沒送到端點」 shape: a mounted panel handed `series={[]}` looks
    // identical in a source scan unless the props are checked too.
    const c = code();
    expect(c).toMatch(/series=\{progressSeries\}/);
    expect(c).toMatch(/advice=\{progressTips\}/);
    expect(c).toMatch(/buildProgressSeries\(\s*settlement\?\.rounds \?\? \[\]/);
    expect(c).toMatch(/progressAdvice\(\{/);
  });

  it("the advice reads the LOCAL player's real stats and gold balance", () => {
    const c = code();
    expect(c).toMatch(/stats: local\.stats/);
    expect(c).toMatch(/goldLeft: myGoldLeft/);
    // gold must come from the seat BALANCE, not from goldEarned (lifetime
    // income) — 「還有 N 金沒花」 is a claim about what is left, not what came in
    expect(c).toMatch(/seats\.find\(\(s\) => s\.seatId === localSeatId\)\?\.gold/);
    expect(c).not.toMatch(/goldLeft:\s*local\.stats\.goldEarned/);
  });

  it("返回大廳 survives — the panel must not become the only thing on screen", () => {
    expect(code()).toMatch(/onClick=\{\(\) => void returnToLobby\(\)\}/);
  });
});

describe("the lobby's own rank-change path is NOT what changed", () => {
  it("store.viewRankChange still exists and still returns to the lobby", () => {
    // Guard on the guard. 「不要動 viewRankChange —— 大廳那條路徑是對的」: if a
    // future edit "cleans up" the now-unused-from-here action, the lobby's
    // 戰績變化 flow dies silently and the assertion above passes vacuously.
    const store = readFileSync(join(__dirname, "..", "platform", "store.ts"), "utf8");
    expect(store).toMatch(/viewRankChange\(\)\s*\{/);
    expect(store).toMatch(/showRankChange:\s*true/);
    expect(store).toMatch(/returnToLobby\(\)/);
  });
});
