/**
 * hud-draft-card-style: the pure tier→accent / tier-label / confirm-sfx mapping
 * behind the 3-choose-1 draft cards. Node-testable (no React/store import).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Items } from "@ggd/shared/sim/content/registry";
import type { ItemId } from "@ggd/shared/ids";
import type { ItemDef } from "@ggd/shared/sim/content/defs";
import { GOLD } from "../theme";
import {
  DRAFT_CONFIRM_SFX,
  DRAFT_TIER_COLOR,
  tierColor,
  tierLabel,
  weaponEffectDescription,
} from "./draftCardStyle";

describe("draftCardStyle (hud-draft-card-style)", () => {
  it("maps every known tier to its own accent colour", () => {
    cover("hud-draft-card-style");
    // the four tiers the schedule can hand the panel each read apart
    const tiers = ["silver", "gold", "prismatic", "weapon"];
    const colours = tiers.map(tierColor);
    expect(new Set(colours).size).toBe(tiers.length);
    for (const t of tiers) expect(tierColor(t)).toBe(DRAFT_TIER_COLOR[t]);
  });

  it("falls back to GOLD for an unknown tier (never undefined)", () => {
    cover("hud-draft-card-style");
    expect(tierColor("mythic")).toBe(GOLD);
    expect(tierColor("")).toBe(GOLD);
  });

  it("labels the weapon tier bespoke and augment tiers generically", () => {
    cover("hud-draft-card-style");
    expect(tierLabel("weapon")).toBe("傳說武器 · WEAPON");
    expect(tierLabel("gold")).toBe("GOLD AUGMENT");
    expect(tierLabel("prismatic")).toBe("PRISMATIC AUGMENT");
  });

  it("pins the confirm sfx key to the audio-map entry", () => {
    cover("hud-draft-card-style");
    // must match the key authored in content/config/audio-map.json
    expect(DRAFT_CONFIRM_SFX).toBe("draftConfirm");
  });
});

// The card must never be a blind pick: a WEAPON choice states what it DOES —
// the proc/effect line AND its stat bonuses — pulled from the same item content
// the shop shelf reads, not just a cost. (PLAYTEST: cards showed a bare glyph.)
const WEAPON_EFFECT = "godie-draft-card-weapon" as ItemId;
const WEAPON_PLAIN = "godie-draft-card-plain" as ItemId;

beforeAll(() => {
  Items.register(WEAPON_EFFECT, {
    id: WEAPON_EFFECT,
    name: "武聖手鐲",
    cost: 300,
    tier: 1,
    // runtime item docs carry `description` (ItemDef type omits it — cast below)
    description: "效能\n17.1%機率造成2.036倍傷害\n\n解說\n月之海的傳說手鐲。",
    modifiers: [
      { stat: "critChance", op: "flat", value: 0.171 },
      { stat: "critDamage", op: "flat", value: 0.286 },
    ],
    tags: [],
  } as unknown as ItemDef);
  // a weapon with neither an effect line nor a stat modifier → no rich text
  Items.register(WEAPON_PLAIN, {
    id: WEAPON_PLAIN,
    name: "空盒",
    cost: 300,
    tier: 1,
    tags: [],
  } as ItemDef);
});

describe("weaponEffectDescription (hud-draft-card-style)", () => {
  it("shows the AUTHORED description verbatim — 效能 AND 解說, not a re-derived chip list", () => {
    cover("hud-draft-card-style");
    const desc = weaponEffectDescription(WEAPON_EFFECT);
    expect(desc).not.toBeNull();
    // owner 2026-08-01 「卡片應該要顯示全部敘述阿」. The authored prose is the
    // spec: the 效能 block carries mechanics the modifier vocabulary cannot yet
    // express (斬殺 / 格擋 / 套裝 / 反彈…), and a card rebuilt from `modifiers`
    // drops every one of them silently — 死之王的意志 rendered an EMPTY card
    // because its whole kit lives in prose. Both halves are asserted because
    // 解說 is the half a "just show the numbers" refactor would drop first.
    expect(desc).toBe("效能\n17.1%機率造成2.036倍傷害\n\n解說\n月之海的傳說手鐲。");
  });

  it("falls back to the derived effect + stat chips only when the doc has NO prose", () => {
    cover("hud-draft-card-style");
    // Same modifiers as WEAPON_EFFECT, no `description` — the fallback path is
    // still worth keeping (it beats resolveChoice's bare 「300 g」), but it must
    // never PRE-EMPT authored prose, which is what the assertion above pins.
    const id = "weapon-noprose" as ItemId;
    Items.register(id, {
      id,
      name: "無文案手鐲",
      cost: 300,
      tier: 1,
      modifiers: [
        { stat: "critChance", op: "flat", value: 0.171 },
        { stat: "critDamage", op: "flat", value: 0.286 },
      ],
      tags: [],
    } as unknown as ItemDef);
    const desc = weaponEffectDescription(id);
    expect(desc).toContain("爆擊率 +17.1%");
    expect(desc).toContain("爆擊傷害 +28.6%");
  });

  it("returns null for a bare weapon and for a non-item id (caller keeps its fallback)", () => {
    cover("hud-draft-card-style");
    expect(weaponEffectDescription(WEAPON_PLAIN)).toBeNull();
    expect(weaponEffectDescription("draft-aug")).toBeNull();
    expect(weaponEffectDescription("no-such-choice")).toBeNull();
  });
});
