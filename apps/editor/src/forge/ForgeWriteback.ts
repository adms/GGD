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
import { api, WRITES_ENABLED } from "../api/client";

/** The members a template-authored ability owns — the ONLY ones we splice. */
export const FORGE_OWNED_MEMBERS = [
  "template",
  "castType",
  "effects",
  "radius",
  "castTimeSec",
  "targetsEnemies",
  "innateKind",
  "passive",
] as const;

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
): ForgePlan {
  const id = String(after["id"]);
  const steps: ForgePlanStep[] = [];

  // Only the members the forge owns are ever written — everything else on the
  // doc (name/icon/cooldown/manaCost/description) stays exactly as authored.
  const abilityPatch: Record<string, unknown> = {};
  for (const k of FORGE_OWNED_MEMBERS) {
    if (after[k] !== undefined) abilityPatch[k] = after[k];
  }

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

  return { steps, abilityPatch, mirror };
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
): Promise<ForgeSaveResult> {
  if (!WRITES_ENABLED) {
    throw new Error("此組建為唯讀（正式版不含 content-api），無法寫回");
  }
  const id = String(after["id"]);

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
