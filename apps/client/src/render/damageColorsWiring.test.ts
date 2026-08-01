/**
 * damage-colors-wiring — 「the palette reaches the thing that draws」.
 *
 * CLAUDE.md 失敗形態 ① (算出來但畫在畫面外) and ③ (可以從渲染樹刪掉但測試還是全綠)
 * are the two this file exists for. `damagePalette.test.ts` measures the hues;
 * measuring hues is a property test of a pure function (形態 ⑦) and would stay
 * green with `combatTextStyle` and `flashColorFor` both reverted to
 * `=== "magic"`. So every assertion here reads the object a RENDERER consumes:
 *
 *   · the victim flash — the `[r,g,b]` triple `ChampionView.flash()` is actually
 *     CALLED with, driven through a real `EntityViewRegistry` on Babylon's
 *     NullEngine from a wire-shaped `hitImpact` event. Delete the `victimFlash`
 *     dispatch in EntityViewRegistry and this goes red because the spy never
 *     fires; revert `flashColorFor` to two-way and it goes red because true and
 *     physical arrive equal.
 *   · the floating number — the CSS STRING `WorldAnchorLayer` stamps onto the
 *     pooled node (`node.style.cssText = combatTextCss(st, gradient)`), not the
 *     style object it was built from.
 *   · the CACHE KEY that decides whether a pooled node is restyled at all — the
 *     one thing that can make a correct palette invisible on screen.
 *
 * ⚠️ The last one is not hypothetical: the pre-existing key appended a single
 * `"m"` for magic, so 物理 and 真實 hashed to the SAME slot. Even with a perfect
 * four-way palette, a pooled node that had drawn a physical number would keep
 * its red fill for a true one — 失敗形態 ② wearing a green test suite.
 */
import { afterEach, beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { cover } from "@ggd/shared/testkit/cover";
import { DEFAULT_DAMAGE_COLORS } from "@ggd/shared/content";
import { EntityViewRegistry, type EntityViewState } from "./EntityViewRegistry";
import { ChampionView } from "./views/ChampionView";
import { AssetManager } from "./AssetManager";
import { applyDamageColorsDoc, hexToRgb01 } from "./damagePalette";
import {
  COMBAT_TEXT_WORDS,
  DAMAGE_CATEGORIES,
  NUMBERED_DAMAGE_CATEGORIES,
  combatTextCss,
  combatTextStyle,
  combatTextStyleKey,
  type CombatTextCategory,
  type CombatTextMods,
} from "../ui/combatText";

const TAG = "damage-colors-wiring";
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

let engine: NullEngine;
let scene: Scene;
beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});
afterEach(() => {
  applyDamageColorsDoc(null);
  vi.restoreAllMocks();
});

const champ = (id: number): EntityViewState => ({
  id,
  kind: 0,
  seatId: 0,
  key: "champ.sela",
  teamId: 1,
  x: 0,
  z: 0,
  fx: 1,
  fz: 0,
  alive: true,
});
const passthrough = (e: EntityViewState): { x: number; z: number; fx: number; fz: number } => ({
  x: e.x,
  z: e.z,
  fx: e.fx,
  fz: e.fz,
});

/** A wire-shaped profiled `hitImpact`, exactly the payload the sim emits. */
const hitImpact = (dmgType: string): { type: string; data: Record<string, unknown> } => ({
  type: "hitImpact",
  data: {
    source: 1,
    target: 2,
    dmgType,
    profile: {
      tier: "medium",
      hitstopTicks: 3,
      hitstunTicks: 3,
      knockbackDir: { x: 1, z: 0 },
      knockbackMag: 0.2,
      isEX: false,
      isBlock: false,
      shakeMag: 0.6,
      shakeStyle: "directional",
      sparkKind: "hit",
      camKick: 0.3,
      exFreeze: 0,
    },
  },
});

/**
 * Drive ONE hit through the real registry and return the rgb the VICTIM's view
 * was flashed with. The victim is entity 2; entity 1 is the attacker, whose
 * flash is the white "I connected" pop and is filtered out by id.
 */
function victimFlashRgbFor(dmgType: string): [number, number, number] {
  const registry = new EntityViewRegistry(scene, new AssetManager(scene));
  registry.sync({
    entities: [champ(1), champ(2)],
    poseFor: passthrough,
    nowMs: 0,
    dtMs: 16,
    loadModels: false,
  });
  const victim = registry.getChampionView(2)!;
  const spy = vi.spyOn(victim, "flash");
  registry.handleEvent(hitImpact(dmgType) as never, 100);
  expect(spy, `no flash reached the victim view for ${dmgType}`).toHaveBeenCalled();
  const rgb = spy.mock.calls[0]![0] as [number, number, number];
  spy.mockRestore();
  registry.dispose();
  return rgb;
}

describe("受擊閃光: the colour the VIEW is actually flashed with (damage-colors-wiring)", () => {
  it("a TRUE hit and a PHYSICAL hit flash the victim's model differently", () => {
    cover(TAG);
    const phys = victimFlashRgbFor("physical");
    const trueDmg = victimFlashRgbFor("true");
    const magic = victimFlashRgbFor("magic");
    // owner's whole complaint, as a wire-to-view assertion
    expect(trueDmg).not.toEqual(phys);
    expect(magic).not.toEqual(phys);
    expect(trueDmg).not.toEqual(magic);
  });

  it("each is the palette's value for that school — not some other red", () => {
    cover(TAG);
    expect(victimFlashRgbFor("physical")).toEqual(hexToRgb01(DEFAULT_DAMAGE_COLORS.flash.physical));
    expect(victimFlashRgbFor("magic")).toEqual(hexToRgb01(DEFAULT_DAMAGE_COLORS.flash.magic));
    expect(victimFlashRgbFor("true")).toEqual(hexToRgb01(DEFAULT_DAMAGE_COLORS.flash.true));
  });

  it("an operator's saved colour reaches the model, not just the palette module", () => {
    cover(TAG);
    applyDamageColorsDoc({
      ...DEFAULT_DAMAGE_COLORS,
      flash: { ...DEFAULT_DAMAGE_COLORS.flash, true: "#00FF80" },
    });
    expect(victimFlashRgbFor("true")).toEqual(hexToRgb01("#00FF80"));
  });

  it("ChampionView.flash is the ONLY thing that paints it — the spy is not a stand-in", () => {
    cover(TAG);
    // Guards the guard: if `flash` were renamed/removed the spy above would
    // throw rather than silently observe nothing, but a NO-OP flash would still
    // "pass". Assert the view keeps a real method with the 4-arg contract the
    // plan dispatches (rgb, nowMs, ms, alpha).
    expect(typeof ChampionView.prototype.flash).toBe("function");
    expect(ChampionView.prototype.flash.length).toBeGreaterThanOrEqual(2);
  });
});

describe("飄字: the CSS the pooled node is actually stamped with (damage-colors-wiring)", () => {
  const mods = (dmgType: CombatTextMods["dmgType"]): CombatTextMods => ({
    crit: false,
    killingBlow: false,
    dmgType,
  });
  /** Exactly what `WorldAnchorLayer` writes: `node.style.cssText = ...`. */
  const cssFor = (cat: CombatTextCategory, dmgType: CombatTextMods["dmgType"]): string =>
    combatTextCss(combatTextStyle(cat, mods(dmgType)), false);

  it("a TRUE damage number is stamped with a different fill than a PHYSICAL one", () => {
    cover(TAG);
    for (const cat of ["dealt", "taken", "allyTaken", "other"] as CombatTextCategory[]) {
      const phys = cssFor(cat, "physical");
      const trueDmg = cssFor(cat, "true");
      const magic = cssFor(cat, "magic");
      expect(trueDmg, `${cat}: true and physical stamp identical CSS`).not.toBe(phys);
      expect(magic, `${cat}: magic and physical stamp identical CSS`).not.toBe(phys);
      expect(trueDmg, `${cat}: true and magic stamp identical CSS`).not.toBe(magic);
      // and the fill is the palette's, present in the string the browser parses
      expect(phys.toLowerCase()).toContain(
        `color:${DEFAULT_DAMAGE_COLORS.text.physical.toLowerCase()};`,
      );
      expect(trueDmg.toLowerCase()).toContain(
        `color:${DEFAULT_DAMAGE_COLORS.text.true.toLowerCase()};`,
      );
      expect(magic.toLowerCase()).toContain(
        `color:${DEFAULT_DAMAGE_COLORS.text.magic.toLowerCase()};`,
      );
    }
  });

  it("治療 reads the PALETTE's green on BOTH axes, not the table's copy of it", () => {
    cover(TAG);
    // ⚠️ Asserting the shipped `#00FF00` here would be a test that passes even
    // if `fillFor` ignored the palette entirely, because `BASE.heal.color` is
    // ALSO `#00FF00`. So the assertion is made against a colour only the palette
    // can supply — otherwise this is 失敗形態 ④ (an assertion that passes on the
    // broken implementation too).
    for (const axis of ["damageType", "relation"] as const) {
      applyDamageColorsDoc({
        ...DEFAULT_DAMAGE_COLORS,
        textAxis: axis,
        text: { ...DEFAULT_DAMAGE_COLORS.text, heal: "#0BDA51" },
      });
      for (const cat of ["heal", "allyHeal"] as CombatTextCategory[]) {
        expect(cssFor(cat, undefined), `${cat} @ ${axis}`).toContain("color:#0BDA51;");
      }
    }
    // and the shipped default really is owner's 綠
    applyDamageColorsDoc(null);
    expect(cssFor("heal", undefined).toLowerCase()).toContain(
      `color:${DEFAULT_DAMAGE_COLORS.text.heal.toLowerCase()};`,
    );
  });

  it("#164 is not regressed: no stamped fill is ever transparent, on any school", () => {
    cover(TAG);
    for (const cat of ["dealt", "taken", "heal", "other"] as CombatTextCategory[]) {
      for (const t of ["physical", "magic", "true", undefined] as CombatTextMods["dmgType"][]) {
        for (const gradient of [true, false]) {
          const css = combatTextCss(combatTextStyle(cat, mods(t)), gradient);
          expect(css).not.toMatch(/text-fill-color\s*:\s*transparent/i);
          expect(css).toMatch(/color:#[0-9A-Fa-f]{6};/);
        }
      }
    }
  });

  it("an operator's saved colour reaches the stamped CSS", () => {
    cover(TAG);
    applyDamageColorsDoc({
      ...DEFAULT_DAMAGE_COLORS,
      text: { ...DEFAULT_DAMAGE_COLORS.text, true: "#0A0B0C" },
    });
    expect(cssFor("dealt", "true")).toContain("color:#0A0B0C;");
  });

  it("`relation` really is the pre-ruling look — the alternative is not a dead option", () => {
    cover(TAG);
    const typedTrue = cssFor("dealt", "true");
    const typedPhys = cssFor("dealt", "physical");
    applyDamageColorsDoc({ ...DEFAULT_DAMAGE_COLORS, textAxis: "relation" });
    const relTrue = cssFor("dealt", "true");
    const relPhys = cssFor("dealt", "physical");
    // the defect owner reported, reproduced on demand: on `relation`, 真實 and
    // 物理 are byte-identical CSS…
    expect(relTrue).toBe(relPhys);
    // …and on the shipped axis they are not. Both halves must hold, or the
    // dropdown is decorative.
    expect(typedTrue).not.toBe(typedPhys);
  });
});

describe("pooled-node cache key (damage-colors-wiring)", () => {
  const m = (dmgType: CombatTextMods["dmgType"]): CombatTextMods => ({
    crit: false,
    killingBlow: false,
    dmgType,
  });

  it("fragments on the SCHOOL, not on 「is it magic」", () => {
    cover(TAG);
    for (const cat of ["dealt", "taken", "allyTaken", "other"] as CombatTextCategory[]) {
      const keys = new Set([
        combatTextStyleKey(cat, m("physical")),
        combatTextStyleKey(cat, m("magic")),
        combatTextStyleKey(cat, m("true")),
      ]);
      expect(keys.size, `${cat}: schools share a pooled-style slot`).toBe(3);
    }
  });

  it("does NOT fragment the heal/mana/word pools — they have no school", () => {
    cover(TAG);
    for (const cat of ["heal", "mana", "dodge", "guard", "whiff"] as CombatTextCategory[]) {
      expect(combatTextStyleKey(cat, m("true"))).toBe(combatTextStyleKey(cat, m("physical")));
    }
  });

  it("the key and the fill agree: same key ⇒ same CSS, different CSS ⇒ different key", () => {
    cover(TAG);
    // The real invariant. A key coarser than the fill leaves stale colours on
    // screen; a key finer than the fill only costs restyles. Only the first is
    // a bug, so this asserts the first direction over every combination.
    const seen = new Map<string, string>();
    const cats: CombatTextCategory[] = [
      "taken",
      "dealt",
      "allyTaken",
      "other",
      "guard",
      "heal",
      "allyHeal",
      "mana",
      "dodge",
      "whiff",
    ];
    for (const axis of ["damageType", "relation"] as const) {
      applyDamageColorsDoc({ ...DEFAULT_DAMAGE_COLORS, textAxis: axis });
      for (const cat of cats) {
        for (const t of ["physical", "magic", "true", undefined] as CombatTextMods["dmgType"][]) {
          for (const crit of [false, true]) {
            const mods = { crit, killingBlow: false, dmgType: t };
            const key = combatTextStyleKey(cat, mods);
            const css = combatTextCss(combatTextStyle(cat, mods), false);
            const prev = seen.get(key);
            if (prev !== undefined) {
              expect(css, `key "${key}" maps to two different stamped styles`).toBe(prev);
            } else {
              seen.set(key, css);
            }
          }
        }
      }
    }
  });
});

describe("invariants the palette rests on (damage-colors-wiring)", () => {
  it("NUMBERED_DAMAGE_CATEGORIES really is 「damage categories that draw a number」", () => {
    cover(TAG);
    // The set is written out in combatText.ts because deriving it at module
    // scope would be a TDZ crash (WORD is declared later). Derive it HERE and
    // compare, so the hand-written copy cannot drift: a category that gains a
    // WORD, or a sixth damage category, breaks this.
    // ⚠️ Derive from the SHIPPED `DAMAGE_CATEGORIES`, never a copy typed here.
    // Until 2026-08-01 this line was a hand-written `["taken","dealt",…]`, so a
    // sixth damage category needed editing in three places and forgetting this
    // one drifted silently — while combatText.ts's docblock claimed the opposite.
    const derived = [...DAMAGE_CATEGORIES].filter((c) => COMBAT_TEXT_WORDS[c] === undefined).sort();
    expect([...NUMBERED_DAMAGE_CATEGORIES].sort()).toEqual(derived);
    // and the one that is excluded is excluded for the stated reason
    expect(COMBAT_TEXT_WORDS.guard).toBe("GUARD");
    expect(NUMBERED_DAMAGE_CATEGORIES.has("guard")).toBe(false);
  });

  /**
   * SOURCE-LEVEL, and honest about it: this proves the seam was WIRED, not that
   * it runs — same claim shape as `configPagesRegistered.test.ts`. Only a real
   * `ContentDb.load()` (network + registries) could prove the latter, and the
   * behavioural half is already covered above: the operator-doc tests show that
   * once `applyDamageColorsDoc` is called, the value reaches both renderers.
   * What this catches is the actual historical failure — a config doc nobody
   * ever pushes into the render layer (失敗形態 ②).
   */
  it("ContentDb pushes the doc into the render layer", () => {
    cover(TAG);
    const src = readFileSync(`${REPO}apps/client/src/content/ContentDb.ts`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(src).toContain("applyDamageColorsDoc");
    expect(src).toContain("config.damage-colors@1");
  });
});
