/**
 * THE SHADOWING TEST.
 *
 * Every Q/W/E/R ability is stored TWICE — standalone at
 * `content/abilities/<id>.json` and denormalised into its champion under
 * `abilities[<slot>]`. `registerAll` registers the standalone docs first and
 * then the champions, and `registerChampion` used to unconditionally
 * re-register the embedded copies OVER them. Result: editing the standalone
 * doc — the natural thing to do, and exactly what task #79's VFX re-point did
 * — changed nothing in a real match while the whole suite stayed green.
 *
 * These tests run the REAL registration path on a hand-built store so they
 * fail loudly if the precedence ever flips back. They are deliberately about
 * PRECEDENCE, not about any one field, because the shadow has bitten five
 * different fields so far (roundWins, the champion taunt, the VFX re-point,
 * ENTITY_FLAG.CASTING, StatusAuraFx) and castTimeSec is next in line.
 *
 * The end-to-end proof against the 554 real docs is not a unit test — it is
 * `scripts/probeAbilityRegistry.ts`, which boots the content tree the way the
 * game-server does and reads the registry back.
 *
 * ⚠️⚠️ **這一支點名的 content/ 檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/abilities/<id>.json`
 *   · `content/abilities/<id>.json` 是 **skillremake:json · content:build · tiers:apply · apconv:build** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh <那一支>`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     content/abilities/ 這 422 份**整個目錄都是產物**,⛔ 但擁有者逐支不同:91 份由 batch1.py 從
 *     tools/skill-remake/heroes/*.py **整份重建**;其餘由 tiers:apply(只重算五級距那幾格)與
 *     apconv:build(只重算 description + ratios/attrRatios,來源 claims.json)**就地改寫**,
 *     content:build 最後打包進 bundle.json。⇒ 逐支用 genguard 查,⛔ 不要照目錄一概而論。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Abilities, Champions, registerChampion } from "../sim/content/registry";
import type { AbilityDef, ChampionDef } from "../sim/content/defs";
import type { AbilityId, ChampionId } from "../ids";
import { ContentStore } from "./store";
import { registerAll, auditAbilityMirrorDrift } from "./registries";

const ABILITY_ID = "shadow-hero.q" as AbilityId;

function ability(over: Partial<AbilityDef> = {}): AbilityDef {
  return {
    id: ABILITY_ID,
    name: "Q",
    slot: "Q",
    castType: "self",
    maxRank: 1,
    cooldown: [10],
    manaCost: [0],
    range: 0,
    effects: [],
    ...over,
  } as AbilityDef;
}

function champion(q: AbilityDef): ChampionDef {
  const filler = (slot: "W" | "E" | "R"): AbilityDef =>
    ability({ id: `shadow-hero.${slot.toLowerCase()}` as AbilityId, slot, name: slot });
  return {
    id: "shadow-hero" as ChampionId,
    name: "Shadow Hero",
    role: "mage",
    base: { hp: 600, mana: 300, ad: 50, ap: 0, armor: 20, mr: 20, ms: 3.4, attackSpeed: 0.7, attackRange: 2 },
    growth: { hp: 90, mana: 40, ad: 3, ap: 0, armor: 3, mr: 2 },
    abilities: { Q: q, W: filler("W"), E: filler("E"), R: filler("R") },
  } as unknown as ChampionDef;
}

beforeEach(() => {
  Abilities.clear();
  Champions.clear();
});

describe("standalone ability docs are authoritative", () => {
  it("a field set ONLY in the standalone doc survives champion registration", () => {
    // the standalone doc says 0.9s and points at an ice effect…
    Abilities.register(ABILITY_ID, ability({ castTimeSec: 0.9, vfxKey: "fx.prim.ice.nova" }));
    // …while the champion still embeds the stale pre-#79 copy
    registerChampion(champion(ability({ vfxKey: "fx.ember-bolt-cast" })));

    const got = Abilities.get(ABILITY_ID);
    expect(got.vfxKey).toBe("fx.prim.ice.nova");
    expect(got.castTimeSec).toBe(0.9);
  });

  it("the embedded copy still FILLS a field the standalone doc omits", () => {
    // sela.r / thorne.r are exactly this: their standalone JSON predates
    // castTimeSec, so dropping the embedded copy wholesale would silently
    // delete two of the only ten cast times in the game.
    Abilities.register(ABILITY_ID, ability({ vfxKey: "fx.prim.ice.nova" }));
    registerChampion(champion(ability({ vfxKey: "fx.ember-bolt-cast", castTimeSec: 0.5 })));

    const got = Abilities.get(ABILITY_ID);
    expect(got.vfxKey).toBe("fx.prim.ice.nova"); // standalone still wins where it speaks
    expect(got.castTimeSec).toBe(0.5); // …and the gap is filled
  });

  it("registers the embedded copy whole when NO standalone doc exists", () => {
    // the TS-literal skeleton path: the champion object is the only definition.
    registerChampion(champion(ability({ vfxKey: "fx.ember-bolt-cast", castTimeSec: 0.4 })));
    expect(Abilities.get(ABILITY_ID).vfxKey).toBe("fx.ember-bolt-cast");
    expect(Abilities.get(ABILITY_ID).castTimeSec).toBe(0.4);
  });

  it("resolves the champion's OWN abilities[slot] too, not just the registry", () => {
    // client HUD/tooltips/icons and the bot brain read
    // `Champions.get(id).abilities[slot]` directly. If only the Abilities
    // registry were fixed the shadow would just move house.
    Abilities.register(ABILITY_ID, ability({ vfxKey: "fx.prim.ice.nova" }));
    registerChampion(champion(ability({ vfxKey: "fx.ember-bolt-cast" })));
    expect(Champions.get("shadow-hero" as ChampionId).abilities.Q.vfxKey).toBe("fx.prim.ice.nova");
  });
});

describe("the champion-override intent survives", () => {
  it("overrideAbilities:true still lets the embedded copy replace a registered doc", () => {
    // apps/editor PreviewController: the doc under edit IS the newest truth.
    Abilities.register(ABILITY_ID, ability({ vfxKey: "fx.prim.ice.nova", castTimeSec: 0.9 }));
    registerChampion(champion(ability({ vfxKey: "fx.ember-bolt-cast" })), {
      overrideAbilities: true,
    });

    const got = Abilities.get(ABILITY_ID);
    expect(got.vfxKey).toBe("fx.ember-bolt-cast");
    expect(got.castTimeSec).toBeUndefined(); // a wholesale replace, not a merge
  });
});

function driftedStore(): ContentStore {
  const store = new ContentStore();
  store.add("abilities", ABILITY_ID, ability({ vfxKey: "fx.prim.ice.nova" }));
  const champ = champion(ability({ vfxKey: "fx.ember-bolt-cast" }));
  store.add("champions", champ.id, champ);
  return store;
}

describe("registerAll ordering", () => {
  it("standalone docs beat the champion's embedded copies through the real registerAll", () => {
    registerAll(driftedStore());
    expect(Abilities.get(ABILITY_ID).vfxKey).toBe("fx.prim.ice.nova");
  });

  it("auditAbilityMirrorDrift names the disagreeing field", () => {
    const drift = auditAbilityMirrorDrift(driftedStore());
    expect(drift).toEqual([
      {
        championId: "shadow-hero",
        slot: "Q",
        abilityId: ABILITY_ID,
        field: "vfxKey",
        standalone: "fx.prim.ice.nova",
        embedded: "fx.ember-bolt-cast",
      },
    ]);
  });
});
