/**
 * 音樂音效素材管理 — the owner's spec step 1: pull the two standalone audition
 * pages INTO the console next to 角色語音生成 (VoiceGenPage), as one BGM + SFX +
 * character-voice survey surface. This is the "survey everything" half; the
 * act-on-it half (write/approve through the /voice-api loopback daemon) stays
 * VoiceGenPage, unchanged, one nav row down under the same section header.
 *
 * ── WHY THESE ARE IFRAMES, NOT A PORT ───────────────────────────────────────
 * bgm-audition.html and voice-audition.html are self-contained static pages
 * (their own localStorage verdicts, A/B engine, single-player) already shipped
 * in apps/client/public/. Re-implementing them here would fork that logic; the
 * console EMBEDS them instead.
 *
 * ── THE MIME RULE (do not "fix" by mounting /content here) ───────────────────
 * Those two pages fetch audio by ABSOLUTE `/content/**.mp3` paths that resolve
 * to the IFRAME's OWN origin. The admin vite server serves .mp3 as
 * octet-stream (vite.config.ts CONTENT_MIME) — unplayable — while the CLIENT
 * vite (:39527) serves it correctly. So these two MUST iframe from the client
 * origin, and we must NOT add a /content audio mount or a :39527 proxy to the
 * admin server: that would put audio bytes on the loopback-WRITE origin and
 * tempt widening what the write server serves (standing security rule). The
 * frames are read-only cross-origin — they add ZERO write surface here.
 *
 * voice-progress.html already lives under /admin/, so it iframes same-origin.
 *
 * DEV-ONLY BY CONSTRUCTION: mounted only from ContentPage's dev chunk, reached
 * through App's `import.meta.env.DEV`-gated dynamic import, so a production
 * build never emits it.
 */
import { useMemo, useState } from "react";
import { resolveHubLinks, type HubEnv } from "../config";
import { Btn, Panel } from "./widgets";
import { ACCENT, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

/** The nav entry — lives in this dev chunk so a prod build lacks even the label. */
export const AUDIO_NAV = { page: "audio", label: "音樂音效素材管理", emoji: "🎵" } as const;

type TabKey = "bgm" | "voice" | "progress";

interface AudioTab {
  readonly key: TabKey;
  readonly label: string;
  readonly url: string;
  /** true when the frame's audio needs the client origin (:39527) up */
  readonly needsClient: boolean;
  readonly note: string;
}

function readEnv(): { env: HubEnv; mode: "dev" | "prod" } {
  const raw = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
  return { env: raw, mode: raw.PROD ? "prod" : "dev" };
}

export function AudioAuditionPage(): React.JSX.Element {
  const tabs = useMemo<readonly AudioTab[]>(() => {
    const { env, mode } = readEnv();
    const links = resolveHubLinks(env, mode);
    const byKey = (k: string): string => links.find((l) => l.key === k)?.url ?? "";
    return [
      {
        key: "bgm",
        label: "音樂/音效試聽",
        url: byKey("bgmAudition"),
        needsClient: true,
        note:
          "12 首場景曲 ＋ 13 首場地戰鬥曲（#531，一張地圖一首）＋ 12 首 Samantha 變體 " +
          "＋ 114 句英雄名言 ＋ 全部 SFX，共 381 個播放器。" +
          "場地曲每張卡片會畫出五段弧線（導入→熱血→收束低潮→轉折→高潮→LOOP）、" +
          "列出該場地的實錄場景音效，以及 CosyVoice 名言與它的作品出處與「原文把握」。",
      },
      {
        key: "voice",
        label: "語音試聽",
        url: byKey("voiceAudition"),
        needsClient: true,
        note: "角色台詞試聽（每位英雄 × 46 句）。",
      },
      {
        key: "progress",
        label: "語音看板",
        url: byKey("voiceProgress"),
        needsClient: false,
        note: "語音生成即時進度看板（與本後台同源）。",
      },
    ];
  }, []);

  const [active, setActive] = useState<TabKey>("bgm");
  const tab = tabs.find((t) => t.key === active) ?? tabs[0]!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, color: TEXT_MAIN }}>音樂音效素材管理</h2>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6, lineHeight: 1.7 }}>
          BGM／SFX／角色語音的試聽與看板都收在這裡（#531 起也含 13 首場地戰鬥曲）。試聽頁以 iframe 嵌入遊戲客戶端
          （:39527）— 那是唯一以可播放 MIME 提供 mp3 的來源；本後台不掛載 /content
          音訊、也不代理 :39527，避免把音訊位元組放到可寫入的 loopback 來源上。
          音訊在操作者本機播放是預期行為（非 #62 背景靜音規則）。要寫入／驗收語音，
          請用下方「角色語音生成」頁。
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Btn key={t.key} kind={t.key === active ? "primary" : "ghost"} onClick={() => setActive(t.key)}>
            {t.label}
          </Btn>
        ))}
      </div>

      <Panel title={tab.label} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.6 }}>
          {tab.note}
          {tab.url !== "" && (
            <>
              {"　"}
              <a href={tab.url} target="_blank" rel="noreferrer" style={{ color: ACCENT }}>
                在新分頁開啟 ↗
              </a>
            </>
          )}
          {tab.needsClient && (
            <div style={{ color: TEXT_DIM, marginTop: 4 }}>
              需要遊戲客戶端 :39527 在執行 — 若下方為空白，請先啟動 client（pnpm dev:all）。
            </div>
          )}
        </div>
        {tab.url === "" ? (
          <div style={{ color: TEXT_DIM, fontSize: 13, padding: 8 }}>
            找不到這個試聽頁的網址（檢查 VITE_CLIENT_URL / VITE_ADMIN_URL 設定）。
          </div>
        ) : (
          <iframe
            key={tab.key}
            title={tab.label}
            src={tab.url}
            style={{
              flex: 1,
              minHeight: 480,
              width: "100%",
              border: PANEL_BORDER,
              borderRadius: 8,
              background: "#0c1018",
            }}
          />
        )}
      </Panel>
    </div>
  );
}
