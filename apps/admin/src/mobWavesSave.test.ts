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
import { COMBAT_ENV_LABELS } from "./combatEnv";
import { mount, optionLabels, optionValues, textOf } from "./testkit/headlessUi";

// --------------------------------------------------------------- fixtures ---

/** Mutable state the mocked modules read — reset in `beforeEach`. */
const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  putRejects: false,
  overlayDoc: null as unknown,
  champions: [] as Array<{ id: string; name: string }>,
  championsReject: false,
  generation: 0,
  /** 戰鬥系統那張表 —— 只有「實發」那一欄讀它。`null` = 平台連不上。 */
  combatEnv: null as Record<string, number> | null,
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
    // ⚠️ 沒有這一行的話它會是**真的** `getCombatEnv`（`...actual`），在 node 裡
    // 送 HTTP 然後 throw —— 頁面 catch 掉，「實發」永遠不出現，而下面那組守衛
    // 會在一個「功能被拿掉也一樣」的世界裡全綠（失敗形態 ④）。
    getCombatEnv: async (): Promise<{
      version: number;
      updatedAt: string;
      multipliers: Record<string, number>;
    }> => {
      if (bus.combatEnv === null) throw new Error("平台的 /admin/combat-env 連不上");
      return { version: 1, updatedAt: "", multipliers: bus.combatEnv };
    },
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
  // ⭐ GH#577 / GH#602 —— 殭屍王「會打架」那一整塊（同一條交接縫）。
  "boss.king.enabled": "0",
  "boss.king.learnRank": "3",
  "boss.king.learnRankMode": "fixed",
  "boss.king.innateAbilityId": "godie-zombieking.passive",
  "boss.king.innateCastHpPct": "0.35",
  "boss.king.maxMana": "12345",
  "boss.king.manaRegenPerSec": "777",
  "boss.king.attackSpeedFloor": "6",
  "boss.king.targetPreference": "nearest",
  "boss.king.situationalAiming": "0",
  "boss.king.areaMinTargets": "4",
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
  // GH#647 —— 出貨是 "0"(不畫);打 "1" 才證明是操作者的值到了 payload,不是預設
  "normalMobShadow": "1",
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
  "mob.levelCurve.perRoundSq": "0.5",
  "mob.levelCurve.perRound": "3.5",
  "mob.levelCurve.flat": "4",
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
  "boss.countsAsChampion": "",
  "special.countsAsChampion": "",
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
  "boss.levelCurve.perRoundSq": "2",
  "boss.levelCurve.perRound": "1.5",
  "boss.levelCurve.flat": "12",
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
  "special.levelCurve.perRoundSq": "0.25",
  "special.levelCurve.perRound": "4.5",
  "special.levelCurve.flat": "7",
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
  bus.combatEnv = null; // 預設「讀不到」——想量「實發」的測試自己設。
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

/**
 * 「實發」真的畫在頁面上 (owner 2026-08-04「顯示不說謊 => 顯示真實值，跟其他系統
 * 倍率一樣」).
 *
 * ⚠️ 為什麼不能只留 `mobWaves.test.ts` 的純函式守衛：`effectiveGold` 可以是
 * 完全正確的，而 `FieldRow` 裡那個 `{eff && …}` 被刪掉，操作者看到的還是
 * 30,000 —— 失敗形態 ③（可以從渲染樹刪掉但測試全綠），也就是這個檔案存在的
 * 全部理由（見檔頭）。所以這一組**掛真的頁面**，讀真的節點。
 *
 * 薄守衛，不開對抗輪：這是體驗層（欄位旁邊多一行字）。
 */
describe("金錢欄位旁邊真的印出「實發」", () => {
  /** LIVE_DOC 的 reward.gold 換成一個對半分乾淨的數，避免測試自己重算一次四捨五入。 */
  function withRewardGold(gold: number): Record<string, unknown> {
    const doc = LIVE_DOC();
    const waves = doc["mobWaves"] as Record<string, unknown>;
    waves["reward"] = { gold, xp: 41, killsPerLevel: 7 };
    return doc;
  }

  it("倍率 0.5 → 每殺一隻給金錢旁邊出現實發的一半，而且指名是哪一格", async () => {
    cover("admin-mob-waves");
    bus.overlayDoc = withRewardGold(200);
    bus.combatEnv = { goldMobKill: 0.5, goldEliteKill: 0.5 };
    const h = await open();

    const chip = h.fieldOrNull("effective-reward.gold");
    expect(chip, "頁面完全沒有畫出「實發」—— 操作者看到的還是設定值").not.toBeNull();
    const text = textOf(chip!.children);
    expect(text).toContain("實發");
    expect(text, "實發不是設定值的一半").toContain("100");
    expect(text, "沒說是哪一格倍率在乘，操作者不知道去哪裡改").toContain(
      COMBAT_ENV_LABELS.goldMobKill.zh,
    );
    // 設定值那個輸入框必須原封不動 —— 存檔存的是它。
    expect(h.field("reward.gold").props["value"]).toBe("200");
  });

  it("讀不到戰鬥系統那張表 → 一個字都不印（寧可不印，也不要印一個猜的）", async () => {
    cover("admin-mob-waves");
    bus.overlayDoc = withRewardGold(200);
    bus.combatEnv = null; // 平台連不上
    const h = await open();
    expect(h.fieldOrNull("effective-reward.gold")).toBeNull();
    // 而且頁面照常能編輯 —— best-effort 不可以把整頁擋掉。
    expect(h.field("reward.gold").props["value"]).toBe("200");
  });

  it("中性 1.0 → 不印（實發等於設定值，多一行只是雜訊）", async () => {
    cover("admin-mob-waves");
    bus.overlayDoc = withRewardGold(200);
    bus.combatEnv = { goldMobKill: 1, goldEliteKill: 1 };
    const h = await open();
    expect(h.fieldOrNull("effective-reward.gold")).toBeNull();
  });

  it("非金錢欄位（每殺一隻給經驗）永遠不會冒出「實發 N 金」", async () => {
    cover("admin-mob-waves");
    bus.overlayDoc = withRewardGold(200);
    bus.combatEnv = { goldMobKill: 0.5, goldEliteKill: 0.5 };
    const h = await open();
    expect(h.fieldOrNull("effective-reward.xp")).toBeNull();
  });

  /**
   * 殭屍王的實發是一個**區間**，而 chip 第一版對它少報了一半（2026-08-04）。
   *
   * ⚠️ 純函式守衛（mobWaves.test.ts）擋不住這一格：`effectiveGold` 可以完全正確，
   * 而 `FieldRow` 忘了把「現在生效的那一份設定」餵給它 —— 那樣它問不到補刀模式，
   * 於是**每一個獎池都退回單一數字**，畫面上看起來跟修好之前一模一樣。所以這一條
   * 掛真的頁面，讀真的節點（失敗形態 ⑤：被測的不是出貨的那個）。
   *
   * ⛔ 端點從送進頁面的那份 doc 推導，一個字面值都不抄。
   */
  it("殭屍王（額外加碼 + 倍率>1）→ 頁面印的是區間，兩端都在", async () => {
    cover("admin-mob-waves");
    const POOL = 1000;
    const MULT = 2; // 這份 fixture 自己設的補刀倍率，不是出貨值
    const FACTOR = 0.5; // 探針倍率
    const doc = LIVE_DOC();
    (doc["mobWaves"] as Record<string, unknown>)["boss"] = {
      bountyGold: POOL,
      lastHitMultiplier: MULT,
      lastHitMode: "bonus",
    };
    bus.overlayDoc = doc;
    bus.combatEnv = { goldMobKill: FACTOR, goldEliteKill: FACTOR };
    const h = await open();

    const chip = h.fieldOrNull("effective-boss.bountyGold");
    expect(chip, "殭屍王獎金池旁邊完全沒有畫出「實發」").not.toBeNull();
    const text = textOf(chip!.children);
    expect(text, "下界（獎池 × 發放倍率）不在畫面上").toContain(String(POOL * FACTOR));
    expect(
      text,
      "上界不在畫面上 —— 頁面又在說「實發就是這個數字」，正是要修的那個缺陷",
    ).toContain(String(POOL * MULT * FACTOR));
    expect(text, "沒說為什麼是區間").toContain("傷害分佈");
  });

  it("同一格切成「權重」（守恆）→ 頁面變回單一數字", async () => {
    cover("admin-mob-waves");
    const POOL = 1000;
    const FACTOR = 0.5;
    const doc = LIVE_DOC();
    (doc["mobWaves"] as Record<string, unknown>)["boss"] = {
      bountyGold: POOL,
      lastHitMultiplier: 2,
      lastHitMode: "weight",
    };
    bus.overlayDoc = doc;
    bus.combatEnv = { goldMobKill: FACTOR, goldEliteKill: FACTOR };
    const h = await open();

    const chip = h.fieldOrNull("effective-boss.bountyGold");
    expect(chip, "守恆模式下連實發都不印了").not.toBeNull();
    const text = textOf(chip!.children);
    expect(text).toContain(String(POOL * FACTOR));
    expect(text, "守恆模式的總額是固定的，不該印成區間").not.toContain("–");
  });
});
