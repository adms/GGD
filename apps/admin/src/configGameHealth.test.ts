/**
 * GH#122 —— 「線上 tick 健康度還沒有人讀」的第一個原因是**後台沒有入口**。
 *
 * 這條收的是**兩個名詞的關係**，不是「有沒有這張卡」：
 * game shard 的 `/healthz`（`sim` 那一區）只綁在 127.0.0.1:2567，而 edge 的
 * `location = /healthz` 是 nginx 自己回一句靜態 "ok" —— 所以正式站上瀏覽器
 * **不可能**讀到它。一張在正式站上永遠 ping 不到的卡不是「多一個入口」，它是
 * 一台看起來掛掉的 game shard（第一·五守則：卡片上不可以有不會發生的字）。
 *
 * ── 突變（做過）────────────────────────────────────────────────────────────
 * `PROD_PRESET.gameHealth` 從 `""` 改成 `"/healthz"` → 第二條紅，訊息就是
 * 「正式站畫了一張讀不到的健康卡」。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { resolveHubLinks } from "./config";

const cardIn = (mode: "dev" | "prod", env = {}) =>
  resolveHubLinks(env, mode).find((l) => l.key === "gameHealth") ?? null;

describe("對戰引擎健康卡 (adminui-hub-config · GH#122)", () => {
  it("⭐ 開發機上有入口，而且指向 game shard 自己的 /healthz（sim 就住在裡面）", () => {
    cover("adminui-hub-config");
    const card = cardIn("dev");
    expect(card, "後台仍然沒有任何一頁看得到 sim 區塊").not.toBeNull();
    expect(card!.url).toContain("/healthz");
    expect(card!.healthUrl, "有網址卻不 ping = 卡片自己不知道自己通不通").toBe(card!.url);
  });

  it("⛔ 正式站不畫這張卡 —— edge 的 /healthz 回的是靜態 ok，不是 sim", () => {
    cover("adminui-hub-config");
    expect(cardIn("prod"), "正式站畫了一張讀不到的健康卡").toBeNull();
  });

  it("有人替它開了 proxy，VITE_GAME_HEALTH_URL 就把卡片叫回來", () => {
    cover("adminui-hub-config");
    const card = cardIn("prod", { VITE_GAME_HEALTH_URL: "/sim/healthz" });
    expect(card?.url).toBe("/sim/healthz");
  });
});
