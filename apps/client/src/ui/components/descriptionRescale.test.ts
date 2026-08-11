/**
 * 說明數值最終化 — the DESCRIPTION prose must show the post-combat-env FINAL
 * numbers, not the base WC3 numbers baked into the sentence. The reported bug:
 * a rescaled cooldown chip sat next to raw "60秒冷卻時間" prose, and a raw
 * "造成650傷害" line while the combat-env damage factor was scaling it down.
 *
 * These pin the pure seams (node-testable, no DOM/React):
 *   • rescaleAbilityProse rewrites the LITERALS a combat-env factor scales — the
 *     cooldown literal by the live `cooldown` factor and the damage literal by the
 *     live `damageDealt` factor — appending "（WC3原 …）", while leaving every
 *     OTHER number (heal / shield / mana / duration / stat) byte-for-byte
 *     untouched (those factors are ×1.0);
 *   • displayFinal(460,'health') reaches the maxHealth-scaled final, and the
 *     "damage" alias resolves to the damageDealt factor;
 *   • real ability docs carry NO role markup, so a role-rescale would be a no-op
 *     — this pins that fact so nobody re-adds one.
 * Both factors are read from the SAME combat-env source displayFinal uses; the
 * live table is loaded straight off content/config/combat-env.json so the test
 * tracks the shipped config, never hard-coded factors.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  normalizeCombatEnv,
  DEFAULT_COMBAT_ENV,
  type CombatEnvMultipliers,
} from "@ggd/shared/sim/combatEnv";
import {
  docDescription,
  parseRoleMarkup,
  rescaleAbilityProse,
  WC3_PROSE_CAPTION,
} from "./abilityText";
import { displayFinal, envFactor, statDisplayFactor } from "../displayFinal";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../../content");

/**
 * The shipped live combat-env. Its NUMBERS are the owner's to tune — assertions
 * against it must be invariants, never literals copied out of the file on the
 * day the test was written.
 */
const LIVE_CONFIG = JSON.parse(
  readFileSync(join(CONTENT, "config/combat-env.json"), "utf8"),
) as { multipliers: Partial<Record<string, number>> };
const LIVE: CombatEnvMultipliers = normalizeCombatEnv(
  LIVE_CONFIG.multipliers as Partial<Record<never, number>>,
);

/** A minimal quarter-cooldown table (damageDealt defaults to 1.0 → damage no-op). */
const CD_QUARTER = normalizeCombatEnv({ cooldown: 0.25 });
/** A minimal half-damage table (cooldown defaults to 1.0 → cooldown no-op). */
const DMG_HALF = normalizeCombatEnv({ damageDealt: 0.5 });

/** Five REAL abilities whose prose bakes a "NN秒冷卻時間" cooldown literal. */
/**
 * ⭐ 夾具是**掃出來的**，⛔ 不是寫死的 id 清單。
 *
 * ⚠️ 2026-08-12 之前這裡是 5 個寫死的 id。90 支技能重製之後，其中兩支的說明改了
 * 寫法（「35秒冷卻時間」→「35秒冷卻」、拿掉「造成 NNN 傷害」的字面值），於是這條
 * 守衛紅了 —— 而**它守的機制一點事都沒有**（HUD 的重寫器兩種寫法本來就都認）。
 * 那是純粹的維護稅：每次 owner 改文案就要有人回來換 id。
 *
 * 現在改成「掃出前 N 支同時帶兩種字面值的真實技能」。內容怎麼改都不會誤報，
 * 而斷言驗的東西完全沒變：真的說明 → 真的重寫器 → 冷卻與傷害都變成最終值。
 */
function pickRealIds(n: number): string[] {
  const dir = join(CONTENT, "abilities");
  const out: string[] = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const desc = docDescription(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (typeof desc !== "string") continue;
    if (/\d+秒冷卻(?:時間)?/.test(desc) && /造成\s*\d+\s*(?:點\s*)?傷害/.test(desc)) {
      out.push(f.replace(/\.json$/, ""));
      if (out.length >= n) break;
    }
  }
  return out;
}
const REAL_IDS = pickRealIds(5);
function loadAbility(id: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONTENT, "abilities", `${id}.json`), "utf8"));
}

describe("rescaleAbilityProse cooldown pass (hud-display-final)", () => {
  it("rewrites the cooldown literal to the final and annotates the WC3 original", () => {
    cover("hud-display-final");
    // the exact reported case, against a FIXED TEST factor: 60秒 base × 0.25 → 15s.
    // CD_QUARTER is this file's own fixture, not a copy of the shipped table, so
    // this literal is stable no matter how the owner tunes combat-env.
    expect(rescaleAbilityProse("60秒冷卻時間", CD_QUARTER)).toBe("15秒冷卻時間（WC3原 60秒）");
    // …and the same shape via the SHIPPED table, checked as an INVARIANT rather
    // than a literal. This line used to assert "15秒" because cooldown happened to
    // be 0.25 the day it was written; 039acb2 tuned it 0.25→0.20 from playtest
    // (「push CD a touch further」) and the deliberate balance change was reported
    // as a regression. What must hold at ANY factor: the shown cooldown is the base
    // times the live factor, and the WC3 original is annotated only when it differs.
    {
      const cd = LIVE.cooldown;
      expect(rescaleAbilityProse("60秒冷卻時間", LIVE)).toBe(
        cd === 1 ? "60秒冷卻時間" : `${Math.round(60 * cd)}秒冷卻時間（WC3原 60秒）`,
      );
    }
    // rounds to an integer: 35 × 0.25 = 8.75 → 9
    expect(rescaleAbilityProse("35秒冷卻時間", CD_QUARTER)).toBe("9秒冷卻時間（WC3原 35秒）");
  });

  it("handles the prefix (冷卻[時間]NN秒) shapes", () => {
    cover("hud-display-final");
    // 30 × 0.25 = 7.5 → 8
    expect(rescaleAbilityProse("冷卻時間30秒", CD_QUARTER)).toBe("冷卻時間8秒（WC3原 30秒）");
    expect(rescaleAbilityProse("冷卻30秒", CD_QUARTER)).toBe("冷卻8秒（WC3原 30秒）");
  });

  it("handles decimals and incidental whitespace (map prose carries a space)", () => {
    cover("hud-display-final");
    // 1.5 × 0.25 = 0.375 → 0
    expect(rescaleAbilityProse("1.5秒冷卻", CD_QUARTER)).toBe("0秒冷卻（WC3原 1.5秒）");
    // the real storm-arrow augment shape "0.5 秒冷卻" (space before 秒). Damage is
    // ×1.0 under CD_QUARTER, so the "40 法術傷害" number is left alone.
    expect(rescaleAbilityProse("造成 40 法術傷害（0.5 秒冷卻）。", CD_QUARTER)).toBe(
      "造成 40 法術傷害（0 秒冷卻（WC3原 0.5秒））。",
    );
  });

  it("handles the English shapes and never eats 'N seconds'", () => {
    cover("hud-display-final");
    // 3 × 0.25 = 0.75 → 1
    expect(rescaleAbilityProse("gain a shield (3s cooldown).", CD_QUARTER)).toBe(
      "gain a shield (1s cooldown（WC3原 3秒）).",
    );
    expect(rescaleAbilityProse("cooldown 3s", CD_QUARTER)).toBe("cooldown 1s（WC3原 3秒）");
    // "3 seconds" must NOT be read as "3 s" — the negative lookahead guards it
    expect(rescaleAbilityProse("cooldown 3 seconds", CD_QUARTER)).toBe("cooldown 3 seconds");
  });
});

describe("rescaleAbilityProse damage pass (hud-display-final)", () => {
  it("rewrites the damage literal by the damageDealt factor and annotates it", () => {
    cover("hud-display-final");
    // the reported case: 650 base, combat runs it at 325 (×0.5)
    expect(rescaleAbilityProse("造成650傷害", DMG_HALF)).toBe("造成325傷害（WC3原 650）");
    // The SHIPPED table is checked as an INVARIANT, not a frozen number. It used
    // to assert the same "325" literal because damageDealt happened to be 0.5 —
    // so the owner setting it back to 1.0 (「打太久了」) turned a deliberate
    // balance change into a red test, which is the shape this suite exists to
    // avoid. What must hold at ANY factor: the shown damage is the base times
    // the live factor, and the WC3 original is annotated only when it differs.
    {
      const f = LIVE.damageDealt;
      const shown = Math.round(650 * f);
      expect(rescaleAbilityProse("造成650傷害", LIVE)).toBe(
        f === 1 ? "造成650傷害" : `造成${shown}傷害（WC3原 650）`,
      );
    }
    // 造成 NNN 點傷害 (the 賈修 ultimate shape) — DMG_HALF is a fixed TEST factor,
    // so this literal is stable regardless of what the shipped table says.
    expect(rescaleAbilityProse("造成550點傷害", DMG_HALF)).toBe("造成275點傷害（WC3原 550）");
    // NNN[ ]點傷害 with no 造成 prefix
    expect(rescaleAbilityProse("200點傷害", DMG_HALF)).toBe("100點傷害（WC3原 200）");
    expect(rescaleAbilityProse("200 點傷害", DMG_HALF)).toBe("100 點傷害（WC3原 200）");
    // English "deal NNN damage" and bare "NNN damage" (case-insensitive)
    expect(rescaleAbilityProse("deal 650 damage", DMG_HALF)).toBe("deal 325 damage（WC3原 650）");
    expect(rescaleAbilityProse("650 damage", DMG_HALF)).toBe("325 damage（WC3原 650）");
  });

  it("leaves heal / shield / mana / duration and formula damage untouched", () => {
    cover("hud-display-final");
    // heal 生命 is ×1.0 — must stay byte-for-byte identical under damage ×0.5
    expect(rescaleAbilityProse("恢復650生命", DMG_HALF)).toBe("恢復650生命");
    // shield / mana / duration numbers are not damage — untouched
    expect(rescaleAbilityProse("獲得300護盾", DMG_HALF)).toBe("獲得300護盾");
    expect(rescaleAbilityProse("消耗80魔力", DMG_HALF)).toBe("消耗80魔力");
    expect(rescaleAbilityProse("暈眩1.5秒", DMG_HALF)).toBe("暈眩1.5秒");
    // formula damage (multiplier expression) has no bare number against 傷害 — skip
    expect(rescaleAbilityProse("受到力量*3額外傷害", DMG_HALF)).toBe("受到力量*3額外傷害");
    expect(rescaleAbilityProse("給予(40+敏捷*1)傷害", DMG_HALF)).toBe("給予(40+敏捷*1)傷害");
    // 損害 (a synonym) is intentionally out of the matched phrasing set
    expect(rescaleAbilityProse("給予200點損害", DMG_HALF)).toBe("給予200點損害");
  });

  it("is a no-op when damageDealt is 1.0 (prose damage already matches)", () => {
    cover("hud-display-final");
    // CD_QUARTER carries damageDealt 1.0 → the damage number is left as-is
    expect(rescaleAbilityProse("造成650傷害", CD_QUARTER)).toBe("造成650傷害");
    expect(rescaleAbilityProse("造成550點傷害", CD_QUARTER)).toBe("造成550點傷害");
    // and the fully-neutral table changes nothing at all
    expect(rescaleAbilityProse("造成650傷害", DEFAULT_COMBAT_ENV)).toBe("造成650傷害");
  });
});

describe("rescaleAbilityProse cooldown + damage together (hud-display-final)", () => {
  it("rewrites BOTH literals in one pass, each by its own factor", () => {
    cover("hud-display-final");
    // Disjoint keyword anchors: the cooldown number is never re-read as damage
    // or vice-versa. Both expectations are DERIVED from the live table, because
    // the owner tunes those factors and a literal here would make his balance
    // change look like a regression.
    const cd = LIVE.cooldown;
    const dmg = LIVE.damageDealt;
    const cdOut = cd === 1 ? "60秒冷卻時間" : `${Math.round(60 * cd)}秒冷卻時間（WC3原 60秒）`;
    const dmgOut = dmg === 1 ? "造成650傷害" : `造成${Math.round(650 * dmg)}傷害（WC3原 650）`;
    expect(rescaleAbilityProse("60秒冷卻時間\n造成650傷害", LIVE)).toBe(`${cdOut}\n${dmgOut}`);
  });

  it("is a no-op under a neutral table and idempotent under repeat calls", () => {
    cover("hud-display-final");
    // neutral factors → base already equals final; no rewrite / no noise
    expect(rescaleAbilityProse("60秒冷卻時間\n造成650傷害", DEFAULT_COMBAT_ENV)).toBe(
      "60秒冷卻時間\n造成650傷害",
    );
    // idempotent: a second pass never double-annotates either literal
    const once = rescaleAbilityProse("60秒冷卻時間\n造成650傷害", LIVE);
    expect(rescaleAbilityProse(once, LIVE)).toBe(once);
  });

  it("rewrites cooldown AND flat damage over ≥5 real ability descriptions", () => {
    cover("hud-display-final");
    // Re-derive the expectation from the live desc + the live factors (never a
    // hard-coded number), so the assertion tracks BOTH the shipped config and the
    // real text. Mirrors the helper for exactly the shapes these 5 descriptions
    // carry: one "NN秒冷卻時間" cooldown literal and "造成 NNN [點]傷害" flat damage.
    const cd = envFactor("cooldown", LIVE); // owner-tuned; never assert a literal
    const dmg = envFactor("damageDealt", LIVE); // owner-tuned; never assert a literal
    const expectedFor = (desc: string): string => {
      // A factor of exactly 1 is a NO-OP, not a rewrite-with-annotation: the
      // shown number already IS the WC3 original, so annotating it would be
      // noise. rescaleAbilityProse skips it, and so must this mirror.
      let e =
        cd === 1
          ? desc
          : desc.replace(
              // ⚠️ 「時間」兩個字是**選配**的 —— 實作 (`abilityText.ts:269`) 的
              //    pattern 就是 `秒\s*冷卻(?:時間)?`。2026-08-12 的 90 支重製把說明
              //    寫成「45秒冷卻」（沒有「時間」），這裡跟著放寬之前它會誤報成
              //    「這支沒有冷卻字面值」—— 而實際上 HUD 一直重寫得好好的。
              /(\d+)(秒冷卻(?:時間)?)/,
              (_m, n: string, suffix: string) =>
                `${Math.round(Number(n) * cd)}${suffix}（WC3原 ${n}秒）`,
            );
      if (dmg !== 1) {
        e = e.replace(
          /(造成\s*)(\d+)(\s*(?:點\s*)?傷害)/g,
          (_m, p: string, n: string, s: string) =>
            `${p}${Math.round(Number(n) * dmg)}${s}（WC3原 ${n}）`,
        );
      }
      return e;
    };

    let checked = 0;
    let damageRewrites = 0;
    for (const id of REAL_IDS) {
      const desc = docDescription(loadAbility(id));
      expect(desc, `${id} has a description`).toBeDefined();
      expect(desc!.match(/(\d+)秒冷卻(?:時間)?/), `${id} carries a NN秒冷卻[時間] literal`).not.toBeNull();

      const out = rescaleAbilityProse(desc!, LIVE);
      expect(out, `${id} rescales cooldown + flat damage to their finals`).toBe(expectedFor(desc!));
      // The annotation only EXISTS when something was actually rescaled. Every
      // one of these 5 carries a cooldown literal, so a non-neutral cooldown
      // guarantees one; a neutral cooldown with non-neutral damage guarantees one
      // only on the 3 that carry a flat 造成…傷害. With BOTH knobs at 1.0 the pass
      // is a legitimate no-op and demanding the caption would be asserting that
      // the owner may never neutralise his own multipliers.
      if (cd !== 1 || (dmg !== 1 && /造成\s*\d+\s*(?:點\s*)?傷害/.test(desc!))) {
        expect(out, `${id} annotates the WC3 original`).toContain("（WC3原 ");
      }
      // idempotent over the real text too
      expect(rescaleAbilityProse(out, LIVE), `${id} is idempotent`).toBe(out);
      if (/造成\s*\d+\s*(?:點\s*)?傷害/.test(desc!)) damageRewrites += 1;
      checked += 1;
    }
    expect(checked).toBeGreaterThanOrEqual(5);
    // uvng (650), hapm (350) and hblm (550) all carry a flat 造成…傷害 literal
    expect(damageRewrites).toBeGreaterThanOrEqual(3);
  });

  it("leaves the 損害 / formula damage in real descriptions untouched", () => {
    cover("hud-display-final");
    // godie-h001.w uses 損害 (synonym, out of scope) and godie-e00k.e uses formula
    // damage — both must survive verbatim even as their cooldown is rescaled.
    const h001 = rescaleAbilityProse(docDescription(loadAbility("godie-h001.w"))!, LIVE);
    expect(h001).toContain("200點損害");
    const e00k = rescaleAbilityProse(docDescription(loadAbility("godie-e00k.e"))!, LIVE);
    expect(e00k).toContain("(40+敏捷*1)傷害");
    expect(e00k).toContain("力量*0.5傷害");
    // hblm's flat 550 is rescaled, but its formula 額外傷害 term is preserved
    const hblm = rescaleAbilityProse(docDescription(loadAbility("godie-hblm.r"))!, LIVE);
    {
      const d = LIVE.damageDealt;
      expect(hblm).toContain(
        d === 1 ? "造成550點傷害" : `造成${Math.round(550 * d)}點傷害（WC3原 550）`,
      );
    }
    expect(hblm).toContain("力量*3額外傷害");
  });

  it("exposes a dim WC3 caption for the residual-literal disclaimer", () => {
    cover("hud-display-final");
    expect(WC3_PROSE_CAPTION).toContain("WC3");
    expect(WC3_PROSE_CAPTION.length).toBeGreaterThan(0);
  });
});

describe("displayFinal HP final + damage factor (hud-display-final)", () => {
  it("champion maxHealth shows the ×8 battle value — 460 → 3680", () => {
    cover("hud-display-final");
    // the user named HP: base 460 shown at its post-multiplier final
    const hp = Math.round(460 * LIVE.maxHealth);
    expect(displayFinal(460, "health", LIVE)).toBe(hp);
    // the champ stat-doc key resolves to the maxHealth factor (NOT ability range)
    expect(statDisplayFactor("maxHealth")).toBe("maxHealth");
    expect(displayFinal(460, statDisplayFactor("maxHealth"), LIVE)).toBe(hp);
  });

  it("the shipped live table's factors flow through to what the HUD shows", () => {
    cover("hud-display-final");
    // NOT the values — the WIRING. This block used to freeze three balance knobs
    // the owner tunes from playtest (damageDealt, cooldown, maxHealth). He set
    // damage back to 1.0 (「打太久了」) and later pushed cooldown 0.25→0.20, and each
    // time a balance decision surfaced as a red test — which is precisely backwards.
    // What is worth pinning is that each knob is present, sane, and reaches
    // displayFinal through the right alias; the numbers themselves are his.
    for (const k of ["damageDealt", "cooldown", "maxHealth"] as const) {
      const v = LIVE_CONFIG.multipliers[k];
      expect(typeof v, `${k} must exist in the shipped table`).toBe("number");
      expect(v, `${k} must be a positive finite multiplier`).toBeGreaterThan(0);
    }
    // "damage" is an ALIAS of damageDealt — that mapping is the real contract,
    // and it must hold whatever the factor happens to be.
    expect(envFactor("damage", LIVE)).toBe(LIVE.damageDealt);
    expect(displayFinal(650, "damage", LIVE)).toBe(Math.round(650 * LIVE.damageDealt));
    // champ ATTACK range must NOT ride the ABILITY-range alias. The mechanism is
    // WHICH KEY it resolves to — that string comparison is the whole guard and it
    // is never vacuous. ⛔ This block used to end `.toBe(6)`, which was only true
    // while the shipped `attackRange` happened to be 1.0; owner tuned it to 0.6 on
    // 2026-08-10 and a balance decision surfaced as a red test — exactly backwards
    // (CLAUDE.md 第二守則:守衛驗機制,出貨數值不進斷言).
    expect(statDisplayFactor("range")).toBe("attackRange");
    expect(envFactor(statDisplayFactor("range"), LIVE)).toBe(LIVE.attackRange);
    expect(displayFinal(6, statDisplayFactor("range"), LIVE)).toBeCloseTo(6 * LIVE.attackRange, 9);
  });
});

describe("real ability descriptions carry no role markup (hud-desc-role-colour)", () => {
  it("parseRoleMarkup(docDescription(real)) is a single plain segment", () => {
    cover("hud-desc-role-colour");
    // pins the no-markup fact: a role-rescale would be a no-op, so none is added.
    for (const id of REAL_IDS) {
      const desc = docDescription(loadAbility(id));
      expect(desc, `${id} has a description`).toBeDefined();
      expect(parseRoleMarkup(desc!).length, `${id} has no [c=role] markup`).toBe(1);
    }
  });
});
