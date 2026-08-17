/**
 * 每一階寶具的**出現窗口**，真的有一個回合會發寶具嗎？
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 這條守衛擋的是「兩個名詞各自都對，只有它們的關係是空的」
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-08-18 量到的：`weaponTiers` 的 `ex-origin` 寫 `minRound: 10`，而出貨的
 * `rounds` 裡**只有第 2、5 回合**有 `weaponLootTable`。兩份設定各自都通過驗證、
 * `pnpm content:build` 全綠、池檔存在、白名單有它 —— 而 [EX∅ 根源] 在結構上
 * **永遠不可能出現**，因為寶具三選一只在「那一回合有 weaponLootTable」時才發生
 *（`MatchController` 的 `if (grant?.weaponLootTable && …)`）。
 *
 * ⛔ 沒有任何既有守衛會紅：`weaponTierTables.test.ts` 驗「那張池檔存在」，
 * `starter_content_test.go` 驗「池裡每一件都在白名單上」—— 兩個名詞都是對的。
 * owner 2026-08-18：「EX根源是最終回合大戰前會出現的類別…**請確定一定有出現的
 * 機會至少一次**」。這一條就是那句話的機械版。
 *
 * ⭐ 判準**兩份資料都用推導的**（⛔ 不抄回合號碼、⛔ 不抄階級 id）：
 * 對每一個 `weaponTiers[i]`，`[minRound, maxRound]` 這個閉區間裡至少要有一個
 * 回合在 `rounds` 上排了 `weaponLootTable`。
 *
 * 突變紀錄（2026-08-18 真的跑過）：把 `content/config/arena-rules.json` 的
 * `rounds["10"].weaponLootTable` 拿掉 ⇒ **1 紅**，訊息指名 `ex-origin` 與它的
 * 窗口 10..10。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader } from "@ggd/shared/content";
import type { ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { rulesFromDoc } from "./arenaRules";
import { FINAL_ROUND } from "./PairedDuels";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

let DOC: ConfigArenaRulesDoc;

beforeAll(async () => {
  const loaded = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  DOC = loaded.store.get<ConfigArenaRulesDoc>("config", "arena-rules");
});

describe("寶具階級的出現窗口 ⇔ 真的會發寶具的回合", () => {
  it("★ 每一階的回合窗口裡，至少有一個回合真的排了 weaponLootTable", () => {
    cover("weapon-tier-window-reachable");
    const rules = rulesFromDoc(DOC);
    // 真的會發寶具的回合 = `rounds` 上帶著 weaponLootTable 的那些（退場的表已經
    // 被 `rulesFromDoc` 剝掉了，所以這裡讀到的就是玩家那一場真的會拿到卡的回合）。
    const dealing = [...rules.rounds.entries()]
      .filter(([, g]) => g.weaponLootTable !== undefined)
      .map(([round]) => round)
      .sort((a, b) => a - b);
    expect(dealing.length, "沒有任何一個回合排寶具 —— 三選一整個機制是關著的").toBeGreaterThan(0);

    const unreachable = rules.weaponTiers
      .filter((t) => {
        const hi = t.maxRound ?? Number.POSITIVE_INFINITY;
        return !dealing.some((r) => r >= t.minRound && r <= hi);
      })
      .map((t) => `${t.id}（窗口 ${t.minRound}..${t.maxRound ?? "∞"}）`);
    expect(
      unreachable,
      `這幾階永遠不會出現：它們的回合窗口裡沒有任何一個回合排了 weaponLootTable。` +
        `真的會發寶具的回合是 [${dealing.join(", ")}]。` +
        `修法是給窗口內某個回合補上 weaponLootTable（那一格同時是保底池），⛔ 不是放寬這條守衛。`,
    ).toEqual([]);
  });

  it("★ 沒有任何一階的窗口落在最終回合之後 —— 那裡不再有比賽", () => {
    cover("weapon-tier-window-reachable");
    // owner 2026-08-18：「我早就已經把第十回合作為最終回合…打完就全部結算了」。
    // 一個 minRound > FINAL_ROUND 的階級跟指向不存在的池是同一種空。
    const past = rulesFromDoc(DOC)
      .weaponTiers.filter((t) => t.minRound > FINAL_ROUND)
      .map((t) => `${t.id}（minRound ${t.minRound} > 終局 ${FINAL_ROUND}）`);
    expect(past, "這幾階排在最終回合之後，而比賽在那時已經結算").toEqual([]);
  });
});
