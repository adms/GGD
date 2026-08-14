/**
 * ⭐【建房／機器人對戰的地圖選單】—— **從登錄表推導，⛔ 不是手寫清單**。
 *
 * ── 為什麼這個檔案被重寫（owner 2026-08-14）─────────────────────────────
 *
 * 這裡原本是一個寫死的五筆陣列：
 *
 *     arena.skeleton / arena.castle / arena.colosseum / arena.dota / arena.godie
 *
 * 於是 GH#324 產出七張動漫競技場、驗證過、上線之後，**建房的下拉選單裡一張都
 * 沒有** —— owner：「建立房間那邊也要能選到新的七張地圖」。
 *
 * ⚠️ 這是**同一個失敗形態在同一天發生第二次**。伺服器端那份寫死的輪替陣列
 * 剛在 GH#324 被搬進 `config.arena-pool@1`，而它的檔頭就寫著：
 *
 *   > 2026-08-14 產出七張動漫競技場、驗證過、上線之後，**玩家一場都碰不到** ——
 *   > 因為沒有人記得回來改它。那是失敗形態②（算出來了但從沒送到玩家面前）
 *
 * 修了伺服器那一份，**客戶端這一份沒人動**。兩份寫死的清單，同一個原因，
 * 隔一層而已。
 *
 * ── ⛔ 所以這裡不可以再是一張表 ──────────────────────────────────────
 *
 * 第〇·五守則：對外可見的能力清單必須是**推導**的。`Arenas` 登錄表就是
 * 「這個安裝到底有哪些場地」的唯一真相 —— 內容加一張圖，選單自動就有，
 * ⛔ 沒有第二個地方需要記得跟著改。
 *
 * ⚠️ 標籤取 arena doc 的 `name`（作者寫的中文名），⛔ 不在這裡另外維護一份
 * 對照表 —— 那又會是一份會過期的手寫清單。
 *
 * ── ⚠️ 內容是**背景載入**的，所以這是一個 hook 不是一個常數 ──────────
 *
 * #170 讓登入畫面**先畫出來**再載 1,441 份文件，所以第一次 render 時登錄表
 * 可能是空的。`useArenaOptions()` 訂閱 `useContentReady()`，載完自動重算。
 * 還沒好的時候只回骨架那一筆 —— ⛔ 不是空陣列（一個空的下拉選單看起來像壞了）。
 */
import { useMemo } from "react";
import { Arenas } from "@ggd/shared/content";
import { useContentReady } from "./ContentGate";

export interface ArenaOption {
  id: string;
  label: string;
}

/**
 * 骨架圖 —— 內建的那一張，永遠存在（`sim/content/skeleton.ts` 註冊它），
 * 也是選單的預設值。內容還沒載完時它是唯一的選項。
 */
export const DEFAULT_MAP_ID = "arena.skeleton";
const SKELETON_OPTION: ArenaOption = { id: DEFAULT_MAP_ID, label: "Skeleton (預設)" };

interface ArenaDocLike {
  id: string;
  name?: string;
}

/**
 * 現在這個安裝有哪些場地可以選。**純函式**（讀登錄表），元件用下面那個 hook。
 *
 * 排序：骨架第一（它是預設值），其餘按**中文名**排 —— ⛔ 不按 id，因為 id 是
 * `arena.heavens-arena` 這種英文，排出來的順序對讀中文的人沒有意義。
 */
export function arenaOptions(): ArenaOption[] {
  const docs = Arenas.all() as ArenaDocLike[];
  if (docs.length === 0) return [SKELETON_OPTION];

  const rest: ArenaOption[] = [];
  let hasSkeleton = false;
  for (const d of docs) {
    if (d.id === DEFAULT_MAP_ID) {
      hasSkeleton = true;
      continue;
    }
    rest.push({ id: d.id, label: d.name && d.name.length > 0 ? d.name : d.id });
  }
  rest.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
  return hasSkeleton ? [SKELETON_OPTION, ...rest] : rest;
}

/** React 版：內容載完之後自動重算（#170 的背景載入）。 */
export function useArenaOptions(): ArenaOption[] {
  const ready = useContentReady();
  // `ready` 在 deps 裡是刻意的 —— 它翻成 true 的那一刻要重算一次。
  return useMemo(() => arenaOptions(), [ready]);
}

/** 一個 id 在選單上叫什麼。查不到就回 id 本身，⛔ 不要回空字串。 */
export function arenaLabel(id: string): string {
  if (id === "" ) return SKELETON_OPTION.label;
  return arenaOptions().find((o) => o.id === id)?.label ?? id;
}
