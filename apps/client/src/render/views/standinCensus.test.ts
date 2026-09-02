/**
 * #224 —— 「角色可選名單重複太多」的普查守衛。
 *
 * ── 這一支要證明的三件事 ────────────────────────────────────────────────────
 *
 * ① 數字是真的：出貨名單 53 位 / 42 種身體 / 14 位共用（overlay 缺席時），
 *    而且那三組共用組的成員逐位釘住。任何一位英雄被加進 / 移出開放名單、
 *    或被改成穿另一具模型，這裡就紅並且**指名道姓**。
 *
 * ② 判定不是掃 `modelKey`（失敗形態 ⑥/⑦）。這一點靠**同一份資料、兩個答案**
 *    來證：overlay 缺席 → 42 種身體、14 位共用；overlay 在場 → 53 種身體、
 *    0 位共用。掃 `modelKey` 欄位的實作在兩種情境下只會給出同一個 42，
 *    所以這條斷言只有走真的解析路徑才過得了。
 *
 * ③ 判定跟出貨的渲染路徑一致（失敗形態 ⑤「被測的不是出貨的那個」）。
 *    普查模組裡的 `declinesEveryGlb` 是 `ChampionView.tryUpgradeToGlb` 第一個
 *    分支的鏡像，而鏡像正是 ⑤ 的溫床。所以最後一段對**出貨名單的每一位**
 *    真的 `new ChampionView(...)`、真的呼叫 `tryUpgradeToGlb`，再看
 *    `AssetManager.load` 到底被拿**哪一個路徑**呼叫過（或根本沒被呼叫），
 *    拿那個觀測值跟普查的 `glbPath` 逐位對帳。斷言讀的是渲染器真的做了什麼，
 *    不是任何 doc 欄位。
 *
 * ⚠️ 為什麼 overlay 那一半用 `BLIZZARD_MODEL_CHAMPIONS` 合成 manifest 而不是
 * 讀 `data/blizzard-overlay/MANIFEST.json`：那個檔案是 git-ignored 的本機資產，
 * CI 上不存在。合成的那一份餵給**真的** `BlizzardOverlayModels`（真的
 * `blizzardOverlayFromDoc` + 真的 `resolve`），而那 40 個 id 與真 manifest 的
 * 對帳由 `packages/shared/.../voxelSkin` 那一側的守衛負責 —— 兩邊各守一段，
 * 沒有一段是靠註解宣稱的。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { ModelDoc } from "@ggd/shared/content";
import type { StandinScaleFields } from "@ggd/shared/content/standinScale";
import {
  BLIZZARD_MODEL_CHAMPIONS,
  generateVoxelSkin,
  voxelSkinInputOf,
  type ChampionLike,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";
import { BlizzardOverlayModels, BLIZZARD_OVERLAY_MANIFEST_PATH } from "./blizzardOverlay";
import { ChampionView } from "./ChampionView";
import type { AssetManager } from "../AssetManager";
import {
  censusChampionBodies,
  sharedWith,
  bodyIdOf,
  declinesEveryGlb,
  type CensusHooks,
} from "./standinCensus";

const REPO = join(__dirname, "../../../../..");

// ---------------------------------------------------------------------------
// 出貨的可選名單 —— 平台的 starter roster，逐字解析，不是手抄一份。
// ---------------------------------------------------------------------------

/**
 * `apps/platform/internal/curation/starter.go` 的 `starterChampions`。
 *
 * 為什麼解析 Go 原始碼而不是讀 `data/curation/whitelist.json`：那一份是
 * **operator state**（git-ignored，本機那一份停在 2026-07-24，49 位，還沒有
 * #212 加的兩位）。玩家真正看得到的預設名單是平台 seed 的這一份。
 * `apps/game-server` 那一側也解析同一個區塊 —— 註解裡寫明了它是 single source
 * of truth，所以格式改了兩邊一起紅。
 */
function shippedRoster(): string[] {
  const src = readFileSync(
    join(REPO, "apps/platform/internal/curation/starter.go"),
    "utf8",
  );
  const block = /starterChampions = \[\]string\{([\s\S]*?)\n\t\}/.exec(src);
  expect(block, "starter.go 的 starterChampions 區塊解析失敗（格式改了？）").not.toBeNull();
  const ids = [...block![1]!.matchAll(/"(godie-[^"]+)"/g)].map((m) => m[1]!);
  expect(ids.length, "出貨名單解析為空").toBeGreaterThan(0);
  return ids;
}

const ROSTER = shippedRoster();

function championDoc(id: string): ChampionLike & { modelKey?: string } {
  return JSON.parse(
    readFileSync(join(REPO, "content/champions", `${id}.json`), "utf8"),
  ) as ChampionLike & { modelKey?: string };
}

function modelDoc(modelKey: string): ModelDoc | null {
  const p = join(REPO, "content/models", `${modelKey}.json`);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as ModelDoc) : null;
}

const OVERRIDES = (
  JSON.parse(readFileSync(join(REPO, "content/models/_standin-overrides.json"), "utf8")) as {
    overrides: Record<string, StandinScaleFields & { rawHeight?: number }>;
  }
).overrides;

// ---------------------------------------------------------------------------
// Hooks —— 每一個都接到出貨的那一個實作上。
// ---------------------------------------------------------------------------

/** 合成一份 manifest，內容是**committed 的那 40 個 id**（見檔頭的 ⚠️）。 */
function synthesizedManifest(): unknown {
  const units: Record<string, unknown> = {};
  for (const champId of BLIZZARD_MODEL_CHAMPIONS) {
    const unitId = champId.replace("godie-", "").toUpperCase();
    units[unitId] = { champId, glb: `assets/blizzard-local/models/${unitId}.glb` };
  }
  return { units };
}

/** 真的 `BlizzardOverlayModels`，只換掉 fetch。`present=false` = overlay 缺席。 */
async function overlayModels(present: boolean): Promise<BlizzardOverlayModels> {
  const body = JSON.stringify(synthesizedManifest());
  const models = new BlizzardOverlayModels({
    enabled: true,
    fetchFn: (url: string) => {
      expect(url).toContain(BLIZZARD_OVERLAY_MANIFEST_PATH);
      return Promise.resolve(
        present
          ? ({ ok: true, json: () => Promise.resolve(JSON.parse(body)) } as Response)
          : ({ ok: false, status: 404, json: () => Promise.reject(new Error("404")) } as unknown as Response),
      );
    },
    warn: () => {},
  });
  await models.load(); // 探測先落地，否則 resolve 回的是「還不知道」
  return models;
}

/**
 * 出貨的生成器本尊 —— 手寫一個 `{preferVoxelBody:false}` 就是失敗形態 ⑤。
 * 普查的 `skinOf` hook 與下面餵給 `ChampionView` 的 recipe **是同一個呼叫**，
 * 所以「普查看到的皮」與「渲染器拿到的皮」結構上不可能分岔。
 */
function recipeOf(id: string): VoxelSkinRecipe {
  return generateVoxelSkin(voxelSkinInputOf(championDoc(id)));
}

function hooksFor(overlay: BlizzardOverlayModels): CensusHooks {
  return {
    modelKeyOf: (id) => championDoc(id).modelKey ?? null,
    modelDocOf: (key) => modelDoc(key),
    resolveOverlay: (shipped, id) => overlay.resolve(shipped, id),
    skinOf: recipeOf,
    overrideOf: (id) => OVERRIDES[id] ?? null,
  };
}

// ---------------------------------------------------------------------------

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

describe("#224 替身普查 —— 數字", () => {
  it("overlay 缺席：全名單 / 40 種身體 / 14 位共用 / 3 組", async () => {
    cover("standin-census");
    // ⚠️ 2026-08-16 —— 這一整段的數字**跟著名單走**。owner 下架四位英雄
  //    （安云 · 藤井八雲 · 賈修貝爾 · 麻倉葉）之後全部往下移一階：
  //      53→49 位 · 42→40 種身體 · 16→14 位共用 · 35→33 位沒記 usca
  //    ⛔ 這**不是**替身系統退步 —— 是普查的分母變小了。
  //    ⭐ 「位數」一律用 `ROSTER.length` 推導（名單再變它自己會跟）；
  //    身體種類／共用數是**量出來的**，只能重新量，所以留著字面值。
    const census = censusChampionBodies(ROSTER, hooksFor(await overlayModels(false)));
    expect(census.totals.champions).toBe(ROSTER.length);
    expect(census.totals.distinctBodies).toBe(40);
    // ⚠️ 14→12：下架的四位裡有兩位在共用組（賈修貝爾在 blocky-mage、
    //    藤井八雲在 blocky-barbarian）。組數還是 3 —— 兩組都還有 ≥2 人。
    expect(census.totals.sharing).toBe(12);
    expect(census.totals.sharedGroups).toBe(3);
  });

  it("三組共用組的成員逐位釘住 —— 名單一動就指名道姓", async () => {
    cover("standin-census");
    const census = censusChampionBodies(ROSTER, hooksFor(await overlayModels(false)));
    const groups = [...census.byBody.entries()]
      .filter(([, ids]) => ids.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    expect(groups.map(([body, ids]) => [body, ids])).toEqual([
      [
        "assets/models/champions/blocky-mage.glb",
        [
          "godie-e00s", // 白木老樹精 - 白木卡迪那
          "godie-efur", // 揍敵客大家長 - 揍敵客桀諾
          "godie-n00b", // 小叮噹 - 哆拉A夢
          "godie-ogld", // 美白大法師 - 黑人牙膏
          "godie-orkn", // 電車癡漢 - 臭作
          "godie-u00k", // 邪惡意念集合體 - 死之王
        ],
      ],
      [
        "assets/models/champions/blocky-barbarian.glb",
        ["godie-h02k", "godie-ubal", "godie-umal"],
      ],
      ["assets/models/champions/blocky-knight.glb", ["godie-hapm", "godie-ucrl", "godie-udea"]],
    ]);
    // owner 點名的那一對：哆拉A夢 與 死之王 站在同一具身體上。
    expect(sharedWith(census, "godie-n00b")).toContain("godie-u00k");
    expect(sharedWith(census, "godie-u00k")).toContain("godie-n00b");
  });

  it("⚠️ 反 ⑥/⑦：同一份資料，overlay 在場時答案翻成「一人一種身體」/ 0 共用", async () => {
    cover("standin-census");
    // 掃 `doc.modelKey` 的實作在這兩種情境下都會回同一個數 —— 這一條是它過不了的。
    const off = censusChampionBodies(ROSTER, hooksFor(await overlayModels(false)));
    const on = censusChampionBodies(ROSTER, hooksFor(await overlayModels(true)));
    expect(off.totals.distinctBodies).toBe(40);
    expect(on.totals.distinctBodies).toBe(ROSTER.length);
    expect(on.totals.sharing).toBe(0);
    expect(on.totals.sharedGroups).toBe(0);
    // 而 modelKey 本身**沒有變** —— 證明差異來自解析路徑，不是輸入。
    for (const id of ROSTER) {
      expect(on.bodies.get(id)!.modelKey).toBe(off.bodies.get(id)!.modelKey);
    }
    // 那 14 位在 overlay 在場時各自穿自己的 WC3 身體。
    for (const id of ["godie-n00b", "godie-u00k", "godie-hapm"]) {
      const b = on.bodies.get(id)!;
      expect(b.source).toBe("wc3-overlay");
      expect(b.isStandin).toBe(false);
      expect(b.sharedWith).toEqual([]);
    }
  });

  it("身體識別不是 modelKey：體素身體 per-champion，共用 glb 才是同一組", async () => {
    cover("standin-census");
    expect(bodyIdOf({ championId: "x", glbPath: null, source: "voxel-body" })).toBe("voxel:x");
    expect(bodyIdOf({ championId: "y", glbPath: null, source: "voxel-body" })).toBe("voxel:y");
    expect(bodyIdOf({ championId: "x", glbPath: "a.glb", source: "generic-body" })).toBe("a.glb");
    // 兩位 preferVoxelBody 的英雄即使 modelKey 相同，也**不**算共用。
    const hooks = hooksFor(await overlayModels(false));
    const forced: CensusHooks = { ...hooks, skinOf: () => ({ preferVoxelBody: true }) };
    const census = censusChampionBodies(ROSTER, forced);
    expect(census.totals.sharing).toBe(0);
    expect(census.totals.distinctBodies).toBe(ROSTER.length);
    expect(census.bodies.get("godie-n00b")!.source).toBe("voxel-body");
  });
});

describe("#77 替身回退有沒有丟掉地圖的真 scale", () => {
  it("出貨名單裡，地圖 usca 沒走到替身身體上的**零位** —— ⚠️ 是他離開了，不是修好了", async () => {
    cover("standin-census");
    const census = censusChampionBodies(ROSTER, hooksFor(await overlayModels(false)));
    // note 已標 ⚠CONFLICT 的兩位是 owner 依角色設定刻意跟地圖不同的（熊貓
    // usca 2.00 → 出貨 0.80、巴恩 usca 1.00 → 出貨 1.30），小叮噹 0.65 vs 0.60
    // 與初號機 1.55 vs 1.60 同樣在 note 裡寫明是刻意保留的 lore 值。
    const DELIBERATE = new Set(["godie-h02k", "godie-ubal", "godie-n00b", "godie-e00r"]);
    const dropped = [...census.bodies.values()]
      .filter((b) => b.mapScaleHonoured === false && !DELIBERATE.has(b.championId))
      .map((b) => b.championId);

    // ⚠️ 2026-08-16 —— 這條以前釘的是「只剩 1 位：賈修貝爾」（`relativeScale`
    //    0.67 是 WC3 身高比的乘積，但條目沒有 `standinRelativeScale`，回退到方塊人
    //    時拿的是 0.67 而不是地圖的 1.20，差 1.79 倍）。
    //    owner 那天把賈修貝爾**下架**了，於是這份清單變成空的。
    //
    // ⛔ **不要把這個零讀成「債還完了」。** 那個缺陷一行程式都沒有被改 ——
    //    它只是暫時沒有活體樣本。roster.json 的註解自己寫著下架是可逆的
    //    （「技能補完之後把 id 從這裡拿掉就是重新上架」），所以賈修貝爾回來的
    //    那一天這條會**自己變紅**，並且指名道姓 —— 那正是它該做的事。
    expect(dropped).toEqual([]);
  });

  it("地圖的真模型指向是機器讀得到的：13 位穿通用身體的有 10 位帶著 umdl", async () => {
    cover("standin-census");
    const census = censusChampionBodies(ROSTER, hooksFor(await overlayModels(false)));
    const standins = [...census.bodies.values()].filter((b) => b.isStandin);
    // 13 = 撞臉的 12 位 + 喪標麥可（獨佔 blocky-undead）。
    // 「穿別人的身體」與「跟人撞臉」是兩件事。
    // ⚠️ 2026-08-16 下架四位之後 16→14。
    // ⭐ 2026-09-02（GH#933）14→13：**初號機畢業了** —— 它從 blocky-rogue
    //   搬到自己的 `w3x.stock.satyrtrickster`（War3x.mpq 抽出來轉的），
    //   ⇒ 不再穿通用身體。⭐ 這是棘輪的**正確方向**（少一位借身體的）。
    expect(standins.length).toBe(13);
    expect(census.totals.onGenericBody).toBe(13);
    expect(census.totals.sharing).toBe(12);
    // 地圖沒有覆寫 umdl（繼承 base unit）的那幾位沒有這個欄位。
    // ⭐ 2026-09-02（GH#933）10→9：初號機（`godie-e00r`）搬去自己的
    //   `w3x.stock.satyrtrickster` ⇒ 它不在「穿通用身體」這個母體裡了，
    //   而它正是帶著 umdl 的那 10 位之一。
    expect(standins.filter((b) => b.mapModel !== null).length).toBe(9);
    // 小叮噹本來是一隻 0.6 倍的藍色熊貓，而且那件事現在寫在資料裡。
    const n00b = census.bodies.get("godie-n00b")!;
    expect(n00b.mapScale).toBe(0.6);
    expect(n00b.mapModel).toContain("StormPandarenBrewmaster");
  });

  it("出貨名單有 33 位連 usca 都沒有被記下來（未還的債，不是回歸）", async () => {
    cover("standin-census");
    const census = censusChampionBodies(ROSTER, hooksFor(await overlayModels(false)));
    expect(census.totals.mapScaleUnrecorded).toBe(33);
    // 那 33 位裡只有一位穿的是通用身體：喪標麥可，而他的方塊殭屍身體是 #217/#226
    // 刻意選的，不是回退 —— 他沒有 w3x 來源，所以本來就沒有 usca 可記。
    const unrecordedStandins = [...census.bodies.values()]
      .filter((b) => b.mapScale === null && b.isStandin)
      .map((b) => b.championId);
    expect(unrecordedStandins).toEqual(["godie-zombiex"]);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 的防線：普查的判定 vs 真的 ChampionView 真的載了什麼
// ---------------------------------------------------------------------------

function makeContainer(label: string): AssetContainer {
  const container = new AssetContainer(scene);
  const mesh = MeshBuilder.CreateBox(`${label}-body`, { size: 1 }, scene);
  mesh.scaling.y = 1.8;
  mesh.material = new StandardMaterial(`${label}-mat`, scene);
  container.meshes.push(mesh);
  container.rootNodes.push(mesh);
  container.materials.push(mesh.material);
  container.removeAllFromScene();
  return container;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("#224 普查的判定 = 渲染器真的做了什麼", () => {
  it("53 位逐位對帳：census.glbPath === AssetManager.load 真的被呼叫的路徑", async () => {
    cover("standin-census");
    const overlay = await overlayModels(false);
    const hooks = hooksFor(overlay);
    const census = censusChampionBodies(ROSTER, hooks);

    let entityId = 9000;
    const observed = new Map<string, string | null>();
    for (const id of ROSTER) {
      const doc = hooks.resolveOverlay(hooks.modelDocOf(hooks.modelKeyOf(id) ?? ""), id);
      const requested: string[] = [];
      const assets = {
        load: (path: string) => {
          requested.push(path); // ← 觀測點：渲染器真的去要了哪一個檔案
          return Promise.resolve(makeContainer(`c${entityId}`));
        },
      } as unknown as AssetManager;
      const view = new ChampionView(scene, entityId++, hooks.modelKeyOf(id) ?? "champ.sela", 1, {
        skin: recipeOf(id),
      });
      view.tryUpgradeToGlb(assets, doc);
      await flush();
      observed.set(id, requested[0] ?? null);
      view.dispose();
    }

    for (const id of ROSTER) {
      expect(observed.get(id), `${id}: 普查說的身體 ≠ 渲染器真的載的檔案`).toBe(
        census.bodies.get(id)!.glbPath,
      );
    }
    // 而且真的有人載到通用方塊人 —— 否則上面每一條都是 null === null 的空對帳。
    // ⭐ 2026-09-02（GH#933）14→13：初號機從 `blocky-rogue` 搬到
    //   `assets/models/imported/satyrtrickster.glb`（下面那條 >20 因此也多一位）。
    expect(
      [...observed.values()].filter((p) => p?.startsWith("assets/models/champions/blocky-")).length,
    ).toBe(13);
    // 而且真的有人載到自己的模型（另一半的空對帳防線）。
    expect([...observed.values()].filter((p) => p?.startsWith("assets/models/imported/")).length)
      .toBeGreaterThan(20);
  });

  it("preferVoxelBody 的英雄:渲染器一個檔案都沒要，普查也說 voxel-body", async () => {
    cover("standin-census");
    const hooks = hooksFor(await overlayModels(false));
    const forced: CensusHooks = { ...hooks, skinOf: () => ({ preferVoxelBody: true }) };
    const census = censusChampionBodies(["godie-n00b"], forced);
    expect(census.bodies.get("godie-n00b")!.source).toBe("voxel-body");
    expect(census.bodies.get("godie-n00b")!.glbPath).toBeNull();

    const requested: string[] = [];
    const assets = {
      load: (path: string) => {
        requested.push(path);
        return Promise.resolve(makeContainer("voxel"));
      },
    } as unknown as AssetManager;
    // 出貨的生成器本尊，只把要測的那一個欄位蓋掉（失敗形態 ⑤：手寫一個假
    // recipe 就等於在測自己編的東西）。
    const view = new ChampionView(scene, 9500, "champ.sela", 1, {
      skin: { ...recipeOf("godie-n00b"), preferVoxelBody: true },
    });
    view.tryUpgradeToGlb(assets, modelDoc("champ.sela"));
    await flush();
    expect(requested, "tryUpgradeToGlb 的 preferVoxelBody 分支沒有攔住載入").toEqual([]);
    expect(view.hasGlb).toBe(false);
    expect(declinesEveryGlb({ preferVoxelBody: true })).toBe(true);
    view.dispose();
  });
});
