/**
 * StatsHoverPanel — 「戰鬥場景 滑鼠移到右下角 角色頭圖等級金幣區域時 可以顯示
 * 全部屬性能力出來」 (owner)。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT SHOWS, AND WHY IT DOES NOT COMPUTE ANY OF IT ITSELF
 * ─────────────────────────────────────────────────────────────────────────────
 * Every number here comes from a reader that ALREADY SHIPS:
 *   · 屬性 → `ui/championSheet.championSheetRows`, the one definition of 「how a
 *     player reads this stat table」 shared with champ-select's 數值 tab and the
 *     codex. It runs through the SIM's own `championStatBase` / `finalizeStat`,
 *     so 基礎 / 戰鬥實際 / 每級成長 cannot disagree with the server. #248 is the
 *     scar: reading `def.baseStats.maxHealth` directly prints the raw w3x 150 for
 *     a champion whose real level-1 health is 575.
 *   · 技能 → `ui/panels/skillDetails.skillRows`, the same selector the prep
 *     window uses, fed with THIS seat's live ranks and cooldowns.
 *   · 倍率／加成／上限 → `useDisplayEnv` / `useDisplayBaseBonus` /
 *     `useDisplayStatCaps`, i.e. the tables the SERVER snapshotted into this
 *     match (`MatchState.combatEnvJson` …), not the client's content copy.
 *
 * ⚠️ AND IT READS THEM AT **THIS SEAT'S LEVEL**, not at level 1. That is the
 * one thing the existing readers could not do, and it is why `championSheetRows`
 * grew a {@link ChampionSheetContext} instead of this file growing a second call
 * to `championStatBase` — a second reader is exactly how #248 happened.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE CONSTRAINTS THAT SHAPED IT (all measured, none preference)
 * ─────────────────────────────────────────────────────────────────────────────
 * ① IT IS A DRAWER, NOT A SLOT AND NOT A DOCKED PANEL. See the long note above
 *    `hudSlotPanelOffset` in ./hudLayout — joining `HUD_SLOTS` fails the exact
 *    bottom-right slot list `hudLayout.test.ts` pins, and joining `HUD_PANELS`
 *    turns `equipment`'s default `inset` policy into a declared bug. It also
 *    must not widen the bottom-right COLUMN: `hudBottomCluster.test.ts` proves
 *    that column fits a 780×360 viewport with ~12px of slack, so a panel that
 *    grew the column would legitimately go red.
 *
 * ② IT NEVER TAKES A POINTER EVENT. `pointerEvents: "none"` on both the panel
 *    and (there is none) any capture layer: the open/close decision comes from a
 *    window `mousemove` hit-test against the anchor slot's REGISTRY RECT. A
 *    transparent capture div over the 金錢/等級 box would have swallowed
 *    right-click move orders in that corner for the whole match, which is a
 *    worse bug than the one being fixed. The cost is stated honestly: content
 *    that does not fit is DROPPED with a 「還有 N 項」 line rather than scrolled,
 *    because a scrollbar you cannot grab is failure shape ① wearing a hat.
 *
 * ③ TOUCH IS OFF BY DEFAULT, and that is measured, not lazy. On coarse pointers
 *    bottom-right IS the ability arc (the documented reason the minimap re-homes
 *    to the top-left, ./hudLayout `minimap.touchCorner`). A long-press entry is
 *    IMPLEMENTED and one field away — `touchTrigger: "hold"` — but shipping it
 *    ON would put a 400 ms swallow-window on top of the attack button, and the
 *    owner's request says 「滑鼠」.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 第一守則 — every fork in the road above is a FIELD (see {@link HUD_STATS_FIELDS})
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ WIRING STATUS, stated honestly (same shape as `hudBottomCluster.ts`, and
 * for the same reason). What ships HERE is the field table, the bounds, the
 * validator that REPORTS what it clamped, and the runtime seam
 * {@link applyHudStatsOverride} — shaped exactly like the `applyGoreDoc` /
 * `applyStealthDoc` seams `ContentDb` already calls.
 *
 * What does NOT ship here is `content/config/hud-stats.json` + its Zod schema +
 * its admin rows, because **this lane does not own `schema/config.ts`**, and a
 * config document whose schema tag is not in `zConfigDoc`'s union makes
 * `ContentLoader` reject the WHOLE content set → `main.tsx` fails open to a
 * 2-champion skeleton → the site looks completely normal and nobody can play.
 * That is the 2026-08-02 outage verbatim (roster / boss-intro / item-card /
 * victory-fx). Shipping the JSON without the schema would arm exactly that mine,
 * so the remaining three landing points are handed over instead:
 *   · `packages/shared/src/content/schema/config.ts` — `config.hud-stats@1`
 *     + `DEFAULT_HUD_STATS` (mirror {@link SHIPPED_HUD_STATS} verbatim);
 *   · `content/config/hud-stats.json` + `pnpm content:build` + commit BOTH the
 *     source file and the artifacts;
 *   · `apps/admin/src/*` — `SHIPPED_*` + field union + order + labels + group
 *     + `configFromForm`;
 *   · `ContentDb.load()` — one line: `applyHudStatsOverride(this.configDoc(…))`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { attrBonusFromArray } from "@ggd/shared/sim/economy/statPath";
import {
  ATTR_KEYS,
  championAttribute,
  type AttrBonus,
  type AttributeCarrier,
} from "@ggd/shared/sim/stats/attributes";
import type { BaseBonusTable } from "@ggd/shared/sim/baseBonus";
import type { StatCapTable } from "@ggd/shared/sim/statCaps";
import type { CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";
import type { BodyScaleRules } from "@ggd/shared/sim/bodyScale";
import { useHud, type SeatView } from "../../net/RoomStore";
import { championSheetRows, type ChampionSheetRow } from "../championSheet";
import { skillRows, type SkillRow } from "../panels/skillDetails";
import { num, statLabel } from "../codex/codexLabels";
import { displayFinalText, useDisplayEnv } from "../displayFinal";
import { useDisplayBaseBonus } from "../displayBaseBonus";
import { useDisplayStatCaps } from "../displayStatCaps";
import { contentBodyScaleRules } from "../displayBodyScale";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { hudTouch } from "./HudSlot";
import {
  hudSlotPanelMaxHeight,
  hudSlotPanelStyle,
  hudSlotRect,
  type HudSlotPanelOpen,
  type HudViewport,
} from "./hudLayout";

/* ═══════════════════════════════════════════════════════════════════════════
 * THE FIELDS (第一守則)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The blocks the drawer can show, in the order the operator lists them. */
export type HudStatsSection = "vitals" | "attributes" | "stats" | "abilities" | "items";

export const HUD_STATS_SECTIONS: readonly HudStatsSection[] = [
  "vitals",
  "attributes",
  "stats",
  "abilities",
  "items",
];

export interface HudStatsTuning {
  /** 完全關掉這個面板。 */
  enabled: boolean;
  /** 滑鼠(細指標)怎麼開:移上去就開,或不開。 */
  desktopTrigger: "hover" | "off";
  /** 觸控怎麼開:長按,或不開(出貨值,理由見檔頭 ③)。 */
  touchTrigger: "hold" | "off";
  /** 長按要按多久(毫秒)才算數。 */
  holdMs: number;
  /** 面板寬度上限(px);視窗更窄時會再被夾。 */
  widthPx: number;
  /** 面板高度上限(px);視窗更矮時會再被夾。 */
  maxHeightPx: number;
  /** 從頭像框上緣展開,還是從整個右下角欄位上方展開。 */
  openFrom: HudSlotPanelOpen;
  /** 顯示哪幾個區塊,以及順序。 */
  sections: readonly HudStatsSection[];
  /** 這幾條屬性不要列出來(stat-doc key,例如 "critChance")。 */
  hiddenStats: readonly string[];
  /** 顯示「每級成長」那一欄。 */
  showGrowth: boolean;
  /** 顯示「戰鬥實際」那一欄(倍率+基礎加成之後的值)。 */
  showBattleFinal: boolean;
  /** 技能最多列幾列(六格英雄 = 6)。 */
  maxAbilityRows: number;
}

export interface HudStatsFieldSpec {
  key: keyof HudStatsTuning;
  min?: number;
  max?: number;
  values?: readonly string[];
  /** true = 一個字串陣列欄位(sections / hiddenStats) */
  list?: "sections" | "statKeys";
  label: string;
}

/**
 * ⚠️ 每一格都有**上界**,不只有下界。`validateField` 在 2026-07-29 之前只檢查
 * `min`,所以 320 打成 3200 會過後台,然後在畫面上變成一片蓋住整個戰場的黑板。
 */
export const HUD_STATS_FIELDS: readonly HudStatsFieldSpec[] = [
  { key: "enabled", label: "戰鬥中是否提供右下角的屬性懸停面板" },
  {
    key: "desktopTrigger",
    values: ["hover", "off"],
    label: "滑鼠怎麼叫出來:移到頭像/金錢區就顯示,或關閉",
  },
  {
    key: "touchTrigger",
    values: ["hold", "off"],
    label: "觸控怎麼叫出來:長按頭像/金錢區,或關閉（右下角在手機上是技能弧）",
  },
  { key: "holdMs", min: 120, max: 2000, label: "觸控長按要按滿幾毫秒才展開" },
  { key: "widthPx", min: 200, max: 560, label: "面板寬度上限（視窗更窄時會再被夾）" },
  { key: "maxHeightPx", min: 160, max: 900, label: "面板高度上限（視窗更矮時會再被夾）" },
  {
    key: "openFrom",
    values: ["anchor", "stack"],
    label: "從頭像框上緣展開（會蓋住小地圖）還是從整個右下角欄位上方展開（不蓋東西，矮螢幕會放不下）",
  },
  { key: "sections", list: "sections", label: "顯示哪幾個區塊，以及由上到下的順序" },
  { key: "hiddenStats", list: "statKeys", label: "不要列出來的屬性（stat 鍵名）" },
  { key: "showGrowth", label: "屬性表要不要有「每級成長」那一欄" },
  { key: "showBattleFinal", label: "屬性表要不要有「戰鬥實際」那一欄（倍率與基礎加成之後）" },
  { key: "maxAbilityRows", min: 0, max: 12, label: "技能最多列幾列" },
];

/**
 * THE SHIPPED VALUES.
 *
 * `widthPx: 320` — the 屬性 table is a 4-column grid (名稱 / 基礎 / 戰鬥實際 /
 * 成長) and 320 is where a 4-digit 戰鬥實際 (a 3× maxHealth multiplier puts real
 * champions past 2,000) stops wrapping at the 11.5px this HUD uses. It is also
 * comfortably under the narrowest guard viewport's free width.
 *
 * `maxHeightPx: 520` — a 16-stat champion with six skill rows is taller than any
 * phone-landscape viewport, so on the short viewports the real limit is
 * `hudSlotPanelMaxHeight` and this number is inert. It exists so a 1440p screen
 * does not get a drawer running the full height of the display.
 *
 * `touchTrigger: "off"` — see the module doc ③. This is the one default that is
 * NOT the most featureful choice, and the reason is measured.
 */
export const SHIPPED_HUD_STATS: HudStatsTuning = {
  enabled: true,
  desktopTrigger: "hover",
  touchTrigger: "off",
  holdMs: 400,
  widthPx: 320,
  maxHeightPx: 520,
  openFrom: "anchor",
  sections: ["vitals", "attributes", "stats", "abilities", "items"],
  hiddenStats: [],
  showGrowth: true,
  showBattleFinal: true,
  maxAbilityRows: 6,
};

/** What {@link resolveStatsTuning} had to change to make a value legal. */
export interface StatsTuningProblem {
  key: keyof HudStatsTuning;
  got: unknown;
  used: unknown;
  why: string;
}

function clampNumber(
  spec: HudStatsFieldSpec,
  raw: unknown,
  fallback: number,
  problems: StatsTuningProblem[],
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
 * Validate a partial override against {@link HUD_STATS_FIELDS}.
 *
 * It RETURNS the problems instead of throwing or swallowing them: an operator
 * who types 3200 into a 200–560 field must be told the panel used 560 (#279,
 * 「clamp 靜默吃掉數字」).
 */
export function resolveStatsTuning(partial: Partial<HudStatsTuning> | null | undefined): {
  tuning: HudStatsTuning;
  problems: StatsTuningProblem[];
} {
  const problems: StatsTuningProblem[] = [];
  const out: HudStatsTuning = { ...SHIPPED_HUD_STATS };
  if (!partial) return { tuning: out, problems };
  const bag = partial as Record<string, unknown>;
  for (const spec of HUD_STATS_FIELDS) {
    const raw = bag[spec.key];
    if (raw === undefined) continue;
    const write = (v: unknown): void => {
      (out as unknown as Record<string, unknown>)[spec.key] = v;
    };
    if (spec.list === "sections") {
      if (
        Array.isArray(raw) &&
        raw.every((v) => typeof v === "string" && HUD_STATS_SECTIONS.includes(v as HudStatsSection))
      ) {
        // de-duplicated: listing a block twice would render it twice, which is
        // never what an operator means by an ORDER.
        write([...new Set(raw as HudStatsSection[])]);
      } else {
        problems.push({
          key: spec.key,
          got: raw,
          used: SHIPPED_HUD_STATS.sections,
          why: `not a subset of ${HUD_STATS_SECTIONS.join(" / ")}`,
        });
      }
      continue;
    }
    if (spec.list === "statKeys") {
      if (Array.isArray(raw) && raw.every((v) => typeof v === "string")) {
        write([...new Set(raw as string[])]);
      } else {
        problems.push({
          key: spec.key,
          got: raw,
          used: SHIPPED_HUD_STATS.hiddenStats,
          why: "not an array of stat keys",
        });
      }
      continue;
    }
    if (spec.values) {
      if (typeof raw === "string" && spec.values.includes(raw)) write(raw);
      else {
        problems.push({
          key: spec.key,
          got: raw,
          used: SHIPPED_HUD_STATS[spec.key],
          why: `not one of ${spec.values.join(" / ")}`,
        });
      }
      continue;
    }
    if (spec.min === undefined && spec.max === undefined) {
      if (typeof raw === "boolean") write(raw);
      else {
        problems.push({
          key: spec.key,
          got: raw,
          used: SHIPPED_HUD_STATS[spec.key],
          why: "not a boolean",
        });
      }
      continue;
    }
    write(clampNumber(spec, raw, SHIPPED_HUD_STATS[spec.key] as number, problems));
  }
  return { tuning: out, problems };
}

/* ── the runtime seam ─────────────────────────────────────────────────────── */

let active: HudStatsTuning = { ...SHIPPED_HUD_STATS };

/**
 * Install an operator override (or `null` to fall back to the shipped values).
 * Shaped like `applyGoreDoc` / `applyStealthDoc` so `ContentDb.load()` can call
 * it in one line the day `config.hud-stats@1` exists — see the module doc's
 * wiring-status note.
 */
export function applyHudStatsOverride(
  partial: Partial<HudStatsTuning> | null,
): StatsTuningProblem[] {
  const { tuning, problems } = resolveStatsTuning(partial);
  active = tuning;
  return problems;
}

/** The values the drawer is rendering with right now. */
export function hudStatsTuning(): HudStatsTuning {
  return active;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE PURE MODEL — what the drawer would paint for a seat. Node-testable.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The one 三圍 line: innate-at-level plus what this match bought. */
export interface StatsHoverAttrRow {
  key: "str" | "agi" | "int";
  label: string;
  /** total effective value at this seat's level, bought points included */
  total: number;
  /** of which was bought this match (#260); 0 = none */
  bought: number;
}

export interface StatsHoverModel {
  championId: string;
  championName: string;
  level: number;
  gold: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  /** empty when the champion doc carries no 三圍 block and nothing was bought */
  attributes: readonly StatsHoverAttrRow[];
  stats: readonly ChampionSheetRow[];
  abilities: readonly SkillRow[];
  items: readonly string[];
}

const ATTR_LABEL: Record<"str" | "agi" | "int", string> = { str: "力量", agi: "敏捷", int: "智慧" };

/** The seat fields this model reads (a subset of RoomStore's SeatView). */
export type StatsHoverSeat = Pick<
  SeatView,
  | "championId"
  | "level"
  | "gold"
  | "hp"
  | "maxHp"
  | "mana"
  | "maxMana"
  | "items"
  | "abilityRanks"
  | "cooldowns"
  | "exAbilityId"
  | "exRank"
  | "exCooldown"
> & { attrBonus?: readonly number[] };

export interface StatsHoverTables {
  env: CombatEnvMultipliers;
  baseBonus: BaseBonusTable;
  caps: StatCapTable;
  bodyScaleRules: BodyScaleRules;
  tuning: HudStatsTuning;
}

/**
 * Build the drawer's contents for a seat. `null` = nothing to show (no champion
 * picked, or the id is not in the registry — both real states, not errors).
 *
 * ⚠️ It resolves the sheet AT THE SEAT'S LEVEL and WITH THE ATTRIBUTES BOUGHT.
 * Passing neither would print the champion's level-1 型錄 on a level-8 hero:
 * a plausible, smaller, wrong number — the hardest kind of lie to notice.
 */
export function statsHoverModel(
  seat: StatsHoverSeat,
  tables: StatsHoverTables,
): StatsHoverModel | null {
  const id = seat.championId;
  if (!id) return null;
  const def = Champions.tryGet(id as ChampionId);
  if (!def) return null;
  const level = Math.max(1, seat.level || 1);
  const bonus: AttrBonus = attrBonusFromArray(seat.attrBonus ? [...seat.attrBonus] : undefined);
  const carrier = def as unknown as AttributeCarrier;
  const { tuning } = tables;

  const hidden = new Set(tuning.hiddenStats);
  const stats = championSheetRows(
    carrier,
    tables.env,
    tables.baseBonus,
    tables.caps,
    tables.bodyScaleRules,
    { level, attrBonus: bonus },
  ).filter((r) => !hidden.has(r.key));

  const hasAttrBlock = (carrier as { attributes?: unknown }).attributes !== undefined;
  const attributes: StatsHoverAttrRow[] = ATTR_KEYS.filter(
    (k) => hasAttrBlock || bonus[k] !== 0,
  ).map((k) => ({
    key: k,
    label: ATTR_LABEL[k],
    total: championAttribute(carrier, k, level, bonus),
    bought: bonus[k],
  }));

  const abilities = skillRows({
    championId: id,
    abilityRanks: seat.abilityRanks,
    cooldowns: seat.cooldowns,
    exAbilityId: seat.exAbilityId,
    exRank: seat.exRank,
    exCooldown: seat.exCooldown,
  }).slice(0, Math.max(0, tuning.maxAbilityRows));

  return {
    championId: id,
    championName: def.name ?? id,
    level,
    gold: seat.gold,
    hp: seat.hp,
    maxHp: seat.maxHp,
    mana: seat.mana,
    maxMana: seat.maxMana,
    attributes,
    stats,
    abilities,
    items: [...seat.items],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE OPEN/CLOSE DECISION — a hit-test, never a capture layer (module doc ②)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** The slot the drawer hangs off: 右下角的頭像／等級／金錢那一格。 */
export const STATS_HOVER_ANCHOR = "gold-level" as const;

function readViewport(): HudViewport {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Is (x, y) inside the anchor slot's RESERVED rect for this viewport? */
export function insideStatsAnchor(x: number, y: number, vp: HudViewport, touch: boolean): boolean {
  const r = hudSlotRect(STATS_HOVER_ANCHOR, vp, touch);
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE VIEW
 * ═══════════════════════════════════════════════════════════════════════════ */

const ROW_BORDER = "1px solid rgba(120,140,190,0.14)";
const FINAL_COLOR = "#6fd3a8";

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ fontSize: 9.5, letterSpacing: 1, color: TEXT_DIM, margin: "6px 0 3px" }}>
      {children}
    </div>
  );
}

function StatGrid({
  rows,
  tuning,
}: {
  rows: readonly ChampionSheetRow[];
  tuning: HudStatsTuning;
}): React.JSX.Element {
  const cols = 2 + (tuning.showBattleFinal ? 1 : 0) + (tuning.showGrowth ? 1 : 0);
  return (
    <div
      data-stats-hover-grid={cols}
      style={{
        display: "grid",
        gridTemplateColumns: `1fr ${"auto ".repeat(cols - 1).trim()}`,
        gap: "1px 10px",
        fontSize: 11.5,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div style={{ color: TEXT_DIM, fontSize: 9.5 }}>屬性</div>
      <div style={{ color: TEXT_DIM, fontSize: 9.5, textAlign: "right" }}>基礎</div>
      {tuning.showBattleFinal && (
        <div style={{ color: TEXT_DIM, fontSize: 9.5, textAlign: "right" }}>戰鬥實際</div>
      )}
      {tuning.showGrowth && (
        <div style={{ color: TEXT_DIM, fontSize: 9.5, textAlign: "right" }}>每級</div>
      )}
      {rows.map((r) => (
        <div key={r.key} data-stats-hover-row={r.key} style={{ display: "contents" }}>
          <div style={{ color: TEXT_DIM }}>{statLabel(r.key)}</div>
          <div style={{ textAlign: "right", color: TEXT_MAIN }}>
            {r.base === undefined ? "—" : num(r.base)}
          </div>
          {tuning.showBattleFinal && (
            <div
              data-stats-hover-final={r.key}
              style={{ textAlign: "right", color: r.final === undefined ? TEXT_DIM : FINAL_COLOR }}
            >
              {r.final === undefined ? "—" : num(r.final)}
            </div>
          )}
          {tuning.showGrowth && (
            <div style={{ textAlign: "right", color: r.growth ? GOLD : TEXT_DIM }}>
              {r.growth === undefined || r.growth === 0 ? "—" : `+${num(r.growth)}`}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AbilityList({
  rows,
  env,
}: {
  rows: readonly SkillRow[];
  env: CombatEnvMultipliers;
}): React.JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((r) => {
        const meta: string[] = [];
        if (r.maxRank > 1) meta.push(`${r.rank}/${r.maxRank} 級`);
        // #125/#136: the FINAL cooldown and range, never the authored base.
        if (r.cooldownSec !== undefined && r.cooldownSec > 0)
          meta.push(`冷卻 ${displayFinalText(r.cooldownSec, "cooldown", { env })}s`);
        if (r.manaCost !== undefined && r.manaCost > 0) meta.push(`魔力 ${num(r.manaCost)}`);
        if (r.range !== undefined && r.range > 0)
          meta.push(`射程 ${displayFinalText(r.range, "abilityRange", { env })}`);
        return (
          <div
            key={`${r.slot}-${r.rawName}`}
            data-stats-hover-ability={r.slot}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              padding: "2px 0",
              borderTop: ROW_BORDER,
              fontSize: 11.5,
              opacity: r.learned ? 1 : 0.55,
            }}
          >
            <span style={{ width: 30, flexShrink: 0, color: GOLD, fontSize: 9.5, fontWeight: 700 }}>
              {r.slot === "PASSIVE" ? "天生" : r.slot}
            </span>
            <span style={{ color: TEXT_MAIN, flexShrink: 0 }}>{r.name}</span>
            <span style={{ color: TEXT_DIM, fontSize: 10, minWidth: 0 }}>{meta.join(" · ")}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The drawer. Renders null unless the local seat has a champion AND the pointer
 * is resting on the anchor slot (or the touch hold fired).
 *
 * ⚠️ EVERY HOOK IS ABOVE EVERY `return null`. That is not style: `hookOrder.test.ts`
 * documents the 2026-08-02 T0 where a hook after an early return changed this
 * component's hook count between frames, React threw during render, and React 18
 * unmounted the whole root — 「所有介面突然都消失」 for the rest of the tab's life.
 */
export function StatsHoverPanel(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const env = useDisplayEnv();
  const baseBonus = useDisplayBaseBonus();
  const caps = useDisplayStatCaps();
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState<HudViewport>(readViewport);
  const openRef = useRef(false);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touch = hudTouch();
  const tuning = hudStatsTuning();
  const live = tuning.enabled && (touch ? tuning.touchTrigger : tuning.desktopTrigger) !== "off";
  const holdMs = tuning.holdMs;
  const touchHold = touch && tuning.touchTrigger === "hold";

  useEffect(() => {
    if (!live || typeof window === "undefined") return;
    const cancelHold = (): void => {
      if (holdRef.current !== null) {
        clearTimeout(holdRef.current);
        holdRef.current = null;
      }
    };
    const set = (next: boolean, vp: HudViewport): void => {
      if (openRef.current === next) return;
      openRef.current = next;
      setViewport(vp);
      setOpen(next);
    };
    const hit = (e: { clientX: number; clientY: number }): HudViewport | null => {
      const vp = readViewport();
      return insideStatsAnchor(e.clientX, e.clientY, vp, touch) ? vp : null;
    };

    if (!touchHold) {
      const onMove = (e: MouseEvent): void => {
        const vp = hit(e);
        set(vp !== null, vp ?? readViewport());
      };
      // A pointer that leaves the window never fires another mousemove, so the
      // drawer would stay open behind an alt-tab. Cheap, and the alternative
      // (leaving it up) is the kind of stuck overlay nobody can explain.
      const onLeave = (): void => set(false, readViewport());
      window.addEventListener("mousemove", onMove);
      window.addEventListener("blur", onLeave);
      document.addEventListener("mouseleave", onLeave);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("blur", onLeave);
        document.removeEventListener("mouseleave", onLeave);
      };
    }

    const onDown = (e: PointerEvent): void => {
      const vp = hit(e);
      if (vp === null) return;
      cancelHold();
      holdRef.current = setTimeout(() => set(true, readViewport()), holdMs);
    };
    const onUp = (): void => {
      cancelHold();
      set(false, readViewport());
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      cancelHold();
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [live, touch, touchHold, holdMs]);

  const bodyScaleRules = useMemo(() => contentBodyScaleRules(), []);
  const model = useMemo(
    () =>
      seat === null || !open
        ? null
        : statsHoverModel(seat, { env, baseBonus, caps, bodyScaleRules, tuning }),
    [seat, open, env, baseBonus, caps, bodyScaleRules, tuning],
  );

  if (!live || !open || model === null) return null;

  const maxH = Math.min(
    tuning.maxHeightPx,
    hudSlotPanelMaxHeight(STATS_HOVER_ANCHOR, viewport, touch, tuning.openFrom),
  );
  // Below this there is no drawer worth painting — a 40px sliver of a stat table
  // reads as a rendering bug, not as information.
  if (maxH < 80) return null;
  const width = Math.min(tuning.widthPx, Math.max(0, viewport.width - 20));

  const blocks: React.JSX.Element[] = [];
  for (const section of tuning.sections) {
    if (section === "vitals") {
      blocks.push(
        <div key="vitals" style={{ fontSize: 11.5, color: TEXT_MAIN }}>
          <span style={{ color: "#e0736a" }}>
            生命 {num(Math.round(model.hp))}/{num(Math.round(model.maxHp))}
          </span>
          <span style={{ color: TEXT_DIM }}> · </span>
          <span style={{ color: "#6f9fe0" }}>
            魔力 {num(Math.round(model.mana))}/{num(Math.round(model.maxMana))}
          </span>
          <span style={{ color: TEXT_DIM }}> · </span>
          <span style={{ color: GOLD }}>{num(model.gold)} g</span>
        </div>,
      );
    } else if (section === "attributes" && model.attributes.length > 0) {
      blocks.push(
        <div key="attributes">
          <SectionTitle>三圍</SectionTitle>
          <div style={{ fontSize: 11.5, color: TEXT_MAIN }}>
            {model.attributes.map((a, i) => (
              <span key={a.key} data-stats-hover-attr={a.key}>
                {i > 0 && <span style={{ color: TEXT_DIM }}> · </span>}
                {a.label} {num(a.total)}
                {a.bought !== 0 && <span style={{ color: GOLD }}> (+{num(a.bought)})</span>}
              </span>
            ))}
          </div>
        </div>,
      );
    } else if (section === "stats" && model.stats.length > 0) {
      blocks.push(
        <div key="stats">
          <SectionTitle>屬性 · 等級 {model.level}</SectionTitle>
          <StatGrid rows={model.stats} tuning={tuning} />
        </div>,
      );
    } else if (section === "abilities" && model.abilities.length > 0) {
      blocks.push(
        <div key="abilities">
          <SectionTitle>技能</SectionTitle>
          <AbilityList rows={model.abilities} env={env} />
        </div>,
      );
    } else if (section === "items" && model.items.length > 0) {
      blocks.push(
        <div key="items">
          <SectionTitle>裝備 {model.items.length}</SectionTitle>
          <div style={{ fontSize: 11, color: TEXT_MAIN }}>{model.items.join("、")}</div>
        </div>,
      );
    }
  }

  return (
    <div
      data-hud-drawer="stats-hover"
      data-hud-drawer-anchor={STATS_HOVER_ANCHOR}
      style={{
        ...hudSlotPanelStyle(STATS_HOVER_ANCHOR, touch, tuning.openFrom),
        width,
        maxHeight: maxH,
        boxSizing: "border-box",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 10px",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 8,
        color: TEXT_MAIN,
        // module doc ② — it must never eat a click meant for the arena.
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, color: TEXT_MAIN }}>
        {model.championName}
        <span style={{ color: TEXT_DIM, fontWeight: 400, fontSize: 11 }}> · Lv {model.level}</span>
      </div>
      {blocks}
    </div>
  );
}
