/**
 * 【開關型技能】看不看得出是**開**還是**關**（GH#546）—— 承重守衛。
 *
 * owner 2026-08-22 逐字：
 * > 「**風王結界這種開關型按鈕 圖示跟特效要明顯看出是開還是關狀態**
 * >  （w3x會有**特殊攻擊特效跟隨手部**、**圖示也會有流轉**作為打開中顯示）」
 *
 * ⭐ 這條守衛擋的是 **失敗形態⑧（消費端存在，但它消費不到）**：2026-08-23 量到
 * 「開著」這件事的**每一個零件**都在（線路欄位／寫端／唯一解碼器／唯一讀端／
 * 六個算繪點／後台頁／出貨 JSON），⛔ 而 `SeatView` 沒有 `toggleMask` 那一格，
 * 於是 `?? 0` 讓它**永遠是關的**。既有守衛看不見它：那支用
 * `{…} as unknown as SeatView` 手刻夾具（失敗形態⑤）——夾具填得進去、出貨投影
 * 填不進去，兩件事互相看不見。⇒ ⭐ 這裡**不手刻 SeatView**，從真的 `SeatState`
 * 出發走出貨的 `syncHudFromState()`，再讓兩個消費端各自讀它們平常讀的那個 store。
 *
 * ⛔ 不驗顏色 / sweepMs / rimPx / 粒子大小 —— 那些是**數字**。只問：**那一位從
 * 0 變 1 之後，畫面上有沒有東西不一樣。**
 *
 * 突變紀錄（一批一條，挑最承重的那一條線）：
 *   · `net/RoomStore.ts` 的 `toggleMask: ss.toggleMask ?? 0` 拿掉
 *     → 兩條 it 同時紅（圖示流轉與手部特效**都**消失）。那一行就是整批功能。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";

// QualityController 在 import 時碰 localStorage（同 AmbientVfx.test.ts）。
vi.mock("../render/QualityController", () => ({
  qualityController: { getParams: (): { particleDensity: number } => ({ particleDensity: 1 }) },
}));
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { VfxDoc } from "@ggd/shared/content";
import {
  AMBIENT_TOGGLE_SLOTS,
  zConfigAmbientVfxDoc,
} from "@ggd/shared/content/schema/config/ambientVfx";
import { CASTABLE_SLOTS } from "@ggd/shared/sim/intents";
import { MatchState, SeatState, toggleMaskWith } from "@ggd/shared/protocol/schema";
import { hudStore, resetHudStore, syncHudFromState } from "../net/RoomStore";
import { seatToggleOn } from "../ui/abilityReadyFrame";
import { AmbientVfx, type AmbientContentHooks } from "./AmbientVfx";

/** 20-01 風王結界住在 W；bit 由 `CASTABLE_SLOTS` 定，⛔ 測試裡不手寫索引。 */
const SLOT = "W";
const ENTITY_ID = 101;

/** 出貨的那一份綁定表，用**出貨的 Zod** 讀 —— ⛔ 不是一份手抄的夾具。 */
const SHIPPED = zConfigAmbientVfxDoc.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../../content/config/ambient-vfx.json", import.meta.url)),
      "utf8",
    ),
  ),
);
const SABER_BINDINGS = SHIPPED.bindings["imported.herosaber"] ?? [];

const DOC = (id: string): VfxDoc =>
  ({
    id,
    schema: "vfx@1",
    emitter: { shape: "point" },
    mode: "continuous",
    rate: 20,
    lifetimeSec: { min: 0.3, max: 0.6 },
    size: { start: 0.3, end: 0.1 },
    color: { start: [1, 1, 1, 1], end: [1, 1, 1, 0] },
    blendMode: "additive",
  }) as VfxDoc;

const HOOKS: AmbientContentHooks = {
  bindingsFor: (key) => (key === "imported.herosaber" ? SABER_BINDINGS : []),
  vfxDocFor: (id) => DOC(id),
  ribbonDocFor: () => null,
};

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  resetHudStore();
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
  resetHudStore();
});

/** 伺服器送出「W 開著沒有」→ 出貨投影 → hudStore。⛔ 中間沒有任何手刻的 SeatView。 */
function serverSays(on: boolean): void {
  const ss = new SeatState();
  ss.seatId = 0;
  ss.accountId = "01A";
  ss.championId = "champ.sela";
  ss.entityId = ENTITY_ID;
  // ⛔ 不手寫 `1 << i` —— `toggleMaskWith` 是全專案唯一的編碼器。
  ss.toggleMask = toggleMaskWith(0, CASTABLE_SLOTS.indexOf(SLOT), on);
  syncHudFromState(
    {
      matchId: "m",
      phase: "combat",
      round: 1,
      tick: 1,
      phaseTicksLeft: 1,
      seed: 1,
      seats: new Map([["0", ss]]),
      entities: new Map(),
      teams: [],
    } as unknown as MatchState,
    "01A",
  );
}

const localSeat = (): Parameters<typeof seatToggleOn>[0] => hudStore.getState().seats[0]!;

/** 這具身體現在掛著幾顆常駐粒子。 */
const emitterCount = (root: TransformNode): number =>
  root.getChildTransformNodes(false).filter((n) => n instanceof Mesh && n.name.startsWith("ambient-"))
    .length;

describe("開關型技能：開著與關著在畫面上不一樣 (GH#546)", () => {
  it("⭐ 圖示那一半 —— 伺服器說「W 開著」，技能列的讀端就讀得到", () => {
    serverSays(false);
    expect(seatToggleOn(localSeat(), SLOT), "沒有技能開著，讀端卻說開著").toBe(false);
    serverSays(true);
    // ⛔ 這一條紅 = 六個算繪點一輩子畫不出「開啟中」的流轉，而它們的程式碼全都在。
    expect(seatToggleOn(localSeat(), SLOT), "伺服器說開著，而技能列讀到的是關著").toBe(true);
  });

  it("⭐ 手部那一半 —— 開著才掛，關掉**真的被拆掉**", () => {
    const root = new TransformNode(`champ-${ENTITY_ID}`, scene);
    // ⭐ 注入的形狀與 `GameApp` 那一行**逐字相同**（2026-08-23）——
    //    `AmbientVfx` 自己**不可以** import `RoomStore`（`architecture.test.ts`
    //    的 client-08：逐幀資料不可以穿過 React state），所以預設是「一律關」。
    //    ⛔ 這不是手刻夾具：上面那一段仍然走**出貨的** snapshot → 投影 → hudStore，
    //    這裡只是把 `GameApp` 做的那一次注入照抄過來。
    //    ⚠️ 而「GameApp 真的有注入」由 `RoundFxDeps.ambientToggleMask` **必填**
    //    這件事保證（tsc 擋），⛔ 不是靠這條測試。
    const toggleMaskOf = (entityId: number): number =>
      hudStore.getState().seats.find((x) => x.entityId === entityId)?.toggleMask ?? 0;
    const ambient = new AmbientVfx(scene, HOOKS, {
      getScale: () => 1,
      getToggleMask: toggleMaskOf,
    });

    serverSays(false);
    ambient.attach(ENTITY_ID, "imported.herosaber", root);
    const off = emitterCount(root);

    serverSays(true);
    ambient.attach(ENTITY_ID, "imported.herosaber", root);
    const on = emitterCount(root);
    expect(on, "開著的時候手上沒有多出任何東西").toBeGreaterThan(off);

    // ⭐ 承重：關掉的那一刻要**真的少一顆**。⛔ 不是 alpha 0、⛔ 也不是等下一次
    // 換模型才生效（那會讓玩家關掉風王結界之後手上噴到比賽結束）。
    serverSays(false);
    ambient.attach(ENTITY_ID, "imported.herosaber", root);
    expect(emitterCount(root), "關掉之後手部特效還在噴").toBe(off);
  });

  it("`whileToggle` 的槽位表 ≡ CASTABLE_SLOTS —— 加第七格不可以被靜默截掉", () => {
    expect([...AMBIENT_TOGGLE_SLOTS]).toEqual([...CASTABLE_SLOTS]);
  });
});
