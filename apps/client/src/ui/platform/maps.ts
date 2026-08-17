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
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
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

/**
 * ⚠️ 內容還沒載完時的那一筆 fallback（見檔頭：⛔ 不是空陣列）。
 *
 * 標籤取內建常數 `SKELETON_ARENA.name`，⛔ **不在這裡手寫字串** ——
 * 這一行原本寫死成 `"Skeleton (預設)"`（GH#341），於是骨架圖有三份名字、
 * 其中兩份是英文，而且 `arenaOptions()` 無條件用這一份 ⇒ **改了 arena doc
 * 也沒有用，下拉選單還是英文**。手寫的標籤正好違反這個檔案檔頭立的規矩。
 */
const SKELETON_FALLBACK: ArenaOption = { id: DEFAULT_MAP_ID, label: SKELETON_ARENA.name };

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
  if (docs.length === 0) return [SKELETON_FALLBACK];

  const rest: ArenaOption[] = [];
  // ⭐ 骨架走跟其他 12 張**同一條路**（標籤取 doc 自己的 `name`），只有排序
  // 特別 —— 它是預設值所以排第一。⛔ 不再用一個手寫常數蓋掉它。
  let skeleton: ArenaOption | null = null;
  for (const d of docs) {
    const opt: ArenaOption = { id: d.id, label: d.name && d.name.length > 0 ? d.name : d.id };
    if (d.id === DEFAULT_MAP_ID) {
      skeleton = opt;
      continue;
    }
    rest.push(opt);
  }
  rest.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
  return skeleton ? [skeleton, ...rest] : rest;
}

/** React 版：內容載完之後自動重算（#170 的背景載入）。 */
export function useArenaOptions(): ArenaOption[] {
  const ready = useContentReady();
  // `ready` 在 deps 裡是刻意的 —— 它翻成 true 的那一刻要重算一次。
  return useMemo(() => arenaOptions(), [ready]);
}

/** 一個 id 在選單上叫什麼。查不到就回 id 本身，⛔ 不要回空字串。 */
export function arenaLabel(id: string): string {
  const key = id === "" ? DEFAULT_MAP_ID : id;
  const hit = arenaOptions().find((o) => o.id === key);
  if (hit) return hit.label;
  // 骨架連 doc 都沒註冊時仍要有一個中文名可以顯示，⛔ 不要退回 `arena.skeleton`。
  return key === DEFAULT_MAP_ID ? SKELETON_FALLBACK.label : key;
}
