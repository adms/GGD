/**
 * audio/combatBedGate — a SUSTAINED combat bed may only START while the fight is
 * actually running (task #238).
 *
 * ---------------------------------------------------------------------------
 * WHY #216 WAS ONLY HALF A FIX
 * ---------------------------------------------------------------------------
 * #216 answered 「回到商店時…還會有火圈聲音」 by giving sustained SFX a STOP path:
 * `SFX_LOOPABLE` beds are tracked as voices, and `AudioDirector` hangs
 * `stopSustainedSfx()` on the `isCombatEnd` phase edge. That closed the case
 * where a bed was ALREADY PLAYING when the bell rang.
 *
 * It did nothing about a bed that STARTS AFTER the bell — and the client has two
 * clocks that make exactly that reachable:
 *
 *   • the teardown is a REACT EFFECT keyed on `[phase]`, so it runs once, on the
 *     commit that carries the new phase;
 *   • `fireRingLoop` is produced by `combatSfx.combatSfxKey`, driven by the
 *     GameApp's per-frame `conn.drainEvents()` — a requestAnimationFrame clock
 *     that is NOT synchronised with React's commit.
 *
 * So the ordering "phase commits → teardown fires → the next rAF frame drains a
 * still-queued `fireRingStart`" starts a ~60 s burning-fire bed with the round
 * already over and the teardown edge already spent. Nothing stops it until the
 * NEXT combat→X transition, which is a whole shop phase away. That is the
 * defeated player sitting in the shop listening to the ring burn.
 *
 * The stop edge cannot fix this on its own: an edge fires once, and the event
 * that starts the bed arrives after it. The bed needs its own gate on the PHASE
 * ITSELF — a level, not an edge — which is what this module is.
 *
 * ---------------------------------------------------------------------------
 * WHY A LEVEL GATE AND NOT A SECOND EDGE
 * ---------------------------------------------------------------------------
 * A second teardown (e.g. "also stop beds one frame later") would be a race
 * patched with a delay: it would still admit the bed for that frame, and it
 * would break the moment the queue drained two frames late instead of one.
 * Asking "is the fight running RIGHT NOW, at the instant this bed wants to
 * start" has no such window. It is also the honest question — a fire-ring bed
 * during 結算 or the shop is wrong no matter how it got there.
 *
 * PURE ON PURPOSE. No store import, no AudioSystem import: the phase is an
 * argument. `combatSfx` is the imperative shell that reads
 * `hudStore.getState().phase` and calls in here, exactly the shape `sfxEdges`,
 * `crowdCheer` and `countdownCue` already use. That keeps the rule unit-testable
 * against a REAL phase transition (see combatBedGate.test.ts) rather than
 * against a mock boolean.
 *
 * MIXER-NEUTRAL. This only decides whether a bed may START. It changes no
 * volume and bypasses nothing: everything still flows through `playSfx`, so the
 * #14/#54 master toggle + sliders and the #62 test-mode silence are untouched.
 */

/**
 * The match phase in which a fight is actually running. `MatchState.phase` is a
 * plain string on the wire (`champSelect | intermission | combat | resolution |
 * matchEnd`, plus the client-only `connecting`), and only this one means "the
 * round is live".
 */
export const COMBAT_PHASE = "combat";

/**
 * SUSTAINED beds (members of `sfxManifest.SFX_LOOPABLE`) that belong to the
 * FIGHT and to nothing else, so starting one outside `combat` is always wrong.
 *
 * Deliberately NOT all of `SFX_LOOPABLE`:
 *   • `merchantAmbience` is the intermission market bed — combat is the phase it
 *     must NOT play in, so gating it on combat would invert it;
 *   • `legendaryRoll` is the shop/draft orb roll, likewise out-of-combat.
 * Listing the combat-scoped three explicitly keeps this a statement about the
 * fiction rather than a coincidence of which set a key happens to live in.
 *
 * `arenaAmbience` never actually reaches this gate today (AudioDirector starts
 * it on the combat-START edge, where the phase is `combat` by construction), but
 * it is listed because it is combat-scoped and the rule should not depend on
 * which module happens to emit it.
 */
export const COMBAT_ONLY_BEDS: ReadonlySet<string> = new Set([
  // 火環收縮的燃燒床音 (#132/#195) — the bed this task exists for.
  "fireRingLoop",
  // 競技場環境音床 — the room the fight happens in.
  "arenaAmbience",
  // 復活詠唱 (#84) — a teammate channelling a revive circle, mid-fight only.
  "reviveChannel",
]);

/** True when `key` is a sustained bed that only belongs inside combat. */
export function isCombatOnlyBed(key: string): boolean {
  return COMBAT_ONLY_BEDS.has(key);
}

/**
 * May `key` START right now, given the live match `phase`?
 *
 * Everything that is not a combat-scoped sustained bed passes through untouched
 * — this is a narrow gate on three ambience beds, NOT a blanket "no combat audio
 * outside combat" rule. Transients (hits, casts, coins, the crowd cheer) are
 * short and self-terminating; they were never the bug and are not silenced here.
 *
 * @param key   the audio-map SFX key a mapper wants to play, or null for silence
 * @param phase `hudStore.phase` at the instant the event is being dispatched
 * @returns the key when it may play, or null when this phase forbids it
 */
export function gateCombatBed(key: string | null, phase: string): string | null {
  if (key === null) return null;
  if (!isCombatOnlyBed(key)) return key;
  return phase === COMBAT_PHASE ? key : null;
}
