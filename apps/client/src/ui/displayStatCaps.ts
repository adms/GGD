/**
 * displayStatCaps — 屬性上限表 (GH#286),面板與 sim 讀同一份。
 *
 * 形狀刻意和 `displayBaseBonus.ts` 一字不差,理由也一樣 (#125):玩家讀到的數字
 * 必須是他真的拿得到的。攻速天花板既不在英雄卡裡、也不是常數 —— 後台調得動,
 * 而且技能可以解鎖它。
 *
 * 兩個來源,依序:
 *   1. `MatchState.statCapsJson` —— 伺服器替**這一場**定格的表。跑到一半的比賽
 *      不換上限。
 *   2. 客戶端自己 `Configs` 裡的 `config.stat-caps@1` —— 大廳/選角/圖鑑,還沒有
 *      比賽的時候。#189 的 clientOverlay 已經讓這份 registry 帶著操作者的耐久編輯。
 *
 * 兩邊都拿不到 → `DEFAULT_STAT_CAPS`,**絕不是空表**。空表會讓 `capFor` 退回
 * `STAT_CLAMPS`,於是 `unlocked === base`,面板永遠說「攻速最多 4.0」,而伺服器
 * 讓一支解鎖技能把它推到 10.0。
 */
import { useEffect, useMemo } from "react";
import { Configs } from "@ggd/shared/content";
import {
  DEFAULT_STAT_CAPS,
  normalizeStatCaps,
  statCapsFromDoc,
  type StatCapTable,
} from "@ggd/shared/sim/statCaps";
import { useHud } from "../net/RoomStore";

/** Parse `MatchState.statCapsJson`; "" / junk → null (caller falls through). */
export function parseStatCapsJson(json: string | null | undefined): StatCapTable | null {
  if (!json) return null;
  try {
    const raw: unknown = JSON.parse(json);
    if (!raw || typeof raw !== "object") return null;
    return normalizeStatCaps(raw);
  } catch {
    return null;
  }
}

/** The content doc's table (lobby path). Falls back to the shipped default. */
export function contentStatCaps(): StatCapTable {
  return statCapsFromDoc(Configs.tryGet("stat-caps"));
}

/** Resolve wire-first, then content, then the shipped default. */
export function resolveStatCaps(wireJson: string | null | undefined): StatCapTable {
  return parseStatCapsJson(wireJson) ?? contentStatCaps();
}

// ---------------------------------------------------------------------------
// singleton mirror — same pattern as displayBaseBonus's.
// ---------------------------------------------------------------------------
let current: StatCapTable = DEFAULT_STAT_CAPS;

export function getDisplayStatCaps(): StatCapTable {
  return current;
}

export function setDisplayStatCaps(table: StatCapTable): void {
  current = table;
}

/** Reset to the shipped default — for test isolation. */
export function resetDisplayStatCaps(): void {
  current = DEFAULT_STAT_CAPS;
}

/** Live table for React renderers. */
export function useDisplayStatCaps(): StatCapTable {
  const json = useHud((s) => s.statCapsJson);
  const table = useMemo(() => resolveStatCaps(json), [json]);
  useEffect(() => {
    setDisplayStatCaps(table);
  }, [table]);
  return table;
}
