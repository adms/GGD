/**
 * Floating combat text — density policy and pooling (task #92).
 *
 *   ct-c04 combat-text-density — coalesce / per-target cap / priority admission
 *                                / RO multi-hit stagger / scope gate
 *   ct-c07 combat-text-pool    — the store is a fixed pool: no allocation, no
 *                                growth, no splice, whatever the fight does
 *
 * This drives the REAL `pushCombatText` on the real frameBus, not a stand-in:
 * the admission policy is the thing that decides whether a teamfight is
 * readable, so it has to be tested through the door the game uses.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  frameBus,
  pushCombatText,
  expireCombatText,
  clearCombatText,
  setDamageNumberCap,
  setCombatTextScope,
  type CombatTextInput,
} from "./frameBus";
import { COALESCE_MS, MAX_COMBAT_TEXT, MAX_LIVE_PER_TARGET, SPAWN_STAGGER_MS } from "./ui/combatText";

const T0 = 10_000;

const hit = (over: Partial<CombatTextInput> = {}): CombatTextInput => ({
  kind: "damage",
  amount: 40,
  sourceRel: "enemy",
  targetRel: "self",
  crit: false,
  blocked: false,
  killingBlow: false,
  targetId: 1,
  worldX: 0,
  worldZ: 0,
  nowMs: T0,
  ...over,
});

const live = (): typeof frameBus.combatText => frameBus.combatText.filter((e) => e.active);

beforeEach(() => {
  clearCombatText();
  setCombatTextScope("team");
  setDamageNumberCap(48);
});

describe("combat text density policy (ct-c04)", () => {
  it("scope gates what is admitted at all", () => {
    cover("combat-text-density");
    setCombatTextScope("off");
    pushCombatText(hit());
    expect(live()).toHaveLength(0);

    setCombatTextScope("self");
    pushCombatText(hit({ targetId: 2, targetRel: "ally", sourceRel: "enemy" }));
    expect(live()).toHaveLength(0); // an ally's damage is out of scope
    pushCombatText(hit());
    expect(live()).toHaveLength(1); // your own is never gated

    setCombatTextScope("team");
    pushCombatText(hit({ targetId: 2, targetRel: "ally", sourceRel: "enemy" }));
    expect(live()).toHaveLength(2);
  });

  it("with NO local player resolved the scope gate is skipped, not silently blanked", () => {
    cover("combat-text-density");
    // spectating / pre-match / before the seat is known: every event resolves as
    // "unknown", lands in the third-party band, and a self/team scope would show
    // the spectator an empty screen with no error anywhere
    setCombatTextScope("self");
    pushCombatText(hit({ sourceRel: "unknown", targetRel: "unknown", targetId: 9 }));
    expect(live()).toHaveLength(1);
    expect(live()[0]!.category).toBe("other");

    // ...but "off" still means off
    clearCombatText();
    setCombatTextScope("off");
    pushCombatText(hit({ sourceRel: "unknown", targetRel: "unknown", targetId: 9 }));
    expect(live()).toHaveLength(0);

    // and a KNOWN third party is still gated, which is the whole point
    clearCombatText();
    setCombatTextScope("self");
    pushCombatText(hit({ sourceRel: "enemy", targetRel: "enemy", targetId: 9 }));
    expect(live()).toHaveLength(0);
  });

  it("same target + same category inside ONE tick adds up instead of stacking", () => {
    cover("combat-text-density");
    pushCombatText(hit({ amount: 30 }));
    pushCombatText(hit({ amount: 12, nowMs: T0 + 10 }));
    const l = live();
    expect(l).toHaveLength(1);
    expect(l[0]!.amount).toBe(42);
    // and it does NOT extend the life — a merged node that lingers is the
    // light pollution this design exists to avoid
    expect(l[0]!.bornMs).toBe(T0);
  });

  it("past the coalesce window a second hit is its own number (RO: multi-hit is a stream)", () => {
    cover("combat-text-density");
    pushCombatText(hit({ amount: 30 }));
    pushCombatText(hit({ amount: 12, nowMs: T0 + COALESCE_MS + 1 }));
    expect(live()).toHaveLength(2);
  });

  it("a crit never merges into a running total", () => {
    cover("combat-text-density");
    pushCombatText(hit({ amount: 30 }));
    pushCombatText(hit({ amount: 200, crit: true, nowMs: T0 + 5 }));
    const l = live();
    expect(l).toHaveLength(2);
    expect(l.some((e) => e.crit && e.amount === 200)).toBe(true);
  });

  it("different categories on one body never merge into each other", () => {
    cover("combat-text-density");
    pushCombatText(hit({ kind: "heal", amount: 50, targetRel: "self" }));
    pushCombatText(hit({ kind: "mana", amount: 20, targetRel: "self" }));
    const l = live();
    expect(l).toHaveLength(2);
    expect(new Set(l.map((e) => e.category))).toEqual(new Set(["heal", "mana"]));
  });

  it("simultaneous numbers on ONE body are released in sequence, not stacked", () => {
    cover("combat-text-density");
    // a flower burst restores HP and MP on the same body in the same tick
    pushCombatText(hit({ kind: "heal", amount: 50 }));
    pushCombatText(hit({ kind: "mana", amount: 20 }));
    const l = live().sort((a, b) => a.bornMs - b.bornMs);
    expect(l[0]!.bornMs).toBe(T0);
    expect(l[1]!.bornMs).toBe(T0 + SPAWN_STAGGER_MS); // RO's ActivationTime stagger
    // a staggered node is simply not on screen yet — it must not expire early
    expireCombatText(T0);
    expect(live()).toHaveLength(2);
  });

  it("no single body may carry a pile", () => {
    cover("combat-text-density");
    for (let i = 0; i < 8; i++) {
      pushCombatText(hit({ amount: 10 + i, crit: true, nowMs: T0 + i * (COALESCE_MS + 5) }));
    }
    expect(live().length).toBeLessThanOrEqual(MAX_LIVE_PER_TARGET);
  });

  it("at the cap the LEAST IMPORTANT number gives way, not the oldest", () => {
    cover("combat-text-density");
    setDamageNumberCap(4);
    // fill the screen with other people's business, on distinct bodies
    setCombatTextScope("all");
    for (let i = 0; i < 4; i++) {
      pushCombatText(
        hit({ targetId: 100 + i, targetRel: "enemy", sourceRel: "enemy", nowMs: T0 + i }),
      );
    }
    expect(live()).toHaveLength(4);
    expect(live().every((e) => e.category === "other")).toBe(true);

    // YOUR OWN damage must get in — under the old `splice(0, over)` it was the
    // newcomer that lost, or an unrelated victim that was dropped at random
    pushCombatText(hit({ targetId: 1, targetRel: "self", nowMs: T0 + 10 }));
    const l = live();
    expect(l).toHaveLength(4);
    expect(l.some((e) => e.category === "taken")).toBe(true);
    expect(l.filter((e) => e.category === "other")).toHaveLength(3);
  });

  it("the least important newcomer is DROPPED rather than displacing something better", () => {
    cover("combat-text-density");
    setDamageNumberCap(4);
    for (let i = 0; i < 4; i++) {
      pushCombatText(hit({ targetId: 200 + i, targetRel: "self", nowMs: T0 + i }));
    }
    expect(live().every((e) => e.category === "taken")).toBe(true);
    setCombatTextScope("all");
    pushCombatText(
      hit({ targetId: 300, targetRel: "enemy", sourceRel: "enemy", nowMs: T0 + 10 }),
    );
    expect(live()).toHaveLength(4);
    expect(live().every((e) => e.category === "taken")).toBe(true);
  });

  it("lowering the density cap mid-fight retires the least important numbers", () => {
    cover("combat-text-density");
    setCombatTextScope("all");
    for (let i = 0; i < 6; i++) {
      pushCombatText(
        hit({ targetId: 400 + i, targetRel: "enemy", sourceRel: "enemy", nowMs: T0 + i }),
      );
    }
    pushCombatText(hit({ targetId: 1, targetRel: "self", nowMs: T0 + 20 }));
    expect(live().length).toBe(7);
    setDamageNumberCap(4);
    const l = live();
    expect(l.length).toBeLessThanOrEqual(4);
    expect(l.some((e) => e.category === "taken")).toBe(true); // yours survives
  });

  it("expiry releases entries and clear() empties the screen", () => {
    cover("combat-text-density");
    pushCombatText(hit());
    const life = live()[0]!.lifeMs;
    expireCombatText(T0 + life);
    expect(live()).toHaveLength(1); // exactly at the end is still alive
    expireCombatText(T0 + life + 1);
    expect(live()).toHaveLength(0);

    pushCombatText(hit({ nowMs: T0 + 5000 }));
    expect(live()).toHaveLength(1);
    clearCombatText();
    expect(live()).toHaveLength(0);
  });
});

describe("combat text pooling (ct-c07)", () => {
  it("the store is a FIXED pool — it never grows, shrinks or reallocates", () => {
    cover("combat-text-pool");
    const arrayRef = frameBus.combatText;
    const entryRefs = frameBus.combatText.map((e) => e);
    expect(arrayRef).toHaveLength(MAX_COMBAT_TEXT);

    setCombatTextScope("all");
    // hammer it far past the pool size, across many bodies, for many "frames"
    for (let f = 0; f < 40; f++) {
      for (let i = 0; i < 20; i++) {
        pushCombatText(
          hit({
            targetId: i,
            targetRel: i === 0 ? "self" : "enemy",
            sourceRel: "enemy",
            nowMs: T0 + f * 50,
          }),
        );
      }
      expireCombatText(T0 + f * 50);
    }

    // same array object, same length, same entry objects: zero allocation
    expect(frameBus.combatText).toBe(arrayRef);
    expect(frameBus.combatText).toHaveLength(MAX_COMBAT_TEXT);
    frameBus.combatText.forEach((e, i) => expect(e).toBe(entryRefs[i]));
    // slots stay stable so the DOM node pool can index straight into them
    frameBus.combatText.forEach((e, i) => expect(e.slot).toBe(i));
  });

  it("never exceeds the live cap no matter how hard it is driven", () => {
    cover("combat-text-pool");
    setCombatTextScope("all");
    setDamageNumberCap(12);
    for (let f = 0; f < 25; f++) {
      for (let i = 0; i < 30; i++) {
        pushCombatText(
          hit({ targetId: i, targetRel: "enemy", sourceRel: "enemy", nowMs: T0 + f * 40 }),
        );
      }
      expect(live().length).toBeLessThanOrEqual(12);
    }
  });

  it("re-claiming a slot bumps its id so the renderer redraws the text", () => {
    cover("combat-text-pool");
    setDamageNumberCap(4);
    pushCombatText(hit({ targetId: 1, amount: 11 }));
    const first = live()[0]!;
    const firstId = first.id;
    clearCombatText();
    pushCombatText(hit({ targetId: 2, amount: 22, nowMs: T0 + 500 }));
    const second = live()[0]!;
    expect(second.id).toBeGreaterThan(firstId);
    expect(second.amount).toBe(22);
  });
});
