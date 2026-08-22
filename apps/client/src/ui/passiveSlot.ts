/**
 * passiveSlotView — the pure "what does the SIXTH slot read" logic, the exact
 * mirror of `ui/exSlot`'s role for the 5th.
 *
 * ---------------------------------------------------------------------------
 * WHY A SIXTH SLOT EXISTS
 * ---------------------------------------------------------------------------
 * 「每個人應該是六種，被動也是包含 slot，我說過他是等級1就獲得」 — every champion
 * in the source map owns Q/W/E/R/EX **plus a 天生技 (innate) it has from level 1**.
 * The importer dropped it; the NN-00 recovery put it back as a STANDALONE ability
 * doc referenced by `champion.passiveAbility`, so the resolution seam is the
 * shared registry helper `championPassive()` — never an embedded copy, never the
 * legacy `champion.passive` hook block (that is a modifier bag on 7 champion
 * docs, not a slot).
 *
 * TWO KINDS, ONE SLOT (`AbilityDef.innateKind`):
 *   • "passive" — no cooldown, [被動]/[靈氣]: auras, evasion, on-hit procs. It is
 *     NEVER pressable; the tile must not look like a button that does nothing.
 *   • "active"  — a real-cooldown WC3 D-slot ability. Still owned from level 1,
 *     but it is a castable-shaped thing, so it must be visually distinguishable
 *     from a pure passive.
 *
 * `ChampionAbilitySlot` (shared/sim/intents) is the 6-value enum; `AbilitySlot`
 * stays 5-valued on purpose so a RANK-UP command can still only name a rankable
 * slot — the innate is castable but never rankable. This module returns view
 * data only: it never issues a command. The BARS now do, for the "active" half —
 * keyboard **D**, the touch 天生 button and gamepad d-pad-up all cast it; the
 * "passive" half still has no hotkey anywhere, because there is nothing to cast.
 *
 * Pure + node-testable: no React, no DOM.
 */
import { championPassive } from "@ggd/shared/sim/content/registry";
import { zAbilityPassiveRank } from "@ggd/shared/content/schema/effect";
import type { ChampionId } from "@ggd/shared/ids";
import type { CastType } from "@ggd/shared/sim/content/defs";
import { docDescription, stripAbilityNumber } from "./components/abilityText";

/** The two shapes an innate NN-00 can take. Defaults to "passive" when unset. */
export type InnateKind = "passive" | "active";

export interface PassiveSlotView {
  /** standalone ability doc id (`<championId>.passive`) */
  id: string;
  /** display name as authored — still carries the 「NN-00 」hero-number prefix */
  name: string;
  /** name with the hero-number prefix stripped (what a tile shows) */
  displayName: string;
  /** w3x-recovered description, or undefined when the map carried none */
  description?: string;
  /** w3x icon path, or undefined → the caller draws its 天生 fallback tile */
  icon?: string;
  /** "passive" = never pressable; "active" = a real-cooldown D-slot innate */
  innateKind: InnateKind;
  /**
   * TRUE when this innate currently DOES SOMETHING in a match:
   *   • an "active" innate — it has authored `effects` and is cast on D;
   *   • a "passive" innate whose `passive.ranks[0]` carries at least one
   *     modifier, hook or aura, which `syncAbilityPassives` attaches at spawn.
   *
   * FALSE means the doc is a NAME AND A DESCRIPTION AND NOTHING ELSE — 29 of the
   * 48 permanent innates are exactly that today (`12-00 感應意脈` promises 20 %
   * physical evasion and ships `modifiers: []`). Those 29 are indistinguishable
   * from the 19 that work unless someone says so, which is how a champion can
   * feel "just weaker" for a whole match with nothing reporting a problem. The
   * bars render them with {@link INNATE_INERT_NOTE} instead of the confident
   * 「永久生效」 caption — see `innateCastNote`.
   *
   * This is a HONEST-LABEL flag, not a feature switch: nothing about the sim
   * changes, the doc simply admits what it contains. Authoring the 29 missing
   * effect blocks is content work and a separate batch.
   */
  effective: boolean;
  /** full cooldown in seconds — omitted for a pure passive (always 0) */
  cooldownSec?: number;
  /** mana cost — omitted when free */
  manaCost?: number;
  /** cast type, for the 施法 meta chip on an active innate */
  castType: CastType;
}

/** Slot badge for the innate. NOT "被動" — half of them are active abilities. */
export const PASSIVE_SLOT_LABEL = "天生";

/** The whole point of the slot: it is owned from level 1, never learned. */
export const PASSIVE_LEVEL_NOTE = "等級 1 起自動擁有";

/** Violet accent — deliberately not any Q/W/E/R blue-green or the EX amber. */
export const PASSIVE_ACCENT = "#a98cf0";

/** 被動 / 主動 — the sub-kind shown next to the 天生 badge. */
export function innateKindLabel(kind: InnateKind): string {
  return kind === "active" ? "主動" : "被動";
}

/**
 * Said for a permanent innate whose doc carries NO modifier, hook or aura — the
 * 29 that are a name and a description and nothing else. Deliberately blunt:
 * the alternative is 「永久生效」 on a tile that grants nothing, which is the
 * silent-failure shape this whole sweep exists to delete. It names the state
 * (未實作) rather than blaming the player's understanding.
 */
export const INNATE_INERT_NOTE = "天生被動 · 效果尚未移植（目前無作用）";

/**
 * One line of copy that makes the tile's castability honest.
 *   • active            — a real ability the map gives you at level 1, cast on D
 *   • passive, working  — permanently on, no button
 *   • passive, INERT    — {@link INNATE_INERT_NOTE}: it is not doing anything
 *
 * `effective` defaults to true so an older caller that passes only the kind
 * keeps the previous wording; every bar passes the real flag.
 */
export function innateCastNote(kind: InnateKind, effective = true): string {
  if (kind === "active") return "天生主動技 · 等級 1 起自動擁有（按 D 施放）";
  return effective ? "天生被動 · 永久生效，不需施放" : INNATE_INERT_NOTE;
}

/**
 * Resolve a champion's SIXTH slot. Returns null when the champion genuinely has
 * no NN-00 — three of the 111 heroes really do not have one (godie-h02n 腦包英雄,
 * godie-u01q 測試英雄, godie-ogld 美白大法師), and that absence is a RECOVERED
 * FACT, not a gap to paper over: those three simply show five slots.
 */
export function passiveSlotView(championId: string | null | undefined): PassiveSlotView | null {
  if (!championId) return null;
  const def = championPassive(championId as ChampionId);
  if (!def) return null;
  const kind: InnateKind = def.innateKind ?? "passive";
  const view: PassiveSlotView = {
    id: def.id,
    name: def.name,
    displayName: stripAbilityNumber(def.name),
    innateKind: kind,
    castType: def.castType,
    effective: kind === "active" ? def.effects.length > 0 : passiveRankGrantsSomething(def),
  };
  if (def.icon !== undefined) view.icon = def.icon;
  const cd = def.cooldown[0];
  if (cd !== undefined && cd > 0) view.cooldownSec = cd;
  const mana = def.manaCost[0];
  if (mana !== undefined && mana > 0) view.manaCost = mana;
  const desc = docDescription(def);
  if (desc !== undefined) view.description = desc;
  return view;
}

/**
 * ⛔ 一個 rank 區塊裡**不是酬載**的欄位 —— 它們是「這一階掛不掛得上去」的**閘**，
 * 填了它們一格東西都不會多出來（`sim/abilities/abilityPassives.ts::rankBlock`
 * 逐格問過去，兩格都填 = AND）。
 *
 * ⚠️ 這是 {@link PASSIVE_RANK_PAYLOAD_KEYS} 唯一手寫的一半，而它是**刻意**的那一半：
 * 推導方向選成「schema 的欄位**預設**是酬載，扣掉這裡列名的閘」，於是
 * **新增一種酬載自動被算進去**（GH#604 就是漏算了兩種而說了四次謊），
 * 而新增一個**閘**忘了登記會讓一支真的空的天生技被標成「已實作」——
 * 那個方向由守衛的第二條斷言（52-00 十二道試煉必須仍然是「未實作」）擋住。
 */
export const PASSIVE_RANK_GATES: ReadonlySet<string> = new Set(["whileForm", "whileStatus"]);

/**
 * ⭐ GH#604 —— 一個 rank 區塊**可能帶哪些酬載**，從出貨的 Zod
 * （`zAbilityPassiveRank`）**推導**，⛔ 不是手寫的三格。
 *
 * 在它之前這裡逐字寫著 `modifiers` / `hooks` / `auras` 三格，而 schema 早就長到
 * 七格（`SOURCE_GRANT_SHAPE` 展開的 `flight` / `vision` / `block` / `deathWard` /
 * `critStrike` / `attributes` / `penetration`…）。⇒ 全遊戲印「未實作」的 **5 格
 * 天生技裡有 4 格是謊話**：04-00 翔封界（`flight`，兩份鏡射）、20-00 銀色甲胄
 * （`block`）、21-00 灼眼（`vision`）—— 三支整場都在生效，而卡面上寫著它們沒有。
 *
 * ⛔ 白名單型判準的失敗方向永遠是**靜默地把真的東西標成假的**，
 * 而「它有沒有漏列一種酬載」從來不是任何斷言的反面 —— 所以判準要從 schema 長出來。
 */
export const PASSIVE_RANK_PAYLOAD_KEYS: readonly string[] = Object.keys(
  zAbilityPassiveRank.shape,
).filter((k) => !PASSIVE_RANK_GATES.has(k));

/** 一格酬載「真的有東西」嗎。空陣列 / 空物件 / false 都是**沒有**。 */
function payloadPresent(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/**
 * Does a PERMANENT innate's rank-1 block actually grant anything?
 *
 * `syncAbilityPassives` attaches `passive.ranks[0]` as a ModifierSource at
 * spawn, and the sim reads EVERY payload field off that source without ever
 * asking `kind` — so the question is simply「這個區塊裡有沒有**任何一種**酬載」,
 * and the list of payload kinds is {@link PASSIVE_RANK_PAYLOAD_KEYS}（推導的）.
 * A block with none of them attaches a source that carries nothing — the hero
 * spawns, the tile lights up, and no number anywhere is different.
 *
 * Rank 1 is the only column an innate ever has (`maxRank: 1`), so this is the
 * whole question for the sixth slot.
 */
export function passiveRankGrantsSomething(def: {
  passive?: { ranks: readonly unknown[] };
}): boolean {
  const rank0 = def.passive?.ranks[0] as Record<string, unknown> | undefined;
  if (!rank0) return false;
  return PASSIVE_RANK_PAYLOAD_KEYS.some((k) => payloadPresent(rank0[k]));
}
