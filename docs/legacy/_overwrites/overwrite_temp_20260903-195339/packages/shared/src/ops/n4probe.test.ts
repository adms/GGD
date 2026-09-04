import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cooldownTiersFromDoc, cooldownShapeOf, resolveCooldownTier } from "../content/cooldownTiers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const tiers = cooldownTiersFromDoc(JSON.parse(readFileSync(join(ROOT, "content/config/cooldown-tiers.json"), "utf8")));

describe("cd", () => {
  it("rule5", () => {
    for (const id of ["godie-e00r.q", "godie-nbbc.r", "godie-hjai.w", "godie-hart.r", "godie-h02u.ex"]) {
      const raw = JSON.parse(readFileSync(join(ROOT, "content/abilities", `${id}.json`), "utf8")) as Record<string, unknown>;
      const withPin = resolveCooldownTier(raw, tiers)["cooldown"];
      const { cooldownShape: _drop, ...noPin } = raw as Record<string, unknown> & { cooldownShape?: unknown };
      console.log(`CD ${id}: array=${JSON.stringify(raw["cooldown"])} tier=${String(raw["cooldownTier"])} pin=${String(raw["cooldownShape"])} shape(with)=${cooldownShapeOf(raw, tiers)} resolved=${JSON.stringify(withPin)} | shape(noPin)=${cooldownShapeOf(noPin, tiers)} resolved(noPin)=${JSON.stringify(resolveCooldownTier(noPin, tiers)["cooldown"])}`);
    }
    expect(true).toBe(true);
  });
});
