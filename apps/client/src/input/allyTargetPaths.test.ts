// @vitest-environment jsdom
/**
 * ⭐ GH#722 —— **友方指定技能按下去要真的送得出去**（接手 #280 · #283）。
 *
 * 基線（2026-08-30 動手前跑出來的，⛔ 不是複述票文）：出貨內容裡
 * `castType:"targeted"` + `targetsEnemies:false` 的技能有 **4 支**
 * （⚠️ 票文寫 5 支 —— 第 5 支 `godie-e007.w` 今天是 `castType:"self"`，
 * 它根本不需要目標 ⇒ ⛔ 它不是這張票的受害者）。四支在三條客戶端輸入路徑上
 * **全部零反應**：唯一的候選清單 `GameApp.enemyUnitsFor` 逐字把隊友剔掉
 * （`if ((teamBySeat.get(es.seatId) ?? -1) === myTeam) return;`），
 * ⇒ `resolveCastTarget` 的 `targeted` 分支永遠拿到 null ⇒ 一筆 command 都不送。
 *
 * ⭐ **這一支走的是真的輸入路徑**，⛔ 不是手刻一個 ally 餵進 `castAbility` ——
 * 那正是 `castabilitySweep.test.ts` 做的事（它的 `targetFor()` 直接
 * `return { type:"entity", entityId: ally }`），所以那張全綠的普查表**證明不了**
 * 這張票（#283）。這裡按的是出貨的鍵盤 / 觸控 / 手把，讀的是出貨的 intent 通道。
 *
 * ⭐ **候選來源也是活的**：三條路徑都**沒有**在 deps/ctx 裡接 ally 來源 ——
 * 它們走各自模組自己補上的出貨預設（`input/allyTargets` → `frameBus.champions`），
 * 也就是 `GameApp` 一行都不用改就已經接上的那一條。
 * ⇒ ⛔ 這不是一個等著別人來填的空欄位（失敗形態⑧）。
 *
 * ⚠️ 自動索敵（觸控／手把）的一個**量出來的**取捨也釘在這裡：自己與自己的距離
 * 永遠是 0 ⇒ 若不讓路，那兩條路徑**一次都碰不到隊友**（第一版就是這樣紅的）。
 * ⇒ 走既有的 `PickableUnit.priority`（滑鼠直接點刻意不讀它）⇒ 點自己仍然是自己。
 *
 * 突變紀錄見檔尾。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONTROLLER_SCHEME } from "@ggd/shared/content";
import type { Command, Order } from "@ggd/shared/sim/intents";
import { frameBus } from "../frameBus";
import { hudStore, resetHudStore } from "../net/RoomStore";
import type { AimAbility } from "./AimResolver";
import { padActionTable } from "./controllerBindings";
import { GamepadSystem, MultiGamepadSystem, type PadState } from "./GamepadInput";
import { InputCapture } from "./InputCapture";
import { TouchController } from "./TouchInput";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** 出貨內容裡的友方指定技能 —— ⛔ 不是手寫的夾具，讀的是真的那 4 份文件。 */
const ALLY_TARGETED = ["godie-o02p.ex", "godie-o02p.w", "godie-n01c.q", "godie-nbbc.q"] as const;

function shippedAbility(id: string): AimAbility {
  const doc = JSON.parse(
    readFileSync(join(ROOT, "content", "abilities", `${id}.json`), "utf8"),
  ) as { castType: AimAbility["castType"]; range: number; targetsEnemies?: boolean };
  return { castType: doc.castType, range: doc.range, targetsEnemies: doc.targetsEnemies };
}

// 場面：我 (1) 在原點，隊友 (2) 在 +3，敵人 (3) 在 -3。
// ⭐ 治療花 (4) 擺在**比隊友更近**的 2.9 —— 中立單位若漏進友方清單，
//    「最近的」那一支挑選（觸控/手把）就會挑中它 ⇒ 這條斷言會抓到。
const ME = 1, ALLY = 2, FOE = 3, FLOWER = 4;
const ALLY_AT = { x: 3, z: 0 };
// 併機同樂那一批：1P 在原點、2P 在 +6、2P 的隊友在 +4（**在 2P 身後**）。
// ⚠️ 隊友擺身後是刻意的：`pickNearestUnit` 對瞄準方向有 ±2.5 的偏壓，而
//    `mapGamepadFrame` 沒有搖桿時會退回 `facing`（永遠有方向）⇒ 把隊友擺在
//    正前方時，那 2.5 分**自己就會**蓋過「自己讓路」的缺席 ⇒ 守衛靠夾具才綠（形態⑩）。
const P1 = ME, P2 = 5, P2_MATE = 6;
const P2_AT = { x: 6, z: 0 };

function anchor(entityId: number, teamId: number, isLocal: boolean, worldX: number): void {
  frameBus.champions.set(entityId, {
    entityId, name: `#${entityId}`, teamId, championId: "", isLocal,
    alive: true, hpPct: 1, shieldPct: 0, manaPct: 1,
    worldX, worldZ: 0, pose: { sx: 0, sy: 0, visible: false }, cast: null,
  });
}

let commands: Command[], orders: Order[], ability: AimAbility;

beforeEach(() => {
  commands = [];
  orders = [];
  ability = shippedAbility("godie-o02p.w");
  frameBus.champions.clear();
  anchor(ME, 0, true, 0);
  anchor(ALLY, 0, false, ALLY_AT.x);
  anchor(FOE, 1, false, -3);
  anchor(FLOWER, -1, false, 2.9); // 中立帶 teamId -1（frameBusProjection 的規則）
});
afterEach(() => frameBus.champions.clear());

/** 這一筆 command 是不是「鎖住隊友的那一發」。 */
const castOn = (slot: string, entityId: number): Command =>
  ({ kind: "castAbility", slot, target: { type: "entity", entityId } }) as Command;

describe("GH#722 出貨的 4 支友方指定技能：三條輸入路徑都送得出友方目標", () => {
  it("⭐ 基線前提：那 4 份出貨文件今天真的是 targeted + targetsEnemies:false", () => {
    for (const id of ALLY_TARGETED) {
      const a = shippedAbility(id);
      expect(a.castType, `${id} 不再是 targeted —— 這張票的受害者名單過期了`).toBe("targeted");
      expect(a.targetsEnemies, `${id} 不再是友方技能`).toBe(false);
    }
    // ⚠️ 票文的第 5 支：它是 self，⛔ 不需要目標 ⇒ 不是受害者。
    expect(shippedAbility("godie-e007.w").castType).toBe("self");
  });

  it("⭐ 滑鼠／鍵盤 quick-cast：游標放在隊友身上按 W → 出貨 intent 通道收到鎖住隊友的一發", () => {
    const el = document.body.appendChild(document.createElement("div"));
    const capture = new InputCapture(el, {
      screenToGround: () => ALLY_AT,
      getSelfPos: () => ({ x: 0, z: 0 }),
      getAbility: () => ability,
      pickEnemy: () => null, // 隊友不在敵方清單裡 —— 這正是缺陷的形狀
      pickSelf: () => false,
      // ⛔ 刻意不接 pickAlly：走出貨預設（allyTargets → frameBus）
      onOrder: (o) => orders.push(o),
      onCommand: (c) => commands.push(c),
      onSelectSelf: () => {}, onZoom: () => {}, onToggleFollow: () => {},
    });
    capture.attach();
    el.dispatchEvent(new MouseEvent("pointermove", { clientX: 10, clientY: 10 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(commands, "按下去零反應 —— 沒有任何 castAbility 送出").toEqual([castOn("W", ALLY)]);

    // AC2 —— ⛔ 打開友方那條路**不可以**讓右鍵／普攻指得到隊友（GH#160 的形狀）。
    commands.length = 0;
    el.dispatchEvent(new MouseEvent("contextmenu", { clientX: 10, clientY: 10 }));
    expect(orders.at(-1), "右鍵在隊友身上變成了攻擊指令 —— 那是友軍傷害").toEqual({
      kind: "move", point: ALLY_AT,
    });
    capture.dispose();
    el.remove();
  });

  it("⭐ 觸控 tap quick-cast：出貨的 TouchController（ctx ⛔ 沒接 allyUnits）送得出隊友", () => {
    const ctrl = new TouchController({
      ctx: () => ({
        selfPos: { x: 0, z: 0 },
        facing: { x: 1, z: 0 },
        ability: () => ability,
        enemyUnits: () => [], // 隊友從來不在這裡面
      }),
      onOrder: (o) => orders.push(o),
      onCommand: (c) => commands.push(c),
      isJoystickArea: () => false,
    });
    ctrl.buttonTouchStart("W", { identifier: 7, clientX: 200, clientY: 200 });
    ctrl.touchEnd({ changedTouches: [{ identifier: 7, clientX: 200, clientY: 200 }] });
    expect(commands, "觸控按下去零反應（或挑到了治療花）").toEqual([castOn("W", ALLY)]);
  });

  it("⭐ 手把：出貨的 GamepadSystem（ctxProvider ⛔ 沒接 nearestAlly）送得出隊友", () => {
    const slotButton = [...padActionTable(DEFAULT_CONTROLLER_SCHEME).slotByButton].find(
      ([, s]) => s === "W",
    )?.[0];
    expect(slotButton, "出貨方案沒有 W 的按鈕").toBeTypeOf("number");
    const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === slotButton }));
    const pad: PadState = { connected: true, axes: [0, 0, 1, 0], buttons };
    const sys = new GamepadSystem(
      { onOrder: (o) => orders.push(o), onAim: () => {}, onCommand: (c) => commands.push(c),
        onPadsChanged: () => {} },
      () => ({
        selfPos: { x: 0, z: 0 },
        facing: { x: 1, z: 0 },
        ability: () => ability,
        nearestEnemy: () => null,
        skillPoints: 0,
      }),
      () => [pad],
    );
    sys.poll();
    expect(commands, "手把按下去零反應（或挑到了治療花）").toEqual([castOn("W", ALLY)]);
  });

  it("⭐ 自己讓路給隊友，但沒有隊友時自己仍然放得出去（扣分，⛔ 不是過濾）", () => {
    frameBus.champions.delete(ALLY); // 場上只剩我跟敵人跟花
    const ctrl = new TouchController({
      ctx: () => ({ selfPos: { x: 0, z: 0 }, facing: { x: 1, z: 0 },
        ability: () => ability, enemyUnits: () => [] }),
      onOrder: () => {}, onCommand: (c) => commands.push(c), isJoystickArea: () => false,
    });
    ctrl.buttonTouchStart("W", { identifier: 8, clientX: 200, clientY: 200 });
    ctrl.touchEnd({ changedTouches: [{ identifier: 8, clientX: 200, clientY: 200 }] });
    expect(commands, "沒有隊友時自己也被排除了 —— 那條讓路寫成了過濾").toEqual([
      castOn("W", ME),
    ]);
  });

  it("⭐ 敵方技能一格都不受影響 —— 側別是照 targetsEnemies 分的，⛔ 不是無條件合併", () => {
    ability = { castType: "targeted", range: 12, targetsEnemies: true };
    const el = document.body.appendChild(document.createElement("div"));
    const capture = new InputCapture(el, {
      screenToGround: () => ALLY_AT,
      getSelfPos: () => ({ x: 0, z: 0 }),
      getAbility: () => ability,
      pickEnemy: () => null,
      pickSelf: () => false,
      onOrder: () => {}, onCommand: (c) => commands.push(c),
      onSelectSelf: () => {}, onZoom: () => {}, onToggleFollow: () => {},
    });
    capture.attach();
    el.dispatchEvent(new MouseEvent("pointermove", { clientX: 10, clientY: 10 }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    expect(commands, "敵方指定技能挑到了隊友 —— 那會讓治療打到敵人／普攻打隊友").toEqual([]);
    capture.dispose();
    el.remove();
  });
});

/**
 * 突變紀錄（承重的一條，2026-08-30 真的跑過）：
 * `AimResolver.resolveCastTarget` 的
 *   `const hovered = aimsAtAllies(ability) ? ctx.hoveredAllyId : ctx.hoveredEntityId;`
 * 改回 `const hovered = ctx.hoveredEntityId;`
 * → **三條路徑的三條斷言同時紅**（收到 `[]`，也就是這張票的基線行為）。
 * ⭐ 那一行在三個夾具下都真的被執行到（castType 全是 `targeted`）。
 *
 * ⭐ 併機同樂那兩條的**基線是跑出來的**（2026-08-30，⛔ 不是突變）——
 * 在 `allyTargets` 還讀 `isLocal` 的那一版上，這兩條就是紅的，而且紅得**很具體**：
 *   ① 自己讓路：2P 收到 `entityId 5`（**它自己**）而不是 6 ⇒「只治療得到自己」
 *   ② 隊伍：2P 收到 `entityId 3`（**敵人**）而不是 6 ⇒ 伺服器 `bad-target`
 * ⇒ 這兩個數字就是「作者說他量到並修好的那一個缺陷，在這條路徑上原封不動」的樣子。
 */

// ---------------------------------------------------------------------------
// ⭐ 併機同樂（couch）—— 第 2..4 位本機玩家
// ---------------------------------------------------------------------------
/**
 * ⚠️ ⭐ 上面那一批**全部只驗得到 1P**。`frameBus` 的 `isLocal` 逐字是
 * 「`es.id === hudStore.localEntityId`」（`GameApp.ts` 的錨點迴圈）——
 * ⇒ **一場併機同樂裡它永遠只有 1P 那一具是 true**。
 *
 * 於是側別修好之後，couch 的第 2..4 位仍然拿到 **1P 的答案**，兩個地方各壞一次：
 *   ① **自己讓路那一格**（`priority`）記的是 1P，⛔ 不是**這一發的施法者**
 *      ⇒ 2P 與自己的距離永遠 0 而且沒被扣分 ⇒ **2P 只治療得到自己，一次都碰不到隊友**
 *      ⭐ 那正是作者說他「量到並修好」的那一個缺陷，在這條路徑上原封不動。
 *   ② **隊伍**取的是 1P 的隊伍 ⇒ 2P 站在另一隊時，候選清單整份是**敵隊**
 *      ⇒ 送出去的那一發鎖著敵人 ⇒ 伺服器 `bad-target`（`abilitySystem` 友方分支）。
 *
 * ⇒ 修法是**一個**機制：側別已經只有一個住處，**施法者**也要只有一個住處
 *   （`allyTargets.casterOf(player)`），而三條路徑各自說出自己是第幾位玩家。
 */
describe("GH#722 併機同樂：第 2 位本機玩家（couch）", () => {
  /** 2P 的錨點與 HUD 投影；`teamOf2P` 讓「隊伍取錯人」那一條可以被分開驗。 */
  function seatCouch2P(teamOf2P: number): void {
    frameBus.champions.clear();
    anchor(P1, 0, true, 0); // 1P（isLocal）在原點
    anchor(P2, teamOf2P, false, P2_AT.x); // 2P 在 +6
    anchor(P2_MATE, teamOf2P, false, 4); // 2P 的隊友在 +4（在 2P 身後 2 格）
    anchor(FOE, teamOf2P === 0 ? 1 : 0, false, -3);
    hudStore.setState({
      localPlayers: [
        { player: 0, accountId: "a", seatId: 0, entityId: P1, teamId: 0,
          displayName: "1P", hp: 1, maxHp: 1, mana: 0, maxMana: 0, shield: 0 },
        { player: 1, accountId: "a:p2", seatId: 1, entityId: P2, teamId: teamOf2P,
          displayName: "2P", hp: 1, maxHp: 1, mana: 0, maxMana: 0, shield: 0 },
      ],
    });
  }

  /** 出貨的 `MultiGamepadSystem`：兩支手把，第 2 支按 W。 */
  function press2P(): Command[] {
    const slotButton = [...padActionTable(DEFAULT_CONTROLLER_SCHEME).slotByButton].find(
      ([, s]) => s === "W",
    )?.[0];
    const idle: PadState = {
      connected: true, axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
    };
    const pressed: PadState = {
      connected: true, axes: [0, 0, 1, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === slotButton })),
    };
    const out: Command[] = [];
    const sys = new MultiGamepadSystem(
      () => 2,
      { onOrder: () => {}, onAim: () => {},
        onCommand: (p, c) => { if (p === 1) out.push(c); },
        onPadsChanged: () => {} },
      (player) => ({
        selfPos: player === 1 ? P2_AT : { x: 0, z: 0 },
        facing: { x: 1, z: 0 },
        ability: () => ability,
        nearestEnemy: () => null,
        skillPoints: 0,
      }),
      () => [idle, pressed],
    );
    sys.poll();
    return out;
  }

  afterEach(() => resetHudStore());

  it("⭐ 2P 按下友方技能 → 鎖住的是 2P 的隊友，⛔ 不是 2P 自己（讓路那一格記的是施法者）", () => {
    seatCouch2P(0);
    expect(press2P(), "2P 只治療得到自己 —— 讓路那一格記的是 1P，⛔ 不是這一發的施法者")
      .toEqual([castOn("W", P2_MATE)]);
  });

  it("⭐ 2P 站在另一隊時，候選清單是 2P 的隊伍，⛔ 不是 1P 的（否則整份是敵隊）", () => {
    seatCouch2P(1); // 2P 與其隊友都在 team 1；1P 在 team 0
    const got = press2P();
    expect(got, "2P 拿到 1P 的隊伍 ⇒ 送出一發鎖著敵人的治療（伺服器 bad-target）")
      .toEqual([castOn("W", P2_MATE)]);
  });
});
