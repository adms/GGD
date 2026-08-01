/**
 * 擊殺觸發家族 —— the LOAD-TIME half. `content/schema/effect.ts` has to refuse
 * the two `grantAttribute.store` mis-pairings, and it has to accept the shapes
 * 天生牙 / 甘豆腐之袍 actually ship.
 *
 * WHY IT IS A SEPARATE FILE FROM `sim/killTriggerItems.test.ts`. That one drives
 * the SIM: it can only observe what a parsed document does. A field that is
 * silently ignored — `maxSourceTotal` without `store`, so the 「上限 160」 on the
 * card is never checked — behaves EXACTLY like a correct document in the sim
 * until the 17th kill, which no behavioural test would ever reach by accident.
 * The only place that defect is cheap to catch is the parser.
 *
 * ⚠️ THE REFINEMENT DOES NOT LIVE ON THE UNION MEMBER. `z.discriminatedUnion`
 * only accepts `ZodObject`s and `.superRefine` returns `ZodEffects`, so it rides
 * `zEffectDef` — the lazy wrapper every document is validated through. These
 * cases therefore go through `zEffectDef`, i.e. the same object a hook's
 * `effects` array is parsed with; parsing `zEffectDefUnion` directly would skip
 * exactly the thing under test.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../testkit/cover";
import { zEffectDef, zHookDefBase } from "./schema/effect";

const TAG = "kill-trigger-schema";

const grant = (over: Record<string, unknown>): Record<string, unknown> => ({
  kind: "grantAttribute",
  attr: "int",
  amount: 10,
  ...over,
});

describe("grantAttribute.store — the two pairings that would lie", () => {
  it("accepts the shipped 甘豆腐之袍 shape", () => {
    cover(`${TAG}/store-source-ok`);
    expect(zEffectDef.safeParse(grant({ store: "source", maxSourceTotal: 160 })).success).toBe(
      true,
    );
  });

  it("REFUSES maxSourceTotal without store — an unchecked ceiling is a lying card", () => {
    cover(`${TAG}/max-source-total-needs-store`);
    const r = zEffectDef.safeParse(grant({ maxSourceTotal: 160 }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain("maxSourceTotal");
  });

  it("REFUSES store:\"source\" + durationSec — expiry only knows about attrBonus", () => {
    cover(`${TAG}/store-source-rejects-duration`);
    // `attrGrantExpirySystem` reverses `ChampionComp.attrBonus` and nothing else,
    // so a timed grant banked on a SOURCE would never come back off — a card that
    // says 3 秒 and pays forever.
    const r = zEffectDef.safeParse(grant({ store: "source", durationSec: 3 }));
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain("durationSec");
  });

  it("leaves every pre-existing doc alone (no store = the old shape, still valid)", () => {
    cover(`${TAG}/store-absent-unchanged`);
    // 蒼月潮 07-00 獸化心靈 and 勇者小呆 08-00 龍紋記憶, as authored today.
    expect(
      zEffectDef.safeParse(grant({ attr: "agi", amount: 1, everyNth: 8, maxAttribute: 120 }))
        .success,
    ).toBe(true);
    expect(
      zEffectDef.safeParse(grant({ mode: "pctOfCurrent", amount: 1, durationSec: 3 })).success,
    ).toBe(true);
  });
});

describe("the revive effect and the 全隊 hook scope", () => {
  it("accepts a bare `revive` (every field optional, defaults documented)", () => {
    cover(`${TAG}/revive-bare`);
    expect(zEffectDef.safeParse({ kind: "revive" }).success).toBe(true);
  });

  it("bounds hpPct / manaPct at 1 — 「50%」 typed as 50 is a full-HP team revive", () => {
    cover(`${TAG}/revive-pct-ceiling`);
    expect(zEffectDef.safeParse({ kind: "revive", hpPct: 0.5 }).success).toBe(true);
    expect(zEffectDef.safeParse({ kind: "revive", hpPct: 50 }).success).toBe(false);
    expect(zEffectDef.safeParse({ kind: "revive", manaPct: 50 }).success).toBe(false);
    // …and the floor is 0, because 「留一口氣的復活」 is a real design (the sim
    // clamps to ≥1 HP), while a negative fraction is not.
    expect(zEffectDef.safeParse({ kind: "revive", hpPct: 0 }).success).toBe(true);
    expect(zEffectDef.safeParse({ kind: "revive", hpPct: -0.1 }).success).toBe(false);
  });

  it("the enums are closed — a typo cannot become a silently permissive item", () => {
    cover(`${TAG}/revive-enums-closed`);
    expect(zEffectDef.safeParse({ kind: "revive", side: "any" }).success).toBe(true);
    expect(zEffectDef.safeParse({ kind: "revive", side: "enemy" }).success).toBe(false);
    expect(
      zEffectDef.safeParse({ kind: "revive", teamCharge: "requireAndSpend" }).success,
    ).toBe(true);
    expect(zEffectDef.safeParse({ kind: "revive", teamCharge: "free" }).success).toBe(false);
  });

  it("`target: \"allies\"` is authorable, and it is the only new scope value", () => {
    cover(`${TAG}/hook-target-allies`);
    const hook = (target: string): Record<string, unknown> => ({
      on: "onKill",
      target,
      effects: [{ kind: "revive" }],
    });
    for (const t of ["self", "event", "allies"]) {
      expect(zHookDefBase.safeParse(hook(t)).success).toBe(true);
    }
    expect(zHookDefBase.safeParse(hook("enemies")).success).toBe(false);
  });
});
