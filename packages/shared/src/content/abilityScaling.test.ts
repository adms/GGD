/**
 * ability-scaling (docs/todo/stats-effects.md fx-15..fx-18).
 *
 * WC3 abilities carry no stat scaling: attribute scaling lived in JASS triggers
 * and does not survive an object-data import. A straight import therefore left
 * every godie-* ability a CONSTANT — `resolveScaling` only adds stat
 * contributions via `sc.ratios`, so `ap` was a completely dead stat and no item
 * build could improve an ability.
 *
 * The scaling model (applied to content + emitted by tools/w3x-import):
 *   stat    physical damage -> ad ; magic/true damage, heal, shield -> ap
 *   coeff   proportional to the ability's own base (0.003/point of base damage),
 *           capped at 1.0 — every ability gains the same PERCENTAGE per point of
 *           ap, so a nuke and a DoT tick keep their relative weight.
 *   budget  ap is ATTRIBUTE-SOURCED: since task #248 it is `intToAbilityPower ×
 *           INT`, never a hand-authored `baseStats.ap`/`growth.ap`. fx-17 used
 *           to pin the opposite (ap zero everywhere, so ratios were pure item
 *           upside); #248 is exactly the change that made ap live, so fx-17 now
 *           pins the SOURCING rule instead — see the comment on that test.
 *
 * Reads docs by DIRECT file path (same rationale as standinRoster.test.ts).
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { cover } from "../../testkit/cover";
import { effectsOf } from "../../testkit/expandedEffects";
import { zChampionDoc, type ChampionDoc } from "./schema/champion";
import { zItemDoc, type ItemDoc } from "./schema/item";
import { NO_ATTR_LOOKUP, resolveScaling, type Scaling } from "../sim/effects/effect";
import { Stat, zeroStats } from "../sim/stats/statTypes";
import { championStatBase } from "../sim/stats/attributes";
import { DEFAULT_COMBAT_ENV } from "../sim/combatEnv";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
/**
 * ⭐ B1-L（2026-08-12）：**1.0 → 10.0**。
 *
 * 這格以前是 1.0，而 `tools/skill-remake/batch1.py` 的 `amt()` 讀了它、
 * 在產生器裡寫死了 `min(float(ap), 1.0)` —— 於是 owner 規格的「300% AP」
 * 「500% AP」被**靜默**夾成 100%，卡片上卻仍然寫 300%（失敗形態②）。
 *
 * ⛔ 這條界線**不是平衡旋鈕**，它是**打字錯誤的捕手**：`coeff: 100`
 * （想寫 1.0 卻寫成百分比）跟 `coeff: 5`（真的是 500%）長得不一樣。
 * 平衡請走 `config.combat-env@1` 的倍率，⛔ 不要回來調這個常數。
 */
const RATIO_MAX = 10.0;

function read<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(CONTENT, dir, file), "utf8")) as T;
}

function godieChampions(): ChampionDoc[] {
  return readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.startsWith("godie-") && f.endsWith(".json"))
    .map((f) => read<unknown>("champions", f))
    .filter((d): d is ChampionDoc => (d as ChampionDoc)?.schema === "champion@1")
    .map((d) => zChampionDoc.parse(d));
}

/** Effects that carry an `amount`, paired with the ability that owns them. */
function amountEffects(c: ChampionDoc) {
  const out: { slot: string; kind: string; dtype?: string; amount: Scaling }[] = [];
  for (const [slot, ab] of Object.entries(c.abilities ?? {})) {
    // 讀**展開後**的形狀，不是文件裡打了什麼 —— 2026-08-02 之後有 143 支技能的
    // effects 住在模板裡，`ab.effects` 是 `[]`（見 testkit/expandedEffects.ts）。
    for (const e of effectsOf(ab) as Record<string, never>[]) {
      const amount = e["amount"] as unknown as Scaling | undefined;
      if (amount) {
        out.push({
          slot,
          kind: e["kind"] as unknown as string,
          dtype: e["damageType"] as unknown as string | undefined,
          amount,
        });
      }
    }
  }
  return out;
}

/**
 * ⭐ B1-E（2026-08-12）：**純比例的酬載不是惰性的**。
 *
 * 這個函式以前只認 `flat` + `perRank`，看不見 `ratios` / `attrRatios` ——
 * 所以「造成 300% AP 的傷害」（沒有固定基礎值）會被判成惰性。
 * 而 `batch1.py` 為了繞過這條判定，在三個 helper 裡偷塞 `flat = 50`：
 * 29 顆 `flat==50` 的節點 / 17 份文件，玩家看到一個卡片解釋不了的固定值。
 *
 * ⛔ 兩件事必須一起改（分開改就會紅在錯的地方）：產生器刪掉注入、這裡放寬判定。
 */
const hasProportional = (a: Scaling) =>
  (a.ratios?.length ?? 0) > 0 || (a.attrRatios?.length ?? 0) > 0;
const baseOf = (a: Scaling) =>
  hasProportional(a)
    ? Number.POSITIVE_INFINITY
    : (a.flat ?? 0) + Math.max(0, ...(a.perRank ?? [0]));

/**
 * Below this an ability would have no usable base to size a proportional ratio
 * against. This guard USED to skip 62 abilities whose `amount` was a flat 0 or
 * rounding dust like 0.01–0.4: WC3 computed their damage in a JASS trigger, so
 * the object-data field the importer reads was empty.
 *
 * Those 62 have since been repaired from the UNPROTECTED source map
 * (`src_gogodieEX227s.w3x`): 28 had real damage/heal bases recovered (12 from
 * exact `war3map.j` formulas, the rest from per-level ubertips — the two
 * sources agreed exactly wherever both existed), and 34 turned out not to be
 * damage abilities at all (auras/toggles/blinks whose percentage the importer
 * had filed as a damage amount) and were remodelled onto the effect kind they
 * actually use. The guard is therefore expected to be VACUOUS now, which
 * fx-19 pins — if it ever skips something again, an import defect has returned.
 */
const MIN_SCALABLE_BASE = 1;

/**
 * Abilities whose SOURCE formula has no ability-power-shaped term at all, so a
 * ratio here would be an invention rather than an import (task #78 phase 3).
 * Each was transcribed from the unprotected `war3map.j` or from `war3map.w3a`,
 * and each formula's only variable term is a WC3 hero ATTRIBUTE:
 *
 *   godie-edem.Q 火遁-豪火龍之術  `skillLevel*100 + 150 + 2*AGI`   (ChoChuFireDro)
 *   godie-h01u.E 鬼神烈戟        `150 + 200*level + 3*STR`        (skill3)
 *   godie-o00k.R 打雷絕招        A04H 每個目標傷害 150/200/250     (w3a, flat per level)
 *   godie-o02p.R 世界第一的公主殿下 A11E 回復 200/275/350          (w3a, flat per level)
 *
 * The attribute terms are DROPPED, not approximated — porting them needs the
 * STR/AGI/INT inverse map (ledger §6 U3), which is an explicit user decision.
 * Until then these four carry their exact flat per-level base and nothing else.
 * Keeping them OUT of fx-15 is the point: re-adding an `ap` coefficient here
 * would silently re-fabricate the number the fidelity pass just removed.
 */
const NO_NATIVE_RATIO = new Set([
  "godie-edem.Q",
  "godie-h01u.E",
  "godie-o00k.R",
  "godie-o02p.R",
]);

describe("imported ability stat scaling", () => {
  const champs = godieChampions();

  it("every imported damage/heal/shield effect with a real base scales off a stat (fx-15)", () => {
    cover("ability-scaling-present");
    expect(champs.length).toBeGreaterThan(100);

    const unscaled: string[] = [];
    let scaled = 0;
    for (const c of champs) {
      for (const e of amountEffects(c)) {
        if (!["damage", "heal", "shield"].includes(e.kind)) continue;
        if (baseOf(e.amount) < MIN_SCALABLE_BASE) continue;
        if (NO_NATIVE_RATIO.has(`${c.id}.${e.slot}`)) {
          // pinned: the exemption must stay EXACT — an exempt ability that
          // grew a ratio back is a re-fabrication, not a fix.
          expect(e.amount.ratios ?? []).toEqual([]);
          continue;
        }
        if (e.amount.ratios?.length) scaled++;
        else unscaled.push(`${c.id}.${e.slot}`);
      }
    }
    expect(unscaled).toEqual([]);
    expect(scaled).toBeGreaterThanOrEqual(248); // champion-embedded Q/W/E/R effects
  });

  it("ratios use the right stat and stay in band (fx-16)", () => {
    cover("ability-scaling-band");
    for (const c of champs) {
      for (const e of amountEffects(c)) {
        for (const r of e.amount.ratios ?? []) {
          // ⚠️ THE RULE IS `damageType`, NOT `kind`. This line used to read
          // `e.kind === "damage" && …`, which quietly excluded every damage
          // effect that is not literally kind `damage` — `damageLine` (task
          // #210 近戰擴散 / 揍敵客 13-03 佈壁) and `damageArea`. A physical
          // damageLine scaling off `ad` — the model's own rule, stated in this
          // file's header — was therefore reported as a violation, and the
          // "fix" the failure invites is to rewrite correct content to `ap`.
          // Census over the shipped tree (2026-07-31): damage/magic→ap ×169,
          // damage/physical→ad ×102, damageLine/physical→ad ×1, heal+shield
          // (no damageType)→ap ×15. ZERO physical effects scale off anything
          // but ad, so keying off `dtype` alone is both simpler and exact.
          const want = e.dtype === "physical" ? Stat.AttackDamage : Stat.AbilityPower;
          expect(`${c.id}.${e.slot}:${r.stat}`).toBe(`${c.id}.${e.slot}:${want}`);
          expect(r.coeff).toBeGreaterThan(0);
          expect(r.coeff).toBeLessThanOrEqual(RATIO_MAX);
        }
      }
    }
  });

  it("ap is INTELLIGENCE-sourced, never hand-authored on the card (fx-17)", () => {
    cover("ability-scaling-budget-neutral");
    // ---------------------------------------------------------------------
    // #248 DELIBERATELY BROKE THIS TEST'S ORIGINAL CLAIM. Read this before
    // "fixing" a failure here.
    //
    // fx-17 used to assert that an ap ratio "contributes exactly nothing at
    // zero items", because no champion had any ap. Task #248 — 智慧→AP — is
    // precisely the change that makes ap non-zero for every champion:
    // `ap = baseStats.ap + intToAbilityPower × INT`. So zero-item ability
    // damage IS higher now, on purpose, and asserting otherwise would pin the
    // bug the task was raised to remove.
    //
    // What survives, and is worth more, is the SOURCING rule: ap must come
    // from the attribute layer, not from hand-authored card fields. If someone
    // types an `ap` into `baseStats`/`growth`, that champion gets a silent
    // second helping on top of INT — exactly the double-count #248's three
    // additive layers make easy to introduce.
    // ---------------------------------------------------------------------
    for (const c of champs) {
      expect(`${c.id}:${c.baseStats.ap}`).toBe(`${c.id}:0`);
      expect((c.growth as Record<string, number>).ap ?? 0).toBe(0);
      // …and every champion DOES now carry the 三圍 block that supplies it.
      expect(`${c.id}:${c.attributes === undefined}`).toBe(`${c.id}:false`);
    }

    // The whole of a champion's zero-item ap is the attribute term, at every
    // level — no residue from anywhere else.
    const lina = champs.find((c) => c.id === "godie-h020")!;
    for (const level of [1, 6, 12, 18]) {
      const int = lina.attributes!.int + lina.attributes!.intGrowth * (level - 1);
      expect(championStatBase(lina, Stat.AbilityPower, level)).toBeCloseTo(
        DEFAULT_COMBAT_ENV.intToAbilityPower * int,
        6,
      );
    }

    // And an ap ratio is now LIVE at zero items: 火球術 scales off Lina's INT.
    const apAt1 = { ...zeroStats(), [Stat.AbilityPower]: championStatBase(lina, Stat.AbilityPower, 1) };
    let sawLiveRatio = false;
    for (const e of amountEffects(lina)) {
      if (!e.amount.ratios?.some((r) => r.stat === Stat.AbilityPower)) continue;
      const withRatios = resolveScaling(apAt1, e.amount, 1, NO_ATTR_LOOKUP);
      const withoutRatios = resolveScaling(apAt1, { ...e.amount, ratios: [] }, 1, NO_ATTR_LOOKUP);
      expect(withRatios).toBeGreaterThan(withoutRatios);
      sawLiveRatio = true;
    }
    expect(sawLiveRatio, "godie-h020 must still carry an ap-scaled ability").toBe(true);
  });

  it("buying an AP item raises ability damage (fx-18)", () => {
    cover("ability-scaling-ap-items");
    const wand = zItemDoc.parse(read<ItemDoc>("items", "godie-i010.json")); // 熱戀魔杖
    const ap = (wand.modifiers ?? []).find((m) => m.stat === Stat.AbilityPower);
    expect(ap, "熱戀魔杖 must still sell ap").toBeTruthy();
    // The gate is that ap is BUYABLE IN QUANTITY, not that it hits a specific
    // number. It used to assert >= 45 against the pre-#82 ember-rod (45 ap for
    // 900g); task #82 put every item on one exchange rate — 46.15 gold per
    // AD-equivalent point, ap at 0.2054 AEP/point — so a 300g SIMPLE item's
    // whole budget is ~31.6 ap and 熱戀魔杖 spends part of its on mana. What
    // must not come back is the ORIGINAL defect: raw WC3 INT points (ap 10),
    // ~14x less gold-efficient than a native item and never worth buying.
    expect(ap!.value).toBeGreaterThanOrEqual(20);
    // …and the pure-ap reference item still spends its whole budget on ap.
    const rod = zItemDoc.parse(read<ItemDoc>("items", "ember-rod.json"));
    const rodAp = (rod.modifiers ?? []).find((m) => m.stat === Stat.AbilityPower);
    expect(rodAp!.value).toBeGreaterThanOrEqual(30);

    const lina = champs.find((c) => c.id === "godie-h020")!;
    const stats = zeroStats();
    const withAp = { ...zeroStats(), [Stat.AbilityPower]: ap!.value };

    let before = 0;
    let after = 0;
    for (const e of amountEffects(lina)) {
      if (e.kind !== "damage") continue;
      before += resolveScaling(stats, e.amount, 1, NO_ATTR_LOOKUP);
      after += resolveScaling(withAp, e.amount, 1, NO_ATTR_LOOKUP);
    }
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before); // ap is no longer a dead stat
  });

  it("no imported effect is inert, and both copies of an ability agree (fx-19)", () => {
    cover("ability-scaling-no-inert");

    // An `amount` below MIN_SCALABLE_BASE deals ~nothing in game. Every one of
    // those was an unrecovered JASS-scaled spell; all 62 are now repaired, so
    // the population must stay empty in BOTH places an ability is stored.
    const inert: string[] = [];
    for (const c of champs) {
      for (const e of amountEffects(c)) {
        if (!["damage", "heal", "shield"].includes(e.kind)) continue;
        if (baseOf(e.amount) < MIN_SCALABLE_BASE) inert.push(`${c.id}.${e.slot}:${e.kind}`);
      }
    }

    // Every godie ability is mirrored: embedded in champion.abilities AND as a
    // standalone abilities/<id>.json. A repair that touched only one copy would
    // silently desync the editor from the sim, so pin that they are identical.
    const desynced: string[] = [];
    for (const c of champs) {
      for (const ab of Object.values(c.abilities ?? {})) {
        if (!ab?.id) continue;
        let standalone: Record<string, unknown>;
        try {
          standalone = read<Record<string, unknown>>("abilities", `${ab.id}.json`);
        } catch {
          continue; // not every embedded ability is also exported standalone
        }
        for (const e of (standalone["effects"] ?? []) as Record<string, never>[]) {
          const amount = e["amount"] as unknown as Scaling | undefined;
          if (!amount) continue;
          if (!["damage", "heal", "shield"].includes(e["kind"] as unknown as string)) continue;
          if (baseOf(amount) < MIN_SCALABLE_BASE) inert.push(`${ab.id}(standalone):${e["kind"]}`);
        }
        if (JSON.stringify(standalone["effects"]) !== JSON.stringify(ab.effects)) {
          desynced.push(ab.id);
        }
      }
    }

    expect(inert).toEqual([]);
    expect(desynced).toEqual([]);
  });
});
