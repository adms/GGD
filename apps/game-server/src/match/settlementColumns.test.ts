/**
 * GH#973 —— 結算欄位表的**兩個方向**，量在一場**真的比賽**上。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼一定要跑真的比賽
 * ════════════════════════════════════════════════════════════════════════════
 * 這張票的病是「**有資料而沒有欄位**」：`world.mobKills` 從 #215 起就在數，一場
 * 十回合 12 席打死 **2,748 隻**，而結算頁上零欄好幾個月。⛔ 任何一條讀手寫夾具
 * 的斷言都看不到它 —— 夾具裡沒有的東西，夾具當然不會抱怨。所以這一份載入
 * **出貨的守護塔／殭屍波設定**、跑**出貨的** `MatchController`、拿**真的**
 * `MatchSettlement`，餵進**客戶端出貨的** `buildStatBreakdown`（`curation/
 * curationVsContentModel.test.ts` 早有跨 app 讀純模型的前例）。
 *
 * ⭐ 兩個方向（第二守則⑫：只從一頭走的掃描結構上失明）
 *   A 欄位 → 資料：每一欄宣告的來源都要是真的數字，⭐ 而且真的比賽裡至少有一席
 *                 非零 ⇒ ⛔ 擋掉「加了一欄而它永遠是 0」（第一·五守則的空宣稱）。
 *   B 資料 → 欄位：每一個真的會非零的數字，要嘛有欄位、要嘛在
 *                 `SETTLEMENT_DATA_WITHOUT_COLUMN` 上帶著一個可被反駁的理由。
 *                 ⭐ **這是 mobKills 缺席好幾個月時唯一會紅的那一條。**
 *
 * ⚠️ ⛔ 一個出貨數值都沒有被抄進斷言（第零守則：守衛驗機制不驗數字）——
 * 分佈是當場量的，門檻只有「非零」與「相等」。
 *
 * 突變驗證（2026-09-03 實跑，見 commit 訊息）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { asSeatId } from "@ggd/shared/ids";
import { createMatchStats, type PlayerMatchStats } from "@ggd/shared/sim/stats/matchStats";
import type { MatchSettlement } from "@ggd/shared/protocol/messages";
import {
  SETTLEMENT_COLUMNS,
  SETTLEMENT_DATA_WITHOUT_COLUMN,
  buildStatBreakdown,
  formatInt,
  settlementExtras,
  type SettlementDatum,
} from "../../../client/src/ui/panels/settlementModel";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES, type ArenaRules } from "./arenaRules";

const FAST = { champSelectTicks: 5, intermissionTicks: 30, combatMaxTicks: 1800, resolutionTicks: 5 };
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/**
 * ⭐ **出貨的**那一份 `config.arena-rules@1`，⛔ 不是 `DEFAULT_ARENA_RULES`
 * （它的 `guardianTower` / `mobWaves` 都是 null ⇒ 那兩條機制整場不存在 ⇒
 *  這支守衛會量到一個「守護塔與殭屍本來就沒有」的世界，然後全綠）。
 */
type ShippedBlocks = Pick<
  ArenaRules,
  "guardianTower" | "mobWaves" | "flowers" | "reviveCircles" | "goldDrop"
>;
const shipped = JSON.parse(
  readFileSync(new URL("../../../../content/config/arena-rules.json", import.meta.url), "utf8"),
) as ShippedBlocks;

const rules = (): ArenaRules => ({
  ...DEFAULT_ARENA_RULES,
  ...shipped,
  // ⚠️ 殭屍波**只有間隔**被壓密（出貨是第 3 回合才開、每 2 秒一波）——
  // 這一份要驗的是「殭屍擊殺**接得到線**」，⛔ 不是「出貨的排程夠不夠密」，
  // 而一條靠「應該會有人補到刀」才綠的守衛就是失敗形態⑩（靠運氣綠的守衛）。
  // ⭐ 同 `analytics.test.ts` 的作法，理由逐字相同。
  mobWaves: { ...shipped.mobWaves!, fromRound: 1, firstWaveSec: 1, waveIntervalSec: 1 },
  rogueliteMobs: true,
});

interface Row {
  seatId: number;
  stats: PlayerMatchStats;
  mobKills: number;
  rows: { key: string; label: string; value: string }[];
}

/** 跑完一場出貨設定的比賽，回傳每一席的真統計 ＋ 真結算算出來的欄位列。 */
function playMatch(seed: number): { settlement: MatchSettlement; seats: Row[] } {
  const ctl = new MatchController(`m973-${seed}`, seed, allBots(), FAST, 3, rules(), SKELETON_ARENA);
  const pool = ctl.randomChampionPool();
  for (let i = 0; i < 12; i++) ctl.selectChampion(asSeatId(i), pool[i % pool.length]!);
  for (let n = 0; n < 600_000 && ctl.phase.phase !== "matchEnd"; n++) ctl.tick();
  expect(ctl.phase.phase, "the match must actually finish").toBe("matchEnd");
  const settlement = ctl.settlement!;
  const seats: Row[] = [];
  for (const seat of ctl.seats.values()) {
    if (seat.entityId === null) continue;
    const stats = ctl.world.matchStats.get(seat.entityId);
    if (!stats) continue;
    seats.push({
      seatId: seat.seatId,
      stats,
      mobKills: ctl.world.mobKills.get(seat.entityId) ?? 0,
      rows: buildStatBreakdown(stats, settlementExtras(settlement, seat.seatId)),
    });
  }
  expect(seats.length).toBeGreaterThan(0);
  return { settlement, seats };
}

const KNOWN: ReadonlySet<string> = new Set<SettlementDatum>([
  ...(Object.keys(createMatchStats()) as (keyof PlayerMatchStats)[]),
  "mobKills",
]);

describe("結算欄位表 ↔ 今天真的有的資料 (GH#973)", () => {
  const match = playMatch(4242);

  /** 這一場**真的**非零過的數字（`mobKills` 走它自己的來源）。 */
  const nonZero = new Set<string>();
  for (const s of match.seats) {
    for (const [k, v] of Object.entries(s.stats)) if (v !== 0) nonZero.add(k);
    if (s.mobKills !== 0) nonZero.add("mobKills");
  }

  /**
   * ⚠️ ⭐ 這一條刻意是**結構性**的，⛔ 不是「每一欄在這一場裡至少有一席非零」。
   * 2026-09-03 量到為什麼：單獨跑時 `healingDone` 是 36/36 席非零，與別的
   * suite 同一個 worker 跑時是 **0/12** —— 因為 `randomChampionPool()` 讀的是
   * **行程級的**註冊表，別的測試註冊過內容就會換一批英雄，而有沒有治療技能
   * 完全看抽到誰。⇒ ⭐ 那是一個**行為相依的量**（它是區間，不是一個數字），
   * 拿它當門檻的守衛會間歇性地紅，而一條會亂紅的守衛遲早被關掉 ＝ 沒有守衛。
   * ⇒ 「這一欄永遠是 0」由 {@link SETTLEMENT_DATA_WITHOUT_COLUMN} 的 `coinsCollected`
   *   那一列承擔（它帶著到期條件），⛔ 不由一場比賽的抽樣承擔。
   */
  it("A. 每一欄都宣告了來源，⭐ 而且每一個來源都是真的存在的數字", () => {
    const seen = new Set<string>();
    for (const col of SETTLEMENT_COLUMNS) {
      expect(seen.has(col.key), `欄位 key \`${col.key}\` 重複了`).toBe(false);
      seen.add(col.key);
      expect(col.sources.length, `欄位「${col.label}」沒有宣告任何資料來源`).toBeGreaterThan(0);
      for (const src of col.sources) {
        expect(KNOWN.has(src), `欄位「${col.label}」宣告了不存在的資料 \`${src}\``).toBe(true);
      }
    }
  });

  it("B. 每一個真的會非零的數字，要嘛有欄位、要嘛帶著一個可被反駁的理由", () => {
    const covered = new Set<string>(SETTLEMENT_COLUMNS.flatMap((c) => [...c.sources]));
    const orphans = [...nonZero].filter(
      (d) => !covered.has(d) && !(d in SETTLEMENT_DATA_WITHOUT_COLUMN),
    );
    expect(
      orphans,
      `這些數字在真的比賽裡會非零，而結算頁上**零欄**也沒有理由 —— ` +
        `這正是 mobKills 缺席好幾個月的形狀。加一欄到 SETTLEMENT_COLUMNS，` +
        `或在 SETTLEMENT_DATA_WITHOUT_COLUMN 寫下為什麼不給它一欄。`,
    ).toEqual([]);
    // 反方向的反方向：豁免表不可以留著已經有欄位的名字（那是一句過期的散文）。
    for (const d of Object.keys(SETTLEMENT_DATA_WITHOUT_COLUMN)) {
      expect(KNOWN.has(d), `豁免表上的 \`${d}\` 不是任何一個真的數字`).toBe(true);
      expect(covered.has(d), `\`${d}\` 已經有欄位了，豁免那一列是過期的散文`).toBe(false);
    }
  });

  it("C. 殭屍擊殺印得出來，⭐ 而且數字與伺服器逐位元相等", () => {
    let shown = 0;
    for (const s of match.seats) {
      const row = s.rows.find((r) => r.key === "mobKills");
      expect(row, `座位 ${s.seatId} 的結算表上沒有殭屍擊殺那一列`).toBeDefined();
      expect(row!.value, `座位 ${s.seatId} 的殭屍擊殺與伺服器對不上`).toBe(formatInt(s.mobKills));
      if (s.mobKills > 0) shown++;
    }
    // 尺的 calibrate：如果這一場一隻殭屍都沒死，上面那條「相等」對著兩個 0 也會綠。
    expect(shown, "這一場一隻殭屍都沒被打死 ⇒ 上面那條相等是在比兩個 0，這把尺是瞎的").toBeGreaterThan(0);
  });

  it("D. 封包沒帶 rounds（舊伺服器／夾具）⇒ 那一列**不印**，⛔ 不是印 0", () => {
    const legacy = buildStatBreakdown(match.seats[0]!.stats, settlementExtras(null, 0));
    expect(legacy.find((r) => r.key === "mobKills")).toBeUndefined();
    // ⛔ 其餘欄位一格都不可以跟著消失。
    expect(legacy.length).toBe(match.seats[0]!.rows.length - 1);
  });
}, 600_000);
