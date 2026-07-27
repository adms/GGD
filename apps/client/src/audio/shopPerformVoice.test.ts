/**
 * shopPerformVoice — the LINE that goes with a shop performance.
 *
 * Three things are pinned here, and the first is the important one:
 *
 *  1. EVERY perform kind the render layer can emit has a paired voice category.
 *     This is the guard against failure shape ② ("computed but never
 *     delivered"): add a tier to idlePerform.ts, forget to pair it, and the
 *     hero performs that action in silence forever with nothing to see. The
 *     test reads the kinds out of idlePerform's own source rather than
 *     re-listing them, so the two files cannot drift apart quietly.
 *  2. Every paired category actually EXISTS in the shipped voice pack — a
 *     typo'd category name resolves to zero clips and is silently skipped by
 *     the contextual layer, which is a mute feature with green tests.
 *  3. The pair is tried in order, and the flavour that spoke last is demoted
 *     next time (#184's anti-pollution rule at the category level).
 *
 * NO SOUND IS MADE. The mixer is never touched: the port is injected, and the
 * real one is gated by task #62's test-mode silence anyway.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  PERFORM_VOICE_CATEGORIES,
  ShopPerformVoice,
  type ContextualPort,
} from "./shopPerformVoice";

const IDLE_PERFORM_SRC = join(__dirname, "../render/intermission/idlePerform.ts");
/** repo content/ mount — the generated CosyVoice3 pack lives under it */
const PACK = join(
  __dirname,
  "../../../../content/assets/audio/voices/champions/MANIFEST.json",
);

/** The PerformKind union members, read out of idlePerform.ts's own declaration. */
function performKinds(): string[] {
  const src = readFileSync(IDLE_PERFORM_SRC, "utf8");
  const m = /export type PerformKind =([^;]+);/.exec(src);
  if (!m) throw new Error("PerformKind union not found in idlePerform.ts");
  return [...m[1]!.matchAll(/"([a-z-]+)"/g)].map((x) => x[1]!);
}

/** A port that says "spoke" for the listed categories and refuses the rest. */
function portAccepting(...accept: string[]): { port: ContextualPort; tried: string[] } {
  const tried: string[] = [];
  return {
    tried,
    port: (_champ, category) => {
      tried.push(category);
      return accept.includes(category);
    },
  };
}

describe("shopPerformVoice — every action has a line", () => {
  it("pairs EVERY perform kind idlePerform can emit", () => {
    cover("shop-idle-perform-voice");
    const kinds = performKinds();
    expect(kinds.length).toBeGreaterThanOrEqual(6); // sanity: the union parsed
    for (const kind of kinds) {
      const pair = PERFORM_VOICE_CATEGORIES[kind];
      expect(pair, `perform kind "${kind}" has no voice category`).toBeDefined();
      expect(pair!.length, `perform kind "${kind}" needs a fallback category`).toBeGreaterThanOrEqual(2);
    }
  });

  it("pairs only categories the shipped voice pack actually carries", () => {
    cover("shop-idle-perform-voice");
    // Asserted, not skipped: an absent pack would make the cross-check below
    // pass vacuously, which is exactly how a mute feature ships green.
    expect(existsSync(PACK), `voice pack missing at ${PACK}`).toBe(true);
    const doc = JSON.parse(readFileSync(PACK, "utf8")) as {
      champions?: Record<string, { lines?: Record<string, unknown> }>;
    };
    const champions = Object.values(doc.champions ?? {});
    expect(champions.length).toBeGreaterThan(0);
    const known = new Set<string>();
    for (const c of champions) for (const cat of Object.keys(c.lines ?? {})) known.add(cat);

    const unknown: string[] = [];
    for (const [kind, pair] of Object.entries(PERFORM_VOICE_CATEGORIES)) {
      for (const cat of pair) if (!known.has(cat)) unknown.push(`${kind} → ${cat}`);
    }
    expect(unknown, "paired categories that no champion has a clip for").toEqual([]);
  });

  it("never borrows a combat cue whose policy would mute it here", () => {
    cover("shop-idle-perform-voice");
    // attack-light is prob 0.08 / 12 s because a real auto fires ~1.4×/s;
    // hurt / defeat / kill-N are events the shop cannot have.
    const banned = ["attack-light", "hurt", "hurt-heavy", "defeat", "crit", "first-blood"];
    for (const pair of Object.values(PERFORM_VOICE_CATEGORIES)) {
      for (const cat of pair) expect(banned).not.toContain(cat);
    }
  });
});

describe("shopPerformVoice — dispatch", () => {
  it("speaks the best-fit category for the kind", () => {
    cover("shop-idle-perform-voice");
    const { port, tried } = portAccepting("taunt");
    const v = new ShopPerformVoice({ play: port });
    expect(v.speak("godie-e001", "celebrate")).toBe("taunt");
    expect(tried).toEqual(["taunt"]); // the fallback is not even attempted
  });

  it("falls through to the second candidate when the first declines", () => {
    cover("shop-idle-perform-voice");
    // this is the whole reason a kind names TWO categories: the contextual
    // layer rolls a ~50 % probability, so one attempt leaves half the
    // performances mute.
    const { port, tried } = portAccepting("thumbs-up");
    const v = new ShopPerformVoice({ play: port });
    expect(v.speak("godie-e001", "celebrate")).toBe("thumbs-up");
    expect(tried).toEqual(["taunt", "thumbs-up"]);
  });

  it("is a silent no-op when everything declines, and never throws", () => {
    cover("shop-idle-perform-voice");
    const { port, tried } = portAccepting();
    const v = new ShopPerformVoice({ play: port });
    expect(v.speak("godie-e001", "celebrate")).toBeNull();
    expect(tried).toEqual(["taunt", "thumbs-up"]);
  });

  it("says nothing at all without a champion, or for an unknown kind", () => {
    cover("shop-idle-perform-voice");
    const { port, tried } = portAccepting("taunt", "quote", "thanks");
    const v = new ShopPerformVoice({ play: port });
    expect(v.speak("", "celebrate")).toBeNull();
    expect(v.speak(null, "celebrate")).toBeNull();
    expect(v.speak("godie-e001", "not-a-kind")).toBeNull();
    expect(tried).toEqual([]); // no champion / no pairing ⇒ the mixer is untouched
  });

  it("does not lead with the same flavour twice running", () => {
    cover("shop-idle-perform-voice");
    // #184's anti-pollution rule, at the category level: the contextual layer
    // already guarantees a different CLIP, this guarantees a different FLAVOUR
    // when the same kind is drawn twice in a row.
    const tried: string[] = [];
    const port: ContextualPort = (_c, category) => {
      tried.push(category);
      return true; // everything speaks, so only the ORDER is under test
    };
    const v = new ShopPerformVoice({ play: port });
    expect(v.speak("godie-e001", "celebrate")).toBe("taunt");
    expect(v.speak("godie-e001", "celebrate")).toBe("thumbs-up");
    expect(v.speak("godie-e001", "celebrate")).toBe("taunt");
    expect(tried).toEqual(["taunt", "thumbs-up", "taunt"]);
  });

  it("forgets the rotation on reset (a new shop visit starts fresh)", () => {
    cover("shop-idle-perform-voice");
    const port: ContextualPort = () => true;
    const v = new ShopPerformVoice({ play: port });
    expect(v.speak("godie-e001", "talk")).toBe("quote");
    expect(v.speak("godie-e001", "talk")).toBe("thanks");
    v.reset();
    expect(v.speak("godie-e001", "talk")).toBe("quote");
  });
});
