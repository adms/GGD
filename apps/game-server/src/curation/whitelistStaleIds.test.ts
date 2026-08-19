/**
 * GH#471 —— 白名單指到**這個映像裡不存在的內容**時，要有一個擋不掉的地方喊。
 *
 * owner 2026-08-18：「本機 whitelist.json 仍列著 17 個已退場 id > which 17? **fix!**」
 * 量到的（2026-08-20）：110 筆 items 有 9 筆指不到 `content/items/`，⛔ 而且
 * **完全靜默** —— 白名單只收窄，所以一個指不到的 id 逐位元等於不存在。
 *
 * ⛔ 修法不是手刪那 9 個：`data/` 在 `.gitignore` 裡，而每一次把內容搬進 `_legacy`
 * 都會再長出一批。⭐ 要的是 fail-loud（CLAUDE.md「fail-open 沒錯，**靜默**才是缺陷」）。
 *
 * 這條守衛只問兩件事，兩件都是**機制**不是數字：
 *   ① 指不到的 id 會不會登記進 degradation registry（＝ 出現在 `/healthz`）
 *   ② 乾淨的白名單會不會把它收回（否則一次漂移之後 /healthz 永遠紅）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Champions, Items } from "@ggd/shared/sim/content/registry";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { hasWarned, resetWarnOnce, degradations } from "../config/platformUrl";
import { fetchWhitelist, type WhitelistDoc } from "./whitelist";

const KEY = "whitelist-stale-ids";

const serve = (doc: WhitelistDoc): typeof fetch =>
  (async () => new Response(JSON.stringify(doc), { status: 200 })) as typeof fetch;

const doc = (over: Partial<WhitelistDoc>): WhitelistDoc => ({
  version: 1,
  champions: [],
  items: [],
  abilities: [],
  ...over,
});

describe("白名單殘留 id 會 fail-loud（GH#471）", () => {
  beforeEach(() => {
    resetWarnOnce();
    registerSkeletonContent();
  });

  it("指不到出貨註冊表的 id 會登記成 degradation 並被逐一指名", async () => {
    // 骨架內容真的註冊過的一隻 + 一個已經搬進 _legacy 的道具 id。
    const alive = Champions.ids()[0]!;
    const shipped = Items.ids()[0]!;
    await fetchWhitelist("http://p", {
      bypass: false,
      fetchImpl: serve(doc({ champions: [alive], items: [shipped, "godie-i034"] })),
    });
    expect(hasWarned(KEY)).toBe(true);
    const msg = degradations().find((d) => d.key === KEY)?.message ?? "";
    expect(msg).toContain("godie-i034");
    // ⛔ 還活著的那兩個不可以被指名 —— 否則這條守衛對「全部都算殘留」也會過。
    expect(msg).not.toContain(shipped);
    expect(msg).not.toContain(alive);
  });

  it("下一份乾淨的白名單會把它收回", async () => {
    const opts = { bypass: false };
    await fetchWhitelist("http://p", { ...opts, fetchImpl: serve(doc({ items: ["godie-i034"] })) });
    expect(hasWarned(KEY)).toBe(true);
    await fetchWhitelist("http://p", {
      ...opts,
      fetchImpl: serve(doc({ items: [Items.ids()[0]!] })),
    });
    expect(hasWarned(KEY)).toBe(false);
  });
});
