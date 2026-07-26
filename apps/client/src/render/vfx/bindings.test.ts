/**
 * Roster VFX bindings (task #79): all 250 abilities of the 50 whitelisted
 * champions are bound to a real element/primitive — NOT the generic fire
 * placeholder — and 依文潔琳's ice spells resolve to an ICE primitive (the
 * flagship symptom). Every generated curated doc is schema-valid.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE ROSTER COMES FROM — and why it is NOT the operator document
 * ---------------------------------------------------------------------------
 * This file used to read the expected roster straight out of
 * `data/curation/whitelist.json`. That source was wrong TWICE:
 *
 *   1. It is GITIGNORED runtime state (`.gitignore` → `/data/**`). It exists
 *      only on a machine that has actually run the platform, so in a fresh
 *      clone, a git worktree or CI the whole suite died at collection time
 *      with `ENOENT … data/curation/whitelist.json` — 0 tests, not 1 failure.
 *   2. It is the OPERATOR's live document, and the operator legitimately
 *      enables things that are not pickable heroes. Task #215 added
 *      「聖杯黑泥醬 - 喪標麥可」(`godie-zombiex`), a MONSTER-team mob
 *      (`packages/shared/src/sim/mobs.ts`: no ChampionComp, never in
 *      champ-select, spawned in edge waves from round 3). It is whitelisted
 *      with ONE ability (`godie-zombiex.ex`), yet the 48×5 coverage assertion
 *      read it as a 49th hero and demanded five VFX classification rows for a
 *      creep. Nothing was missing from `bindings.ts` — the yardstick moved.
 *
 * The TRACKED source of truth for the shipped roster is `starterChampions` in
 * `apps/platform/internal/curation/starter.go` (that block carries a NOTE
 * telling you it is parsed as exactly that). It is the same source
 * `apps/game-server/src/curation/whitelist.test.ts` and
 * `curationVsContentModel.test.ts` parse, for exactly this reason.
 *
 * The operator document is NOT dropped — the last test still audits it when it
 * is present (or when `GGD_WHITELIST_FILE` points at an exported one), so a
 * champion opened by hand with no bindings behind it still fails loudly. What
 * changed is that the audit now asks for EVIDENCE (a real vfx doc behind every
 * ability the operator enabled) instead of assuming every whitelisted id is a
 * five-slot hero.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { isAlternateForm, zVfxDoc } from "@ggd/shared/content";
import { rosterBindings, abilityVfxKeys, curatedDocs, vfxKeyFor } from "./bindings";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const STARTER_GO = join(REPO, "apps/platform/internal/curation/starter.go");
const CONTENT = join(REPO, "content");
/** The operator's live document — gitignored, so absent on a build agent. */
const OPERATOR_DOC = process.env["GGD_WHITELIST_FILE"] ?? join(REPO, "data/curation/whitelist.json");

/** How to audit a whitelist this repo cannot see. Printed, not just commented. */
const AUDIT_THE_LIVE_HOST =
  "curl -s <host>/api/v1/curation/whitelist -o /tmp/wl.json && " +
  "GGD_WHITELIST_FILE=/tmp/wl.json pnpm --filter @ggd/client test -- src/render/vfx/bindings.test.ts";

/** Pull one `name = []string{ … }` block's quoted ids out of the Go source. */
function goList(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`starter.go no longer declares ${name} — update this test`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  if (close < 0) throw new Error(`could not find the end of ${name} in starter.go`);
  // Drop `//` line comments FIRST: the per-entry annotations are prose and can
  // themselves contain quoted words, which the id regex would otherwise scrape.
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

const roster: string[] = goList(readFileSync(STARTER_GO, "utf8"), "starterChampions");

/**
 * The shipped roster size, asserted rather than derived — a hard number is what
 * makes a silently-truncated parse fail instead of passing vacuously. It is a
 * RATCHET in the same spirit as #128's castability floor: it moves up when the
 * operator genuinely opens heroes (48 → 50 when task #212 opened 賈修貝爾
 * `godie-hblm` and 揍敵客桀諾 `godie-efur`), and every id it counts must also
 * carry a `bindings.ts` ROSTER row, so opening a hero without classifying its
 * five casts still fails here.
 */
const ROSTER_SIZE = 50;

describe("roster bindings cover the 50 whitelisted champions (ability-vfx-bindings)", () => {
  it("binds every ability of all 50 champions (250 rows, none missing)", () => {
    cover("ability-vfx-bindings");
    // Guard the parse itself: a silently-empty goList would make every
    // assertion below vacuous, which is the failure mode this file just had.
    expect(roster.length, "starter.go yielded no champions — the parse broke").toBe(ROSTER_SIZE);
    const binds = rosterBindings();
    for (const champ of roster) {
      const slots = binds.filter((b) => b.abilityId.startsWith(`${champ}.`)).map((b) => b.abilityId);
      expect(new Set(slots)).toEqual(
        new Set([`${champ}.q`, `${champ}.w`, `${champ}.e`, `${champ}.r`, `${champ}.ex`]),
      );
    }
    // The table COVERS the roster; anything beyond it must be a 變身 form. Task
    // #249 swapped 10 roster slots from the alternate body to the base, and the
    // alternate rows were KEPT rather than deleted — the two halves of a pair
    // share one kit, so the alt already needs the same bindings the moment the
    // transform mechanic (task #119) can put a player in that body. An extra
    // row that is NOT an alternate form is a mistake and still fails here.
    const rosterIds = new Set(roster);
    const extra = [...new Set(binds.map((b) => b.abilityId.replace(/\.[a-z]+$/, "")))].filter(
      (id) => !rosterIds.has(id),
    );
    for (const id of extra) {
      expect(isAlternateForm(id), `${id} is bound but is neither on the roster nor a 變身 form`).toBe(
        true,
      );
    }
    expect(binds).toHaveLength((roster.length + extra.length) * 5);
  });

  it("no roster ability keeps the generic fire placeholder", () => {
    cover("ability-vfx-bindings");
    for (const key of Object.values(abilityVfxKeys())) {
      expect(key).not.toBe("fx.ember-bolt-cast");
      expect(key.startsWith("fx.prim.")).toBe(true);
    }
  });

  it("依文潔琳 (godie-n003): Q/E/R resolve to an ICE primitive (the ice spells now have ice)", () => {
    cover("ability-vfx-bindings");
    const keys = abilityVfxKeys();
    expect(keys["godie-n003.q"]).toContain("fx.prim.ice.");
    expect(keys["godie-n003.e"]).toContain("fx.prim.ice.");
    expect(keys["godie-n003.r"]).toContain("fx.prim.ice.");
    // and the generated ice doc actually reads cold (blue-dominant tint)
    const iceDoc = curatedDocs().get(keys["godie-n003.e"]!)!;
    const tint = iceDoc.colorStops![1]![1];
    expect(tint[2]).toBeGreaterThan(tint[0]);
  });

  it("EX / R ultimates scale up vs Q/W/E of the same element+primitive (task #50)", () => {
    cover("ability-vfx-bindings");
    // godie-e008 夏娜: E fire explosion (md) vs R fire explosion (lg)
    const keys = abilityVfxKeys();
    expect(keys["godie-e008.e"]).toBe("fx.prim.fire.explosion");
    expect(keys["godie-e008.r"]).toBe("fx.prim.fire.explosion-lg");
    const docs = curatedDocs();
    const md = docs.get("fx.prim.fire.explosion")!;
    const lg = docs.get("fx.prim.fire.explosion-lg")!;
    expect(lg.sizeStops![1]![1]).toBeGreaterThan(md.sizeStops![1]![1]);
  });

  it("every distinct curated doc is schema-valid and its id equals its vfxKey", () => {
    cover("ability-vfx-bindings");
    const docs = curatedDocs();
    expect(docs.size).toBeGreaterThan(10); // a real palette, reused across abilities
    for (const [key, doc] of docs) {
      expect(doc.id).toBe(key);
      expect(() => zVfxDoc.parse(doc)).not.toThrow();
    }
  });

  it("vfxKeyFor is stable and encodes element + primitive + size", () => {
    cover("ability-vfx-bindings");
    expect(vfxKeyFor({ element: "ice", primitive: "nova", size: "md" })).toBe("fx.prim.ice.nova");
    expect(vfxKeyFor({ element: "fire", primitive: "explosion", size: "lg" })).toBe("fx.prim.fire.explosion-lg");
    expect(vfxKeyFor({ element: "void", primitive: "pulse", size: "sm" })).toBe("fx.prim.void.pulse-sm");
  });
});

// ---------------------------------------------------------------------------
// OPERATOR-DOCUMENT DRIFT
//
// The starter set above is what we SHIP; the operator document is what a given
// box actually serves, and it may open ids the starter set never had (task #212
// 賈修/揍敵客 is queued to do exactly that). This audit catches that drift
// without assuming every whitelisted id is a five-slot hero:
//
//   - anything the operator enabled must have a REAL vfx doc behind it — the
//     ability doc exists, names a vfxKey that is not the generic fire
//     placeholder, and that doc exists in content/vfx with non-zero emission,
//     lifetime and size (a doc that emits nothing is not a binding);
//   - and any champion whose FIVE player slots (q/w/e/r/ex) are all enabled is
//     by definition pickable, so it must carry a `bindings.ts` ROSTER row.
//     `godie-zombiex` (task #215 mob, `.ex` only) is therefore not asked for
//     five rows — on the evidence in the document, not on a hard-coded excuse.
//
// When the document is absent the test does NOT silently skip: it runs, its
// NAME says the document was not present, and it prints how to point the audit
// at a deployed host.
// ---------------------------------------------------------------------------
interface WhitelistDoc {
  champions?: string[];
  abilities?: string[];
}

const operatorPresent = existsSync(OPERATOR_DOC);

describe("operator whitelist vs bindings (ability-vfx-bindings)", () => {
  it(
    operatorPresent
      ? "every champion the operator opened has real vfx behind every ability it enabled"
      : "operator whitelist is NOT present on this machine — only the shipped starter set was audited",
    () => {
      cover("ability-vfx-bindings");
      if (!operatorPresent) {
        // Not a skip: the starter-set audit above already ran and is the thing
        // CI can prove. Say out loud what was NOT covered, and how to cover it.
        expect(roster.length).toBe(ROSTER_SIZE);
        console.info(`[bindings] no operator whitelist at ${OPERATOR_DOC}; audit a host with:\n  ${AUDIT_THE_LIVE_HOST}`);
        return;
      }

      const doc = JSON.parse(readFileSync(OPERATOR_DOC, "utf8")) as WhitelistDoc;
      const champions = doc.champions ?? [];
      const abilities = doc.abilities ?? [];
      expect(champions.length, `${OPERATOR_DOC} lists no champions`).toBeGreaterThan(0);

      const bound = new Set(rosterBindings().map((b) => b.abilityId));
      const PLAYER_SLOTS = ["q", "w", "e", "r", "ex"];

      for (const champ of champions) {
        const enabled = abilities.filter((a) => a.startsWith(`${champ}.`));
        expect(enabled.length, `${champ} is whitelisted but no ability of it is enabled`).toBeGreaterThan(0);

        // A champion with all five player slots open is pickable — it owes a
        // bindings.ts row for each, or its casts fall back to the placeholder.
        const allFiveOpen = PLAYER_SLOTS.every((s) => enabled.includes(`${champ}.${s}`));
        if (allFiveOpen) {
          for (const slot of PLAYER_SLOTS) {
            expect(
              bound.has(`${champ}.${slot}`),
              `${champ}.${slot} is whitelisted and pickable but has no ROSTER row in bindings.ts — ` +
                `add its (element, primitive) classification there`,
            ).toBe(true);
          }
        }

        for (const abilityId of enabled) {
          const abilityPath = join(CONTENT, "abilities", `${abilityId}.json`);
          expect(existsSync(abilityPath), `${abilityId} is whitelisted but has no content doc`).toBe(true);
          const ability = JSON.parse(readFileSync(abilityPath, "utf8")) as { vfxKey?: string };
          const vfxKey = ability.vfxKey;
          expect(vfxKey, `${abilityId} has no vfxKey — it would cast with nothing`).toBeTruthy();
          expect(vfxKey, `${abilityId} still points at the generic fire placeholder`).not.toBe(
            "fx.ember-bolt-cast",
          );

          const vfxPath = join(CONTENT, "vfx", `${vfxKey}.json`);
          expect(existsSync(vfxPath), `${abilityId} → ${vfxKey} names a vfx doc that does not exist`).toBe(true);
          const vfx = JSON.parse(readFileSync(vfxPath, "utf8")) as {
            schema?: string;
            mode?: string;
            rate?: number;
            burstCount?: number;
            lifetimeSec?: { min: number; max: number };
            size?: { start: number };
            lifespanSec?: number;
            widthAbove?: number;
          };
          if (vfx.schema === "ribbon@1") {
            // A swept trail: it is visible iff it lives and has width.
            expect(vfx.lifespanSec ?? 0, `${vfxKey} is a ribbon with no lifespan`).toBeGreaterThan(0);
            expect(vfx.widthAbove ?? 0, `${vfxKey} is a ribbon with no width`).toBeGreaterThan(0);
            continue;
          }
          const emission = vfx.mode === "burst" ? (vfx.burstCount ?? 0) : (vfx.rate ?? 0);
          expect(emission, `${vfxKey} emits no particles (${vfx.mode})`).toBeGreaterThan(0);
          expect(vfx.lifetimeSec?.max ?? 0, `${vfxKey} particles die instantly`).toBeGreaterThan(0);
          expect(vfx.size?.start ?? 0, `${vfxKey} particles have zero size`).toBeGreaterThan(0);
        }
      }
    },
  );
});
