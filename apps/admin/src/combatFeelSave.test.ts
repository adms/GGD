/**
 * 戰鬥手感 —— **存一個新值 → 真的模擬器讀回來 → 行為真的變了**。
 *
 * ── 為什麼這個檔案存在 ──────────────────────────────────────────────────────
 * 昨晚有一條 lane 做了一整頁「商店經濟」，四處落地都寫了，結果存進去的值收費
 * 路徑一輩子讀不到；而頁面讀值時覆蓋層優先，所以操作者重整後看得到自己填的
 * 數字 —— 後台**自我一致地說謊**。`combatFeel.test.ts` 守的是純函式，它對那種
 * 缺陷完全免疫：所有函式都可以是對的，而沒有一個 byte 到得了 sim。
 *
 * 所以這一支從**畫面**開始，一路走到 **SimWorld 的傷害事件**：
 *
 *   1. 掛真的 `CombatFeelPage`（headless React），在真的輸入框上打字
 *   2. 按真的儲存鈕 → 走真的 `putOverlayDoc`（**只** mock 掉 `api.request`），
 *      所以 #283 那個 Zod 閘是真的跑過的
 *   3. 攔下要送上線的那份 JSON，`JSON.parse(JSON.stringify(...))` 過一遍
 *      （模擬它真的在網路與磁碟上來回一趟）
 *   4. 餵給 **`combatFeelFromDoc`** —— 就是 `MatchController` 建構子預設參數裡
 *      的那一支（`apps/game-server/src/match/MatchController.ts` 的
 *      `combatFeel: CombatFeelRules = combatFeelFromDoc(Configs.tryGet(...))`）
 *   5. 把那份規則物件裝進真的 `SimWorld`，跑 400 個 tick，數**傷害事件**
 *
 * ⚠️ 第 5 步數的是傷害事件，不是 `nav.attackTarget` 這種旗標（第⑦種故障：掃屬性
 * 代替掃行為）。旗標在兩種設定下都會是對的；壞掉的是旗標到傷害之間那段路。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { cover } from "@ggd/shared/testkit/cover";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "@ggd/shared/ids";
import { Stat, zeroStats } from "@ggd/shared/sim/stats/statTypes";
import { zeroAttrBonus } from "@ggd/shared/sim/stats/attributes";
import type { AbilitiesComp } from "@ggd/shared/sim/stats/statsComp";
import type { IntentFrame, Order } from "@ggd/shared/sim/intents";
import {
  DEFAULT_COMBAT_FEEL,
  combatFeelFromDoc,
  type CombatFeelRules,
} from "@ggd/shared/sim/combatFeel";
import * as V from "@ggd/shared/sim/math/vec2";
import { api } from "./api";
import { COMBAT_FEEL_DOC_ID, COMBAT_FEEL_SCHEMA } from "./combatFeel";
import { CombatFeelPage } from "./ui/CombatFeelPage";
import { mount } from "./testkit/headlessUi";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

const TAG = "adminui-combat-feel-save";
const SAVE = "儲存 Save";

/** 頁面送出去的每一份文件（PUT 的 body），以及它走的路徑。 */
const puts: { path: string; doc: Record<string, unknown> }[] = [];
let overlayDoc: unknown = null;

beforeEach(() => {
  puts.length = 0;
  overlayDoc = null;
  vi.restoreAllMocks();
  // ⚠️ **只** mock `api.request`。`putOverlayDoc` 本身是真的 —— 它裡面那個
  // `validateOverlayDoc` Zod 閘因此是真的跑過的，一份不合 schema 的文件會在
  // 這裡就被擋掉（而不是被這個 mock 溫柔地收下）。
  vi.spyOn(api, "request").mockImplementation(
    async (path: string, opts?: { method?: string; body?: unknown }): Promise<never> => {
      if (path === "/content-overlay/bundle") {
        return (overlayDoc
          ? { docs: { [`config/${COMBAT_FEEL_DOC_ID}`]: overlayDoc } }
          : { docs: {} }) as never;
      }
      if (path.startsWith("/content-overlay/shipped/")) {
        return { present: false, hash: "", doc: null } as never;
      }
      if (opts?.method === "PUT") {
        puts.push({ path, doc: JSON.parse(JSON.stringify(opts.body)) as Record<string, unknown> });
        return { generation: puts.length } as never;
      }
      return {} as never;
    },
  );
});

async function open(): Promise<ReturnType<typeof mount>> {
  const h = mount(createElement(CombatFeelPage));
  await h.flush();
  return h;
}

// ------------------------------------------------------------ SimWorld ------
//
// 「卡在柱子上」的最小場景，幾何抄自 `sim/autoEngageStalledWalk.test.ts`：
// SKELETON_ARENA zone 0 有一根 r1.8 的柱子在 (-49, 8)。角色從柱子正下方 6 單位
// 出發、走位終點是柱心 —— 身體貼上柱面就再也走不動，而移動指令永遠不會被消耗。
// 敵人在同一條線上 12 單位外：**索敵半徑 6 之外、seekRadius 48 之內**，所以
// 「有沒有打到人」完全由 autoEngage 這張表決定。

const PILLAR = { x: -49, z: 8 };
const NO_INTENTS = new Map<SeatId, IntentFrame>();
/** `Stat.MoveSpeed` 讀到 0 會 falsy-fallback 成預設值，所以「不動」用 epsilon。 */
const IMMOBILE = 1e-9;
const MOVE_TO_PILLAR: Order = { kind: "move", point: { x: PILLAR.x, z: PILLAR.z } };

function spawnFighter(world: SimWorld, seat: number, team: number, pos: V.Vec2, moveSpeed = 5.8): EntityId {
  const id = world.spawn();
  world.transform.set(id, { pos: { ...pos }, vel: V.v2(), facing: { x: 1, z: 0 }, radius: 0.6, zone: 0 });
  world.health.set(id, { hp: 500000, maxHp: 500000, mana: 100, maxMana: 100, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
  world.nav.set(id, { order: null, moveTarget: null, override: null, attackTarget: null, attackTargetAuto: false });
  world.status.set(id, { effects: [] });
  const final = zeroStats();
  final[Stat.MoveSpeed] = moveSpeed;
  final[Stat.AttackRange] = 1.6; // 近戰中位數
  final[Stat.AttackSpeed] = 1;
  final[Stat.AttackDamage] = 5;
  world.stats.set(id, { championId: "probe" as ChampionId, final, dirty: false, sources: [] });
  const slot = (): AbilitiesComp["slots"]["Q"] => ({
    abilityId: "probe.none" as AbilityId,
    rank: 0,
    cooldownRemainingTicks: 0,
  });
  world.abilities.set(id, {
    slots: { Q: slot(), W: slot(), E: slot(), R: slot() } as AbilitiesComp["slots"],
    exSlot: null,
    basicAttackCdTicks: 0,
    unspentPoints: 0,
  });
  world.champion.set(id, {
    championId: "probe" as ChampionId,
    level: 1,
    xp: 0,
    gold: 0,
    items: [],
    augments: [],
    statStacks: 0,
    attrBonus: zeroAttrBonus(),
    statCapstonePct: 0,
    pendingOrbSlots: 0,
    undoStack: [],
  });
  return id;
}

/** 跑 `ticks` 個 tick，回傳「我」打出的普攻傷害事件次數。滑鼠右鍵語意：指令只送一次。 */
function basicHitsWhileStuck(rules: CombatFeelRules, ticks = 400): number {
  const world = new SimWorld(SKELETON_ARENA, 20260730);
  world.combatActive = true;
  world.combatFeel = rules;
  const me = spawnFighter(world, 0, 0, { x: PILLAR.x, z: PILLAR.z - 6 });
  const foe = spawnFighter(world, 1, 1, { x: PILLAR.x, z: PILLAR.z - 18 }, IMMOBILE);
  const foeHp = world.health.get(foe)!;
  let hits = 0;
  for (let i = 0; i < ticks; i++) {
    foeHp.hp = foeHp.maxHp; // 打不死：量的是「有沒有打到」，不是「幾秒打死」
    world.stats.get(foe)!.final[Stat.MoveSpeed] = IMMOBILE;
    const frame = new Map<SeatId, IntentFrame>();
    if (i === 0) frame.set(asSeatId(0), { order: MOVE_TO_PILLAR, commands: [] });
    world.step(i === 0 ? frame : NO_INTENTS);
    for (const e of world.events) {
      const d = e.data as { source?: EntityId; origin?: string };
      if (e.type === "damage" && d.source === me && d.origin === "basic") hits++;
    }
  }
  return hits;
}

// ------------------------------------------------------------- the proof ----

describe("後台存的值 → MatchController 讀的那支讀取器 → SimWorld 的行為", () => {
  it("關掉「卡住就自動接敵」：存檔 → sim 讀回 false → 卡住的角色一整回合打不到人", async () => {
    cover(TAG);

    // 先確認 baseline：出貨設定下，卡在柱子上的角色**會**接敵並打到 12 單位外的人。
    // 沒有這一行的話，下面的 0 可能只是場景本來就打不到，斷言方向和缺陷無關（第④種故障）。
    expect(basicHitsWhileStuck(DEFAULT_COMBAT_FEEL)).toBeGreaterThan(0);

    const h = await open();
    h.type("autoEngage.enabled", "false");
    h.click(SAVE);
    await h.flush();

    // ── 1. 真的送出去了，而且走的是覆蓋層的 PUT 路徑 ──
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe(`/content-overlay/docs/config/${COMBAT_FEEL_DOC_ID}`);
    const wire = puts[0]!.doc;
    expect(wire.schema).toBe(COMBAT_FEEL_SCHEMA);

    // ── 2. 真的消費端把它讀回來，而且值真的變了 ──
    const rules = combatFeelFromDoc(wire);
    expect(rules.autoEngage!.enabled).toBe(false);
    // 其他三張表原封不動地跟著寫出去 —— 沒有被順手清成預設或空表
    expect(rules.knockback).toEqual(DEFAULT_COMBAT_FEEL.knockback);
    expect(rules.standstill).toEqual(DEFAULT_COMBAT_FEEL.standstill);
    expect(rules.facing).toEqual(DEFAULT_COMBAT_FEEL.facing);

    // ── 3. SimWorld 用它跑出**不同的行為** ──
    expect(basicHitsWhileStuck(rules)).toBe(0);
  });

  it("把「卡住判定」從 30 tick 調到 599：數字本身也走得到 sim（不只是布林）", async () => {
    cover(TAG);
    const h = await open();
    // 599 tick ≈ 20 秒 > 這次跑的 400 tick，所以「卡住」永遠達不到門檻。
    h.type("autoEngage.stallTicks", "599");
    h.click(SAVE);
    await h.flush();

    const rules = combatFeelFromDoc(puts[0]!.doc);
    expect(rules.autoEngage!.stallTicks).toBe(599);
    expect(rules.autoEngage!.enabled).toBe(true); // 開關沒被動到
    expect(basicHitsWhileStuck(rules)).toBe(0);
  });

  it("擊退門檻存下去之後，sim 讀回來就是新的門檻", async () => {
    cover(TAG);
    const h = await open();
    h.type("knockback.minPct", "0.5");
    h.type("knockback.maxBodies", "3");
    h.click(SAVE);
    await h.flush();

    const rules = combatFeelFromDoc(puts[0]!.doc);
    expect(rules.knockback.minPct).toBe(0.5);
    expect(rules.knockback.maxBodies).toBe(3);
    expect(rules.knockback.bodyUnit).toBe(DEFAULT_COMBAT_FEEL.knockback.bodyUnit);
  });
});

describe("這一頁不會說謊", () => {
  it("超出範圍時儲存鈕是關的 —— 存不出一個 sim 會靜默夾掉的數字", async () => {
    cover(TAG);
    const h = await open();
    h.type("autoEngage.seekRadius", "4800"); // schema 上界 200
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(puts).toHaveLength(0);
    expect(h.text()).toContain("不能大於 200");
  });

  it("沒有任何編輯時儲存鈕是關的", async () => {
    cover(TAG);
    const h = await open();
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(puts).toHaveLength(0);
  });

  it("已存在的覆蓋層值會被讀進畫面 —— 而且是 sim 夾限後的那個值", async () => {
    cover(TAG);
    overlayDoc = {
      id: COMBAT_FEEL_DOC_ID,
      schema: COMBAT_FEEL_SCHEMA,
      autoEngage: {
        enabled: false,
        stallTicks: 45,
        stallSpeed: 0.5,
        // 一份手改壞的舊文件：sim 會夾成 200，畫面就必須顯示 200。
        seekRadius: 4800,
        respectLiveSteering: true,
        ccPausesStall: true,
      },
    };
    const h = await open();
    expect(h.field("autoEngage.enabled").props["value"]).toBe("false");
    expect(h.field("autoEngage.stallTicks").props["value"]).toBe("45");
    expect(h.field("autoEngage.seekRadius").props["value"]).toBe("200");
  });

  it("畫面上必須寫著「要重啟 shard」，不可以寫「下一場生效」", async () => {
    cover(TAG);
    // `MatchController` 的 combatFeel 走的是 `Configs.tryGet(...)`，而 `Configs`
    // 是 game-server **開機時**灌進去的；`MatchRoom` 沒有覆寫它，也沒有任何路徑
    // 會在開賽時重抓覆蓋層。寫「下一場生效」= #278 的形狀。
    const h = await open();
    expect(h.text()).toContain("重啟");
    expect(h.text()).not.toContain("下一場就生效」");
    expect(h.text()).not.toContain("從下一場開始生效");
  });

  it("每一個決策點在畫面上都看得到「為什麼預設是這一邊」", async () => {
    cover(TAG);
    const h = await open();
    const text = h.text();
    expect(text).toContain("決策點");
    expect(text).toContain("86.6%"); // respectLiveSteering 關掉的實測代價
    expect(text).toContain("47 支"); // ccPausesStall 關掉會誤判的硬控數量
    expect(text).toContain("2,240"); // autoEngage 關掉時量到的卡死 tick 數
  });
});
