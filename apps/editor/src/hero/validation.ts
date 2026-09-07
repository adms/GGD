import {
  HERO_SLOTS, zHeroProject, generateHeroDraft, compileGeneratedHeroDraft,
  runHeroAbilityScenario, runHeroKitScenario,
  createHeroSimulationBaseline,
  type GeneratedHeroDraft, type CompiledHeroDraft, type HeroAbilityScenarioResult, type HeroKitScenarioResult,
  type HeroScenarioSetup, type HeroSlot,
} from "@ggd/shared/content";
import type { HeroCatalog } from "./catalog";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { uploadedHeroModelDoc } from "@ggd/shared/content/modelUpload/heroModel";

export interface HeroValidationResult {
  revision: number;
  errors: string[];
  generated: GeneratedHeroDraft | null;
  compiled: CompiledHeroDraft | null;
  scenarios: HeroAbilityScenarioResult[];
  kit: HeroKitScenarioResult | null;
}

/** Runs in an isolated worker: preview registrations cannot alter a live room. */
export function validateHero(project: unknown, catalog: HeroCatalog, playground?: { slot: HeroSlot; setup: HeroScenarioSetup }): HeroValidationResult {
  const result: HeroValidationResult = { revision: Number((project as { revision?: number }).revision ?? -1), errors: [], generated: null, compiled: null, scenarios: [], kit: null };
  const parsed = zHeroProject.safeParse(project);
  if (!parsed.success) return { ...result, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  if (!parsed.data.acceptedPlan) return { ...result, errors: ["請先採用一份六槽方案。"] };
  if (parsed.data.acceptedPlan.generatorVersion && catalog.generatorVersion && parsed.data.acceptedPlan.generatorVersion !== catalog.generatorVersion) return { ...result, errors: ["這份英雄使用不同版本的生成器。請先保留原稿，再採用目前生成器並重新檢查。"] };
  if (parsed.data.presentation.uploadedModel) {
    const verified = catalog.validatedUploadedModel;
    if (!verified || verified.projectId !== parsed.data.projectId || contentSha256(verified.model) !== contentSha256(parsed.data.presentation.uploadedModel) || uploadedHeroModelDoc(verified.model).id !== parsed.data.presentation.modelKey) return { ...result, errors: ["正在檢查本機上傳模型；請先保存完整 GLB 與六項動作對應。"] };
  }
  if (!catalog.modelIds.includes(parsed.data.presentation.modelKey)) return { ...result, errors: ["英雄本體模型未列入目前目錄；原值已保留，請選擇可用的英雄模型。"] };
  try {
    const generated = generateHeroDraft(parsed.data.acceptedPlan, { heroId: parsed.data.projectId, heroName: parsed.data.brief.name, presentation: parsed.data.presentation });
    result.generated = generated;
    const compiled = compileGeneratedHeroDraft(generated, catalog.templates, catalog.configs, catalog.vfxSubtypes);
    if (!compiled.ok) return { ...result, errors: compiled.failures.map((failure) => `${failure.slot}: ${failure.message}`) };
    result.compiled = compiled.draft;
    const baseline = createHeroSimulationBaseline(new Map(catalog.simulationDocuments));
    result.scenarios = (playground ? [playground.slot] : HERO_SLOTS).map((slot) => runHeroAbilityScenario(compiled.draft.champion, compiled.draft.abilityDrafts[slot], {
      setup: playground?.setup, baseline, ticks: 180, relatedAbilities: Object.values(compiled.draft.abilityDrafts), relatedProjectiles: catalog.projectiles,
    }));
    if (!playground) result.kit = runHeroKitScenario(compiled.draft.champion, compiled.draft.abilityDrafts, { baseline, ticksPerStep: 180, relatedProjectiles: catalog.projectiles });
    result.errors.push(...result.scenarios.flatMap((scenario) => scenario.assertions.filter((assertion) => assertion.status === "fail").map((assertion) => `${scenario.slot}: ${assertion.summaryZh}`)));
    if (result.kit?.status === "rejected") result.errors.push(`整套技能未完成：${result.kit.rejectedSlots.join("、")}`);
  } catch (error) { result.errors.push(error instanceof Error ? error.message : String(error)); }
  return result;
}
