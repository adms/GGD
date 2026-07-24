/**
 * skillDetails — the per-slot 技能詳情 the prep window shows: full description,
 * cooldown, cost and rank for Q/W/E/R, plus the champion's PASSIVE and its EX.
 *
 * ---------------------------------------------------------------------------
 * IT REUSES THE EXISTING PARSING LAYER — there is no third parser here
 * ---------------------------------------------------------------------------
 * Task #71 (content codex) and task #76 (champ-select profile) both build over
 * the same imported champion data, and the rule was: SHARE it. So this module
 * composes what already exists and adds nothing of its own:
 *
 *   • `ui/components/abilityText` — `stripAbilityNumber` (drops the task #11
 *     「NN-0X 」hero-number prefix so the panel shows the real skill name),
 *     `docDescription` (reads the w3x-recovered description off a def whose TS
 *     type does not declare it) and `castTypeLabel`.
 *   • `ui/exSlot` — `exSlotView`, the one place that decides whether an EX slot
 *     shows at all and what it reads. The AbilityBar and the touch bar already
 *     use it; reproducing its "no EX / still locked" logic here is exactly the
 *     duplication the instruction forbids.
 *   • the shared `Champions` / `Abilities` registries — the SAME defs the
 *     server casts with, so a number on this panel cannot disagree with the
 *     number the sim uses.
 *
 * Pure + node-testable: a plain selector over a seat projection, no React.
 */
import { TICK_HZ } from "@ggd/shared/constants";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { castTypeLabel, docDescription, stripAbilityNumber } from "../components/abilityText";
import { exSlotView, type ExSlotSeat } from "../exSlot";
import { passiveSlotView, type InnateKind } from "../passiveSlot";

/**
 * Slot label as shown on the row. "PASSIVE" is the SIXTH slot — the 天生技 the
 * champion owns from level 1 (never learned, never ranked); "EX" is the fifth.
 */
export type SkillRowSlot = CoreAbilitySlot | "EX" | "PASSIVE";

export interface SkillRow {
  readonly slot: SkillRowSlot;
  /** display name with the 「NN-0X 」hero-number prefix stripped */
  readonly name: string;
  /** the numbered name as authored — kept for the codex cross-reference */
  readonly rawName: string;
  /** w3x-recovered description, or undefined when the map carried none */
  readonly description?: string;
  /** current rank (0 = not learned); EX is 0/1, PASSIVE is always 1 */
  readonly rank: number;
  /**
   * Only on the PASSIVE row: which SHAPE the innate takes — "passive" (no
   * cooldown, permanently on, never pressable) or "active" (a real-cooldown
   * WC3 D-slot ability, still owned from level 1). The view needs it because a
   * 天生技 must never read as a button that does nothing.
   */
  readonly innateKind?: InnateKind;
  /** maximum rank; 1 for EX and PASSIVE */
  readonly maxRank: number;
  /** cooldown at the CURRENT rank in seconds (rank-1 value before learning) */
  readonly cooldownSec?: number;
  /** mana cost at the current rank; omitted when free */
  readonly manaCost?: number;
  /**
   * BASE cast range in world units (pre combat-env). The view multiplies it by
   * the live `abilityRange` factor via displayFinal (task #136), exactly as it
   * does the cooldown — so the panel shows the shrunk final, not the raw base.
   */
  readonly range?: number;
  /** BASE AoE radius / skillshot width (pre combat-env); omitted when the ability has none. */
  readonly radius?: number;
  /** 施法方式 label (鎖定 / 技能預測 / 地面指定 / 自身 / 位移) */
  readonly castLabel?: string;
  /** remaining cooldown in seconds right now (0 = ready) */
  readonly cooldownLeftSec: number;
  /** w3x icon path, or undefined → the panel draws its letter tile */
  readonly icon?: string;
  /** false = the row is shown greyed with a "尚未學習" note */
  readonly learned: boolean;
}

/** The seat fields this selector reads (a subset of RoomStore's SeatView). */
export interface SkillDetailSeat extends ExSlotSeat {
  championId: string;
  abilityRanks: number[];
  cooldowns: number[];
}

const CORE_SLOTS: CoreAbilitySlot[] = ["Q", "W", "E", "R"];

/**
 * Build every skill row for a seat, in reading order: 被動, Q, W, E, R, EX.
 * Returns [] when the seat has not picked (or the champion is not registered),
 * so the panel can simply render nothing.
 */
export function skillRows(seat: SkillDetailSeat): SkillRow[] {
  const def = seat.championId ? Champions.tryGet(seat.championId as ChampionId) : undefined;
  if (!def) return [];
  const rows: SkillRow[] = [];

  // ── 天生技 (the SIXTH slot) ───────────────────────────────────────────────
  // The recovered NN-00 innate, resolved through `passiveSlotView` →
  // `championPassive()` — the standalone doc named by `champion.passiveAbility`.
  // It is listed FIRST because the champion owns it from level 1, before any
  // point is ever spent. Rank is fixed at 1/1: it is never learned or ranked.
  //
  // FALLBACK: `champion.passive` is the LEGACY hook/modifier block that 7
  // champion docs still carry. It is not a slot, but for those heroes it is the
  // only passive text there is, so it fills the row when no NN-00 was recovered.
  const innate = passiveSlotView(seat.championId);
  if (innate) {
    const row: SkillRow = {
      slot: "PASSIVE",
      name: innate.displayName,
      rawName: innate.name,
      rank: 1,
      maxRank: 1,
      innateKind: innate.innateKind,
      cooldownLeftSec: 0,
      learned: true,
    };
    rows.push({
      ...row,
      // an active innate carries real cast numbers; a pure passive carries none
      ...(innate.cooldownSec !== undefined ? { cooldownSec: innate.cooldownSec } : {}),
      ...(innate.manaCost !== undefined ? { manaCost: innate.manaCost } : {}),
      ...(innate.innateKind === "active" ? { castLabel: castTypeLabel(innate.castType) } : {}),
      ...(innate.description !== undefined ? { description: innate.description } : {}),
      ...(innate.icon !== undefined ? { icon: innate.icon } : {}),
    });
  } else if (def.passive?.name) {
    const passive: SkillRow = {
      slot: "PASSIVE",
      name: stripAbilityNumber(def.passive.name),
      rawName: def.passive.name,
      rank: 1,
      maxRank: 1,
      innateKind: "passive",
      cooldownLeftSec: 0,
      learned: true,
    };
    const desc = docDescription(def.passive);
    rows.push(desc === undefined ? passive : { ...passive, description: desc });
  }

  // ── Q / W / E / R ─────────────────────────────────────────────────────────
  CORE_SLOTS.forEach((slot, i) => {
    const ability = def.abilities[slot];
    if (!ability) return;
    const rank = seat.abilityRanks[i] ?? 0;
    // rank-scaled numbers, falling back to the rank-1 values before learning so
    // the player can compare skills BEFORE spending a point on one
    const idx = Math.max(0, rank - 1);
    const cd = ability.cooldown[idx] ?? ability.cooldown[0];
    const mana = ability.manaCost[idx] ?? ability.manaCost[0];
    const row: SkillRow = {
      slot,
      name: stripAbilityNumber(ability.name),
      rawName: ability.name,
      rank,
      maxRank: ability.maxRank,
      castLabel: castTypeLabel(ability.castType),
      cooldownLeftSec: (seat.cooldowns[i] ?? 0) / TICK_HZ,
      learned: rank > 0,
    };
    rows.push({
      ...row,
      ...(cd !== undefined ? { cooldownSec: cd } : {}),
      ...(mana !== undefined && mana > 0 ? { manaCost: mana } : {}),
      // BASE range/radius; the view applies the combat-env `abilityRange` factor
      ...(ability.range > 0 ? { range: ability.range } : {}),
      ...(ability.radius !== undefined && ability.radius > 0 ? { radius: ability.radius } : {}),
      ...(docDescription(ability) !== undefined ? { description: docDescription(ability) } : {}),
      ...(ability.icon !== undefined ? { icon: ability.icon } : {}),
    });
  });

  // ── EX 技能 ───────────────────────────────────────────────────────────────
  // exSlotView returns null for a hero with no EX and for one whose EX has not
  // unlocked yet, which is exactly the row's visibility rule — reused, not
  // reimplemented.
  const ex = exSlotView(seat);
  if (ex) {
    const row: SkillRow = {
      slot: "EX",
      name: stripAbilityNumber(ex.name),
      rawName: ex.name,
      rank: 1,
      maxRank: 1,
      cooldownSec: ex.cooldownSec,
      castLabel: castTypeLabel(ex.castType),
      cooldownLeftSec: ex.cdSecs,
      learned: true,
    };
    rows.push({
      ...row,
      ...(ex.manaCost !== undefined ? { manaCost: ex.manaCost } : {}),
      ...(ex.description !== undefined ? { description: ex.description } : {}),
      ...(ex.icon !== undefined ? { icon: ex.icon } : {}),
    });
  }

  return rows;
}

/**
 * Row label for the slot column ("天生" / "EX" / the hotkey letter).
 *
 * NOT "被動": half the recovered NN-00 innates are real active abilities, so
 * labelling the slot 被動 would be a lie on ~57 champions. The slot is 天生
 * (owned from level 1); whether it is 被動 or 主動 is `row.innateKind`, shown
 * beside it via `innateKindLabel`.
 */
export function slotLabel(slot: SkillRowSlot): string {
  if (slot === "PASSIVE") return "天生";
  return slot;
}
