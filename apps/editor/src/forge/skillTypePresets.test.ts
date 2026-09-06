import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  DEFAULT_TEMPLATE_CONFLICT,
  ContentLoader,
  paramsSchemaFor,
  registerAll,
  zAbilityDoc,
  type TemplateDoc,
} from "@ggd/shared/content";
import {
  denormalizeTemplateBinding,
  expandStack,
  mergeExpansion,
} from "@ggd/shared/content/templates/expand";
import { ORIGINS } from "@ggd/shared/content/statNormalization";
import { SKILL_TIER_NAMES } from "@ggd/shared/content/skillTiers";
import {
  SKILL_TYPE_PRESETS,
  applyTierToCards,
  cardsForSkillType,
  rankSkillTypes,
  skillTypeRecipeIssues,
  supportedTierAxes,
  type StatNormalizationRecommendationDoc,
} from "./skillTypePresets";
import {
  RUNTIME_RESOLVER_CONFIG_IDS,
  TIER_CONFIG_IDS,
  tierNumericValueFor,
  tierValuesFor,
  type RuntimeResolverConfigDocs,
  type TierConfigDocs,
} from "./skillTierCatalog";
import { newAbilityTemplate } from "../collections";
import { resolveRuntimeDraft } from "./resolveRuntimeDraft";
import { FsContentSource } from "@ggd/shared/content/node";
import { Champions, type AbilityDef, type ChampionDef } from "@ggd/shared/sim";
import type { ChampionId } from "@ggd/shared/ids";
import { castPreviewTicksFor, createSimPreviewController } from "../preview/PreviewController";
import { pickableTemplateIds } from "./typeCatalog";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const templates = new Map(
  readdirSync(join(REPO, "content/ability-templates"))
    .filter((name) => name.startsWith("tpl-") && name.endsWith(".json"))
    .map((name) => readJson<TemplateDoc>(join(REPO, "content/ability-templates", name)))
    .map((doc) => [doc.id, doc] as const),
);
const docPickable = pickableTemplateIds("doc");
const statNormalization = readJson<StatNormalizationRecommendationDoc>(
  join(REPO, "content/config/stat-normalization.json"),
);
const runtimeConfigs = Object.fromEntries(RUNTIME_RESOLVER_CONFIG_IDS.map((id) => [
  id,
  readJson<Record<string, unknown>>(join(REPO, `content/config/${id}.json`)),
])) as RuntimeResolverConfigDocs;

beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(join(REPO, "content")))
    .load({ policy: "fail-closed" })).store);
});

function runtimeAbilityFor(preset: (typeof SKILL_TYPE_PRESETS)[number]): AbilityDef {
  let cards = cardsForSkillType(preset, templates);
  for (const [rawAxis, tier] of Object.entries(preset.tierDefaults)) {
    if (!tier) continue;
    const axis = rawAxis as Parameters<typeof applyTierToCards>[2];
    cards = applyTierToCards(
      cards,
      templates,
      axis,
      tier,
      tierNumericValueFor(axis, tier, runtimeConfigs, preset.cooldownShape),
    );
  }
  const expanded = expandStack(
    cards.map((card) => ({ template: templates.get(card.ref)!, params: card.params })),
    DEFAULT_TEMPLATE_CONFLICT,
  );
  const authoring = mergeExpansion({
    schema: "ability@1",
    ...newAbilityTemplate(`qa.sim.${preset.id}`, preset.defaultSlot ?? "Q", `QA ${preset.label}`),
    template: denormalizeTemplateBinding(cards, DEFAULT_TEMPLATE_CONFLICT),
    ...(preset.tierDefaults.mana ? { manaCostTier: preset.tierDefaults.mana } : {}),
    ...(preset.tierDefaults.cooldown ? {
      cooldownTier: preset.tierDefaults.cooldown,
      cooldownShape: preset.cooldownShape,
    } : {}),
    ...(preset.tierDefaults.range ? { rangeTier: preset.tierDefaults.range } : {}),
    ...(preset.tierDefaults.radius ? { radiusTier: preset.tierDefaults.radius } : {}),
    ...(preset.tierDefaults.castTime ? { castTimeTier: preset.tierDefaults.castTime } : {}),
  }, expanded.result);
  return resolveRuntimeDraft(zAbilityDoc.parse(authoring), templates, runtimeConfigs) as unknown as AbilityDef;
}

describe("鑄技工坊技能類型", () => {
  it("每個類型只組合 Main 實測 expands 且 doc-wired 的效果積木", () => {
    for (const skillType of SKILL_TYPE_PRESETS) {
      expect(skillType.templateIds.length, skillType.id).toBeGreaterThan(0);
      expect(skillType.templateIds.every((id) => docPickable.has(id)), skillType.id).toBe(true);
      const cards = cardsForSkillType(skillType, templates);
      expect(cards.map((card) => card.ref)).toEqual(skillType.templateIds);
      for (const card of cards) {
        expect(paramsSchemaFor(templates.get(card.ref)!).safeParse(card.params).success, `${skillType.id}/${card.ref}`).toBe(true);
      }
    }
  });

  it("所有推薦級距只使用唯一五級名稱，永遠沒有超大", () => {
    const allowed = new Set<string>(SKILL_TIER_NAMES);
    const authored = SKILL_TYPE_PRESETS.flatMap((skillType) => Object.values(skillType.tierDefaults));
    expect(authored.every((tier) => allowed.has(tier))).toBe(true);
    expect(authored).not.toContain("超大");
  });

  it("每個配方宣告的級距都有真實可寫欄位；唯一外部缺口是連段傷害", () => {
    const gaps = SKILL_TYPE_PRESETS.flatMap((preset) => {
      const supported = supportedTierAxes(cardsForSkillType(preset, templates), templates);
      const axes = Object.keys(preset.tierDefaults).filter((axis) => !supported.has(axis as never));
      return axes.length > 0 ? [{ id: preset.id, axes }] : [];
    });
    expect(gaps).toEqual([{ id: "combo", axes: ["damage"] }]);
  });

  it("友善配方會 fail closed：目前 Main 的兩個真缺口不能讓玩家產出壞檔", () => {
    const issues = Object.fromEntries(
      SKILL_TYPE_PRESETS.map((preset) => [preset.id, skillTypeRecipeIssues(preset, templates, docPickable)] as const)
        .filter(([, rows]) => rows.length > 0),
    );
    // ⭐ 2026-09-06 GH#1047：beam-roll 的 spacing 缺口補上（count≥2 才發 spacing）⇒ 只剩 combo 一個真缺口。
    expect(Object.keys(issues)).toEqual(["combo"]);
    expect(issues["combo"]).toEqual(["傷害沒有可寫入的模板參數"]);
  });

  it("除已明示的 Main 缺口外，配方都能套入級距並形成合法 authoring 與 runtime 預覽", () => {
    const failures: string[] = [];
    for (const preset of SKILL_TYPE_PRESETS) {
      if (skillTypeRecipeIssues(preset, templates, docPickable).length > 0) continue;
      try {
        let cards = cardsForSkillType(preset, templates);
        for (const [rawAxis, tier] of Object.entries(preset.tierDefaults)) {
          if (!tier) continue;
          const axis = rawAxis as Parameters<typeof applyTierToCards>[2];
          cards = applyTierToCards(
            cards,
            templates,
            axis,
            tier,
            tierNumericValueFor(axis, tier, runtimeConfigs, preset.cooldownShape),
          );
        }
        for (const card of cards) {
          const parsed = paramsSchemaFor(templates.get(card.ref)!).safeParse(card.params);
          if (!parsed.success) failures.push(`${preset.id}/${card.ref} params: ${parsed.error.message}`);
        }
        const expanded = expandStack(
          cards.map((card) => ({ template: templates.get(card.ref)!, params: card.params })),
          DEFAULT_TEMPLATE_CONFLICT,
        );
        const authoring = mergeExpansion({
          schema: "ability@1",
          ...newAbilityTemplate(`qa.${preset.id}`, preset.defaultSlot ?? "Q", `QA ${preset.label}`),
          template: denormalizeTemplateBinding(cards, DEFAULT_TEMPLATE_CONFLICT),
          ...(preset.tierDefaults.mana ? { manaCostTier: preset.tierDefaults.mana } : {}),
          ...(preset.tierDefaults.cooldown ? {
            cooldownTier: preset.tierDefaults.cooldown,
            cooldownShape: preset.cooldownShape,
          } : {}),
          ...(preset.tierDefaults.range ? { rangeTier: preset.tierDefaults.range } : {}),
          ...(preset.tierDefaults.radius ? { radiusTier: preset.tierDefaults.radius } : {}),
          ...(preset.tierDefaults.castTime ? { castTimeTier: preset.tierDefaults.castTime } : {}),
        }, expanded.result);
        const authoringResult = zAbilityDoc.safeParse(authoring);
        if (!authoringResult.success) {
          failures.push(...authoringResult.error.issues.map((issue) => `${preset.id} authoring ${issue.path.join(".")}: ${issue.message}`));
          continue;
        }
        const runtime = resolveRuntimeDraft(authoring, templates, runtimeConfigs);
        if (runtime["id"] !== authoring["id"] || !Array.isArray(runtime["effects"])) {
          failures.push(`${preset.id} runtime resolver 沒有保留 id/effects`);
        }
      } catch (error) {
        failures.push(`${preset.id}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("所有可用友善配方都能經真正 SimWorld 點火，不以表單合法冒充可玩", () => {
    const base = Champions.get("godie-hart" as ChampionId);
    const failures: string[] = [];
    for (const preset of SKILL_TYPE_PRESETS) {
      if (skillTypeRecipeIssues(preset, templates, docPickable).length > 0) continue;
      const ability = runtimeAbilityFor(preset);
      const champion: ChampionDef = ability.slot === "PASSIVE"
        ? { ...base, passiveAbility: ability.id }
        : ability.slot === "EX"
          ? { ...base, exAbility: ability.id }
          : { ...base, abilities: { ...base.abilities, [ability.slot]: ability } };
      const controller = createSimPreviewController();
      try {
        const trace = ability.slot === "PASSIVE"
          ? controller.triggerPassiveAbility(champion, ability.id, {
              definition: ability,
              level: 18,
              rank: ability.maxRank,
              ticks: 650,
            })
          : controller.castAbility(champion, ability.slot, {
              definition: ability,
              level: 18,
              rank: ability.maxRank,
              ticks: Math.max(180, castPreviewTicksFor(ability)),
            });
        if (!trace.accepted) failures.push(`${preset.id}: ${trace.reason ?? "Sim 拒絕"}`);
        const casted = trace.events.some((event) =>
          event.type === "abilityCast" && event.data["abilityId"] === ability.id,
        );
        if (ability.slot === "PASSIVE" && casted) failures.push(`${preset.id}: 被動被偽裝成主動施法`);
        if (ability.slot !== "PASSIVE" && !casted) failures.push(`${preset.id}: 缺 abilityCast`);
      } catch (error) {
        failures.push(`${preset.id}: ${String(error)}`);
      } finally {
        controller.dispose();
      }
    }
    expect(failures).toEqual([]);
  });

  it("十種出身都有推薦第一名，但仍保留全部手動選項", () => {
    for (const origin of ORIGINS) {
      const ranked = rankSkillTypes(origin, docPickable, statNormalization);
      expect(ranked).toHaveLength(SKILL_TYPE_PRESETS.length);
      expect(ranked[0]?.recommendationRank, origin).toBe(1);
      expect(ranked.slice(0, 3).every((row) => row.recommendationReasons.length > 0), origin).toBe(true);
      expect(new Set(ranked.map((row) => row.preset.id))).toEqual(
        new Set(SKILL_TYPE_PRESETS.map((row) => row.id)),
      );
    }
  });

  it("不同出身真的改變排序，而不是只換一個推薦標籤", () => {
    expect(rankSkillTypes("法師", docPickable, statNormalization)[0]?.preset.id).not.toBe(
      rankSkillTypes("鬥士", docPickable, statNormalization)[0]?.preset.id,
    );
  });

  it("推薦資料缺失時 fail closed，不假裝有出身推薦但仍保留選項", () => {
    const ranked = rankSkillTypes("法師", docPickable, null);
    expect(ranked.every((row) => row.recommendationRank === null)).toBe(true);
    expect(ranked).toHaveLength(SKILL_TYPE_PRESETS.length);
  });
});

describe("五級距顯示值", () => {
  const configs = Object.fromEntries(TIER_CONFIG_IDS.map((id) => [
    id,
    readJson<Record<string, unknown>>(join(REPO, `content/config/${id}.json`)),
  ])) as TierConfigDocs;

  it("九個設計軸都從主程式 config 解析出完整五格", () => {
    for (const axis of ["damage", "mana", "cooldown", "range", "radius", "castTime", "travel", "push", "moveSpeed"] as const) {
      expect(Object.keys(tierValuesFor(axis, configs, "範圍") ?? {}), axis).toEqual([...SKILL_TIER_NAMES]);
    }
  });

  it("冷卻會依技能類型切換表，不把數值寫死在 Editor", () => {
    expect(tierValuesFor("cooldown", configs, "單體")?.["極小"]).toBe("6秒");
    expect(tierValuesFor("cooldown", configs, "範圍")?.["極小"]).toBe("30秒");
    expect(tierValuesFor("cooldown", configs, "變身")?.["極大"]).toBe("120秒");
  });

  it("舊 numeric 位移槽與 statModifiers 也能由 Main 五級距可靠回填", () => {
    const charge = SKILL_TYPE_PRESETS.find((row) => row.id === "charge-push")!;
    let chargeCards = cardsForSkillType(charge, templates);
    chargeCards = applyTierToCards(
      chargeCards,
      templates,
      "travel",
      "大",
      tierNumericValueFor("travel", "大", configs, charge.cooldownShape),
    );
    chargeCards = applyTierToCards(
      chargeCards,
      templates,
      "push",
      "中",
      tierNumericValueFor("push", "中", configs, charge.cooldownShape),
    );
    expect(chargeCards[0]?.params["dashDistance"]).toBe(800.18);
    expect(chargeCards[0]?.params["pushDistance"]).toBe(245.45);

    const buff = SKILL_TYPE_PRESETS.find((row) => row.id === "self-buff")!;
    const buffCards = cardsForSkillType(buff, templates);
    expect(buffCards[0]?.params["modifiers"]).toContainEqual({
      stat: "ms",
      op: "pctAdd",
      msBonusTier: "中",
    });
  });
});
