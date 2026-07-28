/**
 * CURATION DATA vs THE CONTENT MODEL — the S7 guard.
 *
 * ---------------------------------------------------------------------------
 * THE SHAPE OF BUG THIS EXISTS TO CATCH (and it is a SHAPE, not an incident)
 * ---------------------------------------------------------------------------
 * The curation whitelist is a FLAT SET OF IDS. Every surface that consumes it
 * intersects that set with a CONTENT-MODEL PREDICATE which lives in code and
 * changes independently:
 *
 *   shop shelf      whitelist ∩ {craftRole === "final" ∧ itemHasEffect} ∪ services
 *   round card      whitelist ∩ loot-table(<weaponLootTable> of arena-rules)
 *   傳說寶玉 pool    whitelist ∩ loot-table(legendary-weapons) ∩ orbEligible
 *   services        whitelist ∩ SHOP_SERVICE_ITEM_IDS
 *   EX hotkey       whitelist(abilities) ∩ champion.exAbility
 *
 * When the model moves under a whitelist that was written against the OLD
 * model, an intersection collapses to EMPTY (or to one member, which for a
 * 3-choose-1 is the same thing) and NOTHING REPORTS IT. Every surface degrades
 * politely: the shop just shows fewer tiles, the round-2 card just grants
 * nothing, `buyLegendaryOrb` just refuses. No error, no crash, no log anyone
 * reads. That is exactly how a live whitelist ended up with 30 items of which
 * 7 were buyable, 0 of 13 quest rewards, an orb pool of 1, and both service
 * pseudo-items missing — with a green build the whole time.
 *
 * So this file NEVER hard-codes what is currently wrong. Both sides of every
 * comparison are recomputed at test time from the shipped source of truth:
 *   - the surfaces come from `resolveArenaRules()` reading content/config/
 *     arena-rules.json (add a round that rolls a new loot table → covered),
 *   - the services from `SHOP_SERVICE_ITEM_IDS` (add a third → covered),
 *   - the shelf from the client's real `shopCatalogue`, cross-checked against
 *     the sim's real `buyItem` (change either rule → covered),
 *   - the orb pool from the sim's real `legendaryPool` (change
 *     `ORB_EXCLUDED_ROLES` → covered),
 *   - the item/champion/ability facts from the loaded content tree.
 * The only things written down here are THRESHOLDS, each with its reason.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS READS — and what that does NOT prove
 * ---------------------------------------------------------------------------
 * CI cannot reach the live platform (`GET /api/v1/curation/whitelist`), and
 * the on-disk operator document `data/curation/whitelist.json` is GITIGNORED
 * runtime state — neither exists on a build agent. So the audit runs against
 * every whitelist source that IS available, in this order:
 *
 *   1. THE STARTER SET — apps/platform/internal/curation/starter.go, parsed
 *      out of the Go source. ALWAYS audited, including in CI. This is the
 *      document every fresh install and every `make seed-demo` applies, so
 *      auditing it proves: *the bundle we ship still fits the content model.*
 *   2. `GGD_WHITELIST_FILE=<path>` — an exported whitelist doc (the ops
 *      migration bundle, task #179; or `curl …/curation/whitelist > f.json`).
 *      Audited when set. THIS is how you point the audit at the deployed host.
 *   3. `data/curation/whitelist.json` — this machine's operator state.
 *      Audited when the file exists.
 *
 * WHAT A GREEN RUN IN CI PROVES: the shipped starter bundle is consistent with
 * the current content model.
 * WHAT IT DOES **NOT** PROVE: anything at all about ggd.adms.ai, or about any
 * box whose operator has curated by hand. `ApplyStarterSet` is UNION-only and
 * an operator may disable anything afterwards, so a perfectly healthy starter
 * set and a dead live shop are entirely compatible. Auditing the deployed host
 * is source 2, and it is a deliberate act:
 *
 *     curl -s https://ggd.adms.ai/api/v1/curation/whitelist -o /tmp/wl.json \
 *       && GGD_WHITELIST_FILE=/tmp/wl.json pnpm --filter @ggd/game-server test \
 *          -- src/curation/curationVsContentModel.test.ts
 *
 * When source 3 is absent the test does NOT silently skip — a skip is the same
 * politeness that caused the bug. It runs, its NAME says the operator document
 * was not present, and it prints the command above.
 *
 * COST: ~1 content-tree load (shared with the other curation tests' pattern)
 * plus a few hundred set lookups and ≤ ~35 `buyItem` calls against one spawned
 * champion. Sub-second after content load; safe to run every time.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions, Items, LootTables } from "@ggd/shared/sim/content/registry";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { buyItem, INVENTORY_SLOTS } from "@ggd/shared/sim/economy/shop";
import { legendaryPool } from "@ggd/shared/sim/economy/legendaryOrb";
import {
  ITEM_TIER_PRICE,
  LEGENDARY_POOL_TABLE,
  SHOP_SERVICE_ITEM_IDS,
  isShopService,
  itemHasEffect,
  shopServicePrice,
} from "@ggd/shared/sim/economy/itemTiers";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type ItemId } from "@ggd/shared/ids";

// The client is the surface a PLAYER sees, so the shelf rule is read from the
// client's own `shopCatalogue` rather than restated here. A restatement would
// pass forever while the real shelf rotted — which is the whole failure mode.
import { shopCatalogue, whitelistFromDoc } from "../../../client/src/ui/panels/champSelectFilter";
import { resolveArenaRules, type ArenaRules } from "../match/arenaRules";
import { Whitelist, type WhitelistDoc } from "./whitelist";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../..");
const CONTENT_DIR = join(REPO, "content");
const STARTER_GO = join(REPO, "apps/platform/internal/curation/starter.go");
const OPERATOR_DOC = join(REPO, "data/curation/whitelist.json");

/** How to audit a whitelist this repo cannot see. Printed, not just commented. */
const AUDIT_THE_LIVE_HOST =
  "curl -s <host>/api/v1/curation/whitelist -o /tmp/wl.json && " +
  "GGD_WHITELIST_FILE=/tmp/wl.json pnpm --filter @ggd/game-server test -- " +
  "src/curation/curationVsContentModel.test.ts";

// ---------------------------------------------------------------------------
// EXEMPTIONS — explicit, commented, and EMPTY today.
//
// A finding may be suppressed ONLY by naming its surface key here with a real
// reason and the task that owns it. There is no wildcard, no "skip if", no
// env-var escape: a silent skip is the exact pathology this file guards
// against. An exemption that no longer fires is itself a failure (see
// "no stale exemptions" below), so these cannot rot into permanent noise.
//
// Surface keys are printed verbatim in every failure message, e.g.
//   "shop.tier-coverage", "loot.quest-rewards.coverage", "orb.pool-size",
//   "service.stat-attunement", "champion.godie-e001.ex-ability".
// ---------------------------------------------------------------------------
interface Exemption {
  /** Why this surface is allowed to violate its invariant, in full sentences. */
  readonly reason: string;
  /** The task that will remove it. An exemption with no owner is a bug. */
  readonly owner: string;
}
const EXEMPTIONS: Readonly<Record<string, Exemption>> = {
  // Example of the required shape (keep commented — a live entry must be real):
  // "loot.quest-rewards.coverage": {
  //   reason: "godie-i0xx 四魂之玉的碎片-3 is deliberately unlisted; see gate D4.",
  //   owner: "#70",
  // },
  "shop.tier-coverage": {
    reason:
      "#261 暫時下架: the owner took every weapon off the shelf — 「除了能力屬性強化、及傳說寶玉外，" +
      "其他武器道具先全部暫時下架無法選擇」 — so BOTH price tiers are legitimately absent from the " +
      "shelf right now. The curation data is UNCHANGED and still lists them; the shelf is closed by " +
      "economy/shopShelf.ts (WEAPON_SHELF_OPEN=false), a single reversible boolean. Flip it back and " +
      "this exemption must be deleted, which is what the stale-exemption guard below enforces.",
    owner: "#261",
  },
  "shop.inventory-fill": {
    reason:
      "#261 暫時下架, same cause: with the shelf closed the buyable-weapon count is 0 by design. The " +
      "6 inventory slots are still fillable — through the 3-choose-1 cards and the 傳說寶玉, which " +
      "the flag deliberately does NOT gate (「隨機三選一仍然可以隨機到」, pinned by shopShelf.test.ts).",
    owner: "#261",
  },
};

// ---------------------------------------------------------------------------
// findings
// ---------------------------------------------------------------------------

interface Finding {
  /** Stable surface key — also the exemption key. */
  readonly key: string;
  /** What broke, where, and the legitimate ways out. Must stand alone. */
  readonly message: string;
}

/** Pull one `name = []string{ … }` block's quoted ids out of the Go source. */
function goList(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`starter.go no longer declares ${name} — update this test`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  if (close < 0) throw new Error(`could not find the end of ${name} in starter.go`);
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

/** The starter bundle as a whitelist doc — the same union `StarterSet()` builds. */
function starterDoc(): WhitelistDoc {
  const src = readFileSync(STARTER_GO, "utf-8");
  const champions = goList(src, "starterChampions");
  const items = [
    ...goList(src, "starterShopItems"),
    ...goList(src, "starterServiceItems"),
    ...goList(src, "starterLegendaryItems"),
    ...goList(src, "starterDraftItems"),
  ];
  // buildStarterAbilities(): every champion x {q,w,e,r,ex}. Mirrored rather
  // than parsed because the Go side computes it too.
  const abilities = champions.flatMap((c) => ["q", "w", "e", "r", "ex"].map((s) => `${c}.${s}`));
  return { version: 1, champions, items, abilities };
}

function readDoc(path: string): WhitelistDoc {
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<WhitelistDoc>;
  return {
    version: raw.version ?? 1,
    champions: raw.champions ?? [],
    items: raw.items ?? [],
    abilities: raw.abilities ?? [],
  };
}

// ---------------------------------------------------------------------------
// the audit
// ---------------------------------------------------------------------------

let rules: ArenaRules;
let world: SimWorld;
let probe: EntityId;

/** Every loot table the SHIPPED rules actually roll a weapon card from. */
function scheduledLootTables(r: ArenaRules): string[] {
  const ids = new Set<string>();
  for (const grant of r.rounds.values()) if (grant.weaponLootTable) ids.add(grant.weaponLootTable);
  // `overflow` carries no weaponLootTable in the schema today; read it anyway so
  // adding one there cannot slip past this audit.
  const overflow = r.overflow as { weaponLootTable?: string } | null;
  if (overflow?.weaponLootTable) ids.add(overflow.weaponLootTable);
  if (r.gacha) ids.add(r.gacha.lootTable);
  return [...ids].sort();
}

/** Reset the probe champion so one `buyItem` cannot influence the next. */
function resetProbe(): void {
  const champ = world.champion.get(probe)!;
  champ.gold = 10_000_000;
  champ.items = new Array(INVENTORY_SLOTS).fill(null);
  champ.pendingOrbSlots = 0;
  champ.statStacks = 0;
  champ.undoStack.length = 0;
}

/**
 * The whole audit, for ONE whitelist document. Returns findings rather than
 * asserting, so a single run reports every broken surface at once instead of
 * dying on the first — an operator fixing curation wants the full list.
 */
function auditWhitelist(doc: WhitelistDoc): Finding[] {
  const out: Finding[] = [];
  const add = (key: string, message: string): void => void out.push({ key, message });

  const wl = new Whitelist(doc, false);
  const clientWl = whitelistFromDoc(doc);
  const itemIds = new Set(doc.items);

  // ---- SHOP SHELF -------------------------------------------------------
  // The catalogue the player actually sees, computed by the client's own rule.
  const catalogue = [...Items.ids()].map((id) => Items.get(id));
  const shelf = shopCatalogue(catalogue as never[], clientWl) as unknown as {
    id: string;
    cost: number;
    craftRole?: string;
    modifiers?: readonly unknown[];
    passive?: readonly unknown[];
  }[];
  const weapons = shelf.filter((i) => !isShopService(i.id));

  // (a) THE LISTING RULE ITSELF (owner rule 1, task #70). Structural: if
  //     `shopCatalogue` is ever loosened back toward the old `cost > 0`
  //     derivation, components and recipe books reappear on the shelf and this
  //     goes red immediately.
  for (const i of weapons) {
    if (i.craftRole === "final" && itemHasEffect(i)) continue;
    add(
      "shop.listing-rule",
      `${i.id} (${(Items.get(i.id as ItemId) as { name: string }).name}) is on the SHOP SHELF but is ` +
        `craftRole=${i.craftRole ?? "none"} / effect=${itemHasEffect(i)}. The shelf may only list a ` +
        `craftRole="final" item that carries modifiers or a passive, or a registered shop service. ` +
        `RESOLVE BY: (1) fixing the item's craftRole/payload in content/items/${i.id}.json, ` +
        `(2) removing it from the whitelist, or (3) if shopCatalogue's rule genuinely changed, ` +
        `updating apps/client/src/ui/panels/champSelectFilter.ts AND this expectation together.`,
    );
  }

  // (b) THE CLIENT AND THE SIM MUST AGREE. A listing the sim refuses is a dead
  //     button that eats a click and says nothing useful. Only CONTENT-MODEL
  //     refusals count — "no-gold"/"no-slot" are runtime state, not curation.
  const MODEL_REFUSALS = new Set(["unknown-item", "not-purchasable", "no-effect"]);
  for (const i of shelf) {
    resetProbe();
    const result = buyItem(world, probe, i.id as ItemId);
    if (!MODEL_REFUSALS.has(result)) continue;
    add(
      "shop.sim-agrees",
      `${i.id} is LISTED on the shelf but packages/shared/src/sim/economy/shop.ts refuses to sell it ` +
        `(buyItem → "${result}"). The client's shopCatalogue and the sim's buyItem disagree about the ` +
        `same item, so the player sees a tile that cannot be bought. RESOLVE BY: fixing the item doc, ` +
        `un-whitelisting it, or reconciling the two rules — never by loosening one of them alone.`,
    );
  }

  // (c) VIABILITY, threshold 1 — every price the economy defines must be
  //     BUYABLE. ITEM_TIER_PRICE is the source: a shelf with nothing at 300g
  //     means the 600g opening purchase does not exist, and nobody would
  //     notice because the shop still renders.
  for (const [tier, price] of Object.entries(ITEM_TIER_PRICE)) {
    if (weapons.some((i) => i.cost === price)) continue;
    add(
      "shop.tier-coverage",
      `the shop shelf offers NOTHING at the ${tier} price (${price}g), though ITEM_TIER_PRICE in ` +
        `packages/shared/src/sim/economy/itemTiers.ts defines it as a real tier. A missing tier is a ` +
        `dead rung of the economy — with no 300g item there is no opening purchase on the 600g starting ` +
        `purse. RESOLVE BY: whitelisting ≥1 craftRole="final" item priced ${price}g (add it to ` +
        `starterShopItems in apps/platform/internal/curation/starter.go, or enable it in the admin ` +
        `console 內容白名單), or — if the tier was retired — removing it from ITEM_TIER_PRICE.`,
    );
  }

  // (d) VIABILITY, threshold 2 — a player must be able to FILL their
  //     inventory from the shop. INVENTORY_SLOTS is the source, and the
  //     no-duplicates rule means N slots need N distinct buyable weapons.
  if (weapons.length < INVENTORY_SLOTS) {
    add(
      "shop.inventory-fill",
      `the shop shelf lists only ${weapons.length} buyable weapon(s) but a champion has ` +
        `${INVENTORY_SLOTS} inventory slots and cannot buy duplicates — the shelf physically cannot ` +
        `equip a player. This is what a whitelist written against an older content model looks like: ` +
        `it still renders, it is just mostly empty. RESOLVE BY: enabling more craftRole="final" items ` +
        `(admin console 內容白名單, or ⭐ 啟用示範組合 / \`make seed-demo\` to union in the starter set).`,
    );
  }

  // ---- ROUND CARDS ------------------------------------------------------
  // MatchController ROLLS FIRST and filters to the whitelist AFTER (see
  // MatchController.ts, the `grant.weaponLootTable` branch). So partial
  // whitelisting is not "fewer choices" — it is a chance of the card granting
  // NOTHING, and its only complaint is a console.warn. The only whitelist that
  // makes a scheduled card reliable is one that covers the table.
  for (const tableId of scheduledLootTables(rules)) {
    const table = LootTables.tryGet(tableId);
    if (!table) {
      add(
        "loot." + tableId + ".exists",
        `content/config/arena-rules.json schedules a weapon card from loot table "${tableId}", but no ` +
          `such table is loaded from content/loot-tables/. Every seat that reaches that round gets ` +
          `nothing, silently. RESOLVE BY: adding content/loot-tables/${tableId}.json, or removing the ` +
          `weaponLootTable from that round in content/config/arena-rules.json.`,
      );
      continue;
    }
    const entries = table.entries.map((e) => e.itemId as string);
    const missing = entries.filter((id) => !itemIds.has(id));
    if (missing.length === 0) continue;
    add(
      `loot.${tableId}.coverage`,
      `${missing.length} of ${entries.length} entries in loot table "${tableId}" are NOT whitelisted ` +
        `(${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", …" : ""}). That table feeds a ` +
        `scheduled 3-choose-1 card, and MatchController rolls from the WHOLE table before filtering to ` +
        `the whitelist — so every un-whitelisted entry is a chance the card grants the player nothing ` +
        `at all, reported only as a console.warn. RESOLVE BY: (1) whitelisting them — add to the ` +
        `matching list in apps/platform/internal/curation/starter.go and re-apply, or enable them in ` +
        `the admin console 內容白名單; (2) removing them from content/loot-tables/${tableId}.json if ` +
        `they should not be offered; or (3) adding "loot.${tableId}.coverage" to EXEMPTIONS in this ` +
        `file with a reason and an owning task.`,
    );
  }

  // ---- 傳說寶玉 POOL ------------------------------------------------------
  // The orb filters BEFORE the roll, so a partial whitelist here is safe — but
  // a pool of 0 makes a 2400g listing that always refuses, and a pool of 1
  // makes a "3-choose-1" that is not a choice. Computed by the sim's own
  // `legendaryPool`, so a change to ORB_EXCLUDED_ROLES is picked up for free.
  world.itemEligible = (itemId) => wl.allowsItem(itemId);
  resetProbe();
  const pool = legendaryPool(world, probe);
  world.itemEligible = null;
  if (pool.length < 2) {
    const table = LootTables.tryGet(LEGENDARY_POOL_TABLE);
    add(
      "orb.pool-size",
      `the 傳說寶玉 (legendary-orb) pool has ${pool.length} eligible item(s) — a 3-choose-1 needs at ` +
        `least 2 to be a choice, and 0 makes the 2400g purchase refuse outright ("empty-pool"). The ` +
        `pool is content/loot-tables/${LEGENDARY_POOL_TABLE}.json ` +
        `(${table?.entries.length ?? 0} entries) ∩ whitelist ∩ orbEligible, where orbEligible ` +
        `(packages/shared/src/sim/economy/legendaryOrb.ts) drops craftRole component/token/service and ` +
        `anything with no modifiers or passive. NOTE the middle term: whitelisting a COMPONENT does ` +
        `not grow this pool. RESOLVE BY: whitelisting more NON-component entries of that table, ` +
        `changing what the table holds, or — if the orb is being retired — deleting the listing from ` +
        `SHOP_SERVICE_ITEM_IDS rather than leaving it dead.`,
    );
  }

  // ---- SHOP SERVICES ----------------------------------------------------
  // Derived from SHOP_SERVICE_ITEM_IDS, so a third service is audited the day
  // it is added. Each service is a whole MECHANIC with no substitute: without
  // stat-attunement the 20-stack capstone is unreachable by any path.
  for (const id of SHOP_SERVICE_ITEM_IDS) {
    const def = Items.tryGet(id);
    if (!def) {
      add(
        `service.${id}`,
        `shop service "${id}" is dispatched by packages/shared/src/sim/economy/shop.ts but has no ` +
          `content/items/${id}.json document, so it can never be listed. RESOLVE BY: adding the item ` +
          `doc, or removing the id from SHOP_SERVICE_ITEM_IDS in economy/itemTiers.ts.`,
      );
      continue;
    }
    if (!itemIds.has(id as string)) {
      add(
        `service.${id}`,
        `shop service "${id}" (${def.name}, ${shopServicePrice(id)}g) is NOT whitelisted, so the shop ` +
          `never lists it and the mechanic behind it is unreachable — there is no other route to it ` +
          `(stat-attunement is the ONLY way to accumulate the 20 stacks the capstone needs; ` +
          `legendary-orb is one of the only two routes to a legendary). Nothing reports this: the ` +
          `shelf simply renders without the tile. RESOLVE BY: whitelisting it (starterServiceItems in ` +
          `apps/platform/internal/curation/starter.go, or the admin console 內容白名單), or — if the ` +
          `service is being retired — removing it from SHOP_SERVICE_ITEM_IDS so the sim stops ` +
          `dispatching an id no surface can reach.`,
      );
    }
  }

  // ---- CHAMPIONS + THE EX HOTKEY ----------------------------------------
  // Same shape, non-item half. A whitelisted champion id that no longer exists
  // in content silently shrinks champ-select; a champion whose exAbility is not
  // whitelisted ships a dead F key (MatchController.learnEx gates on it).
  for (const id of doc.champions) {
    const def = Champions.tryGet(id as ChampionId);
    if (!def) {
      add(
        `champion.${id}.exists`,
        `whitelisted champion "${id}" has no content/champions/${id}.json document — champ-select ` +
          `silently offers one fewer champion. RESOLVE BY: restoring the doc, or removing the id from ` +
          `the whitelist (a re-import that renames ids must migrate the whitelist with it).`,
      );
      continue;
    }
    const ex = (def as { exAbility?: string }).exAbility;
    if (ex && !doc.abilities.includes(ex)) {
      add(
        `champion.${id}.ex-ability`,
        `champion "${id}" (${def.name}) is whitelisted but its EX ability "${ex}" is NOT in the ` +
          `whitelist's ability list. The EX is the ONLY ability the whitelist actually gates ` +
          `(MatchController.learnEx), so this champion ships a hotkey that does nothing from the ` +
          `unlock round on, with no message anywhere. RESOLVE BY: whitelisting "${ex}" (the Go bundle ` +
          `derives abilities from the champion list via buildStarterAbilities — if you hand-edited a ` +
          `whitelist, add it there too), or un-whitelisting the champion.`,
      );
    }
  }

  return out;
}

/**
 * Every surface key that fired in ANY audited source this run. An exemption is
 * only justified while the thing it excuses is still happening somewhere, and
 * the sources differ per machine — so staleness is judged once, at the end,
 * across all of them (see "exemption hygiene" below).
 */
const firedAnywhere = new Set<string>();

/** Apply EXEMPTIONS and turn what is left into one actionable failure. */
function assertClean(sourceLabel: string, findings: Finding[]): void {
  for (const f of findings) firedAnywhere.add(f.key);
  const live = findings.filter((f) => !(f.key in EXEMPTIONS));
  if (live.length === 0) return;
  const body = live
    .map((f, n) => `  ${n + 1}. [${f.key}]\n     ${f.message.replace(/\s+/g, " ")}`)
    .join("\n\n");
  throw new Error(
    `CURATION DATA NO LONGER FITS THE CONTENT MODEL — ${live.length} broken surface(s) in ` +
      `${sourceLabel}.\n\nEach of these is a feature that silently does not happen in a real match: ` +
      `no error, no crash, the player just never sees it.\n\n${body}\n\n` +
      `Every finding above lists its own resolutions. The third option is always the same: if the ` +
      `violation is DELIBERATE, add its bracketed key to EXEMPTIONS in ` +
      `apps/game-server/src/curation/curationVsContentModel.test.ts with a written reason and an ` +
      `owning task. Do not delete the assertion, and do not skip the test.`,
  );
}

// ---------------------------------------------------------------------------

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
  rules = resolveArenaRules();
  world = new SimWorld(SKELETON_ARENA, 1);
  const centre = SKELETON_ARENA.zones[0]!.center;
  // Any real champion will do — the probe exists to give `buyItem` and
  // `legendaryPool` a subject. Take the first whitelisted one so the spawn
  // itself proves the roster half of the bundle loads.
  const first = starterDoc().champions[0]!;
  probe = spawnChampion(world, {
    championId: first as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: centre.x, z: centre.z },
    zone: 0,
  });
});

describe("curation data vs the content model — the STARTER SET (audited in CI)", () => {
  it("every surface the whitelist feeds is still viable against today's content", () => {
    assertClean("apps/platform/internal/curation/starter.go", auditWhitelist(starterDoc()));
  });
});

// ---------------------------------------------------------------------------
// THE ECONOMY half of the same bundle.
//
// `starterChampions` says who is PICKABLE; content/config/store.json's
// `championPrices` says who must be PAID FOR. They are one set described twice,
// and until task #249 nothing said so — so when ten roster slots were swapped
// from the 變身 alternate to the base unit, store.json kept the old ten and
// every gate stayed green while:
//
//   • the ten swapped-IN bases had no price entry at all, which BOTH sides read
//     as free (client `lockStateOf`: `price === undefined` → "free";
//     server `wallet.OwnsChampion`: `!priced` → true), so they skipped the
//     300-crystal unlock and the crystal sink shrank from 38 champions to 31;
//   • the ten swapped-OUT alternates kept their prices, so `FreeChampions()`
//     went on seeding godie-h020 / godie-o00x / godie-u01u into every NEW
//     account and the lobby store rendered a row per orphan — all unpickable.
//
// Mirrored here as well as in Go (TestStarterRosterMatchesChampionPrices)
// because the two halves are read by two different stacks: Go serves
// /store/catalog, this repo's TS client turns it into the champ-select lock
// state. A guard on one side only leaves the other free to drift.
// ---------------------------------------------------------------------------
const STORE_JSON = join(CONTENT_DIR, "config/store.json");
/** Mirrors `wallet.CrystalUnlockCost` (Go) and `CRYSTAL_UNLOCK_COST` (client). */
const CRYSTAL_UNLOCK_COST = 300;

describe("the crystal economy vs the first open roster", () => {
  it("championPrices and starterChampions are the SAME SET, in both directions", () => {
    const roster = starterDoc().champions;
    const prices = (JSON.parse(readFileSync(STORE_JSON, "utf-8")) as { championPrices: Record<string, number> })
      .championPrices;
    const priced = new Set(Object.keys(prices));
    const rostered = new Set(roster);

    const unpriced = roster.filter((id) => !priced.has(id)).sort();
    expect(
      unpriced,
      `${unpriced.length} first-open-roster champion(s) have NO championPrices entry in ` +
        `content/config/store.json, so both the client (lockStateOf → "free") and the server ` +
        `(OwnsChampion → true) hand them out for nothing: ${unpriced.join(", ")}. Add a price for ` +
        `each, or drop them from starterChampions.`,
    ).toEqual([]);

    const orphaned = [...priced].filter((id) => !rostered.has(id)).sort();
    expect(
      orphaned,
      `${orphaned.length} championPrices entr(ies) in content/config/store.json name a champion ` +
        `that is not on the first open roster: ${orphaned.map((id) => `${id}=${prices[id]}`).join(", ")}. ` +
        `A 0-price orphan is seeded into every new account by Catalog.FreeChampions() and a priced ` +
        `one draws a dead lobby-store row — for an id no player can select. Remove each, or add it ` +
        `to starterChampions in apps/platform/internal/curation/starter.go on purpose.`,
    ).toEqual([]);

    // One flat unlock cost. A third value would print one number on the
    // champ-select unlock button and charge another.
    const offPrice = roster.filter((id) => prices[id] !== 0 && prices[id] !== CRYSTAL_UNLOCK_COST).sort();
    expect(
      offPrice,
      `every roster champion must cost 0 or exactly ${CRYSTAL_UNLOCK_COST} crystals; these do not: ` +
        offPrice.map((id) => `${id}=${prices[id]}`).join(", "),
    ).toEqual([]);
  });
});

const envDoc = process.env.GGD_WHITELIST_FILE;
describe("curation data vs the content model — an EXPORTED whitelist (GGD_WHITELIST_FILE)", () => {
  it(
    envDoc
      ? `every surface is still viable against ${envDoc}`
      : "GGD_WHITELIST_FILE is unset — no deployed/exported whitelist was audited by this run",
    () => {
      if (!envDoc) {
        // NOT a skip. The run is on record as having proved nothing about any
        // deployed host, and it says how to change that.
        console.warn(`[curation audit] no exported whitelist audited. To audit a live host:\n  ${AUDIT_THE_LIVE_HOST}`);
        expect(existsSync(STARTER_GO)).toBe(true);
        return;
      }
      expect(existsSync(envDoc), `GGD_WHITELIST_FILE=${envDoc} does not exist`).toBe(true);
      assertClean(envDoc, auditWhitelist(readDoc(envDoc)));
    },
  );
});

const hasOperatorDoc = existsSync(OPERATOR_DOC);
describe("curation data vs the content model — THIS MACHINE's operator state", () => {
  it(
    hasOperatorDoc
      ? `every surface is still viable against ${relative(REPO, OPERATOR_DOC)}`
      : `${relative(REPO, OPERATOR_DOC)} is ABSENT (gitignored runtime state) — no operator whitelist was audited`,
    () => {
      if (!hasOperatorDoc) {
        console.warn(
          `[curation audit] ${relative(REPO, OPERATOR_DOC)} not present (expected on a CI agent — ` +
            `data/ is gitignored). NOTHING here proves the deployed whitelist is healthy. To audit one:\n  ` +
            AUDIT_THE_LIVE_HOST,
        );
        return;
      }
      assertClean(relative(REPO, OPERATOR_DOC), auditWhitelist(readDoc(OPERATOR_DOC)));
    },
  );
});

// Runs LAST (vitest keeps declaration order within a file), so it sees every
// source this machine audited. A stale exemption is the same silent rot in
// miniature: it guards nothing, and nobody notices it stopped.
describe("exemption hygiene", () => {
  it("every EXEMPTIONS entry still suppresses a real, currently-firing finding", () => {
    for (const [key, ex] of Object.entries(EXEMPTIONS)) {
      expect(
        firedAnywhere.has(key),
        `EXEMPTIONS["${key}"] suppressed nothing in this run — the violation it excused is gone (or ` +
          `the surface key was renamed). Delete the entry from ` +
          `apps/game-server/src/curation/curationVsContentModel.test.ts; the reason on file was: ` +
          `"${ex.reason}" (owner ${ex.owner}). NOTE: if this run audited only the starter set, an ` +
          `exemption written for an OPERATOR whitelist will look stale here — such an exemption does ` +
          `not belong in the repo. Fix the operator document instead.`,
      ).toBe(true);
    }
  });
});
