/**
 * 英靈殿的**出貨夾具** —— GH#1251 / #1258 / #1250 三張票共用的那一份（⛔ 不各寫一份載入）。
 *
 * ⭐ 餵進去的全是出貨的東西（失敗形態⑤：被測的要是出貨的那個）：
 *   · 內容：真的 `content/` 樹，經瀏覽器同一條 `HttpContentSource`（fetch 換成讀磁碟），
 *     ContentLoader 照樣跑嚴格 Zod ⇒ schema 不認得的欄位在這裡就會炸
 *   · 名單：出貨的 `valhallaRoster()`，白名單取 tracked 的 `starter.go`（線上白名單是
 *     `.gitignore` 的營運狀態）與 `NO_FILTER`（平台連不上 / localhost）兩條路
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import { HttpContentSource } from "@ggd/shared/content";
import { readStarterRoster } from "@ggd/shared/testkit/starterRoster";
import { __resetContentBoot, ensureContentLoaded } from "../../content/bootContent";
import { NO_FILTER, whitelistFromDoc, type Whitelist } from "../panels/champSelectFilter";
import { valhallaRoster } from "./valhalla";

export const REPO = fileURLToPath(new URL("../../../../../", import.meta.url));
const CONTENT = join(REPO, "content");

function diskFetch(): typeof fetch {
  return ((input: unknown) => {
    const url = String(input).split("?")[0]!;
    const file = url.startsWith("/content/") ? join(CONTENT, url.slice("/content/".length)) : "";
    if (file === "" || !existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    const body = JSON.parse(readFileSync(file, "utf8")) as unknown;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }) as unknown as typeof fetch;
}

export interface ValhallaShipped {
  /** `starter.go` 近似的白名單 */
  starter: Whitelist;
  /** 兩條路的英靈殿名單聯集（去重，保持出現順序） */
  roster: string[];
}

/** 載入出貨內容並算出英靈殿名單。在 `beforeAll` 裡呼叫一次。 */
export async function loadShippedValhalla(): Promise<ValhallaShipped> {
  __resetContentBoot();
  const fn = diskFetch();
  vi.stubGlobal("fetch", fn);
  const boot = await ensureContentLoaded({
    source: new HttpContentSource({ baseUrl: "/content", fetchFn: fn }),
    disableOverlay: true,
  });
  if (!boot.ok) throw new Error("⛔ 出貨內容載入失敗（退回骨架）—— 下面每一條都會在量空氣");
  const starter = whitelistFromDoc({ champions: readStarterRoster(REPO) });
  const roster = [...new Set([...valhallaRoster(starter), ...valhallaRoster(NO_FILTER)])];
  return { starter, roster };
}
