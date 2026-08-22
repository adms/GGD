/**
 * The live half of the P7 fix: a pressed button, read against the actual HUD
 * store, produces the right sentence — or deliberately stays quiet.
 *
 * The most important assertions here are the NEGATIVE ones. A refusal the
 * client invents (because it mis-read a rank, or a seat that has not spawned)
 * is worse than the silence this whole lane exists to remove: it teaches the
 * player that the game lies. So every "returns null" case below is load-bearing.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { AbilityDef, ChampionDef } from "@ggd/shared/sim/content/defs";
import { abilityPassiveSourceId } from "@ggd/shared/sim/abilities/abilityPassives";
import { hudStore } from "../net/RoomStore";
import { resetPassiveProc } from "./passiveProc";
import {
  INNATE_ACTIVE_CASTABLE,
  announceCastAttempt,
  recordCastEvent,
} from "./castAnnounce";
import { INNATE_INERT_NOTE } from "./passiveSlot";
import {
  CAST_REJECT_TEXT,
  getCastNotice,
  resetCastFeedback,
  sampleCastFlash,
} from "./castFeedback";

const CHAMP = "test-cast-hero" as ChampionId;
const EX = "test-cast-hero.ex" as AbilityId;
const INNATE = "test-cast-hero.passive" as AbilityId;
const ACTIVE_CHAMP = "test-cast-hero-active" as ChampionId;
const ACTIVE_INNATE = "test-cast-hero-active.passive" as AbilityId;
/** a permanent innate whose doc grants NOTHING — 29 of the shipped 48 */
const INERT_CHAMP = "test-cast-hero-inert" as ChampionId;
const INERT_INNATE = "test-cast-hero-inert.passive" as AbilityId;

function ability(id: string, name: string, slot: string, extra: Record<string, unknown> = {}): AbilityDef {
  return {
    id: id as AbilityId,
    name,
    slot,
    castType: "skillshot",
    maxRank: 3,
    cooldown: [10, 9, 8],
    manaCost: [50, 55, 60],
    range: 14,
    effects: [{ kind: "damage", amount: [100, 150, 200] }],
    ...extra,
  } as unknown as AbilityDef;
}

function champion(id: ChampionId, passiveAbility: AbilityId): ChampionDef {
  return {
    id,
    name: "測試英雄",
    role: "test",
    attackType: "ranged",
    modelKey: "none",
    baseStats: {},
    growth: {},
    passiveAbility,
    abilities: {
      Q: ability(`${id}.q`, "77-01 測試Ｑ", "Q"),
      W: ability(`${id}.w`, "77-02 測試Ｗ", "W"),
      E: ability(`${id}.e`, "77-03 測試Ｅ", "E"),
      R: ability(`${id}.r`, "77-04 測試Ｒ", "R"),
    },
    skillOrder: [],
    buildPriority: [],
    tags: [],
  } as unknown as ChampionDef;
}

beforeAll(() => {
  Champions.register(CHAMP, champion(CHAMP, INNATE));
  Champions.register(ACTIVE_CHAMP, champion(ACTIVE_CHAMP, ACTIVE_INNATE));
  Champions.register(INERT_CHAMP, champion(INERT_CHAMP, INERT_INNATE));
  Abilities.register(
    EX,
    ability(EX, "77-002 測試ＥＸ", "EX", { maxRank: 1, cooldown: [60], manaCost: [100] }),
  );
  // a PURE passive that WORKS: no cooldown, no castable effects
  // (isPassiveOnly), and a rank-1 block that really grants a stat — the shape
  // `syncAbilityPassives` attaches at spawn.
  Abilities.register(INNATE, {
    id: INNATE,
    name: "77-00 天生被動",
    slot: "PASSIVE",
    castType: "self",
    maxRank: 1,
    cooldown: [0],
    manaCost: [0],
    range: 0,
    innateKind: "passive",
    effects: [],
    passive: { ranks: [{ modifiers: [{ stat: "armor", op: "add", value: 5 }] }] },
  } as unknown as AbilityDef);
  // an INERT passive: same shape, empty block. 29 shipped innates look like
  // this — a name, a description promising 20 % evasion, and nothing attached.
  Abilities.register(INERT_INNATE, {
    id: INERT_INNATE,
    name: "79-00 天生空殼",
    slot: "PASSIVE",
    castType: "self",
    maxRank: 1,
    cooldown: [0],
    manaCost: [0],
    range: 0,
    innateKind: "passive",
    effects: [],
    passive: { ranks: [{ modifiers: [] }] },
  } as unknown as AbilityDef);
  // an ACTIVE innate — a real WC3 D-slot ability owned from level 1
  Abilities.register(ACTIVE_INNATE, {
    id: ACTIVE_INNATE,
    name: "78-00 天生主動",
    slot: "PASSIVE",
    castType: "self",
    maxRank: 1,
    cooldown: [20],
    manaCost: [40],
    range: 0,
    innateKind: "active",
    effects: [{ kind: "damage", amount: [100] }],
  } as unknown as AbilityDef);
});

interface SeatOver {
  championId?: string;
  abilityRanks?: number[];
  cooldowns?: number[];
  exRank?: number;
  exCooldown?: number;
  passiveCooldown?: number;
}

/** Seat the local player with a live champion, then override the bits under test. */
function seatLocal(over: SeatOver = {}, hud: { mana?: number; alive?: boolean } = {}): void {
  hudStore.setState({
    localSeatId: 0,
    localMana: hud.mana ?? 500,
    localMaxMana: 500,
    localAlive: hud.alive ?? true,
    seats: [
      {
        seatId: 0,
        teamId: 0,
        displayName: "me",
        connected: true,
        driver: "human",
        championId: over.championId ?? CHAMP,
        entityId: 7,
        level: 3,
        gold: 0,
        xp: 0,
        hp: 500,
        maxHp: 500,
        mana: hud.mana ?? 500,
        maxMana: 500,
        shield: 0,
        alive: hud.alive ?? true,
        zone: 0,
        ready: false,
        unspentPoints: 0,
        items: [],
        augments: [],
        abilityRanks: over.abilityRanks ?? [1, 1, 1, 1],
        cooldowns: over.cooldowns ?? [0, 0, 0, 0],
        exAbilityId: EX,
        exRank: over.exRank ?? 1,
        exCooldown: over.exCooldown ?? 0,
        passiveCooldown: over.passiveCooldown ?? 0,
        statStacks: 0,
        statCapstonePct: 0,
        undoDepth: 0,
      },
    ],
  } as never);
}

beforeEach(() => {
  resetCastFeedback();
  resetPassiveProc();
  hudStore.setState({ localSeatId: null, seats: [] } as never);
});

describe("announceCastAttempt — the press that used to say nothing", () => {
  it("explains a cooling ability WITH the seconds left", () => {
    seatLocal({ cooldowns: [45, 0, 0, 0] }); // 45 ticks @30Hz = 1.5s
    const n = announceCastAttempt("Q")!;
    expect(n.slot).toBe("Q");
    expect(n.text).toContain("冷卻中");
    expect(n.text).toContain("2"); // ceil(1.5)
    // and the button it belongs to shakes
    expect(sampleCastFlash("Q", performance.now())?.kind).toBe("deny");
  });

  it("explains an unlearned ability and points at the ＋ button", () => {
    seatLocal({ abilityRanks: [0, 1, 1, 1] });
    expect(announceCastAttempt("Q")!.text).toContain(CAST_REJECT_TEXT["not-learned"]);
  });

  it("explains empty mana", () => {
    seatLocal({}, { mana: 10 }); // rank-1 cost is 50
    expect(announceCastAttempt("W")!.text).toContain(CAST_REJECT_TEXT["no-mana"]);
  });

  it("explains being dead instead of eating the press", () => {
    seatLocal({}, { alive: false });
    expect(announceCastAttempt("E")!.text).toContain(CAST_REJECT_TEXT.dead);
  });

  it("names the ability, so the line survives a glance", () => {
    seatLocal({ cooldowns: [0, 0, 30, 0] });
    // the hero-number prefix is stripped on the HUD, exactly as on the tile
    expect(announceCastAttempt("E")!.text).toContain("測試Ｅ");
    expect(announceCastAttempt("E")!.text).not.toContain("77-03");
  });

  it("stays SILENT on a press it cannot fault — the sim answers instead", () => {
    seatLocal();
    expect(announceCastAttempt("Q")).toBeNull();
    expect(getCastNotice()).toBeNull();
  });

  it("reads the EX slot's own rank + cooldown, not Q's", () => {
    seatLocal({ exCooldown: 90 });
    expect(announceCastAttempt("EX")!.text).toContain("冷卻中");
    seatLocal({ exRank: 0 });
    expect(announceCastAttempt("EX")!.text).toContain(CAST_REJECT_TEXT["not-learned"]);
  });

  it("uses the mana cost of the rank ABOUT TO BE CAST", () => {
    // rank 3 costs 60; 55 is enough for rank 2 and not for rank 3
    seatLocal({ abilityRanks: [3, 1, 1, 1] }, { mana: 55 });
    expect(announceCastAttempt("Q")!.text).toContain(CAST_REJECT_TEXT["no-mana"]);
    seatLocal({ abilityRanks: [2, 1, 1, 1] }, { mana: 55 });
    expect(announceCastAttempt("Q")).toBeNull();
  });

  it("says nothing at all before a seat / champion exists", () => {
    expect(announceCastAttempt("Q")).toBeNull(); // no seat (beforeEach)
    seatLocal({ championId: "no-such-champion" });
    expect(announceCastAttempt("Q")).toBeNull();
  });

  it("says nothing in CHAMP SELECT, where alive===false means something else", () => {
    // A seat with no entity on the field reads alive===false for a reason that
    // has nothing to do with dying — announcing 「陣亡中，無法施放」 to somebody
    // still picking a hero would be a brand-new lie of exactly the kind this
    // module deletes. `entityId > 0` is the same liveness test the store uses.
    seatLocal({}, { alive: false });
    const seats = hudStore.getState().seats.map((s) => ({ ...s, entityId: 0 }));
    hudStore.setState({ seats } as never);
    expect(announceCastAttempt("Q")).toBeNull();
    expect(getCastNotice()).toBeNull();
  });
});

describe("the sixth slot stays honest", () => {
  it("a WORKING pure passive answers 「不需施放」 — it is not a dead button", () => {
    seatLocal();
    const n = announceCastAttempt("PASSIVE")!;
    expect(n.text).toContain(CAST_REJECT_TEXT.passive);
    // never a 'not-learned': it is owned from level 1, never learned
    expect(n.text).not.toContain(CAST_REJECT_TEXT["not-learned"]);
  });

  it("an INERT passive says so, and does NOT claim 「永久生效」", () => {
    // The 29 shipped innates whose doc grants nothing must not be able to
    // borrow the confident sentence the 19 working ones get — that is the same
    // silent failure this sweep exists to delete, wearing a reassurance.
    seatLocal({ championId: INERT_CHAMP });
    const n = announceCastAttempt("PASSIVE")!;
    expect(n.text).toContain(INNATE_INERT_NOTE);
    expect(n.text).not.toContain(CAST_REJECT_TEXT.passive);

    // and the two are genuinely DIFFERENT sentences, not two spellings of one
    seatLocal();
    expect(announceCastAttempt("PASSIVE")!.text).not.toBe(n.text);
  });

  it("an ACTIVE innate is now a real cast: silent when it can fire", () => {
    expect(INNATE_ACTIVE_CASTABLE).toBe(true); // the seam is OPEN
    seatLocal({ championId: ACTIVE_CHAMP });
    // nothing to fault → say nothing and let the press travel to the sim
    expect(announceCastAttempt("PASSIVE")).toBeNull();
  });

  it("an ACTIVE innate pays the same prices — cooldown and mana, said in words", () => {
    // the sixth slot's own cooldown off the wire, NOT Q's and not a fixed 0
    seatLocal({ championId: ACTIVE_CHAMP, passiveCooldown: 90 });
    expect(announceCastAttempt("PASSIVE")!.text).toContain(CAST_REJECT_TEXT.cooldown);
    // 40 mana authored on the fixture; 10 in the pool
    seatLocal({ championId: ACTIVE_CHAMP }, { mana: 10 });
    expect(announceCastAttempt("PASSIVE")!.text).toContain(CAST_REJECT_TEXT["no-mana"]);
    // and it is never 「被動」 — that answer belongs to the other half of the slot
    expect(announceCastAttempt("PASSIVE")!.text).not.toContain(CAST_REJECT_TEXT.passive);
  });

  it("a Q cooldown never leaks onto the innate (separate cooldown lines)", () => {
    seatLocal({ championId: ACTIVE_CHAMP, cooldowns: [90, 90, 90, 90] });
    expect(announceCastAttempt("PASSIVE")).toBeNull();
  });

  it("says nothing for the three heroes that genuinely have no innate", () => {
    Champions.register("test-cast-hero-none" as ChampionId, {
      ...champion("test-cast-hero-none" as ChampionId, INNATE),
      passiveAbility: undefined,
    } as unknown as ChampionDef);
    seatLocal({ championId: "test-cast-hero-none" });
    expect(announceCastAttempt("PASSIVE")).toBeNull();
  });
});

describe("recordCastEvent — the server has the last word", () => {
  const rejected = (data: Record<string, unknown>) => ({ type: "castRejected", data });

  it("shows an aiming reason the client could never have predicted", () => {
    seatLocal();
    recordCastEvent(rejected({ entity: 7, slot: "R", reason: "out-of-range" }), 7, 1000);
    expect(getCastNotice()?.text).toContain(CAST_REJECT_TEXT["out-of-range"]);
    expect(sampleCastFlash("R", 1000)?.kind).toBe("deny");
  });

  it("OVERWRITES a local prediction for the same press", () => {
    seatLocal({ cooldowns: [30, 0, 0, 0] });
    announceCastAttempt("Q");
    expect(getCastNotice()?.text).toContain("冷卻中");
    recordCastEvent(rejected({ entity: 7, slot: "Q", reason: "stunned" }), 7, 2000);
    expect(getCastNotice()?.text).toContain(CAST_REJECT_TEXT.stunned);
  });

  it("confirms an ACCEPTED cast on the button — the half instants had none", () => {
    seatLocal();
    recordCastEvent({ type: "castBegin", data: { caster: 7, slot: "W" } }, 7, 3000);
    expect(sampleCastFlash("W", 3000)).toEqual({ kind: "confirm", strength: 1 });
    // and it says nothing: a successful cast needs no sentence
    expect(getCastNotice()).toBeNull();
  });

  it("confirms off `abilityCast` too (an instant with no castBegin)", () => {
    seatLocal();
    recordCastEvent({ type: "abilityCast", data: { caster: 7, slot: "R" } }, 7, 4000);
    expect(sampleCastFlash("R", 4000)?.kind).toBe("confirm");
  });

  it("never confirms or explains ANOTHER champion's cast", () => {
    seatLocal();
    recordCastEvent({ type: "castBegin", data: { caster: 42, slot: "W" } }, 7, 5000);
    recordCastEvent(rejected({ entity: 42, slot: "Q", reason: "no-mana" }), 7, 5000);
    expect(sampleCastFlash("W", 5000)).toBeNull();
    expect(getCastNotice()).toBeNull();
  });

  it("ignores every unrelated combat event on the drain", () => {
    seatLocal();
    recordCastEvent({ type: "damage", data: { target: 7, amount: 50 } }, 7, 6000);
    expect(getCastNotice()).toBeNull();
  });
});

/**
 * ⭐ GH#576 —— owner 2026-08-23:「**被動技 觸發作用的時候 還是要閃一下圖示**」。
 *
 * 承重的那一行是 `recordCastEvent` 裡的 `recordPassiveProc(...)`，而它必須在
 * `isCastFeedbackEvent` 的閘**之前** —— 被動不發 castBegin/abilityCast，它藏在
 * `buffApply` 這一族的 `origin` 裡。拿掉那一行 ⇒ 下面第一條紅。
 */
describe("被動觸發也要閃一下圖示 (GH#576)", () => {
  /** 逐字用 sim 那支函式產出的來源 id，⛔ 不是手打一個字面值（它會 drift）。 */
  const origin = `hook:${abilityPassiveSourceId(`${CHAMP}.q`)}`;

  it("我的被動作用時，那一格閃 proc（⛔ 不是 confirm —— 沒有人按過它）", () => {
    seatLocal();
    recordCastEvent({ type: "buffApply", data: { source: 7, target: 7, origin } }, 7, 9000);
    expect(sampleCastFlash("Q", 9000)?.kind).toBe("proc");
  });

  it("別人的被動不會閃我的格子", () => {
    seatLocal();
    recordCastEvent({ type: "buffApply", data: { source: 42, target: 7, origin } }, 7, 9000);
    expect(sampleCastFlash("Q", 9000)).toBeNull();
  });

  it("節流：同一格在窗口內連發十次只閃第一次", () => {
    seatLocal();
    const ev = { type: "buffApply", data: { source: 7, target: 7, origin } };
    recordCastEvent(ev, 7, 9000);
    resetCastFeedback(); // 忘掉第一次的閃，⇒ 下面若又閃就是節流沒生效
    for (let i = 1; i <= 10; i++) recordCastEvent(ev, 7, 9000 + i * 20);
    expect(sampleCastFlash("Q", 9300)).toBeNull();
  });
});
