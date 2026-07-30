/**
 * 下架守衛 —— the two champions the owner took off the roster stay off it.
 *
 * WHAT THIS GUARDS THAT NOTHING ELSE DID. Both ids are already absent from every
 * shipped surface today, so a test that merely re-asserts today's state proves
 * nothing (失敗形態④: an assertion that passes against the broken implementation
 * too). What makes this a guard is the DIRECTION: it reads the delist table as
 * the intent and the SHIPPED artifacts as the fact, so the moment a re-import,
 * a merge or a 「這支好像漏了」 puts either id back into starter.go, the random
 * pool or the free list, this goes red and names the champion.
 *
 * IT READS THE ARTIFACTS THE INSTALL ACTUALLY USES, not a fixture:
 *   · apps/platform/internal/curation/starter.go — the seed a fresh install
 *     applies, i.e. the roster champ-select offers before anyone curates
 *     anything (via testkit/starterRoster, the same parser the game-server's
 *     whitelist test uses);
 *   · RANDOM_HERO_POOL_IDS — the map's own 78-entry pick list;
 *   · content/config/store.json `freeChampionIds` — an id here is owned by every
 *     new account for free.
 * The LIVE gate, `data/curation/whitelist.json`, is deliberately NOT read: it is
 * `.gitignore`d operator state, so a test that read it would pass on one machine
 * and die of ENOENT everywhere else. See testkit/starterRoster.ts's header.
 *
 * MUTATION RECORD (2026-07-30, all four re-run by hand):
 *   1. append "godie-u01f" to `starterChampions` in starter.go        → RED
 *   2. add "godie-e00u" to RANDOM_HERO_POOL_IDS                       → RED
 *   3. add "godie-u01f" to store.json freeChampionIds                 → RED
 *   4. delete content/champions/godie-e00u.json                       → RED
 *      (下架 ≠ 刪除 — the doc must survive so the ruling stays reversible)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { readStarterRoster } from "../../testkit/starterRoster";
import { RANDOM_HERO_POOL_IDS } from "./championIdentity";
import { DELISTED_CHAMPIONS, DELISTED_CHAMPION_IDS, isDelistedChampion } from "./delistedChampions";

// src/content -> src -> shared -> packages -> repo root
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(ROOT, "content");

const WHY =
  " —— 下架 is an owner ruling recorded in packages/shared/src/content/delistedChampions.ts." +
  " If the owner reversed it, remove the row there IN THE SAME CHANGE; do not just re-add the id.";

describe("下架名單 —— godie-e00u / godie-u01f stay off every shipped roster (#262)", () => {
  it("the table is not empty and names exactly the two ruled ids", () => {
    cover("champion-delist-guard");
    // A table that silently emptied would make every assertion below vacuous —
    // the classic 「for-loop over nothing is green」 failure.
    expect(DELISTED_CHAMPION_IDS).toEqual(["godie-e00u", "godie-u01f"]);
    expect(isDelistedChampion("godie-e00u")).toBe(true);
    expect(isDelistedChampion("godie-hart")).toBe(false);
  });

  it("NONE of them is in the FIRST OPEN ROSTER a fresh install seeds", () => {
    cover("champion-delist-guard");
    const roster = readStarterRoster(ROOT);
    expect(roster.length).toBeGreaterThan(40); // the parser really found the block
    for (const id of DELISTED_CHAMPION_IDS) {
      const rec = DELISTED_CHAMPIONS.get(id)!;
      expect(roster, `${id} (${rec.name}) is back in starterChampions${WHY}`).not.toContain(id);
    }
  });

  it("NONE of them is in the map's own 78-entry random-hero pool", () => {
    cover("champion-delist-guard");
    expect(RANDOM_HERO_POOL_IDS.size).toBe(78);
    for (const id of DELISTED_CHAMPION_IDS) {
      const rec = DELISTED_CHAMPIONS.get(id)!;
      expect(RANDOM_HERO_POOL_IDS.has(id), `${id} (${rec.name}) joined the random pool${WHY}`).toBe(
        false,
      );
    }
  });

  it("NONE of them is free-listed — a free id is owned by every new account", () => {
    cover("champion-delist-guard");
    const store = JSON.parse(readFileSync(join(CONTENT, "config", "store.json"), "utf8")) as {
      freeChampionIds?: string[];
    };
    const free = store.freeChampionIds ?? [];
    expect(free.length).toBeGreaterThan(0); // the field still exists and is populated
    for (const id of DELISTED_CHAMPION_IDS) {
      const rec = DELISTED_CHAMPIONS.get(id)!;
      expect(free, `${id} (${rec.name}) is free-listed in store.json${WHY}`).not.toContain(id);
    }
  });

  it("下架 ≠ 刪除: every delisted doc is STILL on disk and STILL in the index", () => {
    cover("champion-delist-guard");
    const idx = JSON.parse(readFileSync(join(CONTENT, "champions", "_index.json"), "utf8")) as {
      entries: { id: string }[];
    };
    const indexed = new Set(idx.entries.map((e) => e.id));
    for (const id of DELISTED_CHAMPION_IDS) {
      const path = join(CONTENT, "champions", `${id}.json`);
      expect(
        existsSync(path),
        `${id}.json was DELETED. 下架 is a curation state, not a deletion — the owner ` +
          "has reversed curation calls before, and a deleted doc costs a re-import to recover.",
      ).toBe(true);
      expect(indexed, `${id} fell out of champions/_index.json`).toContain(id);
    }
  });

  it("every row carries a ruling, a date and at least one piece of evidence", () => {
    cover("champion-delist-guard");
    // Stops the table degenerating into a bare id list, which is how 「why is
    // this off the roster?」 becomes unanswerable two months from now.
    for (const [id, rec] of DELISTED_CHAMPIONS) {
      expect(rec.name.length, `${id} has no display name`).toBeGreaterThan(0);
      expect(rec.ruling.length, `${id} has no ruling`).toBeGreaterThan(10);
      expect(rec.ruledOn, `${id} has no ruling date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rec.defects.length, `${id} records no evidence`).toBeGreaterThan(0);
    }
  });
});
