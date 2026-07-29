/**
 * championFormSnapshot — 變身 (task #249) crosses the wire, proved on the
 * SHIPPING projection.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * The first attempt at this feature shipped `ENTITY_FLAG.FORM_A/FORM_B`,
 * `formFlagsForIndex`, `formIndexFromFlags` and a client rebuild path, and every
 * one of its tests was green — because the tests wrote the flag by hand
 * (`e.flags = ENTITY_FLAG.FORM_A`). `formFlagsForIndex` had ZERO non-test
 * callers; the 13 sites in `net/snapshot.ts` that build `flags` never touched
 * it. So in a real match the bits were always 0, the client's rebuild condition
 * was always false, and the transformed champion kept its old body forever.
 * Failure shape ⑤ (被測的不是出貨的) stacked on ② (算了沒送到).
 *
 * The only thing that can catch that is running the REAL
 * `projectSnapshot(ctl, state, drivers)` over a REAL `MatchController` and
 * reading the flags word back off `MatchState.entities` — which is exactly what
 * this file does. It builds no fixture entity and writes no flag itself.
 *
 * ── THE PAIR THAT MATTERS ───────────────────────────────────────────────────
 * Two champions are transformed, on purpose:
 *
 *   godie-nsjs → godie-n00p   (18-03 妖狐變化)  modelKey fox2 → fox   — DIFFERENT
 *   godie-harf → godie-h00w   (26-04 洨者聖臨)  modelKey barbarian ×2 — IDENTICAL
 *
 * The second is the load-bearing one. `EntityState.key` is
 * `Champions.get(championId).modelKey`, so for godie-harf it is byte-identical
 * before and after the swap — a client watching `key` for a change would see
 * NOTHING. Four of the shipped pairs are like that. The FORM bits are the only
 * channel that can answer "is this body transformed", and this test fails if
 * they ever stop being written even when the model-key case still passes.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { MatchController, type SeatSpec } from "../match/MatchController";
import {
  ENTITY_FLAG,
  MatchState,
  formIndexFromFlags,
  type EntityState,
} from "@ggd/shared/protocol/schema";
import { ContentStore } from "@ggd/shared/content/store";
import { registerAll } from "@ggd/shared/content/registries";
import { Champions } from "@ggd/shared/sim/content/registry";
import {
  applyChampionForm,
  revertToBaseForm,
  championFormIndex,
} from "@ggd/shared/sim/systems/ChampionFormSystem";
import type { ChampionId, EntityId } from "@ggd/shared/ids";
import { projectSnapshot } from "./snapshot";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");

/** base → alternate, and whether the two halves share a modelKey. */
const VISIBLE_PAIR = { base: "godie-nsjs", alt: "godie-n00p" } as const;
const HIDDEN_PAIR = { base: "godie-harf", alt: "godie-h00w" } as const;

const CFG = {
  champSelectTicks: 5,
  intermissionTicks: 20,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/**
 * Register the four real champion docs BY PATH.
 *
 * Not via `ContentLoader`: that resolves refs through `content/*_index.json`,
 * which only `pnpm content:build` rebuilds, so a freshly imported champion is
 * invisible to it until someone runs the build. Reading the doc directly is the
 * same choice icons.test.ts / standinRoster.test.ts / championFormContent.test.ts
 * make, and it keeps this suite green before AND after a reindex.
 */
function registerPairs(): void {
  const store = new ContentStore();
  for (const id of [VISIBLE_PAIR.base, VISIBLE_PAIR.alt, HIDDEN_PAIR.base, HIDDEN_PAIR.alt]) {
    const doc = JSON.parse(
      readFileSync(join(CONTENT, "champions", `${id}.json`), "utf8"),
    ) as Record<string, unknown>;
    store.add("champions", id, doc);
  }
  registerAll(store);
}

function toCombat(seed: number): MatchController {
  const ctl = new MatchController("form-snap", seed, allBots(), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  expect(ctl.phase.phase, "reached combat").toBe("combat");
  return ctl;
}

/** Re-point a LIVE champion entity at `championId`, the way champ-select would. */
function becomeChampion(ctl: MatchController, id: EntityId, championId: string): void {
  const champ = ctl.world.champion.get(id);
  const sc = ctl.world.stats.get(id);
  expect(champ, "entity is a champion").toBeDefined();
  expect(sc, "entity has stats").toBeDefined();
  champ!.championId = championId as ChampionId;
  sc!.championId = championId as ChampionId;
  sc!.dirty = true;
  ctl.tick();
}

/** The two live champion entities this suite drives. */
function twoChampions(ctl: MatchController): [EntityId, EntityId] {
  const ids = [...ctl.seats.values()]
    .map((s) => s.entityId)
    .filter((e): e is EntityId => e !== null && ctl.world.champion.has(e));
  expect(ids.length, "combat spawned champion entities").toBeGreaterThanOrEqual(2);
  return [ids[0]!, ids[1]!];
}

function project(ctl: MatchController): MatchState {
  const state = new MatchState();
  projectSnapshot(ctl, state, new Map());
  return state;
}

const entityOf = (state: MatchState, id: EntityId): EntityState => {
  const es = state.entities.get(String(id));
  expect(es, `entity ${id} is in the snapshot`).toBeDefined();
  return es!;
};

beforeAll(() => {
  registerPairs();
});

describe("變身 reaches the client through the SHIPPING snapshot (#249)", () => {
  it("sets FORM_A on the transformed champion and on nobody else", () => {
    cover("champion-form-snapshot");
    const ctl = toCombat(20260729);
    const [visible, other] = twoChampions(ctl);
    becomeChampion(ctl, visible, VISIBLE_PAIR.base);

    // BEFORE — the base body carries no form bits at all.
    const before = entityOf(project(ctl), visible);
    expect(before.flags & ENTITY_FLAG.FORM_A, "base body: FORM_A clear").toBe(0);
    expect(before.flags & ENTITY_FLAG.FORM_B, "base body: FORM_B clear").toBe(0);
    expect(formIndexFromFlags(before.flags)).toBe(0);
    const baseKey = before.key;
    expect(baseKey, "base modelKey").toBe(Champions.get(VISIBLE_PAIR.base as ChampionId).modelKey);

    // THE SHIPPING TRANSFORM — the same call `effectRunner` makes.
    const ok = applyChampionForm(ctl.world, visible, "alternate", 8, {
      slot: "E",
      origin: "test:championFormSnapshot",
    });
    expect(ok, "the transform was accepted").toBe(true);
    expect(championFormIndex(ctl.world, visible)).toBe(1);
    ctl.tick();

    // AFTER — the bit is on the wire.
    const after = project(ctl);
    const es = entityOf(after, visible);
    expect(es.flags & ENTITY_FLAG.FORM_A, "transformed: FORM_A set").not.toBe(0);
    expect(formIndexFromFlags(es.flags), "decodes to form 1").toBe(1);
    // …and this pair's model key really did move, so the OTHER half of the
    // client's rebuild identity is exercised too.
    expect(es.key).toBe(Champions.get(VISIBLE_PAIR.alt as ChampionId).modelKey);
    expect(es.key).not.toBe(baseKey);

    // NO BLEED: every other champion in the same projection is still form 0.
    const untouched = entityOf(after, other);
    expect(formIndexFromFlags(untouched.flags), "an untransformed peer stays 0").toBe(0);
    let peersChecked = 0;
    for (const [key, peer] of after.entities) {
      if (key === String(visible)) continue;
      expect(formIndexFromFlags(peer.flags), `entity ${key} untouched`).toBe(0);
      peersChecked++;
    }
    expect(peersChecked, "the no-bleed sweep saw other entities").toBeGreaterThan(4);
  });

  it("carries the bit even when BOTH halves share one modelKey (the four hidden pairs)", () => {
    cover("champion-form-snapshot");
    const ctl = toCombat(777);
    const [hidden] = twoChampions(ctl);
    becomeChampion(ctl, hidden, HIDDEN_PAIR.base);

    // the premise: this pair is invisible to `key`. If the content ever diverges
    // this expectation fails and the test below stops proving what it claims.
    expect(
      Champions.get(HIDDEN_PAIR.base as ChampionId).modelKey,
      "the pair really does share one mesh",
    ).toBe(Champions.get(HIDDEN_PAIR.alt as ChampionId).modelKey);

    const before = entityOf(project(ctl), hidden);
    applyChampionForm(ctl.world, hidden, "alternate", 8, { origin: "test:hidden-pair" });
    ctl.tick();
    const after = entityOf(project(ctl), hidden);

    expect(after.key, "the mesh is unchanged — `key` cannot see this swap").toBe(before.key);
    expect(before.flags & ENTITY_FLAG.FORM_A).toBe(0);
    expect(after.flags & ENTITY_FLAG.FORM_A, "…but the FORM bit did move").not.toBe(0);
    expect(formIndexFromFlags(after.flags)).toBe(1);
  });

  it("clears the bit again when the body goes home", () => {
    cover("champion-form-snapshot");
    const ctl = toCombat(31337);
    const [id] = twoChampions(ctl);
    becomeChampion(ctl, id, VISIBLE_PAIR.base);

    applyChampionForm(ctl.world, id, "alternate", 8, { origin: "test:revert" });
    ctl.tick();
    expect(formIndexFromFlags(entityOf(project(ctl), id).flags)).toBe(1);

    revertToBaseForm(ctl.world, id);
    ctl.tick();
    const home = entityOf(project(ctl), id);
    expect(home.flags & ENTITY_FLAG.FORM_A, "back to base: FORM_A clear").toBe(0);
    expect(formIndexFromFlags(home.flags)).toBe(0);
    expect(home.key).toBe(Champions.get(VISIBLE_PAIR.base as ChampionId).modelKey);
  });

  it("the form bits ride ALONGSIDE the other status flags, never instead of them", () => {
    cover("champion-form-snapshot");
    // The bits are OR-ed into the same uint16 as BURNING/STUNNED/…; a `flags =`
    // instead of a `flags |=` at the wrong line would silently erase the rest,
    // and every assertion above would still pass.
    const ctl = toCombat(9090);
    const [id] = twoChampions(ctl);
    becomeChampion(ctl, id, VISIBLE_PAIR.base);
    applyChampionForm(ctl.world, id, "alternate", 8, { origin: "test:coexist" });

    // give the same entity a stun, through the sim's own status component
    const st = ctl.world.status.get(id);
    expect(st, "champion has a status component").toBeDefined();
    st!.effects.push({
      statusId: "burnstun" as never,
      sourceId: "test:coexist",
      expiresAtTick: ctl.world.tick + 60,
      stun: true,
    });
    ctl.tick();

    const es = entityOf(project(ctl), id);
    expect(es.flags & ENTITY_FLAG.STUNNED, "STUNNED survived").not.toBe(0);
    expect(es.flags & ENTITY_FLAG.FORM_A, "FORM_A survived").not.toBe(0);
    expect(formIndexFromFlags(es.flags), "and the form still decodes to 1").toBe(1);
  });
});
