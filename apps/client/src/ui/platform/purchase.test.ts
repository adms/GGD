/**
 * webui-06/07/08 (webui-store-buy / webui-store-402 / webui-store-409):
 * the store purchase state machine driven through ApiClient with a mocked
 * fetch — success updates the wallet; 402 insufficient_mcoin and 409
 * already_owned surface clearly and leave the machine recoverable.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { ApiClient, type TokenStorage } from "./session";
import {
  beginPurchase,
  cancelPurchase,
  executePurchase,
  purchaseIdle,
  purchaseErrorText,
  type PurchaseItem,
} from "./purchase";
import type { TokenPair, Wallet } from "./types";

const TOKENS: TokenPair = { accessToken: "acc", refreshToken: "ref", expiresIn: 900 };
const storage: TokenStorage = { load: () => TOKENS, save: () => undefined };
const ITEM: PurchaseItem = {
  kind: "skin",
  id: "skin.thorne.barbarian",
  name: "Warbringer Thorne",
  price: 750,
  currency: "mcoin",
};

/** #227: a champion is the CRYSTAL path — different wallet, different 402. */
const CHAMPION_ITEM: PurchaseItem = {
  kind: "champion",
  id: "godie-zombiex",
  name: "聖杯黑泥醬 - 喪標麥可",
  price: 300,
  currency: "crystal",
};

const WALLET_AFTER: Wallet = {
  mcoin: 250,
  crystal: 0,
  ownedChampions: ["sela", "thorne"],
  ownedSkins: ["skin.thorne.barbarian"],
  equippedSkins: { thorne: "skin.thorne.barbarian" },
};

function apiWith(status: number, body: unknown): ApiClient {
  const fetchFn = vi.fn(async () =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
  return new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage });
}

const buyVia =
  (api: ApiClient) =>
  (kind: "champion" | "skin", id: string): Promise<Wallet> =>
    api.request<Wallet>("/store/buy", { body: { kind, id } });

describe("purchase state machine — success (webui-06)", () => {
  it("idle → confirm → done(wallet) on a 200 buy", async () => {
    cover("webui-store-buy");
    const confirm = beginPurchase(purchaseIdle, ITEM);
    expect(confirm).toEqual({ phase: "confirm", item: ITEM });
    const done = await executePurchase(confirm, buyVia(apiWith(200, WALLET_AFTER)));
    expect(done.phase).toBe("done");
    if (done.phase === "done") {
      expect(done.wallet.mcoin).toBe(250);
      expect(done.wallet.equippedSkins.thorne).toBe("skin.thorne.barbarian"); // auto-equip
    }
    // dismissing the receipt returns to idle
    expect(cancelPurchase(done)).toEqual(purchaseIdle);
  });

  it("executePurchase only fires from confirm; cancel is a no-op while busy", async () => {
    cover("webui-store-buy");
    const busy = { phase: "busy" as const, item: ITEM };
    expect(await executePurchase(busy, buyVia(apiWith(200, WALLET_AFTER)))).toBe(busy);
    expect(cancelPurchase(busy)).toBe(busy);
    expect(beginPurchase(busy, ITEM)).toBe(busy);
  });
});

describe("purchase — 402 insufficient funds (webui-07)", () => {
  it("surfaces insufficient_mcoin with a friendly message and recovers", async () => {
    cover("webui-store-402");
    const confirm = beginPurchase(purchaseIdle, ITEM);
    const errState = await executePurchase(
      confirm,
      buyVia(apiWith(402, { error: { code: "insufficient_mcoin", message: "not enough M COIN" } })),
    );
    expect(errState).toMatchObject({ phase: "error", code: "insufficient_mcoin" });
    if (errState.phase === "error") {
      expect(errState.message).toContain("M幣");
      expect(errState.message).not.toContain("insufficient_mcoin");
    }
    // recoverable: dismiss then start a fresh purchase
    const again = beginPurchase(cancelPurchase(errState), ITEM);
    expect(again.phase).toBe("confirm");
  });
});

describe("#227 the champion path is 藍水晶, not M幣", () => {
  it("a champion 402 comes back as insufficient_crystal with the earn hint", async () => {
    cover("webui-store-402");
    const errState = await executePurchase(
      beginPurchase(purchaseIdle, CHAMPION_ITEM),
      buyVia(apiWith(402, { error: { code: "insufficient_crystal", message: "not enough crystals" } })),
    );
    expect(errState).toMatchObject({ phase: "error", code: "insufficient_crystal" });
    if (errState.phase === "error") {
      // BEFORE #227 this code was unknown and fell through to the raw server
      // string ("not enough crystals").
      expect(errState.message).not.toBe("not enough crystals");
      expect(errState.message).toContain("藍水晶");
      expect(errState.message).toContain("第一名翻倍"); // #213's earn hint, reused
      expect(errState.message).not.toContain("M幣");
    }
  });

  it("the item carries its own currency, and it is never the id that is shown", () => {
    cover("webui-store-buy");
    const confirm = beginPurchase(purchaseIdle, CHAMPION_ITEM);
    expect(confirm).toMatchObject({ phase: "confirm" });
    if (confirm.phase !== "confirm") return;
    expect(confirm.item.currency).toBe("crystal");
    expect(confirm.item.name).not.toBe(confirm.item.id); // the dialog prints `name`
    expect(ITEM.currency).toBe("mcoin"); // skins stay on M幣
  });
});

describe("purchase — 409 already owned (webui-08)", () => {
  it("surfaces already_owned clearly", async () => {
    cover("webui-store-409");
    const confirm = beginPurchase(purchaseIdle, ITEM);
    const errState = await executePurchase(
      confirm,
      buyVia(apiWith(409, { error: { code: "already_owned", message: "skin already owned" } })),
    );
    expect(errState).toMatchObject({ phase: "error", code: "already_owned" });
    if (errState.phase === "error") {
      expect(errState.message).toBe("你已經擁有這個項目了。");
    }
  });

  it("network failures map to a retryable error state", async () => {
    cover("webui-store-409");
    const failing = async (): Promise<Wallet> => {
      throw new TypeError("fetch failed");
    };
    const errState = await executePurchase(beginPurchase(purchaseIdle, ITEM), failing);
    expect(errState).toMatchObject({ phase: "error", code: "network" });
  });

  it("unknown store errors fall through with the server message", () => {
    cover("webui-store-409");
    expect(purchaseErrorText("weird_code", "server said no")).toBe("server said no");
    expect(purchaseErrorText("weird_code", "")).toBe("購買失敗，請稍後再試。");
  });
});
