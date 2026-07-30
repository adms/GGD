/**
 * 商店經濟 —— **存一個新價格 → 真的客戶端讀取器讀回來 → 玩家看到的東西真的變了**。
 *
 * ── 為什麼這個檔案存在 ──────────────────────────────────────────────────────
 * 2026-07-30 實測：把 `ui/StoreEconomyPage.tsx` 整個換成 `() => null`，
 * `apps/admin` 的 66 個檔 / 921 條測試**全綠**。也就是說這一頁哪天被改壞、變成
 * 一個什麼都不做的空殼，CI 不會有任何反應，而操作者會以為他改的價格生效了。
 *
 * `storeEconomy.test.ts` 守的是純函式（`parseUnlockCost` / `storeDocFor` / …），
 * 它對這種缺陷**完全免疫**：所有函式都可以是對的，而沒有一個 byte 離開瀏覽器。
 * 這正是 #241 的形狀 —— 那次是後半段（Go 讀錯地方），這次守的是前半段。
 *
 * 所以這一支從**畫面**開始：
 *
 *   1. 掛真的 `StoreEconomyPage`（headless React），在真的 `data-field` 控制項打字
 *   2. 按真的儲存鈕 → 走真的 `putOverlayDoc`（**只** mock 掉 `api.request`），
 *      所以 `validateOverlayDoc` 那個 Zod 閘（`config.store@1`、`.strict()`）
 *      是真的跑過的
 *   3. 攔下要送上線的那份 JSON，`JSON.parse(JSON.stringify(...))` 過一遍
 *      （模擬它真的在網路與磁碟上來回一趟）
 *   4. 餵給**真的客戶端讀取器** —— `walletMeta.ts` 的 `normalizeWallet` /
 *      `pricesFromCatalog` / `lockStateOf` / `canAfford`，以及 `catalog.ts` 的
 *      `deriveStoreRows`（大廳商店那一列的價格）
 *   5. 斷言的是**玩家看到的結果**（解鎖鈕上的數字、買不買得起、鎖不鎖）
 *      而不是「某個欄位等於某個值」（第⑦種故障：掃屬性代替掃行為）
 *
 * ⚠️⚠️ **Go 那半沒有被這條守衛涵蓋 —— 這是刻意的，也是這條守衛的邊界。**
 * 出貨的真實路徑是：
 *
 *   overlay.json → `apps/platform/internal/wallet/economy.go`（每一次請求讀）
 *                → `Catalog.WithEconomy` → `wallet.PriceOf`
 *                → `GET /wallet` 的 `crystalUnlockCost`
 *                  與 `GET /store/catalog` 的 `champions[].price`
 *
 * Go 不在這個 lane 的範圍內，所以下面的 `goWirePayloads` 是**那一段的 TS 抄本**，
 * 不是被測的出貨程式碼（第⑤種故障：被測的不是出貨的那個）。它抄的規則只有兩條，
 * 都很短：`wallet.PriceOf`（在免費名單上 → 0，其餘一律 → UnlockCost）與
 * `meta.go` 的 `w.CrystalUnlockCost = s.UnlockCost()`。**Go 那一段自己的端到端
 * 守衛是 `apps/platform/internal/wallet/economy_api_test.go` 的
 * `TestOperatorPriceEditReachesGetWallet`（後台存一個價格 → `GET /wallet` 必須回
 * 那個價格）—— 如果那條被刪掉，這裡不會紅。**
 *
 * `goWirePayloads` 之後的每一行都是真的出貨模組。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { api, putOverlayDoc } from "./api";
import {
  SHIPPED_UNLOCK_COST,
  STORE_COLLECTION,
  STORE_DOC_ID,
  STORE_SCHEMA,
} from "./storeEconomy";
import { StoreEconomyPage } from "./ui/StoreEconomyPage";
import { mount, textOf, type Harness } from "./testkit/headlessUi";

// ── 真的消費端。相對路徑 import 是刻意的：這些就是玩家的瀏覽器載入的那幾支模組本人。
import {
  CRYSTAL_UNLOCK_COST,
  canAfford,
  lockStateOf,
  normalizeWallet,
  pricesFromCatalog,
  type MetaWallet,
} from "../../client/src/ui/panels/champselect/walletMeta";
import { deriveStoreRows } from "../../client/src/ui/platform/catalog";
import type { Catalog } from "../../client/src/ui/platform/types";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const { hookImpls } = await import("./testkit/headlessUi");
  const base = (actual["default"] ?? {}) as Record<string, unknown>;
  return { ...actual, ...hookImpls, default: { ...base, ...hookImpls } };
});

const TAG = "adminui-store-economy-save";
const SAVE = "儲存 Save";
const RESET = "回到出貨值";
const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * 出貨文件**本人**，不是測試捏的夾具。捏一份只有兩個鍵的假 store 文件，
 * 「`mcoinRewards` 有沒有被原封帶過去」那條守衛就會恆綠 —— 而那條守衛守的正好是
 * 「文件裡有東西是這一頁不編輯的」這件事。
 */
const SHIPPED_DOC = JSON.parse(
  readFileSync(`${REPO}content/config/store.json`, "utf8"),
) as Record<string, unknown>;

/**
 * 這個 deploy 真的開放的英雄。前 12 位是出貨的免費名單（所以畫面不會誤報 typo），
 * 後三位是要付費的 —— 「加進免費名單」與「留在統一價」兩邊都要有人，否則斷言方向
 * 跟缺陷無關（第④種故障）。
 */
const ROSTER: readonly string[] = [
  ...(SHIPPED_DOC["freeChampionIds"] as string[]),
  "godie-hblm", // 賈修
  "godie-efur", // 揍敵客
  "godie-hpal",
];

/** 新帳號的見面禮（平台的 GGD_NEW_ACCOUNT_CRYSTALS）—— 買不買得起要對著它算。 */
const WELCOME_CRYSTALS = 1000;

// ------------------------------------------------------ the wire (mocked) ---

/** 頁面送出去的每一份文件（PUT 的 body），以及它走的路徑。 */
const puts: { path: string; doc: Record<string, unknown> }[] = [];
let overlayDoc: unknown = null;

beforeEach(() => {
  puts.length = 0;
  overlayDoc = null;
  vi.restoreAllMocks();
  // ⚠️ **只** mock `api.request`。`putOverlayDoc` 本身是真的 —— 它裡面那個
  // `validateOverlayDoc` Zod 閘因此是真的跑過的，一份不合 `config.store@1` 的
  // 文件會在這裡就被擋掉（而不是被這個 mock 溫柔地收下）。
  vi.spyOn(api, "request").mockImplementation(
    async (path: string, opts?: { method?: string; body?: unknown }): Promise<never> => {
      if (path === "/content-overlay/bundle") {
        return (overlayDoc
          ? { docs: { [`${STORE_COLLECTION}/${STORE_DOC_ID}`]: overlayDoc } }
          : { docs: {} }) as never;
      }
      if (path.startsWith("/content-overlay/shipped/")) {
        return { present: true, hash: "deadbeef", doc: SHIPPED_DOC } as never;
      }
      if (path === "/curation/whitelist") {
        return { champions: [...ROSTER], items: [], abilities: [] } as never;
      }
      if (opts?.method === "PUT") {
        puts.push({ path, doc: JSON.parse(JSON.stringify(opts.body)) as Record<string, unknown> });
        return { generation: puts.length } as never;
      }
      return {} as never;
    },
  );
});

async function open(): Promise<Harness> {
  const h = mount(createElement(StoreEconomyPage));
  await h.flush();
  return h;
}

/** 儲存鈕現在按不按得下去。`click` 對停用的按鈕會丟例外，所以要先問。 */
function saveEnabled(h: Harness): boolean {
  const btn = h.hosts().find((n) => n.type === "button" && textOf(n.children).trim() === SAVE);
  if (!btn) throw new Error("頁面上沒有儲存鈕");
  return btn.props["disabled"] !== true;
}

// ------------------------------------------------------- the Go stand-in ----

interface WirePayloads {
  /** 這個帳號的 `GET /wallet` 會長什麼樣（未正規化的原始 payload）。 */
  wallet: Partial<MetaWallet>;
  /** 這個帳號的 `GET /store/catalog` 會長什麼樣。 */
  catalog: Catalog;
}

/**
 * 平台會依這份 store 文件送出什麼 —— 見檔頭那段警告：**這是 Go 的抄本，不是 Go**。
 *
 * 抄的兩條規則：
 *   • `wallet.PriceOf`（internal/wallet/catalog.go）：在免費名單上 → 0，
 *     其餘（包含目錄沒聽過的 id）→ 統一價。
 *   • `meta.go`：`w.CrystalUnlockCost = s.UnlockCost()`。
 */
function goWirePayloads(
  doc: Record<string, unknown>,
  opts: { owned?: readonly string[]; crystal?: number } = {},
): WirePayloads {
  const unlockCost = doc["championUnlockCost"] as number;
  const free = new Set(doc["freeChampionIds"] as string[]);
  const owned = opts.owned ?? [];
  const priceOf = (id: string): number => (free.has(id) ? 0 : unlockCost);
  return {
    wallet: {
      crystal: opts.crystal ?? WELCOME_CRYSTALS,
      crystalUnlockCost: unlockCost,
      ownedChampions: [...owned],
      favourites: [],
    },
    catalog: {
      champions: ROSTER.map((id) => ({ id, price: priceOf(id), owned: owned.includes(id) })),
      skins: [],
    },
  };
}

// --------------------------------------------------------------- the proof --

describe("後台存的值 → 客戶端真的讀取器 → 玩家看到的價格/鎖狀態", () => {
  it("把統一價從 300 改成 1200：解鎖鈕上的數字跟著變，而且新帳號從買得起變成買不起", async () => {
    cover(TAG);

    // ── baseline ──：出貨的 300 之下，見面禮 1000 水晶**買得起**一位英雄。
    // 沒有這一行的話，下面的 false 可能只是這個帳號本來就窮，斷言方向跟缺陷
    // 無關（第④種故障）。
    const shippedWallet = normalizeWallet(goWirePayloads(SHIPPED_DOC).wallet);
    expect(shippedWallet.crystalUnlockCost).toBe(SHIPPED_UNLOCK_COST);
    expect(canAfford(shippedWallet.crystal, shippedWallet.crystalUnlockCost)).toBe(true);

    const h = await open();
    h.type("championUnlockCost", "1200");

    // 頁面自己也必須說出這件事 —— 這個警告不是裝飾，它預告的正是下面那個 false。
    expect(h.text()).toContain("一位英雄都解不開");

    expect(saveEnabled(h)).toBe(true);
    h.click(SAVE);
    await h.flush();

    // ── 1. 真的送出去了，而且走的是覆蓋層的 PUT 路徑 ──
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe(`/content-overlay/docs/${STORE_COLLECTION}/${STORE_DOC_ID}`);
    const wire = puts[0]!.doc;
    expect(wire["schema"]).toBe(STORE_SCHEMA);
    expect(wire["championUnlockCost"]).toBe(1200);

    // ── 2. 真的客戶端讀取器把它讀回來 ──
    const wallet = normalizeWallet(goWirePayloads(wire).wallet);
    expect(wallet.crystalUnlockCost).toBe(1200);
    // 而且**不是**退回那個寫死的 fallback：客戶端還留著一份 300，
    // 讀取端一旦改成讀它，這一行就紅。
    expect(wallet.crystalUnlockCost).not.toBe(CRYSTAL_UNLOCK_COST);

    // ── 3. 玩家的行為真的變了 ──
    expect(canAfford(wallet.crystal, wallet.crystalUnlockCost)).toBe(false);

    // 畫面也回報寫入成功了（存了卻不說，跟沒存一樣難查）
    expect(h.text()).toContain("已寫入耐久覆蓋層");
  });

  it("把一位英雄加進免費名單：champ-select 的鎖狀態從 locked 變 free", async () => {
    cover(TAG);

    // ── baseline ──：出貨設定下，賈修是**要付費**的。
    const before = pricesFromCatalog(goWirePayloads(SHIPPED_DOC).catalog);
    expect(before.get("godie-hblm")).toBe(SHIPPED_UNLOCK_COST);
    expect(lockStateOf("godie-hblm", before, new Set())).toBe("locked");

    const h = await open();
    const shippedFree = SHIPPED_DOC["freeChampionIds"] as string[];
    h.type("freeChampionIds", [...shippedFree, "godie-hblm"].join("\n"));
    // roster 上有這個 id，所以不該有 typo 警告
    expect(h.text()).not.toContain("不在目前的開放名單裡");
    h.click(SAVE);
    await h.flush();

    const wire = puts[0]!.doc;
    expect(wire["freeChampionIds"]).toContain("godie-hblm");
    expect(wire["championUnlockCost"]).toBe(SHIPPED_UNLOCK_COST); // 價格沒被順手動到

    const after = pricesFromCatalog(goWirePayloads(wire).catalog);
    expect(after.get("godie-hblm")).toBe(0);
    expect(lockStateOf("godie-hblm", after, new Set())).toBe("free");

    // 沒被加進去的那位**還是**鎖著的 —— 否則「全部變免費」也會讓上面那行過。
    expect(after.get("godie-efur")).toBe(SHIPPED_UNLOCK_COST);
    expect(lockStateOf("godie-efur", after, new Set())).toBe("locked");
  });

  it("大廳商店那一列印出來的價格，就是後台存的那一個", async () => {
    cover(TAG);
    const h = await open();
    h.type("championUnlockCost", "777");
    h.click(SAVE);
    await h.flush();

    // `deriveStoreRows` 是大廳商店的英雄列真的走的那支（apps/client/.../catalog.ts）。
    const rows = deriveStoreRows(goWirePayloads(puts[0]!.doc).catalog, new Map());
    const paid = rows.find((r) => r.id === "godie-hblm")!;
    const free = rows.find((r) => r.id === "godie-hart")!; // 出貨免費名單上的
    expect(paid.price).toBe(777);
    expect(free.price).toBe(0);
  });

  it("只改價格時，這一頁不編輯的 mcoinRewards 被原封帶過去（少寫它 = 吃雞獎勵消失）", async () => {
    cover(TAG);
    // 線上已經有一份被改過名次獎勵的覆蓋層。
    const custom = { placement1: 5, placement2: 3, placement3: 2, placement4: 1 };
    overlayDoc = { ...SHIPPED_DOC, championUnlockCost: 450, mcoinRewards: custom };

    const h = await open();
    expect(h.field("championUnlockCost").props["value"]).toBe("450");
    h.type("championUnlockCost", "460");
    h.click(SAVE);
    await h.flush();

    // ⚠️ `mcoinRewards` 在 schema 上是必填 + `.strict()`，所以漏寫要嘛整份被 Zod
    // 擋下、要嘛（若驗證被繞過）讓吃雞的 M幣 靜靜消失。它不是這一頁的欄位，
    // 正因為如此才最容易在重寫存檔路徑時被丟掉。
    expect(puts[0]!.doc["mcoinRewards"]).toEqual(custom);
    expect(puts[0]!.doc["championUnlockCost"]).toBe(460);
    // 那半是 gamelink 開機時的 catalog 副本在讀，所以這裡只能守「有寫出去」，
    // 守不到「結算真的發 5 枚」—— 頁面上的文案也必須照這樣講（見下面那條）。
  });

  it("「回到出貨值」按下去之後存的，真的就是出貨的那份文件", async () => {
    cover(TAG);
    overlayDoc = { ...SHIPPED_DOC, championUnlockCost: 9999, freeChampionIds: [] };
    const h = await open();
    expect(h.field("championUnlockCost").props["value"]).toBe("9999");

    h.click(RESET);
    h.click(SAVE);
    await h.flush();

    const wire = puts[0]!.doc;
    expect(wire["championUnlockCost"]).toBe(SHIPPED_DOC["championUnlockCost"]);
    expect(wire["freeChampionIds"]).toEqual([...(SHIPPED_DOC["freeChampionIds"] as string[])].sort());

    // 真的回到出貨行為：見面禮又買得起了，而免費名單上的人又免費了。
    const wallet = normalizeWallet(goWirePayloads(wire).wallet);
    expect(canAfford(wallet.crystal, wallet.crystalUnlockCost)).toBe(true);
    expect(pricesFromCatalog(goWirePayloads(wire).catalog).get("godie-hart")).toBe(0);
  });
});

describe("這一頁不會說謊", () => {
  it("沒有任何編輯時儲存鈕是關的", async () => {
    cover(TAG);
    const h = await open();
    expect(saveEnabled(h)).toBe(false);
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(puts).toHaveLength(0);
  });

  it("超過 schema 上界時儲存鈕是關的 —— 存不出一個平台會拒收的價格", async () => {
    cover(TAG);
    const h = await open();
    h.type("championUnlockCost", "1000001"); // schema 上界 1,000,000
    expect(saveEnabled(h)).toBe(false);
    expect(() => h.click(SAVE)).toThrow(/disabled/);
    expect(puts).toHaveLength(0);
    expect(h.text()).toContain("不可超過");
  });

  it("免費名單打錯字時，畫面必須把那個 id 指出來", async () => {
    cover(TAG);
    // 打錯的 id 不會讓任何人免費，而它本來想指的那位英雄照樣收全額 ——
    // 兩邊都不會有錯誤訊息，所以唯一的提示就是這一頁。
    const h = await open();
    h.type("freeChampionIds", "godie-hart\ngodie-hjia");
    expect(h.text()).toContain("不在目前的開放名單裡");
    expect(h.text()).toContain("godie-hjia");
  });

  it("覆蓋層的值優先於出貨值被讀進畫面（線上是哪個值，畫面就是哪個值）", async () => {
    cover(TAG);
    overlayDoc = { ...SHIPPED_DOC, championUnlockCost: 111, freeChampionIds: ["godie-hart"] };
    const h = await open();
    expect(h.field("championUnlockCost").props["value"]).toBe("111");
    expect(h.field("freeChampionIds").props["value"]).toBe("godie-hart");
  });

  it("畫面必須寫著「mcoinRewards 要重新部署」，不可以把整份文件都說成即時生效", async () => {
    cover(TAG);
    // 解鎖價與免費名單走 economy.go 的每請求覆蓋，是即時的；`mcoinRewards` 走
    // gamelink 開機時的 catalog 副本，不是。把它一起說成即時 = #241 的形狀。
    const h = await open();
    const text = h.text();
    expect(text).toContain("mcoinRewards");
    expect(text).toContain("重新部署");
  });

  it("這一頁依賴的 Zod 閘是真的裝上去的：少一半的 store 文件會被擋在瀏覽器裡", async () => {
    cover(TAG);
    // 頁面自己不會產出這種文件（`storeDocFor` 一定寫整份），但這一條證明**閘門
    // 本身是通電的** —— 上面每一條 `putOverlayDoc` 走的都是同一道閘。
    await expect(
      putOverlayDoc(STORE_COLLECTION, STORE_DOC_ID, {
        id: STORE_DOC_ID,
        schema: STORE_SCHEMA,
        championUnlockCost: 300,
        freeChampionIds: [],
        // mcoinRewards 故意漏掉
      }),
    ).rejects.toThrow(/拒絕寫入/);
    expect(puts).toHaveLength(0);
  });
});
