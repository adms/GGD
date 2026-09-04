#!/usr/bin/env -S node --import tsx

/**
 * Exercise the 46 acceptance documents through the real Editor PreviewDriver.
 *
 * Active abilities must travel through IntentFrame -> SimWorld. Pure passives
 * are never faked as casts: they are reported as needing a named combat
 * scenario until a real reaction runner exists for that hook family.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader, registerAll } from "../../packages/shared/src/content";
import { FsContentSource } from "../../packages/shared/src/content/node";
import { Abilities, Champions, type CastableSlot } from "../../packages/shared/src/sim";
import type { AbilityId, ChampionId } from "../../packages/shared/src/ids";
import { SKILL_ACCEPTANCE_CANDIDATES } from "../../apps/editor/src/forge/skillAcceptanceCatalog";
import { activationModeForAbility } from "../../apps/editor/src/vfx-forge/actionAnimationPrinciples";
import { reactionTriggerOf } from "../../apps/editor/src/vfx-forge/model";
import {
  castPreviewTicksFor,
  createSimPreviewController,
} from "../../apps/editor/src/preview/PreviewController";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CONTENT = join(ROOT, "content");
const SUMMARY_ONLY = process.argv.includes("--summary");
void main();

async function main(): Promise<void> {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load({ policy: "fail-closed" })).store);

  const controller = createSimPreviewController();
  const rows = SKILL_ACCEPTANCE_CANDIDATES.map((candidate) => {
  const championId = candidate.id.slice(0, candidate.id.lastIndexOf(".")) as ChampionId;
  const champion = Champions.get(championId);
  const ability = Abilities.get(candidate.id as AbilityId);
  const activation = activationModeForAbility(ability);
  const trigger = reactionTriggerOf(ability);
  if (activation === "passive" && trigger !== "reflectSuccess") {
    return {
      id: candidate.id,
      activation,
      route: "named-reaction-scenario",
      accepted: null,
      reason: "pure-passive-needs-real-hook-scenario",
    } as const;
  }
  const ticks = castPreviewTicksFor(ability);
  const trace = trigger === "reflectSuccess"
    ? controller.triggerReflectSuccess(champion, ability.id, { level: 18, rank: 1, ticks })
    : controller.castAbility(champion, ability.slot as CastableSlot, { level: 18, rank: 1, ticks });
  return {
    id: candidate.id,
    activation,
    route: trigger === "reflectSuccess" ? "reflect-success" : "intent-frame",
    accepted: trace.accepted,
    reason: trace.reason ?? null,
    eventCount: trace.events.length,
  } as const;
  });
  controller.dispose();

  const summary = {
    documents: rows.length,
    accepted: rows.filter((row) => row.accepted === true).length,
    rejected: rows.filter((row) => row.accepted === false).length,
    scenarioRequired: rows.filter((row) => row.accepted === null).length,
  };
  console.log(JSON.stringify(
    SUMMARY_ONLY ? { schema: "ggd-editor-sim-preview-audit@1", summary } : { schema: "ggd-editor-sim-preview-audit@1", summary, rows },
    null,
    2,
  ));
  if (summary.documents !== 46) process.exitCode = 1;
  if (summary.rejected !== 0) process.exitCode = 1;
}
