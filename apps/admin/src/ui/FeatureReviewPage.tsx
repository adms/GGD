/**
 * 🧑‍⚖️【一頁批次後台驗收】—— owner 2026-08-24 逐字定義：
 * > 「[一頁批次後台驗收] 代表**先上線成果**，但是在**後台可以一鍵否決還原**，
 * >  **追加原因的HITL**，但**預設是直接上線**」
 *
 * owner 2026-08-27：「**你還是沒告訴我去後台哪裡審查 [一頁批次後台驗收]**」
 * ⇒ ⭐ 在此之前誠實的答案是「**它不在後台**」：批核頁只活在 client dev server
 * （:39527/feature-review.html），而 owner 開的是 admin（:60721）。這一頁把它搬進來。
 *
 * ── 三條不可省的性質（owner 的定義，⛔ 不是我的設計）────────────────────────
 *  ①**先上線**：這一頁是**事後否決權**，⛔ 不是上線前審批門 —— 預設就是 live。
 *  ②否決＝翻**那一批登記的 rollback 開關**（每列都印出 configId＋欄位），⛔ 不是 revert commit。
 *  ③否決**必填原因**（進帳本 docs/_review/feature-verdicts.json）。
 *
 * ⭐ 資料全部走 `/__review/features`（tools/review/middleware.mjs 現算）——
 * 與 client 那一頁**同一份** middleware、同一份帳本，⛔ 不是第二個住處。
 * 逐幀連續圖片經 `/__review/frame?p=<rel>`（柵欄：只供應 docs/_reports 底下的 .png）。
 */
import { useCallback, useEffect, useState } from "react";
import { Panel, TextInput } from "./widgets";
import { ACCENT, DANGER, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { browserTokenStorage } from "../session";
import { AuthedImg } from "./live/AuthedImg";
// 🔍 owner 2026-08-27：「按單張圖片可跳出放大至全螢幕、按左右可上下一張圖片
// （保持全螢幕），再點一下取消全螢幕。不然現在看起來太小加上沒有連續性可言」
// ⚠️ 載入路徑與 AuthedImg 同構（fetch→blob，⛔ 裸 <img src> 每張 401）——
//    AuthedImg 住在另一條 lane 的柵欄裡，收工後抽成共用 hook。
import { FrameLightbox } from "./FrameLightbox";

/**
 * 🔐 GH#796 —— `/__review/**` 現在要後台 admin 身分（線上由 review sidecar 轉給
 * 平台自己的 admin-only 端點驗）。⭐ ⛔ 沒有新憑證：帶的就是這個 console 已經
 * 登入拿到的那一顆 token（`session.ts` 的 `browserTokenStorage`）。
 * ⚠️ 本機 dev server 不驗（`GGD_REVIEW_REQUIRE_ADMIN` 只在 live 模式預設開），
 *    所以拿不到 token 時**照樣送出去** —— 由伺服器那一端決定放不放行，
 *    ⛔ 不是在這裡自己判斷（判斷在兩個地方 = 兩份真相）。
 */
function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const t = browserTokenStorage.load();
  return {
    ...(extra ?? {}),
    ...(t ? { Authorization: `Bearer ${t.accessToken}` } : {}),
  };
}

interface Frame {
  readonly rel: string;
  readonly label?: string;
  readonly note?: string;
  readonly bright?: number;
  readonly lit?: number;
}
interface Rollback {
  readonly configId?: string;
  readonly field?: string;
  readonly liveValue?: unknown;
  readonly rollbackValue?: unknown;
  readonly note?: string;
}
interface Batch {
  readonly id: string;
  readonly title?: string;
  readonly family?: string;
  readonly issues?: readonly number[];
  readonly abilities?: readonly string[];
  readonly commit?: string;
  readonly frames?: readonly Frame[];
  readonly rollback?: Rollback;
  readonly verdict?: "keep" | "veto" | null;
  readonly reason?: string | null;
  readonly status?: string;
  readonly hash?: string;
  readonly notes?: string | null;
}
interface Feed {
  readonly counts?: Record<string, number>;
  readonly batches?: readonly Batch[];
  readonly error?: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: OK,
  confirmed: ACCENT,
  vetoed: DANGER,
  unregistered: WARN,
  invalid: DANGER,
};
const STATUS_ZH: Record<string, string> = {
  pending: "已上線 · 待你裁決",
  confirmed: "已確認保留",
  vetoed: "已否決",
  unregistered: "未登記（沒有 rollback 開關）",
  invalid: "登記無效",
};

function statusOf(b: Batch): string {
  if (b.status) return b.status;
  if (b.verdict === "veto") return "vetoed";
  if (b.verdict === "keep") return "confirmed";
  return "pending";
}

export function FeatureReviewPage(): React.JSX.Element {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  // 🔍 全螢幕燈箱：哪一批的第幾張。null = 關著。
  const [zoom, setZoom] = useState<{ batch: string; index: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await fetch("/__review/features", { headers: authHeaders({ accept: "application/json" }) });
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("json"))
        throw new Error(`回的不是 JSON（HTTP ${r.status}）—— 這一台沒掛 /__review（本機是 vite plugin，線上是 review sidecar）`);
      const j = (await r.json()) as Feed;
      if (j.error) throw new Error(j.error);
      setFeed(j);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** ⭐ 否決一定要原因（owner:「追加原因的HITL」）—— 沒填就不送。 */
  const decide = async (b: Batch, verdict: "keep" | "veto"): Promise<void> => {
    let reason = "";
    if (verdict === "veto") {
      reason = (globalThis.prompt?.("否決原因（必填 —— 它會進帳本）") ?? "").trim();
      if (reason === "") return;
    }
    setBusy(b.id);
    try {
      const r = await fetch("/__review/feature-verdict", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: b.id, hash: b.hash, verdict, reason }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      setErr(`裁決寫不進帳本：${String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const batches = (feed?.batches ?? []).filter((b) => {
    if (q.trim() === "") return true;
    const hay = `${b.id} ${b.title ?? ""} ${b.family ?? ""} ${(b.issues ?? []).join(" ")} ${(b.abilities ?? []).join(" ")}`;
    return hay.toLowerCase().includes(q.trim().toLowerCase());
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Panel title="🧑‍⚖️ 一頁批次後台驗收（#669）">
        <div style={{ color: TEXT_DIM, fontSize: 12.5, lineHeight: 1.7 }}>
          owner 2026-08-24 逐字：「<b style={{ color: TEXT_MAIN }}>先上線成果</b>，但是在後台可以
          <b style={{ color: TEXT_MAIN }}>一鍵否決還原</b>，<b style={{ color: TEXT_MAIN }}>追加原因的 HITL</b>，
          但<b style={{ color: TEXT_MAIN }}>預設是直接上線</b>」。
          <br />
          ⇒ 這一頁是<b style={{ color: GOLD }}>事後否決權</b>，⛔ 不是上線前審批門。
          否決＝翻那一批登記的<b style={{ color: GOLD }}>後台開關</b>（每列都印出 config id ＋ 欄位），
          ⛔ 不是 revert commit。
        </div>
        {feed?.counts ? (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 13 }}>
            {Object.entries(feed.counts).map(([k, v]) => (
              <span key={k} style={{ color: STATUS_COLOR[k] ?? TEXT_MAIN }}>
                {STATUS_ZH[k] ?? k}：<b>{v}</b>
              </span>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <TextInput value={q} onChange={setQ} placeholder="過濾：批次 id / 標題 / 家族 / 票號 / 技能…" />
          <button
            onClick={() => void load()}
            style={{ background: "transparent", color: ACCENT, border: PANEL_BORDER, borderRadius: 6, padding: "5px 10px", cursor: "pointer" }}
          >
            重新讀取
          </button>
        </div>
      </Panel>

      {err !== null ? (
        <Panel title="⚠️ 讀不到批次">
          <div style={{ color: DANGER, fontSize: 13, lineHeight: 1.7 }}>
            {err}
            <br />
            <span style={{ color: TEXT_DIM }}>
              這一頁的資料來自 <code>/__review/features</code>（<code>tools/review/middleware.mjs</code>
              ，本機與線上跑的是<b>同一份</b>）。
              <br />
              · <b>本機</b>：<code>pnpm --filter @ggd/admin dev</code> 的 vite plugin 掛的。
              <br />
              · <b>線上</b>：review sidecar（<code>docker/review.Dockerfile</code>），edge 的{" "}
              <code>location /__review/</code> 轉進去。讀不到通常是那個容器沒起來 ——{" "}
              <code>curl -s https://ggd.adms.ai/__review/features | head</code> 可以直接問它。
              <br />· 線上<b>只寫得動裁決</b>（材料是 :ro 掛載）；線上按的裁決回流本機用{" "}
              <code>bash scripts/review-sync.sh</code>。
            </span>
          </div>
        </Panel>
      ) : null}

      {batches.map((b) => {
        const st = statusOf(b);
        const frames = b.frames ?? [];
        const isOpen = open === b.id;
        return (
          <Panel key={b.id} title="">
            <div style={{ borderLeft: `4px solid ${STATUS_COLOR[st] ?? TEXT_DIM}`, paddingLeft: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, padding: "1px 8px", borderRadius: 5, background: "#1d2334", color: STATUS_COLOR[st] ?? TEXT_MAIN }}>
                  {STATUS_ZH[st] ?? st}
                </span>
                <b style={{ color: TEXT_MAIN }}>{b.title ?? b.id}</b>
                {b.family ? <span style={{ color: GOLD, fontSize: 12 }}>{b.family}</span> : null}
                {(b.issues ?? []).map((n) => (
                  <a key={n} href={`https://github.com/adms/GGD/issues/${n}`} target="_blank" rel="noreferrer" style={{ color: ACCENT, fontSize: 12 }}>
                    #{n}
                  </a>
                ))}
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button
                    disabled={busy === b.id}
                    onClick={() => void decide(b, "keep")}
                    style={{ background: "transparent", color: OK, border: `1px solid ${OK}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}
                  >
                    ✅ 保留
                  </button>
                  <button
                    disabled={busy === b.id}
                    onClick={() => void decide(b, "veto")}
                    style={{ background: "transparent", color: DANGER, border: `1px solid ${DANGER}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}
                  >
                    ⛔ 否決（填原因）
                  </button>
                </span>
              </div>

              <div style={{ color: TEXT_DIM, fontSize: 12, marginTop: 4 }}>
                <code>{b.id}</code>
                {b.commit ? <> · commit <code>{b.commit}</code></> : null}
                {frames.length > 0 ? <> · <b style={{ color: TEXT_MAIN }}>{frames.length}</b> 張連續圖片</> : <> · ⚠️ 沒有圖</>}
                {(b.abilities ?? []).length > 0 ? <> · 技能 {(b.abilities ?? []).join(" · ")}</> : null}
              </div>

              {b.rollback ? (
                <div style={{ marginTop: 6, fontSize: 12.5, padding: "5px 10px", borderRadius: 6, background: "#161c2a", color: TEXT_DIM }}>
                  🔙 <b style={{ color: TEXT_MAIN }}>一鍵還原</b>：後台 <code>{b.rollback.configId}</code> 的{" "}
                  <code>{b.rollback.field}</code> ＝ <code>{JSON.stringify(b.rollback.liveValue)}</code> ⇒{" "}
                  <code>{JSON.stringify(b.rollback.rollbackValue)}</code>
                  {b.rollback.note ? <div style={{ marginTop: 3 }}>{b.rollback.note}</div> : null}
                </div>
              ) : (
                <div style={{ marginTop: 6, fontSize: 12.5, color: WARN }}>
                  ⚠️ 這一批**沒有登記 rollback 開關** —— 依 #669 的閘它不該被登記。
                </div>
              )}

              {b.reason ? (
                <div style={{ marginTop: 6, fontSize: 12.5, color: DANGER }}>否決原因：{b.reason}</div>
              ) : null}

              {frames.length > 0 ? (
                <button
                  onClick={() => setOpen(isOpen ? null : b.id)}
                  style={{ marginTop: 8, background: "transparent", color: ACCENT, border: PANEL_BORDER, borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}
                >
                  {isOpen ? "收起連續圖片" : `▶ 看連續圖片（${frames.length} 張）`}
                </button>
              ) : null}

              {isOpen ? (
                <div style={{ marginTop: 10, display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
                  {frames.map((f) => (
                    <figure key={f.rel} style={{ margin: 0, minWidth: 260 }}>
                      {/* 🖼️ GH#669 —— ⛔ 不可以用裸的 `<img src>`：那是瀏覽器的圖片載入，
                          `liveAuth.ts` 的 fetch 攔截器碰不到它 ⇒ 每一張都吃 401 而空白。 */}
                      {/* ① 點縮圖 ⇒ 全螢幕（owner 2026-08-27）。⛔ 不是連結 —— 燈箱留在頁內，關掉回到原捲動位置。 */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`放大 ${f.label ?? f.rel}`}
                        onClick={() => setZoom({ batch: b.id, index: frames.indexOf(f) })}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setZoom({ batch: b.id, index: frames.indexOf(f) }); } }}
                        style={{ cursor: "zoom-in" }}
                      >
                        <AuthedImg
                          rel={f.rel}
                          alt={f.label ?? f.rel}
                          width={260}
                          style={{ border: PANEL_BORDER, background: "#000" }}
                        />
                      </div>
                      <figcaption style={{ color: TEXT_DIM, fontSize: 11.5, marginTop: 4 }}>
                        <b style={{ color: TEXT_MAIN }}>{f.label ?? ""}</b>
                        {typeof f.bright === "number" ? <> · 亮 {f.bright.toLocaleString()}</> : null}
                        {f.note ? <div>{f.note}</div> : null}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>
        );
      })}
      {zoom !== null
        ? (() => {
            const zb = batches.find((x) => x.id === zoom.batch);
            const zf = zb?.frames ?? [];
            if (zf.length === 0) return null;
            return (
              <FrameLightbox
                frames={zf}
                index={Math.min(zoom.index, zf.length - 1)}
                onStep={(i) => setZoom({ batch: zoom.batch, index: i })}
                onClose={() => setZoom(null)}
              />
            );
          })()
        : null}
    </div>
  );
}
