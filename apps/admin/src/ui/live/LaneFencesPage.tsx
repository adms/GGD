/**
 * 🚧【平行柵欄】—— 每一張 open 票該由哪條 lane 做、哪些是**序列化點**。
 *
 * owner 2026-08-27：「盡量**平行多工作流**最有效率、最短時間完成」。
 * ⭐ 而平行的唯一限制是**檔案柵欄**：兩條 lane 動同一個檔就會互相掃掉
 * （CLAUDE.md 量到過三次 lane 把對方 staged 的檔掃進自己的 commit）。
 *
 * ⭐ 這一頁的資料**從每張票自己宣告的 `Files / modules likely affected` 推導**
 * （開票規格 v3 要求的那一節）—— ⛔ 不是一張手寫的分派表。
 * 手寫的表會過期，而且第 108 張票加進來時不會有東西提醒你。
 *
 * ## ⚠️ 這一頁最重要的數字是「跨柵欄」那一格
 * 首次量到（2026-08-27）：**106 張 open 票裡 81 張跨柵欄（76%）** ——
 * ⇒ ⛔ 「九個互斥批次」是一個**過度樂觀**的模型；真正能單獨平行的只有 25 張。
 * ⭐ 這解釋了為什麼平行批次一再撞車。
 */
import { useCallback, useEffect, useState } from "react";
import { ACCENT, DANGER, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { ReviewStrip } from "./ReviewStrip";

interface Row {
  readonly n: number;
  readonly title: string;
  readonly priority: string;
  readonly fences?: readonly string[];
  readonly spansFences?: readonly string[];
}
interface Fence {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly tickets: readonly Row[];
}
interface Feed {
  readonly ghAvailable?: boolean;
  readonly ghError?: string;
  readonly note?: string;
  readonly totals?: { open: number; fenced: number; unfenced: number; spanning: number };
  readonly fences?: readonly Fence[];
  readonly spanning?: readonly Row[];
  readonly unfenced?: { note: string; tickets: readonly Row[] };
}

const PRI_COLOR: Record<string, string> = { 緊急: DANGER, 重要: WARN, 優先: ACCENT, 一般: TEXT_DIM };

function Ticket({ r }: { r: Row }): React.JSX.Element {
  const span = r.spansFences ?? r.fences;
  return (
    <div style={{ display: "flex", gap: 7, alignItems: "baseline", padding: "2px 0", fontSize: 12.5 }}>
      <a href={`https://github.com/adms/GGD/issues/${r.n}`} target="_blank" rel="noreferrer"
         style={{ color: ACCENT, minWidth: 44 }}>#{r.n}</a>
      <span style={{ color: PRI_COLOR[r.priority] ?? TEXT_DIM, minWidth: 34, fontSize: 11 }}>{r.priority}</span>
      <span style={{ color: TEXT_MAIN, flex: 1 }}>{r.title}</span>
      {span !== undefined && span.length > 1 ? (
        <span title="跨柵欄 ⇒ 序列化點" style={{ color: WARN, fontSize: 11 }}>⚠️ {span.length} 格</span>
      ) : null}
    </div>
  );
}

export function LaneFencesPage(): React.JSX.Element {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/__live/lane-fences", { headers: { accept: "application/json" } });
      if (!(r.headers.get("content-type") ?? "").includes("json")) {
        throw new Error(`/__live/lane-fences 回的不是 JSON（HTTP ${r.status}）`);
      }
      setFeed((await r.json()) as Feed);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const t = feed?.totals;
  const box: React.CSSProperties = { border: PANEL_BORDER, borderRadius: 8, padding: "10px 12px", marginBottom: 12 };

  return (
    <div>
      <ReviewStrip family={["parallel", "board", "lane"]} title="平行柵欄" />
      <h2 style={{ color: TEXT_MAIN, margin: "4px 0 8px" }}>🚧 平行柵欄 —— 誰能跟誰同時做</h2>

      {err !== null ? (
        <div style={{ ...box, borderLeft: `4px solid ${DANGER}`, color: DANGER, fontSize: 13 }}>{err}</div>
      ) : null}
      {feed !== null && feed.ghAvailable === false ? (
        <div style={{ ...box, borderLeft: `4px solid ${WARN}`, color: WARN, fontSize: 13 }}>
          ⚠️ <b>沒問到 gh</b> —— ⛔ 這不等於「沒有票」。{feed.ghError}
        </div>
      ) : null}

      {t !== undefined ? (
        <div style={{ ...box, borderLeft: `4px solid ${t.spanning > t.open / 2 ? WARN : OK}` }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: TEXT_MAIN }}>
            <span>open <b>{t.open}</b></span>
            <span style={{ color: OK }}>能單獨平行 <b>{t.open - t.spanning - t.unfenced}</b></span>
            <span style={{ color: WARN }}>⚠️ 跨柵欄（序列化點）<b>{t.spanning}</b></span>
            <span style={{ color: TEXT_DIM }}>⛔ 沒宣告受影響檔案 <b>{t.unfenced}</b></span>
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 11.5, marginTop: 6, lineHeight: 1.7 }}>
            {feed?.note}
            <br />
            ⭐ <b>跨柵欄佔 {Math.round((t.spanning / Math.max(1, t.open)) * 100)}%</b> ——
            ⛔ 「九個互斥批次」是過度樂觀的模型。一張跨 N 格的票，
            <b>⛔ 不可以跟那 N 格裡的任何一張同時跑</b>。
          </div>
        </div>
      ) : null}

      {(feed?.fences ?? []).filter((f) => f.count > 0).map((f) => (
        <div key={f.id} style={box}>
          <div style={{ color: TEXT_MAIN, fontSize: 13.5, marginBottom: 4 }}>
            {f.label} <span style={{ color: TEXT_DIM }}>· {f.count} 張</span>
          </div>
          {f.tickets.map((r) => <Ticket key={r.n} r={r} />)}
        </div>
      ))}

      {feed?.unfenced !== undefined && feed.unfenced.tickets.length > 0 ? (
        <div style={{ ...box, borderLeft: `4px solid ${TEXT_DIM}` }}>
          <div style={{ color: TEXT_MAIN, fontSize: 13.5 }}>⛔ 沒宣告受影響檔案 · {feed.unfenced.tickets.length} 張</div>
          <div style={{ color: TEXT_DIM, fontSize: 11.5, margin: "3px 0 6px" }}>{feed.unfenced.note}</div>
          {feed.unfenced.tickets.map((r) => <Ticket key={r.n} r={r} />)}
        </div>
      ) : null}
    </div>
  );
}
