/**
 * `EffectVariant` 的一格 —— 分片自 `sim/effects/effect.ts`（#467 ②）。
 * ⚠️ 對 `../effect` 的 import **一律 `import type`**：型別在編譯後整段消失，
 *    所以「variant ↔ effect.ts」這個環在執行期**不存在**，⛔ 不是一個要靠
 *    載入順序活下來的循環。
 */
import type { EffectDef } from "../effect";

/**
 * leap (task #247) — the map's own parabolic jump, ported from the nine
 * `SetUnitFlyHeightBJ(-k*Pow(i-m,2)+A)` sites in war3map.j. A SEPARATE kind
 * from `dash` because it needs a different integrator: no per-tick collision
 * (terrain crossing IS the point), an absolute parametric position so the arc
 * cannot drift, a height channel, an integer tick budget and a deferred
 * effect payload. See sim/movement/leap.ts for the arc math and the
 * blocked-landing rule.
 */
export interface LeapVariant {
  kind: "leap";
  /** who flies: the caster (default), or each resolved target (thrown arcs) */
  applyTo?: "self" | "target";
  /** "toPoint" = the snapshotted cast point; "inPlace" = vertical, distance 0 */
  mode: "toPoint" | "inPlace";
  /** apex height in GGD units (JASS peak × 11/600) */
  apexHeight: number;
  /** flight time; converted to an INTEGER tick count exactly once, at takeoff */
  durationSec: number;
  /**
   * How far a THROWN body (`applyTo: "target"`) flies along the throw
   * direction (`throwDirection()` in sim/effects/leap.ts: caster facing, or
   * caster→victim under `grabMode`). Present ⇒ distance mode — the cast point
   * is the grab-circle centre, ⛔ not the landing point (GH#1050; 52-02 蹂躪編年史
   * j:51765, A0L6 j:50109, A0SQ j:29634 — the JASS family has no landing point).
   * Absent ⇒ the cast point is the landing point (`throwMode: "point"`, the
   * pre-2026-09-06 behaviour). GGD units; ignored for `applyTo: "self"` and
   * for `mode: "inPlace"`.
   */
  throwDistance?: number;
  /**
   * DRAG PHASE (52-02 蹂躪編年史「迅速將目標抓回」). When true the flyer is
   * yanked to the CASTER before the throw, so the arc runs
   * caster.pos → caster.pos + facing × throwDistance instead of starting
   * where the victim happened to be standing.
   *
   * That is what the JASS does: `Trig_Trample_Effect` pulls the victim 50
   * wc3 units per 0.05 s tick toward the caster until it is within 50
   * (war3map.j:51755-51763), and only THEN is the throw aimed —
   * `PolarProjectionBJ(casterLoc, 400.00, GetUnitFacing(caster))` at
   * j:51765-51767. Without this flag the landing point is off by the
   * original caster→victim distance, which on a 5.5-unit cast range is up
   * to 75 % of the throw itself.
   */
  dragToCaster?: boolean;
  /** landing burst radius, GGD units (0/absent = the flyer alone) */
  landRadius?: number;
  /** effects run on the LANDING tick, centred on the landing point */
  onLand?: EffectDef[];
}
