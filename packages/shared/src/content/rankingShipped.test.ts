/**
 * 排名獎勵的**三個住處**要對得起來（第一守則）：
 *   ① `content/config/ranking.json`（出貨檔，後台那一頁的底）
 *   ② `schema/rankingDoc.ts` 的 `DEFAULT_RANKING` + `RANKING_BOUNDS`（Zod）
 *   ③ `apps/platform/internal/ranking/standings.go`（**真正生效**的那一份）
 *
 * ⚠️ ③ 是跨語言的，import 不到，所以這裡真的**去讀那個 .go 檔**。
 * 這一條驗的是「兩個名詞之間的關係」而不是任何一個名詞（見 CLAUDE.md 的配對式
 * 後置條件）：缺覆蓋層時玩家拿到的是 Go 的出貨值，而後台顯示的是 ①，兩邊分歧的
 * 症狀是**畫面寫 13、那一場只給 10，而且兩邊都不會報錯**。
 *
 * ⛔ 斷言裡不抄 13 / 100 / 5 —— 期望值一律從 `DEFAULT_RANKING` 推導（第二守則）。
 *
 * 突變紀錄（承重的那一條）：`DEFAULT_RANKING.share.ratingPct` 由 5 改成 50
 * → 「Go 端的出貨值對得起來」當場紅（`DefaultRatingSharePct` 說 5）；改回。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RANKING, RANKING_BOUNDS, zConfigRankingDoc } from "./schema/rankingDoc";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GO = readFileSync(join(REPO, "apps/platform/internal/ranking/standings.go"), "utf8");

/** 讀 Go 那一份的一個具名常數。找不到 = 那個常數被改名了，也是一種分歧。 */
function goConst(name: string): number {
  const m = GO.match(new RegExp(`\\b${name}\\s*=\\s*(-?\\d+)\\b`));
  expect(m, `standings.go 裡找不到常數 ${name}`).not.toBeNull();
  return Number(m![1]);
}

const D = DEFAULT_RANKING;
const B = RANKING_BOUNDS;

describe("排名獎勵的三個住處", () => {
  it("出貨 JSON 過得了自己的 Zod，而且逐格等於 DEFAULT_RANKING", () => {
    const shipped = JSON.parse(readFileSync(join(REPO, "content/config/ranking.json"), "utf8"));
    const parsed = zConfigRankingDoc.safeParse(shipped);
    expect(parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe("");
    // ⚠️ 整份比對（不是逐格挑幾格）：漏一格的後果是後台那一頁的底與 Zod 預設不同，
    // 而操作者看到的是後台那一份。
    expect(shipped).toEqual(D);
  });

  it("⭐ Go 端（真正生效的那一份）的出貨值與上下界，逐格對得起來", () => {
    const defaults: readonly [number, string][] = [
      [D.humanMultiplier.minHumans, "DefaultStandingsMinHumans"],
      [D.humanMultiplier.offset, "DefaultStandingsOffset"],
      [D.humanMultiplier.maxMultiplier, "DefaultStandingsMaxMultiplier"],
      [D.share.seasonPointsPct, "DefaultSeasonPointsSharePct"],
      [D.share.ratingPct, "DefaultRatingSharePct"],
      [D.share.ratingMaxPct, "DefaultRatingMaxPct"],
      [D.rivalry.basePct, "DefaultRivalryBasePct"],
      [D.rivalry.halfLife, "DefaultRivalryHalfLife"],
      [D.rivalry.repeatHalfLife, "DefaultRivalryRepeatHalfLife"],
      [D.rivalry.maxPct, "DefaultRivalryMaxPct"],
    ];
    for (const [ours, go] of defaults) {
      expect(ours, `出貨值與 standings.go 的 ${go} 分歧`).toBe(goConst(go));
    }
    const bounds: readonly [{ min: number; max: number }, string, string][] = [
      [B.minHumans, "StandingsMinHumansMin", "StandingsMinHumansMax"],
      [B.offset, "StandingsOffsetMin", "StandingsOffsetMax"],
      [B.maxMultiplier, "StandingsMaxMultiplierMin", "StandingsMaxMultiplierMax"],
      [B.sharePct, "SharePctMin", "SharePctMax"],
      [B.ratingMaxPct, "RatingMaxPctMin", "RatingMaxPctMax"],
      [B.rivalryPct, "RivalryPctMin", "RivalryPctMax"],
      [B.rivalryHalfLife, "RivalryHalfLifeMin", "RivalryHalfLifeMax"],
    ];
    for (const [ours, lo, hi] of bounds) {
      expect([ours.min, ours.max], `界與 standings.go 的 ${lo}/${hi} 分歧`).toEqual([
        goConst(lo),
        goConst(hi),
      ]);
    }
  });
});
