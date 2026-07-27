/**
 * idlePerform — the rotation RULE, and a census over the REAL shipped roster.
 *
 * The first half pins the rule (tiers, exclusions, the per-kind cap, the
 * cadence, the no-immediate-repeat pick). The second half is the one that
 * matters most and the one a hand-written fixture cannot fake: it parses every
 * champion's actual .glb out of content/ and asserts the rule produces a
 * performance for EVERY hero on the roster. The whole reason this feature
 * needed a measured clip census (see idlePerform.ts's header) is that clip
 * inventories differ wildly — 45 heroes have "cheer", 3 have "Stand Victory",
 * 67 have neither — so a rule that reads fine against a fixture can still leave
 * most of the roster standing frozen at the counter.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import {
  FIRST_PERFORM_SEC,
  PERFORM_GAP_MAX_SEC,
  PERFORM_GAP_MIN_SEC,
  PER_KIND_CAP,
  buildPerformPool,
  nextPerformIndex,
  performGapSec,
  pickIdleClip,
  type PerformKind,
} from "./idlePerform";

/** repo content/ mount — the same tree the client fetches /content/ from */
const CONTENT_DIR = join(__dirname, "../../../../../content");

describe("idlePerform — which clips are worth showing at the counter", () => {
  it("ranks a celebration over a chat over a pose over a spell over a swing", () => {
    cover("shop-idle-perform");
    const pool = buildPerformPool(
      ["Stand", "cheer", "Portrait Talk", "Stand Ready", "Spell", "Attack"],
      "Stand",
    );
    expect(pool.map((p) => p.kind)).toEqual(["celebrate", "talk", "pose", "spell", "attack"]);
    expect(pool[0]?.clip).toBe("cheer");
  });

  it("never rotates the hero back into the idle he is already holding", () => {
    cover("shop-idle-perform");
    // The resting clip is excluded BY IDENTITY: "Stand" goes, "Stand 2" and
    // "Stand Ready" — the variants worth showing — stay. A name-pattern rule
    // would have to drop all three or keep all three.
    const pool = buildPerformPool(["Stand", "Stand 2", "Stand Ready"], "Stand");
    expect(pool.map((p) => p.clip)).toEqual(["Stand 2", "Stand Ready"]);
    expect(pool.every((p) => p.clip !== "Stand")).toBe(true);

    // …and the case that makes the identity check load-bearing rather than
    // decorative: when the RESTING clip is itself something a tier would want.
    // No champion on today's roster is like this (measured: 0 of 115), but
    // `pickIdleClip` falls back to a variant, and then to the first clip at all,
    // so the next imported hero can be — and rotating a hero into the pose he
    // is already holding is a performance the player cannot see.
    expect(buildPerformPool(["Stand Ready", "Attack"], "Stand Ready").map((p) => p.clip)).toEqual([
      "Attack",
    ]);
    // a rig whose ONLY clip is the one it rests in has nothing to rotate → nod
    expect(buildPerformPool(["Attack"], "Attack")).toEqual([]);
    expect(buildPerformPool(["cheer", "Attack"], "cheer").map((p) => p.clip)).toEqual(["Attack"]);
  });

  it("refuses the clips that would read as a disaster at a market stall", () => {
    cover("shop-idle-perform");
    const banned = [
      "Death",
      "Decay Flesh",
      "Dissipate",
      "Stand Hit",
      "Birth",
      "Morph",
      "Walk",
      "TempWalk",
      "Portrait", // WC3's head-only UI clip: plays as nothing on a full body
      "Portrait 2",
    ];
    expect(buildPerformPool(banned, null)).toEqual([]);
    // …but the TALKING portrait variant is exactly what we want
    expect(buildPerformPool(["Portrait Talk"], null).map((p) => p.kind)).toEqual(["talk"]);
  });

  it("caps each kind so a 4-attack hero is not a weapons demo", () => {
    cover("shop-idle-perform");
    const pool = buildPerformPool(
      ["Stand", "Attack", "Attack 2", "Attack Slam", "Attack - 3", "Stand Ready"],
      "Stand",
    );
    const attacks = pool.filter((p) => p.kind === "attack");
    expect(attacks).toHaveLength(PER_KIND_CAP);
    // the single alternate stand still gets its slot — variety by construction
    expect(pool.some((p) => p.kind === "pose")).toBe(true);
  });

  it("never RESTS the hero in a clip it would refuse to rotate him into", () => {
    cover("shop-idle-perform");
    // THE DEFECT THIS PINS. `pickIdleClip` used to consult /idle|stand/ and
    // nothing else, so a WC3 composite whose name merely CONTAINS "Stand" was a
    // valid resting pose: 4 shipped champions looped「Attack Walk Stand Spin」at
    // the counter — a walking sword swing as a market-stall idle — while this
    // module's own header said walk clips「slide a rooted model」.
    //
    // The pool ban and the resting-pose ban are now one predicate, so this is a
    // property, not a spot fix: whatever the rotation refuses to SHOW, the
    // resting slot refuses too.
    const zy3 = [
      "Attack",
      "Attack Defend 5",
      "Death",
      "Walk",
      "Stand Defend",
      "Attack Walk Stand Spin",
      "Stand",
      "Stand 2",
    ];
    expect(pickIdleClip(zy3)).toBe("Stand");
    // …the rig where the composite is ALSO the first /stand/ substring match
    const musashi = ["Walk", "Attack Walk Stand Spin", "Stand", "Stand 2", "Attack"];
    expect(pickIdleClip(musashi)).toBe("Stand");
    // a walk/death/hurt clip is never a resting pose, whatever else is on offer
    expect(pickIdleClip(["Walk Stand", "Stand Hurt", "Attack"])).toBe("Attack");
    // …and a rig with NOTHING showable still gets a pose rather than nothing:
    // a T-posing statue is worse than a bad loop, so the last ditch stands
    expect(pickIdleClip(["Death", "Walk"])).toBe("Death");
  });

  it("rests the hero in his BASE stand, not in whichever variant is listed first", () => {
    cover("shop-idle-perform");
    // 犬妖-殺生丸's real clip order (imported/sesshomaru.glb): the alternate
    // pose comes first, so "first /idle|stand/ match" rested him in it and left
    // his rotation with nothing but sword swings.
    const sesshomaru = ["Stand - 2", "Attack", "Attack Slam", "Death", "Walk", "Stand", "Attack 2", "Dissipate"];
    expect(pickIdleClip(sesshomaru)).toBe("Stand");
    const kinds = new Set(buildPerformPool(sesshomaru, pickIdleClip(sesshomaru)).map((p) => p.kind));
    expect([...kinds].sort()).toEqual(["attack", "pose"]);
    // a rig with only variants still rests in one of them rather than nothing
    expect(pickIdleClip(["Stand Ready", "Attack"])).toBe("Stand Ready");
    // and a rig with no stand/idle at all falls back to its first clip
    expect(pickIdleClip(["Attack", "Death"])).toBe("Attack");
    expect(pickIdleClip([])).toBeNull();
  });

  it("returns an empty pool (→ the caller nods) when nothing is legible", () => {
    cover("shop-idle-perform");
    expect(buildPerformPool([], null)).toEqual([]);
    expect(buildPerformPool(["Stand"], "Stand")).toEqual([]);
    expect(buildPerformPool(["Stand", "Death", "Walk"], "Stand")).toEqual([]);
  });
});

describe("idlePerform — cadence", () => {
  it("holds the first performance until the entry beat is over", () => {
    cover("shop-idle-perform");
    // the camera ease is 900 ms and the merchant waves over it; performing into
    // that would collide with the greeting both on screen and on the SFX bus
    expect(FIRST_PERFORM_SEC).toBeGreaterThanOrEqual(2);
    // …and it must still leave room for several performances in a 40 s shop
    expect(FIRST_PERFORM_SEC).toBeLessThan(10);
  });

  it("keeps the gap inside the authored window for any rand()", () => {
    cover("shop-idle-perform");
    for (const r of [0, 0.25, 0.5, 1, -1, 2, Number.NaN]) {
      const gap = performGapSec(() => r);
      expect(Number.isFinite(gap)).toBe(true);
      expect(gap).toBeGreaterThanOrEqual(PERFORM_GAP_MIN_SEC);
      expect(gap).toBeLessThanOrEqual(PERFORM_GAP_MAX_SEC);
    }
  });

  it("is quiet enough not to talk over the shop: 3–5 performances per visit", () => {
    cover("shop-idle-perform");
    // the intermission is 40 s (content/config/config.match.json match.intermissionSec)
    const SHOP_SEC = 40;
    const most = Math.floor((SHOP_SEC - FIRST_PERFORM_SEC) / PERFORM_GAP_MIN_SEC) + 1;
    const fewest = Math.floor((SHOP_SEC - FIRST_PERFORM_SEC) / PERFORM_GAP_MAX_SEC) + 1;
    expect(fewest).toBeGreaterThanOrEqual(3); // often enough to read as alive
    expect(most).toBeLessThanOrEqual(6); // rare enough not to become chatter
  });

  it("never repeats a performance back-to-back", () => {
    cover("shop-idle-perform");
    // exhaustive over a 4-entry pool: from every current index, every rand draw
    for (let cur = 0; cur < 4; cur++) {
      for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.99, 1]) {
        const next = nextPerformIndex(cur, 4, () => r);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(4);
        expect(next).not.toBe(cur);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// the census: every shipped champion, against its REAL .glb
// ---------------------------------------------------------------------------

/** Animation names out of a .glb, by parsing the glTF JSON chunk. */
function glbAnimationNames(absPath: string): string[] | null {
  const buf = readFileSync(absPath);
  if (buf.length < 20 || buf.toString("ascii", 0, 4) !== "glTF") return null;
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) return null; // not the JSON chunk
  const json = JSON.parse(buf.toString("utf8", 20, 20 + chunkLen)) as {
    animations?: { name?: string }[];
  };
  return (json.animations ?? []).map((a) => a.name ?? "");
}

/**
 * The idle clip `IntermissionScene.setChampion` loops — the SAME function the
 * scene calls, not a re-implementation of it (failure shape ⑤).
 */
const idleClipFor = pickIdleClip;

interface RosterEntry {
  championId: string;
  modelKey: string;
  glb: string;
  clips: string[];
}

function loadRoster(): RosterEntry[] {
  const modelsDir = join(CONTENT_DIR, "models");
  const champsDir = join(CONTENT_DIR, "champions");
  if (!existsSync(modelsDir) || !existsSync(champsDir)) return [];
  const models = new Map<string, { glbPath?: string }>();
  for (const f of readdirSync(modelsDir)) {
    if (!f.endsWith(".json")) continue;
    const doc = JSON.parse(readFileSync(join(modelsDir, f), "utf8")) as {
      id?: string;
      glbPath?: string;
    };
    if (doc.id) models.set(doc.id, doc);
  }
  const out: RosterEntry[] = [];
  for (const f of readdirSync(champsDir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(champsDir, f), "utf8")) as {
      id?: string;
      modelKey?: string;
    };
    if (!doc.id || !doc.modelKey) continue;
    const glbPath = models.get(doc.modelKey)?.glbPath;
    if (!glbPath) continue;
    const abs = join(CONTENT_DIR, glbPath);
    if (!existsSync(abs)) continue;
    const clips = glbAnimationNames(abs);
    if (!clips) continue;
    out.push({ championId: doc.id, modelKey: doc.modelKey, glb: glbPath, clips });
  }
  return out;
}

describe("idlePerform — the shipped roster actually performs", () => {
  const roster = loadRoster();

  it("found the real champion .glbs to measure", () => {
    cover("shop-idle-perform");
    // a guard on the guard: if the content tree ever moves, the census below
    // would pass vacuously over an empty list
    expect(roster.length).toBeGreaterThan(100);
  });

  it("EVERY champion gets at least one rotatable clip — nobody stands frozen", () => {
    cover("shop-idle-perform");
    const empty = roster
      .filter((r) => buildPerformPool(r.clips, idleClipFor(r.clips)).length === 0)
      .map((r) => `${r.championId} (${r.modelKey}: ${r.clips.join(", ") || "no clips"})`);
    // If this ever fails the hero does NOT break — he nods (the scene's
    // procedural degradation) — but it means the rule stopped reading the
    // roster it ships against, which is the thing worth being told about.
    expect(empty, "champions with an empty perform pool").toEqual([]);
  });

  it("no champion's rotation is a single kind on repeat", () => {
    cover("shop-idle-perform");
    const monotone = roster
      .filter((r) => {
        const pool = buildPerformPool(r.clips, idleClipFor(r.clips));
        return pool.length > 1 && new Set(pool.map((p) => p.kind)).size < 2;
      })
      .map((r) => r.championId);
    expect(monotone, "champions whose whole pool is one kind").toEqual([]);
  });

  it("every kind the rule can emit is reachable on the real roster", () => {
    cover("shop-idle-perform");
    // Failure shape ⑤: a tier that no shipped model matches is dead code the
    // tests would still happily exercise with a fixture.
    const seen = new Set<PerformKind>();
    for (const r of roster) {
      for (const p of buildPerformPool(r.clips, idleClipFor(r.clips))) seen.add(p.kind);
    }
    for (const kind of ["celebrate", "talk", "pose", "spell", "attack"] as const) {
      expect([...seen], `no shipped champion can perform "${kind}"`).toContain(kind);
    }
  });

  it("never selects a death / hurt / walk clip anywhere on the roster", () => {
    cover("shop-idle-perform");
    const offences: string[] = [];
    for (const r of roster) {
      for (const p of buildPerformPool(r.clips, idleClipFor(r.clips))) {
        if (/death|decay|dissipate|hurt|walk|\brun\b|birth|morph/i.test(p.clip)) {
          offences.push(`${r.championId} → ${p.clip}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("never RESTS a shipped champion in a death / hurt / walk clip either", () => {
    cover("shop-idle-perform");
    // The rotation census above has always been here; the RESTING pose had no
    // census at all, and that is exactly where the roster was broken. Measured
    // before the fix: 4 champions stood at the counter in "Attack Walk Stand
    // Spin" — godie-opgh (imported.zy3, which rested in a clean "Stand Defend"
    // before this feature existed, i.e. a net regression) plus godie-u01q /
    // godie-u01u / godie-udre (imported.heromusashimiyamoto), every one of which
    // ships a clean "Stand" the picker walked straight past.
    //
    // The pattern below is written out RATHER THAN imported from the module. An
    // oracle that asks the implementation「is this clip allowed?」agrees with the
    // implementation by construction: neutering the ban would make this census
    // vacuous instead of red. (Measured: it does. The rotation census above uses
    // its own literal for exactly this reason.)
    const BANNED = /death|decay|dissipate|hurt|walk|\brun\b|birth|morph|\bhit\b/i;
    const offences = roster
      .map((r) => ({ r, idle: idleClipFor(r.clips) }))
      .filter(({ idle }) => idle !== null && BANNED.test(idle))
      .map(({ r, idle }) => `${r.championId} (${r.modelKey}) rests in ${idle}`);
    expect(offences, "champions whose resting pose is a banned clip").toEqual([]);
  });

  it("the ban is LOAD-BEARING on today's roster, not decoration", () => {
    cover("shop-idle-perform");
    // Guarding the guard. `buildPerformPool`'s ban was completely inert against
    // the shipped roster while `pickIdleClip` was broken: disabling it changed
    // 0 of 115 pools, because the composite it exists to reject was already
    // being consumed as the RESTING clip, and the per-kind cap filled from the
    // clean swings anyway. A test can only be trusted to catch the ban being
    // deleted if the roster actually presents the ban with something to reject.
    const composite = roster.filter((r) => r.clips.includes("Attack Walk Stand Spin"));
    expect(composite.length, "the rig this rule was written for left the roster").toBeGreaterThan(
      0,
    );
    for (const r of composite) {
      const idle = idleClipFor(r.clips);
      const pool = buildPerformPool(r.clips, idle);
      expect(idle).not.toBe("Attack Walk Stand Spin");
      expect(pool.map((p) => p.clip)).not.toContain("Attack Walk Stand Spin");
    }
    // …and on at least one of them the CAP is not what saved us: the composite
    // is listed ahead of the swings that did fill the attack slots, so removing
    // the ban puts a walking swing straight into the rotation.
    const reachable = composite.filter((r) => {
      const at = r.clips.indexOf("Attack Walk Stand Spin");
      const attacks = buildPerformPool(r.clips, idleClipFor(r.clips)).filter(
        (p) => p.kind === "attack",
      );
      return attacks.length > 0 && attacks.every((p) => r.clips.indexOf(p.clip) > at);
    });
    expect(
      reachable.map((r) => r.championId),
      "no champion reaches the ban before the per-kind cap fills — it is inert again",
    ).not.toEqual([]);
  });
});
