export interface SimTimelineEvent {
  readonly type: string;
  readonly tick: number;
  readonly data: Readonly<Record<string, unknown>>;
}

const SUMMARY_KEYS = [
  "abilityId",
  "slot",
  "kind",
  "strikeIndex",
  "vfxId",
  "vfxKey",
  "amount",
  "reason",
  "origin",
] as const;

export function simTimelineMaxTick(events: readonly SimTimelineEvent[]): number {
  return events.reduce((max, event) => Math.max(max, Math.max(0, Math.trunc(event.tick))), 0);
}

/** A bounded, deterministic label made only from fields the real event carried. */
export function simTimelineEventSummary(event: SimTimelineEvent): string {
  const details = SUMMARY_KEYS.flatMap((key) => {
    const value = event.data[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return [`${key}=${String(value)}`];
    }
    return [];
  });
  return details.length > 0 ? details.join(" · ") : "無摘要欄位";
}

export function simTimelineEventsAt(
  events: readonly SimTimelineEvent[],
  tick: number,
): readonly SimTimelineEvent[] {
  const frame = Math.max(0, Math.trunc(tick));
  return events.filter((event) => event.tick === frame);
}
