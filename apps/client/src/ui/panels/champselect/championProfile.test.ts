/**
 * The champ-select profile selectors (task #76): the phase read as a stage
 * (briefing → picking → confirmed + the timeout warning), which champion the
 * profile focuses, the skillRows seat, and pulling 玩法 / 故事 sub-sections out
 * of the map's one free-text `description` field.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import { skillRows } from "../skillDetails";
import {
  profileSubjectId,
  champSelectStage,
  champSelectSkillSeat,
  champSelectProfileLayout,
  parseDescriptionSections,
  AUTO_PICK_WARN_SEC,
} from "./championProfile";

beforeAll(() => registerSkeletonContent());

// the real godie-e00k (安云) description — a representative w3x free-text field.
const DESC = `故事：
少女殺手安云，是身手敏捷、拔刀神速，號稱百人斬的殺手刺客。在完成使命恢復自由之身後，決心投入愛與和平洗刷罪孽。
(出自:安云)

推薦玩家 : PK殺人
上手度 : 中

角色成長：
力量 + 1.65
敏捷 + 2.80

可學習的技能：
斷末、迴切、瞬切百殺、幻影暗殺`;

describe("profile subject", () => {
  it("hover previews, else the confirmed pick, else nothing", () => {
    cover("client-profile-subject");
    expect(profileSubjectId("hovered-id", "picked-id")).toBe("hovered-id");
    expect(profileSubjectId(null, "picked-id")).toBe("picked-id");
    expect(profileSubjectId("", "")).toBeNull();
    expect(profileSubjectId(null, null)).toBeNull();
  });
});

describe("champ-select stage — briefing → picking → confirmed → timeout", () => {
  it("briefing while the overlay is up", () => {
    cover("client-profile-stage");
    const v = champSelectStage({ briefingActive: true, localPick: "", secondsLeft: 58 });
    expect(v.stage).toBe("briefing");
    expect(v.confirmed).toBe(false);
  });

  it("picking once the briefing is done, still unconfirmed", () => {
    cover("client-profile-stage");
    const v = champSelectStage({ briefingActive: false, localPick: "", secondsLeft: 40 });
    expect(v.stage).toBe("picking");
    expect(v.confirmed).toBe(false);
    expect(v.autoPickImminent).toBe(false);
  });

  it("confirmed once a champion is picked", () => {
    cover("client-profile-stage");
    const v = champSelectStage({ briefingActive: false, localPick: "sela", secondsLeft: 20 });
    expect(v.confirmed).toBe(true);
  });

  it("warns of the server auto-pick only in the final seconds with no pick", () => {
    cover("client-profile-stage");
    expect(champSelectStage({ briefingActive: false, localPick: "", secondsLeft: AUTO_PICK_WARN_SEC }).autoPickImminent).toBe(true);
    // picked in time → no warning
    expect(champSelectStage({ briefingActive: false, localPick: "sela", secondsLeft: 2 }).autoPickImminent).toBe(false);
    // clock parked at 0 (server hand-off) → no warning
    expect(champSelectStage({ briefingActive: false, localPick: "", secondsLeft: 0 }).autoPickImminent).toBe(false);
  });
});

describe("champ-select skill seat", () => {
  it("previews the kit at rank-1 with no learned points", () => {
    cover("client-profile-seat");
    const sela = Champions.get("sela" as ChampionId);
    const rows = skillRows(champSelectSkillSeat(sela));
    const core = rows.filter((r) => r.slot !== "PASSIVE" && r.slot !== "EX").map((r) => r.slot);
    expect(core).toEqual(["Q", "W", "E", "R"]);
    const q = rows.find((r) => r.slot === "Q")!;
    expect(q.learned).toBe(false);
    expect(q.cooldownSec).toBe(sela.abilities.Q.cooldown[0]);
  });

  it("forces the EX row visible when the champion has an EX ability", () => {
    cover("client-profile-seat");
    const sela = Champions.get("sela" as ChampionId);
    // sela has no EX → seat carries none
    expect(champSelectSkillSeat(sela).exRank).toBe(0);
    // a def WITH an exAbility → the seat forces it to rank 1 so it previews
    const withEx = { ...sela, exAbility: sela.abilities.Q.id } as unknown as ChampionDef;
    const seat = champSelectSkillSeat(withEx);
    expect(seat.exAbilityId).toBe(sela.abilities.Q.id);
    expect(seat.exRank).toBe(1);
  });
});

describe("champ-select responsive layout (mobile profile fix)", () => {
  it("keeps the desktop two-column layout with a full-size 3D stage", () => {
    const l = champSelectProfileLayout({ touch: false, viewportHeight: 720 });
    expect(l.stacked).toBe(false);
    expect(l.compact).toBe(false);
    // desktop stage is unchanged (the original fixed height)
    expect(l.stageHeight).toBe(300);
  });

  it("stacks + shrinks the stage on phones so the tabbed intro is not clipped", () => {
    // phone landscape (~390px tall): the intro must stay reachable, so the
    // picker stacks into one scroll and the stage no longer eats the panel.
    const landscape = champSelectProfileLayout({ touch: true, viewportHeight: 390 });
    expect(landscape.stacked).toBe(true);
    expect(landscape.compact).toBe(true);
    // the shrunk stage must leave real room for the identity + tabs + body
    expect(landscape.stageHeight).toBeLessThan(300);
    expect(landscape.stageHeight).toBeLessThan(390 - 100);

    // a taller touch viewport (tablet / portrait) can afford a larger stage
    const tall = champSelectProfileLayout({ touch: true, viewportHeight: 900 });
    expect(tall.stacked).toBe(true);
    expect(tall.stageHeight).toBeGreaterThan(landscape.stageHeight);
    expect(tall.stageHeight).toBeLessThan(300);
  });
});

describe("description sections", () => {
  it("splits the map's free text into labelled sub-sections", () => {
    cover("client-profile-desc");
    const s = parseDescriptionSections(DESC);
    expect(s.hasSections).toBe(true);
    expect(s.difficulty).toBe("中");
    expect(s.recommend).toBe("PK殺人");
    expect(s.story).toContain("少女殺手安云");
    // a colon INSIDE the story ("(出自:安云)") must not be mistaken for a header
    expect(s.story).toContain("(出自:安云)");
    expect(s.skills).toContain("斷末");
  });

  it("is tolerant of empty / header-less input", () => {
    cover("client-profile-desc");
    expect(parseDescriptionSections(undefined).hasSections).toBe(false);
    expect(parseDescriptionSections("").hasSections).toBe(false);
    const plain = parseDescriptionSections("就只是一段沒有標題的文字。");
    expect(plain.hasSections).toBe(false);
    expect(plain.story).toBeUndefined();
  });
});
