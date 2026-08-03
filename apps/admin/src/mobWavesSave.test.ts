/**
 * 殭屍波系統 — WHAT THE PAGE ACTUALLY SENDS.
 *
 * WHY THIS FILE EXISTS. `mobWavesRender.test.ts` guards the FIRST PAINT and the
 * route; its save guard was a regex over the page's own source
 * (`putOverlayDoc(ARENA_RULES_COLLECTION, ARENA_RULES_ID`), which proves the
 * CALL EXISTS and says nothing about its PAYLOAD. An independent verifier
 * replaced the page's
 *
 *     patchArenaRules(base, configFromForm(form))   →   patchArenaRules(base, SHIPPED_MOB_WAVES)
 *
 * — the owner edits 22 knobs, presses 儲存, and the durable overlay receives the
 * SHIPPED DEFAULTS while the page cheerfully reports 「✓ 已寫入耐久覆蓋層」. The
 * whole console suite stayed green and typecheck stayed clean. The same run
 * killed the ChampionPicker's `<select>` (`if (props.options.length === 0)` →
 * `if (true)`), leaving the bare-id text box the picker exists to replace: also
 * green, because a `data-field="…"` assertion cannot tell an `<input>` from a
 * `<select>`.
 *
 * SO THIS FILE DRIVES THE PAGE. There is no jsdom in this monorepo, so
 * `src/testkit/headlessUi` supplies the ~200 lines of React a form needs (hook
 * state, effects, synchronous re-render) and renders into a plain host tree.
 * Every test here types into the REAL controls, presses the REAL button, and
 * asserts on the object handed to `putOverlayDoc`. Swap that payload for the
 * shipped block and every assertion below flips.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { MobWavesPage } from "./ui/MobWavesPage";
import {
  MOB_WAVES_FIELD_ORDER,
  MOB_WAVES_LABELS,
  SHIPPED_MOB_WAVES,
  extractMobWaves,
  readField,
  type MobWavesConfig,
  type MobWavesFieldKey,
} from "./mobWaves";
import { mount, optionLabels, optionValues } from "./testkit/headlessUi";

// --------------------------------------------------------------- fixtures ---

/** Mutable state the mocked modules read — reset in `beforeEach`. */
const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  putRejects: false,
  overlayDoc: null as unknown,
  champions: [] as Array<{ id: string; name: string }>,
  championsReject: false,
  generation: 0,
}));

/**
 * The hook dispatcher. Element creation (`react/jsx-runtime`) stays REAL — only
 * `useState` / `useEffect` / `useMemo` are ours, which is what makes a node-only
 * render interactive. See src/testkit/headlessUi.ts.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getOverlayDoc: async (): Promise<unknown> => bus.overlayDoc,
    getShippedDoc: async (): Promise<{ present: boolean; hash: string; doc: unknown }> => ({
      present: false,
      hash: "",
      doc: null,
    }),
    putOverlayDoc: async (
      collection: string,
      id: string,
      doc: Record<string, unknown>,
    ): Promise<{ generation: number }> => {
      if (bus.putRejects) throw new Error("平台拒絕了這次寫入");
      // deep-copy: the assertions must see what was SENT, not a later mutation
      bus.puts.push({ collection, id, doc: JSON.parse(JSON.stringify(doc)) as Record<string, unknown> });
      return { generation: ++bus.generation };
    },
  };
});

vi.mock("./content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./content")>();
  return {
    ...actual,
    loadCollection: async (): Promise<Array<{ id: string; name: string }>> => {
      if (bus.championsReject) throw new Error("/content 掛了");
      return bus.champions;
    },
  };
});

/** The roster the picker gets. Real ids from the open roster. */
const ROSTER = [
  { id: "godie-zombiex", name: "喪標麥可" },
  { id: "godie-hblm", name: "賈修" },
  { id: "godie-efur", name: "揍敵客" },
];

/**
 * What the overlay currently holds. Deliberately DIFFERENT from
 * `SHIPPED_MOB_WAVES` in every value this file touches, and carrying sibling
 * blocks, so "wrote the operator's edits" / "wrote the shipped defaults" /
 * "wrote back what it loaded" are three distinguishable outcomes.
 */
const LIVE_DOC = (): Record<string, unknown> => ({
  rounds: { "1": { gold: 100 }, "10": { gold: 900 } },
  flowers: { perRound: 4 },
  guardianTower: { hp: 1234 },
  mobWaves: {
    fromRound: 3,
    firstWaveSec: 1,
    waveIntervalSec: 2,
    mobsPerWaveCap: 6,
    maxAlivePerZone: 16,
    schedule: [
      { round: 6, mobsPerWaveCap: 11, maxAlivePerZone: 21 },
      { round: 7, mobsPerWaveCap: 16, maxAlivePerZone: 31 },
      { round: 8, mobsPerWaveCap: 21, maxAlivePerZone: 41 },
      { round: 9, mobsPerWaveCap: 26, maxAlivePerZone: 51 },
      { round: 10, mobsPerWaveCap: 0, maxAlivePerZone: 0 },
    ],
    mob: {
      maxHp: 25,
      attackDamage: 1.3,
      moveSpeed: 3.1,
      attackRange: 1.9,
      attackCdSec: 1.1,
      radius: 0.61,
      modelKey: "champ.mob.zombie",
      championId: "godie-zombiex",
      baseLevel: 3,
      levelPerRound: 1,
      baseHp: 21,
      hpPerLevel: 21,
      baseRegen: 0,
      regenPerLevel: 0,
    },
    reward: { gold: 21, xp: 41, killsPerLevel: 7 },
  },
});

/**
 * One distinct, VALID sentinel per knob — none of them equal to either the
 * shipped block or the live doc, so a payload built from anything other than
 * the form fails on every line.
 */
const TYPED: Record<MobWavesFieldKey, string> = {
  fromRound: "2",
  firstWaveSec: "3.5",
  waveIntervalSec: "4.5",
  mobsPerWaveCap: "7",
  maxAlivePerZone: "23",
  // ⚠️ 跨線交接縫：這三格是「特殊殭屍不要用殭屍王結算畫面」那條線新增的後台欄位。
  // 這個 fixture 刻意手寫完整的 Record（見檔頭），所以每次有人加欄位它就會紅 ——
  // 那是它的用途，不是它的缺陷。
  "boss.settlementTitle": "王的結算標題",
  "special.settlementTitle": "特殊的結算標題",
  "special.settlementMode": "toast",
      stopSpawnOnTeamWipe: "0",
      roundHoldMobKinds: "any",
  // GH#268 精英小怪血條 —— 五格都和出貨值不同（true/34/5/0.35/1）。
  "healthBar.showHealthBar": "0",
  "healthBar.barWidth": "48",
  "healthBar.barHeight": "9",
  "healthBar.yOffset": "1.25",
  "healthBar.showThreshold": "0.4",
  "mob.maxHp": "111",
  "mob.attackDamage": "2.5",
  "mob.moveSpeed": "3.75",
  "mob.attackRange": "2.2",
  "mob.attackCdSec": "1.35",
  "mob.radius": "0.7",
  "mob.modelKey": "champ.mob.test-double",
  "mob.championId": "godie-hblm",
  // #289 — differs from the shipped "fixed" so an unwritten line is visible
  "mob.championSource": "random",
  "mob.sizeMult": "1.4",
  "mob.tintStrength": "0.4",
  // #247 腳下圈圈 —— distinct from the shipped 1.25 / 1.
  "mob.groundRingDiameter": "3.5",
  "mob.groundRingSizeFollow": "0.5",
  "mob.baseLevel": "4",
  "mob.levelPerRound": "2",
  "mob.baseHp": "31",
  "mob.hpPerLevel": "13",
  "mob.baseRegen": "0.5",
  "mob.regenPerLevel": "0.25",
  "reward.gold": "45",
  "reward.xp": "65",
  "reward.killsPerLevel": "9",
  "boss.enabled": "1",
  "boss.killThreshold": "150",
  "boss.repeatable": "0",
  "boss.maxHp": "7500",
  "boss.attackDamage": "14",
  "boss.attackCdSec": "1.6",
  "boss.attackRange": "3.1",
  "boss.moveSpeed": "2.9",
  "boss.radius": "2.1",
  "boss.championId": "godie-efur",
  "boss.championSource": "fixed",
  "boss.sizeMult": "7.5",
  "boss.hpMult": "55",
  // GH#206 從英雄推導 — distinct sentinels, same reason as every line above.
  "boss.heroHpMult": "13",
  "boss.heroDamageMult": "7",
  "boss.hpFlatBonus": "76000",
  "boss.moveSpeedMult": "0.45",
  "boss.heroLevel": "66",
  // #290 — distinct from the shipped "fixed".
  "boss.heroLevelSource": "round",
  "boss.modelKey": "champ.mob.king-double",
  "boss.bountyGold": "4200",
  "boss.bountyXp": "1600",
  "boss.lastHitMultiplier": "3",
  "boss.bountyLevels": "50",
  "boss.lastHitMode": "bonus",
  "boss.countOverkill": "0",
  // #247 —— distinct from the shipped true/true/true/true/1/"zone".
  "boss.noClip": "0",
  "boss.noClipUnits": "0",
  "boss.noClipObstacles": "0",
  "boss.noClipStayInside": "0",
  "boss.maxPerRound": "3",
  "boss.maxPerRoundScope": "match",
  // #247 第二批 —— 仇恨排序 + 長血條三格 (owner 2026-08-01)
  "boss.aggroRank": "0.5",
  "boss.healthBar": "0",
  "boss.healthBarAnchor": "bottom",
  "boss.healthBarReveal": "sighted",
  "special.chancePercent": "12",
  "special.hpMult": "2.5",
  "special.damageMult": "1.75",
  "special.moveSpeedMult": "1.4",
  "special.radiusMult": "2.2",
  "special.rewardMult": "4",
  "special.championId": "godie-hblm",
  "special.championSource": "inherit",
  "special.sizeMult": "2.4",
  "special.heroHpMult": "4.5",
  "special.heroDamageMult": "2.5",
  "special.hpFlatBonus": "8500",
  "special.heroLevel": "38",
  // #290 — distinct from the shipped "matchHighest".
  "special.heroLevelSource": "fixed",
  "special.modelKey": "champ.mob.special-double",
  // #288 分紅獎池 — distinct sentinels, same reason as every line above.
  "special.bountyGold": "6100",
  "special.bountyXp": "260",
  "special.bountyLevels": "9",
  "special.lastHitMultiplier": "1.5",
  "special.lastHitMode": "weight",
  "special.splitByDamage": "0",
  "special.countOverkill": "1",
};

const SAVE = "儲存 Save";
const RESET_ALL = "全部重設為出貨版";

beforeEach(() => {
  bus.puts.length = 0;
  bus.putRejects = false;
  bus.championsReject = false;
  bus.generation = 0;
  bus.overlayDoc = LIVE_DOC();
  bus.champions = ROSTER.map((c) => ({ ...c }));
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(MobWavesPage));
  await h.flush();
  return h;
}

/** The block that reached the durable writer on the Nth save. */
function sentBlock(nth = 0): MobWavesConfig {
  const call = bus.puts[nth];
  if (!call) throw new Error(`putOverlayDoc was never called (call #${nth})`);
  const block = extractMobWaves(call.doc);
  if (!block) throw new Error("the doc that was sent has no mobWaves block");
  return block;
}

// ------------------------------------------------------------------ tests ---

describe("the save carries the operator's edits, not the shipped defaults", () => {
  it("a representative edit of every KIND lands in the payload", async () => {
    cover("admin-mob-waves");
    const h = await open();

    h.type("mobsPerWaveCap", "7"); // 每波數量（基準）
    h.type("maxAlivePerZone", "23"); // 存活上限（基準）
    h.type("mob.baseHp", "31"); // 殭屍血量曲線起點
    h.type("mob.maxHp", "111"); // 殭屍血量（保險值）
    h.type("schedule.8.mobsPerWaveCap", "13"); // 逐回合：每波數量
    h.type("schedule.8.maxAlivePerZone", "33"); // 逐回合：場上上限
    h.type("schedule.8.championId", "godie-efur"); // 逐回合：由誰擔任
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(1);
    const block = sentBlock();
    expect(block.mobsPerWaveCap).toBe(7);
    expect(block.maxAlivePerZone).toBe(23);
    expect(block.mob.baseHp).toBe(31);
    expect(block.mob.maxHp).toBe(111);
    const round8 = (block.schedule ?? []).find((r) => r.round === 8);
    expect(round8).toEqual({
      round: 8,
      mobsPerWaveCap: 13,
      maxAlivePerZone: 33,
      championId: "godie-efur",
    });

    // …and the direction that matters: it is NOT the shipped block, and not the
    // doc it loaded either. Both of those would mean the edits were discarded.
    expect(block).not.toEqual(SHIPPED_MOB_WAVES);
    expect(block).not.toEqual(extractMobWaves(LIVE_DOC()));
  });

  it("EVERY one of the 22 knobs reaches the payload with the typed value", async () => {
    cover("admin-mob-waves");
    const h = await open();

    for (const key of MOB_WAVES_FIELD_ORDER) h.type(key, TYPED[key]);
    h.click(SAVE);
    await h.flush();

    const block = sentBlock();
    for (const key of MOB_WAVES_FIELD_ORDER) {
      expect(readField(block, key), `${key} (${MOB_WAVES_LABELS[key].zh}) never reached the payload`)
        .toBe(TYPED[key]);
    }
  });

  it("the per-round 由誰擔任 column is written for the round it was set on, and only that round", async () => {
    cover("admin-mob-waves");
    const h = await open();

    h.type("schedule.7.championId", "godie-hblm");
    h.type("schedule.9.championId", "godie-efur");
    h.click(SAVE);
    await h.flush();

    const rows = sentBlock().schedule ?? [];
    expect(rows.find((r) => r.round === 7)?.championId).toBe("godie-hblm");
    expect(rows.find((r) => r.round === 9)?.championId).toBe("godie-efur");
    // rounds nobody touched must carry NO championId — an inherited-from-the-
    // match-wide-setting round is written as absent, not as a copy
    expect(rows.find((r) => r.round === 6)?.championId).toBeUndefined();
    expect(rows.find((r) => r.round === 8)?.championId).toBeUndefined();
    expect(rows.find((r) => r.round === 10)?.championId).toBeUndefined();
  });

  it("clearing a per-round champion drops the key again (it does not stick at the old id)", async () => {
    cover("admin-mob-waves");
    const h = await open();

    h.type("schedule.7.championId", "godie-hblm");
    h.type("schedule.7.championId", "");
    h.click(SAVE);
    await h.flush();

    const row7 = (sentBlock().schedule ?? []).find((r) => r.round === 7);
    expect(row7?.championId).toBeUndefined();
  });

  it("the write is the DURABLE one: config/arena-rules, whole doc, siblings intact", async () => {
    cover("admin-mob-waves");
    const h = await open();

    h.type("reward.gold", "45");
    h.click(SAVE);
    await h.flush();

    const call = bus.puts[0];
    expect(call?.collection).toBe("config");
    expect(call?.id).toBe("arena-rules");
    // every other block of arena-rules rides along untouched — the overlay
    // stores WHOLE documents, so a save that dropped a sibling would delete
    // that mechanic on the host
    expect(call?.doc["rounds"]).toEqual(LIVE_DOC()["rounds"]);
    expect(call?.doc["flowers"]).toEqual(LIVE_DOC()["flowers"]);
    expect(call?.doc["guardianTower"]).toEqual(LIVE_DOC()["guardianTower"]);
  });

  it("全部重設為出貨版 then save writes the SHIPPED block — the assertions above can tell the two apart", async () => {
    cover("admin-mob-waves");
    const h = await open();

    h.click(RESET_ALL);
    h.click(SAVE);
    await h.flush();

    expect(sentBlock()).toEqual(SHIPPED_MOB_WAVES);
  });

  it("the success line only appears when the write really happened", async () => {
    cover("admin-mob-waves");
    bus.putRejects = true;
    const h = await open();

    h.type("reward.xp", "65");
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(0);
    expect(h.text()).not.toContain("已寫入耐久覆蓋層");
    expect(h.text()).toContain("儲存失敗");
    // the edit is still in the box — a failed save must not silently revert it
    expect(h.field("reward.xp").props["value"]).toBe("65");
  });

  it("a successful save reports the generation the platform returned", async () => {
    cover("admin-mob-waves");
    bus.generation = 40;
    const h = await open();

    h.type("reward.xp", "65");
    h.click(SAVE);
    await h.flush();

    expect(h.text()).toContain("已寫入耐久覆蓋層（generation 41）");
    // and the page stops claiming unsaved work
    expect(h.text()).toContain("沒有未儲存的變更");
  });
});

describe("the page edits what is LIVE, not the shipped block", () => {
  it("boxes are seeded from the overlay doc, and an untouched knob saves that same value", async () => {
    cover("admin-mob-waves");
    const h = await open();

    expect(h.field("maxAlivePerZone").props["value"]).toBe("16"); // live, not shipped 15
    expect(h.field("reward.killsPerLevel").props["value"]).toBe("7"); // live, not shipped 6

    h.type("reward.gold", "45");
    h.click(SAVE);
    await h.flush();

    const block = sentBlock();
    expect(block.maxAlivePerZone).toBe(16);
    expect(block.reward.killsPerLevel).toBe(7);
    expect(block.reward.gold).toBe(45);
  });
});

describe("由誰擔任 is a real dropdown of 中文名, not a bare id box", () => {
  it("the match-wide picker is a <select> carrying every champion in the roster", async () => {
    cover("admin-mob-waves");
    const h = await open();

    const picker = h.field("mob.championId");
    expect(picker.type, "the 由誰擔任 control is not a <select>").toBe("select");
    const values = optionValues(picker);
    for (const c of ROSTER) expect(values, `${c.id} is not pickable`).toContain(c.id);
    expect(values).toContain(""); // 「留空 = 系統預設」 stays reachable
    // and every option READS as a character, not as a slug
    const labels = optionLabels(picker);
    expect(labels.some((l) => l.includes("賈修（godie-hblm）"))).toBe(true);
    expect(labels.some((l) => l.includes("喪標麥可（godie-zombiex）"))).toBe(true);
  });

  it("every per-round row's picker is a <select> too", async () => {
    cover("admin-mob-waves");
    const h = await open();

    for (const round of [6, 7, 8, 9, 10]) {
      const cell = h.field(`schedule.${round}.championId`);
      expect(cell.type, `round ${round} 由誰擔任 is not a <select>`).toBe("select");
      expect(optionValues(cell)).toContain("godie-efur");
    }
  });

  it("an id the roster does not contain stays selectable, so opening the page cannot silently rewrite it", async () => {
    cover("admin-mob-waves");
    const doc = LIVE_DOC();
    (doc["mobWaves"] as { mob: { championId: string } }).mob.championId = "godie-ghost";
    bus.overlayDoc = doc;
    const h = await open();

    const picker = h.field("mob.championId");
    expect(optionValues(picker)).toContain("godie-ghost");
    expect(picker.props["value"]).toBe("godie-ghost");

    h.click(SAVE);
    await h.flush();
    expect(sentBlock().mob.championId).toBe("godie-ghost");
  });

  it("degrades to a free-text id box when /content is unreachable — the knob still WORKS", async () => {
    cover("admin-mob-waves");
    bus.championsReject = true;
    const h = await open();

    const picker = h.field("mob.championId");
    expect(picker.type).toBe("input");

    h.type("mob.championId", "godie-efur");
    h.click(SAVE);
    await h.flush();
    expect(sentBlock().mob.championId).toBe("godie-efur");
  });
});
