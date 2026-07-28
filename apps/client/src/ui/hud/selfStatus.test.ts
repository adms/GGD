/**
 * 自身狀態提示 — owner, 2026-07-27:
 *   「我也看不出來自己暈眩還是發生什麼事情，應該要有提示自己的負面/正面 buff」
 *
 * ⚠️ THIS FEATURE'S REAL RISK IS NOT THE PANEL. Before this change the wire
 * carried ONLY `EntityState.flags` — four negative bits, zero positive-buff
 * bits, no effect identity, no remaining time. The status was computed by the
 * sim and never left the server. That is failure shape ② (computed but never
 * delivered), and a beautiful panel fed by nothing would have shipped green.
 *
 * So the guards below are layered:
 *   · the model, alone (ordering, seconds, polarity, the disabling case)
 *   · the RENDERED markup, read through `visibleText` — the aria-label and the
 *     `data-status-*` attributes are deliberately NOT allowed to answer for it
 *   · a CSS-invisibility denylist, because the node env has no layout engine
 *     and `display:none` would otherwise pass every text assertion
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { StatusEffects } from "@ggd/shared/content/registries";
import { TICK_HZ } from "@ggd/shared/constants";
import {
  DISABLING_TAGS,
  SELF_STATUS_MAX_ROWS,
  selfStatusRows,
  statusColor,
  STATUS_COLORS,
} from "./selfStatusModel";
import { SelfStatusBarView } from "./SelfStatusBar";

beforeAll(() => {
  registerSkeletonContent();
  // The shipped status docs this feature reads. Registered explicitly so the
  // test does not depend on whatever the skeleton fixture happens to include.
  StatusEffects.register({
    id: "burnstun",
    schema: "status-effect@1",
    name: "Searing Stun",
    description: "Stunned by the firestorm.",
    polarity: "debuff",
    tags: ["stun"],
  } as never);
  StatusEffects.register({
    id: "slow30",
    schema: "status-effect@1",
    name: "Slow (30%)",
    description: "slowed",
    polarity: "debuff",
    tags: ["slow"],
  } as never);
  StatusEffects.register({
    id: "moon-combo",
    schema: "status-effect@1",
    name: "者、皆、陣 連段",
    description: "combo",
    polarity: "buff",
    tags: [],
  } as never);
});

/** Strip every tag WITH its attributes — only what a browser would paint. */
function visibleText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const sec = (n: number): number => n * TICK_HZ;

describe("the model", () => {
  it("names the effect from the CONTENT doc, not the id", () => {
    const rows = selfStatusRows(["burnstun"], [sec(3)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("Searing Stun");
    expect(rows[0]!.polarity).toBe("debuff");
    expect(rows[0]!.disabling).toBe(true);
  });

  it("an unknown id still shows SOMETHING rather than vanishing", () => {
    // A status the client's content does not know is still a status the player
    // is under. Silently dropping it is the worse failure.
    const rows = selfStatusRows(["not-a-real-status"], [sec(2)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("not-a-real-status");
  });

  it("seconds round UP — a live effect never reads 0", () => {
    // 0.4s left must read 1. Telling a stunned player 「0s」 while they still
    // cannot act is exactly the confusion this feature exists to remove.
    expect(selfStatusRows(["slow30"], [12])[0]!.secondsLeft).toBe(1);
    expect(selfStatusRows(["slow30"], [sec(2)])[0]!.secondsLeft).toBe(2);
  });

  it("expired or absent entries are dropped, not rendered as 0s", () => {
    expect(selfStatusRows(["slow30"], [0])).toHaveLength(0);
    expect(selfStatusRows(["slow30"], [-5])).toHaveLength(0);
    expect(selfStatusRows(["slow30"], undefined)).toHaveLength(0);
    expect(selfStatusRows(undefined, [sec(3)])).toHaveLength(0);
    // a ragged pair is a projection bug, not a status
    expect(selfStatusRows(["a", "b"], [sec(1)])).toHaveLength(1);
  });

  it("DISABLING first, then debuffs, then buffs", () => {
    // The owner's question is 「我怎麼了」 and the answer is almost always the
    // thing taking his controls away. Ordering is the feature, not decoration.
    const rows = selfStatusRows(
      ["moon-combo", "slow30", "burnstun"],
      [sec(9), sec(4), sec(8)],
    );
    expect(rows.map((r) => r.id)).toEqual(["burnstun", "slow30", "moon-combo"]);
  });

  it("more urgent first within a group", () => {
    const rows = selfStatusRows(["slow30", "not-a-real-status"], [sec(9), sec(2)]);
    expect(rows[0]!.secondsLeft).toBe(2);
  });

  it("caps the rows so the bar stays readable", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `x${i}`);
    expect(selfStatusRows(ids, ids.map(() => sec(5)))).toHaveLength(SELF_STATUS_MAX_ROWS);
  });

  it("a stun and a buff do NOT share a colour", () => {
    const stun = selfStatusRows(["burnstun"], [sec(2)])[0]!;
    const buff = selfStatusRows(["moon-combo"], [sec(2)])[0]!;
    const slow = selfStatusRows(["slow30"], [sec(2)])[0]!;
    expect(statusColor(stun)).toBe(STATUS_COLORS.disabling);
    expect(statusColor(buff)).toBe(STATUS_COLORS.buff);
    expect(statusColor(slow)).toBe(STATUS_COLORS.debuff);
    expect(new Set([statusColor(stun), statusColor(buff), statusColor(slow)]).size).toBe(3);
  });

  it("the disabling list is driven by the doc's own tags", () => {
    expect(DISABLING_TAGS).toContain("stun");
    expect(DISABLING_TAGS).toContain("root");
    expect(DISABLING_TAGS).toContain("silence");
  });
});

describe("what the player actually SEES", () => {
  const render = (ids: string[], ticks: number[]): string =>
    renderToStaticMarkup(createElement(SelfStatusBarView, { rows: selfStatusRows(ids, ticks) }));

  it("paints the NAME and the COUNTDOWN as visible text", () => {
    // ⚠️ Read through visibleText: the component also carries data-status-id and
    // an aria-live region, and neither of those is a pixel.
    const out = render(["burnstun"], [sec(3)]);
    const seen = visibleText(out);
    expect(seen).toContain("Searing Stun");
    expect(seen).toContain("3s");
  });

  it("the countdown really counts — it is not a fixed string", () => {
    expect(visibleText(render(["slow30"], [sec(5)]))).toContain("5s");
    expect(visibleText(render(["slow30"], [sec(1)]))).toContain("1s");
    expect(visibleText(render(["slow30"], [sec(5)]))).not.toContain("1s");
  });

  it("nothing at all when nothing is active", () => {
    expect(render([], [])).toBe("");
  });

  it("a buff and a debuff are distinguishable in the SHIPPED markup", () => {
    const out = render(["burnstun", "moon-combo"], [sec(2), sec(9)]);
    expect(out).toContain(STATUS_COLORS.disabling);
    expect(out).toContain(STATUS_COLORS.buff);
  });

  /* ─────────────────────────────────────────────────────────────────────────
   * RENDERED BUT INVISIBLE. `renderToStaticMarkup` has no layout engine, so a
   * `display:none` would sail past every assertion above. Bounded denylist,
   * same instrument as killCombo.test.ts — it buys back the measurable hole and
   * claims nothing more.
   * ───────────────────────────────────────────────────────────────────────── */
  const HIDES_IT: { name: string; re: RegExp }[] = [
    { name: "display:none", re: /display:\s*none/i },
    { name: "visibility:hidden", re: /visibility:\s*(hidden|collapse)/i },
    { name: "opacity:0", re: /opacity:\s*0(?:\.0+)?(?:[;"]|$)/i },
    { name: "font-size:0", re: /font-size:\s*0(?:\.0+)?(?:px)?(?:[;"]|$)/i },
    { name: "zero height", re: /(?:^|[;\s])height:\s*0(?:px)?(?:[;"]|$)/i },
    { name: "transparent text", re: /color:\s*transparent/i },
  ];

  for (const { name, re } of HIDES_IT) {
    it(`does not ship ${name}`, () => {
      const styles = [...render(["burnstun"], [sec(3)]).matchAll(/style="([^"]*)"/g)].map((m) => m[1]!);
      expect(styles.filter((s) => re.test(s)), `${name} means it renders but paints nothing`).toEqual([]);
    });
  }
});
