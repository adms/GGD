/**
 * Derived playstyle (task #76 玩法 tab, 系統推斷 half). It is COMPUTED from
 * imported fields only; these cases pin the rules so the one line can never
 * silently drift, and drive the real skeleton `sela` so a registry change is
 * caught here.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { derivePlaystyle, playstyleForChampion, LONG_RANGE, type PlaystyleInput } from "./playstyle";

beforeAll(() => registerSkeletonContent());

const input = (over: Partial<PlaystyleInput> = {}): PlaystyleInput => ({
  attackType: "melee",
  range: 1.5,
  lifesteal: 0,
  abilities: [],
  ...over,
});

describe("derivePlaystyle rules", () => {
  it("a dashing, healing melee kit reads 近戰 · 突進 · 持續", () => {
    cover("client-playstyle");
    const ps = derivePlaystyle(
      input({
        abilities: [
          { effects: [{ kind: "dash" }] },
          { effects: [{ kind: "heal" }] },
        ],
      }),
    );
    expect(ps.tokens).toEqual(["近戰", "突進", "持續"]);
    expect(ps.label).toBe("近戰 · 突進 · 持續");
  });

  it("a long-range AoE burst caster reads 遠程 · 範圍 · 爆發 · 消耗型", () => {
    cover("client-playstyle");
    const ps = derivePlaystyle(
      input({
        attackType: "ranged",
        range: LONG_RANGE + 2,
        abilities: [{ radius: 6, effects: [{ kind: "damage" }] }],
      }),
    );
    expect(ps.tokens).toEqual(["遠程", "範圍", "爆發", "消耗型"]);
  });

  it("a plain single-target melee is 近戰 · 單體 · 爆發, never empty", () => {
    cover("client-playstyle");
    const ps = derivePlaystyle(input({ abilities: [{ effects: [{ kind: "damage" }] }] }));
    expect(ps.tokens).toEqual(["近戰", "單體", "爆發"]);
    expect(ps.label.length).toBeGreaterThan(0);
  });

  it("follows nested onHit effects (a projectile's damage still counts)", () => {
    cover("client-playstyle");
    const ps = derivePlaystyle(
      input({ abilities: [{ radius: 4, effects: [{ kind: "spawnProjectile", onHit: [{ kind: "damage" }] }] }] }),
    );
    expect(ps.tokens[1]).toBe("範圍");
  });

  it("baseStats lifesteal alone flips burst → sustain", () => {
    cover("client-playstyle");
    const ps = derivePlaystyle(input({ lifesteal: 0.1, abilities: [{ effects: [{ kind: "damage" }] }] }));
    expect(ps.tokens).toContain("持續");
  });

  it("classifies the real sela as a long-range poke caster", () => {
    cover("client-playstyle");
    const sela = Champions.get("sela" as ChampionId);
    const ps = playstyleForChampion(sela);
    expect(ps.tokens[0]).toBe("遠程");
    expect(ps.tokens).toContain("消耗型"); // sela's attack range (11) ≥ LONG_RANGE
    expect(ps.label).toContain(" · ");
  });
});
