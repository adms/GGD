import { describe, expect, it } from "vitest";
import {
  simTimelineEventSummary,
  simTimelineEventsAt,
  simTimelineMaxTick,
  type SimTimelineEvent,
} from "./simTimeline";

const events: SimTimelineEvent[] = [
  { type: "abilityCast", tick: 2, data: { abilityId: "probe.q", slot: "Q" } },
  { type: "damage", tick: 7, data: { amount: 120, origin: "ability:probe.q", nested: {} } },
  { type: "death", tick: 7, data: {} },
];

describe("real Sim event timeline model", () => {
  it("uses the actual final event tick as its ruler", () => {
    expect(simTimelineMaxTick(events)).toBe(7);
    expect(simTimelineMaxTick([])).toBe(0);
  });

  it("summarises only scalar fields that really exist on the event", () => {
    expect(simTimelineEventSummary(events[1]!)).toBe("amount=120 · origin=ability:probe.q");
    expect(simTimelineEventSummary(events[2]!)).toBe("無摘要欄位");
  });

  it("frame-step selects all events on that exact tick", () => {
    expect(simTimelineEventsAt(events, 7).map((event) => event.type)).toEqual(["damage", "death"]);
    expect(simTimelineEventsAt(events, 6)).toEqual([]);
  });
});
