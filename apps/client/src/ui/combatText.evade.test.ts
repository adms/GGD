/**
 * 迴避 floating text (task #92b) — the half of evasion that was never built.
 *
 * `packages/shared/src/sim/combat/evasion.ts` has emitted `evade` since the
 * mechanism landed, and the game-server fan-out now forwards it, but the client
 * had no case for it: a dodge rendered NOTHING, which on screen is
 * indistinguishable from a dropped packet or a broken attack. These tests pin
 * the contract that fixes that, and specifically the property the owner asked
 * for — that you can tell AT A GLANCE which side of the dodge you were on.
 *
 * Everything here drives the REAL model and the REAL admission pipeline. The
 * point of routing 迴避 through `pushCombatText` rather than giving it a spawner
 * of its own is that it inherits every task #92 policy for free; a test that
 * stubbed the pipeline would be testing the opposite of the design.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { TEAM_CSS } from "./theme";
import {
  COMBAT_TEXT_CATEGORIES,
  COMBAT_TEXT_WORDS,
  KILL_SIZE_MULT,
  BASE_LIFT_PX,
  combatTextCategory,
  combatTextCss,
  combatTextLabel,
  combatTextStyle,
  combatTextWidthPx,
  scopeAllows,
  type CombatTextCategory,
  type CombatTextEvent,
  type CombatTextScope,
} from "./combatText";
import {
  frameBus,
  pushEvadeText,
  pushCombatText,
  clearCombatText,
  relationToLocal,
  setCombatTextScope,
  type ChampionAnchor,
} from "../frameBus";

// ---------------------------------------------------------------- colour math
// CIE76 ΔE, identical to the helper in combatText.test.ts — repeated rather than
// exported from there so this file does not couple to another suite's internals.
const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const parseHex = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toLab = (hex: string): [number, number, number] => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number];
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(X), f(Y), f(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const deltaE = (a: string, b: string): number => {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};
const relLum = (hex: string): number => {
  const [r, g, b] = parseHex(hex).map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const ev = (over: Partial<CombatTextEvent> = {}): CombatTextEvent => ({
  kind: "evade",
  amount: 0,
  sourceRel: "enemy",
  targetRel: "self",
  crit: false,
  blocked: false,
  killingBlow: false,
  ...over,
});

// ---------------------------------------------------------------------------
describe("迴避: one event, two opposite readings (ct-e01)", () => {
  it("splits by WHO, exactly like damage does", () => {
    cover("combat-text-category");
    // you slipped it → a win, on your body
    expect(combatTextCategory(ev({ targetRel: "self", sourceRel: "enemy" }))).toBe("dodge");
    // they slipped yours → a loss, on their body
    expect(combatTextCategory(ev({ targetRel: "enemy", sourceRel: "self" }))).toBe("whiff");
    // a teammate slipped one
    expect(combatTextCategory(ev({ targetRel: "ally", sourceRel: "enemy" }))).toBe("allyDodge");
  });

  it("an enemy slipping someone else's attack is never drawn, at any scope", () => {
    cover("combat-text-category");
    // An evade carries no magnitude, so a stranger's dodge is a word with zero
    // information for you — and once evasion content ships it is the cheapest
    // event on the field to spam. Same ruling `mana` already got for enemies.
    expect(combatTextCategory(ev({ targetRel: "enemy", sourceRel: "ally" }))).toBeNull();
    expect(combatTextCategory(ev({ targetRel: "enemy", sourceRel: "enemy" }))).toBeNull();
  });

  it("a spectator still sees dodges — otherwise the duel looks broken", () => {
    cover("combat-text-category");
    expect(combatTextCategory(ev({ targetRel: "unknown", sourceRel: "unknown" }))).toBe(
      "allyDodge",
    );
  });

  it("your own two readings survive the strictest scope; the ally one does not", () => {
    cover("combat-text-density");
    const gated = (scope: CombatTextScope, c: CombatTextCategory): boolean => scopeAllows(scope, c);
    expect(gated("self", "dodge")).toBe(true);
    expect(gated("self", "whiff")).toBe(true);
    expect(gated("self", "allyDodge")).toBe(false);
    expect(gated("team", "allyDodge")).toBe(true);
    expect(gated("off", "dodge")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("迴避: legible at a glance without reading a number (ct-e02)", () => {
  it("the two sides differ on FOUR channels, not just hue", () => {
    cover("combat-text-palette");
    const dodge = combatTextStyle("dodge");
    const whiff = combatTextStyle("whiff");

    // 1. the WORD — the one channel motion, crowding and CVD cannot erase
    expect(combatTextLabel("dodge", 0)).toBe("閃避");
    expect(combatTextLabel("whiff", 0)).toBe("MISS");
    expect(combatTextLabel("dodge", 0)).not.toBe(combatTextLabel("whiff", 0));

    // 2. the HUE — measured, not asserted
    expect(deltaE(dodge.color, whiff.color)).toBeGreaterThan(40);

    // 3. WEIGHT/POSTURE — your win is bigger and upright, the lost swing italic
    expect(dodge.fontSize).toBeGreaterThan(whiff.fontSize);
    expect(dodge.italic).toBe(false);
    expect(whiff.italic).toBe(true);

    // 4. VOLUME — an event that costs you must not shout over one that pays you
    expect(whiff.alpha).toBeLessThan(dodge.alpha);
  });

  it("carries no digits at all — an evade has no magnitude to print", () => {
    cover("combat-text-palette");
    for (const c of ["dodge", "whiff", "allyDodge"] as const) {
      // whatever amount is handed in, the label is the word
      expect(combatTextLabel(c, 0)).toBe(COMBAT_TEXT_WORDS[c]);
      expect(combatTextLabel(c, 999)).toBe(COMBAT_TEXT_WORDS[c]);
      expect(combatTextLabel(c, -5)).toBe(COMBAT_TEXT_WORDS[c]);
    }
    // and the magnitude categories are untouched by the word table
    expect(combatTextLabel("taken", 42)).toBe("42");
    expect(combatTextLabel("heal", 42)).toBe("+42");
  });

  it("neither new hue is confusable with a team colour (the palette's own rule)", () => {
    cover("combat-text-palette");
    for (const c of ["dodge", "whiff", "allyDodge"] as const) {
      const { color, tint } = combatTextStyle(c);
      for (const team of TEAM_CSS) {
        expect(deltaE(color, team)).toBeGreaterThan(25);
        expect(deltaE(tint, team)).toBeGreaterThan(25);
      }
    }
  });

  it("the dodge hue is genuinely NEW — it does not re-use a category already on screen", () => {
    cover("combat-text-palette");
    const dodge = combatTextStyle("dodge").color;
    for (const c of ["taken", "heal", "mana", "dealt", "guard"] as const) {
      expect(deltaE(dodge, combatTextStyle(c).color)).toBeGreaterThan(40);
    }
  });

  it("whiff stays in the grey 'nothing landed' family, on purpose", () => {
    cover("combat-text-palette");
    // Documented as a deliberate sharing, not an oversight: `guard` and `whiff`
    // are the two members of the same idea. If a future edit pushes them apart
    // into two competing greys, or collapses whiff onto `dealt`, this fails.
    const whiff = combatTextStyle("whiff").color;
    expect(deltaE(whiff, combatTextStyle("guard").color)).toBeLessThan(25);
    expect(deltaE(whiff, combatTextStyle("dealt").color)).toBeGreaterThan(20);
    // and the two greys are still told apart by word + posture + size
    expect(combatTextLabel("whiff", 0)).not.toBe(combatTextLabel("guard", 0));
    expect(combatTextStyle("whiff").italic).not.toBe(combatTextStyle("guard").italic);
  });

  it("both read against the black ring that carries legibility everywhere else", () => {
    cover("combat-text-legibility");
    // the ring is the contrast floor for every hue in this palette; the two new
    // ones have to clear the same bar the existing five do (worst is 5.25)
    expect(contrast(combatTextStyle("dodge").color, "#000000")).toBeGreaterThan(5.25);
    expect(contrast(combatTextStyle("whiff").color, "#000000")).toBeGreaterThan(5.25);
  });

  it("goes through the SAME css builder — so #164's transparent-glyph fix holds", () => {
    cover("combat-text-legibility");
    // The reported bug was a transparent text fill with nothing behind it in a
    // renderer that fakes `background-clip:text`. Both paths must always emit a
    // solid hue, and must never emit `color:transparent`.
    for (const c of ["dodge", "whiff", "allyDodge"] as const) {
      const st = combatTextStyle(c);
      for (const gradient of [true, false]) {
        const css = combatTextCss(st, gradient);
        expect(css).toContain(`color:${st.color}`);
        // the plain `color:` property specifically — `-webkit-text-fill-color`
        // is allowed to be transparent, and only ever next to the gradient
        expect(css).not.toMatch(/(^|;)color:transparent/);
        if (gradient) {
          expect(css).toContain("background-clip:text");
          expect(css).toContain("-webkit-text-fill-color:transparent");
        } else {
          expect(css).not.toContain("-webkit-text-fill-color");
        }
      }
    }
  });

  it("full-width labels are measured as full-width, not as digits", () => {
    cover("combat-text-legibility");
    // The chrome-overlap damping needs a real width. 「閃避」 is 2 glyphs at
    // ~1 em; the old `length * 0.62` estimate undercounts it by ~38 %, which
    // would leave a 閃避 sitting under the minimap at full opacity.
    expect(combatTextWidthPx("閃避", 26)).toBeCloseTo(52, 5);
    expect(combatTextWidthPx("MISS", 20)).toBeCloseTo(20 * 0.62 * 4, 5);
    expect(combatTextWidthPx("閃避", 26)).toBeGreaterThan(26 * 0.62 * 2);
  });
});

// ---------------------------------------------------------------------------
describe("迴避: it obeys every task #92 policy it inherited (ct-e03)", () => {
  it("ranks just under 受到傷害 — it answers the same question", () => {
    cover("combat-text-palette");
    const r = (c: CombatTextCategory): number => combatTextStyle(c).rank;
    expect(r("taken")).toBeLessThan(r("dodge"));
    expect(r("dodge")).toBeLessThan(r("heal"));
    // your lost swing is the least urgent thing that still involves you
    expect(r("dealt")).toBeLessThan(r("whiff"));
    expect(r("whiff")).toBeLessThan(r("allyTaken"));
    expect(r("allyDodge")).toBeGreaterThan(r("allyMana"));
  });

  it("drifts AGAINST the number it replaces, so the pair never stacks", () => {
    cover("combat-text-palette");
    // dodging one attacker while a second connects, or landing one hit and
    // whiffing the next, must fan apart rather than overprint
    expect(Math.sign(combatTextStyle("dodge").driftPx)).toBe(
      -Math.sign(combatTextStyle("taken").driftPx),
    );
    expect(Math.sign(combatTextStyle("whiff").driftPx)).toBe(
      -Math.sign(combatTextStyle("dealt").driftPx),
    );
    // and each sits in the anchor band of the number it stands in for
    expect(combatTextStyle("dodge").anchorY).toBe(combatTextStyle("taken").anchorY);
    expect(combatTextStyle("whiff").anchorY).toBe(combatTextStyle("dealt").anchorY);
  });

  it("clears the health bar, like every other category", () => {
    cover("combat-text-palette");
    const PX_PER_UNIT = 1080 / (2 * 10 * Math.tan(0.8 / 2));
    const BAR_ANCHOR_Y = 2.45;
    const BAR_BLOCK_BOTTOM_PX = 11;
    for (const c of ["dodge", "whiff", "allyDodge"] as const) {
      const st = combatTextStyle(c);
      const gapPx = (BAR_ANCHOR_Y - st.anchorY) * PX_PER_UNIT;
      const peakPx = BASE_LIFT_PX + st.arcPx;
      // worst case even though these categories can never actually be a kill
      const size = Math.round(st.fontSize * KILL_SIZE_MULT);
      expect(gapPx - peakPx - size / 2 - BAR_BLOCK_BOTTOM_PX).toBeGreaterThan(0);
    }
  });

  it("every category — old and new — still declares a word or a prefix", () => {
    cover("combat-text-palette");
    for (const c of COMBAT_TEXT_CATEGORIES) {
      const label = combatTextLabel(c, 7);
      expect(label.length).toBeGreaterThan(0);
      // a wordless category prints digits; a word category never does
      if (COMBAT_TEXT_WORDS[c] === undefined) expect(label).toMatch(/7$/);
      else expect(label).toBe(COMBAT_TEXT_WORDS[c]);
    }
  });
});

// ---------------------------------------------------------------------------
// The live pipeline, through the door the game uses.
// ---------------------------------------------------------------------------

const anchor = (over: Partial<ChampionAnchor> & { entityId: number }): ChampionAnchor => ({
  name: `e${over.entityId}`,
  teamId: 0,
  championId: "",
  isLocal: false,
  alive: true,
  hpPct: 1,
  shieldPct: 0,
  manaPct: 1,
  worldX: 0,
  worldZ: 0,
  pose: { sx: 0, sy: 0, visible: true },
  cast: null,
  ...over,
});

const live = (): typeof frameBus.combatText => frameBus.combatText.filter((e) => e.active);

describe("迴避 → frameBus (ct-e04)", () => {
  beforeEach(() => {
    clearCombatText();
    setCombatTextScope("team");
    frameBus.champions.clear();
    // me (team 0), a teammate (team 0), two opponents (team 1)
    frameBus.champions.set(1, anchor({ entityId: 1, teamId: 0, isLocal: true }));
    frameBus.champions.set(2, anchor({ entityId: 2, teamId: 0 }));
    frameBus.champions.set(3, anchor({ entityId: 3, teamId: 1 }));
    frameBus.champions.set(4, anchor({ entityId: 4, teamId: 1 }));
  });

  it("resolves relation from the anchor table the renderer already projects from", () => {
    cover("combat-text-category");
    expect(relationToLocal(1)).toBe("self");
    expect(relationToLocal(2)).toBe("ally");
    expect(relationToLocal(3)).toBe("enemy");
    // a guardian / structure has no anchor entry — and must NOT read as yours
    expect(relationToLocal(99)).toBe("unknown");
    expect(relationToLocal(undefined)).toBe("unknown");
    frameBus.champions.clear();
    expect(relationToLocal(1)).toBe("unknown"); // pre-seat / spectating
  });

  it("YOU dodged: 「閃避」 on YOUR body", () => {
    cover("combat-text-density");
    pushEvadeText({ source: 3, target: 1, worldX: 5, worldZ: 6, nowMs: 1000 });
    const e = live();
    expect(e).toHaveLength(1);
    expect(e[0]!.category).toBe("dodge");
    expect(e[0]!.targetId).toBe(1);
    expect(e[0]!.worldX).toBe(5);
    expect(combatTextLabel(e[0]!.category, e[0]!.amount)).toBe("閃避");
  });

  it("THEY dodged you: MISS on THEIR body — same event, other seat", () => {
    cover("combat-text-density");
    pushEvadeText({ source: 1, target: 3, worldX: 9, worldZ: 0, nowMs: 1000 });
    const e = live();
    expect(e).toHaveLength(1);
    expect(e[0]!.category).toBe("whiff");
    expect(e[0]!.targetId).toBe(3); // anchored on the DEFENDER either way
    expect(combatTextLabel(e[0]!.category, e[0]!.amount)).toBe("MISS");
  });

  it("a dodge is never a crit and never a killing blow", () => {
    cover("combat-text-density");
    // rollEvade returns a TOTAL miss before mitigation, so no modifier can reach
    // it. The entry must carry that through, or the pop/size emphasis lies.
    pushEvadeText({ source: 3, target: 1, worldX: 0, worldZ: 0, nowMs: 1000 });
    expect(live()[0]!.crit).toBe(false);
    expect(live()[0]!.killingBlow).toBe(false);
    expect(live()[0]!.amount).toBe(0);
  });

  it("two attackers dodged on the same tick produce ONE 閃避, not a pile", () => {
    cover("combat-text-density");
    pushEvadeText({ source: 3, target: 1, worldX: 0, worldZ: 0, nowMs: 1000 });
    pushEvadeText({ source: 4, target: 1, worldX: 0, worldZ: 0, nowMs: 1010 });
    expect(live()).toHaveLength(1); // inherited same-tick coalesce
  });

  it("respects the scope setting without a rule of its own", () => {
    cover("combat-text-density");
    setCombatTextScope("off");
    pushEvadeText({ source: 3, target: 1, worldX: 0, worldZ: 0, nowMs: 1000 });
    expect(live()).toHaveLength(0);

    setCombatTextScope("self");
    pushEvadeText({ source: 3, target: 2, worldX: 0, worldZ: 0, nowMs: 1000 }); // ally dodged
    expect(live()).toHaveLength(0);
    setCombatTextScope("team");
    pushEvadeText({ source: 3, target: 2, worldX: 0, worldZ: 0, nowMs: 1000 });
    expect(live()).toHaveLength(1);
    expect(live()[0]!.category).toBe("allyDodge");
  });

  it("an enemy dodging your teammate is dropped, at every scope", () => {
    cover("combat-text-density");
    for (const s of ["self", "team", "all"] as const) {
      clearCombatText();
      setCombatTextScope(s);
      pushEvadeText({ source: 2, target: 3, worldX: 0, worldZ: 0, nowMs: 1000 });
      expect(live()).toHaveLength(0);
    }
  });

  it("your own 受到傷害 still outranks a dodge when the screen is full", () => {
    cover("combat-text-density");
    // the pile is deliberately dodges; a real hit on you must still get in
    for (let i = 0; i < 64; i++) {
      frameBus.champions.set(100 + i, anchor({ entityId: 100 + i, teamId: 0 }));
      pushEvadeText({ source: 3, target: 100 + i, worldX: 0, worldZ: 0, nowMs: 1000 + i });
    }
    const before = live().length;
    expect(before).toBeGreaterThan(0);
    expect(live().every((e) => e.category === "allyDodge")).toBe(true);
    pushCombatText({
      kind: "damage",
      amount: 300,
      sourceRel: "enemy",
      targetRel: "self",
      crit: false,
      blocked: false,
      killingBlow: false,
      targetId: 1,
      worldX: 0,
      worldZ: 0,
      nowMs: 2000,
    });
    expect(live().length).toBeLessThanOrEqual(before);
    expect(live().some((e) => e.category === "taken")).toBe(true);
  });
});
