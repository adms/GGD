export interface TimeStopVariant {
  kind: "timeStop";
  radius: number;
  durationSec: number;
  maxQueuedHits?: number;
}
