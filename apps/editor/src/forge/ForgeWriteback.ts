/**
 * 鑄技工坊 寫回器 (design §2.3 step 4, §五).
 *
 * Rules this obeys, all of them pre-existing project rules rather than new ones:
 *
 *  1. MIRROR: an ability lives twice — standalone `content/abilities/<id>.json`
 *     and the copy embedded in its champion's `abilities.<slot>`. The direction
 *     is always standalone → embedded (the STRICT model). The plan comes from
 *     the shared `writePlan()`; this file does NOT re-implement the mirror rule.
 *  2. LINE EDIT: both writes go through the PATCH member routes, never PUT, so
 *     the Python exporter's `350.0` floats survive untouched (#78).
 *  3. VALIDATE EVERY STEP BEFORE WRITING ANY STEP — the admin's proven
 *     `saveDocs` sequence. A half-applied mirror is the worst outcome available,
 *     so a doc that would fail validation must fail before the first byte moves.
 *  4. content:build afterwards, once, via POST /content-api/rebuild.
 */
import {
  diffDocs,
  embeddedForm,
  embeddedSlotOf,
  writePlan,
  type DocChange,
} from "@ggd/shared/content/editModel";
import {
  hasTemplateBinding,
  resolveTemplateExpansion,
} from "@ggd/shared/content/templates/resolve";
import type { TemplateDoc } from "@ggd/shared/content/schema/template";
import { api, WRITES_ENABLED } from "../api/client";

/**
 * The members a template-authored ability owns — the ONLY ones we splice.
 *
 * ⚠️ `vfxKey` / `vfxLayers` joined on 2026-08-02 (owner:「鑄技工坊 也請一起更新，
 * 包括多重選取模板及**特效**的設定部分」). Before that the forge could author a
 * skill whose BEHAVIOUR was exact and whose LOOK was still the shared placeholder,
 * which is the state #230 measured: 491 emitters extracted from the original map,
 * 58 referenced, **433 idle** — not blocked by anything, just with nowhere to be
 * typed in.
 */
export const FORGE_OWNED_MEMBERS = [
  "template",
  "castType",
  "effects",
  "radius",
  "castTimeSec",
  "targetsEnemies",
  "innateKind",
  "passive",
  "vfxKey",
  "vfxLayers",
] as const;

/**
 * Members that must be REMOVED from the doc rather than written.
 *
 * Only `vfxLayers` can need this, and only in one direction: the operator
 * emptied the layer list back down to a single plain layer, so the doc should
 * go back to the legacy single-`vfxKey` shape (which is the byte-identical
 * compatibility path 646 abilities are on — see `schema/abilityVfx.ts`). A doc
 * that kept a stale `vfxLayers` would keep playing the OLD stack: 故障形態 ②.
 *
 * `spliceMembers` deletes on `null`; `undefined` cannot be used because
 * `JSON.stringify` drops those keys before the body reaches the server.
 */
function dropsFor(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return "vfxLayers" in before && after["vfxLayers"] === undefined ? ["vfxLayers"] : [];
}

export interface ForgePlanStep {
  readonly collection: "abilities" | "champions";
  readonly id: string;
  readonly reason: "edit" | "mirror";
  /** human line for the confirm dialog */
  readonly label: string;
  readonly changes: readonly DocChange[];
}

export interface ForgePlan {
  readonly steps: readonly ForgePlanStep[];
  /** the member patch that will be spliced into the standalone doc */
  readonly abilityPatch: Record<string, unknown>;
  /** the embedded twin, or null when this ability has no champion slot */
  readonly mirror: { championId: string; slot: string; embedded: Record<string, unknown> } | null;
  /**
   * Reasons this plan MUST NOT be executed, in operator language. Empty = writable.
   *
   * ⚠️ This exists because of the specific rule CLAUDE.md draws from
   * `buildIndexesValidates.test.ts`: 「只在遠離現場的地方響的警報不是守衛」. A doc
   * whose `template.ref` names a template that does not exist is perfectly valid
   * Zod — `zAbilityTemplateCard.ref` is a string — so `/validate` passes it and
   * the failure only surfaces at the NEXT `registerAll()`, in a different
   * process, on a different day, as a degraded skill. The rule has to run HERE,
   * at the moment of editing, and it is the SAME function the loader runs
   * (`resolveTemplateExpansion`), not a second copy that can drift from it.
   */
  readonly blockers: readonly string[];
}

/**
 * Would this doc survive `registerAll()`? Returns the operator-facing reasons it
 * would not (empty = fine). Non-templated docs are always fine.
 */
export function templateWriteBlockers(
  after: Record<string, unknown>,
  templates: ReadonlyMap<string, TemplateDoc>,
): string[] {
  if (!hasTemplateBinding(after)) return [];
  const res = resolveTemplateExpansion(after, templates);
  if (res.ok) return [];
  const f = res.failure;
  const head =
    f.phase === "ref"
      ? `模板不存在：${f.missingRefs.join("、")}`
      : f.phase === "binding"
        ? "模板綁定格式不合法"
        : "模板展開失敗";
  return [
    `${head} —— 存下去之後這支技能在載入時會被降級成「沒有效果」，其他英雄不受影響但這支就死了。(${f.message})`,
  ];
}

/**
 * Build the write plan + its diff preview. PURE — no I/O, so the confirm dialog
 * can render exactly what the save will do before anything is sent.
 *
 * `before` is the ability doc as it is on disk; `after` is that doc with the
 * template link and the expansion merged in.
 */
export function planForgeWrite(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  championDoc: Record<string, unknown> | null,
  templates: ReadonlyMap<string, TemplateDoc>,
): ForgePlan {
  const id = String(after["id"]);
  const steps: ForgePlanStep[] = [];

  // Only the members the forge owns are ever written — everything else on the
  // doc (name/icon/cooldown/manaCost/description) stays exactly as authored.
  const abilityPatch: Record<string, unknown> = {};
  for (const k of FORGE_OWNED_MEMBERS) {
    if (after[k] !== undefined) abilityPatch[k] = after[k];
  }
  // `null` = delete. See dropsFor().
  for (const k of dropsFor(before, after)) abilityPatch[k] = null;

  steps.push({
    collection: "abilities",
    id,
    reason: "edit",
    label: `abilities/${id}`,
    changes: diffDocs(before, after),
  });

  let mirror: ForgePlan["mirror"] = null;
  const plan = writePlan("abilities", id, after, championDoc);
  const mirrorStep = plan.find((s) => s.reason === "mirror");
  if (mirrorStep && championDoc) {
    const slot = embeddedSlotOf(championDoc, id);
    if (slot !== null) {
      mirror = { championId: mirrorStep.id, slot, embedded: embeddedForm(after) };
      steps.push({
        collection: "champions",
        id: mirrorStep.id,
        reason: "mirror",
        label: `champions/${mirrorStep.id} 的 ${slot} 槽（連動寫入）`,
        changes: diffDocs(championDoc, mirrorStep.doc),
      });
    }
  }

  return { steps, abilityPatch, mirror, blockers: templateWriteBlockers(after, templates) };
}

export interface ForgeSaveResult {
  readonly wrote: readonly string[];
  readonly contentVersion: string;
}

/**
 * Execute a plan. Dry-runs BOTH steps through the existing /validate route
 * first, so a rejected mirror can never leave the standalone half written.
 */
export async function runForgeWrite(
  plan: ForgePlan,
  after: Record<string, unknown>,
  championAfter: Record<string, unknown> | null,
  templates: ReadonlyMap<string, TemplateDoc>,
): Promise<ForgeSaveResult> {
  if (!WRITES_ENABLED) {
    throw new Error("此組建為唯讀（正式版不含 content-api），無法寫回");
  }
  const id = String(after["id"]);

  // ---- 0. the template gate, BEFORE the server round-trip ------------------
  // Re-run rather than trusting `plan.blockers`: a plan is built once and the
  // confirm dialog can sit open while the card list changes underneath it.
  // Same function the loader runs, so「編輯器接受的」==「載入器展開得動的」.
  const blockers = templateWriteBlockers(after, templates);
  if (blockers.length > 0) {
    throw new Error(`拒絕寫回：${blockers.join("；")}`);
  }

  // ---- 1. validate EVERY step before writing ANY step ----
  await api.validate("abilities", id, after);
  if (plan.mirror && championAfter) {
    await api.validate("champions", plan.mirror.championId, championAfter);
  }

  // ---- 2. write, standalone first (mirror direction is standalone → embedded)
  const wrote: string[] = [];
  const abilityRes = await api.patchAbility(id, plan.abilityPatch);
  wrote.push(`abilities/${id}`);
  let contentVersion = abilityRes.contentVersion;

  if (plan.mirror) {
    const res = await api.patchChampionSlot(
      plan.mirror.championId,
      plan.mirror.slot,
      plan.mirror.embedded,
    );
    wrote.push(`champions/${plan.mirror.championId}.${plan.mirror.slot}`);
    contentVersion = res.contentVersion;
  }

  // ---- 3. content:build, once, at the end ----
  const rebuilt = await api.rebuild();
  return { wrote, contentVersion: rebuilt.contentVersion || contentVersion };
}
