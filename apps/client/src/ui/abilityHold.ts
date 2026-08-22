/**
 * abilityHold — the "which ability button is PRESSED-AND-HELD right now" seam
 * (task #152). A HOLD — mouse-down on a desktop ability tile, a finger down on a
 * touch ability button, a pad face button, a **held Q/W/E/R/F/D key**, or a
 * **mouse HOVER** over a desktop tile (both GH#367) — drives two previews at once:
 *   ⛔ (2026-08-22 退休) ui/AbilityDescriptionOverlay —— owner:「不需要那麼大的
 *     TOP of the screen, and
 *   • render/AimIndicator — the dashed cast-RANGE ring + AoE disc on the floor
 *     (GameApp reads `getHeldAbility()` every frame and resolves it against the
 *     live self position + combat-env `abilityRange` factor).
 *
 * Two consumers, two access shapes, ONE source of truth: a plain-mutable held
 * slot with a tiny subscribe list (the same framework-free store pattern as
 * cursor/useCursor). React reads it reactively via `useHeldAbility`; the
 * imperative render loop reads `getHeldAbility()` with no React coupling. Setting
 * it is a synchronous DOM-event call from the owning bar (press → slot, release →
 * null), so nothing here runs per frame.
 *
 * `describeHeldAbility` is the pure content resolver (no DOM/React) shared by the
 * overlay — it turns a seat + slot into the SAME name/description/meta the
 * ability-bar tooltip shows, so the held panel can never disagree with the tile.
 */
import { useSyncExternalStore } from "react";
import { Abilities, Champions, championPassive } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { CastableSlot, ChampionAbilitySlot, CoreAbilitySlot } from "@ggd/shared/sim/intents";
import { exSlotView, type ExSlotSeat } from "./exSlot";
import { innateCastNote, innateKindLabel, passiveSlotView, PASSIVE_SLOT_LABEL } from "./passiveSlot";
import {
  abilityMetaChips,
  castTypeLabel,
  docDescription,
  stripAbilityNumber,
} from "./components/abilityText";
import type { TooltipMeta } from "./components/Tooltip";
import { abilityConditionLabels } from "@ggd/shared/sim/content/condition";

// ---------------------------------------------------------------------------
// held-slot store (plain mutable + subscribe — never React state)
// ---------------------------------------------------------------------------

// The held slot is a CHAMPION slot (6 values). All six can be held for the
// description panel; five of them plus an ACTIVE 天生技 are also castable.
let held: ChampionAbilitySlot | null = null;
const listeners = new Set<() => void>();

/**
 * HOW LOUD a hold is (GH#367). Two callers ask for the same slot and want
 * DIFFERENT amounts of screen:
 *
 *   • "full" — a PRESS (mouse-down / touch finger / pad face) or a KEY held.
 *     The player committed a button, so both surfaces open: the floor range
 *     guide AND the top-of-screen description banner.
 *   • "aim"  — a mere HOVER of the desktop tile. The floor guide only.
 *     ⚠️ 這不是潔癖：`AbilityBar` 的每一格**本來就有** anchored `Tooltip`
 *     （同一份 `docDescription` + 同一排 meta chips）。hover 再開一次橫跨螢幕
 *     頂端的橫幅 = 同一段文字在畫面上出現兩次,而游標掃過六格就閃六次。
 *     owner 要的是「顯示可施展的**範圍**」,⛔ 不是再來一份說明。
 */
/**
 * ⛔ **2026-08-22 退休。**
 *
 * 它只有一個消費端 —— `AbilityDescriptionOverlay`（`"full"` 才開那個面板），
 * 而 owner 逐字：「**根本不需要顯示那麼大的技能說明區塊，請你移除這個功能到
 * legacy 不要再出現了**」。⇒ 面板沒了，這個型別就沒有意義。
 * ⭐ 留著一個沒有消費端的參數，下一個人會以為它還有作用（第一·五守則）。
 */
export type HoldIntent = "aim";


/** The slot whose button is held right now (null = nothing held). */
export function getHeldAbility(): ChampionAbilitySlot | null {
  return held;
}

/**
 * The held slot AS AN AIM TARGET — what the floor range/AoE telegraph reads.
 *
 * PASSIVE is passed THROUGH now that the sixth slot is castable, and the
 * castability question is answered exactly once, downstream: `GameApp`'s
 * `abilityForSeat` returns an ability for an `innateKind: "active"` innate and
 * null for a permanent one, so a held 主動 innate draws its real range ring and
 * a held 被動 tile still draws nothing. Deciding it here as well would be a
 * second copy of the rule, free to drift from the one that governs the cast.
 */
export function getHeldAimSlot(): CastableSlot | null {
  return held;
}

/**
 * Press → slot, release → null. No-op when unchanged (skips a needless notify).
 *
 * ⛔ `_intent` 是 2026-08-22 之後的**遺跡**：它唯一的用途是「開不開說明橫幅」，
 * 而那個橫幅已經退休（owner:「不需要那麼大的技能說明區塊」）。⭐ 參數留著只是
 * 為了不讓十五個呼叫點在同一個 commit 裡一起改；⛔ 它**不影響任何行為**。
 */
export function setHeldAbility(slot: ChampionAbilitySlot | null, _intent: HoldIntent = "aim"): void {
  if (held === slot) return;
  held = slot;
  for (const cb of listeners) cb();
}

/**
 * Release that may ONLY clear what IT set (GH#367) — the same rule
 * `GamepadInput.PadDescribeHold` already follows, now that keyboard and hover
 * are two more writers to this one global. A keyup for Q that blindly wrote
 * `null` would rip a mouse-held W preview off the floor mid-hold.
 */
export function clearHeldAbility(slot: ChampionAbilitySlot): void {
  if (held === slot) setHeldAbility(null);
}

export function subscribeHeldAbility(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * ⛔ **2026-08-22 退休之後它就等於 `getHeldAbility()`。**
 *
 * 它以前回答的是「說明橫幅該畫哪一格」（`"full"` 才算），而那個橫幅已經移到
 * `docs/legacy/_retired-ui/`。⭐ 留著這個名字只是因為兩條既有的守衛在讀它；
 * ⚠️ 它現在**不再**與 `getHeldAbility()` 有任何差別。
 */
export function getDescribedAbility(): ChampionAbilitySlot | null {
  return held;
}

/** React binding — re-renders a component only when the described slot changes. */
export function useHeldAbility(): ChampionAbilitySlot | null {
  return useSyncExternalStore(subscribeHeldAbility, getDescribedAbility, getDescribedAbility);
}

// ---------------------------------------------------------------------------
// pure content resolver (shared by the overlay; node-testable)
// ---------------------------------------------------------------------------

const SLOT_INDEX: Record<CoreAbilitySlot, number> = { Q: 0, W: 1, E: 2, R: 3 };

/**
 * Why a long press on EX / 天生技 spends no skill point (owner ruling,
 * 2026-07-27, on the gamepad remap: keep long-press-to-level, but a slot that
 * CANNOT level must say so rather than appear to do nothing).
 *
 * These two slots are structurally unrankable — `CommandSystem` refuses a
 * `rankUpAbility` naming EX or the innate, so the pad's `RANK_BY_LONG_PRESS`
 * deliberately omits LB and RB and falls through to this panel. Without a line
 * saying why, a player holding LB with points in hand reads it as a dead
 * button; the four core slots level under the identical gesture, so the
 * inconsistency is the thing that needs explaining, not the description.
 *
 * Exported so the test asserts the SHIPPED string and cannot drift from it.
 */
export const UNRANKABLE_NOTE = {
  EX: "固定強度 · 不吃技能點",
  PASSIVE: "天生 1 級 · 不吃技能點",
} as const;

/** The seat fields the resolver reads (SeatView satisfies this structurally). */
export interface HeldSeat extends ExSlotSeat {
  championId: string;
  abilityRanks: number[];
}

/** Everything the top-of-screen description panel renders for a held slot. */
export interface HeldAbilityInfo {
  /** slot badge — Q/W/E/R/EX/PASSIVE */
  slot: ChampionAbilitySlot;
  /** clean display name (hero/skill number stripped) */
  name: string;
  /** full still-numbered name (kept for the source-of-truth tooltip parity) */
  fullName: string;
  /** description body (role markup preserved) — undefined when the doc has none */
  body?: string;
  /** cast-type / cooldown / mana (+ EX hotkey) chips, same rows as the bar tooltip */
  meta: TooltipMeta[];
  /**
   * 觸發條件 sentences for this skill's proc hooks — 「觸發條件：目標不是英雄 且
   * 目標生命 < 35%」 — DERIVED by `abilityConditionLabels` from the very same
   * `condition` objects `effects/hooks.ts` gates on, never typed into a doc's
   * prose. Empty for every skill that has no gated hook, which is almost all of
   * them, so a consumer simply renders nothing extra.
   *
   * ⚠️ **2026-08-22 起這個欄位在出貨樹上沒有消費端** —— 它唯一的算繪處是那個
   * 退休的橫幅。玩家看得到的觸發條件走的是另一條路：
   * `components/AbilityConditionMark`（技能格右上角的角標，GH#556），它從
   * **同一支** `abilityConditionLabels()` 推導，⛔ 不經過這裡。
   *
   * WHY IT IS ITS OWN FIELD RATHER THAN APPENDED TO `body`. The body is the
   * IMPORTED WC3 prose (role markup, cooldown literals that `rescaleAbilityProse`
   * rewrites against the live combat-env). Splicing a derived sentence into it
   * would put a string the rescaler does not understand inside the string the
   * rescaler rewrites, and would make the 「原作說明」 caption a lie about the
   * paragraph it sits under.
   */
  conditions: string[];
}

/**
 * Resolve a held slot against the local seat into the panel content — the SAME
 * name + docDescription + cost/cooldown/cast-type rows the ability-bar Tooltip
 * builds. Returns null when there is nothing to show (no champion, or a still
 * LOCKED EX slot). Cooldown carries `{ base, factor: "cooldown" }` so the panel
 * renders the live post-multiplier final exactly like the tooltip.
 */
export function describeHeldAbility(seat: HeldSeat, slot: ChampionAbilitySlot): HeldAbilityInfo | null {
  // 天生技 (the SIXTH slot). Its chips lead with 「天生 · 被動/主動」 and say in
  // words that it is owned from level 1 — a held panel that only showed the
  // description would leave the player guessing why the tile has no hotkey.
  if (slot === "PASSIVE") {
    const innate = passiveSlotView(seat.championId);
    if (!innate) return null;
    const meta: TooltipMeta[] = [
      { label: PASSIVE_SLOT_LABEL, value: innateKindLabel(innate.innateKind) },
    ];
    if (innate.innateKind === "active") {
      meta.push({ label: "施法", value: castTypeLabel(innate.castType) });
      if (innate.cooldownSec !== undefined) {
        meta.push({ label: "冷卻", base: innate.cooldownSec, factor: "cooldown", unit: "s" });
      }
      if (innate.manaCost !== undefined) meta.push({ label: "魔力", value: `${innate.manaCost}` });
      // the sixth slot HAS a hotkey now — say it here exactly like EX says F
      meta.push({ label: "快捷", value: "D / ✛↑" });
    }
    meta.push({ label: "取得", value: innateCastNote(innate.innateKind, innate.effective) });
    meta.push({ label: "等級", value: UNRANKABLE_NOTE.PASSIVE });
    const info: HeldAbilityInfo = {
      slot,
      name: innate.displayName,
      fullName: innate.name,
      meta,
      // The 天生技 is where gated procs actually live today (獸矛-shaped cards are
      // all innates), so this branch is the one that matters most.
      conditions: abilityConditionLabels(championPassive(seat.championId as ChampionId) ?? {}),
    };
    if (innate.description !== undefined) info.body = innate.description;
    return info;
  }

  if (slot === "EX") {
    const ex = exSlotView(seat);
    if (!ex) return null;
    const meta: TooltipMeta[] = [
      { label: "EX 技能", value: castTypeLabel(ex.castType) },
      { label: "冷卻", base: ex.cooldownSec, factor: "cooldown", unit: "s" },
    ];
    if (ex.manaCost !== undefined) meta.push({ label: "魔力", value: `${ex.manaCost}` });
    meta.push({ label: "快捷", value: "F / Back" });
    meta.push({ label: "等級", value: UNRANKABLE_NOTE.EX });
    const info: HeldAbilityInfo = {
      slot,
      name: stripAbilityNumber(ex.name),
      fullName: ex.name,
      meta,
      // The EX view is a presentation projection; the gate lives on the DEF, so
      // this re-resolves it rather than widening `ExSlotView` for one caller.
      conditions: abilityConditionLabels(
        Abilities.tryGet(seat.exAbilityId as AbilityId) ?? {},
      ),
    };
    if (ex.description !== undefined) info.body = ex.description;
    return info;
  }

  if (!seat.championId) return null;
  const def = Champions.tryGet(seat.championId as ChampionId);
  if (!def) return null;
  const ability = def.abilities[slot];
  const rank = seat.abilityRanks[SLOT_INDEX[slot]] ?? 0;
  // rank-scaled numbers (rank-1 values before the ability is learned), mirroring
  // the AbilityBar tooltip so a held panel and its tile never disagree.
  const cdMeta = ability.cooldown[Math.max(0, rank - 1)] ?? ability.cooldown[0] ?? 0;
  const manaMeta = ability.manaCost[Math.max(0, rank - 1)] ?? ability.manaCost[0] ?? 0;
  const info: HeldAbilityInfo = {
    slot,
    name: stripAbilityNumber(ability.name),
    fullName: ability.name,
    meta: abilityMetaChips({
      castType: ability.castType,
      cooldownSec: cdMeta,
      manaCost: manaMeta,
    }),
    conditions: abilityConditionLabels(ability),
  };
  const body = docDescription(ability);
  if (body !== undefined) info.body = body;
  return info;
}
