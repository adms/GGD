/**
 * 🚧 `lane-fences` —— **每一張 open 票該由哪條平行 lane 做、哪些票會撞車**。
 *
 * ## 這份資料要回答的問題
 * owner 2026-08-27：「盡量**平行多工作流**最有效率、最短時間完成」。
 * ⭐ 而平行的**唯一**限制是**檔案柵欄**：兩條 lane 動同一個檔就會互相掃掉
 * （CLAUDE.md 量到過三次 lane 互相把對方 staged 的檔掃進自己的 commit）。
 *
 * ⛔ 在此之前這件事是**手工**的：我每次派工都要自己讀 100 張票、心算誰跟誰衝突。
 * ⭐ 而那份資訊**已經在票裡**了 —— 開票規格 v3 逐字要求每張票寫
 * `Files / modules likely affected`。⇒ 這一支只是把它**讀出來**。
 *
 * ## ⭐ 它是推導的，⛔ 不是一張手寫的分派表
 * 手寫的表會過期，而且第 108 張票加進來時不會有東西提醒你 ——
 * 那正是 CLAUDE.md 反覆記錄的形狀（「一份被散文守著的表活過了它的保存期限」）。
 *
 * ## 誠實的邊界（⛔ 不假裝準）
 * · 票沒寫 `Files / modules` ⇒ 進 **`unfenced`**（⛔ 不是猜一個柵欄給它）。
 *   ⭐ 那一堆本身就是訊號：**它們沒辦法被安全地平行化**。
 * · 一張票命中多個柵欄 ⇒ 它**同時**出現在那幾格，並被標成 `spansFences`
 *   ⇒ 它是**序列化點**，⛔ 不可以跟那幾格的任何一張同時跑。
 * · `gh` 打不到 ⇒ `ghAvailable:false` ＋ 錯誤字串（⛔ 不是靜默地回空的）。
 */
import { execFile } from "node:child_process";

/**
 * GH#821 豁免（能被反駁）：柵欄是從每張 open 票 body 的 `Files / modules likely
 * affected` 欄**推導**的（檔頭整段在講這件事）—— 家在 GitHub 票，⛔ 不在 repo 檔案。
 * 反駁法：指出一份此頁在讀的 repo 手編來源。
 */
export const readonlyWhy =
  "從票的 Files 欄推導（#833 的合法豁免候選）；可編的家在 GitHub 票 body，repo 裡沒有手編來源。";

/**
 * 柵欄定義 —— ⭐ 與實際派工用的那幾條**一致**。
 * ⚠️ 順序有意義：由**窄到寬**比對，第一個命中的贏（`tools/review` 要贏過 `tools/`）。
 */
const FENCES = [
  { id: "review", label: "🧑‍⚖️ 批核/部署鏈", match: [/tools\/review/, /tools\/admin-live/, /docker\//, /nginx\//, /host-deploy/] },
  { id: "content", label: "📦 內容·技能 JSON", match: [/content\//, /tools\/skill-remake/, /tools\/ap-conversion/] },
  { id: "admin", label: "🖥️ 後台 console", match: [/apps\/admin/] },
  { id: "client", label: "🎨 客戶端渲染·輸入", match: [/apps\/client/] },
  { id: "server", label: "⚙️ sim·game-server", match: [/packages\/shared\/src\/sim/, /packages\/shared\/src\/protocol/, /apps\/game-server/] },
  { id: "platform", label: "🔐 平台 Go", match: [/apps\/platform/] },
  { id: "toolchain", label: "🔧 產生器·腳本", match: [/^tools\//, /\btools\//, /scripts\//] },
  { id: "docs", label: "📘 文件·守衛", match: [/^docs\//, /\bdocs\//, /packages\/shared\/src\/ops/] },
];

/** 票 body 裡宣告受影響檔案的那一節（開票規格 v3 要求的）。 */
const FILES_SECTION = /(?:Files\s*\/\s*modules likely affected|受影響(?:的)?檔案|Files affected)\s*\*{0,2}\s*[:：]?\s*([\s\S]{0,900}?)(?:\n\*\*|\n##|\n---|$)/i;

function fencesOf(body) {
  const m = FILES_SECTION.exec(body ?? "");
  if (m === null) return null; // ⛔ 沒宣告 —— ⛔ 不猜
  const text = m[1];
  const hit = [];
  for (const f of FENCES) {
    if (f.match.some((re) => re.test(text))) hit.push(f.id);
  }
  return hit.length > 0 ? hit : null;
}

const PRIORITY = ["緊急", "重要", "優先", "一般"];
const priorityOf = (title) => PRIORITY.find((p) => title.includes(`[${p}]`)) ?? "(無)";

function ghIssues() {
  return new Promise((resolve) => {
    execFile(
      "gh",
      ["issue", "list", "--state", "open", "--limit", "400", "--json", "number,title,body"],
      { timeout: 20_000, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: String(err.message ?? err) });
        try {
          resolve({ ok: true, items: JSON.parse(stdout) });
        } catch (e) {
          resolve({ ok: false, error: `gh 回的不是 JSON：${String(e)}` });
        }
      },
    );
  });
}

/**
 * ⚠️ 這一份的**真正來源是 gh**（不是檔案），而來源檔 md5 快取看不見 gh。
 * ⛔ 回空陣列 = 永遠吃快取 ⇒ 票關掉了它還在說「open」。
 * ⭐ 所以掛一份**會動的**檔案當節拍器：票務狀態每次收斂都會動到帳本，
 *   ⇒ 帳本一動就重算。⛔ 這不精確，而檔頭已經說明它不精確。
 */
export const deps = () => ["docs/_task-ledger.json", "docs/_daily"];

export async function build() {
  const gh = await ghIssues();
  if (!gh.ok) {
    return {
      ghAvailable: false,
      ghError: gh.error,
      note: "⚠️ **沒問到** gh —— ⛔ 這不等於「沒有票」。柵欄分派這一塊在離線時無法計算。",
      fences: [],
    };
  }
  const buckets = new Map(FENCES.map((f) => [f.id, []]));
  const unfenced = [];
  const spanning = [];

  for (const it of gh.items) {
    const hit = fencesOf(it.body);
    const row = { n: it.number, title: (it.title ?? "").slice(0, 70), priority: priorityOf(it.title ?? "") };
    if (hit === null) {
      unfenced.push(row);
      continue;
    }
    if (hit.length > 1) spanning.push({ ...row, fences: hit });
    for (const id of hit) buckets.get(id).push(hit.length > 1 ? { ...row, spansFences: hit } : row);
  }

  const order = { 緊急: 0, 重要: 1, 優先: 2, 一般: 3, "(無)": 4 };
  const sortRows = (a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9) || a.n - b.n;

  return {
    ghAvailable: true,
    note:
      "⭐ 柵欄從**每張票自己宣告的** `Files / modules likely affected` 推導（開票規格 v3 要求的那一節），" +
      "⛔ 不是一張手寫的分派表。同一格裡的票**可以平行**；⚠️ `spansFences` 的票是**序列化點**。",
    totals: {
      open: gh.items.length,
      fenced: gh.items.length - unfenced.length,
      unfenced: unfenced.length,
      spanning: spanning.length,
    },
    fences: FENCES.map((f) => ({
      id: f.id,
      label: f.label,
      count: buckets.get(f.id).length,
      tickets: buckets.get(f.id).sort(sortRows),
    })),
    spanning: spanning.sort(sortRows),
    unfenced: {
      note:
        "⛔ 這些票**沒有宣告受影響檔案**（開票規格 v3 的必填一節）⇒ 沒辦法被安全地平行化。" +
        "⭐ 補上那一節就會自動落到某一格 —— ⛔ 不必改這支程式。",
      tickets: unfenced.sort(sortRows),
    },
  };
}
