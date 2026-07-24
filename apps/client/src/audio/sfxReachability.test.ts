/**
 * audio/sfxReachability — the PROOF half of the registry.
 *
 * `sfxReachability.ts` declares, per audio-map SFX key, that some code path can
 * play it. The 版權聲明 page turns that declaration into a public claim about
 * 効果音ラボ clips, and the owner's standing authorisation to ship those clips
 * rests on the page being true. So every POSITIVE claim here is anchored to a
 * file on disk rather than trusted:
 *
 *   • the row set equals the audio map's key set exactly — a key added to the
 *     map without a decision goes red instead of being silently counted;
 *   • each `site` exists and still contains the key as a literal — deleting or
 *     renaming an emit site goes red instead of leaving a stale claim;
 *   • each `events` name is in the game-server's FANNED_OUT_EVENT_TYPES — this
 *     is the exact trapdoor that left five "complete" cues silent for months;
 *   • each `payload` field appears at the sim emit site for its event.
 *
 * NEGATIVE claims are held to a weaker standard on purpose: an `unreachable`
 * row only has to carry a stated reason. It understates, so its failure mode is
 * a clip wrongly badged 收錄未啟用 — never an unearned claim of use.
 *
 * All four ground-truth files (audio-map.json, eventFanout.ts, the sim emit
 * sites, the client emit sites) belong to other lanes. If one changes, the fix
 * is to reconcile this registry with it — never to relax the assertion.
 */
import { describe, it, expect } from "vitest";
// Same coverage id as sfxLabCredits.test.ts: this file exists to keep the
// credits ledger's claim true, it just proves it from the code side.
import { cover } from "@ggd/shared/testkit/cover";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  SFX_REACHABILITY,
  SFX_REACH_BY_KEY,
  PLAYABLE_SFX_KEYS,
  isPlayableSfxKey,
  sfxSilentReason,
} from "./sfxReachability";

const REPO = resolve(__dirname, "../../../..");

function mapSfxKeys(): string[] {
  const doc = JSON.parse(
    readFileSync(join(REPO, "content/config/audio-map.json"), "utf8"),
  ) as { sfx?: Record<string, unknown> };
  return Object.keys(doc.sfx ?? {});
}

/**
 * The sim events the game server actually broadcasts, scraped from the ONE list
 * that decides it. Read as text on purpose: the client must not take a build
 * dependency on the server package, and the assertion is about that file's
 * shipped contents rather than about a type.
 */
function fannedOutEvents(): Set<string> {
  const src = readFileSync(join(REPO, "apps/game-server/src/net/eventFanout.ts"), "utf8");
  // Anchor on the DECLARATIONS, not the first mention: the file's header comment
  // names both sets while explaining the contract, and slicing between those two
  // mentions yields prose with no entries in it.
  const start = src.indexOf("export const FANNED_OUT_EVENT_TYPES");
  const end = src.indexOf("export const SERVER_ONLY_EVENT_TYPES");
  expect(start, "eventFanout.ts no longer declares FANNED_OUT_EVENT_TYPES").toBeGreaterThan(-1);
  expect(end, "eventFanout.ts no longer declares SERVER_ONLY_EVENT_TYPES").toBeGreaterThan(start);
  const block = src.slice(start, end);
  // Quoted names inside the Set literal. Comments in that block quote event
  // names too (`fireRingTick` / `fireRingDamage`), but those use backticks, so
  // only double-quoted entries are collected.
  return new Set([...block.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"/g)].map((m) => m[1]!));
}

/** Every sim source file, so an emit site can be located by its event name. */
function simFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".ts") && !p.includes(".test.")) out.push(p);
    }
  };
  walk(join(REPO, "packages/shared/src/sim"));
  return out;
}

describe("sfxReachability (credits-data)", () => {
  it("classifies EVERY audio-map key exactly once — no key is left uncounted", () => {
    cover("credits-data");
    const keys = mapSfxKeys();
    const rows = SFX_REACHABILITY.map((r) => r.key);
    // no duplicate rows (a duplicate would let one row's claim mask another's)
    expect(rows.length, "duplicate key in SFX_REACHABILITY").toBe(new Set(rows).size);
    const missing = keys.filter((k) => !SFX_REACH_BY_KEY.has(k));
    expect(missing, `audio-map keys with no reachability decision: ${missing.join(", ")}`).toEqual([]);
    const stale = rows.filter((k) => !keys.includes(k));
    expect(stale, `reachability rows for keys the audio map no longer has: ${stale.join(", ")}`).toEqual([]);
  });

  it("anchors every PLAYABLE key to a real emit site that still names it", () => {
    cover("credits-data");
    for (const row of SFX_REACHABILITY) {
      if (row.kind === "unreachable") continue;
      expect(row.site, `no emit site declared for ${row.key}`).toBeTruthy();
      const path = join(REPO, row.site!);
      expect(existsSync(path), `emit site for ${row.key} does not exist: ${row.site}`).toBe(true);
      const src = readFileSync(path, "utf8");
      expect(
        new RegExp(`["'\`]${row.key.replace(/[-]/g, "\\$&")}["'\`]`).test(src),
        `${row.site} no longer names "${row.key}" — the claim that it is played is stale`,
      ).toBe(true);
    }
  });

  it("proves every event-driven cue actually crosses the wire (the S10 trapdoor)", () => {
    cover("credits-data");
    const fanned = fannedOutEvents();
    expect(fanned.size, "scraped no events from eventFanout.ts — the parse broke").toBeGreaterThan(20);
    for (const row of SFX_REACHABILITY) {
      for (const ev of row.events ?? []) {
        expect(
          fanned.has(ev),
          `"${row.key}" rides sim event "${ev}", which is NOT in FANNED_OUT_EVENT_TYPES — ` +
            "the cue cannot sound in a real match, so the credits page must not call it wired",
        ).toBe(true);
      }
    }
  });

  it("proves every payload field the routing reads is on the sim emit site", () => {
    cover("credits-data");
    const files = simFiles().map((p) => ({ p, src: readFileSync(p, "utf8") }));
    for (const row of SFX_REACHABILITY) {
      if (!row.payload) continue;
      for (const [ev, fields] of Object.entries(row.payload)) {
        expect(row.events, `${row.key} declares payload for "${ev}" but does not ride it`).toContain(ev);
        const emitters = files.filter((f) => f.src.includes(`emit("${ev}"`));
        expect(emitters.length, `no sim emit site found for "${ev}" (needed by ${row.key})`).toBeGreaterThan(0);
        for (const field of fields) {
          expect(
            emitters.some((f) => f.src.includes(field)),
            `"${row.key}" reads \`${field}\` off "${ev}", but no file emitting that event mentions it`,
          ).toBe(true);
        }
      }
    }
  });

  it("makes every UNREACHABLE key state a reason, and claim nothing else", () => {
    cover("credits-data");
    for (const row of SFX_REACHABILITY) {
      if (row.kind !== "unreachable") continue;
      expect((row.reason ?? "").length, `no reason given for silent key ${row.key}`).toBeGreaterThan(20);
      // A silent key must not also carry an emit-site claim — the two contradict.
      expect(row.site, `${row.key} is marked unreachable but names an emit site`).toBeUndefined();
      expect(row.events, `${row.key} is marked unreachable but names sim events`).toBeUndefined();
      expect(isPlayableSfxKey(row.key), `${row.key} is both silent and playable`).toBe(false);
      expect(sfxSilentReason(row.key)).toBe(row.reason);
    }
  });

  it("keeps the derived set and the lookups in agreement", () => {
    cover("credits-data");
    for (const row of SFX_REACHABILITY) {
      expect(isPlayableSfxKey(row.key)).toBe(row.kind !== "unreachable");
      if (row.kind !== "unreachable") expect(sfxSilentReason(row.key)).toBeNull();
    }
    expect(PLAYABLE_SFX_KEYS.size).toBe(SFX_REACHABILITY.filter((r) => r.kind !== "unreachable").length);
    // an unknown key is neither playable nor silent-with-a-reason
    expect(isPlayableSfxKey("nope")).toBe(false);
    expect(sfxSilentReason("nope")).toBeNull();
  });

  it("still reports the known-silent keys as silent (regression pin)", () => {
    cover("credits-data");
    // The #3-era hit-weight orphans and the two shadowed event-name keys. If one
    // of these ever becomes reachable that is a real change — update the row and
    // this list together, deliberately.
    for (const key of ["hit-light", "hit-medium", "hit-heavy", "hit-crit", "block-hit", "damage", "basicAttackHit"]) {
      expect(isPlayableSfxKey(key), `${key} unexpectedly became playable`).toBe(false);
    }
    // The three archery/魔法陣 clips the trigger lane wired: these HAVE to be
    // playable now, or the credits page is understating again.
    for (const key of ["arrowRelease", "arrowPierce", "castCircle"]) {
      expect(isPlayableSfxKey(key), `${key} lost its emit site`).toBe(true);
    }
  });
});
