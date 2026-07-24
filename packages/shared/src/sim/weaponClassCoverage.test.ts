/**
 * WEAPON CLASS COVERAGE — "does the champion sound like what it is?"
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS FILE EXISTS BECAUSE OF
 * ---------------------------------------------------------------------------
 * `weaponClassOf` ALWAYS returns a class. There is no such thing as a champion
 * with no weapon sound, so a champion the vocabulary could not describe did not
 * fail — it fell through `attackType === "ranged" ? "bow" : "sword"` and got the
 * wrong one. Until 2026-07-24 the vocabulary had no caster class at all, so
 * every mage on the roster answered a spell with a BOWSTRING CREAK: 皮卡丘
 * electrocuting you, 莉娜因巴斯 casting, 涅吉 with a staff, 傑洛士 with a 錫杖.
 *
 * Nothing was red. `combatSfx.test.ts` was green because the CODE routed
 * `bow → bowDraw` correctly; the census in `content/fieldAdoption.ts` was green
 * because the five classes it knew about were each carried by ≥1 champion. Both
 * measured the mechanism. Neither could ask the question a player asks, which is
 * whether the champion in front of them sounds right.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS ASSERTED, AND WHY THESE TWO THINGS
 * ---------------------------------------------------------------------------
 * 1. COVERAGE (the guard). Every ranged champion doc carries an explicit weapon
 *    tag, so no shipped champion's attack voice is decided by the default. The
 *    default still exists — it must, the function is total — but reaching it now
 *    means someone authored a champion without answering the question, and this
 *    goes red instead of the game quietly picking for them.
 *
 *    Ranged only, deliberately. The melee default (`sword`) is a blade swing on
 *    a champion that hits things with something; it is coarse but not WRONG the
 *    way a bow draw on a mage is. Tightening melee is a separate content pass,
 *    not a reason to leave this one unguarded.
 *
 * 2. THE END-TO-END BEAT (the proof). A real SimWorld, a real whitelisted mage,
 *    a real swing → the `basicAttack` event the client actually receives carries
 *    `weaponClass: "magic"`. That is the hop nothing else covers: the pure
 *    function, the champion doc, `registerChampion`, and the emit site all have
 *    to agree, and a test of any one of them in isolation stays green while the
 *    chain is broken. The audio half of the same beat (magic → `magicBolt`, and
 *    NOT the arrow join) is pinned in `apps/client/src/audio/combatSfx.test.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE PER-CHAMPION ANSWERS CAME FROM (not from the names)
 * ---------------------------------------------------------------------------
 * Every one of these champions descends from a real WC3 hero unit, and
 * Blizzard's own `Units/*UnitFunc.txt` records what that hero throws:
 *
 *   Arrow / MoonPriestessMissile        → bow     (依文潔琳, 桔梗, 木乃香 …)
 *   WardenMissile / BrewmasterMissile   → thrown  (天地志狼, 藏馬, 貞子 …)
 *   FireBall / KeeperGrove / Farseer /
 *   ShadowHunter / SerpentWard /
 *   DemonHunter / BloodElf …            → magic   (22 of the 33)
 *
 * That table is the authority — NOT the champion's Chinese name and NOT its
 * `role`, which the importer set to "marksman" for all 33 ranged champions and
 * which therefore says nothing. Two champions have no missile art at all and are
 * decided by hand, with the reason recorded in the tagging pass:
 * `godie-u01f` (Tichondrius: a MELEE attack at 240 reach → `sword`) and `sela`
 * (not a w3x import — the synthetic Ember Sage → `magic`).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, VfxDefs, StatusEffects, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { WEAPON_TAGS, weaponClassOf } from "./systems/BasicAttackSystem";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../.."); // packages/shared/src/sim -> repo root
const CONTENT_DIR = join(ROOT, "content");
const WHITELIST = join(ROOT, "data/curation/whitelist.json");

const NO_INTENTS = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
/** Adjacent spacing: bodies are r=0.6, so 1.35 keeps a 0.15u surface gap. */
const ADJ = 1.35;
/** A robust melee bruiser used as the punching bag. */
const DUMMY = "godie-hart" as ChampionId;
/** Ticks allowed for the first swing to reach its damage point. */
const BASIC_WINDOW = 40;

/**
 * 神奇寶貝兒 - 皮卡丘. Chosen as the witness because it is the least arguable
 * case in the whole roster: a Pokémon firing lightning, on the live whitelist,
 * whose WC3 base (Ofar / Far Seer) throws a FarseerMissile — and which, before
 * this landed, drew a bow every 2.5 seconds.
 */
const MAGE_WITNESS = "godie-ofar";

const weaponSet = new Set<string>(WEAPON_TAGS);

interface Doc {
  id: string;
  name: string;
  attackType: "melee" | "ranged";
  tags: string[];
}

let ranged: Doc[] = [];
let whitelist: Set<string> | null = null;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
  for (const def of Champions.all()) {
    if (def.attackType === "ranged") {
      ranged.push({ id: def.id, name: def.name, attackType: def.attackType, tags: def.tags });
    }
  }
  ranged = ranged.sort((a, b) => a.id.localeCompare(b.id));
  // The curation whitelist is live operator state and `.gitignore`d, so it is
  // absent in a fresh checkout / CI. Its only use here is to LABEL the report;
  // nothing is asserted on it, so absence degrades the log, never the guard.
  if (existsSync(WHITELIST)) {
    whitelist = new Set((JSON.parse(readFileSync(WHITELIST, "utf8")).champions as string[]) ?? []);
  }
}, 60_000);

function spawn(world: SimWorld, championId: string, team: number, dx: number, seat: number): EntityId {
  return spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x: P.x + dx, z: P.z },
    zone: 0,
  });
}

/** Swing `championId` at an adjacent dummy and return the emitted weaponClass. */
function observedWeaponClass(championId: string): string | undefined {
  const world = new SimWorld(SKELETON_ARENA, 9001);
  const caster = spawn(world, championId, 0, 0, 0);
  const foe = spawn(world, DUMMY as unknown as string, 1, ADJ, 1);
  world.step(NO_INTENTS);
  const cpos = { ...world.transform.get(caster)!.pos };
  const fpos = { ...world.transform.get(foe)!.pos };
  for (let i = 0; i < BASIC_WINDOW; i++) {
    world.nav.get(caster)!.attackTarget = foe;
    world.transform.get(caster)!.pos = { ...cpos };
    world.transform.get(foe)!.pos = { ...fpos };
    world.health.get(foe)!.hp = world.health.get(foe)!.maxHp; // keep it alive
    world.step(NO_INTENTS);
    for (const e of world.events) {
      if (e.type === "basicAttack" && (e.data as { source?: number }).source === caster) {
        return (e.data as { weaponClass?: string }).weaponClass;
      }
    }
  }
  return undefined;
}

describe("weapon class coverage (recipe S8: a total function whose default is wrong)", () => {
  it("prints the per-class census — this is the owner-facing report", () => {
    cover("juice-sfx-key");
    const byClass = new Map<string, Doc[]>();
    for (const d of ranged) {
      const cls = weaponClassOf(d as never, "ranged");
      byClass.set(cls, [...(byClass.get(cls) ?? []), d]);
    }
    const lines = [...byClass.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([cls, docs]) => {
        const wl = whitelist ? docs.filter((d) => whitelist!.has(d.id)).length : null;
        return `   ${cls.padEnd(10)} ${String(docs.length).padStart(3)} ranged champions${
          wl === null ? "" : `  (${wl} on the live whitelist)`
        }\n      ${docs.map((d) => d.id).join(", ")}`;
      });
    // eslint-disable-next-line no-console
    console.log(`\n  RANGED WEAPON CLASSES — ${ranged.length} champions\n${lines.join("\n")}\n`);
    expect(ranged.length).toBeGreaterThan(0);
  });

  it("every ranged champion is TAGGED — none relies on the default", () => {
    cover("juice-sfx-key");
    const untagged = ranged
      .filter((d) => !d.tags.some((t) => weaponSet.has(t.toLowerCase())))
      .map((d) => `${d.id} (${d.name})`);
    expect(
      untagged,
      [
        "",
        `${untagged.length} ranged champion doc(s) carry no weapon tag, so their attack`,
        "voice is decided by weaponClassOf's fallback rather than by anyone.",
        "",
        "Do NOT fix this by widening the default. Look the champion up in the WC3",
        "Missileart table (see this file's header) and add the tag it earns:",
        `  ${WEAPON_TAGS.join(" | ")}`,
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("no champion carries two weapon tags (the priority order would silently pick)", () => {
    cover("juice-sfx-key");
    const doubled: string[] = [];
    for (const d of Champions.all()) {
      const hit = d.tags.map((t) => t.toLowerCase()).filter((t) => weaponSet.has(t));
      if (hit.length > 1) doubled.push(`${d.id}: ${hit.join(" + ")}`);
    }
    expect(doubled, "ambiguous weapon tags — WEAPON_TAGS order would decide, not the author").toEqual(
      [],
    );
  });

  /**
   * The beat itself. Not "the function returns magic" — the SimWorld a player is
   * actually in emits it, on a real champion, through the real spawn + registry
   * path, on the event the client's per-frame drain reads.
   */
  it("a real mage's real swing puts weaponClass 'magic' on the wire", () => {
    cover("juice-sfx-key");
    const observed = observedWeaponClass(MAGE_WITNESS);
    expect(observed, `${MAGE_WITNESS} never emitted a basicAttack within the window`).toBeDefined();
    expect(observed, `${MAGE_WITNESS} 皮卡丘 is still swinging a ${observed}`).toBe("magic");
  });

  /** The control: an archer must still be an archer, or the fix moved the bug. */
  it("…and an actual archer still draws a bow", () => {
    cover("juice-sfx-key");
    const archer = ranged.find((d) => d.tags.map((t) => t.toLowerCase()).includes("bow"));
    expect(archer, "no bow-tagged champion left in the roster").toBeDefined();
    expect(observedWeaponClass(archer!.id)).toBe("bow");
  });
});
