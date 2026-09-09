import { afterEach, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import { AbilityBar } from "./components/AbilityBar";
import { TouchControls } from "./TouchControls";
import { announceCastAttempt } from "./castAnnounce";
import { resetCastFeedback } from "./castFeedback";
import { hudStore, resetHudStore, type SeatView } from "../net/RoomStore";

const id = "test-recast-ui" as ChampionId;
const ability: AbilityDef = { id: `${id}.e` as AbilityId, name: "百二十七式・葵花", slot: "E", castType: "skillshot", maxRank: 4,
  cooldown: [12], manaCost: [40], range: 3, effects: [{ kind: "damage", amount: { flat: 10 } }],
  recast: { cost: "first", minIntervalSec: .2, windowSec: 1.2, stages: [{ effects: [{ kind: "damage", amount: { flat: 20 } }] }] } };
function setup(stage: number) {
  Abilities.register(ability.id, ability);
  Champions.register(id, { id, name: "八神庵", role: "fighter", attackType: "melee", modelKey: "champ.test", baseStats: {}, growth: {},
    abilities: Object.fromEntries(["Q", "W", "E", "R"].map(slot => [slot, { ...ability, slot }])) } as unknown as ChampionDef);
  resetHudStore(); resetCastFeedback();
  const seat = { seatId: 0, championId: id, entityId: 7, alive: true, abilityRanks: [1, 1, 1, 1], cooldowns: [0, 0, 0, 0],
    unspentPoints: 0, recastStages: [0, 0, stage, 0, 0, 0], recastWindows: [0, 0, stage ? 30 : 0, 0, 0, 0], recastFreeMask: stage ? 4 : 0 } as unknown as SeatView;
  hudStore.setState({ connected: true, phase: "combat", localSeatId: 0, localMana: 0, localAlive: true, seats: [seat] });
}
afterEach(() => { resetHudStore(); resetCastFeedback(); });
it("desktop and tablet both show the pending input stage and remaining window", () => {
  setup(2);
  for (const Component of [AbilityBar, TouchControls]) {
    const html = renderToStaticMarkup(createElement(Component));
    expect(html.match(/data-recast-slot="E"/g)).toHaveLength(1);
    expect(html).toContain("第 2 段 · 1.0s");
  }
  setup(0);
  expect(renderToStaticMarkup(createElement(AbilityBar))).not.toContain("data-recast-slot");
});
it("zero mana can press a first-paid recast, and expiry restores the normal mana check", () => {
  setup(2); expect(announceCastAttempt("E")).toBeNull();
  setup(0); expect(announceCastAttempt("E")).not.toBeNull();
});
