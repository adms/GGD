/**
 * IconWorkshopPage —— 🏭 圖示工坊（owner 2026-08-17）。
 *
 *	「請你做成後台編輯器可以**動態單個／批次產生**的功能頁，可以透過 UI 生成，
 *	  也可以在地端呼叫 script 完成所有流程 + 測試 + 回饋比較重新生成，
 *	  讓我以後可以**穩定的重複使用**」
 *
 * ── 這一頁與既有兩個入口的分工（⛔ 不是第三份實作）─────────────────────────
 *
 * | 入口 | 回答的問題 |
 * |---|---|
 * | 🖌 圖示風格（`config.icon-style@1`） | 「畫成什麼樣子」—— 風格字串與六格火候 |
 * | 內容管理裡的 `IconGenStrip` | 「我剛新增了一份文件，順手畫一張」（**單張**、在編輯現場） |
 * | **這一頁** | 「把**這一批**重畫一次，然後我逐張看過去」 |
 *
 * ⛔ 產圖的請求走的是**同一支** `iconApi.enqueue` 與同一個 daemon 佇列 ——
 * 這一頁只是換一個選取方式（多選）與一個看得到全部的版面。⚠️ 第二份排隊邏輯
 * 會讓兩邊的併發控制互相打架，而症狀是 GPU 被塞爆、兩邊都轉圈。
 *
 * ── ⚠️ 一次只送一張，⛔ 不是「批次 API」──────────────────────────────────
 *
 * daemon 的 `POST /jobs` 收一份文件。這一頁**刻意**逐張送而不是新開一條批次路由：
 * 佇列本來就在 daemon 那一側，逐張送得到的併發、進度、取消**逐項**都一樣，而
 * 一條批次路由會多出「一半成功怎麼回報」這個真正困難的問題。
 *
 * ── 地端腳本是同一條路的另一個入口 ──────────────────────────────────────
 *
 *	python3 tools/icon-gen/local/workshop.py redo --ids a,b,c
 *
 * 那一支多做兩件這一頁做不到的事：**自動備份 + 一鍵退回**（`.prev.webp`）與
 * **新舊並排的對照頁**。⚠️ 兩者共用同一份 `config.icon-style@1`，所以畫風一致 ——
 * 那一條是 `iconApi.test.ts` 在守的（`daemon.py` 與 `batch.py` 都讀 `load_icon_style()`）。
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { loadCollection, contentAssetUrl } from "../content";
import type { ContentRow } from "../curation";
import { isIconable, type IconCollection } from "../icons/iconApi";
import { useIconGen, type IconGen } from "./IconGenStrip";
import { createIconApi } from "../icons/iconApi";
import { Btn } from "./widgets";

/** 這一頁看得到的四個集合。⛔ 與 `isIconable` 同一份名單，不另外抄。 */
const COLLECTIONS: readonly { id: IconCollection; zh: string }[] = [
  { id: "champions", zh: "英雄" },
  { id: "abilities", zh: "技能" },
  { id: "items", zh: "道具・寶具" },
  { id: "augments", zh: "增益卡・聖杯願望" },
];

type Filter = "all" | "missing" | "has";

const CARD = 84;

export function IconWorkshopPage(): React.JSX.Element {
  const api = useMemo(() => createIconApi(), []);
  const [collection, setCollection] = useState<IconCollection>("augments");
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // ⚠️ 重畫完要**重讀**清單，否則畫面上還是舊圖 —— 而操作者會看到「完成」旁邊
  // 一張沒變的圖，那讀起來就是這個功能在說謊。
  const [stamp, setStamp] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    void loadCollection(collection)
      .then((r) => setRows(r))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [collection]);

  useEffect(() => {
    setPicked(new Set());
    reload();
  }, [reload]);

  const gen: IconGen = useIconGen(api, () => setStamp((n) => n + 1));

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "missing" && r.icon) return false;
      if (filter === "has" && !r.icon) return false;
      if (!needle) return true;
      return r.id.toLowerCase().includes(needle) || (r.name ?? "").toLowerCase().includes(needle);
    });
  }, [rows, filter, q]);

  const toggle = (id: string): void =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runBatch = (): void => {
    // `force` 為 true：這一頁的動作就是「**重**畫」，⛔ 不是「補沒有的」。
    // 補沒有的那條路走上面的「只看缺圖」+ 全選，語意仍然是使用者選的。
    for (const id of picked) gen.request(collection, id, true);
  };

  const off = gen.mode === "off";

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: "0 0 4px" }}>🏭 圖示工坊</h2>
      <p style={{ color: "#8d97ad", fontSize: 13, margin: "0 0 14px", maxWidth: 760 }}>
        選幾張 → 重畫。畫風走 <b>🖌 圖示風格</b> 那一頁的設定，⛔ 這裡不重覆一份。
        <br />
        想要<b>自動備份 + 一鍵退回 + 新舊並排對照</b>就用地端腳本：
        <code style={{ color: "#ffd479" }}>
          {" "}python3 tools/icon-gen/local/workshop.py redo --ids a,b,c
        </code>
      </p>

      {off && (
        <div style={{ background: "#3a2a12", border: "1px solid #6b4b1c", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          {gen.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select
          data-field="collection"
          value={collection}
          onChange={(e) => setCollection(e.target.value as IconCollection)}
        >
          {COLLECTIONS.filter((c) => isIconable(c.id)).map((c) => (
            <option key={c.id} value={c.id}>
              {c.zh}
            </option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="all">全部</option>
          <option value="missing">只看缺圖</option>
          <option value="has">只看已有圖</option>
        </select>
        <input
          placeholder="搜尋 id 或名稱"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <Btn small onClick={() => setPicked(new Set(shown.map((r) => r.id)))}>
          全選（{shown.length}）
        </Btn>
        <Btn small onClick={() => setPicked(new Set())}>
          清空
        </Btn>
        <Btn onClick={runBatch} disabled={off || picked.size === 0}>
          ▶ 重畫選取的 {picked.size} 張
        </Btn>
        <span style={{ color: "#8d97ad", fontSize: 12 }}>
          {loading ? "讀取中…" : `${shown.length} / ${rows.length} 份`}
          {gen.active.length > 0 ? ` · 產圖中 ${gen.active.length}` : ""}
        </span>
      </div>

      {gen.notes.length > 0 && (
        <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12 }}>
          {gen.notes.map((n) => (
            <li key={n.key} style={{ color: n.tone === "err" ? "#ff8080" : n.tone === "warn" ? "#ffd479" : "#7fd18a" }}>
              {n.text}
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {shown.map((r) => {
          const on = picked.has(r.id);
          // ⚠️ `stamp` 進 URL 是為了打掉瀏覽器快取 —— 檔名沒變，重畫完不加它畫面
          // 上會是舊圖，而那正是「做了但看不到」的形狀。
          const src = contentAssetUrl(r.icon);
          const busy = gen.active.some((j) => j.id.includes(r.id));
          return (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              title={`${r.name ?? r.id}\n${r.id}`}
              style={{
                width: CARD,
                padding: 6,
                borderRadius: 8,
                cursor: "pointer",
                background: on ? "#1d3350" : "#171a21",
                border: `1px solid ${on ? "#5aa9ff" : "#2a2f3a"}`,
                color: "#e6e8ee",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  margin: "0 auto 4px",
                  borderRadius: 6,
                  background: "#0b0d12",
                  display: "grid",
                  placeItems: "center",
                  opacity: busy ? 0.4 : 1,
                }}
              >
                {src ? (
                  <img src={`${src}?v=${stamp}`} alt="" width={64} height={64} style={{ borderRadius: 6 }} />
                ) : (
                  <span style={{ color: "#6b7488", fontSize: 11 }}>無圖</span>
                )}
              </div>
              <div style={{ fontSize: 10, lineHeight: 1.25, wordBreak: "break-all" }}>{r.name ?? r.id}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
