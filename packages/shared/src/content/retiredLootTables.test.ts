/**
 * quest-rewards 退場 (owner 2026-08-01) —— 以及「有人把它排回某回合」會不會紅。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 動手前那個機制**實際上**是什麼
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 的診斷是對的,而且是可以量的:出貨的 `config/arena-rules.json` 第 2、5
 * 回合都寫 `weaponLootTable: "legendary-weapons"`,`gacha` 整塊不存在,
 * `itemDraft.fallbackTable` 是空字串。三個入口沒有一個指到 `quest-rewards`,
 * 所以那 13 支任務小飾品在一場真的比賽裡拿不到 —— 下面的 ① 就是量這件事。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 「退場」為什麼**不是**刪掉那張表 —— 選最小破壞的那一個
 * ═══════════════════════════════════════════════════════════════════════════
 * `content/loot-tables/quest-rewards.json` 不只是一張抽獎表,它同時是:
 *   · `apps/platform/internal/curation/starter.go` 的 `starterDraftItems`
 *     (那 13 支道具的**白名單來源**),
 *   · Go 側 `TestStarterDraftIsQuestSet` 的雙向對照(少一支或多一支都紅),
 *   · `apps/game-server/src/curation/arenaItemModel.test.ts` 的
 *     DRAFT∩LEGENDARY 六支重疊清單,
 *   · 後台「三選一抽獎池」分頁裡一份操作者編輯得到的文件。
 *
 * 刪表 = 那 13 支道具從白名單消失 = 從圖鑑與後台一起消失。owner 說的是
 * 「不要再發給玩家」,不是「這些道具下架」,所以刪表是超譯而且是最大破壞。
 * 因此:**表留著、道具留著、白名單留著**,退場落在
 * `arena-rules.retiredLootTables` 這個新欄位上,而它的意思是**沒有任何發放
 * 入口可以再指到它**。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 突變紀錄(每一條都真的手動做過:改壞 → 確認紅 → 改回 → 確認綠)
 * ═══════════════════════════════════════════════════════════════════════════
 *   M1. `content/config/arena-rules.json` 的 `rounds["4"]` 加一行
 *       `"weaponLootTable": "quest-rewards"`
 *       ⇒ `pnpm content:build` **EXIT=1**,訊息一字不差是
 *          `RetiredLootTableError: config/arena-rules 欄位
 *           "rounds.4.weaponLootTable" 排了已退場的抽獎池 "quest-rewards" …`;
 *          本檔整個 suite 紅(`beforeAll` 的嚴格 loader 直接拒絕,11 條 skipped)。
 *   M2. `content/config/arena-rules.json` 拿掉整個 `retiredLootTables`
 *       ⇒ **5 紅 / 11**。而且 M1 那條會變綠 —— 那正是「復活它是一個看得見的
 *          兩步編輯」的意思。
 *   M3. `loader.ts` 刪掉 `errors.push(...validateRetiredLootTables(store))`
 *       ⇒ **1 紅 / 11**(② 的「content build 會擋」)。
 *   M4. `retiredLootTables.ts` 的 `scheduledRetiredTables` 只看 `rounds`
 *       (刪掉 gacha + fallbackTable 兩段)
 *       ⇒ **2 紅 / 11** —— 那兩扇後門一樣會把 13 支飾品發出去。
 *   M5. `arenaRules.ts` 的 `weaponLootTable: retiredRounds.has(key) ? …`
 *       改回 `grant.weaponLootTable`
 *       ⇒ `apps/game-server/src/match/retiredDraftPool.test.ts` **1 紅 / 6**。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { ContentStore } from "./store";
import {
  retiredLootTables,
  scheduledRetiredTables,
  validateRetiredLootTables,
} from "./retiredLootTables";
import { zConfigArenaRulesDoc, type ConfigArenaRulesDoc } from "./schema/config";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** 出貨的那一份,從磁碟讀 —— 不是手寫 fixture (失敗形態 ⑤)。 */
let SHIPPED: ConfigArenaRulesDoc;

beforeAll(async () => {
  const loaded = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  SHIPPED = loaded.store.get<ConfigArenaRulesDoc>("config", "arena-rules");
  expect(SHIPPED.schema).toBe("config.arena-rules@1");
});

/** 把一份改過的 arena-rules 塞進一個只有它的 store,跑退場檢查。 */
function checkDoc(doc: unknown): string[] {
  const store = new ContentStore();
  store.add("config", "arena-rules", zConfigArenaRulesDoc.parse(doc));
  return validateRetiredLootTables(store).map((e) => e.message);
}

// ───────────────────────────────────────────────────── ① 出貨的狀態 ─────

describe("① 出貨樹:quest-rewards 退場了,而且是**宣告**的不是漏排的", () => {
  it("沒有任何回合 / gacha / 備援欄位指到 quest-rewards", () => {
    // owner 的診斷,量出來的版本。
    const tables = new Set<string>();
    for (const g of Object.values(SHIPPED.rounds)) {
      if (g?.weaponLootTable) tables.add(g.weaponLootTable);
    }
    if (SHIPPED.gacha) tables.add(SHIPPED.gacha.lootTable);
    if (SHIPPED.itemDraft?.fallbackTable) tables.add(SHIPPED.itemDraft.fallbackTable);
    expect([...tables].sort()).toEqual(["legendary-weapons"]);
    expect(tables.has("quest-rewards")).toBe(false);
  });

  it("`retiredLootTables` 明著寫了 quest-rewards —— 這是決定,不是疏漏", () => {
    // 「已經沒有人排它」和「它退場了」在磁碟上長得一模一樣。這個欄位就是把兩者
    // 分開的東西:沒有它,下一個看到孤兒表的人會把它排回去。
    expect([...retiredLootTables(SHIPPED)]).toContain("quest-rewards");
    expect(scheduledRetiredTables(SHIPPED), "出貨樹必須是乾淨的").toEqual([]);
  });

  it("表**還在**,13 支道具**還在** —— 退場不是刪除", () => {
    // 這一條是「最小破壞」的守衛:哪天有人把退場理解成刪檔,這裡紅,而紅的原因
    // 會把他指回 starter.go 的白名單與 Go 側的雙向對照。
    const store = new ContentStore();
    expect(store).toBeDefined();
    // 讀真的 store(beforeAll 已經載過一次,這裡重載一次拿 loot-tables)。
    return new ContentLoader(new FsContentSource(CONTENT_DIR)).load().then((loaded) => {
      const table = loaded.store.get<{ entries: { itemId: string }[] }>(
        "loot-tables",
        "quest-rewards",
      );
      expect(table.entries.length, "13 支任務道具").toBe(13);
      for (const e of table.entries) {
        expect(loaded.store.has("items", e.itemId), `${e.itemId} 的 item@1 文件`).toBe(true);
      }
    });
  });
});

// ─────────────────────────────── ② 排回去會紅(owner 要的那條守衛) ─────

describe("② 有人把退場的表排回某回合 → 紅", () => {
  it("排回第 4 回合 → 檢查回報一條錯,而且指名回合與欄位", () => {
    const doc = {
      ...SHIPPED,
      rounds: { ...SHIPPED.rounds, "4": { ...SHIPPED.rounds["4"], weaponLootTable: "quest-rewards" } },
    };
    const msgs = checkDoc(doc);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain("rounds.4.weaponLootTable");
    expect(msgs[0]).toContain("quest-rewards");
    // 訊息要講得出**怎麼合法地復活它**,否則下一個人只會把守衛刪掉。
    expect(msgs[0]).toContain("retiredLootTables");
  });

  it("這條檢查掛在 `ContentLoader` 上 —— 所以 `pnpm content:build` 會擋", async () => {
    // 這一條的重點是 WIRING,不是規則本身:規則對但沒有人呼叫它 = 失敗形態 ②。
    // 用一個「出貨樹 + 一份被改壞的 arena-rules」的暫存來源真的跑一次 loader。
    const bad = {
      ...SHIPPED,
      rounds: { ...SHIPPED.rounds, "2": { ...SHIPPED.rounds["2"], weaponLootTable: "quest-rewards" } },
    };
    const src = new FsContentSource(CONTENT_DIR);
    const patched: typeof src = Object.create(Object.getPrototypeOf(src) as object) as typeof src;
    Object.assign(patched, src);
    patched.readObject = async (collection, entry) =>
      collection === "config" && entry.id === "arena-rules"
        ? bad
        : ((await src.readObject(collection, entry)) as unknown);
    // ⚠️ GH#326 之後執行期的出貨政策是 `quarantine`,所以這裡**不再是 throw**——
    //    規則照樣開火,只是它把那一份隔離掉而不是殺掉整份內容。
    //    這一條驗的仍然是 WIRING（規則對但沒有人呼叫它 = 失敗形態②）:
    //    壞掉的 arena-rules **沒有進登錄表**,而且**說得出為什麼**。
    const res = await new ContentLoader(patched).load();
    expect(res.store.has("config", "arena-rules"), "排了退場抽獎池的文件竟然進了登錄表").toBe(false);
    expect(res.quarantined.some((q) => q.id === "arena-rules" && /quest-rewards/.test(q.detail)))
      .toBe(true);
  });

  it("把它從 retiredLootTables 拿掉之後才排得回去 —— 復活是兩步,而且看得見", () => {
    const revived = {
      ...SHIPPED,
      retiredLootTables: [],
      rounds: { ...SHIPPED.rounds, "4": { ...SHIPPED.rounds["4"], weaponLootTable: "quest-rewards" } },
    };
    expect(checkDoc(revived)).toEqual([]);
  });
});

// ────────────────────────────────────────────── ③ 另外兩扇後門也關著 ────

describe("③ 退場擋的是**三個**入口,不是只有回合卡", () => {
  it("gacha.lootTable 指到退場的表 → 紅", () => {
    const doc = { ...SHIPPED, gacha: { fromRound: 2, lootTable: "quest-rewards" } };
    const msgs = checkDoc(doc);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain("gacha.lootTable");
  });

  it("itemDraft.fallbackTable 指到退場的表 → 紅(借來的一樣會發到玩家手上)", () => {
    const doc = {
      ...SHIPPED,
      itemDraft: { ...SHIPPED.itemDraft!, shortPoolMode: "fallback", fallbackTable: "quest-rewards" },
    };
    const msgs = checkDoc(doc);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain("itemDraft.fallbackTable");
  });

  it("空字串的 fallbackTable 是「沒有備援」,不是一個表 id", () => {
    const doc = { ...SHIPPED, itemDraft: { ...SHIPPED.itemDraft!, fallbackTable: "" } };
    expect(checkDoc(doc)).toEqual([]);
  });

  it("沒有宣告退場的文件完全不受影響(舊文件照樣過)", () => {
    const doc = { ...SHIPPED };
    delete (doc as { retiredLootTables?: unknown }).retiredLootTables;
    expect(checkDoc(doc)).toEqual([]);
    expect(retiredLootTables(doc as ConfigArenaRulesDoc).size).toBe(0);
  });
});

// ──────────────────────────── ④ 打錯表名不再是靜默的(順手補的硬參照) ───

describe("④ 回合指到一張**不存在**的表 → 紅(以前完全沒有人檢查)", () => {
  it("`weaponLootTable` 打錯字會被參照完整性擋下,不再是「那一回合沒有卡」", async () => {
    // `MatchController` 用 `LootTables.tryGet` 讀回合卡,所以打錯的 id 以前
    // 產出的是**沒有卡也沒有錯誤** —— 失敗形態 ② 而起因只是一個拼字。
    const bad = {
      ...SHIPPED,
      rounds: { ...SHIPPED.rounds, "5": { ...SHIPPED.rounds["5"], weaponLootTable: "legendary-weapon" } },
    };
    const src = new FsContentSource(CONTENT_DIR);
    const patched: typeof src = Object.create(Object.getPrototypeOf(src) as object) as typeof src;
    Object.assign(patched, src);
    patched.readObject = async (collection, entry) =>
      collection === "config" && entry.id === "arena-rules"
        ? bad
        : ((await src.readObject(collection, entry)) as unknown);
    // ⚠️ GH#326 之後執行期是 `quarantine`,所以打錯字的後果從「整份載入失敗」
    //    變成「那一份被隔離」。⭐ 這一條要守的性質沒有變:打錯的 id **不會**
    //    安靜地變成「那一回合沒有卡」——它會被指名。
    const res = await new ContentLoader(patched).load();
    expect(res.store.has("config", "arena-rules"), "指到不存在的抽獎池竟然進了登錄表").toBe(false);
    expect(res.quarantined.some((q) => q.id === "arena-rules" && /legendary-weapon/.test(q.detail)))
      .toBe(true);
  });
});
