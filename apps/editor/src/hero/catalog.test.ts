import { expect, it } from "vitest";
import { bundledHeroCatalog } from "./catalog";
import { pickableTemplateIds } from "../forge/typeCatalog";
import { createHeroSimulationBaseline, HERO_SIMULATION_COLLECTIONS } from "@ggd/shared/content/heroForge/simulationBaseline";

// Run in the Docker build too: Vite accepts an empty import.meta.glob, so a
// successful bundle alone cannot prove the offline creation catalog is present.
it("bundles every pickable document template plus the offline preview inputs", () => {
  expect(new Set(bundledHeroCatalog.templates.map((template) => template.id))).toEqual(pickableTemplateIds("doc"));
  expect(bundledHeroCatalog.templates.length).toBeGreaterThan(0);
  expect(bundledHeroCatalog.configs.some((config) => config.id === "stat-normalization")).toBe(true);
  expect(bundledHeroCatalog.projectiles.length).toBeGreaterThan(0);
  expect(bundledHeroCatalog.modelIds).toContain("champ.thorne");
  const baseline = createHeroSimulationBaseline(new Map(bundledHeroCatalog.simulationDocuments));
  for (const collection of HERO_SIMULATION_COLLECTIONS) expect(baseline.counts[collection], collection).toBeGreaterThan(0);
  const bodies = new Set(bundledHeroCatalog.simulationDocuments.filter(([key]) => key.startsWith("champions/")).map(([, doc]) => doc.modelKey));
  // Explicit model docs with heroBody:true are valid before a champion binds
  // them. Every already-bound champion body still has to remain selectable.
  expect([...bodies].every((id) => typeof id === "string" && bundledHeroCatalog.modelIds.includes(id))).toBe(true);
});
