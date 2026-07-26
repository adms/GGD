/**
 * 鑄技工坊 expander tests.
 *
 *  1. GGD_PER_WC3 is EXACTLY 11/600 — the load-bearing length constant. The
 *     roundtrip diff=0 depends on 450→8.25, 500→9.17, 763→14.
 *  2. GOLDEN per family — template + exemplar params → the expected EffectDef
 *     shape, guarding all 8 enabled families.
 *  3. ROUNDTRIP diff=0 (design §四.5, the P1 acceptance): re-authoring an existing
 *     skill — godie-hgam.e (瞬發點爆) — through tpl-instant-blast reproduces its
 *     on-disk behaviour half with SEMANTIC diff zero (diffDocs over parsed docs,
 *     so 60.0===60 and 8.25===8.25; a byte diff would be spoiled by float format).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  expand,
  toLen,
  round2,
  GGD_PER_WC3,
  SIM_CAPABILITIES,
  missingCaps,
  eject,
  mergeExpansion,
} from "./expand";
import { diffDocs } from "../editModel";
import { zAbilityDoc } from "../schema/ability";
import { zTemplateDoc, type TemplateDoc } from "../schema/template";

const CONTENT_DIR = join(__dirname, "../../../../../content");

function loadTemplate(id: string): TemplateDoc {
  const raw = JSON.parse(
    readFileSync(join(CONTENT_DIR, "ability-templates", `${id}.json`), "utf8"),
  );
  return zTemplateDoc.parse(raw);
}
function loadAbility(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT_DIR, "abilities", `${id}.json`), "utf8"));
}

describe("GGD_PER_WC3 length constant (11/600)", () => {
  it("is exactly 11/600", () => {
    expect(GGD_PER_WC3).toBe(11 / 600);
  });
  it("converts the verified content anchors", () => {
    expect(toLen(450)).toBe(8.25); // godie-h020.e radius, EXACT
    expect(toLen(500)).toBe(9.17); // godie-hgam.e range (靈壓 aura)
    expect(toLen(763)).toBe(13.99); // 763×11/600 = 13.9883… → 13.99 at 2dp
  });
  it("round2 rounds to 2 decimals", () => {
    expect(round2(9.16666)).toBe(9.17);
  });
});

describe("SIM_CAPABILITIES + missingCaps", () => {
  it("marks the P1 families' caps available and P2/P3 unavailable", () => {
    expect(missingCaps(["projectile", "hooks", "applyBuff", "auras"])).toEqual([]);
    // task #247 flipped `leap` to available (real LeapSystem + wire channel),
    // so it is no longer part of the missing set.
    expect(missingCaps(["leap", "knockback", "summon"])).toEqual([
      "knockback",
      "summon",
    ]);
    // Indexed through the Record, so this also asserts the key EXISTS —
    // `SIM_CAPABILITIES.dash!.available` would have hidden a renamed key.
    expect(SIM_CAPABILITIES.dash?.available).toBe(true);
  });
});

describe("golden per family (template + exemplar params → EffectDef shape)", () => {
  it("single-strike → one targeted magic strike", () => {
    const t = loadTemplate("tpl-single-strike");
    const ex = expand(t, {
      damage: { perRank: [100, 200], ratios: [] },
      damageType: "magic",
      castTimeSec: 0,
    });
    expect(ex.castType).toBe("targeted");
    expect(ex.targetsEnemies).toBe(true);
    expect(ex.effects).toEqual([
      { kind: "damage", damageType: "magic", amount: { perRank: [100, 200], ratios: [] } },
    ]);
  });

  it("instant-blast with radius → ground AoE", () => {
    const t = loadTemplate("tpl-instant-blast");
    const ex = expand(t, {
      radius: 480,
      damage: { perRank: [200], ratios: [] },
      damageType: "magic",
      castTimeSec: 1,
    });
    expect(ex.castType).toBe("ground");
    expect(ex.radius).toBe(toLen(480)); // 8.8
  });

  it("instant-blast without radius → single target", () => {
    const t = loadTemplate("tpl-instant-blast");
    const ex = expand(t, {
      radius: undefined,
      damage: { perRank: [200], ratios: [] },
      damageType: "magic",
    });
    expect(ex.castType).toBe("targeted");
    expect(ex.radius).toBeUndefined();
  });

  it("ground-nova → self nova with converted radius", () => {
    const t = loadTemplate("tpl-ground-nova");
    const ex = expand(t, { radius: 530, damage: { perRank: [150] }, damageType: "magic" });
    expect(ex.castType).toBe("self");
    expect(ex.radius).toBe(toLen(530));
  });

  it("line-sweep → skillshot wave projectile", () => {
    const t = loadTemplate("tpl-line-sweep");
    const ex = expand(t, { damage: { perRank: [150] }, damageType: "magic" });
    expect(ex.castType).toBe("skillshot");
    expect(ex.effects[0]).toMatchObject({ kind: "spawnProjectile", projectileId: "imported.wave" });
  });

  it("traveling-wave → skillshot wave with terminal burst radius", () => {
    const t = loadTemplate("tpl-traveling-wave");
    const ex = expand(t, { terminalBurst: 450, damage: { perRank: [200] }, damageType: "magic" });
    expect(ex.castType).toBe("skillshot");
    expect(ex.radius).toBe(toLen(450));
  });

  it("on-attack → passive hook, effects stays []", () => {
    const t = loadTemplate("tpl-on-attack");
    const ex = expand(t, {
      event: "onBasicAttack",
      chance: 1,
      bonusDamage: { perRank: [9999] },
      damageType: "true",
    });
    expect(ex.innateKind).toBe("passive");
    expect(ex.effects).toEqual([]);
    expect(ex.passive?.ranks[0]?.hooks?.[0]?.on).toBe("onBasicAttack");
  });

  it("on-hit-react → passive onDamageTaken hook", () => {
    const t = loadTemplate("tpl-on-hit-react");
    const ex = expand(t, { chance: 1, reflectDamage: { perRank: [30] }, damageType: "magic" });
    expect(ex.innateKind).toBe("passive");
    expect(ex.passive?.ranks[0]?.hooks?.[0]?.on).toBe("onDamageTaken");
  });

  it("buff-self → self applyBuff with modifiers + duration", () => {
    const t = loadTemplate("tpl-buff-self");
    const ex = expand(t, {
      duration: 15,
      modifiers: [{ stat: "ad", op: "flat", value: 50 }],
      castTimeSec: 0,
    });
    expect(ex.castType).toBe("self");
    expect(ex.effects[0]).toEqual({
      kind: "applyBuff",
      modifiers: [{ stat: "ad", op: "flat", value: 50 }],
      duration: 15,
    });
  });

  it("draft family has no expand path (throws)", () => {
    const t = loadTemplate("tpl-summon-agent");
    expect(() => expand(t, {})).toThrow(/no P1 expand path/);
  });

  it("a param value outside its slot range throws", () => {
    const t = loadTemplate("tpl-ground-nova");
    expect(() => expand(t, { radius: 9999, damage: { perRank: [1] }, damageType: "magic" })).toThrow(
      /above max/,
    );
  });
});

describe("ROUNDTRIP diff=0 — re-author godie-hgam.e via tpl-instant-blast (P1 acceptance)", () => {
  it("expand reproduces the on-disk behaviour half with SEMANTIC diff zero", () => {
    const hgam = loadAbility("godie-hgam.e");
    const t = loadTemplate("tpl-instant-blast");

    // Params recovered from the doc itself, so the damage scaling is byte-shared.
    const params = {
      // radius OMITTED — hgam is castType "targeted" with no radius
      damage: hgam.effects != null ? (hgam.effects as { amount: unknown }[])[0]!.amount : null,
      damageType: (hgam.effects as { damageType: string }[])[0]!.damageType,
      castTimeSec: hgam.castTimeSec,
    };
    const ex = expand(t, params);

    // The behaviour half the expander OWNS, as it sits on disk.
    const onDisk: Record<string, unknown> = {
      castType: hgam.castType,
      effects: hgam.effects,
      targetsEnemies: hgam.targetsEnemies,
      castTimeSec: hgam.castTimeSec,
    };

    expect(diffDocs(onDisk, ex as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("the merged skeleton⊕expansion passes zAbilityDoc", () => {
    const hgam = loadAbility("godie-hgam.e");
    const t = loadTemplate("tpl-instant-blast");
    // Skeleton: hgam minus its hand-written effects, carrying template ref instead.
    const skeleton: Record<string, unknown> = {
      ...hgam,
      effects: [],
      template: {
        ref: "tpl-instant-blast",
        params: {
          damage: (hgam.effects as { amount: unknown }[])[0]!.amount,
          damageType: (hgam.effects as { damageType: string }[])[0]!.damageType,
          castTimeSec: hgam.castTimeSec,
        },
      },
    };
    const merged = mergeExpansion(
      skeleton,
      expand(t, (skeleton.template as { params: Record<string, unknown> }).params),
    );
    const parsed = zAbilityDoc.parse(merged);
    // The expanded doc reproduces hgam's effects, and keeps the template link.
    expect(parsed.effects).toEqual(hgam.effects);
    expect((parsed as { template?: unknown }).template).toBeDefined();
  });

  it("eject inlines the expansion and drops the template link", () => {
    const hgam = loadAbility("godie-hgam.e");
    const t = loadTemplate("tpl-instant-blast");
    const params = {
      damage: (hgam.effects as { amount: unknown }[])[0]!.amount,
      damageType: (hgam.effects as { damageType: string }[])[0]!.damageType,
      castTimeSec: hgam.castTimeSec,
    };
    const ejected = eject({ ...hgam, effects: [], template: { ref: t.id, params } }, t, params);
    expect(ejected.template).toBeUndefined();
    expect(ejected.effects).toEqual(hgam.effects);
    expect(() => zAbilityDoc.parse(ejected)).not.toThrow();
  });
});
