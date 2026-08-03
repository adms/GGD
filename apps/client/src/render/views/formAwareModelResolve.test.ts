/**
 * #223 —— 「變身之後，決定畫哪具身體的人要知道現在是哪一態」。
 *
 * ===========================================================================
 * 上一版這個檔案為什麼是空的守衛（駁斥者的繞過方法，和它為什麼有效）
 * ===========================================================================
 * 上一版有 3 組 6 條測試，全綠；而把 `GameApp` 裡三條縫整個還原成形態盲，
 * **6/6 仍然全綠、`apps/client` 381 檔 4504 條零紅**。原因是三條都繞開了出貨的
 * 那個函式：
 *   ① 測 `formAwareChampionId` —— 純函式單元測試，跟誰呼叫它無關；
 *   ② 測 registry 把 formIndex 遞下去 —— 餵的 `modelDocFor` 是**測試自己寫的
 *      stub**，出貨的那一個長什麼樣它不知道；
 *   ③ 直接呼叫 `overlay.resolve()` —— 完全沒有 GameApp。
 * 而 `grep -rn "new GameApp" src --include="*.test.ts"` 零命中：那條縫是裸的。
 *
 * 更糟的是**修法本身當時就是死的**。出貨的那一行是
 *     modelDocFor: (key, seatId) => this.modelDocFor(key, seatId),
 * 兩個參數的箭頭函式，把 registry 傳的第三個引數 `formIndex` 靜靜吃掉。
 * TypeScript 允許較短的箭頭滿足較長的簽章，所以 typecheck 也是綠的。
 *
 * ===========================================================================
 * 這一版怎麼補
 * ===========================================================================
 * 縫搬進 `championBody.championBodyHooks` —— 一個沒有 Babylon engine、
 * 沒有 canvas、沒有網路的工廠，於是測試可以**建構出貨的那一份**再交給真的
 * `EntityViewRegistry`。GameApp 只剩資料來源與四行 identity 轉接。
 *
 * 第 2 組就是那條守衛：把 `championBody.ts` 的形態跳轉還原成形態盲
 * （`bodyChampionIdFor` 直接回 `championIdForSeat`，或 `modelDocFor` 不傳
 * `formIndex`），這一組立刻紅 —— 而且是**四條縫各自一條 `it`**，所以
 * 「只還原其中一條」也擋得住。實測（2026-07-30，逐條做過）：
 *   · 三條全還原      → ①②③ 紅
 *   · 只還原 modelDocFor → 只有 ① 紅
 *   · 只還原 bodyChampionIdFor → 只有 ②③ 紅
 *   · 只還原 championTintFor   → 只有 ④ 紅
 *
 * ⚠️ 縫是**四條**不是三條。第四條 `championTintFor` 是 2026-07-30 才接上的：
 * 在那之前 GameApp 直接寫 `championTintForId(championIdForSeat(e.seatId))`，
 * 而 `formVisual.ts` 與 `championBody.ts` 的註解都已經宣稱它形態感知了。
 *
 * 第 2b 組守的是**組裝點**（GameApp 那一行有沒有把 hook 重新包起來）。那一組
 * 是原始碼結構檢查，不是行為檢查 —— 理由與限制寫在它自己的檔頭。
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ModelDoc } from "@ggd/shared/content";
import type { ModelTint } from "./modelTint";
import {
  CHAMPION_FORM_PAIRS,
  counterpartFormId,
  isAlternateForm,
} from "@ggd/shared/content/championForms";
import {
  BLIZZARD_MODEL_CHAMPIONS,
  STAND_IN_MODEL_KEYS,
  defaultPrefersVoxelBody,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import type { ChampionId } from "@ggd/shared/ids";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import {
  EntityViewRegistry,
  relativeScaleOf,
  type EntityViewState,
  type ModelDocOverride,
} from "../EntityViewRegistry";
import type { AssetManager } from "../AssetManager";
import { formAwareChampionId } from "./formVisual";
import { championBodyHooks, type ChampionBodyContent } from "./championBody";
import {
  BlizzardOverlayModels,
  STOCK_CHAMPION_GLB_PREFIX,
  SHARED_MODEL_COUNTERPART,
} from "./blizzardOverlay";
import { BLIZZARD_LOCAL_GLB_PREFIX } from "./glbFacing";

const REPO = fileURLToPath(new URL("../../../../..", import.meta.url));

let engine: NullEngine;
let scene: Scene;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

const doc = (glbPath: string): ModelDoc =>
  ({
    id: "m",
    schema: "model@1",
    glbPath,
    scale: 1,
    collisionRadius: 0.5,
    clipMap: {
      idle: "Stand",
      run: "Walk",
      attack: "Attack",
      cast: "Spell",
      hurt: "Stand",
      death: "Death",
    },
  }) as ModelDoc;

// ---------------------------------------------------------------------------
// 1. 出貨的那一個 id 解析函式，跑真的 26 對
// ---------------------------------------------------------------------------
describe("#223 formAwareChampionId —— 變身態解析到自己那一半", () => {
  it("26 對:form 0 = 本體,form 1 = 對半,而且兩者永遠不同", () => {
    expect(CHAMPION_FORM_PAIRS.length).toBe(26); // 表沒被動過
    for (const p of CHAMPION_FORM_PAIRS) {
      expect(formAwareChampionId(p.baseId, 0)).toBe(p.baseId);
      expect(formAwareChampionId(p.baseId, 1)).toBe(p.alternateId);
      expect(formAwareChampionId(p.baseId, 1)).not.toBe(p.baseId);
      // 而且解出來的那一隻，資料層真的認為它是變身態
      expect(isAlternateForm(formAwareChampionId(p.baseId, 1)!)).toBe(true);
    }
  });

  it("沒有對半的英雄:FORM bits 亂了也不可以讓身分整個消失", () => {
    // 87 位英雄沒有變身態。舊寫法在這裡回 null，而 null 一路傳下去 =
    // 「這隻沒有 tint、沒有體素皮膚、沒有 overlay 模型」—— 一個 flag bug
    // 會讓整個角色掉皮。
    expect(counterpartFormId("godie-hpal")).toBeNull(); // 前提
    expect(formAwareChampionId("godie-hpal", 1)).toBe("godie-hpal");
    expect(formAwareChampionId(null, 1)).toBeNull();
    expect(formAwareChampionId("", 0)).toBeNull();
  });
});

// ===========================================================================
// 2. THE SEAM GUARD —— 出貨的 hooks × 真的 EntityViewRegistry × 真的 overlay
// ===========================================================================
const ID = 6023;
const SEAT = 3;

/**
 * 26 豪洨天王 - 鄭先生。挑這一對是因為它是**最難的那一種**:兩半的 modelKey
 * 出貨上是同一個 `champ.skin.barbarian`,所以 `e.key` 從頭到尾不動 ——
 * 「看 key 有沒有變」的客戶端在這一對身上什麼都看不到,FORM bits 是唯一的訊號
 * (見 `apps/game-server/src/net/snapshot.ts` 的 #249 註解)。
 */
const BASE_ID = "godie-harf";
const ALT_ID = "godie-h00w";
const SHARED_KEY = "champ.skin.barbarian";
const STANDIN_GLB = `${STOCK_CHAMPION_GLB_PREFIX}blocky-barbarian.glb`;
const BASE_WC3_GLB = `${BLIZZARD_LOCAL_GLB_PREFIX}Harf.glb`;
const ALT_WC3_GLB = `${BLIZZARD_LOCAL_GLB_PREFIX}H00W.glb`;

/**
 * 06 職業獵人 - 傑·富力士 —— 26 對裡**唯一**兩半 `tint` 不同的一對,所以它是
 * 第四條縫(`championTintFor`)唯一可觀測的對象。本體綠、變身態灰。
 * (順帶：舊文案說 #06 的缺陷在 `modelDocFor`,那一條在物理上不可能發生;
 *  #06 真正的形態盲缺陷在**顏色**這一條。見第 4 組的普查。)
 */
const JET_BASE = "godie-ucrl";
const JET_ALT = "godie-u034";
const JET_BASE_KEY = "champ.thorne";
const JET_ALT_KEY = "imported.herobiggon";

/** 61 克勞薩 —— 唯一一對 w3u 給兩半**不同**模型路徑的,缺省即繼承的實測對象。 */
const KRAUSER_BASE = "godie-u012";
const KRAUSER_ALT = "godie-u011";
const KRAUSER_BASE_KEY = "champ.thorne";
const KRAUSER_ALT_KEY = "champ.skin.barbarian";
const KRAUSER_BASE_GLB = `${BLIZZARD_LOCAL_GLB_PREFIX}U012.glb`;

function championJson(id: string): ChampionDef {
  return JSON.parse(readFileSync(join(REPO, "content/champions", `${id}.json`), "utf8"));
}

beforeAll(() => {
  // 真的出貨文件，不是手寫的假英雄:`voxelSkinForId` 走 `Champions.tryGet`,
  // 而配方是從 id / 名字 / modelKey / tags / vfxKey 雜湊出來的,所以「兩半長得
  // 不一樣」這件事必須用真的欄位算才有意義(失敗形態 ⑤)。
  for (const id of [BASE_ID, ALT_ID, KRAUSER_BASE, KRAUSER_ALT, JET_BASE, JET_ALT]) {
    Champions.register(id as ChampionId, championJson(id));
  }
});

/** ContentDb 那一側:出貨的替身 doc,其餘一律「沒有」。 */
const contentStub = (): ChampionBodyContent => ({
  modelFor: (modelKey) =>
    modelKey === SHARED_KEY || modelKey === KRAUSER_BASE_KEY || modelKey === KRAUSER_ALT_KEY
      ? doc(STANDIN_GLB)
      : null,
  standinOverrideFor: () => null,
  voxelSkinOverrideFor: () => null,
  formVisualFor: () => null,
});

/**
 * 真的 `BlizzardOverlayModels`,只把 fetch 換成一份 in-memory manifest。
 * `units` 的 key 是 unitId,值帶 champId —— 跟出貨的那份同一個形狀。
 */
async function realOverlay(units: Record<string, { champId: string; glb: string }>) {
  const o = new BlizzardOverlayModels({
    enabled: true,
    fetchFn: () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ units }),
      } as unknown as Response),
  });
  await o.load();
  return o;
}

const champEntity = (key: string, flags: number): EntityViewState =>
  ({
    id: ID,
    kind: 0,
    seatId: SEAT,
    key,
    teamId: 1,
    x: 0,
    z: 0,
    fx: 0,
    fz: 1,
    alive: true,
    flags,
  }) as EntityViewState;

interface Observed {
  /** 真的被送去 `assets.load()` 的路徑 —— 玩家眼睛看到的那一具 */
  loaded: string[];
  skins: (VoxelSkinRecipe | null | undefined)[];
  overrides: (ModelDocOverride | null)[];
  tints: (ModelTint | null | undefined)[];
}

/**
 * 跑一場:本體 → 變身態,兩次 `sync`,記錄三條縫真的產出什麼。
 * hooks 是**出貨的工廠生的**,registry / ChampionView / overlay 都是真的。
 */
async function runTransform(
  overlay: BlizzardOverlayModels,
  seated: string = BASE_ID,
  keys: readonly [string, string] = [SHARED_KEY, SHARED_KEY],
): Promise<Observed> {
  const loaded: string[] = [];
  const assets = {
    load: (path: string) => {
      loaded.push(path);
      const c = new AssetContainer(scene);
      c.meshes.push(MeshBuilder.CreateBox("b", { size: 1 }, scene));
      c.removeAllFromScene();
      return Promise.resolve(c);
    },
  } as unknown as AssetManager;

  const hooks = championBodyHooks({
    // 形態盲的 seat 表 —— 這正是 GameApp 唯一餵進去的東西
    championIdForSeat: (seatId) => (seatId === SEAT ? seated : null),
    resolveModelKey: (key) => key,
    overlay,
    content: contentStub(),
  });

  const skins: Observed["skins"] = [];
  const overrides: Observed["overrides"] = [];
  const tints: Observed["tints"] = [];
  const reg = new EntityViewRegistry(scene, assets, {
    modelDocFor: hooks.modelDocFor,
    voxelSkinFor: (e) => {
      const s = hooks.voxelSkinFor(e);
      skins.push(s);
      return s;
    },
    modelOverrideFor: (e) => {
      const o = hooks.modelOverrideFor(e);
      overrides.push(o);
      return o;
    },
    // 出貨的 GameApp 在這裡只多包一層 `entityTintFor(e, mobStrength, …)`,
    // 那一層是 mob 分支(讀後台的即時設定),不是「問哪一隻」的決策。
    championTintFor: (e) => {
      const t = hooks.championTintFor(e);
      tints.push(t);
      return t;
    },
  });

  const run = (e: EntityViewState, nowMs: number): void =>
    reg.sync({
      entities: [e],
      poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
      nowMs,
      dtMs: 16,
      loadModels: true,
    });

  run(champEntity(keys[0], 0), 0);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  // 同一個 entity —— 預設情境連 `e.key` 都沒變(26 這一對兩半共用
  // `champ.skin.barbarian`),FORM bits 是唯一的訊號。
  run(champEntity(keys[1], ENTITY_FLAG.FORM_A), 16);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  reg.dispose();
  return { loaded, skins, overrides, tints };
}

describe("#223 THE SEAM —— 出貨的 championBodyHooks 真的問變身態那一隻", () => {
  /**
   * 三條縫**各自一條** `it`。合在一條裡的話,第一個 `expect` 一失敗後面兩條就
   * 不會跑,於是「只把其中一條縫還原成形態盲」就看不出來 —— 那正是這一輪要補的
   * 洞的縮小版。
   */
  /**
   * 兩半各有自己的 overlay 單位 —— 這是讓「問誰」可被觀測的輸入。今天出貨的
   * MANIFEST 只收錄 40 個**本體**,所以第二格是抽取器補上變身態之後才會出現的
   * 輸入;它在這裡的職責是讓「縫有沒有通」可被觀測。
   */
  const bothHalvesCovered = async (): Promise<Observed> =>
    runTransform(
      await realOverlay({
        Harf: { champId: BASE_ID, glb: BASE_WC3_GLB },
        H00W: { champId: ALT_ID, glb: ALT_WC3_GLB },
      }),
    );

  it("① modelDocFor:變身後真的去載變身態自己的 WC3 模型", async () => {
    const { loaded } = await bothHalvesCovered();
    expect(loaded, "本體先載本體的 WC3 模型").toContain(BASE_WC3_GLB);
    expect(
      loaded,
      "變身後必須載變身態自己的 WC3 模型;還是 Harf.glb = 這條縫是形態盲的",
    ).toContain(ALT_WC3_GLB);
    expect(loaded.indexOf(BASE_WC3_GLB)).toBeLessThan(loaded.indexOf(ALT_WC3_GLB));
  });

  it("② voxelSkinFor:生成的體素皮膚換成變身態自己的身分", async () => {
    const { skins } = await bothHalvesCovered();
    expect(skins.length).toBeGreaterThanOrEqual(2);
    const [skinBase, skinAlt] = [skins[0]!, skins[skins.length - 1]!];
    expect(skinBase, "本體要有配方(真的英雄文件已註冊)").toBeTruthy();
    expect(skinAlt).toBeTruthy();
    expect(
      JSON.stringify(skinAlt),
      "變身後的體素皮膚必須換成變身態自己的;一樣 = 把本體的臉貼到第二形態上",
    ).not.toBe(JSON.stringify(skinBase));
  });

  it("③ modelOverrideFor:#226 的 per-champion 方塊人外觀也換成變身態的", async () => {
    const { overrides } = await bothHalvesCovered();
    const [ovBase, ovAlt] = [overrides[0]!, overrides[overrides.length - 1]!];
    expect(ovBase?.voxel, "共用替身的 modelKey 一定要拿到 voxel look").toBeTruthy();
    expect(ovAlt?.voxel).toBeTruthy();
    expect(JSON.stringify(ovAlt?.voxel), "變身後的 voxel look 必須換成變身態自己的").not.toBe(
      JSON.stringify(ovBase?.voxel),
    );
  });

  it("④ championTintFor:#06 傑·富力士 變身後改漆變身態自己的 w3x 顏色", async () => {
    // 這一條在 2026-07-30 之前是**紅的**:GameApp 當時寫
    // `championTintForId(this.championIdForSeat(e.seatId))`,而 26 對裡只有
    // 這一對兩半顏色不同,所以它是全 roster 唯一看得出來的那個身體。
    const { tints } = await runTransform(await realOverlay({}), JET_BASE, [
      JET_BASE_KEY,
      JET_ALT_KEY,
    ]);
    const resolved = tints.filter((t) => t !== undefined);
    expect(resolved.length, "兩態都要解析出顏色").toBeGreaterThanOrEqual(2);
    const [tBase, tAlt] = [resolved[0]!, resolved[resolved.length - 1]!];
    // 出貨文件的值,不是這裡編的 —— 前提先釘住,免得內容改了測試還自我一致。
    expect(tBase?.tint, "#06 本體是綠的").toEqual([0.3922, 1, 0.3922]);
    expect(
      tAlt?.tint,
      "變身後必須換成變身態自己的灰;還是綠 = championTintFor 是形態盲的",
    ).toEqual([0.3922, 0.3922, 0.3922]);
  });

  it("FORM bits 沒動時,三條縫的答案一個都不可以變(反向對照)", async () => {
    const overlay = await realOverlay({
      Harf: { champId: BASE_ID, glb: BASE_WC3_GLB },
      H00W: { champId: ALT_ID, glb: ALT_WC3_GLB },
    });
    // 這一組刻意不呼叫 runTransform:兩次都是基本型。
    const loaded: string[] = [];
    const assets = {
      load: (path: string) => {
        loaded.push(path);
        const c = new AssetContainer(scene);
        c.meshes.push(MeshBuilder.CreateBox("b", { size: 1 }, scene));
        c.removeAllFromScene();
        return Promise.resolve(c);
      },
    } as unknown as AssetManager;
    const hooks = championBodyHooks({
      championIdForSeat: (seatId) => (seatId === SEAT ? BASE_ID : null),
      resolveModelKey: (key) => key,
      overlay,
      content: contentStub(),
    });
    const reg = new EntityViewRegistry(scene, assets, { modelDocFor: hooks.modelDocFor });
    const run = (nowMs: number): void =>
      reg.sync({
        entities: [champEntity(SHARED_KEY, 0)],
        poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
        nowMs,
        dtMs: 16,
        loadModels: true,
      });
    run(0);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    run(16);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    reg.dispose();
    expect(loaded).toEqual([BASE_WC3_GLB]);
  });

  it("缺省即繼承:61 克勞薩變身後沿用本體的 WC3 模型,不掉回通用方塊人", async () => {
    // 出貨 MANIFEST 的真實樣貌 —— 抽取器只拉了 40 個**可選**單位,所以 61
    // 這一對只有本體 U012 在裡面;而且 w3u 給兩半不同的模型路徑,
    // `SHARED_MODEL_COUNTERPART` 依法不能收這一對(U011 是 collision.mdl)。
    expect(SHARED_MODEL_COUNTERPART.has(KRAUSER_ALT)).toBe(false); // 前提
    const overlay = await realOverlay({
      U012: { champId: KRAUSER_BASE, glb: KRAUSER_BASE_GLB },
    });
    const { loaded } = await runTransform(overlay, KRAUSER_BASE, [
      KRAUSER_BASE_KEY,
      KRAUSER_ALT_KEY,
    ]);
    expect(loaded, "變身後不可以掉回通用方塊人").not.toContain(STANDIN_GLB);
    expect(loaded.every((p) => p === KRAUSER_BASE_GLB)).toBe(true);
    // 而且這條保底是**必要**的,不是裝飾:拿掉 inheritFrom 就是方塊人。
    expect(overlay.resolve(doc(STANDIN_GLB), KRAUSER_ALT)?.glbPath).toBe(STANDIN_GLB);
    expect(overlay.resolve(doc(STANDIN_GLB), KRAUSER_ALT, KRAUSER_BASE)?.glbPath).toBe(
      KRAUSER_BASE_GLB,
    );
  });
});

// ===========================================================================
// 2b. THE COMPOSITION ROOT —— 「GameApp 真的用了上面測的那一份嗎」
// ===========================================================================
/**
 * ⚠️ 這一組是**原始碼結構檢查**,不是行為檢查,而且我知道那是第⑥號失敗形態。
 * 它存在的唯一理由是:`GameApp` 建構不出來(`new Engine(canvas)` 要真的 WebGL
 * ＋建構子會開 Colyseus session),所以**沒有任何行為測試搆得到那個檔案**。
 * 上面第 2 組已經用真的 registry 驗過決策本身;這一組只回答一個問題 ——
 * 「那份被驗過的決策,有沒有被接到出貨的組裝點上」。
 *
 * 它抓得到的:把 hook 重新包成 `(key, seatId) => …`(當年那個吃掉 formIndex 的
 * 兩參數箭頭)、或在 registry 引數裡自己重寫一份形態盲的解析。
 * 它抓不到的:語意等價但寫法不同的改寫。所以它是**補充**,不是替代。
 */
describe("#223 組裝點 —— GameApp 沒有自己再寫一份形態盲的解析", () => {
  /**
   * 註解**必須**先剝掉,否則這一組會被自己的說明文字餵飽 —— GameApp 的註解裡
   * 就寫著「以前寫的是 `championTintForId(...)`」,而那正是要被禁止的字串。
   * (第一次寫這條守衛時就踩到了。)
   *
   * ⚠️ 而且**行註解要先剝**。倒過來的話,`// … render/** may not read it …`
   * 這一行裡的 `/*` 會開出一個假的區塊註解,把後面 250 行(含 `championTintFor:`
   * 的組裝點本身)整個吃掉。這一版被吃掉時下面的 `toBe(1)` 會紅,所以吃掉是
   * 一個看得見的失敗,不是靜默通過 —— 那是這條斷言寫成 `toBe(1)` 而不是
   * `toBeGreaterThanOrEqual(1)` 的原因。
   */
  const GAME_APP = readFileSync(join(REPO, "apps/client/src/GameApp.ts"), "utf8")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  /**
   * 一個屬性的右手邊 = 從 `hook:` 到**下一個同層屬性鍵**為止。
   * ⚠️ 不可以用固定字元數當視窗:240 字的視窗會讀進下一個屬性,於是
   * `modelDocFor: (key, seatId) => this.modelDocFor(key, seatId),` 這個
   * 當年真正出貨的錯誤寫法會被下一行的 `modelOverrideFor: this.championBody…`
   * 餵成綠燈。(這一版就是這樣先漏掉一次的。)
   */
  const rhsOf = (hook: string): string | null => {
    const m = new RegExp(`(?:^|\\s)${hook}:`, "g").exec(GAME_APP);
    if (!m) return null;
    const from = m.index + m[0].length;
    const rest = GAME_APP.slice(from);
    const next = /\n\s{6}[A-Za-z_$][\w$]*:/.exec(rest);
    return rest.slice(0, next ? next.index : 400);
  };

  it("前三條縫在 GameApp 裡是 IDENTITY 轉接 —— 一層包裝都不可以有", () => {
    // 包裝就是當年那個 bug 的形狀:`(key, seatId) => …` 滿足三參數的簽章,
    // `formIndex` 靜靜掉成預設值 0,typecheck 與 4504 條測試全綠。
    for (const hook of ["modelDocFor", "modelOverrideFor", "voxelSkinFor"] as const) {
      const rhs = rhsOf(hook);
      expect(rhs, `${hook} 要在 registry 引數裡出現`).not.toBeNull();
      expect(
        rhs!.trim(),
        `${hook} 必須整個從工廠拿,寫成 \`this.championBody.${hook},\`。` +
          `任何箭頭包裝都會把決策搬回 GameApp —— 那個檔案沒有任何測試建構得出來`,
      ).toBe(`this.championBody.${hook},`);
    }
  });

  it("championTintFor 只准包 mob 那一層,顏色決策仍在 championBody", () => {
    const rhs = rhsOf("championTintFor");
    expect(rhs).not.toBeNull();
    // 唯一允許的包裝:`entityTintFor(e, <後台即時設定>, () => …)` 的 mob 分支。
    expect(rhs!).toMatch(/entityTintFor\(/);
    expect(
      rhs!,
      "champion 那一支必須問 this.championBody.championTintFor(e)",
    ).toMatch(/this\.championBody\.championTintFor\(e\)/);
  });

  it("GameApp 不再自己呼叫形態盲的 championTintForId / voxelSkinForId", () => {
    // 這兩個純函式收的是 championId,呼叫端必須先做形態跳轉。GameApp 拿得到的
    // 只有 `championIdForSeat`(凍在選角那一刻),所以它一旦直接呼叫就是形態盲。
    expect(GAME_APP).not.toMatch(/championTintForId\s*\(/);
    expect(GAME_APP).not.toMatch(/voxelSkinForId\s*\(/);
  });
});

// ===========================================================================
// 3. 出貨內容普查 —— 26 對,真的 content,「沒有任何一對變差」
// ===========================================================================
/**
 * ⚠️ 事實更正。report / `formVisual.ts` / `GameApp.ts` / 這個檔案的舊檔頭
 * 都寫「#06 `godie-u034` 與 #61 `godie-u011` 都是 `champ.thorne`」。
 * 出貨內容**正好相反**,而且下面這一組就是重量本身。
 */
function shippedModelKey(championId: string): string | null {
  const p = join(REPO, "content/champions", `${championId}.json`);
  if (!existsSync(p)) return null;
  return (JSON.parse(readFileSync(p, "utf8")) as { modelKey?: string }).modelKey ?? null;
}
function shippedGlb(modelKey: string | null): string | null {
  if (!modelKey) return null;
  const p = join(REPO, "content/models", `${modelKey}.json`);
  if (!existsSync(p)) return null;
  return (JSON.parse(readFileSync(p, "utf8")) as ModelDoc).glbPath ?? null;
}
const isStandin = (glb: string | null): boolean =>
  typeof glb === "string" && glb.startsWith(STOCK_CHAMPION_GLB_PREFIX);

describe("#223 26 對的出貨普查(這是量測,不是引用)", () => {
  it("寫反的那兩句:穿共用替身的是本體,不是變身態", () => {
    expect(shippedModelKey("godie-ucrl"), "#06 本體").toBe("champ.thorne");
    expect(shippedModelKey("godie-u034"), "#06 變身態").toBe("imported.herobiggon");
    expect(isStandin(shippedGlb("imported.herobiggon")), "變身態不是替身").toBe(false);
    // #61 兩半都穿替身,但**不是同一個**替身 —— 舊文案寫「都是 champ.thorne」,
    // 而 champ.thorne 只有本體穿。
    expect(shippedModelKey(KRAUSER_BASE), "#61 本體").toBe(KRAUSER_BASE_KEY);
    expect(shippedModelKey(KRAUSER_ALT), "#61 變身態").toBe(KRAUSER_ALT_KEY);
  });

  it("26 對:只有 6 對的變身態穿共用替身,其餘 20 對 overlay 從不出手", () => {
    const standin = CHAMPION_FORM_PAIRS.filter((p) =>
      isStandin(shippedGlb(shippedModelKey(p.alternateId))),
    ).map((p) => p.alternateId);
    expect(standin.sort()).toEqual(
      ["godie-h00w", "godie-o030", "godie-n01b", "godie-u011", "godie-e010", "godie-o02o"].sort(),
    );
    expect(CHAMPION_FORM_PAIRS.length - standin.length).toBe(20);
  });

  /**
   * 「哪一具身體真的會被畫出來」—— 用**出貨的兩條規則本身**跑,不是抄一份。
   *   · `BlizzardOverlayModels.resolve`(真的類別,餵 MANIFEST 的 champId 欄)
   *   · `defaultPrefersVoxelBody`(真的函式,它會在 glb 被採用前擋下來)
   * 回傳可比較的等級:0 程序生成體素 < 1 通用方塊人 < 2 真模型。
   */
  const RANK = { voxel: 0, standin: 1, real: 2 } as const;
  async function shippedOverlay(): Promise<BlizzardOverlayModels> {
    // MANIFEST 的 champId 欄 = `BLIZZARD_MODEL_CHAMPIONS`(那個常數的檔頭就是
    // 這樣定義它自己的),所以這是出貨那份索引的忠實重建,不是挑過的樣本。
    return realOverlay(
      Object.fromEntries(
        BLIZZARD_MODEL_CHAMPIONS.map((champId, i) => [
          `U${i}`,
          { champId, glb: `${BLIZZARD_LOCAL_GLB_PREFIX}${champId}.glb` },
        ]),
      ),
    );
  }
  const bodyRank = (
    overlay: BlizzardOverlayModels,
    id: string,
    askAbout: string,
    inheritFrom: string | null,
  ): number => {
    const mk = shippedModelKey(id);
    const glb = shippedGlb(mk);
    if (defaultPrefersVoxelBody(mk ?? undefined, askAbout)) return RANK.voxel;
    const out = overlay.resolve(glb ? doc(glb) : null, askAbout, inheritFrom)?.glbPath ?? null;
    if (out === null) return RANK.voxel; // 沒有可採用的 glb → 程序生成的身體
    return isStandin(out) ? RANK.standin : RANK.real;
  };

  it("沒有任何一具變身身體比它的本體差(#223 的驗收條件)", async () => {
    const overlay = await shippedOverlay();
    const worse: string[] = [];
    for (const p of CHAMPION_FORM_PAIRS) {
      const base = bodyRank(overlay, p.baseId, p.baseId, null);
      const alt = bodyRank(overlay, p.alternateId, p.alternateId, p.baseId);
      if (alt < base) worse.push(`${p.heroNumber} ${p.alternateId} (${alt} < ${base})`);
    }
    expect(worse, "變身讓這些英雄的身體降級了").toEqual([]);
  });

  it("修完之後,沒有任何一具身體比修之前差(對照 #223 之前的出貨行為)", async () => {
    const overlay = await shippedOverlay();
    // ⚠️ 「修之前」的 `preferVoxelBody` 規則已經不在樹裡了,所以只能在這裡引用:
    //        isStandIn(modelKey) && !BLIZZARD_MODEL_CHAMPIONS.includes(id)
    // 它是一條**退役的歷史常數**,不是出貨不變式的複製品 —— 這是這個檔案裡
    // 唯一一處合理的「自己抄一份」。
    const beforeRank = (bodyId: string, seatId: string): number => {
      const mk = shippedModelKey(bodyId);
      const glb = shippedGlb(mk);
      if (STAND_IN_MODEL_KEYS.includes(mk ?? "") && !BLIZZARD_MODEL_CHAMPIONS.includes(seatId)) {
        return RANK.voxel;
      }
      const out = overlay.resolve(glb ? doc(glb) : null, seatId)?.glbPath ?? null;
      if (out === null) return RANK.voxel;
      return isStandin(out) ? RANK.standin : RANK.real;
    };
    const regressed: string[] = [];
    const improved: string[] = [];
    for (const p of CHAMPION_FORM_PAIRS) {
      for (const [bodyId, seatId] of [
        [p.baseId, p.baseId],
        [p.alternateId, p.baseId], // 形態盲時,變身態的身體是拿 seat 那一隻去查的
      ] as const) {
        const before = beforeRank(bodyId, seatId);
        const after = bodyRank(overlay, bodyId, bodyId, counterpartFormId(bodyId));
        if (after < before) regressed.push(`${p.heroNumber} ${bodyId} ${before}→${after}`);
        if (after > before) improved.push(`${p.heroNumber} ${bodyId} ${before}→${after}`);
      }
    }
    expect(regressed, "這些身體因為 #223 的修法而變差了").toEqual([]);
    // 而且量到的改善就是這 2 具,不多不少 —— 「零退步」單獨看還可能是「什麼都
    // 沒做」,所以正負兩面都釘住。
    expect(improved.sort()).toEqual(["87 godie-o02n 0→2", "87 godie-o02o 0→2"]);
  });

  it("那 6 具替身身體全部拿得到真的 WC3 模型 —— 一個都不留在方塊人上", () => {
    // 這一條是上面那條的正面版:光證明「沒有變差」還可能兩邊一起爛。
    const voxelBodies = CHAMPION_FORM_PAIRS.flatMap((p) => [p.baseId, p.alternateId])
      .filter((id) => isStandin(shippedGlb(shippedModelKey(id))))
      .filter((id) => defaultPrefersVoxelBody(shippedModelKey(id) ?? undefined, id));
    expect(voxelBodies, "變身對裡不該還有人被關在方塊人身體裡").toEqual([]);
  });

  // -------------------------------------------------------------------------
  // 3b. 尺寸普查 —— 「不變差」不只是「畫哪一具 glb」
  // -------------------------------------------------------------------------
  /**
   * ⚠️ 這一組是 2026-07-30 補的,補的是**上面那條 rank 普查看不到的那一半**。
   *
   * rank 普查只回答「載到哪一個 .glb」。但 `modelOverrideFor` 變成形態感知之後,
   * 變身態讀的是 `_standin-overrides.json` 裡**它自己**那一列,不再是本體那一列
   * —— 於是兩半可以載到同一個 mesh 卻用不同的 `relativeScale`,身高在變身的
   * 那一幀直接跳掉。rank 是 REAL→REAL,普查全綠,玩家看到的是一隻突然矮 22%
   * 的胖虎。**這就是這個修法真正造成過的退步**(#40 godie-n01b,
   * 1.28 → 1.00),而它當時只被另一個檔案裡一條**手寫的**斷言擋著。
   *
   * 所以這一組:
   *   · 跑真的 `_standin-overrides.json`,26 對逐對;
   *   · 用**出貨的 hook**算(不是在測試裡重寫那個 `??`),所以
   *     `bodyChampionIdFor` 一還原成形態盲,#30 的 3.0 會掉回 1.922 → 紅;
   *   · 差異一律要具名,理由寫在旁邊。沒具名的差異 = 一個新的身高跳。
   */
  describe("#223 尺寸普查 —— 變身不可以偷偷改身高", () => {
    const OVERRIDES = JSON.parse(
      readFileSync(join(REPO, "content/models/_standin-overrides.json"), "utf8"),
    ) as { overrides: Record<string, ModelDocOverride> };

    /**
     * 具名例外 = 地圖**故意**讓兩半不一樣大的那些。值一起釘住,因為
     * 「例外」不等於「隨便」—— 改動它要走這條測試,不是靜悄悄改內容檔。
     */
    const INTENDED: Record<string, { from: number; to: number; why: string }> = {
      "godie-o030": {
        from: 1.922,
        to: 3,
        why: "#30 電車癡漢 —— 兩半同一具 mesh, usca 1.00 → 3.00 的體型交換就是這個變身的全部內容。3.00 本身仍等 owner 裁決(見該條目的 note249overlay),所以值也釘住。",
      },
      "godie-e010": {
        from: 1.1,
        to: 1,
        why: "#70 白木卡迪那 70-00 紮根 —— 地圖自己把變身態縮小(usca 1.10 → 1.00),變矮是這個技能看得見的效果。",
      },
    };

    /** 出貨的 hook 對這具身體算出來的 relativeScale。 */
    const scaleOf = (seated: string, formIndex: 0 | 1): number => {
      const hooks = championBodyHooks({
        championIdForSeat: (seatId) => (seatId === SEAT ? seated : null),
        resolveModelKey: (key) => key,
        overlay: { resolve: (shipped) => shipped },
        content: {
          modelFor: () => null,
          standinOverrideFor: (id) => OVERRIDES.overrides[id] ?? null,
          voxelSkinOverrideFor: () => null,
          formVisualFor: () => null,
        },
      });
      // `e.key` 用一個不在 ARCHETYPE_BY_MODEL_KEY 裡的 key,把 #226 的 voxel
      // 分支排除掉 —— 這一組量的是尺寸。
      const e = champEntity("imported.__none__", formIndex === 0 ? 0 : ENTITY_FLAG.FORM_A);
      return relativeScaleOf(hooks.modelOverrideFor(e));
    };

    it("26 對:兩半的 relativeScale 只准在具名的兩對上不同", () => {
      const surprises: string[] = [];
      const observed: string[] = [];
      for (const p of CHAMPION_FORM_PAIRS) {
        const base = scaleOf(p.baseId, 0);
        const alt = scaleOf(p.baseId, 1);
        if (base === alt) continue;
        observed.push(p.alternateId);
        const named = INTENDED[p.alternateId];
        if (!named) {
          surprises.push(`#${p.heroNumber} ${p.alternateId} ${base}→${alt} (沒有具名理由)`);
          continue;
        }
        expect(base, `${p.alternateId} 的本體值`).toBe(named.from);
        expect(alt, `${p.alternateId}: ${named.why}`).toBe(named.to);
      }
      expect(
        surprises,
        "這些英雄變身的瞬間身高會跳,而且沒有人說得出為什麼。" +
          "同一具 mesh 上的兩半 relativeScale 必須相等 —— " +
          "要嘛把 content/models/_standin-overrides.json 的值對齊,要嘛把它列進 INTENDED 並寫下理由。",
      ).toEqual([]);
      // ⚠️ 正面斷言,而且它是這一組的**支點**。只驗「沒有意外」的話,
      // `bodyChampionIdFor` 一還原成形態盲,兩半都讀本體那一列 → 26 對全部
      // base === alt → 迴圈整個 `continue` 過去 → 全綠。這一行讓「一個差異都
      // 量不到」也是一個失敗:出貨內容明明有兩對是故意不一樣大的。
      expect(
        observed.sort(),
        "一個尺寸差異都沒量到 —— 形態感知的 modelOverrideFor 沒有生效(兩半都讀到本體那一列)",
      ).toEqual(["godie-e010", "godie-o030"]);
      expect(Object.keys(INTENDED).sort()).toEqual(["godie-e010", "godie-o030"]);
    });

    it("缺省即繼承是承重的:5 個沒有自己條目的變身態不可以掉回 1.0", () => {
      // 這 5 對是 `standinOverrideFor(alt) ?? standinOverrideFor(base)` 裡
      // 那個 `??` 唯一的存在理由。拿掉它 → 25 拳四郎 1.65→1.0、
      // 58 皮卡丘 0.6→1.0(大 67%)、90 妙蛙種子 0.62→1.0(大 61%)。
      const inheriting = CHAMPION_FORM_PAIRS.filter(
        (p) => !OVERRIDES.overrides[p.alternateId] && OVERRIDES.overrides[p.baseId],
      );
      expect(inheriting.map((p) => p.alternateId).sort()).toEqual(
        ["godie-u034", "godie-u00l", "godie-o02l", "godie-u011", "godie-h02r"].sort(),
      );
      for (const p of inheriting) {
        const want = OVERRIDES.overrides[p.baseId]!.relativeScale!;
        expect(want, `${p.baseId} 的值要真的不是 1,否則這條測試什麼都沒證明`).not.toBe(1);
        expect(scaleOf(p.baseId, 1), `${p.alternateId} 必須繼承 ${p.baseId} 的 ${want}`).toBe(want);
      }
    });
  });

  it("#249 的同模型繼承沒被打壞(20 對共用 w3u 模型路徑的仍然互通)", async () => {
    // godie-harf / godie-h00w 兩半在 w3u 是同一個 HeroPaladin.mdl。
    const glb = `${BLIZZARD_LOCAL_GLB_PREFIX}Harf.glb`;
    const overlay = await realOverlay({ Harf: { champId: "godie-harf", glb } });
    expect(overlay.resolve(doc(STANDIN_GLB), "godie-h00w")?.glbPath).toBe(glb);
    expect(SHARED_MODEL_COUNTERPART.get("godie-h00w")).toBe("godie-harf");
  });
});

// ===========================================================================
// 4. GH#239 —— 61 克勞薩的身體:出貨的 hook × 出貨的 overlay 覆蓋率
// ===========================================================================
/**
 * ⚠️ 為什麼上面兩組都還漏得掉這一條(2026-08-04 逐個突變實測,不是推論)。
 *
 * GH#239 點名的那個退步是**具體看得見**的:61 克勞薩 變身之後，身體從
 * `assets/blizzard-local/models/U012.glb`(真的 HeroDreadLord)掉成
 * `assets/models/champions/blocky-barbarian.glb`(通用方塊人)。上面有兩組
 * 各覆蓋了它的一半，接縫處誰也沒站:
 *
 *  · **第 2 組**的「缺省即繼承:61 克勞薩…」確實會因為 `modelDocFor` 少傳
 *    `inheritFrom` 而紅(實測:那是全 repo 唯一一條會紅的)。但它餵的 overlay 是
 *    `realOverlay({ U012: … })` —— 一份**在測試裡手寫的** manifest。
 *    「出貨的抽取到底有沒有收錄克勞薩的本體」它從來沒問過，所以
 *    `BLIZZARD_MODEL_CHAMPIONS` 掉了 `godie-u012` 的那一天它仍然全綠，而畫面上
 *    兩態一起變方塊人。(失敗形態 ⑤:被測的不是出貨的那個。)
 *
 *  · **第 3 組**的 rank 普查確實讀出貨的覆蓋率清單，但它**直接呼叫
 *    `overlay.resolve()`**，完全不經過 `championBodyHooks`。實測:把
 *    `bodyChampionIdFor` 還原成形態盲、或把 `modelDocFor` 的 `inheritFrom` 拿掉，
 *    這一組**兩次都是綠的** —— 它驗的是 `resolve()` 這個函式的性質，不是
 *    「出貨的渲染路徑會把哪一個字串交給 `assets.load()`」。(失敗形態 ③。)
 *
 * 這一組把兩半接起來:**出貨的工廠** × **出貨的覆蓋率清單** × **出貨的
 * `content/` 文件** × 真的 `EntityViewRegistry`，斷言真的被載入的那個路徑。
 */
describe("GH#239 克勞薩的身體 —— 出貨的 hook 拿到出貨的覆蓋率會畫出什麼", () => {
  /**
   * 出貨的 overlay 索引。`champId` 欄就是 `BLIZZARD_MODEL_CHAMPIONS`
   * (那個常數的檔頭正是這樣定義它自己的:抽取器拉的 40 個可選單位)，
   * `unitId` 是英雄 id 去掉 `godie-` 前綴之後的 w3x rawcode。
   *
   * ⚠️ 真正的 `data/blizzard-overlay/MANIFEST.json` 是 **git-ignored 的執行期
   * 狀態**(84MB，不進版控)，測試不可以依賴它存不存在 —— 所以這裡由出貨的常數
   * 重建。承重的是「**哪些 champId 有覆蓋**」這件事，不是檔名;不過對
   * `godie-u012` 這條規則還原出來的正好就是出貨的 `…/U012.glb`，所以下面那條
   * 斷言釘的是真的路徑，不是一個編出來的樣子。
   */
  const shippedCoverageOverlay = (): Promise<BlizzardOverlayModels> =>
    realOverlay(
      Object.fromEntries(
        BLIZZARD_MODEL_CHAMPIONS.map((champId) => {
          const unitId = champId.replace(/^godie-/, "").toUpperCase();
          return [unitId, { champId, glb: `${BLIZZARD_LOCAL_GLB_PREFIX}${unitId}.glb` }];
        }),
      ),
    );

  /** 出貨的 `content/models/*.json` —— 不是 stub,glbPath 逐個從磁碟讀。 */
  const shippedContent = (): ChampionBodyContent => ({
    modelFor: (modelKey) => {
      const glb = shippedGlb(modelKey);
      return glb ? doc(glb) : null;
    },
    standinOverrideFor: () => null,
    voxelSkinOverrideFor: () => null,
    formVisualFor: () => null,
  });

  /**
   * 出貨的 `championBodyHooks` 對「座位選了 `seated`、現在是第 `formIndex` 態」
   * 這具身體交出來的 glbPath。
   *
   * `e.key` 用**這具身體自己的** modelKey —— snapshot 每 tick 用
   * `Champions.get(championId).modelKey` 重算，所以變身後 registry 拿到的就是它
   * (見 `apps/game-server/src/net/snapshot.ts` 的 #249 註解)。
   */
  const hookGlb = (
    overlay: BlizzardOverlayModels,
    seated: string,
    formIndex: 0 | 1,
  ): string | null => {
    const bodyId = formIndex === 0 ? seated : (counterpartFormId(seated) ?? seated);
    const modelKey = shippedModelKey(bodyId);
    if (!modelKey) return null;
    const hooks = championBodyHooks({
      championIdForSeat: (seatId) => (seatId === SEAT ? seated : null),
      resolveModelKey: (key) => key,
      overlay,
      content: shippedContent(),
    });
    return hooks.modelDocFor(modelKey, SEAT, formIndex)?.glbPath ?? null;
  };

  it("61 克勞薩:出貨覆蓋率下,變身後真的載到 U012.glb —— 不是 blocky-barbarian", async () => {
    // 前提逐條讀出貨的資料，不是相信註解(第三守則)。這三件事湊在一起才讓
    // 「變身 = 掉成方塊人」成為可能，缺一條下面的斷言就不再有意義。
    expect(BLIZZARD_MODEL_CHAMPIONS, "本體有被抽取器收錄").toContain(KRAUSER_BASE);
    expect(BLIZZARD_MODEL_CHAMPIONS, "變身態沒有 —— 抽取器只拉可選單位").not.toContain(
      KRAUSER_ALT,
    );
    expect(SHARED_MODEL_COUNTERPART.has(KRAUSER_ALT), "事實表依法收不了這一對").toBe(false);
    expect(shippedGlb(shippedModelKey(KRAUSER_ALT)), "而它出貨穿的就是那個方塊人").toBe(
      STANDIN_GLB,
    );

    const overlay = await shippedCoverageOverlay();
    const { loaded } = await runTransform(overlay, KRAUSER_BASE, [
      KRAUSER_BASE_KEY,
      KRAUSER_ALT_KEY,
    ]);
    expect(
      loaded,
      "變身後掉回通用方塊人 —— 這就是 GH#239 指名的、掛在「修復」名義下的美術退步",
    ).not.toContain(STANDIN_GLB);
    expect(
      [...new Set(loaded)],
      "兩態都應該是同一具 HeroDreadLord(U012.glb)",
    ).toEqual([KRAUSER_BASE_GLB]);
  });

  it("26 對:出貨的 hook 一具變身身體都不可以掉成通用方塊人", async () => {
    const overlay = await shippedCoverageOverlay();
    const worse: string[] = [];
    /** 變身態自己穿替身、卻靠繼承拿到本體真模型的那些 —— 保底真的承重的證據。 */
    const rescued: string[] = [];
    for (const p of CHAMPION_FORM_PAIRS) {
      const base = hookGlb(overlay, p.baseId, 0);
      const alt = hookGlb(overlay, p.baseId, 1);
      if (!isStandin(base) && isStandin(alt)) {
        worse.push(`#${p.heroNumber} ${p.alternateId} ${base} → ${alt}`);
      }
      if (isStandin(shippedGlb(shippedModelKey(p.alternateId))) && alt !== null && !isStandin(alt)) {
        rescued.push(p.alternateId);
      }
    }
    expect(
      worse,
      "這些變身態的身體比它們的本體差。出貨的 modelDocFor 少了一張保底，" +
        "或 BLIZZARD_MODEL_CHAMPIONS 掉了對應的本體",
    ).toEqual([]);
    // ⚠️ 正面斷言，而且它是這一組的支點:只驗「沒有變差」的話，overlay 從頭到尾
    // 沒出手過也是零退步(第 3 組就是這樣對兩個突變都綠的)。這一行讓「一具都沒
    // 救到」也是一個失敗。
    // 這 6 具就是第 3 組量到的「變身態穿共用替身」的那 6 個。它們靠三條不同的
    // 路拿到真模型,所以這個清單同時是那三條路各自還活著的證據:
    //   · o02o —— 自己就在 BLIZZARD_MODEL_CHAMPIONS 裡(直接命中);
    //   · h00w / o030 / n01b / e010 —— `SHARED_MODEL_COUNTERPART`(w3u 同模型路徑);
    //   · u011 —— 只剩 `resolve(…, inheritFrom)` 這一張,少了它就進上面的 `worse`。
    expect(
      rescued.sort(),
      "沒有任何一具穿替身的變身身體拿到真模型 —— 保底整條沒生效",
    ).toEqual([
      "godie-e010",
      "godie-h00w",
      "godie-n01b",
      "godie-o02o",
      "godie-o030",
      "godie-u011",
    ]);
  });
});
