/**
 * 回到原廠設定 — pure logic behind the 內容白名單 page's reset panel.
 *
 * WHAT IT IS. The whitelist has always had 聯集 (⭐ 啟用示範組合, union-only),
 * 全開 (break-glass) and 清空 (全部停用). The missing cell on that grid is
 * REPLACE-WITH-STARTER, which is what the owner asked for on 2026-08-02:
 * 「我要 ggd.adms.ai 英雄白名單 是預設的」.
 *
 * WHY THIS FILE OWNS NO ANSWERS. Every number here is DERIVED at view time from
 * two live reads — `GET /curation/whitelist` and `GET /curation/whitelist/starter`
 * — plus the shipped `championForms` table. There is not one hard-coded champion
 * id, count or 「今天差 10 隻」 constant, and that is load-bearing rather than
 * tidy: on 2026-08-02 all ten disabled champions happened to be 變身態 whose
 * base bodies stay enabled, so the reset was a VISUAL NO-OP in champ-select.
 * That is a coincidence of today's whitelist. The moment the owner enables one
 * base champion the starter does not carry, the same button turns a real hero
 * off — and this module has to say so on its own, in red, without anyone
 * remembering to update it.
 *
 * WHAT THE SERVER DOES INSTEAD. The actual write is
 * `POST /curation/whitelist/reset` (apps/platform/internal/curation/reset.go),
 * which recomputes the same plan under its own mutex and enforces the
 * empty-whitelist floor. This module is the PREVIEW and the confirmation copy;
 * it is deliberately not the thing that decides what gets written, because a
 * client-computed replace body is a read-modify-write with a network round trip
 * and a human pause in the middle of it.
 */
import { baseFormIdOf, CHAMPION_SPLIT_FORMS, isTransformedBody } from "@ggd/shared/content/championForms";
import { abilityIdsFor, missingAbilitySlots } from "./quickApproval";
import { KINDS, KIND_LABEL, type Kind, type StarterBundle, type WhitelistDoc } from "./curation";

export type ResetKind = Kind;

/** Re-exported so the page does not import two modules for one dropdown. */
export { KINDS as RESET_KINDS, KIND_LABEL as RESET_KIND_LABEL };

/**
 * The base (pickable) champion an id belongs to.
 *
 * `baseFormIdOf` only resolves `Emeu` ALTERNATE pairs; the `Nef1` SPLIT bodies
 * (巴恩's three 魔界之王 tiers) live in a second table and would otherwise
 * resolve to themselves and be mis-reported as real heroes. Asking
 * `isTransformedBody` without also resolving split bodies is the exact bug
 * `championForms.ts` documents.
 */
export function baseChampionOf(id: string): string {
  const alt = baseFormIdOf(id);
  if (alt !== id) return alt;
  for (const split of CHAMPION_SPLIT_FORMS) {
    if (split.tiers.some((t) => t.championId === id)) return split.baseId;
  }
  return id;
}

/**
 * How a champion being turned off actually lands for a player. These three read
 * completely differently on screen, and collapsing them into one number is what
 * would make the panel lie on the day the delta stops being all-變身態.
 */
export type ChampionOffClass =
  /** A transformed body whose base stays enabled → champ-select is unchanged. */
  | "form-base-kept"
  /** A transformed body whose base is ALSO gone → the character disappears. */
  | "form-base-lost"
  /** A base champion → it disappears from champ-select. */
  | "real-hero";

export interface ChampionOffRow {
  id: string;
  /** Display name when the content tree gave us one, else the id. */
  name: string;
  /** False when no champion doc was supplied for this id. */
  named: boolean;
  cls: ChampionOffClass;
  /** The base body this id resolves to (itself for a base champion). */
  baseId: string;
  /** Whether that base is enabled in the POST-reset whitelist. */
  baseStaysEnabled: boolean;
}

/** True when this row is a champion a player would notice vanishing. */
export function isVisibleLoss(row: ChampionOffRow): boolean {
  return row.cls !== "form-base-kept";
}

export interface KindPlan {
  kind: ResetKind;
  liveCount: number;
  starterCount: number;
  /** live has it, starter does not → the reset turns it OFF. */
  off: string[];
  /** starter has it, live does not → the reset turns it ON. */
  on: string[];
  unchanged: number;
}

export interface ResetRefusal {
  reason: "empty-starter";
  kinds: ResetKind[];
}

export interface ResetPlan {
  byKind: Record<ResetKind, KindPlan>;
  /** The three-way classification of the champions that would be turned off. */
  championsOff: ChampionOffRow[];
  /** Non-null when the plan cannot be executed at all. */
  refuse: ResetRefusal | null;
}

export interface BuildResetPlanInput {
  live: WhitelistDoc;
  starter: StarterBundle;
  /** id → display name, from /content/champions/<id>.json. Optional. */
  championNames?: ReadonlyMap<string, string>;
}

function diff(a: readonly string[], b: readonly string[]): string[] {
  const has = new Set(b);
  return a.filter((id) => !has.has(id)).sort();
}

/**
 * The whole plan, computed from the two live documents.
 *
 * NOTE the classification asks the STARTER champion set — not the live one —
 * whether a base body survives, because the question is 「after the reset, is
 * the hero still there?」. Asking the live set would answer a question nobody
 * is about to act on and would render 變身態 as harmless in exactly the case
 * where they are not.
 */
export function buildResetPlan(input: BuildResetPlanInput): ResetPlan {
  const { live, starter, championNames } = input;

  const byKind = {} as Record<ResetKind, KindPlan>;
  const emptyKinds: ResetKind[] = [];
  for (const kind of KINDS) {
    const off = diff(live[kind], starter[kind]);
    const on = diff(starter[kind], live[kind]);
    byKind[kind] = {
      kind,
      liveCount: live[kind].length,
      starterCount: starter[kind].length,
      off,
      on,
      unchanged: live[kind].length - off.length,
    };
    if (starter[kind].length === 0) emptyKinds.push(kind);
  }

  const starterChampions = new Set(starter.champions);
  const championsOff: ChampionOffRow[] = byKind.champions.off.map((id) => {
    const baseId = baseChampionOf(id);
    const transformed = isTransformedBody(id);
    const baseStaysEnabled = starterChampions.has(baseId);
    const cls: ChampionOffClass = !transformed
      ? "real-hero"
      : baseStaysEnabled
        ? "form-base-kept"
        : "form-base-lost";
    const name = championNames?.get(id);
    return { id, name: name ?? id, named: name !== undefined, cls, baseId, baseStaysEnabled };
  });

  return {
    byKind,
    championsOff,
    refuse: emptyKinds.length > 0 ? { reason: "empty-starter", kinds: emptyKinds } : null,
  };
}

// ------------------------------------------------- selection-dependent ------
// The scope checkboxes change the answer to every one of these, so none of them
// can be a field on the plan.

/** The document the reset would produce for this scope selection. */
export function resetResultDoc(
  live: WhitelistDoc,
  starter: StarterBundle,
  selected: ReadonlySet<ResetKind>,
): WhitelistDoc {
  const next: WhitelistDoc = { ...live };
  for (const kind of KINDS) {
    if (selected.has(kind)) next[kind] = [...starter[kind]].sort();
  }
  return next;
}

/** How many ids the selected scopes turn OFF — the number the operator types. */
export function totalOff(plan: ResetPlan, selected: ReadonlySet<ResetKind>): number {
  let n = 0;
  for (const kind of KINDS) if (selected.has(kind)) n += plan.byKind[kind].off.length;
  return n;
}

/** How many ids the selected scopes turn ON (items are BIDIRECTIONAL). */
export function totalOn(plan: ResetPlan, selected: ReadonlySet<ResetKind>): number {
  let n = 0;
  for (const kind of KINDS) if (selected.has(kind)) n += plan.byKind[kind].on.length;
  return n;
}

/** Champions that would visibly disappear, for the selected scopes. */
export function visibleHeroLosses(
  plan: ResetPlan,
  selected: ReadonlySet<ResetKind>,
): ChampionOffRow[] {
  if (!selected.has("champions")) return [];
  return plan.championsOff.filter(isVisibleLoss);
}

export interface HalfEnabledAfter {
  id: string;
  missing: string[];
}

/**
 * Champions that would be enabled but incomplete AFTER the reset.
 *
 * The asymmetry is the point (and it is why 技能 is not ticked by default):
 * resetting CHAMPIONS alone strands ability ids belonging to champions nobody
 * can pick — unreachable, harmless. Resetting ABILITIES alone strips the `.ex`
 * off every live champion the starter does not carry, and `MatchController`
 * gates exactly that id, so the player gets a dead F key at the round-6 EX
 * unlock with no error anywhere.
 *
 * Reuses `quickApproval`'s slot helpers rather than re-deriving `<id>.<slot>`,
 * so the two pages can never disagree about what a complete kit is.
 */
export function halfEnabledAfterReset(
  live: WhitelistDoc,
  starter: StarterBundle,
  selected: ReadonlySet<ResetKind>,
): HalfEnabledAfter[] {
  const next = resetResultDoc(live, starter, selected);
  const abilities = new Set(next.abilities);
  const out: HalfEnabledAfter[] = [];
  for (const id of next.champions) {
    const missing = missingAbilitySlots(id, abilities);
    if (missing.length > 0) out.push({ id, missing });
  }
  return out;
}

/**
 * Items that would be turned off AND are currently in the legendary 3-choose-1
 * pool. Today this is 0 (all 49 `legendary-weapons` entries are in the starter
 * bundle) — which is exactly why it is COMPUTED: add one legendary that is not
 * in the starter and this goes to 1 and turns red on its own.
 */
export function legendaryItemsOff(
  plan: ResetPlan,
  legendaryPoolIds: readonly string[],
): string[] {
  const pool = new Set(legendaryPoolIds);
  return plan.byKind.items.off.filter((id) => pool.has(id));
}

/** Parse `content/loot-tables/legendary-weapons.json` → the item ids. */
export function parseLootTableItemIds(raw: unknown): string[] {
  if (raw === null || typeof raw !== "object") return [];
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  const out: string[] = [];
  for (const e of entries) {
    if (e === null || typeof e !== "object") continue;
    const id = (e as { itemId?: unknown }).itemId;
    if (typeof id === "string" && id !== "") out.push(id);
  }
  return out;
}

// ------------------------------------------------------------- requests -----

/** POST /curation/whitelist/reset body. */
export interface ResetRequestBody {
  scopes: ResetKind[];
  dryRun?: boolean;
  expect?: Record<string, number>;
}

/**
 * The `expect` map the server re-checks under its own lock. It is built from
 * the SAME plan the confirmation copy quotes, so a preview that has gone stale
 * comes back as a 409 `confirm_mismatch` instead of a silent over-delete.
 */
export function buildExpect(
  plan: ResetPlan,
  selected: ReadonlySet<ResetKind>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const kind of KINDS) if (selected.has(kind)) out[kind] = plan.byKind[kind].off.length;
  return out;
}

export function selectedScopes(selected: ReadonlySet<ResetKind>): ResetKind[] {
  return KINDS.filter((k) => selected.has(k));
}

/**
 * The DEFAULT scope selection: 英雄 only.
 *
 * The owner said 「英雄白名單」 first and 「原廠設定」 second, and the two differ
 * a lot: 道具 moves 43 off / 9 on and 技能 moves 50 off, either of which can
 * undo hand-curation he did on purpose. Ticking only what he named leaves the
 * rest as his choice — 第一守則.
 */
export function defaultSelection(): Set<ResetKind> {
  return new Set<ResetKind>(["champions"]);
}

// ------------------------------------------------------------------ copy ----

/**
 * The second confirmation's headline. The numbers come from the live plan, so
 * the sentence changes when the tick boxes change — the operator cannot build
 * muscle memory for one number.
 */
export function confirmSummary(plan: ResetPlan, selected: ReadonlySet<ResetKind>): string {
  const scopes = selectedScopes(selected).map((k) => KIND_LABEL[k]).join("、");
  const off = totalOff(plan, selected);
  const on = totalOn(plan, selected);
  return `你選的範圍是：${scopes || "（未選）"}。這會關掉 ${off} 個項目、打開 ${on} 個項目。`;
}

/**
 * Whether the second confirmation should demand a typed number.
 *
 * A reset that removes nothing is a pure addition. Demanding a typed
 * confirmation for it trains the operator to treat typing as a ritual, which is
 * precisely what makes the typed confirmation worthless on the day it matters.
 */
export function requiresTypedConfirm(plan: ResetPlan, selected: ReadonlySet<ResetKind>): boolean {
  return totalOff(plan, selected) > 0;
}

/** Is the typed value the number we asked for? */
export function typedConfirmOk(
  plan: ResetPlan,
  selected: ReadonlySet<ResetKind>,
  typed: string,
): boolean {
  if (!requiresTypedConfirm(plan, selected)) return true;
  return typed.trim() === String(totalOff(plan, selected));
}

/** Can the first-stage panel hand over to the confirmation at all? */
export function canProceed(plan: ResetPlan, selected: ReadonlySet<ResetKind>): boolean {
  if (plan.refuse !== null) return false;
  if (selectedScopes(selected).length === 0) return false;
  return totalOff(plan, selected) > 0 || totalOn(plan, selected) > 0;
}

/** Ability ids of one champion — re-exported so the page needs one import. */
export { abilityIdsFor };
