import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { paramsSchemaFor, type TemplateDoc } from "@ggd/shared/content";
import { ORIGINS } from "@ggd/shared/content/statNormalization";
import { SKILL_TIER_NAMES } from "@ggd/shared/content/skillTiers";
import {
  SKILL_TYPE_PRESETS,
  cardsForSkillType,
  rankSkillTypes,
} from "./skillTypePresets";
import { TIER_CONFIG_IDS, tierValuesFor, type TierConfigDocs } from "./skillTierCatalog";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const templates = new Map(
  readdirSync(join(REPO, "content/ability-templates"))
    .filter((name) => name.startsWith("tpl-") && name.endsWith(".json"))
    .map((name) => readJson<TemplateDoc>(join(REPO, "content/ability-templates", name)))
    .map((doc) => [doc.id, doc] as const),
);
const enabled = new Set(
  [...templates.values()].filter((doc) => doc.status === "enabled").map((doc) => doc.id),
);

describe("鑄技工坊技能類型", () => {
  it("每個類型只組合正式出貨且 enabled 的效果積木", () => {
    for (const skillType of SKILL_TYPE_PRESETS) {
      expect(skillType.templateIds.length, skillType.id).toBeGreaterThan(0);
      expect(skillType.templateIds.every((id) => enabled.has(id)), skillType.id).toBe(true);
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

  it("十種出身都有推薦第一名，但仍保留全部手動選項", () => {
    for (const origin of ORIGINS) {
      const ranked = rankSkillTypes(origin, enabled);
      expect(ranked).toHaveLength(SKILL_TYPE_PRESETS.length);
      expect(ranked[0]?.recommendationRank, origin).toBe(1);
      expect(new Set(ranked.map((row) => row.preset.id))).toEqual(
        new Set(SKILL_TYPE_PRESETS.map((row) => row.id)),
      );
    }
  });

  it("不同出身真的改變排序，而不是只換一個推薦標籤", () => {
    expect(rankSkillTypes("法師", enabled)[0]?.preset.id).not.toBe(
      rankSkillTypes("鬥士", enabled)[0]?.preset.id,
    );
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
});
