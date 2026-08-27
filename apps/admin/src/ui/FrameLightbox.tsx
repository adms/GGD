/**
 * 🔍 **連續圖片的全螢幕燈箱** —— owner 2026-08-27（逐字）：
 *
 * > 「後台審查連續圖片時，按單張圖片可跳出放大至全螢幕、按左右可上下一張圖片
 * >  （保持全螢幕），再點一下取消全螢幕。不然現在看起來太小加上沒有連續性可言」
 *
 * ⇒ 三個動作逐字對應：
 *   ① 點縮圖 ⇒ 全螢幕（FeatureReviewPage 把 onClick 接到 openLightbox）
 *   ② ←／→（鍵盤）與畫面左右兩塊點擊區 ⇒ 上一張／下一張，**保持全螢幕**
 *   ③ 點圖片本身 ⇒ 關閉（Escape 也關 —— 標準習慣，不與 owner 的操作衝突）
 *
 * ## ⚠️ 圖片的身分（GH#669／#796 的同一條路）
 * ⛔ 不可以用裸的 `<img src="/__review/frame?...">` —— 那是瀏覽器的圖片載入，
 * `liveAuth.ts` 的 fetch 攔截器碰不到它 ⇒ 每一張 401 而空白。
 * ⇒ 與 `live/AuthedImg` **同一條** fetch→blob→objectURL 路。
 * ⚠️ 載入邏輯在這裡有第二份（`AuthedImg` 住在另一條 lane 的柵欄裡，收工後該抽共用 hook
 * —— 見 FeatureReviewPage 檔頭的註記），⭐ 但**多了預載**：翻到第 k 張時預抓 k±1，
 * 「連續性」正是 owner 點名缺的東西 —— 翻頁要瞬間，⛔ 不是每張再等一次網路。
 *
 * ## 記憶體
 * objectURL 進一個 per-mount 的 Map 快取（一批最多百餘張、每張數十 KB 的 PNG）；
 * 燈箱 unmount 時**整批 revoke** —— ⛔ 不 revoke 就是每看一批漏一份記憶體。
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface LightboxFrame {
  readonly rel: string;
  readonly label?: string;
  readonly bright?: number;
  readonly note?: string;
}

/**
 * 下一張的 index。⭐ **夾住不迴圈**：第 1 張再按 ← 停在第 1 張 ——
 * 迴圈會讓「我看完了沒」失去訊號（最後一張按 → 突然回到第 1 張，
 * 在逐幀比對時就是「咦這一幀怎麼倒退了」）。
 */
export function stepFrame(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const next = index + delta;
  return next < 0 ? 0 : next >= count ? count - 1 : next;
}

function useFrameUrl(rel: string | null, cache: Map<string, string>): { url: string | null; err: string | null } {
  const [, bump] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    if (rel === null || cache.has(rel)) return;
    let dead = false;
    fetch(`/__review/frame?p=${encodeURIComponent(rel)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 ? "（未登入或 token 過期）" : ""}`);
        const blob = await r.blob();
        if (dead) return;
        cache.set(rel, URL.createObjectURL(blob));
        bump((n) => n + 1);
      })
      .catch((e: unknown) => {
        if (!dead) setErr(String(e instanceof Error ? e.message : e));
      });
    return () => {
      dead = true;
    };
  }, [rel, cache]);
  return { url: rel !== null ? (cache.get(rel) ?? null) : null, err };
}

export function FrameLightbox(props: {
  readonly frames: readonly LightboxFrame[];
  readonly index: number;
  readonly onStep: (nextIndex: number) => void;
  readonly onClose: () => void;
}): JSX.Element | null {
  const { frames, index, onStep, onClose } = props;
  const cacheRef = useRef<Map<string, string>>(new Map());
  const f = frames[index] ?? null;
  const { url, err } = useFrameUrl(f?.rel ?? null, cacheRef.current);
  // ⭐ 預載相鄰張 —— 「連續性」的那一半：翻頁要瞬間。
  useFrameUrl(frames[index + 1]?.rel ?? null, cacheRef.current);
  useFrameUrl(frames[index - 1]?.rel ?? null, cacheRef.current);

  const step = useCallback(
    (d: number) => onStep(stepFrame(index, d, frames.length)),
    [index, frames.length, onStep],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Escape") onClose();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  // unmount 時整批 revoke（⛔ 不放依賴 —— 只在真正關閉時跑一次）。
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      for (const u of cache.values()) URL.revokeObjectURL(u);
      cache.clear();
    };
  }, []);

  if (f === null) return null;
  const navBtn: React.CSSProperties = {
    position: "absolute", top: 0, bottom: 0, width: "22%", border: "none",
    background: "transparent", color: "#fff", cursor: "pointer", fontSize: 42,
    opacity: 0.55, zIndex: 2,
  };
  return (
    <div
      role="dialog"
      aria-label={`連續圖片 ${index + 1}/${frames.length}`}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, background: "rgba(4,6,10,.94)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* ② 左右兩塊大點擊區 —— 手機／滑鼠不必瞄準小箭頭 */}
      <button aria-label="上一張" onClick={() => step(-1)} disabled={index === 0}
        style={{ ...navBtn, left: 0, textAlign: "left", paddingLeft: 18, visibility: index === 0 ? "hidden" : "visible" }}>‹</button>
      <button aria-label="下一張" onClick={() => step(1)} disabled={index === frames.length - 1}
        style={{ ...navBtn, right: 0, textAlign: "right", paddingRight: 18, visibility: index === frames.length - 1 ? "hidden" : "visible" }}>›</button>

      {/* ③ 點圖片本身 ⇒ 關閉（owner：「再點一下取消全螢幕」） */}
      <figure style={{ margin: 0, textAlign: "center", maxWidth: "96vw" }}>
        {err !== null ? (
          <div style={{ color: "#ff9a9a", fontSize: 14, padding: 24 }}>⛔ 這張圖載不到 —— {err}<div style={{ opacity: 0.7, marginTop: 6, wordBreak: "break-all" }}>{f.rel}</div></div>
        ) : url === null ? (
          <div style={{ color: "#9aa4b2", fontSize: 14, padding: 24 }}>載入中…</div>
        ) : (
          <img
            src={url}
            alt={f.label ?? f.rel}
            onClick={onClose}
            style={{ maxWidth: "96vw", maxHeight: "86vh", objectFit: "contain", cursor: "zoom-out", display: "block", margin: "0 auto" }}
          />
        )}
        <figcaption style={{ color: "#cfd6e0", fontSize: 13, marginTop: 10 }}>
          <b>{index + 1}/{frames.length}</b>
          {f.label ? <> · {f.label}</> : null}
          {typeof f.bright === "number" ? <> · 亮 {f.bright.toLocaleString()}</> : null}
          {f.note ? <div style={{ color: "#9aa4b2", marginTop: 4, maxWidth: "80ch", marginInline: "auto" }}>{f.note}</div> : null}
          <div style={{ color: "#6d7684", fontSize: 11.5, marginTop: 6 }}>←→ 換張 · 點圖片關閉</div>
        </figcaption>
      </figure>
    </div>
  );
}
