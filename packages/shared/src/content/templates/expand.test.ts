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
    // task #247 flipped `leap`; the 鑄技工坊 default-audit pass then flipped
    // `knockback`, `summon` and `periodicDamage` — each only after RUNNING its
    // handler (see simCapabilityDrift.test.ts, which is the guard that makes a
    // stale row here go red instead of aging quietly).
    expect(missingCaps(["leap", "knockback", "summon", "periodicDamage"])).toEqual([]);
    // ⭐ 2026-08-22（#541 / #147）—— `combo` 與 `pull` 也翻了。`combo` 曾經是
    // 這張表裡唯一誠實的 false（`comboStrikes` 出貨之後它就是謊了）；`pull`
    // 在此之前**整列不存在**，而 `missingCaps` 把未知 key 當成缺失，所以任何
    // `requires: ["pull"]` 的模板都會掛著一個假的紅徽章。
    expect(missingCaps(["combo", "pull"])).toEqual([]);
    // ⛔ 這一行不是裝飾：`missingCaps` 對**不存在的 key** 也回「缺失」，
    // 所以上面那條在打錯字時一樣會綠。這一條問的是「這兩列真的在表上」。
    expect(missingCaps(["definitely-not-a-capability"])).toEqual(["definitely-not-a-capability"]);
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

  // castType is "ground", NOT "self": `castAbility`'s "self" branch sets
  // `targets = [caster]` and never reads `radius`, so the old expansion aimed
  // the nova at its own caster. See the note on the family in expand.ts, and
  // orbitProxy.test.ts's `nova-hits-the-ring` for the behavioural guard — this
  // line alone is a property assertion and would pass either way if the damage
  // never reached a body.
  it("ground-nova → ground nova with converted radius", () => {
    const t = loadTemplate("tpl-ground-nova");
    const ex = expand(t, { radius: 530, damage: { perRank: [150] }, damageType: "magic" });
    expect(ex.castType).toBe("ground");
    expect(ex.radius).toBe(toLen(530));
  });

  it("line-sweep → skillshot wave projectile", () => {
    const t = loadTemplate("tpl-line-sweep");
    const ex = expand(t, { damage: { perRank: [150] }, damageType: "magic" });
    expect(ex.castType).toBe("skillshot");
    expect(ex.effects[0]).toMatchObject({ kind: "spawnProjectile", projectileId: "imported.wave" });
  });

  // ⚠️ 這一條在 GH#393 之前斷言 `ex.radius === toLen(450)` —— 那是**折算**的
  // 形狀：整個家族被壓成一顆投射體，而終點爆發只好寄生成技能自己的 AoE 半徑。
  // 現在它是 `delayed` + `advance`，終點爆發回到它本來的位置（`finalEffects`，
  // ＝「只有最後一下才追加」）。行為守衛在 sim/effects/travelingWaveAdvance.test.ts。
  it("traveling-wave → 逐段推進的 delayed，終點爆發掛在 finalEffects", () => {
    const t = loadTemplate("tpl-traveling-wave");
    const ex = expand(t, {
      stepSize: 45,
      stepCount: 20,
      stepIntervalSec: 0.03,
      aoePerStep: 200,
      terminalBurst: 450,
      damage: { perRank: [200] },
      damageType: "magic",
    });
    expect(ex.castType).toBe("skillshot");
    expect(ex.effects[0]).toMatchObject({
      kind: "delayed",
      targetMode: "reresolve",
      hitOncePerTarget: true,
      count: 20,
      advance: { stepDist: toLen(45), dir: "facing" },
      finalEffects: [{ kind: "damageArea", radius: toLen(450) }],
    });
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

/**
 * godie-hgam.e's HAND-WRITTEN behaviour half, exactly as it sat in
 * `content/abilities/godie-hgam.e.json` before the 2026-08-02 adoption lane
 * (`git show ae722e6b:content/abilities/godie-hgam.e.json`).
 *
 * ⚠️ WHY THIS IS FROZEN HERE INSTEAD OF READ OFF DISK. It used to be read off
 * disk, and that is precisely what broke: this suite is the P1 ACCEPTANCE proof
 * that `expand()` can reproduce a real hand-authored skill, and it used the
 * shipped doc as its own fixture. On 2026-08-02 godie-hgam.e was itself
 * re-authored onto a template, its `effects` became `[]`, and the "proof"
 * started reading `[][0].amount` — i.e. the fixture moved under the test
 * (失敗形態 ⑤: 被測的不是出貨的那個, in reverse).
 *
 * Frozen because the fact is otherwise UNRECOVERABLE once the file is rewritten
 * — the same reason `PRE_LANE_CAST_TIMES` is frozen in castTimeCoverage.test.ts.
 * The template itself is still loaded from the real `content/ability-templates`
 * tree, so what is being proved (the expander reproduces this behaviour) is
 * unchanged; only the baseline stopped being a moving target.
 */
const HGAM_E_PRE_TEMPLATE: Record<string, unknown> = {
  castType: "targeted",
  targetsEnemies: true,
  castTimeSec: 0.5,
  effects: [
    {
      kind: "damage",
      damageType: "magic",
      amount: { perRank: [350, 500, 650, 800], ratios: [{ stat: "ap", coeff: 0.6 }] },
    },
  ],
};

/**
 * The params that re-author the frozen behaviour half through a template.
 *
 * ⚠️ WRITTEN OUT AS INDEPENDENT LITERALS ON PURPOSE — do NOT "simplify" this by
 * deriving it from `HGAM_E_PRE_TEMPLATE`. A first cut of this file did exactly
 * that (`damage: HGAM_E_PRE_TEMPLATE.effects[0].amount`), which made both sides
 * of the diff the SAME OBJECT: mutating the frozen `coeff` from 0.6 to 0.7 moved
 * the input and the expectation together and all 18 tests stayed green. That is
 * a tautology, not an acceptance proof (失敗形態 ③/④). Two independent literals
 * is what makes the roundtrip assertion able to fail.
 */
const HGAM_E_PARAMS: Record<string, unknown> = {
  // radius OMITTED — hgam is castType "targeted" with no radius
  damage: { perRank: [350, 500, 650, 800], ratios: [{ stat: "ap", coeff: 0.6 }] },
  damageType: "magic",
  castTimeSec: 0.5,
};

describe("ROUNDTRIP diff=0 — re-author godie-hgam.e via tpl-instant-blast (P1 acceptance)", () => {
  it("expand reproduces the pre-template behaviour half with SEMANTIC diff zero", () => {
    const t = loadTemplate("tpl-instant-blast");
    const ex = expand(t, HGAM_E_PARAMS);
    expect(diffDocs(HGAM_E_PRE_TEMPLATE, ex as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("the merged skeleton⊕expansion passes zAbilityDoc", () => {
    // The skeleton is still the REAL shipped doc — only the behaviour baseline is
    // frozen. Its `effects` is already `[]` now that it is template-authored.
    const hgam = loadAbility("godie-hgam.e");
    const t = loadTemplate("tpl-instant-blast");
    const skeleton: Record<string, unknown> = {
      ...hgam,
      effects: [],
      template: { ref: "tpl-instant-blast", params: HGAM_E_PARAMS },
    };
    const merged = mergeExpansion(
      skeleton,
      expand(t, (skeleton.template as { params: Record<string, unknown> }).params),
    );
    const parsed = zAbilityDoc.parse(merged);
    // The expanded doc reproduces hgam's ORIGINAL effects, and keeps the link.
    expect(parsed.effects).toEqual(HGAM_E_PRE_TEMPLATE.effects);
    expect((parsed as { template?: unknown }).template).toBeDefined();
  });

  it("eject inlines the expansion and drops the template link", () => {
    const hgam = loadAbility("godie-hgam.e");
    const t = loadTemplate("tpl-instant-blast");
    const ejected = eject(
      { ...hgam, effects: [], template: { ref: t.id, params: HGAM_E_PARAMS } },
      t,
      HGAM_E_PARAMS,
    );
    expect(ejected.template).toBeUndefined();
    expect(ejected.effects).toEqual(HGAM_E_PRE_TEMPLATE.effects);
    expect(() => zAbilityDoc.parse(ejected)).not.toThrow();
  });
});
