/**
 * ⭐ GH#1116 —— CDN 那一格開關**真的被讀**，而且**兩個方向都驗**。
 *
 * ## ⛔ 這條閘防的是什麼
 *
 * 本文件記過三次「**三個住處齊全 ≠ 已上線**」：
 * config ＋ Zod ＋ admin 都有，而**沒有任何一行 production 程式讀那一格**
 * ⇒ 那格開關是裝飾（`ap-coefficient.enabled` 活了 4 天、`cast-approach.enabled`
 * 零寫入端、`ui-cues.commsWheel.enabled` 回傳物件根本沒有那一格）。
 *
 * ⇒ ⭐ 這一條就是**第四個住處的證據**。
 *
 * ## ⭐ 兩個方向（票的 AC3 逐字）
 *
 * > 「`enabled=false` ⇒ 素材仍載得出來（⭐ **兩個方向都要驗**，⛔ 不是只驗開著那一邊）」
 *
 * ⚠️ 一把只驗過單邊的尺不算自證過 —— 本文件記過同族四次
 * （NullEngine 的 `_releaseTexture` 是空的、canvas 背後緩衝、`readPixels` 讀到上一幀）。
 *
 * 突變驗證（2026-09-09）：
 *   · `cdnAssetUrl` 的 `if (!cdn?.enabled …)` 改成永遠回 null → 第 2 條紅
 *   · 拿掉 `withContentVersion` 裡呼叫 `cdnAssetUrl` 的那兩行 → 第 2 條紅
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  cdnAssetUrl,
  needsSignedUrl,
  setAssetCdn,
  setAssetDownloads,
  signedUrlTtlSec,
  withContentVersion,
} from "./assetVersion";

const OFF = { enabled: false, baseUrl: "", fallbackToLocal: true };
const ON = { enabled: true, baseUrl: "https://d123.cloudfront.net", fallbackToLocal: true };
const ASSET = "/content/assets/icons/champions/godie-e001.webp";

describe("素材 CDN 開關的消費端（GH#1116）", () => {
  beforeEach(() => setAssetCdn(OFF));

  it("① 關著 ⇒ 素材走站台自己（⭐ 出貨預設，⛔ 這一邊也要驗）", () => {
    setAssetCdn(OFF);
    expect(cdnAssetUrl(ASSET), "關著卻組出了 CDN 網址").toBeNull();
    expect(withContentVersion(ASSET), "關著時網址不可以指向別的網域").not.toContain("cloudfront");
    expect(withContentVersion(ASSET).startsWith("/content/assets/"), "關著時應該還是站台的相對路徑").toBe(true);
  });

  it("② 打開 ⇒ 素材真的改走 CDN（⭐ 這是「有沒有上線」的證據）", () => {
    setAssetCdn(ON);
    expect(cdnAssetUrl(ASSET), "打開了卻沒有組出 CDN 網址 —— 那一格開關是裝飾").toBe(`${ON.baseUrl}${ASSET}`);
    const url = withContentVersion(ASSET);
    expect(url.startsWith(ON.baseUrl), `打開了而 withContentVersion 回 ${url} —— 消費端沒有讀那一格`).toBe(true);
  });

  it("③ 打開但沒有 baseUrl ⇒ ⛔ 不可以組出壞網址（退回站台）", () => {
    setAssetCdn({ enabled: true, baseUrl: "", fallbackToLocal: true });
    expect(cdnAssetUrl(ASSET), "空的 baseUrl 組出了網址 ⇒ 全站會指向一個不存在的網域").toBeNull();
  });

  it("④ 非素材路徑不碰（⛔ 不要把 API 或 JSON 網址也丟去 CDN）", () => {
    setAssetCdn(ON);
    expect(cdnAssetUrl("/api/v1/rooms")).toBeNull();
    expect(cdnAssetUrl("/content/champions/_index.json")).toBeNull();
    expect(cdnAssetUrl("blob:abc")).toBeNull();
  });
});

describe("素材簽署網址的消費端（GH#1124 第 4 項）", () => {
  it("① 關著 ⇒ ⛔ 不走簽署網址（⭐ 出貨預設，⛔ 這一邊也要驗）", () => {
    setAssetDownloads({ enabled: false, signedUrlTtlSec: 900 });
    expect(needsSignedUrl(ASSET), "關著卻說要簽 —— 而正式站今天簽不出來").toBe(false);
  });

  it("② 打開 ⇒ 素材真的要簽（⭐ 這是「那一格開關不是裝飾」的證據）", () => {
    setAssetDownloads({ enabled: true, signedUrlTtlSec: 900 });
    expect(needsSignedUrl(ASSET), "打開了卻不簽 —— 消費端沒有讀那一格").toBe(true);
  });

  it("③ 非素材路徑不簽（⛔ API 與 JSON 走站台自己）", () => {
    setAssetDownloads({ enabled: true, signedUrlTtlSec: 900 });
    expect(needsSignedUrl("/api/v1/rooms")).toBe(false);
    expect(needsSignedUrl("/content/champions/_index.json")).toBe(false);
  });

  it("④ TTL 讀得到，⭐ 而缺席時有出貨預設（⛔ 不是 NaN）", () => {
    setAssetDownloads({ enabled: true, signedUrlTtlSec: 300 });
    expect(signedUrlTtlSec()).toBe(300);
  });
});
