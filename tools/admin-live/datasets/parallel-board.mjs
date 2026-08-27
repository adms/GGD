/**
 * 🧭 GGD 平行處理盤（parallel-board）—— 批次／票的看板資料面。
 *
 * 三個來源（誠實列）：
 *   ① `gh issue list`（**best-effort**）—— open 票與標題上的優先級/類型 tag。
 *      ⚠️ gh 不是檔案：離線／逾時就 `ghAvailable:false` 帶錯誤字串，頁面照畫其餘兩塊。
 *      ⚠️ mtime 快取看不見 gh 的變化 —— open 票的新舊以 deps 檔案有動時的那次重算為準。
 *   ② `docs/_task-ledger.json`（tools/status/gen_status.py 的產物）—— session 任務帳本。
 *   ③ `docs/_daily/<YYYY-MM-DD>.md` 的逐則對票表 —— owner 的話（逐字、截斷）→ 票。
 *      兩種歷史格式都收：3 欄 `|時間|話|票|`（08-20 起）與 5 欄 `|#|時間|話|落到哪|狀態|`（08-19）。
 *
 * ⛔ 不寫任何檔；⛔ 不 import apps/**、packages/**。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";

/**
 * GH#821 豁免（能被反駁）：三個來源分別是 gh 票（家在 GitHub，⛔ 不在 repo 檔案）、
 * docs/_task-ledger.json（gen_status.py 產物）、docs/_daily/*.md（msgledger:build 產物，444）。
 * repo 裡沒有一份手編來源可以當寫入目標。反駁法：指出一份此頁在讀的手編檔。
 */
export const readonlyWhy =
  "從 GitHub 票＋兩種產生器產物推導；可編的家在 GitHub 票本身，repo 裡沒有手編來源（#832 的合法豁免候選）。";

const DAILY_DIR = "docs/_daily";
const LEDGER = "docs/_task-ledger.json";
const QUOTE_MAX = 280;
const NOTE_MAX = 220;

function listDailyFiles(repoRoot) {
  const dir = join(repoRoot, DAILY_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
}

/** deps 是函式：每一份日期帳本逐檔列（目錄 mtime 只反映增刪，不反映內容改動）。 */
export function deps(repoRoot) {
  return [LEDGER, DAILY_DIR, ...listDailyFiles(repoRoot).map((f) => `${DAILY_DIR}/${f}`)];
}

const clamp = (s, n) => {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** 標題開頭的 [tag] 串 → { priority, types, cleanTitle }。 */
const PRIORITIES = ["緊急", "重要", "優先", "一般"];
function parseTitleTags(title) {
  let rest = title;
  let priority = "未標";
  const types = [];
  // 只吃「開頭連續」的 [..] tag —— 內文中段的 [方括號] 不動
  for (;;) {
    const m = rest.match(/^\s*\[([^\]]{1,20})\]/);
    if (!m) break;
    const tag = m[1].trim();
    if (PRIORITIES.includes(tag)) priority = tag;
    else types.push(tag);
    rest = rest.slice(m[0].length);
  }
  return { priority, types, cleanTitle: rest.trim() };
}

/** best-effort `gh issue list`（8 秒逾時；離線回 {ok:false,error}）。 */
function fetchOpenIssues(repoRoot) {
  return new Promise((resolve) => {
    execFile(
      "gh",
      ["issue", "list", "--state", "open", "--limit", "400", "--json", "number,title,updatedAt"],
      { cwd: repoRoot, timeout: 8000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: clamp(String(stderr || err.message || err), 300) });
        try {
          resolve({ ok: true, issues: JSON.parse(stdout) });
        } catch (e) {
          resolve({ ok: false, error: `gh 輸出不是 JSON：${clamp(String(e), 200)}` });
        }
      },
    );
  });
}

/** 一份日期帳本 md → 逐則對票 rows。 */
function parseDailyFile(repoRoot, file) {
  const year = file.slice(0, 4);
  let date = file.slice(0, 10); // 檔名日期；`### 08-18` 小節出現時跟著換
  const rows = [];
  const text = readFileSync(join(repoRoot, DAILY_DIR, file), "utf8");
  for (const line of text.split("\n")) {
    const sec = line.match(/^#{2,4}\s+(\d{2})-(\d{2})\s*$/);
    if (sec) {
      date = `${year}-${sec[1]}-${sec[2]}`;
      continue;
    }
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    let time = "";
    let quote = "";
    let ticketCell = "";
    if (/^\d{1,2}:\d{2}$/.test(cells[0])) {
      // 3 欄式：|時間|話|票|（話裡有 | 時中段全併回話）
      time = cells[0];
      quote = cells.slice(1, -1).join(" | ");
      ticketCell = cells[cells.length - 1];
    } else if (/^\d+$/.test(cells[0]) && /^\d{1,2}:\d{2}$/.test(cells[1] ?? "")) {
      // 5 欄式（08-19）：|#|時間|話|落到哪|狀態|
      time = cells[1];
      quote = cells[2] ?? "";
      ticketCell = cells.slice(3).join(" · ");
    } else {
      continue; // 表頭、分隔線、其他表
    }
    const tickets = [...ticketCell.matchAll(/#(\d{2,4})/g)].map((m) => Number(m[1]));
    rows.push({
      date,
      time,
      quote: clamp(quote, QUOTE_MAX),
      tickets,
      note: clamp(ticketCell, NOTE_MAX),
    });
  }
  return rows;
}

export async function build(repoRoot) {
  // ① session 任務帳本（產生器產物 —— 引用它的值，不重算）
  let sessionTasks = { ok: false, error: `${LEDGER} 不存在`, generated: null, source: null, counts: {}, tasks: [] };
  try {
    const led = JSON.parse(readFileSync(join(repoRoot, LEDGER), "utf8"));
    const tasks = (led.tasks ?? []).map((t) => ({ id: t.id, subject: t.subject, status: t.status }));
    const counts = { completed: 0, in_progress: 0, pending: 0 };
    for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
    sessionTasks = { ok: true, error: null, generated: led.generated ?? null, source: led.source ?? null, counts, tasks };
  } catch (e) {
    sessionTasks.error = clamp(String(e), 300);
  }

  // ② 逐則對票（全部日期帳本）
  const files = listDailyFiles(repoRoot);
  const rows = [];
  for (const f of files) rows.push(...parseDailyFile(repoRoot, f));
  rows.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
  const latestDate = rows.length ? rows[rows.length - 1].date : null;

  // 票 → 提及統計（把 owner 的話 join 到票上）
  const mentions = new Map();
  for (const r of rows)
    for (const n of r.tickets) {
      const m = mentions.get(n) ?? { count: 0, lastDate: null };
      m.count += 1;
      if (!m.lastDate || r.date > m.lastDate) m.lastDate = r.date;
      mentions.set(n, m);
    }

  // ③ open 票（gh best-effort）
  const gh = await fetchOpenIssues(repoRoot);
  let open = [];
  if (gh.ok) {
    open = gh.issues.map((i) => {
      const { priority, types, cleanTitle } = parseTitleTags(i.title);
      const m = mentions.get(i.number);
      return {
        number: i.number,
        priority,
        types,
        title: cleanTitle,
        updatedAt: (i.updatedAt ?? "").slice(0, 10),
        mentions: m?.count ?? 0,
        lastMention: m?.lastDate ?? null,
      };
    });
    open.sort((a, b) => b.number - a.number);
  }
  const priorityCounts = {};
  for (const t of open) priorityCounts[t.priority] = (priorityCounts[t.priority] ?? 0) + 1;

  return {
    tickets: {
      ghAvailable: gh.ok,
      ghError: gh.ok ? null : gh.error,
      note: "open 票來自 gh issue list（標題上的 [tag]）；⚠️ gh 不是檔案，mtime 快取看不見它 —— 這一塊的新舊以 deps 檔案有動時的重算為準。",
      open,
      priorityCounts,
    },
    sessionTasks,
    daily: {
      files: files.length,
      rowCount: rows.length,
      latestDate,
      rows,
    },
  };
}
