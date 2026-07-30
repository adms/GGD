/**
 * 護盾規則 (`config.shield@1`) —— 後台存一個值 → 真的 sim 真的吸得不一樣。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼要多這一支（`sim/effects/shieldAbsorb.test.ts` 已經很完整了）
 * ════════════════════════════════════════════════════════════════════════════
 * 那一支證明的是「`world.shieldRules.absorbOrder` 這個**欄位**被傷害迴圈讀了」
 * —— 它自己捏一份文件、自己指派 `r.world.shieldRules = { absorbOrder }`。
 * 在這一輪之前，那條鏈的兩端各缺一塊，而且缺得完全看不出來：
 *
 *   · `content/config/shield.json` **不存在**。整棵 content 樹沒有任何一份
 *     `config.shield@1` 文件（`fieldAdoption.test.ts` 就是這樣抓到它的：
 *     variant 有供給、零需求）。機制在跑、預設值在生效，但操作者**沒有東西可改**。
 *   · 後台**沒有這一頁**。要動這個決策點只能編 repo → rebuild → 重開容器。
 *
 * 所以這一支釘的是那兩塊，而且是端到端釘：**操作者在真的表單上改一格 → 按真的
 * 儲存鈕 → 攔下真的 `putOverlayDoc` 送出的那份文件 → 把那份文件餵進真的
 * `SimWorld`，跑真的 `step()`，讀真的 `health.shields`**。中間沒有任何一段是
 * 測試自己重寫的。
 *
 * 對照 CLAUDE.md 的七種失敗形態：
 *   ② 算出來但從沒送到 → 這裡斷言的是 `putOverlayDoc` 真的收到的物件；
 *   ⑤ 被測的不是出貨的那個 → 基底文件是 `content/config/shield.json` 本人；
 *   ⑦ 掃屬性代替掃行為 → 斷言讀的是打完之後**哪一種盾**還剩多少，不是
 *     「doc.absorbOrder === 'generalFirst'」。
 *
 * ⚠️ 剩餘量寫成 `"<absorbs>:<amount>"` 而不是純數字，理由和 shieldAbsorb.test.ts
 * 同一個：specificFirst 與 insertionOrder 在很多盤面上會留下**相同的數字集合**，
 * 只是留在不同的池子上。只看數字的斷言會把兩條不同的規則當成一樣。
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { ConfigDocPage } from "./ui/ConfigDocPage";
import { specForPage } from "./configForms";
import { pageRequiresSession } from "./store";
import { mount, textOf, type Harness } from "./testkit/headlessUi";

// ── 真的消費端。這幾支就是 game-server 載進去、每一發傷害都會跑的那些模組本人。
import { zConfigShieldDoc } from "@ggd/shared/content";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { SHIELD_DOC_ID, SHIELD_SCHEMA, shieldRulesFromDoc } from "@ggd/shared/sim/shieldRules";
import type { EffectContext, EffectDef } from "@ggd/shared/sim/effects/effect";
import type { ShieldAbsorb } from "@ggd/shared/sim/components";
import { asSeatId, asTeamId, type EntityId, type SeatId } from "@ggd/shared/ids";
import type { IntentFrame } from "@ggd/shared/sim/intents";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** 出貨文件本人 —— 不是測試捏的夾具（失敗形態 ⑤）。 */
function shippedShieldDoc(): Record<string, unknown> {
  return JSON.parse(readFileSync(`${REPO}content/config/shield.json`, "utf8")) as Record<
    string,
    unknown
  >;
}

// ───────────────────────────────────────────────────────── 後台頁的替身 ────

const bus = vi.hoisted(() => ({
  puts: [] as Array<{ collection: string; id: string; doc: Record<string, unknown> }>,
  overlayDoc: null as unknown,
  shipped: { present: false, hash: "", doc: null as unknown },
  generation: 0,
}));

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
    getShippedDoc: async (): Promise<{ present: boolean; hash: string; doc: unknown }> =>
      bus.shipped,
    putOverlayDoc: async (
      collection: string,
      id: string,
      doc: Record<string, unknown>,
    ): Promise<{ generation: number }> => {
      bus.puts.push({
        collection,
        id,
        doc: JSON.parse(JSON.stringify(doc)) as Record<string, unknown>,
      });
      return { generation: ++bus.generation };
    },
  };
});

const SAVE = "儲存 Save";

beforeAll(() => registerSkeletonContent());

beforeEach(() => {
  bus.puts.length = 0;
  bus.generation = 0;
  bus.overlayDoc = null;
  bus.shipped = { present: false, hash: "", doc: null };
});

/** 掛上 護盾規則 頁，基底 = 出貨文件本人。 */
async function openShieldPage(): Promise<Harness> {
  const spec = specForPage("shieldRules")!;
  bus.shipped = { present: true, hash: "deadbeef", doc: shippedShieldDoc() };
  const h = mount(createElement(ConfigDocPage, { spec }));
  await h.flush();
  return h;
}

function saveEnabled(h: Harness): boolean {
  const btn = h.hosts().find((n) => n.type === "button" && textOf(n.children).trim() === SAVE);
  if (!btn) throw new Error("頁面上沒有儲存鈕");
  return btn.props["disabled"] !== true;
}

// ──────────────────────────────────────────────────────────── 真的 sim ─────

const NO_INTENTS: ReadonlyMap<SeatId, IntentFrame> = new Map();
const Z0 = SKELETON_ARENA.zones[0]!;
const LANE_Z = Z0.center.z + 14; // 無柱子帶，和 shieldAbsorb.test.ts 同一條

interface Rig {
  world: SimWorld;
  caster: EntityId;
  target: EntityId;
}

/**
 * 兩具身體，受害者刻意**沒有** `StatsComp`：`mitigate()` 因此找不到護甲／魔抗，
 * 傷害原封不動走到護盾那一層，於是底下每一個數字都是精確的，任何差異只可能來自
 * 消耗順序本身。
 */
function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 20260730);
  const spawn = (x: number, seat: number, team: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: LANE_Z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.6,
      zone: 0,
    });
    world.health.set(id, { hp: 5000, maxHp: 5000, mana: 400, maxMana: 400, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    return id;
  };
  const caster = spawn(Z0.center.x, 0, 0);
  const target = spawn(Z0.center.x + 3, 1, 1);
  world.rebuildGrid();
  return { world, caster, target };
}

function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.target],
    point: { x: Z0.center.x + 3, z: LANE_Z },
    origin: "ability:test.shield-admin",
    rng: r.world.rng,
  };
}

/** 走**出貨的** effect 路徑上一個盾（不是直接塞進 `health.shields`）。 */
function castShield(r: Rig, amount: number, absorbs?: ShieldAbsorb): void {
  const eff: EffectDef =
    absorbs === undefined
      ? { kind: "shield", amount: { flat: amount }, duration: 5 }
      : { kind: "shield", amount: { flat: amount }, duration: 5, absorbs };
  runEffects([eff], ctxOf(r));
}

interface Board {
  /** 受害者這一 tick 真的掉了多少 HP。 */
  hpLoss: number;
  /** 活下來的池子，`"<absorbs>:<amount>"`，照 `health.shields` 的順序。 */
  survivors: string[];
}

/**
 * 一份 `config.shield@1` 文件 → 一場真的戰鬥 → 打完之後的盤面。
 *
 * 盤面（依上盾先後）：A=全類型 100 · M=只吸魔法 80 · B=全類型 60，吃一發魔法 150。
 * 三種順序在這個盤面上兩兩不同 —— 這是 shieldAbsorb.test.ts 挑出來的那一盤，
 * 沿用它才不會寫出一個對兩種規則都會過的斷言（失敗形態 ④）。
 */
function boardUnder(doc: unknown): Board {
  const r = rig();
  // ⚠️ 這一行就是 game-server 的 MatchController 在 tick 0 之前做的事：
  // `shieldRulesFromDoc(Configs.tryGet("shield"))` → `world.shieldRules`。
  r.world.shieldRules = shieldRulesFromDoc(doc);
  castShield(r, 100); // A
  castShield(r, 80, "magic"); // M
  castShield(r, 60); // B
  const hp = r.world.health.get(r.target)!;
  const before = hp.hp;
  r.world.damageQueue.push({
    source: r.caster,
    target: r.target,
    amount: 150,
    type: "magic",
    crit: false,
    origin: "ability:test.shield-admin",
  });
  r.world.step(NO_INTENTS);
  return {
    hpLoss: before - hp.hp,
    survivors: hp.shields.map((s) => `${s.absorbs ?? "all"}:${s.amount.toFixed(3)}`),
  };
}

/* ═════════════════════════════════════════════════════════════════════════ */

describe("護盾規則：出貨文件真的在開車 (adminui-shield-rules-shipped)", () => {
  it("content/config/shield.json 存在、合 schema、id 就是 sim 去查的那個 key", () => {
    cover("adminui-shield-rules-shipped");
    const doc = shippedShieldDoc();
    // sim 端用 `Configs.tryGet(SHIELD_DOC_ID)` 去查；文件 id 對不上就等於沒出貨，
    // 而症狀是「檔案明明在 repo 裡，遊戲卻永遠吃預設值」。
    expect(doc["id"]).toBe(SHIELD_DOC_ID);
    expect(doc["schema"]).toBe(SHIELD_SCHEMA);
    expect(zConfigShieldDoc.safeParse(doc).success).toBe(true);
  });

  it("出貨文件驅動一場真的戰鬥：護盾真的吃掉整發傷害，專用盾先被燒掉", () => {
    cover("adminui-shield-rules-shipped");
    const shipped = boardUnder(shippedShieldDoc());

    // 護盾真的吸收了 —— 150 點魔法傷害一點都沒進 HP。
    expect(shipped.hpLoss).toBe(0);
    // 出貨值 specificFirst：只吸魔法的 M(80) 先付，不夠的部分由最舊的全類型盾 A
    // 補上，所以活下來的是被扣過的 A 和完好的 B，而 M 整個消失。
    // （combat-env 的 damageDealt / shield 兩個全域倍率都是 1.0 時的精確值；
    //  倍率一改這裡會紅，那是對的：它就是要說「盤面變了」。）
    expect(shipped.survivors).toEqual(["all:30.000", "all:60.000"]);
  });

  it("護盾**沒有**吃下去的傷害會進 HP —— 這條斷言不是恆真的", () => {
    cover("adminui-shield-rules-shipped");
    // 沒有任何盾的同一個盤面：150 點全額落地。少了這一條，上面那個 hpLoss === 0
    // 有可能只是因為傷害根本沒送出去（失敗形態 ④：斷言方向跟缺陷無關）。
    const r = rig();
    const hp = r.world.health.get(r.target)!;
    const before = hp.hp;
    r.world.damageQueue.push({
      source: r.caster,
      target: r.target,
      amount: 150,
      type: "magic",
      crit: false,
      origin: "ability:test.shield-admin",
    });
    r.world.step(NO_INTENTS);
    expect(before - hp.hp).toBeGreaterThan(0);
  });
});

describe("護盾規則：後台改一格，sim 的吸收結果就變 (adminui-shield-rules-save)", () => {
  it("在真的表單上改成 generalFirst → 送出的那份文件讓泛用盾先付，抗魔盾留在場上", async () => {
    cover("adminui-shield-rules-save");
    const h = await openShieldPage();

    // 改之前（＝出貨值）的盤面，當作對照組。
    const before = boardUnder(shippedShieldDoc());

    h.type("absorbOrder", "generalFirst");
    expect(saveEnabled(h)).toBe(true);
    h.click(SAVE);
    await h.flush();

    expect(bus.puts).toHaveLength(1);
    const sent = bus.puts[0]!;
    expect(sent.collection).toBe("config");
    expect(sent.id).toBe(SHIELD_DOC_ID);

    // ⚠️ 餵進 sim 的是**平台真的收到的那份文件**，不是測試手寫的 { absorbOrder }。
    const after = boardUnder(sent.doc);

    expect(after.hpLoss).toBe(0);
    // generalFirst：兩道全類型盾先付（A 的 100 全付、B 再付 50），只吸魔法的
    // M(80) 一點都沒被動到 —— 這正是「先打掉泛用盾、逼出抗魔盾」那個節奏。
    expect(after.survivors).toEqual(["magic:80.000", "all:10.000"]);
    // 而且它和出貨盤面**不一樣** —— 這一行就是「後台這一格真的會改變吸收量」。
    expect(after.survivors).not.toEqual(before.survivors);
  });

  it("insertionOrder 又是第三種盤面 —— 三個選項不是兩個選項加一個裝飾", async () => {
    cover("adminui-shield-rules-save");
    const h = await openShieldPage();
    h.type("absorbOrder", "insertionOrder");
    h.click(SAVE);
    await h.flush();

    const board = boardUnder(bus.puts[0]!.doc);

    // 不看屬性、舊的先花：A(100) 全付，剩下的 50 落在下一個能吃的池子 M 上。
    expect(board.survivors).toEqual(["magic:30.000", "all:60.000"]);
    // 和 specificFirst 的 ["all:30.000","all:60.000"] 數字集合相同、池子不同 ——
    // 只讀數字的斷言會把這兩條規則當成一樣（失敗形態 ⑦）。
    expect(board.survivors.map((s) => s.split(":")[1])).toEqual(["30.000", "60.000"]);
  });

  it("送出的是**整份**文件：id / schema / note 都還在，平台那一關過得了", async () => {
    cover("adminui-shield-rules-save");
    const h = await openShieldPage();
    h.type("absorbOrder", "generalFirst");
    h.click(SAVE);
    await h.flush();

    const sent = bus.puts[0]!.doc;
    // 只送 { absorbOrder } 的話，`zConfigShieldDoc` 會拒絕（缺 id / schema），
    // 而操作者看到的是「✓ 已寫入」然後遊戲一輩子讀不到 —— 失敗形態 ②。
    expect(zConfigShieldDoc.safeParse(sent).success).toBe(true);
    expect(sent["id"]).toBe(SHIELD_DOC_ID);
    expect(sent["schema"]).toBe(SHIELD_SCHEMA);
    // `note` 是這一頁不編輯的欄位（DOC_META_PATHS），但它必須原封不動被帶走：
    // 那段字寫著「覆蓋層會蓋掉 content/ 的檔案」，掉了下一個操作者就不知道。
    expect(String(sent["note"] ?? "")).toContain("覆蓋層");
  });

  it("這一頁真的掛進 console —— 有導覽列一列，而且需要 session", () => {
    cover("adminui-shield-rules-save");
    // ⚠️ 一份 spec 進了 CONFIG_DOC_SPECS 但沒有導覽列那一列 = 操作者永遠找不到它。
    // `configPagesRegistered.test.ts` 只釘 戰鬥手感 / 對戰設定 兩頁（那兩頁各有
    // 自己的元件與路由），schema 驅動的這一批共用 `configDocSpec !== null` 那一行，
    // 所以「路由」不會少，會少的是**導覽列**。這一條就是釘那個。
    //
    // 這是原始碼掃描（失敗形態 ⑥），誠實地只宣稱它擋得住「忘了接線」；它證明不了
    // rollup 沒有把那一列 dead-fold 掉。
    const app = readFileSync(`${REPO}apps/admin/src/ui/App.tsx`, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(app).toContain(`page: "shieldRules", label: "護盾規則"`);
    // 儲存走 `putOverlayDoc`，沒有 session 一律 401 —— 少了 gate，登出的操作者會
    // 看到一頁可以編輯的表單，改完才發現從頭到尾沒有可以寫入的 session。
    expect(pageRequiresSession("shieldRules")).toBe(true);
    expect(pageRequiresSession("hub")).toBe(false); // 對照組：不是「永遠回 true」
  });

  it("認不得的順序退回出貨預設，不會讓護盾整批靜默失效", () => {
    cover("adminui-shield-rules-save");
    // 覆蓋層被人手動編壞（打錯字）時，`absorbOrder()` 若拿到 undefined 會一個池子
    // 都不回傳 → 遊戲照跑、盾照上、數字照顯示，就是一點傷害都擋不掉。
    const broken = boardUnder({ id: "shield", schema: SHIELD_SCHEMA, absorbOrder: "specificFrist" });
    expect(broken.hpLoss).toBe(0);
    expect(broken.survivors).toEqual(boardUnder(shippedShieldDoc()).survivors);
  });
});
