/**
 * #189 —— 瀏覽器也必須讀耐久內容覆蓋層。
 *
 * ⚠️ 這一份守的是「後台按了儲存,玩家看得到嗎」。伺服器端早就會讀 overlay,
 * 所以**任何走伺服器的東西都會通**;純客戶端的決定不會 —— 而那是看不出來的:
 * 後台顯示已儲存、overlay 真的寫進去了、generation 也跳了,玩家端只是照舊。
 *
 * 具體受害者:GH#31 的 `config.voxel-bodies@1`(體素身體開關,渲染決定全在
 * ChampionView),以及 `config.base-bonus@1` 在大廳的顯示。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Arenas, Configs, Models, VfxDefs, StatusEffects } from "@ggd/shared/content";
import {
  Champions,
  Abilities,
  Items,
  Augments,
  Projectiles,
  LootTables,
} from "@ggd/shared/sim/content/registry";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { fetchOverlayBundle, parseOverlayBundle, OVERLAY_BUNDLE_URL } from "./clientOverlay";
import { loadAllContent, __resetContentBoot } from "./bootContent";

const HASH = "h".repeat(64);
const MODEL = {
  id: "mock.model",
  schema: "model@1",
  glbPath: "assets/models/mock.glb",
  scale: 1,
  collisionRadius: 0.5,
  clipMap: { idle: "Idle", run: "Run", attack: "Atk", cast: "Cast", hurt: "Hurt", death: "Die" },
};
const ability = (slot: "Q" | "W" | "E" | "R") => ({
  id: `mockchamp.${slot.toLowerCase()}`,
  name: `技能${slot}`,
  slot,
  castType: "self" as const,
  maxRank: 5,
  cooldown: [5],
  manaCost: [50],
  range: 0,
  effects: [],
});
const CHAMPION = {
  id: "mockchamp",
  schema: "champion@1",
  name: "模擬英雄",
  role: "mage",
  attackType: "ranged",
  modelKey: "mock.model",
  baseStats: { ms: 6.5, maxHealth: 500 },
  growth: {},
  abilities: { Q: ability("Q"), W: ability("W"), E: ability("E"), R: ability("R") },
  skillOrder: ["Q", "W", "E", "R"],
  buildPriority: [],
  tags: ["mock"],
};

function clearRegistries(): void {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
}

describe("#189 客戶端內容覆蓋層 (client-content-overlay)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    clearRegistries();
    __resetContentBoot();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    clearRegistries();
    registerSkeletonContent();
    __resetContentBoot();
  });

  it("解析與 game-server 同形:只留 true 的墓碑,generation 非數字當 0", () => {
    cover("client-content-overlay");
    // 兩邊解析不一致 = 兩台機器從同一份 overlay 合併出不同的內容樹。
    const b = parseOverlayBundle({
      generation: "seven",
      docs: { "config/base-bonus": { id: "x" } },
      deleted: { "config/gore": true, "config/audio-map": false },
    });
    expect(b).not.toBeNull();
    expect(b!.generation).toBe(0);
    expect(b!.deleted).toEqual({ "config/gore": true });
    // 形狀不對就整個丟掉,而不是半信半疑地用
    expect(parseOverlayBundle({ docs: [], deleted: {} })).toBeNull();
    expect(parseOverlayBundle("nope")).toBeNull();
  });

  it("任何失敗都回 null —— overlay 是加速器,不是開機依賴", async () => {
    cover("client-content-overlay");
    for (const impl of [
      () => Promise.resolve({ ok: false, status: 503 } as Response),
      () => Promise.reject(new Error("offline")),
      () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error("not json")),
        } as unknown as Response),
    ]) {
      await expect(fetchOverlayBundle({ fetchFn: impl as typeof fetch })).resolves.toBeNull();
    }
  });

  it("空 overlay 也回 null —— 未編輯的主機載入的是原封不動的出貨內容", async () => {
    cover("client-content-overlay");
    const impl = (): Promise<Response> =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ generation: 3, docs: {}, deleted: {} }),
      } as unknown as Response);
    await expect(fetchOverlayBundle({ fetchFn: impl as typeof fetch })).resolves.toBeNull();
  });

  it("後台寫進 overlay 的 config doc,真的進到瀏覽器的 Configs 註冊表", async () => {
    cover("client-content-overlay");
    // 這條就是整個修法的行為證明。把它拿掉(或把 bootContent 的 overlay 那兩行
    // 刪掉),下面的 expect 會拿到出貨值 300 而不是操作者設的 777。
    const overlayDoc = { id: "base-bonus", schema: "config.base-bonus@1", bonus: { maxHealth: 777 } };
    const shippedDoc = { id: "base-bonus", schema: "config.base-bonus@1", bonus: { maxHealth: 300 } };
    const bundle = {
      schema: "content-bundle@1",
      contentVersion: "cv_overlaytest00",
      collections: {
        champions: { hash: HASH, entries: [{ id: "mockchamp", hash: HASH, doc: CHAMPION }] },
        abilities: {
          hash: HASH,
          entries: (["Q", "W", "E", "R"] as const).map((sl) => ({
            id: `mockchamp.${sl.toLowerCase()}`,
            hash: HASH,
            doc: { ...ability(sl), schema: "ability@1" },
          })),
        },
        models: { hash: HASH, entries: [{ id: "mock.model", hash: HASH, doc: MODEL }] },
        config: { hash: HASH, entries: [{ id: "base-bonus", hash: HASH, doc: shippedDoc }] },
      },
    };
    globalThis.fetch = vi.fn((input: unknown) => {
      const url = String(input);
      if (url === OVERLAY_BUNDLE_URL) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              generation: 9,
              docs: { "config/base-bonus": overlayDoc },
              deleted: {},
            }),
        } as unknown as Response);
      }
      if (url.split("?")[0] === "/content/bundle.json") {
        const body = JSON.stringify(bundle);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve(bundle as unknown),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as unknown as typeof fetch;

    const res = await loadAllContent();
    expect(res.ok, res.error).toBe(true);
    expect(res.overlayGeneration).toBe(9);
    const doc = Configs.tryGet("base-bonus") as unknown as { bonus: Record<string, number> };
    expect(doc.bonus.maxHealth, "後台的值沒有蓋過出貨值 —— overlay 沒被套用").toBe(777);
  });

  it("★ ⭐⭐ GH#736 AC —— 後台改一支**技能**，玩家端的 `Abilities` 註冊表真的變了", async () => {
    cover("client-content-overlay");
    /**
     * ⚠️ 上面那一條驗的是 **config** doc。⭐ 而 GH#736 的 AC 逐字是
     * 「線上 admin 新增/修改一支**技能** → 不重啟容器 → 新開一場，
     *  玩家的**卡面與技能行為**反映改動」——
     * ⛔ 那是**另一個集合**（`abilities`），走**另一個註冊表**（`Abilities`）。
     *
     * ⭐ 而它接手的 #127 逐字說的正是「新技能在玩家端**不存在**」。
     * ⇒ ⛔ 拿 config 那一條當作技能也通，是「兩條對的守衛、組合是空的」（形態⑪）。
     */
    const EDITED = "mockchamp.q";
    const shipped = { ...ability("Q"), schema: "ability@1", name: "出貨的名字" };
    const edited = { ...shipped, name: "操作者改過的名字", cooldown: [9, 9, 9, 9, 9] };
    const bundle = {
      schema: "content-bundle@1",
      contentVersion: "cv_overlayabil0",
      collections: {
        champions: { hash: HASH, entries: [{ id: "mockchamp", hash: HASH, doc: CHAMPION }] },
        abilities: {
          hash: HASH,
          entries: (["Q", "W", "E", "R"] as const).map((sl) => ({
            id: `mockchamp.${sl.toLowerCase()}`,
            hash: HASH,
            doc: sl === "Q" ? shipped : { ...ability(sl), schema: "ability@1" },
          })),
        },
        models: { hash: HASH, entries: [{ id: "mock.model", hash: HASH, doc: MODEL }] },
        config: { hash: HASH, entries: [] },
      },
    };
    globalThis.fetch = vi.fn((input: unknown) => {
      const url = String(input);
      if (url === OVERLAY_BUNDLE_URL) {
        return Promise.resolve({
          ok: true,
          json: () =>
            // ⭐ key 的形狀與 config 那一條一樣：`<collection>/<id>`。
            Promise.resolve({ generation: 11, docs: { [`abilities/${EDITED}`]: edited }, deleted: {} }),
        } as unknown as Response);
      }
      if (url.split("?")[0] === "/content/bundle.json") {
        const body = JSON.stringify(bundle);
        return Promise.resolve({
          ok: true, status: 200,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve(bundle as unknown),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as unknown as typeof fetch;

    const res = await loadAllContent();
    expect(res.ok, res.error).toBe(true);
    expect(res.overlayGeneration).toBe(11);
    const got = Abilities.tryGet(EDITED as never) as unknown as {
      name: string; cooldown: number[];
    };
    // ⭐ 量尺先自證：這一支真的在註冊表裡（⛔ 不然 undefined 會讓斷言變成空過）
    expect(got, "⛔ 那支技能根本不在玩家端的註冊表裡 —— #127 逐字的症狀").toBeTruthy();
    expect(got.name, "⛔ 卡面沒變 ⇒ overlay 對 abilities 這個集合沒有生效").toBe("操作者改過的名字");
    expect(got.cooldown[0], "⛔ **行為**沒變（AC 要的是卡面 **與** 技能行為兩者）").toBe(9);
  });

  it("壞掉的 overlay **不會**把客戶端打到骨架內容 —— 退回出貨樹", async () => {
    cover("client-content-overlay");
    // ⚠️ 這條補的是一個非對稱:game-server 從 #189 起就有這個退路
    // (index.ts loadFrom("overlay") → retry "shipped"),客戶端沒有。
    // 沒有它的話,操作者一次壞編輯會讓**伺服器健康、每一個瀏覽器掉到 2 隻英雄**
    // 的骨架內容 —— 玩家看到的是整個遊戲壞了,而每一項伺服器檢查都說正常。
    const badDoc = { id: "base-bonus", schema: "config.base-bonus@1", bonus: "not-an-object" };
    const shippedDoc = { id: "base-bonus", schema: "config.base-bonus@1", bonus: { maxHealth: 300 } };
    const bundle = {
      schema: "content-bundle@1",
      contentVersion: "cv_overlaybad0",
      collections: {
        champions: { hash: HASH, entries: [{ id: "mockchamp", hash: HASH, doc: CHAMPION }] },
        abilities: {
          hash: HASH,
          entries: (["Q", "W", "E", "R"] as const).map((sl) => ({
            id: `mockchamp.${sl.toLowerCase()}`,
            hash: HASH,
            doc: { ...ability(sl), schema: "ability@1" },
          })),
        },
        models: { hash: HASH, entries: [{ id: "mock.model", hash: HASH, doc: MODEL }] },
        config: { hash: HASH, entries: [{ id: "base-bonus", hash: HASH, doc: shippedDoc }] },
      },
    };
    globalThis.fetch = vi.fn((input: unknown) => {
      const url = String(input);
      if (url === OVERLAY_BUNDLE_URL) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ generation: 4, docs: { "config/base-bonus": badDoc }, deleted: {} }),
        } as unknown as Response);
      }
      if (url.split("?")[0] === "/content/bundle.json") {
        const body = JSON.stringify(bundle);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(body),
          json: () => Promise.resolve(bundle as unknown),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as unknown as typeof fetch;

    const res = await loadAllContent();
    // 遊戲**能玩** —— 這是最重要的那一條
    expect(res.ok, res.error).toBe(true);
    expect(Champions.ids()).toContain("mockchamp");
    // 而且出貨值真的在(不是骨架的 2 隻英雄)
    const doc = Configs.tryGet("base-bonus") as unknown as { bonus: Record<string, number> };
    expect(doc.bonus.maxHealth).toBe(300);
    // ⚠️ 但這件事**不可以是無聲的**:操作者的編輯沒生效必須看得見。
    expect(res.overlayError, "壞 overlay 被吞掉了,沒有任何地方會說").toBeTruthy();
    expect(res.overlayGeneration, "被拒絕的 overlay 不該報告成套用成功").toBeUndefined();
  });

  it("disableOverlay 時完全不打那個端點 —— 斷言出貨樹的測試不會被 overlay 干擾", async () => {
    cover("client-content-overlay");
    const seen: string[] = [];
    globalThis.fetch = vi.fn((input: unknown) => {
      seen.push(String(input));
      return Promise.resolve({ ok: false, status: 404 } as Response);
    }) as unknown as typeof fetch;
    await loadAllContent({ disableOverlay: true });
    expect(seen).not.toContain(OVERLAY_BUNDLE_URL);
  });
});
