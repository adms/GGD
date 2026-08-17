/**
 * 退場的抽獎池在**執行期**也發不出去 —— 後台覆蓋層那條沒有 Zod 的路。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼 `ContentLoader` 的守衛不夠
 * ═══════════════════════════════════════════════════════════════════════════
 * `packages/shared/src/content/retiredLootTables.ts` 掛在 `ContentLoader` 上,
 * 所以走 `content/` 那條路(repo 編輯 → `pnpm content:build` → 映像)的文件
 * 永遠不可能把 `quest-rewards` 排回某個回合。
 *
 * 但線上還有第二條路:**後台耐久覆蓋層**。那條寫入路徑目前完全沒有 Zod 驗證
 * (#283 —— 那裡的註解宣稱有,是假的),所以一個 override 是有辦法把
 * `weaponLootTable: "quest-rewards"` 塞回第 4 回合的,而 loader 不會看到它。
 *
 * 所以 `rulesFromDoc` 自己也擋一次。這個檔案就是那一層的守衛,而且它問的是
 * **玩家那一場拿到什麼**,不是 `ArenaRules` 物件長什麼樣(失敗形態 ⑦)。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 差分設計:一次改一個欄位
 * ═══════════════════════════════════════════════════════════════════════════
 * 「排了退場的表 → 沒有卡」單獨看是空的:那一回合本來就可能沒有卡。所以每一條
 * 都跑**兩場**,兩份文件只差 `retiredLootTables` 一格:
 *   · 對照組(沒宣告退場) → 那一回合每個座位**都有**一張武器卡;
 *   · 實驗組(宣告退場)   → 同一回合**一張都沒有**。
 * 兩邊都用真的 `MatchController` 與真的出貨內容。
 *
 * 突變紀錄(每一條都真的跑過:改壞 → 確認紅 → 改回 → 確認綠,2026-08-01)
 *   M5. `arenaRules.ts` 的
 *       `weaponLootTable: retiredRounds.has(key) ? undefined : grant.weaponLootTable`
 *       改回 `weaponLootTable: grant.weaponLootTable`
 *       ⇒ **1 紅 / 6**(「實驗組一張卡都發不出來」變成 12 張)。
 *   M6. `arenaRules.ts` 的 gacha 那一行改回 `doc.gacha ?? null`
 *       ⇒ **1 紅 / 6**(「退場的 gacha 池 → 整個 gacha 關掉」)。
 *
 * ⚠️ 對照組那一條(「沒宣告退場時真的會發出 12 張卡」)是這兩條的**前提**:
 * 沒有它,「發不出卡」在一個根本不會發卡的回合上也會綠。M5 的紅之所以可信,
 * 是因為同一個排程在對照組下真的發得出 12 張。
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../../packages/shared/testkit/cover";
import { ContentLoader, registerAll, zConfigArenaRulesDoc } from "@ggd/shared/content";
import type { ConfigArenaRulesDoc } from "@ggd/shared/content";
import { FsContentSource } from "@ggd/shared/content/node";
import { MatchController, type SeatSpec } from "./MatchController";
import { rulesFromDoc } from "./arenaRules";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
/**
 * 被宣告退場的那張表。
 *
 * ⚠️ 2026-08-18：本來是 `quest-rewards`。owner 那天把它**整張**搬進
 * `content/_legacy/loot-tables/`，於是它連對照組都發不出卡 —— 這個檔量的是
 * 「宣告退場」這一個變因，用一張根本不存在的表當夾具會讓對照組跟著死掉，
 * 實驗組則會用**錯誤的理由**通過（0 張是因為表不存在，不是因為退場）＝失敗形態④。
 * ⇒ 換成一張真的存在的出貨池。⛔ 這不是換掉被守的機制：`retiredLootTables`
 * 是一份 arena-rules 的宣告，它對**任何**表都成立，而這個檔的兩份文件仍然只差那一格。
 * ⚠️ 出貨的 arena-rules 沒有宣告這張表退場（它是 [EX解放] 那一階），
 * 退場宣告只活在這個檔自己合成的那兩份文件裡。
 */
const RETIRED = "ex-release-weapons";
/** A round with NO weapon card of its own, so the one we add is unambiguous. */
const TEST_ROUND = "4";

let SHIPPED_DOC: ConfigArenaRulesDoc;

beforeAll(async () => {
  const loaded = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(loaded.store);
  SHIPPED_DOC = loaded.store.get<ConfigArenaRulesDoc>("config", "arena-rules");
  expect(SHIPPED_DOC.rounds[TEST_ROUND]?.weaponLootTable, "round 4 must ship with no card").toBeUndefined();
});

/** The overlay an operator could save today: a retired table back on round 4. */
function docSchedulingRetired(retire: boolean): ConfigArenaRulesDoc {
  return zConfigArenaRulesDoc.parse({
    ...SHIPPED_DOC,
    // ⚠️ GH#340 之後出貨預設是 `grail-wins`：同一回合既排了 `augmentTier` 又排了
    // `weaponLootTable` 時，寶具那一張整張不發。而 `TEST_ROUND` 在出貨排程裡本來
    // 就有 `augmentTier` ⇒ 不釘死這一格的話，這個檔的**對照組**會拿到 0 張
    // （紅），而**實驗組**會用錯誤的理由通過（0 張是因為撞卡閘，不是因為退場）——
    // 也就是整支測試從此對「退場」這個機制是空跑（失敗形態④）。
    // ⇒ 這裡明確關掉撞卡閘，讓這個檔量的仍然只有「退場」那一個變因。
    // 撞卡閘自己的守衛在 `arenaRules.test.ts`。
    draftConflict: "both",
    retiredLootTables: retire ? [RETIRED] : [],
    rounds: {
      ...SHIPPED_DOC.rounds,
      [TEST_ROUND]: { ...SHIPPED_DOC.rounds[TEST_ROUND], weaponLootTable: RETIRED },
    },
  });
}

const FAST = { champSelectTicks: 4, intermissionTicks: 24, combatMaxTicks: 300, resolutionTicks: 3 };

const seats = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({
    seatId: i,
    teamId: Math.floor(i / 3),
    isBot: true,
    championId: "godie-h01o",
  }));

/** How many seats hold a WEAPON 3-choose-1 card for `round`. */
function weaponCardsAt(doc: ConfigArenaRulesDoc, round: number): number {
  // The strip path console.warn()s on purpose (a silent drop would be 失敗形態
  // ②); silence it here so the suite output stays readable, and assert on the
  // warning separately below.
  const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const ctl = new MatchController("retired-pool", 20260801, seats(), FAST, 20, rulesFromDoc(doc));
    let guard = 0;
    while (ctl.phase.phase !== "matchEnd" && guard++ < 400_000) {
      const wasPhase = ctl.phase.phase;
      ctl.tick();
      if (ctl.phase.phase === "intermission" && wasPhase !== "intermission" && ctl.phase.round === round) {
        return [...ctl.seats.values()].filter((s) => ctl.offers.get(`${round}:${s.seatId}:w`)?.kind === "item")
          .length;
      }
    }
    throw new Error(`round ${round} intermission never happened`);
  } finally {
    quiet.mockRestore();
  }
}

describe("退場的抽獎池:後台把它排回去,玩家還是拿不到", () => {
  it("對照組 —— 沒宣告退場時,第 4 回合真的會發出 12 張卡(證明這個實驗有效)", () => {
    cover("arena-item-draft-tables");
    expect(weaponCardsAt(docSchedulingRetired(false), 4)).toBe(12);
  });

  it("實驗組 —— 宣告退場之後,同一份排程一張卡都發不出來", () => {
    cover("arena-item-draft-tables");
    expect(weaponCardsAt(docSchedulingRetired(true), 4)).toBe(0);
  });

  it("而且是**大聲**丟掉的 —— 靜靜地不發是失敗形態 ②", () => {
    cover("arena-item-draft-tables");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      rulesFromDoc(docSchedulingRetired(true));
      const lines = warn.mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes(RETIRED) && l.includes(`rounds.${TEST_ROUND}`))).toBe(true);
      expect(lines.some((l) => l.includes("retiredLootTables")), "訊息要說得出怎麼復活它").toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("退場的 gacha 池 → 整個 gacha 關掉,不是照抽", () => {
    cover("arena-item-draft-tables");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const doc = zConfigArenaRulesDoc.parse({
        ...SHIPPED_DOC,
        retiredLootTables: [RETIRED],
        gacha: { fromRound: 2, lootTable: RETIRED },
      });
      expect(rulesFromDoc(doc).gacha).toBeNull();
      // 對照:同一份文件不宣告退場的話,gacha 是活的。
      const live = zConfigArenaRulesDoc.parse({
        ...SHIPPED_DOC,
        retiredLootTables: [],
        gacha: { fromRound: 2, lootTable: RETIRED },
      });
      expect(rulesFromDoc(live).gacha).toEqual({ fromRound: 2, lootTable: RETIRED });
    } finally {
      warn.mockRestore();
    }
  });

  it("退場的備援池 → 清成空字串(=「沒有備援」),不是留著借", () => {
    cover("arena-item-draft-tables");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const doc = zConfigArenaRulesDoc.parse({
        ...SHIPPED_DOC,
        retiredLootTables: [RETIRED],
        itemDraft: { shortPoolMode: "fallback", fallbackTable: RETIRED, maxDraws: 64 },
      });
      expect(rulesFromDoc(doc).itemDraft.fallbackTable).toBe("");
      expect(rulesFromDoc(doc).itemDraft.shortPoolMode, "模式不動 —— 只有池子被拿掉").toBe("fallback");
    } finally {
      warn.mockRestore();
    }
  });

  it("出貨的那一份完全不受影響,而且一句警告都不叫", () => {
    cover("arena-item-draft-tables");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const rules = rulesFromDoc(SHIPPED_DOC);
      expect(warn).not.toHaveBeenCalled();
      expect(rules.rounds.get(2)?.weaponLootTable).toBe("legendary-weapons");
      expect(rules.rounds.get(5)?.weaponLootTable).toBe("legendary-weapons");
    } finally {
      warn.mockRestore();
    }
  });
});
