/**
 * #223 voice-audience WIRING guard.
 *
 * The policy itself is proved behaviourally in audio/voiceAudience.test.ts. What
 * that cannot reach is the glue: GameApp drives the canvas imperatively and
 * cannot be instantiated headlessly (Babylon engine, sockets, render seam), so —
 * in the same spirit as GameApp.batch1Wiring.test.ts — this is a SOURCE scan
 * over the comment-stripped file, and it exists to stop exactly one regression:
 * the local-only gates growing back, or the widened lines being dispatched
 * un-sorted (which would hand the arena-wide 1.2 s voice slot back to packet
 * order and make a twelve-body fight LESS legible than before the fix).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";

/** GameApp source with comments stripped, so prose can't satisfy the assertions. */
const SRC = readFileSync(fileURLToPath(new URL("./GameApp.ts", import.meta.url)), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

describe("#223 hurt / defeat are no longer gated to the local hero (voice-audience-223)", () => {
  it("the damage branch feeds damageVoiceCandidate for EVERY victim", () => {
    cover("voice-audience-223");
    expect(SRC).toMatch(/this\.queueVoiceCandidate\(\s*damageVoiceCandidate\(/);
    // the old gate: hurt only ever fired inside `target === localId`
    expect(SRC).not.toMatch(/playContextualVoice\(victim, heavy \? "hurt-heavy" : "hurt"\)/);
  });

  it("the death branch feeds deathVoiceCandidate for EVERY corpse, with its killer", () => {
    cover("voice-audience-223");
    expect(SRC).toMatch(/this\.queueVoiceCandidate\(\s*deathVoiceCandidate\(/);
    expect(SRC).toMatch(/counterpart: killer/);
    // the old gate: `Number(d.id) === localId` around the defeat line
    expect(SRC).not.toMatch(/playContextualVoice\(champ, "defeat"\)/);
  });

  it("the heavy/light split reads the VICTIM'S max hp, never the local hero's", () => {
    cover("voice-audience-223");
    expect(SRC).toMatch(/victimMaxHp: this\.entityMaxHp\(target\)/);
    expect(SRC).not.toMatch(/localMaxHp[\s\S]{0,120}HURT_HEAVY_FRACTION/);
  });

  it("the frame's candidates are SORTED before dispatch (no packet-order lottery)", () => {
    cover("voice-audience-223");
    // the flush orders them, and the frame loop calls the flush once per frame
    expect(SRC).toMatch(/for \(const c of orderVoiceCandidates\(this\.frameVoices\)\)/);
    expect(SRC).toMatch(/this\.flushContextualVoices\(listener, /);
    // and it goes through the SAME throttled path, so de-dup + gates still apply
    expect(SRC).toMatch(/playContextualVoice\(c\.champId, c\.category, \{/);
  });

  it("distance for a damage line comes from the PACKET, not a stale render pose", () => {
    cover("voice-audience-223");
    // damage.ts emits the victim's transform on the packet; views.posOf would be
    // one frame stale here (the drain is step 1, views.sync is step 4).
    expect(SRC).toMatch(/distance: this\.listenerDistance\(/);
    // #259 renamed entityListenerDistance → voiceWhere (one schema sample now
    // feeds BOTH the distance band and the mix position); the schemaPos rule
    // that made it right is the part that must not move.
    expect(SRC).toMatch(/private voiceWhere\(id: number\)[\s\S]{0,260}this\.schemaPos\(id\)/);
  });
});

describe("#223 the neighbouring categories deliberately left alone", () => {
  it("attack-light + sprint stay LOCAL-only (owner hard rule: 1.4 windups/sec × 12 bodies)", () => {
    cover("voice-audience-223");
    expect(SRC).toMatch(
      /if \(isLocal\) \{[\s\S]{0,240}playContextualVoice\(champ, "attack-light"\)[\s\S]{0,200}playContextualVoice\(champ, "sprint"\)/,
    );
  });

  it("block / healed / dodge stay LOCAL-only (answers to YOUR input)", () => {
    cover("voice-audience-223");
    for (const cat of ["block", "healed", "dodge"]) {
      expect(SRC).toMatch(
        new RegExp(`target === localId[\\s\\S]{0,200}playContextualVoice\\(\\w+, "${cat}"\\)`),
      );
    }
  });

  it("abilityCast + crit stay UN-GATED — every champion still speaks them", () => {
    cover("voice-audience-223");
    // #259 moved them from an inline `playContextualVoice` to the same frame
    // queue as hurt/defeat. That is a PLACEMENT change, not an audience one:
    // the mix needs the post-camera listener, which does not exist during the
    // drain. What must never come back is a `=== localId` gate around them, and
    // what must not appear is a probScale — `plainVoiceCandidate` hard-codes 1
    // so the dispatch RATE is exactly what the owner tuned.
    expect(SRC).toMatch(/category: `skill-name\.\$\{slot\.toLowerCase\(\)\}`/);
    expect(SRC).toMatch(/category: Math\.random\(\) < 0\.5 \? "crit" : "attack-heavy"/);
    expect(SRC).not.toMatch(/localId !== null && caster === localId/);
    // exactly one factory decides these two, and it is the probScale-1 one
    const plain = readFileSync(
      fileURLToPath(new URL("./audio/voiceAudience.ts", import.meta.url)),
      "utf8",
    );
    expect(plain).toMatch(/export function plainVoiceCandidate[\s\S]{0,400}probScale: 1,/);
  });

  it("the hum idle latch is still only reset by the LOCAL player's own combat", () => {
    cover("voice-audience-223");
    expect(SRC).toMatch(/target === localId\) \{\s*this\.noteLocalCombat\(\);/);
  });
});

describe("#223 stays client-only", () => {
  it("the audience policy never reaches into the sim", () => {
    cover("voice-audience-223");
    const policy = readFileSync(
      fileURLToPath(new URL("./audio/voiceAudience.ts", import.meta.url)),
      "utf8",
    );
    expect(policy).not.toMatch(/from "@ggd\/shared\/sim/);
    expect(policy).not.toMatch(/world\.rng/);
  });
});
