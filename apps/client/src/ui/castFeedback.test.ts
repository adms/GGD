/**
 * Playtest P7: 「按了 Q，沒有技能特效，也沒有『冷卻中／不能施放』的提示」.
 *
 * These lock the two halves of the fix — a refused press always produces a
 * SENTENCE (not a code, not silence), and an accepted press always produces a
 * button confirm — plus the one rule that keeps the fix honest: the local
 * prediction must never claim a refusal it cannot be certain of.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  CAST_DENY_SFX,
  CAST_DENY_FLASH_MS,
  CAST_FLASH_MS,
  CAST_REJECT_TEXT,
  GENERIC_REJECT,
  castRejectNotice,
  castRejectionFromEvent,
  clearCastNotice,
  denyShakeOffset,
  getCastNotice,
  isCastFeedbackEvent,
  isChampionAbilitySlot,
  noteCastConfirmed,
  noteCastDenied,
  predictCastReject,
  pushCastNotice,
  resetCastFeedback,
  sampleCastFlash,
  subscribeCastNotice,
  type CastPredictInput,
} from "./castFeedback";

const TICK_HZ = 30;

function input(over: Partial<CastPredictInput> = {}): CastPredictInput {
  return {
    rank: 1,
    cooldownTicks: 0,
    tickHz: TICK_HZ,
    manaCost: 0,
    mana: 500,
    alive: true,
    passive: false,
    ...over,
  };
}

beforeEach(() => {
  resetCastFeedback();
});

describe("castRejectNotice — a reason becomes a sentence", () => {
  it("says WHY in the player's own language, never a raw token", () => {
    for (const [reason, text] of Object.entries(CAST_REJECT_TEXT)) {
      const n = castRejectNotice("Q", reason);
      expect(n.text).toContain(text);
      // the identifier itself must never leak onto the HUD
      expect(n.text).not.toContain(reason);
    }
  });

  it("degrades an UNKNOWN server reason to a readable line", () => {
    // a future sim reason this build predates must not render as "cast-failed-7"
    const n = castRejectNotice("W", "some-future-reason");
    expect(n.text).toBe(GENERIC_REJECT);
    expect(n.text).not.toContain("future");
  });

  it("puts the SECONDS on a cooldown refusal — a wall vs a wait", () => {
    const n = castRejectNotice("E", "cooldown", { abilityName: "烈焰斬", secondsLeft: 2.4 });
    expect(n.text).toContain("烈焰斬");
    expect(n.text).toContain("冷卻中");
    expect(n.text).toContain("3"); // ceil(2.4) — never rounds a wait DOWN
  });

  it("omits the seconds when the cooldown reason carries none", () => {
    expect(castRejectNotice("E", "cooldown").text).not.toContain("還有");
  });

  it("carries the deny SFX unless the press path already played one", () => {
    expect(castRejectNotice("Q", "no-mana").sfx).toBe(CAST_DENY_SFX);
    expect(castRejectNotice("Q", "no-mana", { silent: true }).sfx).toBeNull();
  });

  it("gives every notice a fresh seq so an identical repeat re-fires", () => {
    const a = castRejectNotice("Q", "cooldown");
    const b = castRejectNotice("Q", "cooldown");
    expect(b.seq).toBeGreaterThan(a.seq);
  });
});

describe("predictCastReject — certain refusals only", () => {
  it("stays SILENT on a press that looks castable", () => {
    expect(predictCastReject(input())).toBeNull();
  });

  it("catches the four the client is certain about", () => {
    expect(predictCastReject(input({ rank: 0 }))?.reason).toBe("not-learned");
    expect(predictCastReject(input({ alive: false }))?.reason).toBe("dead");
    expect(predictCastReject(input({ cooldownTicks: 30 }))?.reason).toBe("cooldown");
    expect(predictCastReject(input({ manaCost: 80, mana: 79 }))?.reason).toBe("no-mana");
  });

  it("converts cooldown TICKS into the seconds the sentence says", () => {
    expect(predictCastReject(input({ cooldownTicks: 75 }))?.secondsLeft).toBeCloseTo(2.5);
  });

  it("names a passive-only tile as passive, not as a failed cast", () => {
    expect(predictCastReject(input({ passive: true }))?.reason).toBe("passive");
  });

  it("NEVER guesses a reason that needs the sim's own pick", () => {
    // out-of-range / bad-target / stunned / recovery depend on authoritative
    // positions and the server's target resolution. A wrong refusal is worse
    // than a late one, so the prediction must return null and let the
    // `castRejected` event speak.
    const reasons = new Set<string>();
    for (const over of [{}, { manaCost: 10, mana: 10 }, { cooldownTicks: 0 }]) {
      const p = predictCastReject(input(over));
      if (p) reasons.add(p.reason);
    }
    expect(reasons.has("out-of-range")).toBe(false);
    expect(reasons.has("bad-target")).toBe(false);
    expect(reasons.has("stunned")).toBe(false);
    expect(reasons.has("recovery")).toBe(false);
  });

  it("follows castAbility's own gate order (unlearned beats cooling)", () => {
    // castAbility checks rank before cooldown, so a prediction that led with
    // "cooldown" here would be contradicted by the server a frame later.
    expect(predictCastReject(input({ rank: 0, cooldownTicks: 60 }))?.reason).toBe("not-learned");
  });

  it("treats a zero tickHz as 1 rather than dividing by zero", () => {
    expect(predictCastReject(input({ cooldownTicks: 4, tickHz: 0 }))?.secondsLeft).toBe(4);
  });
});

describe("castRejectionFromEvent — the authoritative half", () => {
  const ev = (data: Record<string, unknown>) => ({ type: "castRejected", data });

  it("turns the server's reason into a notice for the LOCAL champion", () => {
    const n = castRejectionFromEvent(ev({ entity: 7, slot: "R", reason: "out-of-range" }), 7, "封神");
    expect(n?.slot).toBe("R");
    expect(n?.text).toContain("封神");
    expect(n?.text).toContain(CAST_REJECT_TEXT["out-of-range"]);
  });

  it("drops another player's rejection — whose cast failed is private", () => {
    expect(castRejectionFromEvent(ev({ entity: 9, slot: "Q", reason: "no-mana" }), 7)).toBeNull();
  });

  it("drops everything before the local entity is known", () => {
    expect(castRejectionFromEvent(ev({ entity: 7, slot: "Q", reason: "no-mana" }), null)).toBeNull();
  });

  it("ignores a payload whose slot is not a real slot", () => {
    expect(castRejectionFromEvent(ev({ entity: 7, slot: "Z", reason: "no-mana" }), 7)).toBeNull();
  });

  it("pre-filters exactly the three event types the path consumes", () => {
    expect(isCastFeedbackEvent("castRejected")).toBe(true);
    expect(isCastFeedbackEvent("castBegin")).toBe(true);
    expect(isCastFeedbackEvent("abilityCast")).toBe(true);
    expect(isCastFeedbackEvent("damage")).toBe(false);
  });

  it("accepts all six slot names and nothing else", () => {
    for (const s of ["Q", "W", "E", "R", "EX", "PASSIVE"]) expect(isChampionAbilitySlot(s)).toBe(true);
    expect(isChampionAbilitySlot("q")).toBe(false);
    expect(isChampionAbilitySlot("")).toBe(false);
  });
});

describe("notice store", () => {
  it("publishes to subscribers and clears", () => {
    const seen: (string | null)[] = [];
    subscribeCastNotice((n) => seen.push(n?.text ?? null));
    pushCastNotice(castRejectNotice("Q", "cooldown"));
    expect(getCastNotice()).not.toBeNull();
    clearCastNotice();
    expect(getCastNotice()).toBeNull();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBeNull();
  });

  it("clearing twice notifies only once (no redundant renders)", () => {
    let calls = 0;
    subscribeCastNotice(() => calls++);
    pushCastNotice(castRejectNotice("Q", "cooldown"));
    clearCastNotice();
    clearCastNotice();
    expect(calls).toBe(2);
  });

  it("unsubscribes cleanly", () => {
    let calls = 0;
    const off = subscribeCastNotice(() => calls++);
    off();
    pushCastNotice(castRejectNotice("Q", "cooldown"));
    expect(calls).toBe(0);
  });

  it("KEEPS subscribers across a reset — a deafened HUD is the original bug", () => {
    let calls = 0;
    subscribeCastNotice(() => calls++);
    resetCastFeedback();
    pushCastNotice(castRejectNotice("Q", "cooldown"));
    expect(calls).toBeGreaterThan(0);
  });
});

describe("per-button flash", () => {
  it("confirms an ACCEPTED cast on the button that fired it", () => {
    noteCastConfirmed("Q", 1000);
    const s = sampleCastFlash("Q", 1000);
    expect(s).toEqual({ kind: "confirm", strength: 1 });
    expect(sampleCastFlash("W", 1000)).toBeNull(); // only the slot pressed
  });

  it("decays to nothing and releases the slot", () => {
    noteCastConfirmed("Q", 0);
    expect(sampleCastFlash("Q", CAST_FLASH_MS / 2)?.strength).toBeCloseTo(0.5);
    expect(sampleCastFlash("Q", CAST_FLASH_MS)).toBeNull();
    // and stays null — a stuck rim would outlive the whole match
    expect(sampleCastFlash("Q", CAST_FLASH_MS + 5000)).toBeNull();
  });

  it("gives a refusal its own, longer window", () => {
    noteCastDenied("EX", 0);
    expect(sampleCastFlash("EX", CAST_FLASH_MS)?.kind).toBe("deny");
    expect(sampleCastFlash("EX", CAST_DENY_FLASH_MS)).toBeNull();
  });

  it("lets a newer verdict replace an older one on the same slot", () => {
    noteCastConfirmed("R", 0);
    noteCastDenied("R", 10);
    expect(sampleCastFlash("R", 10)?.kind).toBe("deny");
  });

  it("shakes: the deny offset actually moves and settles at zero", () => {
    expect(Math.abs(denyShakeOffset(0.9))).toBeGreaterThan(0.1);
    expect(denyShakeOffset(0)).toBe(0);
  });

  it("a rewound clock does not strand a flash", () => {
    noteCastConfirmed("Q", 1000);
    expect(sampleCastFlash("Q", 900)).toBeNull();
  });
});
