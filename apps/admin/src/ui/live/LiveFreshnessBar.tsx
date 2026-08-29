/**
 * 🕒 每一個 /__live 頁面最上面那一條：**這份資料是幾點算的，還是從快取拿的**。
 *
 * owner 2026-08-29（逐字）：
 * > 「後台這些頁面都有 redis cache **我怎麼知道是即時算的還是 cache?**
 * >  請**每一頁都加一個重新計算載入按鈕**在最上面」
 *
 * ⭐ 為什麼一個元件就夠 14 頁：`renderLivePage()` 是**唯一**的渲染入口
 * （`live/index.tsx`），所以這一條包在它外面 ⇒ ⛔ 不用改 14 個檔，
 * 而且**下一個新增的 live 頁自動就有**（⛔ 不是「要記得也加上去」）。
 *
 * ⚠️ 它**自己也去打一次** `/__live/<dataset>`，⛔ 不是從頁面元件拿狀態 ——
 * 因為那 14 頁各自 fetch，彼此沒有共用的 hook。代價是多一次請求，
 * ⭐ 而那一次幾乎必然是 cache hit（毫秒級），所以可以接受。
 *
 * 「重新計算」＝ `?fresh=1` ⇒ middleware 繞過記憶體與 store 兩層快取、
 * 重跑 `build()`、**並把新結果寫回快取**（⛔ 否則按完按鈕，下一個人看到的還是舊的）。
 * 之後 `window.location.reload()` 讓頁面元件自己重抓那份新的。
 */
import React from "react";

type Live = {
  computedAt?: string;
  ms?: number;
  cacheKey?: string;
  fresh?: string;
  store?: string;
  sourceFiles?: number;
  /** ⭐ rollback 開關：伺服器端 `GGD_LIVE_FRESHNESS_BAR=0` ⇒ 這條列整個不畫。 */
  bar?: boolean;
};

/** `2026-08-29T07:48:04.000Z` → `07:48:04`；⛔ 認不得就原樣回傳。 */
function hhmmss(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

/** 幾秒前算的（⭐ 這比絕對時間更能回答 owner 的問題）。 */
function ago(iso: string | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.round(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小時前`;
  return `${Math.round(s / 86400)} 天前`;
}

export function LiveFreshnessBar(props: { dataset: string }): React.JSX.Element | null {
  const [live, setLive] = React.useState<Live | null>(null);
  const [cacheHdr, setCacheHdr] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string>("");

  const load = React.useCallback(
    (fresh: boolean) => {
      setBusy(true);
      setErr("");
      fetch(`/__live/${props.dataset}${fresh ? "?fresh=1" : ""}`)
        .then(async (r) => {
          setCacheHdr(r.headers.get("X-Live-Cache") ?? "");
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = (await r.json()) as { _live?: Live };
          setLive(j._live ?? {});
          // ⭐ 強制重算之後讓整頁重抓 —— 頁面元件各自 fetch,⛔ 我改不了它們的 state
          if (fresh) window.location.reload();
        })
        .catch((e: unknown) => setErr(String((e as Error)?.message ?? e)))
        .finally(() => setBusy(false));
    },
    [props.dataset],
  );

  React.useEffect(() => load(false), [load]);

  // `hit key=1a2b3c4d store=redis` → hit / redis
  const hit = cacheHdr.startsWith("hit");
  const off = cacheHdr.startsWith("off");
  const store = /store=([a-z-]+)/.exec(cacheHdr)?.[1] ?? live?.store ?? "";

  const badge = off
    ? { text: "⚡ 即時計算（快取關閉）", bg: "#1c2b22", fg: "#7fd1a8" }
    : hit
      ? { text: "💾 來自快取", bg: "#2a2617", fg: "#e0c96a" }
      : { text: "⚡ 剛剛重新計算", bg: "#1c2b22", fg: "#7fd1a8" };

  // ⭐ **rollback**（owner 常設：留一格可以簡易回頭）——
  //   伺服器端 `GGD_LIVE_FRESHNESS_BAR=0` ⇒ 整條列消失，⛔ 不必重建映像。
  // ⚠️ 只在**明確回 false** 時隱藏：`undefined`（還沒載到 / 舊版後端）要照畫，
  //   ⛔ 否則一次網路失敗就會讓這條列靜默消失（fail-open 的方向要對）。
  if (live?.bar === false) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "8px 12px",
        marginBottom: 12,
        borderRadius: 8,
        border: "1px solid #22304a",
        background: "#101725",
        fontSize: 13,
      }}
    >
      <span
        style={{
          padding: "2px 9px",
          borderRadius: 99,
          background: badge.bg,
          color: badge.fg,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {badge.text}
      </span>

      <span style={{ color: "#8fa3bf", fontVariantNumeric: "tabular-nums" }}>
        算於 <b style={{ color: "#dbe6ee" }}>{hhmmss(live?.computedAt)}</b>
        {live?.computedAt ? `（${ago(live.computedAt)}）` : ""}
        {typeof live?.ms === "number" ? ` · 耗時 ${live.ms} ms` : ""}
        {store ? ` · ${store}` : ""}
        {live?.cacheKey ? ` · key ${live.cacheKey}` : ""}
      </span>

      <button
        type="button"
        disabled={busy}
        onClick={() => load(true)}
        title="繞過快取，強制重新計算這一頁的資料"
        style={{
          marginLeft: "auto",
          padding: "5px 13px",
          borderRadius: 6,
          border: "1px solid #2f4a6b",
          background: busy ? "#1a2233" : "#16233a",
          color: busy ? "#63788a" : "#cfe0f5",
          fontWeight: 600,
          cursor: busy ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {busy ? "重新計算中…" : "🔄 重新計算"}
      </button>

      {err ? <span style={{ color: "#e0847a", width: "100%" }}>⛔ {err}</span> : null}
    </div>
  );
}
