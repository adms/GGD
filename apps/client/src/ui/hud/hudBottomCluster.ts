/**
 * hudBottomCluster — the BOTTOM-CENTRE COLUMN and the BOTTOM-RIGHT HERO GROUP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO REPORTS THIS ANSWERS (owner, 2026-07-30, after a live playtest)
 * ─────────────────────────────────────────────────────────────────────────────
 *   ①「自己的英雄角色 icon 在戰鬥場景 要顯示在右下角等級金錢區域」
 *   ②「HP&MP 條應該是跟技能格子緊鄰但不重疊」
 *
 * ② is the interesting one, because it is a RELATIONSHIP, not a coordinate, and
 * the shipped code expressed it as two unrelated coordinates:
 *
 *     ResourceBars.tsx   position:absolute; bottom: 128
 *     AbilityBar.tsx     position:absolute; bottom: 14
 *
 * MEASURED on the live client at 1280×800 (2026-07-30, this app's own font
 * stack, a 5-tile champion): the ability bar is 306×88 with its top edge at
 * y 699; the resource plate is 276×46 with its bottom edge at y 672. So the
 * two boxes are 27 px apart — the 「明顯的空隙」 in the report — and that number
 * is not written down anywhere. It is the residue of `128 - 14 - 88 - 46 + …`,
 * i.e. of four constants in two files that no test relates to each other. Change
 * the ability bar's padding and the gap moves; change the tile size and it moves
 * again; put the client on a viewport where the bar wraps and the two boxes
 * OVERLAP, silently, because nothing computes their distance.
 *
 * So the fix is not 「set 128 to 108」. It is: ONE container, ONE gap, and the
 * gap is a FIELD with bounds (`barsToAbilitiesGapPx`). Both rows are flex
 * children of {@link BottomCluster}; neither may carry a `bottom` of its own,
 * and `hudBottomCluster.test.ts` proves that by reading the RENDERED markup —
 * the components are free to have opinions about colour, not about position.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A HUD SLOT (hudLayout SLOTS)
 * ─────────────────────────────────────────────────────────────────────────────
 * Same reason `hudSurfaces` is not: the slot registry is a FOUR-CORNER model and
 * this is a centred column. Worse, `hudLayout.test.ts:245` asserts the
 * bottom-left `skipTransient` stack ends at `fps`, so any non-transient slot
 * with order > 1 in a bottom corner fails it outright.
 *
 * But it DOES have to see the corners, which is the second half of the brief:
 *
 * ⚠️ THE OVERLAP CHECK IN `hudLayout.test.ts` ONLY COMPARES SLOTS IN THE SAME
 * CORNER (it walks `hudSlotsInCorner` and compares consecutive bands). A centred
 * box that grows sideways into a corner column is invisible to it. That is not
 * hypothetical: with the SIX-tile bar (天生技│Q│W│E│R│EX — the worst case, and
 * the shipped order per #192) the bar reserves 364 px, and on a 780×360 window
 *
 *     centred bar   x 208 … 572,  y 258 … 346
 *     minimap slot  x 562 … 770,  y  70 … 278
 *
 * intersect in a 10×20 px corner. {@link hudClusterRects} therefore CLAMPS the
 * column into the free interval between the two bottom columns instead of
 * blindly centring it (`keepClearOfCorners`, a field — the alternative,
 * 「let it overlap and paint on top」, is a decision, not a fact), and
 * `hudBottomCluster.test.ts` sweeps cluster × every slot at every guard
 * viewport, in BOTH pointer modes. Below ~810 px of width the column slides a
 * few px left; above it the clamp is inert and the bar is exactly centred.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIELDS (CLAUDE.md 第一守則 — 決策點也要可調)
 * ─────────────────────────────────────────────────────────────────────────────
 * Every choice below was a fork in the road while writing this, so every one of
 * them is a field with a documented range rather than a constant with a comment
 * defending it. {@link HUD_CLUSTER_FIELDS} is the table; {@link resolveClusterTuning}
 * is the validator (it REPORTS what it clamped — CLAUDE.md #279: a silently
 * swallowed number is how 50 becomes 500 and nobody hears about it).
 *
 * ⚠️ WIRING STATUS, stated honestly. The field table, the bounds, the validator
 * and the runtime seam ({@link applyHudClusterOverride}, shaped exactly like the
 * `applyGoreDoc` / `applyStealthDoc` seams `ContentDb` already calls) all ship
 * here. What does NOT ship in this change is the `content/config/hud-layout.json`
 * document and its admin row, because adding a file under `content/` requires
 * `pnpm content:build` and this lane is explicitly forbidden from running it
 * (`bundle.test.ts` would go red). The defaults below are therefore the live
 * values today, and the remaining work is exactly two rows and one line:
 *   · `packages/shared/src/content/schema/config.ts` — `config.hud-layout@1`
 *     + `DEFAULT_HUD_LAYOUT` (mirror {@link SHIPPED_HUD_CLUSTER} verbatim);
 *   · `content/config/hud-layout.json` + `pnpm content:build`;
 *   · `ContentDb.load()` — `applyHudClusterOverride(this.configDoc(…))`.
 */
import {
  HUD_EDGE,
  HUD_GAP,
  HUD_SLOTS,
  hudSlotRect,
  type HudRect,
  type HudSlotId,
  type HudViewport,
} from "./hudLayout";

/* ═══════════════════════════════════════════════════════════════════════════
 * MEASURED SIZES — reservations, i.e. upper bounds on what the row paints
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The ability row's painted height. MEASURED 2026-07-30 on the live client at
 * 1280×800: 88 px (8 px padding + a 52 px tile + the caption/rank line + 8 px).
 * It does NOT vary with the tile count — only the width does — so the arithmetic
 * in {@link hudClusterRects} is exact rather than approximate.
 */
export const ABILITY_ROW_H = 88;

/**
 * The ability row's WIDEST case: six tiles (天生技│Q│W│E│R│EX, #192's order).
 * Measured 306 px with five tiles on the same client; one more tile is
 * +52 (tile) +6 (flex gap) = 364. A champion with no innate paints 306 and this
 * reservation is simply loose, which is the contract every reserved size in
 * `hudLayout` follows.
 */
export const ABILITY_ROW_MAX_W = 364;

/**
 * The HP/MP plate: MEASURED 278×48 off the running client on 2026-07-30 —
 * 260 content + 8 px padding + 1 px border on each side, and the border is the
 * point. The first version of this constant said 276×46 (content + padding, the
 * number you get by reading the JSX) and was 2 px short on both axes, i.e. a
 * reservation that was NOT an upper bound. Re-measured against the live box.
 */
export const RESOURCE_ROW_W = 278;
export const RESOURCE_ROW_H = 48;

/* ═══════════════════════════════════════════════════════════════════════════
 * THE FIELDS
 * ═══════════════════════════════════════════════════════════════════════════ */

/** How the bottom-right portrait answers 「變身之後要顯示誰？」. */
export type HeroPortraitMode =
  /** the body on screen right now — 玩家看到的是誰就顯示誰 (owner's default) */
  | "current-form"
  /** always the champion the seat locked in at champ-select */
  | "base"
  /** no portrait at all */
  | "off";

export interface HudClusterTuning {
  /**
   * px between the HP/MP plate and the ability row. THE 「緊鄰但不重疊」 number.
   * 0 = the two boxes touch (legal: touching edges do not overlap).
   */
  barsToAbilitiesGapPx: number;
  /** px from the bottom edge of the viewport to the bottom of the column. */
  clusterBottomPx: number;
  /**
   * The same, on coarse pointers — where there IS no ability row (the touch
   * build replaces it with the joystick + arc), so the plate would otherwise
   * drop onto the thumb controls.
   */
  clusterTouchBottomPx: number;
  /** px between the column and the cast-refusal line that rides above it. */
  castNoticeGapPx: number;
  /**
   * true = slide the column out of the bottom corners' way when centring it
   * would intersect them (see the module doc's 780×360 case).
   * false = centre it regardless and let the corners be painted over.
   */
  keepClearOfCorners: boolean;
  /** which champion the bottom-right portrait shows. */
  heroPortrait: HeroPortraitMode;
  /** square edge of that portrait, px. */
  heroPortraitPx: number;
}

/** One row of the field table: the bounds a value must satisfy. */
export interface HudClusterFieldSpec {
  key: keyof HudClusterTuning;
  /** numeric fields only */
  min?: number;
  max?: number;
  /** enum fields only */
  values?: readonly string[];
  /** what it changes on screen — never a restatement of the key */
  label: string;
}

/**
 * ⚠️ EVERY FIELD HAS AN UPPER BOUND, not just a lower one. `validateField` in
 * the admin console shipped for months checking only `min`, so 50 typed as 500
 * sailed through the form and was rejected (or silently clamped) downstream —
 * the #277 shape. A gap of 4000 is not 「a big gap」, it is an ability bar the
 * player cannot see.
 */
export const HUD_CLUSTER_FIELDS: readonly HudClusterFieldSpec[] = [
  {
    key: "barsToAbilitiesGapPx",
    min: 0,
    max: 40,
    label: "血條與技能列的間距（0 = 貼齊；越大越像兩組東西）",
  },
  {
    key: "clusterBottomPx",
    min: 0,
    max: 200,
    label: "整組（血條＋技能列）離畫面底部的距離",
  },
  {
    key: "clusterTouchBottomPx",
    min: 0,
    max: 280,
    label: "觸控版沒有技能列，血條要抬多高才不會壓到搖桿",
  },
  { key: "castNoticeGapPx", min: 0, max: 60, label: "「不能施放」提示與這一組的距離" },
  {
    key: "keepClearOfCorners",
    label: "視窗太窄時，這一組要讓開右下角（小地圖／金錢）還是蓋過去",
  },
  {
    key: "heroPortrait",
    values: ["current-form", "base", "off"],
    label: "右下角頭像顯示誰：當前形態／本體／不顯示",
  },
  {
    key: "heroPortraitPx",
    min: 24,
    // 36 IS THE CEILING BECAUSE THE SLOT RESERVES 170 px, not because a bigger
    // face would look wrong: 36 + 8 (gap) + 106 (the measured text column) + 20
    // (padding) = 170 exactly. Raising it means raising `gold-level`'s reserved
    // width in the same commit — and `hudBottomCluster.test.ts` makes that
    // automatic rather than a matter of remembering, because the painted-vs-
    // reserved assertion goes red the moment the sum exceeds the row.
    max: 36,
    label: "右下角頭像的邊長",
  },
] as const;

/**
 * THE SHIPPED VALUES.
 *
 * `clusterBottomPx: 34` is chosen so the PLATE'S BOTTOM EDGE LANDS EXACTLY WHERE
 * IT ALWAYS DID — 34 + 88 (bar) + 6 (gap) = 128, the plate's old hard pin. The
 * first draft did the opposite (kept the BAR at its old 14 and let the plate
 * come down 20 px to meet it) and that is measurably worse: the plate's lower
 * edge is the ceiling of the intermission 評價 card's inset strip
 * (panels/roundReportLayout), and 20 px was enough to push that card under its
 * own MIN_RENDER_H at 667×375 — the card would simply have stopped painting.
 * Moving the BAR up costs nothing downstream; moving the PLATE down costs a
 * whole panel. Both were tried; this is the one that measured clean.
 *
 * `barsToAbilitiesGapPx: 6` is the smallest gap at which the plate still reads
 * as a separate readout instead of a strip of the bar's own chrome, and it
 * matches the 6 px flex gap BETWEEN the tiles — so the whole cluster is spaced
 * on one rhythm. It replaces a measured 27 px.
 */
export const SHIPPED_HUD_CLUSTER: HudClusterTuning = {
  barsToAbilitiesGapPx: 6,
  clusterBottomPx: 34,
  clusterTouchBottomPx: 128,
  castNoticeGapPx: 8,
  keepClearOfCorners: true,
  heroPortrait: "current-form",
  heroPortraitPx: 36,
};

/** What {@link resolveClusterTuning} had to change to make a value legal. */
export interface ClusterTuningProblem {
  key: keyof HudClusterTuning;
  got: unknown;
  used: number | string | boolean;
  why: string;
}

function clampNumber(
  spec: HudClusterFieldSpec,
  raw: unknown,
  fallback: number,
  problems: ClusterTuningProblem[],
): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    problems.push({ key: spec.key, got: raw, used: fallback, why: "not a finite number" });
    return fallback;
  }
  const lo = spec.min ?? Number.NEGATIVE_INFINITY;
  const hi = spec.max ?? Number.POSITIVE_INFINITY;
  if (raw < lo) {
    problems.push({ key: spec.key, got: raw, used: lo, why: `below min ${lo}` });
    return lo;
  }
  if (raw > hi) {
    problems.push({ key: spec.key, got: raw, used: hi, why: `above max ${hi}` });
    return hi;
  }
  return raw;
}

/**
 * Validate a partial override against {@link HUD_CLUSTER_FIELDS}.
 *
 * It RETURNS the problems rather than throwing or swallowing them: an operator
 * who types 500 into a 0–40 field must be told the layout used 40, which is the
 * complaint behind #279 (「clamp 靜默吃掉數字」).
 */
export function resolveClusterTuning(partial: Partial<HudClusterTuning> | null | undefined): {
  tuning: HudClusterTuning;
  problems: ClusterTuningProblem[];
} {
  const problems: ClusterTuningProblem[] = [];
  const out: HudClusterTuning = { ...SHIPPED_HUD_CLUSTER };
  if (!partial) return { tuning: out, problems };
  for (const spec of HUD_CLUSTER_FIELDS) {
    const raw = (partial as Record<string, unknown>)[spec.key];
    if (raw === undefined) continue;
    if (spec.values) {
      if (typeof raw === "string" && spec.values.includes(raw)) {
        (out as unknown as Record<string, unknown>)[spec.key] = raw;
      } else {
        problems.push({
          key: spec.key,
          got: raw,
          used: SHIPPED_HUD_CLUSTER[spec.key] as string,
          why: `not one of ${spec.values.join(" / ")}`,
        });
      }
      continue;
    }
    if (spec.min === undefined && spec.max === undefined) {
      if (typeof raw === "boolean") {
        (out as unknown as Record<string, unknown>)[spec.key] = raw;
      } else {
        problems.push({
          key: spec.key,
          got: raw,
          used: SHIPPED_HUD_CLUSTER[spec.key] as boolean,
          why: "not a boolean",
        });
      }
      continue;
    }
    (out as unknown as Record<string, unknown>)[spec.key] = clampNumber(
      spec,
      raw,
      SHIPPED_HUD_CLUSTER[spec.key] as number,
      problems,
    );
  }
  return { tuning: out, problems };
}

/* ── the runtime seam ─────────────────────────────────────────────────────── */

let active: HudClusterTuning = { ...SHIPPED_HUD_CLUSTER };

/**
 * Install an operator override (or `null` to fall back to the shipped values).
 * Shaped like `applyGoreDoc` / `applyStealthDoc` so `ContentDb.load()` can call
 * it in one line the day `config.hud-layout@1` exists — see the module doc's
 * wiring-status note.
 */
export function applyHudClusterOverride(
  partial: Partial<HudClusterTuning> | null,
): ClusterTuningProblem[] {
  const { tuning, problems } = resolveClusterTuning(partial);
  active = tuning;
  return problems;
}

/** The values the running HUD is laying out with right now. */
export function hudClusterTuning(): HudClusterTuning {
  return active;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GEOMETRY
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Which rows are really on screen — an absent row must not reserve its space. */
export interface HudClusterRows {
  /** the HP/MP plate (hidden before the local champion has a body) */
  resources: boolean;
  /** the desktop ability bar (replaced by TouchControls on coarse pointers) */
  abilities: boolean;
}

export interface HudClusterLayout {
  /** the whole column */
  cluster: HudRect;
  /** the HP/MP plate, or null when that row is not painted */
  resources: HudRect | null;
  /** the ability row, or null when that row is not painted */
  abilities: HudRect | null;
  /** the gap really applied between the two rows (0 when only one is painted) */
  gapPx: number;
  /** true = the column had to slide out of a corner slot's way */
  clamped: boolean;
  /**
   * true = the free interval between the two side columns is NARROWER than the
   * column itself, so SOMETHING has to be covered. Not an error and not a
   * silent one: `hudBottomCluster.test.ts` allows a residual overlap only while
   * this is true, and only with a slot the fallback names.
   */
  tight: boolean;
}

/**
 * The horizontal room the column has, at the HEIGHT it occupies.
 *
 * ⚠️ NOT 「the widest slot in the bottom corners」, which is the obvious version
 * and is wrong: at 780×360 the TOP-LEFT enemy panel hangs down to y 324 and the
 * bottom cluster starts at y 206, so a bottom-corner-only rule walks the column
 * straight into a top-corner panel. Every non-transient slot whose rect shares
 * any of the column's vertical band constrains it, whichever corner it lives in
 * — that is what 「跨角落」 has to mean to be worth anything.
 */
export function clusterSideLimits(
  vp: HudViewport,
  touch: boolean,
  band: { y: number; h: number },
): { left: number; right: number } {
  let left = HUD_EDGE;
  let right = vp.width - HUD_EDGE;
  const mid = vp.width / 2;
  for (const s of HUD_SLOTS) {
    if (s.transient) continue; // opt-in dev overlays paint ABOVE, by declaration
    const r = hudSlotRect(s.id as HudSlotId, vp, touch);
    if (r.y >= band.y + band.h || r.y + r.h <= band.y) continue; // different height
    if (r.x + r.w / 2 < mid) left = Math.max(left, r.x + r.w + HUD_GAP);
    else right = Math.min(right, r.x - HUD_GAP);
  }
  return { left, right };
}

/**
 * Resolve the column against a concrete viewport.
 *
 * Origin is the viewport's top-left, like every rect in `hudLayout`, so the two
 * models can be compared directly — which is the whole point of writing this
 * one down instead of leaving it in two `bottom:` declarations.
 */
export function hudClusterRects(
  vp: HudViewport,
  touch: boolean,
  rows: HudClusterRows,
  tuning: HudClusterTuning = hudClusterTuning(),
): HudClusterLayout {
  const abilityH = rows.abilities ? ABILITY_ROW_H : 0;
  const resourceH = rows.resources ? RESOURCE_ROW_H : 0;
  const gapPx = rows.abilities && rows.resources ? tuning.barsToAbilitiesGapPx : 0;
  const h = abilityH + gapPx + resourceH;
  const w = Math.max(
    rows.abilities ? ABILITY_ROW_MAX_W : 0,
    rows.resources ? RESOURCE_ROW_W : 0,
  );
  const bottom = touch ? tuning.clusterTouchBottomPx : tuning.clusterBottomPx;
  const y = vp.height - bottom - h;

  const centred = Math.round((vp.width - w) / 2);
  let x = centred;
  let tight = false;
  if (tuning.keepClearOfCorners) {
    const { left, right } = clusterSideLimits(vp, touch, { y, h });
    if (right - left >= w) {
      x = Math.min(Math.max(centred, left), right - w);
    } else {
      // NO HONEST ROOM (780×360 desktop with a six-tile bar: 194 px of enemy
      // panel + 218 px of minimap column + 364 px of bar + two gaps = 792 > 780).
      // The column then hugs the RIGHT limit, i.e. it yields to the bottom-right
      // column and accepts covering the left edge of a top-anchored panel.
      // That is a ranking, not a coincidence: the minimap and the gold readout
      // are bottom-anchored chrome the player reads continuously and cannot
      // scroll, while the top-left enemy panel is informational and is already
      // declared over-subscribed at this height by #107. Shrinking or hiding the
      // ability bar was the third option and is the worst one — a bar you cannot
      // fully see is a bar you cannot use.
      // ⚠️ FLOOR IT. `right - w` alone goes NEGATIVE the moment the column is
      // wider than the usable strip, and then the whole cluster walks off the
      // LEFT edge — the exact ①-shaped failure (drawn outside the viewport)
      // this file exists to close. Measured 2026-07-31 by a reviewer, in a real
      // match at 500×700 with a desktop pointer: `left: -90px`, the ability row
      // at x=-61 with the innate tile clipped to a sliver, the plate's left
      // border off screen. It regressed against the pre-cluster layout, which
      // was `left:50% + translateX(-50%)` and therefore visible at any width.
      //
      // The sweep, both rows, fine pointer, h=640:
      //   360→-230  400→-190  480→-110  500→-90  580→-10  600→+10 (first legal)
      //
      // So: overflow to the RIGHT (where the edge is soft — the player can still
      // see the left half of the bar and the numbers) rather than to the left,
      // where the innate/Q tiles are and where the plate's own labels live.
      x = Math.max(HUD_EDGE, right - w);
      tight = true;
    }
  }
  const clamped = x !== centred;

  const cluster: HudRect = { x, y, w, h };
  // Each row is centred INSIDE the column, so a narrow plate still sits on the
  // bar's axis after a clamp — the two must never look bolted on askew.
  const rowX = (rw: number): number => x + Math.round((w - rw) / 2);
  const resources: HudRect | null = rows.resources
    ? { x: rowX(RESOURCE_ROW_W), y, w: RESOURCE_ROW_W, h: RESOURCE_ROW_H }
    : null;
  const abilities: HudRect | null = rows.abilities
    ? {
        x: rowX(ABILITY_ROW_MAX_W),
        y: y + resourceH + gapPx,
        w: ABILITY_ROW_MAX_W,
        h: ABILITY_ROW_H,
      }
    : null;
  return { cluster, resources, abilities, gapPx, clamped, tight };
}

/**
 * The `bottom` the cast-refusal line pins to, so it rides above the column
 * instead of through the HP plate that is now in the way. It used to be a bare
 * `const DESKTOP_BOTTOM = 104`, chosen when the bar's near neighbour was empty
 * screen — with the plate at 14+88+6 = 108 that constant lands INSIDE it.
 */
export function hudCastNoticeBottom(
  touch: boolean,
  rows: HudClusterRows,
  tuning: HudClusterTuning = hudClusterTuning(),
): number {
  const abilityH = rows.abilities ? ABILITY_ROW_H : 0;
  const resourceH = rows.resources ? RESOURCE_ROW_H : 0;
  const gapPx = rows.abilities && rows.resources ? tuning.barsToAbilitiesGapPx : 0;
  const bottom = touch ? tuning.clusterTouchBottomPx : tuning.clusterBottomPx;
  return bottom + abilityH + gapPx + resourceH + tuning.castNoticeGapPx;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE BOTTOM-RIGHT HERO PORTRAIT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * WHICH champion the portrait shows.
 *
 * ⚠️ `seat.championId` FREEZES at champ-select — 變身 swaps the body, not the
 * seat (see render/views/formVisual). So a portrait that reads the seat alone is
 * wrong for exactly the players most likely to look at it. The form index comes
 * off the entity's FORM bits (`formIndexFromFlags`), and the counterpart id is
 * resolved with the SAME shared helper the model/tint/skin resolvers use, so the
 * face on the HUD and the body in the arena can never disagree.
 *
 * @param counterpart the alternate-form id for `seatChampionId`, or null when
 *        this champion has no second form (87 of 113 — the common case).
 */
export function heroPortraitChampionId(
  seatChampionId: string | null | undefined,
  formIndex: number,
  counterpart: string | null,
  tuning: HudClusterTuning = hudClusterTuning(),
): string | null {
  if (tuning.heroPortrait === "off") return null;
  if (!seatChampionId) return null;
  if (tuning.heroPortrait === "base" || formIndex === 0) return seatChampionId;
  return counterpart ?? seatChampionId;
}
