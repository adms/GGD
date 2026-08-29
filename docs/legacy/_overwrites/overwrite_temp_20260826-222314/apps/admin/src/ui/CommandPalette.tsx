/**
 * ⌘K **指令面板** —— 121 頁的後台唯一一條 O(1) 的路。
 *
 * owner 2026-08-26：「後台左側選項**已經太長 不容易尋找、閱覽及管理**」。
 * 量到的：121 頁 / 11 組，而 `App.tsx` 裡「搜尋」相關的字串數是 **0**。今天已經拆過
 * 第二輪分組（31→16、36→23）—— 再拆一次分組治不了它，因為病不是「組太大」而是
 * **導覽只有一種模式：用眼睛掃**。掃 121 列是 O(121)，打三個鍵是 O(1)。
 *
 * ⭐ 為什麼比對邏輯是一個 export 出去的**純函式**（`rankPages`）而不是寫在元件裡：
 * admin 的 vitest 跑在 `environment: "node"`，沒有 DOM。把排序寫在 keydown handler
 * 裡的話，唯一驗得動它的方式是掃原始碼字串（失敗形態⑥：用掃字串代替行為）。
 * 抽成純函式之後守衛餵真的 `NAV` 進去、讀真的名次出來。
 *
 * ⭐ 這個元件**不自己讀 `NAV`**：`rows` 由 `App.tsx` 傳進來。自己 import 一份等於讓
 * 「有哪些頁」長出第二個住處（第〇·四守則），而那一份必然會跟左欄漂開。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { isNavItem, rowKey, type NavPrefStore, type NavRow } from "./navGroups";
import { ACCENT, ACCENT_BG, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import { TextInput } from "./widgets";

/* ──────────────────────────── 同義詞 ──────────────────────────── */

/**
 * 同義詞群組 —— 群組內任一個詞打得中，就算命中群組內的其他詞。
 *
 * ⚠️ **收錄標準只有一條**：這個詞是操作者每天在 JSON 欄位名、開發守則、票裡讀到的
 * 寫法，而它**在任何一個頁面標題上一個字都沒出現**。所以打它會得到零筆 —— 那正是
 * 「有搜尋卻找不到」比沒有搜尋更糟的地方。
 *
 * ⛔ 刻意**不**收「沒有人會打的字」：不收 `cooldownTier` 這種 schema 全名（它本來就
 * 前綴命中 `cooldownTiers` 這個 page id）、不收 `settings`/`config` 這種一打就中 60 頁
 * 的萬用字、也不收單純的英譯（`victory`→勝利）除非那個英文是我們自己在用的術語。
 * 一張塞滿的同義詞表會把每一個查詢都變成「什麼都中」，而那等於沒有排序。
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  // JSON 欄位是 `cooldownTier`，而人講話跟開票一律寫 CD。標題上只有「冷卻」。
  ["cd", "cooldown", "冷卻"],
  // `damageTier` / 傷害節點。dmg 是 issue 標題與 commit 訊息裡的常態寫法。
  ["dmg", "damage", "傷害"],
  // `manaCostTier`。標題寫「耗魔」「魔力」，⛔ 沒有一頁叫 mana。
  ["mp", "mana", "耗魔", "魔力"],
  // 血量相關頁的標題是「回血與扣血」「濺血」，⛔ 沒有 hp / health 這兩個字。
  ["hp", "health", "血", "生命"],
  // `aoeTiers` 的標題有 AoE，但「範圍指引與預告」沒有 —— 打 aoe 應該兩頁都到。
  ["aoe", "範圍", "區域"],
  // 特效家族在程式與票裡一律叫 vfx（`vfxKey` / `vfx-families.json`）。
  ["vfx", "特效", "演出"],
  // 音效同理（`sfx` 綁定表），標題寫「混音」。
  ["sfx", "audio", "音效", "混音"],
  // `rangeTier`；標題分成「施法距離」與「體型與射程」兩種寫法。
  ["range", "距離", "射程"],
  // 以下六組都是「英文術語天天講、標題只有中文」的同一個形狀。
  ["crit", "暴擊"],
  ["buff", "增益"],
  ["shield", "護盾"],
  ["hero", "champion", "英雄"],
  ["item", "道具", "武器"],
  ["mob", "zombie", "殭屍"],
  // 反方向的兩組：標題是英文（Players / Matches / Replays 那一族），而 owner 打中文。
  ["player", "玩家"],
  ["match", "對戰", "比賽"],
  ["replay", "回放", "錄影"],
  // 地圖那一族的標題在「地圖」與「場地」之間搖擺，兩邊互相看不到。
  ["map", "地圖", "場地"],
];

/** token → 同群組的其他詞。模組載入時建一次。 */
const SYNONYMS: ReadonlyMap<string, readonly string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    for (const term of group) {
      const others = group.filter((t) => t !== term);
      const prev = m.get(term);
      if (prev) prev.push(...others);
      else m.set(term, [...others]);
    }
  }
  return m;
})();

/* ──────────────────────────── 比對 ──────────────────────────── */

/** 命中的來源 —— 顯示給人看，也讓守衛看得出「為什麼中」而不只是「有沒有中」。 */
export type MatchVia = "label" | "page" | "section" | "synonym" | "recent";

export interface RankedRow {
  row: NavRow;
  /** `rowKey(row)` —— React key 與「最近用過」的識別碼。 */
  key: string;
  score: number;
  via: MatchVia;
}

export interface RankOpts {
  /** 最近用過的 key，**index 0 = 最近**。同分時它排前面。 */
  recent?: readonly string[];
  /** 回傳上限（預設 20）—— 面板一次看得完的量。 */
  limit?: number;
}

// 四段命中品質。差距刻意拉大（250），這樣欄位權重與最近用過的加分都翻不動它。
const S_EXACT = 1000;
const S_PREFIX = 700;
const S_SUBSTR = 500;
const S_SUBSEQ = 250;

// 欄位權重：標題最準，page id 次之（打得中它的人知道自己在找什麼），
// 分組名最鬆（一打「系統」就中 23 頁，不該壓過真的標題命中）。
const W_LABEL = 1;
const W_PAGE = 0.85;
const W_SECTION = 0.6;
// 同義詞是「我猜你要的」，永遠讓位給字面命中。
const W_SYNONYM = 0.7;
// 最近用過只夠**破同分**，⛔ 不夠跨過一整段命中品質。
const RECENT_BONUS = 30;

/** 一段文字對一個 token 的命中分數（0 = 沒中）。 */
function matchScore(hay: string, needle: string): number {
  if (!needle || !hay) return 0;
  if (hay === needle) return S_EXACT;
  if (hay.startsWith(needle)) return S_PREFIX;
  if (hay.includes(needle)) return S_SUBSTR;
  // 分散字元（「傷五」→「傷害五級距」）。用 Array.from 逐字元，⛔ 不用 index：
  // emoji 與部分中日文字是 surrogate pair，用 index 會把一個字切成兩半。
  const n = Array.from(needle);
  let i = 0;
  for (const ch of hay) {
    if (ch === n[i]) i += 1;
    if (i === n.length) return S_SUBSEQ;
  }
  return 0;
}

interface Field {
  text: string;
  weight: number;
  via: MatchVia;
}

function fieldsOf(row: NavRow): Field[] {
  return [
    { text: row.label.toLowerCase(), weight: W_LABEL, via: "label" },
    { text: rowKey(row).toLowerCase(), weight: W_PAGE, via: "page" },
    { text: row.section.toLowerCase(), weight: W_SECTION, via: "section" },
  ];
}

/** 一個 token 對一列的最佳命中（含同義詞展開）。 */
function tokenScore(fields: readonly Field[], token: string): { score: number; via: MatchVia } {
  let best = { score: 0, via: "label" as MatchVia };
  for (const f of fields) {
    const s = matchScore(f.text, token) * f.weight;
    if (s > best.score) best = { score: s, via: f.via };
  }
  for (const alt of SYNONYMS.get(token) ?? []) {
    for (const f of fields) {
      const s = matchScore(f.text, alt) * f.weight * W_SYNONYM;
      if (s > best.score) best = { score: s, via: "synonym" };
    }
  }
  return best;
}

/**
 * 把導覽列排成「最像我要的那一頁」的順序。**純函式** —— 守衛直接打它。
 *
 * · 母體：標題 · page id · 分組名 · 同義詞表
 * · 名次：完全相符 > 前綴 > 連續子字串 > 分散字元；同分時最近用過的排前面
 * · 多個 token（空白分隔）是 **AND**：每一個都要中，分數取平均
 * · query 空 ⇒ 「最近用過」排前面，後面補上原順序（第一次打開的人也看得到東西）
 */
export function rankPages(rows: readonly NavRow[], query: string, opts: RankOpts = {}): RankedRow[] {
  const limit = opts.limit ?? 20;
  const recent = opts.recent ?? [];
  const recentIdx = new Map(recent.map((k, i) => [k, i]));
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    const scored = rows.map((row, i) => ({ row, key: rowKey(row), i }));
    scored.sort((a, b) => {
      const ra = recentIdx.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const rb = recentIdx.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return ra !== rb ? ra - rb : a.i - b.i;
    });
    return scored
      .slice(0, limit)
      .map(({ row, key }) => ({ row, key, score: 0, via: recentIdx.has(key) ? "recent" : "label" }));
  }

  const out: (RankedRow & { i: number })[] = [];
  rows.forEach((row, i) => {
    const fields = fieldsOf(row);
    let total = 0;
    let best = { score: 0, via: "label" as MatchVia };
    for (const token of tokens) {
      const hit = tokenScore(fields, token);
      if (hit.score === 0) return; // AND：有一個 token 中不了就整列出局
      total += hit.score;
      if (hit.score > best.score) best = hit;
    }
    const key = rowKey(row);
    const idx = recentIdx.get(key);
    const bonus = idx === undefined ? 0 : Math.max(0, RECENT_BONUS - idx * 4);
    out.push({ row, key, score: total / tokens.length + bonus, via: best.via, i });
  });

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ra = recentIdx.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const rb = recentIdx.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return ra !== rb ? ra - rb : a.i - b.i;
  });
  return out.slice(0, limit).map(({ row, key, score, via }) => ({ row, key, score, via }));
}

/* ──────────────────────── 最近用過（偏好） ──────────────────────── */

/** ⚠️ 前綴照 lane 規格用 `ggd-admin-`。這是每一台瀏覽器自己的 UI 偏好，⛔ 不是後台設定。 */
export const PALETTE_RECENT_STORAGE_KEY = "ggd-admin-palette-recent";
/** 上限 8 —— 面板打開時一眼看得完的量。 */
export const PALETTE_RECENT_MAX = 8;

/** 把一個 key 推到最前面（去重、截斷）。純函式。 */
export function pushRecent(list: readonly string[], key: string, max = PALETTE_RECENT_MAX): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, max);
}

/** 讀回最近用過。壞掉的 JSON / 沒有 store（node、Safari 隱私模式）一律回空陣列。 */
export function loadRecent(store: NavPrefStore | null | undefined): string[] {
  if (!store) return [];
  try {
    const raw = store.getItem(PALETTE_RECENT_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string").slice(0, PALETTE_RECENT_MAX);
  } catch {
    return [];
  }
}

/** 存回最近用過。存不進去就算了 —— 一個存不下的偏好不值得炸掉整個後台。 */
export function saveRecent(store: NavPrefStore | null | undefined, list: readonly string[]): void {
  if (!store) return;
  try {
    store.setItem(PALETTE_RECENT_STORAGE_KEY, JSON.stringify(list.slice(0, PALETTE_RECENT_MAX)));
  } catch {
    /* best effort */
  }
}

function browserStore(): NavPrefStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // Safari 隱私模式：讀這個 global 本身就會擲例外
  }
}

/* ──────────────────────────── 熱鍵 ──────────────────────────── */

/** ⌘K / Ctrl+K 嗎。純函式 —— 這樣「熱鍵是哪一顆」驗得動，⛔ 不必模擬 DOM 事件。 */
export function isPaletteHotkey(e: { key: string; metaKey?: boolean; ctrlKey?: boolean }): boolean {
  return (e.metaKey === true || e.ctrlKey === true) && e.key.toLowerCase() === "k";
}

/**
 * 讓 `App.tsx` 一行接上 ⌘K。
 *
 * ⚠️ 開啟的權責在**外面**（App 持有 `open` 這個 state），所以這裡只回報「有人按了」。
 * 這個元件自己只管關（Esc / 點背景）。
 */
export function usePaletteHotkey(onOpen: () => void): void {
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (!isPaletteHotkey(e)) return;
      e.preventDefault();
      onOpen();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onOpen]);
}

/* ──────────────────────────── 元件 ──────────────────────────── */

export function CommandPalette(props: {
  rows: NavRow[];
  onNavigate: (page: string) => void;
  open: boolean;
  onClose: () => void;
}): React.JSX.Element | null {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadRecent(browserStore()));

  const results = useMemo(() => rankPages(props.rows, query, { recent }), [props.rows, query, recent]);

  // 每次打開都從乾淨的狀態開始 —— 上一次的查詢字串留著只會讓人先按退格。
  useEffect(() => {
    if (props.open) {
      setQuery("");
      setCursor(0);
      setRecent(loadRecent(browserStore()));
    }
  }, [props.open]);

  // 結果變短時把游標夾回範圍內，否則 Enter 會落在一個不存在的列上（＝什麼都不做）。
  const len = results.length;
  useEffect(() => {
    setCursor((c) => (c >= len ? Math.max(0, len - 1) : c));
  }, [len]);

  // ⚠️ keydown handler 讀 `results`/`cursor`，而它們每次 render 都是新的。用 ref 讓
  // listener 永遠讀得到最新的一份，⛔ 不必每次打字都拆裝一次 window listener。
  const latest = useRef({ results, cursor });
  latest.current = { results, cursor };

  useEffect(() => {
    if (!props.open) return;
    const h = (e: KeyboardEvent): void => {
      const { results: rs, cursor: cur } = latest.current;
      if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor(rs.length === 0 ? 0 : (cur + 1) % rs.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor(rs.length === 0 ? 0 : (cur - 1 + rs.length) % rs.length);
      } else if (e.key === "Enter") {
        const hit = rs[cur];
        if (hit) {
          e.preventDefault();
          go(hit);
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  function go(hit: RankedRow): void {
    const next = pushRecent(recent, hit.key);
    setRecent(next);
    saveRecent(browserStore(), next);
    props.onClose();
    if (isNavItem(hit.row)) props.onNavigate(hit.row.page);
    else if (typeof window !== "undefined") window.open(hit.row.href, "_blank", "noopener");
  }

  if (!props.open) return null;
  const browsing = query.trim() === "";

  return (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,6,12,0.72)",
        zIndex: 900,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92vw)",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 14,
          boxShadow: "0 24px 64px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 12, borderBottom: PANEL_BORDER }}>
          <TextInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setCursor(0);
            }}
            autoFocus
            dataField="palette-query"
            placeholder="搜尋頁面…（傷害 / cd / vfx / 殭屍；↑↓ 選、Enter 前往、Esc 關）"
            style={{ fontSize: 15, padding: "10px 12px" }}
          />
        </div>

        <div style={{ maxHeight: "56vh", overflowY: "auto" }}>
          {browsing && (
            <div style={{ padding: "8px 14px", fontSize: 11, color: TEXT_DIM, letterSpacing: 1 }}>
              {recent.length > 0 ? "最近用過" : `全部 ${props.rows.length} 頁 —— 打字開始搜尋`}
            </div>
          )}
          {results.length === 0 && (
            <div style={{ padding: "18px 14px", fontSize: 13, color: TEXT_DIM }}>
              找不到「{query}」—— 試試中文關鍵字（傷害 / 冷卻 / 殭屍）或縮寫（cd / mp / vfx）。
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={r.key}
              data-field={`palette-row-${r.key}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(r)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                cursor: "pointer",
                background: i === cursor ? ACCENT_BG : "transparent",
                borderLeft: `3px solid ${i === cursor ? ACCENT : "transparent"}`,
              }}
            >
              <span style={{ fontSize: 15, width: 22, textAlign: "center" }}>{r.row.emoji}</span>
              <span style={{ flex: 1, fontSize: 13, color: TEXT_MAIN }}>{r.row.label}</span>
              {/* ⭐ 分組永遠顯示：使用者不必知道分組長什麼樣，但每中一次就多長一點心智圖。 */}
              <span
                style={{
                  fontSize: 10,
                  color: TEXT_DIM,
                  border: PANEL_BORDER,
                  borderRadius: 6,
                  padding: "2px 7px",
                  whiteSpace: "nowrap",
                }}
              >
                {r.row.section}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
