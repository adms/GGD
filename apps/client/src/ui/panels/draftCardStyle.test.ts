/**
 * hud-draft-card-style: the pure tier→accent / tier-label / confirm-sfx mapping
 * behind the 3-choose-1 draft cards. Node-testable (no React/store import).
 */
import { FATE_RANK_LABEL, GRAIL_MANIFEST, PLAIN_DRAFT_SUFFIX, draftSuffixFor } from "./fateLexicon";
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

  it("⭐ 三個增益階級走 Fate Rank，⛔ 而傳說武器不是願望所以不改", () => {
    cover("hud-draft-card-style");
    // owner 2026-08-16（`docs/聖杯願望三選一-設計規則.md` §3）：
    // 後台 silver/gold/prismatic 保留，玩家端顯示 C/A/EX。
    // ⛔ 斷言從詞彙表推導，⛔ 不抄字面值 —— 抄了就是第二個住處。
    for (const [tier, label] of Object.entries(FATE_RANK_LABEL)) {
      expect(`${tier}=${tierLabel(tier)}`).toBe(`${tier}=${label}`);
    }
    // ⚠️ 規則 §1 把傳說武器與屬性強化劃給「裝備」那一層 —— 它們不是願望，
    //    ⛔ 所以不能一起被 Fate 化（那會讓玩家以為它們也在改規則）。
    expect(tierLabel("weapon")).toBe("傳說武器 · WEAPON");
    // 未知階級仍然難看得很明顯 —— ⛔ 不要被塞進「C級願望」假裝有人設計過它。
    expect(tierLabel("mythic")).toBe("MYTHIC AUGMENT");
  });

  it("🔴 標頭後綴跟著階級走 —— 武器卡⛔不可以掛「聖杯顯現」", () => {
    cover("hud-draft-card-style");
    // 這一條釘的是一個**我真的做出來過**的缺陷：第一版把後綴換成一個全域常數，
    // 於是傳說武器卡變成「傳說武器 · WEAPON · 聖杯顯現」——
    // ⛔ 兩個字串都合法、畫面也很正常，型別與既有測試都不會紅。
    for (const tier of Object.keys(FATE_RANK_LABEL)) {
      expect(`${tier}=${draftSuffixFor(tier)}`).toBe(`${tier}=${GRAIL_MANIFEST}`);
    }
    for (const tier of ["weapon", "mythic"]) {
      expect(`${tier}=${draftSuffixFor(tier)}`).toBe(`${tier}=${PLAIN_DRAFT_SUFFIX}`);
    }
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
