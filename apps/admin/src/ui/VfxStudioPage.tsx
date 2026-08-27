/**
 * 特效工坊 · 演出腳本 — GH#838 的編輯器本體掛進後台（owner 2026-08-28 裁決：
 * 「特效工坊 · 演出腳本 應該也是後台其中一頁對吧 也是一樣的機制，
 *  編輯儲存完後可以回存到主線甚至間接到github」）。
 *
 * ── 為什麼是 IFRAME 而不是搬進來（照 AudioAuditionPage 的同一條理由）─────────
 * vfx-script-studio.html 是 client vite 上的自足頁：它要 Babylon 場景、真
 * SimWorld、出貨 VfxSystem、以及 client origin 的 `/content/**` 與
 * `/__vfxstudio/*`（dev middleware，存檔＋回存主線都在那一側）。搬進 admin ＝
 * fork 整條預覽鏈；後台**嵌**它，寫入面 0 增加（寫走 client 端 middleware，
 * ⛔ 不經過 admin 的 loopback 寫伺服器 —— 兩個寫入面不混）。
 *
 * DEV-ONLY BY CONSTRUCTION：由 ContentPage 的 dev chunk 掛載（App 的
 * `import.meta.env.DEV` 動態 import），production build 連 label 字串都不含。
 */
import { useMemo } from "react";
import { resolveHubLinks, type HubEnv } from "../config";
import { PANEL_BORDER, TEXT_DIM } from "./theme";

function readEnv(): { env: HubEnv; mode: "dev" | "prod" } {
  const raw = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
  return { env: raw, mode: raw.PROD ? "prod" : "dev" };
}

/** client origin（`key:"client"`，VITE_CLIENT_URL 可覆寫）＋ studio 路徑。 */
export function vfxStudioUrl(env: HubEnv, mode: "dev" | "prod"): string {
  const client = resolveHubLinks(env, mode).find((l) => l.key === "client")?.url ?? "";
  if (!client) return "";
  const base = client.endsWith("/") ? client : `${client}/`;
  return `${base}vfx-script-studio.html`;
}

export function VfxStudioPage(): React.JSX.Element {
  const { env, mode } = readEnv();
  const url = useMemo(() => vfxStudioUrl(env, mode), [env, mode]);
  if (!url) {
    return (
      <div style={{ color: TEXT_DIM, padding: 16 }}>
        找不到遊戲客戶端的網址（hub link key <code>client</code> 不存在）—— 請設定
        VITE_CLIENT_URL。studio 住在 client dev server 上，後台只是嵌它。
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ color: TEXT_DIM, fontSize: 12, padding: "4px 2px 8px" }}>
        嵌自 <code>{url}</code>（client dev server —— 沒開的話下面是白的）。
        存檔寫工作樹；「⬆️ 回存主線」＝content:build＋commit＋push（頁內按鈕）。
      </div>
      <iframe
        title="特效工坊 · 演出腳本"
        src={url}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          border: `1px solid ${PANEL_BORDER}`,
          borderRadius: 8,
          background: "#05060a",
        }}
      />
    </div>
  );
}
