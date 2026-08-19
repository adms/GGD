/**
 * championRetirement.test.ts — 「下架的英雄真的拿不到」的守衛。
 *
 * ⚠️ 這一份刻意**不掃原始碼字串**（CLAUDE.md 失敗形態 ⑥），而是：
 *   ① 對出貨的 `content/config/roster.json` 跑真的 Zod（不是相信它長得對）
 *   ② 對真的 registry 內容驗「這兩隻確實存在、而且確實壞掉」——
 *      下架一個不存在的 id 是無聲的 no-op，而那正是這種清單最常見的腐爛方式
 *   ③ 驗那條規則在 **fail-open 路徑**上也成立，因為那是它存在的唯一理由
 *
 * ⚠️ ② 是這份檔案最重要的一條。「清單裡有兩個字串」是屬性（失敗形態 ⑦）；
 * 「這兩個字串指到的英雄真的在 registry 裡」才是行為 —— 打錯一個字母，
 * 下架就靜默失效，而所有其他斷言照樣全綠。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zConfigRosterDoc } from "./schema/config";
import {
  ROSTER_SCHEMA,
  isRetiredChampionId,
  retiredChampionIdsFromDoc,
} from "./championRetirement";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ROSTER_PATH = join(REPO, "content/config/roster.json");

function shippedRosterDoc(): unknown {
  return JSON.parse(readFileSync(ROSTER_PATH, "utf8"));
}

describe("① 出貨的 roster.json 本身合法", () => {
  it("★ 通過 config.roster@1 的嚴格 Zod（不是「看起來對」）", () => {
    const parsed = zConfigRosterDoc.safeParse(shippedRosterDoc());
    expect(
      parsed.success,
      `content/config/roster.json 過不了 schema：${
        parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2)
      }`,
    ).toBe(true);
  });

  it("★ owner 2026-07-30/08-02 指名的兩隻都在清單裡", () => {
    const retired = retiredChampionIdsFromDoc(shippedRosterDoc());
    // 名字寫在斷言裡是刻意的：有人把 id 刪掉時，失敗訊息要說得出「你剛剛把誰放回去了」。
    expect(retired.has("godie-e00u"), "十六夜Sakuya 應該是下架的").toBe(true);
    expect(retired.has("godie-u01f"), "黑化張飛 應該是下架的").toBe(true);
  });
});

describe("② 清單裡的 id 真的指到 registry 裡的英雄（不是打錯的死字串）", () => {
  /**
   * ⭐ 2026-08-20（GH#479）：找的是**兩棵樹**，⛔ 不只是 `content/champions/`。
   * owner 這一天把退場英雄搬進 `content/_legacy/`（「不要再被掃到」），所以
   * 「下架 id 指到一份真的存在的文件」這個性質的答案在兩棵樹的聯集上。
   * ⚠️ 這一條驗的仍然是**打錯字**（下架靜默失效），⛔ 不是「它住在哪」——
   * 「住在哪」由 `legacyIsolation.test.ts` 的四條關係管。
   */
  it("★ 每一個下架 id 都指到一份真的存在的英雄文件（content/ 或 _legacy/）", () => {
    const retired = [...retiredChampionIdsFromDoc(shippedRosterDoc())];
    expect(retired.length, "清單是空的 —— 這條守衛已經變成真空").toBeGreaterThan(0);
    const missing = retired.filter(
      (id) =>
        !["content/champions", "content/_legacy/champions"].some((dir) =>
          existsSync(join(REPO, dir, `${id}.json`)),
        ),
    );
    expect(
      missing,
      `下架清單指到不存在的英雄：${missing.join(", ")}。\n` +
        "打錯一個字母 = 下架靜默失效，而其他每一條斷言都會照樣綠。",
    ).toEqual([]);
  });

  it("★ 下架的理由還成立：這兩隻的 QWER 確實是空技能", () => {
    // ⚠️ 這一條是「為什麼」而不是「是什麼」。技能補完之後它會紅，而那時候正確的
    // 反應是**把 id 從 roster.json 拿掉**（重新上架），不是改這條測試。
    for (const id of ["godie-e00u", "godie-u01f"]) {
      const slots = ["q", "w", "e", "r"];
      const names = slots.map((s) => {
        // GH#479：這兩隻的技能檔已經搬進 `_legacy/`，理由本身一個字都沒變。
        const dir = ["content/abilities", "content/_legacy/abilities"].find((d) =>
          existsSync(join(REPO, d, `${id}.${s}.json`)),
        );
        expect(dir, `${id}.${s} 兩棵樹都找不到 —— 下架 ≠ 刪除`).toBeDefined();
        const doc = JSON.parse(readFileSync(join(REPO, dir!, `${id}.${s}.json`), "utf8")) as {
          name?: string;
        };
        return doc.name;
      });
      expect(
        names.every((n) => n === "none"),
        `${id} 的 QWER 已經不是空技能了（${names.join(", ")}）——\n` +
          "如果它做完了，正確做法是把它從 content/config/roster.json 拿掉重新上架。",
      ).toBe(true);
    }
  });
});

describe("③ 規則在 fail-open 路徑上也成立 —— 這是它存在的唯一理由", () => {
  it("★ 缺文件 = 沒有人下架（不是「全部下架」）", () => {
    // 反過來會讓一次內容載入失敗變成「選人畫面整個空掉」，也就是 2026-08-01 的事故。
    expect(retiredChampionIdsFromDoc(undefined).size).toBe(0);
    expect(retiredChampionIdsFromDoc(null).size).toBe(0);
    expect(retiredChampionIdsFromDoc({}).size).toBe(0);
  });

  it("★ schema 標籤不對的文件不算數", () => {
    expect(
      retiredChampionIdsFromDoc({ schema: "config.stealth@1", retiredChampions: ["x"] }).size,
    ).toBe(0);
  });

  it("★ 陣列裡的非字串 / 空字串被丟掉", () => {
    const got = retiredChampionIdsFromDoc({
      schema: ROSTER_SCHEMA,
      retiredChampions: ["ok", "", 7, null, "ok2"],
    });
    expect([...got].sort()).toEqual(["ok", "ok2"]);
  });

  it("★ registry 沒載內容時 isRetiredChampionId 不會爆（回 false）", () => {
    // 開機到 bootContent 之間有一段 Configs 是空的。那段時間問這個問題必須是安全的。
    expect(isRetiredChampionId("godie-e00u")).toBe(false);
  });
});
