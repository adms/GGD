/**
 * 能力屬性強化 三選一 — THE WIRING, end to end (#260).
 *
 * owner: 「購買能力屬性加成也是三選一 力/敏/智 隨機加點 0.1-2 顯示在卡片上面」.
 *
 * The sim half is guarded in packages/shared (attrDraft/statPath). What CANNOT
 * be seen from there — and is the classic way a feature ships and does nothing —
 * is the HOST half:
 *
 *   buy 375g ─(sim rolls, emits)→ MatchController registers an offer
 *           ─(snapshot)→ SeatState.offers ─(client pick)→ attrBonus moves
 *
 * Delete the `statUpgradeBought` branch in MatchController and every shared test
 * still passes while a real player pays 375 gold and sees NOTHING. So this file
 * drives a REAL match through the REAL command path (a HumanDriver mailbox, not
 * a direct `buyItem` call — the sim clears `world.events` at the top of each
 * step, so an event emitted outside a tick is gone before the drain sees it),
 * and asserts the card exists ON THE WIRE and that picking it changes stats.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ContentLoader, registerAll } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { MatchState } from "@ggd/shared/protocol/schema";
import { STAT_TICK_ITEM_ID } from "@ggd/shared/sim/economy/itemTiers";
import { ATTR_OFFER_TIER, parseAttrChoice } from "@ggd/shared/sim/economy/attrDraft";
import { ATTR_KEYS } from "@ggd/shared/sim/stats/attributes";
import { asSeatId, type EntityId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";
import { HumanDriver } from "../seat/HumanDriver";
import { projectSnapshot } from "../net/snapshot";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const FAST = { champSelectTicks: 3, intermissionTicks: 9999, combatMaxTicks: 60, resolutionTicks: 3 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

function shopper(): {
  ctl: MatchController;
  entity: EntityId;
  buy: () => void;
  pick: (offerId: string) => void;
} {
  const ctl = new MatchController("attr-offer", 31, allBots(), FAST, 3, DEFAULT_ARENA_RULES);
  let n = 0;
  while (ctl.phase.phase !== "intermission" && n++ < 500) ctl.tick();
  expect(ctl.phase.phase).toBe("intermission");
  const seat = ctl.seats.get(asSeatId(0))!;
  const driver = new HumanDriver();
  seat.setDriver(driver);
  ctl.tick();
  ctl.world.champion.get(seat.entityId as EntityId)!.gold = 100_000;
  let seq = 0;
  return {
    ctl,
    entity: seat.entityId as EntityId,
    buy: () => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "buyItem", itemId: STAT_TICK_ITEM_ID }] });
      ctl.tick();
    },
    pick: (offerId: string) => {
      driver.mailbox.push({ seq: ++seq, commands: [{ kind: "pickOffer", offerId }] });
      ctl.tick();
    },
  };
}

/** The seat's offers AS THE CLIENT RECEIVES THEM (through projectSnapshot). */
function wireOffers(ctl: MatchController): { offerId: string; tier: string; choices: string[] }[] {
  const state = new MatchState();
  projectSnapshot(ctl, state, new Map());
  const ss = state.seats.get("0");
  return [...(ss?.offers ?? [])].map((o) => ({
    offerId: o.offerId,
    tier: o.tier,
    choices: [...o.choices],
  }));
}

describe("buying 能力屬性強化 opens a card the player can actually see", () => {
  it("registers a 力/敏/智 三選一 and puts it ON THE WIRE", () => {
    cover("attr-offer-wire");
    const s = shopper();
    expect(wireOffers(s.ctl).filter((o) => o.tier === ATTR_OFFER_TIER)).toHaveLength(0);

    s.buy();

    const cards = wireOffers(s.ctl).filter((o) => o.tier === ATTR_OFFER_TIER);
    expect(cards, "375g bought no card — the host never registered the offer").toHaveLength(1);
    const parsed = cards[0]!.choices.map((c) => parseAttrChoice(c));
    expect(parsed.every((p) => p !== null)).toBe(true);
    // one card per attribute, and every magnitude printable on the card
    expect(parsed.map((p) => p!.attr)).toEqual([...ATTR_KEYS]);
    for (const p of parsed) expect(p!.label).toMatch(/^(力量|敏捷|智慧) \+\d\.\d$/);
  });

  it("picking a card moves 三圍 — and the SAME magnitude the card printed", () => {
    cover("attr-offer-wire");
    const s = shopper();
    s.buy();
    const card = wireOffers(s.ctl).find((o) => o.tier === ATTR_OFFER_TIER)!;
    const chosenIdx = 0; // 力量
    const shown = parseAttrChoice(card.choices[chosenIdx]!)!;

    const champ = s.ctl.world.champion.get(s.entity)!;
    expect(champ.attrBonus.str).toBe(0);
    s.pick(`${card.offerId}#${chosenIdx}`);

    expect(champ.attrBonus.str, "the pick granted nothing").toBeCloseTo(shown.value, 10);
    // …and the card is CONSUMED, so the focus scrim tears down
    expect(wireOffers(s.ctl).filter((o) => o.tier === ATTR_OFFER_TIER)).toHaveLength(0);
  });

  it("the three 三圍 totals ride the wire so the shop can print them", () => {
    cover("attr-offer-wire");
    const s = shopper();
    s.buy();
    const card = wireOffers(s.ctl).find((o) => o.tier === ATTR_OFFER_TIER)!;
    s.pick(`${card.offerId}#2`); // 智慧

    const state = new MatchState();
    projectSnapshot(s.ctl, state, new Map());
    const wire = [...(state.seats.get("0")?.attrBonus ?? [])];
    expect(wire).toHaveLength(ATTR_KEYS.length);
    // index 2 is 智慧 (ATTR_KEYS order) and it is the only one that moved
    expect(wire[2]).toBeGreaterThan(0);
    expect(wire[0]).toBe(0);
    expect(wire[1]).toBe(0);
    // float32 on the wire — equal to the sim's own value at display precision
    expect(wire[2]!).toBeCloseTo(s.ctl.world.champion.get(s.entity)!.attrBonus.int, 5);
  });

  it("two ticks in one shop open TWO cards — neither overwrites the other", () => {
    cover("attr-offer-wire");
    const s = shopper();
    s.buy();
    s.buy();
    const cards = wireOffers(s.ctl).filter((o) => o.tier === ATTR_OFFER_TIER);
    expect(cards.length, "the second 375g overwrote the first card").toBe(2);
    expect(new Set(cards.map((c) => c.offerId)).size).toBe(2);
  });
});
