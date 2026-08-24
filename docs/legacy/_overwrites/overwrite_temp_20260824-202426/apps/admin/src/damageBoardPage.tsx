/**
 * 傷害排行榜 (#636) —— **唯讀**報表頁。
 *
 * owner:「顯示被哪個人哪招傷害最高 比例分布 並在後台顯示」。
 * 資料是 game-server 每場收尾寫進 Redis 的 top 單發(前 1000 筆進這一頁),
 * 過濾(英雄/技能/版本)與分頁在瀏覽器做,佔比隨過濾即時重算。
 *
 * ⛔ 沒有儲存鈕是刻意的:這一頁不擁有任何資料,它只是 zset 的一面鏡子。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel } from "./ui/widgets";
import { ACCENT, GOLD, DANGER, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./ui/theme";
import {
  championShares,
  distinctValues,
  fetchDamageBoard,
  fetchOneShotThreshold,
  filterDamageRows,
  pageOf,
  pctOfMaxHp,
  type DamageBoardFilter,
  type DamageBoardRow,
} from "./damageBoard";
import { DEFAULT_ONE_SHOT_PCT_OF_MAX_HP } from "@ggd/shared/content";

const PER_PAGE = 50;

const fmtTs = (ms: number): string => (ms > 0 ? new Date(ms).toLocaleString("zh-TW", { hour12: false }) : "—");
const fmtDmg = (n: number): string => Math.round(n).toLocaleString("en-US");
/** 佔目標血量 —— ⚠️ 不知道就是「—」,⛔ 不是 0%(GH#658)。 */
const fmtPct = (p: number | null): string => (p === null ? "—" : `${(p * 100).toFixed(0)}%`);

export function DamageBoardPage(): JSX.Element {
  const [rows, setRows] = useState<DamageBoardRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<DamageBoardFilter>({
    championId: "",
    abilityId: "",
    version: "",
    minPctOfMaxHp: 0,
  });
  const [page, setPage] = useState(1);
  // GH#658 —— 標記/過濾的門檻,從 config 讀(覆蓋層 → 出貨檔 → 出貨常數)。
  const [threshold, setThreshold] = useState(DEFAULT_ONE_SHOT_PCT_OF_MAX_HP);
  const [onlyOneShot, setOnlyOneShot] = useState(false);

  useEffect(() => {
    let live = true;
    fetchDamageBoard()
      .then((r) => {
        if (!live) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (live) setErr(String(e));
      });
    void fetchOneShotThreshold().then((t) => {
      if (live) setThreshold(t);
    });
    return () => {
      live = false;
    };
  }, []);

  // ⚠️ 門檻是**非同步**載進來的,所以勾選框只存布林、界線在這裡才合成 ——
  // 存成數字的話,先勾再載完會留下一個過期的界線。
  const filtered = useMemo(
    () =>
      rows
        ? filterDamageRows(rows, { ...filter, minPctOfMaxHp: onlyOneShot ? threshold : 0 })
        : [],
    [rows, filter, onlyOneShot, threshold],
  );
  const shares = useMemo(() => championShares(filtered), [filtered]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows = pageOf(filtered, Math.min(page, pages), PER_PAGE);
  const topShare = shares[0]?.sharePct ?? 0;

  const sel = (key: keyof DamageBoardFilter, label: string, options: string[]): JSX.Element => (
    <label style={{ color: TEXT_DIM, fontSize: 13, marginRight: 14 }}>
      {label}{" "}
      <select
        value={filter[key]}
        onChange={(e) => {
          setFilter({ ...filter, [key]: e.target.value });
          setPage(1);
        }}
        style={{ background: "transparent", color: TEXT_MAIN, border: PANEL_BORDER, borderRadius: 4, padding: "2px 6px" }}
      >
        <option value="">全部</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Panel title="⚔️ 傷害排行榜(唯讀)">
      <div style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
        每場收尾寫進 Redis 的 <strong>top 單發</strong>(一發 = 一次施放打出的總傷害)。
        全榜 {total.toLocaleString("en-US")} 筆(上限十萬,尾端自動修剪),此頁載入前 1000 筆。
      </div>

      {err !== null && <div style={{ color: DANGER }}>讀取失敗:{err}</div>}
      {rows === null && err === null && <div style={{ color: TEXT_DIM }}>讀取中…</div>}

      {rows !== null && (
        <>
          <div style={{ marginBottom: 10 }}>
            {sel("championId", "英雄", distinctValues(rows, "championId"))}
            {sel("abilityId", "技能", distinctValues(rows, "abilityId"))}
            {sel("version", "版本", distinctValues(rows, "version"))}
            <span style={{ color: TEXT_DIM, fontSize: 13 }}>符合 {filtered.length} 筆</span>
          </div>

          {shares.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 6 }}>
                比例分布 <span style={{ color: TEXT_DIM }}>(基礎:目前過濾結果內的傷害總和,不是全 zset)</span>
              </div>
              {shares.slice(0, 12).map((s) => (
                <div key={s.championId} style={{ display: "flex", alignItems: "center", fontSize: 12, padding: "1px 0" }}>
                  <span style={{ width: 180, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.championId}
                  </span>
                  <div style={{ flex: 1, margin: "0 8px" }}>
                    <div
                      style={{
                        width: `${topShare > 0 ? Math.max(1, (s.sharePct / topShare) * 100) : 0}%`,
                        background: ACCENT,
                        height: 10,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span style={{ width: 120, color: TEXT_DIM, textAlign: "right" }}>
                    {s.sharePct.toFixed(1)}%({s.count} 筆)
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead>
                <tr style={{ color: TEXT_DIM, textAlign: "left" }}>
                  {["#", "傷害", "英雄", "技能", "槽位", "回合", "裝備", "版本", "時間"].map((h) => (
                    <th key={h} style={{ borderBottom: PANEL_BORDER, padding: "6px 8px" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => (
                  <tr key={`${r.matchId}-${r.seatId}-${r.ts}-${i}`} style={{ color: TEXT_MAIN }}>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{(Math.min(page, pages) - 1) * PER_PAGE + i + 1}</td>
                    <td style={{ padding: "5px 8px", color: GOLD }}>{fmtDmg(r.damage)}</td>
                    <td style={{ padding: "5px 8px" }}>{r.championId || "—"}</td>
                    <td style={{ padding: "5px 8px" }}>{r.abilityId}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{r.slot}</td>
                    <td style={{ padding: "5px 8px" }}>{r.round}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.items.length > 0 ? r.items.join(", ") : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{r.version}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{fmtTs(r.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div style={{ marginTop: 10, color: TEXT_DIM, fontSize: 13 }}>
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ marginRight: 8 }}>
                ← 上一頁
              </button>
              第 {Math.min(page, pages)} / {pages} 頁
              <button disabled={page >= pages} onClick={() => setPage(page + 1)} style={{ marginLeft: 8 }}>
                下一頁 →
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
