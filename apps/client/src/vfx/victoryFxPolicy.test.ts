/**
 * 勝利煙火的後台開關 (#93 / #235) —— 「owner 說直接取消煙火」的守衛。
 *
 * owner 2026-08-02：「請你直接取消煙火(變成後台開關)」。
 *
 * ⚠️ 這一支**刻意不斷言「設定值是 false」**。那是第⑦號故障（掃屬性代替掃行為）：
 * 設定是 false 而 `sync()` 照樣把煙火放出來，是完全可能的 —— 在這張單之前根本
 * 沒有設定，那兩行 `play()` 是無條件的。所以下面每一條的斷言讀的都是**跑完
 * `sync()` 之後場景裡真的多出幾個粒子系統／幾個 mesh**，餵進去的是**出貨的**
 * `content/config/victory-fx.json`。
 *
 * ⚠️ 同理，「callback 有沒有被呼叫」也是行為：關掉煙火**不可以**順手關掉灰底/
 * 暗底與嘲弄語音，那是一個沒有人要求的迴歸，而且它會安靜地發生。
 *
 * ⚠️ 對 Babylon 物件只比字串與數字，不比物件本身：`expect(babylonObject)` 失敗
 * 時 vitest 會深度序列化材質 → 反向參照整個 scene → heap 爆掉 → worker 死掉 →
 * reporter 收到「0 條 failed」。（同 `arenaFire.test.ts` 的檔頭。）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ConfigVictoryFxDoc, VictoryFxPolicy } from "@ggd/shared/content";
import { DEFAULT_VICTORY_FX, resolveVictoryFx, zConfigVictoryFxDoc } from "@ggd/shared/content";
import { VictoryFireworks } from "./VictoryFireworks";
import { applyVictoryFxDoc, resetVictoryFxPolicy, victoryFxPolicy } from "./victoryFxPolicy";
import type { VictoryInput } from "./victoryTrigger";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

/** 出貨的 victory-fx 設定文件，**過它自己的 Zod** 再用。 */
function shippedDoc(): ConfigVictoryFxDoc {
  const raw = JSON.parse(
    readFileSync(`${REPO}content/config/victory-fx.json`, "utf8"),
  ) as unknown;
  const parsed = zConfigVictoryFxDoc.safeParse(raw);
  expect(parsed.success, "出貨的 content/config/victory-fx.json 不合 schema").toBe(true);
  return (parsed as { data: ConfigVictoryFxDoc }).data;
}

let engine: NullEngine;
let scene: Scene;
let camera: FreeCamera;

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  camera = new FreeCamera("cam", new Vector3(0, 6, -12), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.fov = 0.8;
  scene.activeCamera = camera;
  resetVictoryFxPolicy();
});

afterEach(() => {
  resetVictoryFxPolicy();
  scene.dispose();
  engine.dispose();
});

/** 場上真的有幾個回合小煙火的粒子系統（`BurstPool` 的命名是 `vfx-preset-sm/...`）。 */
const smallPs = (): number =>
  scene.particleSystems.filter((p) => p.name.startsWith("vfx-preset-sm/")).length;
/** 烤雞煙火的粒子系統 + 它那一顆形狀 mesh（mesh 是**第一次 play 才**建的）。 */
const chickenPs = (): number =>
  scene.particleSystems.filter((p) => p.name.startsWith("vfx-preset-chk/")).length;
const chickenMesh = (): number =>
  scene.meshes.filter((m) => m.name === "vfx-chicken-firework").length;

const input = (over: Partial<VictoryInput>): VictoryInput => ({
  phase: "combat",
  outcomeDecided: false,
  round: 1,
  myTeamId: 0,
  myRoundWins: 0,
  myPlacement: 0,
  ...over,
});
const DECIDED = input({ phase: "resolution", outcomeDecided: true, myPlacement: 1 });

/** 開一場、贏一回合、再吃雞，把兩層都推過一次。回傳兩個 callback 各響幾次。 */
function celebrate(policy?: () => VictoryFxPolicy): { round: number; match: number } {
  let round = 0;
  let match = 0;
  const fx = new VictoryFireworks(scene, {
    cameraFor: () => camera,
    ...(policy ? { policy } : {}),
    onRoundWin: () => round++,
    onMatchWin: () => match++,
  });
  fx.sync(input({}), 0); // prime
  fx.sync(input({ myRoundWins: 1, round: 2 }), 100); // 回合勝利邊緣
  for (let f = 0; f < 8; f++) fx.update(100 + f * 16);
  fx.sync(DECIDED, 300); // 全場勝利邊緣
  for (let f = 0; f < 8; f++) fx.update(300 + f * 16);
  // dispose 會把池子收掉,所以斷言必須在 dispose 之前讀 —— 呼叫端負責。
  return { round, match };
}

describe("勝利煙火：出貨值真的讓畫面上一發煙火都沒有 (owner 2026-08-02)", () => {
  it("餵出貨設定跑完一場勝利：0 個小煙火粒子、0 個烤雞粒子、烤雞 mesh 根本沒被建", () => {
    applyVictoryFxDoc(shippedDoc());
    const cbs = celebrate();
    expect(smallPs()).toBe(0);
    expect(chickenPs()).toBe(0);
    expect(chickenMesh()).toBe(0);
    // 但勝利表演本身還在:灰底/暗底與嘲弄語音掛在這兩個 callback 上。
    expect(cbs).toEqual({ round: 1, match: 1 });
  });

  it("把兩格打開就會有煙火 —— 上一條不是因為程式碼被刪掉才綠的", () => {
    applyVictoryFxDoc({
      id: "victory-fx",
      schema: "config.victory-fx@1",
      roundVolley: { enabled: true },
      matchChicken: { enabled: true },
    });
    celebrate();
    expect(smallPs()).toBeGreaterThan(0);
    expect(chickenMesh()).toBe(1);
  });

  it("兩格是分開的：只開回合煙火,吃雞那隻鳥不會飛", () => {
    applyVictoryFxDoc({
      id: "victory-fx",
      schema: "config.victory-fx@1",
      roundVolley: { enabled: true },
      matchChicken: { enabled: false },
    });
    celebrate();
    expect(smallPs()).toBeGreaterThan(0);
    expect(chickenMesh()).toBe(0);
  });

  it("兩格是分開的：只開烤雞,每回合的小煙火不會放", () => {
    applyVictoryFxDoc({
      id: "victory-fx",
      schema: "config.victory-fx@1",
      roundVolley: { enabled: false },
      matchChicken: { enabled: true },
    });
    celebrate();
    expect(smallPs()).toBe(0);
    expect(chickenMesh()).toBe(1);
  });

  it("設定還沒載到（內容掛掉／骨架模式）時也是關的 —— 忘了接線的結果是沒有煙火,不是有煙火", () => {
    // 刻意**不**呼叫 applyVictoryFxDoc:這就是 boot fail-open 那條路的狀態。
    celebrate();
    expect(smallPs()).toBe(0);
    expect(chickenMesh()).toBe(0);
  });

  it("文件缺席／schema 不合 → 回到出貨值(關),不是黏著上一場的設定", () => {
    applyVictoryFxDoc({
      id: "victory-fx",
      schema: "config.victory-fx@1",
      roundVolley: { enabled: true },
      matchChicken: { enabled: true },
    });
    expect(victoryFxPolicy().roundVolley.enabled).toBe(true);
    applyVictoryFxDoc(null);
    celebrate();
    expect(smallPs()).toBe(0);
    expect(chickenMesh()).toBe(0);
  });

  it("`policy` 那個 seam 真的被 sync() 讀,而不是被忽略", () => {
    // 這一條擋的是「加了選項但 sync 沒讀」:那種缺陷下,上面每一條都還是綠的
    // （因為模組層單例也是關的),而後台打開之後場上永遠不會有煙火。
    celebrate(() => ({ roundVolley: { enabled: true }, matchChicken: { enabled: true } }));
    expect(smallPs()).toBeGreaterThan(0);
    expect(chickenMesh()).toBe(1);
  });
});

describe("勝利煙火：出貨值 / 保險絲 / 接線", () => {
  it("content/config/victory-fx.json 和 DEFAULT_VICTORY_FX 一格一格對得起來", () => {
    const shipped = shippedDoc();
    expect(shipped.roundVolley.enabled).toBe(DEFAULT_VICTORY_FX.roundVolley.enabled);
    expect(shipped.matchChicken.enabled).toBe(DEFAULT_VICTORY_FX.matchChicken.enabled);
    // owner 的裁決本身:出貨就是關的。保險絲同向 —— 內容載不到時不可以把煙火點回來。
    expect(shipped.roundVolley.enabled).toBe(false);
    expect(shipped.matchChicken.enabled).toBe(false);
    expect(DEFAULT_VICTORY_FX.roundVolley.enabled).toBe(false);
    expect(DEFAULT_VICTORY_FX.matchChicken.enabled).toBe(false);
  });

  it("resolveVictoryFx 對 null / undefined 都回出貨的保險絲", () => {
    expect(resolveVictoryFx(null)).toEqual(DEFAULT_VICTORY_FX);
    expect(resolveVictoryFx(undefined)).toEqual(DEFAULT_VICTORY_FX);
  });

  it("ContentDb 真的把 victory-fx 這條縫接出來", () => {
    // 這一條是掃字串(第⑥號故障),刻意的:它擋的是「忘了接線」,而上面那條
    // 「設定還沒載到時也是關的」保證了忘記接線時的結果落在安全的那一邊。
    const db = readFileSync(`${REPO}apps/client/src/content/ContentDb.ts`, "utf8");
    expect(db).toContain('applyVictoryFxDoc(this.configDoc<ConfigVictoryFxDoc>("victory-fx"');
  });
});
