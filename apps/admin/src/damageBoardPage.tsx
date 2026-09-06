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
  type DamageBoardCaliber,
  type DamageBoardFilter,
  type DamageBoardRow,
  DAMAGE_BOARD_COLUMNS,
  damagePerTarget,
  sortDamageRows,
  type SortDir,
} from "./damageBoard";
import { fetchNameIndex, itemLabels, nameLabelFor, type NameIndex, type NameKind } from "./contentNames";
import { DEFAULT_ONE_SHOT_PCT_OF_MAX_HP } from "@ggd/shared/content";

const PER_PAGE = 50;

const fmtTs = (ms: number): string => (ms > 0 ? new Date(ms).toLocaleString("zh-TW", { hour12: false }) : "—");
const fmtDmg = (n: number): string => Math.round(n).toLocaleString("en-US");
/** 佔目標血量 —— ⚠️ 不知道就是「—」,⛔ 不是 0%(GH#658)。 */
const fmtPct = (p: number | null): string => (p === null ? "—" : `${(p * 100).toFixed(0)}%`);

export function DamageBoardPage(): JSX.Element {
  const [rows, setRows] = useState<DamageBoardRow[] | null>(null);
  const [total, setTotal] = useState(0);
  // ⭐ GH#1015 —— 口徑由伺服器宣告(⛔ 這一頁不自己寫「這是技能排行」那句話)。
  const [caliber, setCaliber] = useState<DamageBoardCaliber | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<DamageBoardFilter>({
    championId: "",
    abilityId: "",
    version: "",
    minPctOfMaxHp: 0,
  });
  const [page, setPage] = useState(1);
  // ⭐ 預設按**傷害降冪** —— 這是一張「哪一發最痛」的榜（⛔ 不是時間軸）。
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: "damage", dir: "desc" });
  // GH#658 —— 標記/過濾的門檻,從 config 讀(覆蓋層 → 出貨檔 → 出貨常數)。
  const [threshold, setThreshold] = useState(DEFAULT_ONE_SHOT_PCT_OF_MAX_HP);
  const [onlyOneShot, setOnlyOneShot] = useState(false);
  // #786 —— id → 出貨名稱,載入時從 bundle join(⛔ 名稱不進排行榜資料)。
  // null = 還沒載到/載不到 ⇒ 印裸 id 不加 ⚠(沒查過就不宣稱「沒有」)。
  const [names, setNames] = useState<NameIndex | null>(null);

  useEffect(() => {
    let live = true;
    fetchDamageBoard()
      .then((r) => {
        if (!live) return;
        setRows(r.rows);
        setTotal(r.total);
        setCaliber(r.caliber);
      })
      .catch((e: unknown) => {
        if (live) setErr(String(e));
      });
    void fetchOneShotThreshold().then((t) => {
      if (live) setThreshold(t);
    });
    fetchNameIndex()
      .then((idx) => {
        if (live) setNames(idx);
      })
      .catch(() => {
        /* fail-open:報表照開,列退回裸 id —— 名冊只是給人看的那一半 */
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
  // ⭐ GH#914 —— 排序**在分頁之前**（⛔ 不是只排當頁）：
  //   只排當頁的話「按傷害排序」會變成「把這 50 筆重排」，⛔ 而不是找出最痛的那一發。
  const sorted = useMemo(() => sortDamageRows(filtered, sort.key, sort.dir), [filtered, sort]);
  const pageRows = pageOf(sorted, Math.min(page, pages), PER_PAGE);
  const topShare = shares[0]?.sharePct ?? 0;

  // ---- #786:「名稱＋小字 id」的三個渲染件 --------------------------------
  // 查不到 = ⚠＋裸 id(⛔ 不編名字);名冊還沒載到 = 裸 id 不加 ⚠。
  const nameCell = (kind: NameKind, id: string): JSX.Element => {
    if (id === "") return <>—</>;
    if (names === null) return <>{id}</>;
    const l = nameLabelFor(names, kind, id);
    if (l.name === null) return <span title="出貨 bundle 裡沒有這個 id(退休/舊資料)">⚠ {l.id}</span>;
    return (
      <>
        {l.name} <span style={{ color: TEXT_DIM, fontSize: 10 }}>{l.id}</span>
      </>
    );
  };
  /** 下拉選項的純文字版(option 裡放不了 JSX)。 */
  const optionText = (kind: NameKind, id: string): string => {
    const n = names === null ? null : nameLabelFor(names, kind, id).name;
    return n === null ? id : `${n}（${id}）`;
  };

  type SelKey = "championId" | "abilityId" | "version";
  const sel = (key: SelKey, label: string, options: string[], kind?: NameKind): JSX.Element => (
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
            {kind === undefined ? o : optionText(kind, o)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Panel title="⚔️ 技能施放傷害排行榜(唯讀)">
      <div style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
        每場收尾寫進 Redis 的 <strong>top 單發</strong>(一發 = <strong>一次技能施放</strong>打出的總傷害)。
        全榜 {total.toLocaleString("en-US")} 筆(上限十萬,尾端自動修剪),此頁載入前 1000 筆。
      </div>
      {/* ⭐ GH#1015 —— 口徑印在表的旁邊,⛔ 不只藏在伺服器檔頭:
          這是「技能施放」的排行,普攻**結構上**進不了這張表 ⇒ 「前 N 名全是技能」是口徑,不是發現。 */}
      <div
        data-testid="damage-board-caliber"
        style={{ color: GOLD, fontSize: 12, lineHeight: 1.7, marginBottom: 12, border: PANEL_BORDER, borderRadius: 4, padding: "6px 8px" }}
      >
        <strong>口徑:</strong>{" "}
        {caliber === null ? (
          <>這是<strong>技能施放</strong>的排行(一列 = 一次施放);<strong>普攻不在這張表上</strong>——它沒有「一次施放」這個單位。⛔ 不要把它讀成「全部傷害」的排行。</>
        ) : (
          <>
            一列 = 一次 <code>{caliber.unit}</code>;⛔ 結構上不含:<strong>{caliber.excludes.join(" / ")}</strong>。
            {caliber.note !== "" && <span style={{ color: TEXT_DIM }}> {caliber.note}</span>}
          </>
        )}
      </div>

      {err !== null && <div style={{ color: DANGER }}>讀取失敗:{err}</div>}
      {rows === null && err === null && <div style={{ color: TEXT_DIM }}>讀取中…</div>}

      {rows !== null && (
        <>
          <div style={{ marginBottom: 10 }}>
            {sel("championId", "英雄", distinctValues(rows, "championId"), "champions")}
            {sel("abilityId", "技能", distinctValues(rows, "abilityId"), "abilities")}
            {sel("version", "版本", distinctValues(rows, "version"))}
            {/* ⭐ GH#658 —— 門檻**不寫死**:它是「傷害規則」那一頁的 oneShotPctOfMaxHp。 */}
            <label style={{ color: TEXT_DIM, fontSize: 13, marginRight: 14 }}>
              <input
                type="checkbox"
                checked={onlyOneShot}
                onChange={(e) => {
                  setOnlyOneShot(e.target.checked);
                  setPage(1);
                }}
                style={{ marginRight: 4 }}
              />
              只看一擊 ≥ {fmtPct(threshold)} 目標血量
            </label>
            <span style={{ color: TEXT_DIM, fontSize: 13 }}>符合 {filtered.length} 筆</span>
          </div>
          <div style={{ color: TEXT_DIM, fontSize: 12, marginBottom: 10 }}>
            「佔目標血量」＝ 這一次施放打在<strong>單一英雄</strong>身上的最大一擊 ÷ 那個人
            <strong>命中當下</strong>的最大生命(⛔ 不是這一列的總傷害 ÷ 誰的血量 —— AoE 的總傷害
            沒有落在任何一個人身上)。門檻 {fmtPct(threshold)} 在「傷害規則」那一頁調,改完這一頁跟著變。
            <strong>「—」＝ 這筆是本功能上線前寫進榜的舊資料</strong>,⛔ 不是 0%。
          </div>

          {shares.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: TEXT_MAIN, fontSize: 13, marginBottom: 6 }}>
                比例分布 <span style={{ color: TEXT_DIM }}>(基礎:目前過濾結果內的傷害總和,不是全 zset)</span>
              </div>
              {shares.slice(0, 12).map((s) => (
                <div key={s.championId} style={{ display: "flex", alignItems: "center", fontSize: 12, padding: "1px 0" }}>
                  <span
                    title={s.championId}
                    style={{ width: 180, color: TEXT_MAIN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {nameCell("champions", s.championId)}
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
                  {DAMAGE_BOARD_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={
                        c.sortable === false
                          ? undefined
                          : () => {
                              // ⭐ 同一欄再點一次 ⇒ 反向；換一欄 ⇒ 從**降冪**開始
                              //   （⛔ 不是升冪：這是一張「哪一發最痛」的榜）。
                              setSort((prev) =>
                                prev.key === c.key
                                  ? { key: c.key, dir: prev.dir === "desc" ? "asc" : "desc" }
                                  : { key: c.key, dir: "desc" },
                              );
                              setPage(1);
                            }
                      }
                      style={{
                        borderBottom: PANEL_BORDER,
                        padding: "6px 8px",
                        cursor: c.sortable === false ? "default" : "pointer",
                        whiteSpace: "nowrap",
                        color: sort.key === c.key ? TEXT_MAIN : undefined,
                      }}
                      title={c.sortable === false ? undefined : "點一下排序"}
                    >
                      {c.label}
                      {sort.key === c.key && (sort.dir === "desc" ? " ▼" : " ▲")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const pct = pctOfMaxHp(r);
                  const oneShot = pct !== null && pct >= threshold;
                  return (
                  <tr
                    key={`${r.matchId}-${r.seatId}-${r.ts}-${i}`}
                    style={{ color: TEXT_MAIN, background: oneShot ? "rgba(255,64,64,0.14)" : undefined }}
                  >
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{(Math.min(page, pages) - 1) * PER_PAGE + i + 1}</td>
                    <td style={{ padding: "5px 8px", color: GOLD }}>{fmtDmg(r.damage)}</td>
                    <td style={{ padding: "5px 8px", color: oneShot ? DANGER : TEXT_DIM, whiteSpace: "nowrap" }}>
                      {fmtPct(pct)}
                      {oneShot && <strong style={{ marginLeft: 6 }}>☠ 一擊</strong>}
                    </td>
                    {/* ⭐ GH#914 —— `victimDamage` 一直都在 entry 裡，⛔ 而畫面從來沒顯示它。
                        ⚠️ 百分比**藏住了絕對值**：「佔 40%」在 3,000 血與 30,000 血的人身上差十倍。 */}
                    <td style={{ padding: "5px 8px", color: TEXT_DIM, whiteSpace: "nowrap" }}>
                      {r.victimDamage === null ? "—" : fmtDmg(r.victimDamage)}
                    </td>
                    {/* ⚠️ ⭐ 兩個命中數**分開**（owner 逐字）：一發掃 30 隻殭屍與
                        一發打中 3 個英雄是**完全不同的事件**。缺席畫「—」，⛔ 不是 0。 */}
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{r.heroHits ?? "—"}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{r.mobHits ?? "—"}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM, whiteSpace: "nowrap" }}>
                      {(() => {
                        const v = damagePerTarget(r);
                        return v === null ? "—" : fmtDmg(v);
                      })()}
                    </td>
                    <td style={{ padding: "5px 8px" }}>{nameCell("champions", r.championId)}</td>
                    <td style={{ padding: "5px 8px" }}>{nameCell("abilities", r.abilityId)}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{r.slot}</td>
                    {/* ⭐ 等級：缺席 ⇒ 「—」，⛔ 不是 0（0 會讓舊資料看起來像等級 0）。 */}
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{r.casterLevel ?? "—"}</td>
                    <td style={{ padding: "5px 8px" }}>{r.round}</td>
                    <td
                      title={
                        names === null
                          ? r.items.join(", ")
                          : itemLabels(names, r.items)
                              .map((l) => (l.name === null ? `⚠ ${l.id}` : `${l.name}（${l.id}）`))
                              .join(", ")
                      }
                      style={{ padding: "5px 8px", color: TEXT_DIM, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {r.items.length === 0
                        ? "—"
                        : names === null
                          ? r.items.join(", ")
                          : itemLabels(names, r.items).map((l, j) => (
                              <span key={`${l.id}-${j}`}>
                                {j > 0 && ", "}
                                {l.name === null ? (
                                  <span title="出貨 bundle 裡沒有這個 id">⚠ {l.id}</span>
                                ) : (
                                  <>
                                    {l.name} <span style={{ fontSize: 10 }}>{l.id}</span>
                                  </>
                                )}
                              </span>
                            ))}
                    </td>
                    {/* ⭐ 同場識別 —— entry 一直都有 `matchId`，⛔ 而畫面沒顯示它
                        ⇒ 「這幾發是同一場的嗎」看不出來。前 8 碼夠辨識，全文進 title。 */}
                    <td title={r.matchId} style={{ padding: "5px 8px", color: TEXT_DIM, fontFamily: "monospace", fontSize: 11 }}>
                      {r.matchId === "" ? "—" : r.matchId.slice(0, 8)}
                    </td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{r.version}</td>
                    <td style={{ padding: "5px 8px", color: TEXT_DIM }}>{fmtTs(r.ts)}</td>
                  </tr>
                  );
                })}
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
