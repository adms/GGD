/**
 * championProfile — the PURE selectors behind the champ-select profile block
 * (task #76). No React, no DOM: string parsing over the imported champion doc
 * and the small view-model helpers the panel and its tests share.
 *
 * REUSE, NOT A THIRD PARSER. Ability/stat rendering is fed by the EXISTING
 * shared selectors — `skillRows` (ui/panels/skillDetails) over the same
 * Champions/Abilities registries the server casts with, and `splitChampionName`
 * / `statLabel` / `num` / `attackTypeLabel` from the codex (ui/codex). This
 * module only adds what is genuinely champ-select-specific: which champion the
 * profile is looking at, how the phase reads as a stage, and how to pull the
 * 玩法 / 故事 sub-sections out of the one free-text `description` field.
 */
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { SkillDetailSeat } from "../skillDetails";

// ---------------------------------------------------------------------------
// which champion is the profile showing
// ---------------------------------------------------------------------------

/**
 * The focused champion = the one under the cursor, else the confirmed pick,
 * else nothing (the empty-prompt state). Hover PREVIEWS without committing; a
 * click commits and becomes the fallback subject once the cursor leaves.
 */
export function profileSubjectId(
  hoveredId: string | null | undefined,
  selectedId: string | null | undefined,
): string | null {
  if (hoveredId) return hoveredId;
  if (selectedId) return selectedId;
  return null;
}

// ---------------------------------------------------------------------------
// the phase, as a client stage
// ---------------------------------------------------------------------------

export type ChampSelectStage = "briefing" | "picking";

/** Seconds at/below which the server auto-pick is imminent (mirrors the cue lead). */
export const AUTO_PICK_WARN_SEC = 5;

export interface StageInput {
  /** briefingGate said the overlay is up */
  briefingActive: boolean;
  /** the local seat's championId ("" = has not picked) */
  localPick: string;
  /** phaseSecondsLeft */
  secondsLeft: number;
}

export interface StageView {
  /** briefing overlay window, or the open picking window */
  stage: ChampSelectStage;
  /** the local player has a pick (last-write-wins; there is no lock) */
  confirmed: boolean;
  /**
   * the clock is in its final seconds AND the player still has no valid pick —
   * the moment the panel should warn that the server will hand them a random
   * champion (`autoPickAndSpawn`) when it hits 0. False once confirmed.
   */
  autoPickImminent: boolean;
}

/**
 * Fold (briefing, pick, clock) into the panel's stage. `briefing → picking →
 * confirmed` is exactly this: briefingActive gates the first, a non-empty pick
 * flips `confirmed`, and the low-clock/no-pick corner raises the auto-pick
 * warning that reflects the untouched server timeout path.
 */
export function champSelectStage(input: StageInput): StageView {
  const confirmed = input.localPick !== "";
  const withinFinal =
    Number.isFinite(input.secondsLeft) && input.secondsLeft > 0 && input.secondsLeft <= AUTO_PICK_WARN_SEC;
  return {
    stage: input.briefingActive ? "briefing" : "picking",
    confirmed,
    autoPickImminent: withinFinal && !confirmed,
  };
}

// ---------------------------------------------------------------------------
// responsive layout (mobile champ-select fix)
// ---------------------------------------------------------------------------

export interface ChampProfileLayout {
  /**
   * true on phones: the profile block FLOWS at its natural height inside an
   * OUTER scroll container (no inner tab-body scroll of its own) and the two
   * columns STACK vertically. Desktop keeps the fixed two-column layout with
   * each column scrolling internally.
   */
  compact: boolean;
  /** stack the profile above the roster (single outer scroll) vs side-by-side. */
  stacked: boolean;
  /**
   * px height of the 3D stage. On a phone-landscape viewport (~390px tall) the
   * desktop 300px stage is taller than the whole clipped panel, so it pushed the
   * tabs + text detail out of view — it is shrunk here so the intro stays
   * readable. Desktop is unchanged (300).
   */
  stageHeight: number;
}

/**
 * The champ-select profile layout for the current device. Pure so the "phones
 * stack + shrink the stage, desktop is untouched" contract is a testable fact
 * rather than a literal buried in the panel's style objects.
 *
 * On touch the whole picker becomes a single vertical scroll (profile over
 * roster) with a shrunk 3D stage, so the tabbed introduction is always reachable
 * even on the ~260px of content height a phone-landscape viewport leaves once the
 * persistent top chrome is cleared (#107). Desktop keeps the side-by-side,
 * internally-scrolling two-column layout with the full-size stage.
 */
export function champSelectProfileLayout(opts: {
  touch: boolean;
  viewportHeight: number;
}): ChampProfileLayout {
  if (!opts.touch) return { compact: false, stacked: false, stageHeight: 300 };
  // phone: a shorter stage on the shortest (landscape) viewports so more of the
  // intro text is above the fold before any scroll.
  const stageHeight = opts.viewportHeight < 480 ? 168 : 220;
  return { compact: true, stacked: true, stageHeight };
}

// ---------------------------------------------------------------------------
// a champ-select seat for skillRows (no entity yet → rank-1 preview values)
// ---------------------------------------------------------------------------

/**
 * The seat projection `skillRows` needs to show a champion's kit BEFORE any
 * point is spent. Ranks/cooldowns are zero (so the shared selector falls back to
 * its designed rank-1 preview), and the EX is forced VISIBLE at rank 1 — in
 * champ select there is no entity to unlock it, but the whole point of the
 * profile is to compare the full kit, EX included, before committing.
 */
export function champSelectSkillSeat(def: ChampionDef): SkillDetailSeat {
  return {
    championId: def.id,
    abilityRanks: [0, 0, 0, 0],
    cooldowns: [0, 0, 0, 0],
    exAbilityId: def.exAbility ?? "",
    exRank: def.exAbility ? 1 : 0,
    exCooldown: 0,
  };
}

// ---------------------------------------------------------------------------
// the free-text description → labelled sub-sections
// ---------------------------------------------------------------------------

/** Read the optional imported `description` off a def whose TS type omits it. */
export function championDescription(def: ChampionDef): string | undefined {
  const d = (def as { description?: unknown }).description;
  return typeof d === "string" && d.trim().length > 0 ? d : undefined;
}

/** The section keys the parser fills (all string-valued, so a computed write is safe). */
export type DescriptionSectionKey = "story" | "recommend" | "difficulty" | "growth" | "skills";

export type DescriptionSections = {
  /** 故事 — the lore block */
  story?: string;
  /** 推薦玩家 — who the map recommends this champion for */
  recommend?: string;
  /** 上手度 — the map's difficulty rating */
  difficulty?: string;
  /** 角色成長 — the per-level growth text (already shown numerically; kept for完整性) */
  growth?: string;
  /** 可學習的技能 — the skill-name list (already shown as rows; kept for完整性) */
  skills?: string;
  /** whether any recognised header was found at all */
  hasSections: boolean;
};

/** header token → section key. The map writes these verbatim in `description`. */
const SECTION_HEADERS: ReadonlyArray<[RegExp, DescriptionSectionKey]> = [
  [/^故事$/, "story"],
  [/^推薦玩家$/, "recommend"],
  [/^上手度$/, "difficulty"],
  [/^角色成長$/, "growth"],
  [/^可學習的技能$/, "skills"],
];

/** Match a line that opens a section: `<header> [:：] <rest>`. */
const HEADER_LINE = /^\s*([一-鿿]{2,6})\s*[:：]\s*(.*)$/;

/**
 * Split the map's `description` into its labelled sub-sections. The w3x text is
 * a single field with headers like 「故事：」「推薦玩家 : 」「上手度 : 」; this
 * pulls each one out verbatim so the profile can show them as 地圖原文, without
 * inventing or rewording anything. Unknown headers and free text before the
 * first header are ignored (they belong to no profile section).
 */
export function parseDescriptionSections(description: string | null | undefined): DescriptionSections {
  const out: DescriptionSections = { hasSections: false };
  if (typeof description !== "string" || description.trim() === "") return out;

  const lines = description.replace(/\r\n/g, "\n").split("\n");
  let currentKey: DescriptionSectionKey | null = null;
  const buffers = new Map<DescriptionSectionKey, string[]>();

  const push = (key: DescriptionSectionKey, text: string): void => {
    if (!buffers.has(key)) buffers.set(key, []);
    if (text.trim() !== "") buffers.get(key)!.push(text);
  };

  for (const line of lines) {
    const m = HEADER_LINE.exec(line);
    const header = m?.[1];
    const key = header ? SECTION_HEADERS.find(([re]) => re.test(header))?.[1] : undefined;
    if (key) {
      currentKey = key;
      out.hasSections = true;
      push(key, m![2] ?? "");
      continue;
    }
    if (currentKey) push(currentKey, line);
  }

  for (const [key, parts] of buffers) {
    const joined = parts.join("\n").trim();
    if (joined !== "") out[key] = joined;
  }
  return out;
}
