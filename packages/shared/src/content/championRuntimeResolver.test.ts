import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { forgeChampion } from "./heroForge";
import { resolveChampionRuntimeStats } from "./championRuntimeResolver";

it("keeps source sparse while origin changes update inherited stats and retain explicit overrides", () => {
  const config = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../content/config/stat-normalization.json"), "utf8"));
  const source = { ...forgeChampion({ id: "origin-proof", name: "原文\n", description: "完整描述\n「台詞」", origin: "鬥士" }).draft,
    origin: "鬥士", baseStats: {}, growth: {}, attributes: undefined,
    statOverrides: { baseStats: { maxHealth: 1234 }, growth: {}, attributes: { str: 88 } },
  };
  const original = structuredClone(source);
  const first = resolveChampionRuntimeStats(source, [config]);
  const changed = structuredClone(config);
  for (const band of Object.keys(changed.bands.ms)) changed.bands.ms[band] *= 1.17;
  const second = resolveChampionRuntimeStats(source, [changed]);
  expect((first.baseStats as Record<string, number>).ms).not.toBe((second.baseStats as Record<string, number>).ms);
  expect(first.baseStats).toMatchObject({ maxHealth: 1234 });
  expect(second.baseStats).toMatchObject({ maxHealth: 1234 });
  expect(second.attributes).toMatchObject({ str: 88 });
  expect(second.description).toBe(source.description);
  expect(source).toEqual(original);
  expect(second).not.toHaveProperty("statOverrides");
});
