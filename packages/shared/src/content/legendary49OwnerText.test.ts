/**
 * owner 親筆的 49 支傳說文案，一個字都不准被悄悄改掉。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼需要這一條
 *
 * 2026-08-01 owner 交來 49 支棱彩三選一傳說武器，並且明說「請你將我剛剛輸入的
 * 49 項傳說武器道具都實作完」。在這一批裡，**文案就是規格**：`modifiers` /
 * `passive` / `auras` 是從那些「效能」行翻譯出來的，不是反過來。所以文案一旦被
 * 改動，規格就跟著漂移，而且**沒有任何既有測試會發現**：
 * `legendaryClaims.test.ts` 檢查的是「文案 ⇔ 資料一致」，兩邊一起被改動它照樣綠。
 *
 * 這不是假想的風險。實作這一批的過程中：
 *   · 有背景 agent 在被明確要求「不要動 content/」之後，三分鐘內寫了 51 個道具檔；
 *   · 進度統計連續兩次讀到不一致的值（✅108 → 109 → 108），就是併發寫入造成的；
 *   · 同一批工作裡已經出現過「程式註解 + 測試標題 + 交付報告」三處自洽地描述一個
 *     根本不存在的 sim 行為（見 apps/client/src/vfx/VfxSystem.ts 的 goldGrant 段）。
 *
 * 一個人為的核對只證明「那一刻是對的」。這條守衛把它變成每次 CI 都會問的問題。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這條守衛**不是**要凍結文案
 *
 * owner 隨時可以改自己的文案 —— 那是他的東西。改了以後重新產生基準檔：
 *
 *     python3 tools/legendary-status/status.py            # 先看差異
 *     # 確認每一處差異都是 owner 的意思，然後更新
 *     packages/shared/src/content/__fixtures__/legendary49OwnerText.json
 *
 * 重點是**更新基準必須是一個刻意的動作**，不能是某個 agent 順手改掉、沒有人發現。
 * `_sanctionedRewrites` 記錄每一處與 owner 原稿不同的文案、以及 owner 當場核准它的
 * 那句話，連理由一起寫在檔案裡 —— 讓「為什麼這行跟 owner 原稿不一樣」不必去翻對話
 * 紀錄。
 *
 * ⚠️ 這裡**刻意不寫死筆數**。原本寫的是「目前僅有的三處」，2026-08-01 owner 裁定
 * 「取消攻速加成」與「3% 就可以了」之後變成五處，於是那句話在這個檔 —— 全 repo 唯一
 * 一個專門抓「文案與現實脫節」的檔 —— 自己變成了脫節的文案。筆數是資料，去讀
 * fixture，不要抄到註解裡。
 */
import { describe, it, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const BASELINE = join(HERE, "__fixtures__/legendary49OwnerText.json");

interface Baseline {
  _note: string;
  _sanctionedRewrites: Record<string, string>;
  items: Record<string, string>;
}

/**
 * Reads the raw JSON instead of booting `ContentLoader`.
 *
 * ⚠️ 2026-08-01: the first version of this file did a full `ContentLoader` boot in
 * `beforeAll`, which passed standalone and then **timed out at 10 s** inside the full
 * parallel suite (`Hook timed out in 10000ms`). A guard that only holds when the machine
 * is idle is not a guard — it teaches people that red means 「再跑一次就好」, and that habit
 * is what lets a real red slip through. 49 `readFileSync` calls need no async and cannot
 * time out.
 *
 * Reading raw JSON is also the RIGHT layer for this particular question: the claim is
 * 「the bytes owner authored are still the bytes on disk」. Going through the loader would
 * compare post-parse values and could hide a change the loader normalises away.
 */
function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const baseline = readJson<Baseline>(BASELINE);
const itemDoc = (id: string) =>
  readJson<{ id: string; name: string; description?: string }>(
    join(CONTENT_DIR, "items", `${id}.json`),
  );
const poolIds = readJson<{ entries: { itemId: string }[] }>(
  join(CONTENT_DIR, "loot-tables", "legendary-weapons.json"),
).entries.map((e) => e.itemId);

describe("owner 2026-08-01 的 49 支傳說文案 (legendary49-owner-text)", () => {
  it("每一支的 description 都與 owner 交來的原稿逐字相同", () => {
    const drifted: string[] = [];
    for (const [id, want] of Object.entries(baseline.items)) {
      let doc: { name: string; description?: string };
      try {
        doc = itemDoc(id);
      } catch {
        drifted.push(`${id}: 文件不見了`);
        continue;
      }
      if ((doc.description ?? "") !== want) {
        drifted.push(
          `${id} (${doc.name}) 的文案跟 owner 原稿不同。\n` +
            `  原稿: ${JSON.stringify(want)}\n` +
            `  現在: ${JSON.stringify(doc.description ?? "")}\n` +
            `  → 如果這是 owner 的決定, 更新 __fixtures__/legendary49OwnerText.json 並把理由` +
            `寫進 _sanctionedRewrites; 如果不是, 這是一次沒人發現的漂移。`,
        );
      }
    }
    expect(drifted, "owner 親筆的文案被改動了").toEqual([]);
  });

  it("基準檔涵蓋的就是出貨池本身 —— 池子擴充時基準不會被漏掉", () => {
    // 沒有這一條的話, 把一支新道具加進池子而忘了加進基準, 上面那條照樣綠 ——
    // 一個「只保護它剛好認識的東西」的守衛, 會隨著內容成長慢慢失效。
    const inBaseline = new Set(Object.keys(baseline.items));
    const inPool = new Set(poolIds);
    expect(
      [...inPool].filter((id) => !inBaseline.has(id)),
      "傳說池裡有基準檔沒收錄的道具 —— 它的文案目前沒有任何保護",
    ).toEqual([]);
    expect(
      [...inBaseline].filter((id) => !inPool.has(id)),
      "基準檔裡有已經不在池子裡的道具 —— 基準已經腐爛",
    ).toEqual([]);
  });

  it("每一處與原稿不同的改寫, 都必須在 _sanctionedRewrites 裡有具名理由", () => {
    // 一個空的 `_sanctionedRewrites` 是合法的(代表完全沒有改寫); 但只要有條目,
    // 它就必須指向真的存在的道具, 否則這份「核准清單」自己會變成謊話。
    for (const [id, why] of Object.entries(baseline._sanctionedRewrites)) {
      expect(
        () => itemDoc(id),
        `_sanctionedRewrites 提到不存在的道具 ${id}`,
      ).not.toThrow();
      expect(
        why.length,
        `${id} 的改寫理由是空的 —— 「有人核准過」不是理由, 要寫核准了什麼`,
      ).toBeGreaterThan(10);
    }
  });
});
