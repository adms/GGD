/**
 * 戰鬥開場報地名（owner 2026-08-14）—— 一條薄守衛（體驗層，⛔ 不開對抗輪）。
 *
 * ⭐ 斷言讀的是 **`renderToStaticMarkup` 吐出來的字**，⛔ 不是「某個變數等於
 * 某個字串」。地圖名算對了但沒畫到畫面上，是這個 repo 的失敗形態①。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DEFAULT_MAP_INTRO, resolveMapSpec } from "@ggd/shared/content";
import { MapIntroView } from "./MapIntroOverlay";
import { mapIntroLifetime } from "./mapIntroModel";

const T0 = 1_000_000;

describe("戰鬥開場報地名", () => {
  it("★ 地圖名真的印在畫面上（刪掉那個 <span> 這條就紅）", () => {
    const life = mapIntroLifetime(T0, T0, DEFAULT_MAP_INTRO)!;
    expect(life.phase).toBe("live");
    const html = renderToStaticMarkup(createElement(MapIntroView, { name: "無限城", life }));
    expect(html).toContain("無限城");
    expect(html).toContain("戰場");
    // ⛔ 永遠不吃點擊 —— 開場提示一出現戰鬥就開始了。
    expect(html).toContain("pointer-events:none");
  });

  it("★ 停留 → 淡出 → 消失，而且**由欄位決定**（把 holdSec 改成 0 這條就紅）", () => {
    const r = DEFAULT_MAP_INTRO;
    const holdMs = r.holdSec * 1000;
    // 停留期間恆為不透明
    expect(mapIntroLifetime(T0, T0 + holdMs - 1, r)).toEqual({ phase: "live", opacity: 1 });
    // 過了停留就開始淡
    const mid = mapIntroLifetime(T0, T0 + holdMs + r.fadeSec * 500, r)!;
    expect(mid.phase).toBe("out");
    expect(mid.opacity).toBeGreaterThan(0);
    expect(mid.opacity).toBeLessThan(1);
    // 淡完就不畫
    expect(mapIntroLifetime(T0, T0 + holdMs + r.fadeSec * 1000 + 1, r)).toBeNull();
    // 關掉就一律不畫；時鐘倒退（OS 校時）也不畫，⛔ 不會卡住一個不消失的提示
    expect(mapIntroLifetime(T0, T0, { ...r, enabled: false })).toBeNull();
    expect(mapIntroLifetime(T0, T0 - 1, r)).toBeNull();
    // 還沒開打
    expect(mapIntroLifetime(null, T0, r)).toBeNull();
  });

  it("★ 出貨的 map-spec.json 真的帶著這一區塊，而且預設是開的（三個住處的 drift）", () => {
    const doc: unknown = JSON.parse(
      readFileSync(fileURLToPath(new URL("../../../../../content/config/map-spec.json", import.meta.url)), "utf8"),
    );
    expect(resolveMapSpec(doc as never).intro).toEqual(DEFAULT_MAP_INTRO);
    expect(DEFAULT_MAP_INTRO.enabled).toBe(true);
  });
});
