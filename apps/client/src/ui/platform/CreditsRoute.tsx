/**
 * CreditsRoute — the 版權聲明 page, reached by a link rather than printed over
 * the login artwork (「版權宣告頁應該是一個連結，跳過去詳細列出說明」).
 *
 * Same mechanism as the codex (see codex/CodexRoute.tsx): a `#credits` hash
 * overlay mounted once at the top of AppRoot. That keeps it reachable from the
 * login screen, the lobby and mid-match alike, deep-linkable for a screenshot,
 * and entirely outside the screen state machine that other tasks are editing.
 *
 * Content comes from creditsData.ts, which marks which entries a LICENCE
 * requires. Mandatory ones are rendered distinctly — someone tidying this page
 * later should be able to see at a glance which rows are not theirs to delete.
 */
import { useEffect, useState } from "react";
import { CREDITS, COPYRIGHT_LINE } from "./creditsData";
import { SFX_LAB_BOUND_COUNT, SFX_LAB_CLIPS, SFX_LAB_GROUPS } from "./sfxLabCredits";
import {
  BLIZZARD_VFX_BOUND_COUNT,
  BLIZZARD_VFX_CLIPS,
  BLIZZARD_VFX_TERMS,
  BLIZZARD_VFX_TOTAL_MB,
} from "./blizzardVfxCredits";
import { GOLD, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "../theme";
import { SfxButton } from "../SfxButton";

export const CREDITS_HASH = "#credits";

function hashIsCredits(): boolean {
  return typeof window !== "undefined" && window.location.hash === CREDITS_HASH;
}

export function openCredits(): void {
  if (typeof window === "undefined") return;
  window.location.hash = CREDITS_HASH.slice(1);
}

export function closeCredits(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new Event("hashchange"));
}

const LINK: React.CSSProperties = { color: "#a9bcff", textDecoration: "none", fontWeight: 600 };

/**
 * SfxLabList — every 効果音ラボ clip that ships in GGD, listed per the owner's
 * condition on the download authorisation: 「只要好好列出附記在授權頁面就好」.
 *
 * The licence does NOT require this (商用可・報告不要・クレジット任意), so the
 * section stays inside the courtesy area and carries no 署名為授權條件 marker —
 * the CC-BY dragon above is still the only mandatory credit on this page.
 *
 * Layout rules that are load-bearing, not taste:
 *  - The list scrolls INSIDE its own box (maxHeight + overflowY). 54 rows would
 *    otherwise bury the four licence entries the page exists to show.
 *  - Every row is a wrapping block, never a table. A table of file + title +
 *    source + usage is what makes a credits page scroll sideways on a phone;
 *    `overflowWrap: anywhere` on the long URLs finishes the job.
 *  - NO play buttons, ever. The pack forbids 再配布 and the one build that would
 *    trip it is an audition screen. This is a list; keep it a list.
 */
function SfxLabList(): React.JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <section
      style={{
        marginBottom: 14,
        padding: "12px 14px",
        borderRadius: 9,
        background: PANEL_BG,
        border: PANEL_BORDER,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: TEXT_DIM }}>音效素材明細</span>
        <SfxButton
          kind="ghost"
          onClick={() => setOpen((v) => !v)}
          style={{
            marginLeft: "auto",
            padding: "2px 10px",
            borderRadius: 6,
            border: PANEL_BORDER,
            background: "transparent",
            color: TEXT_DIM,
            fontSize: 12,
          }}
        >
          {open ? "收合" : "展開"}
        </SfxButton>
      </div>
      <div style={{ fontSize: 15, fontWeight: "bold", marginTop: 3 }}>
        効果音ラボ 全素材清單（共 {SFX_LAB_CLIPS.length} 個，其中 {SFX_LAB_BOUND_COUNT} 個已在遊戲中使用）
      </div>
      <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6, lineHeight: 1.7 }}>
        依 効果音ラボ 使用條款，標示來源為<strong>任意</strong>（商用可・報告不要・クレジット表記不要），
        並非授權條件；此處逐筆列出是本專案作者的選擇。標「使用中」者為遊戲實際會播放的音效，
        標「收錄未啟用」者檔案雖隨遊戲附帶但目前沒有任何情境會播放。
        來源不完整者（例如「風に揺れる草木1」只留有頁面層級來源）如實註明，不臆造連結。
      </div>
      {open && (
        <div
          style={{
            marginTop: 10,
            maxHeight: "46vh",
            overflowY: "auto",
            overflowX: "hidden",
            borderTop: PANEL_BORDER,
            paddingTop: 8,
            // iOS: keep the inner list's momentum scroll from dragging the modal.
            overscrollBehavior: "contain",
          }}
        >
          {SFX_LAB_GROUPS.map((g) => {
            const clips = SFX_LAB_CLIPS.filter((c) => c.group === g.id);
            if (clips.length === 0) return null;
            return (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "#0d1020",
                    zIndex: 1,
                    fontSize: 12,
                    color: GOLD,
                    fontWeight: "bold",
                    padding: "4px 0",
                  }}
                >
                  {g.label}（{clips.length}）
                </div>
                {clips.map((c) => (
                  <div
                    key={c.file}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      fontSize: 12,
                      lineHeight: 1.6,
                      overflowWrap: "anywhere",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>{c.title}</span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 999,
                          color: c.boundKeys.length > 0 ? "#8ee6b0" : TEXT_DIM,
                          border: `1px solid ${c.boundKeys.length > 0 ? "rgba(142,230,176,0.45)" : "rgba(255,255,255,0.18)"}`,
                        }}
                      >
                        {c.boundKeys.length > 0 ? "使用中" : "收錄未啟用"}
                      </span>
                    </div>
                    <div style={{ color: "#c3cbdd" }}>{c.use}</div>
                    <div style={{ color: TEXT_DIM }}>
                      {c.file}
                      {c.sourceFile ? ` ← ${c.sourceFile}` : " ← 原始檔名未留存"}
                      {" · "}
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" style={LINK}>
                          素材連結
                        </a>
                      ) : c.page ? (
                        <a href={c.page} target="_blank" rel="noopener noreferrer" style={LINK}>
                          {/* only the clip whose source FILE was never recorded is
                              flagged page-level; the voice rows know their file. */}
                          {c.sourceFile ? "來源頁" : "來源頁（僅頁面層級來源）"}
                        </a>
                      ) : (
                        "來源不明"
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The GH#402 Blizzard listing. Same shape as {@link SfxLabList} on purpose —
 * but note the two are there for OPPOSITE reasons: 効果音ラボ's rows are a
 * courtesy under a licence that waives attribution, while these rows ARE the
 * condition the owner attached to shipping the bytes. So this section is not
 * collapsible-by-default-and-forgettable: it opens closed like the other, but
 * its summary line always states the rights holder.
 */
function BlizzardVfxList(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <section
      style={{
        marginBottom: 14,
        padding: "12px 14px",
        borderRadius: 9,
        background: PANEL_BG,
        border: PANEL_BORDER,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: TEXT_DIM }}>原作音效逐檔出處</span>
        <SfxButton
          kind="ghost"
          onClick={() => setOpen((v) => !v)}
          style={{
            marginLeft: "auto",
            padding: "2px 10px",
            borderRadius: 6,
            border: PANEL_BORDER,
            background: "transparent",
            color: TEXT_DIM,
            fontSize: 12,
          }}
        >
          {open ? "收合" : "展開"}
        </SfxButton>
      </div>
      <div style={{ fontSize: 15, fontWeight: "bold", marginTop: 3 }}>
        Warcraft III 原作音效（共 {BLIZZARD_VFX_CLIPS.length} 個，
        {BLIZZARD_VFX_BOUND_COUNT} 個已在遊戲中使用，合計 {BLIZZARD_VFX_TOTAL_MB.toFixed(2)} MB）
      </div>
      <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6, lineHeight: 1.7 }}>
        {BLIZZARD_VFX_TERMS}
      </div>
      {open && (
        <div
          style={{
            marginTop: 10,
            maxHeight: "46vh",
            overflowY: "auto",
            overflowX: "hidden",
            borderTop: PANEL_BORDER,
            paddingTop: 8,
            overscrollBehavior: "contain",
          }}
        >
          {BLIZZARD_VFX_CLIPS.map((c) => (
            <div
              key={c.key}
              style={{
                padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                fontSize: 12,
                lineHeight: 1.6,
                overflowWrap: "anywhere",
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: TEXT_MAIN }}>
                  {c.soundLabel || c.key}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 999,
                    color: c.bound ? "#8ee6b0" : TEXT_DIM,
                    border: `1px solid ${c.bound ? "rgba(142,230,176,0.45)" : "rgba(255,255,255,0.18)"}`,
                  }}
                >
                  {c.bound ? "使用中" : "收錄未啟用"}
                </span>
              </div>
              <div style={{ color: "#c3cbdd" }}>{c.key}</div>
              <div style={{ color: TEXT_DIM }}>
                {c.archive} · {c.wc3Path}
                {c.ggSnd.length > 0 ? ` · ${c.ggSnd.join(", ")}` : ""}
                {c.abilityDocs.length > 0 ? ` · ${c.abilityDocs.join(", ")}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function CreditsPage(props: { onClose: () => void }): React.JSX.Element {
  // THE "關閉不掉" BUG: the ✕ button was un-clickable. The AudioToggle is
  // portaled to <body> at z-index 2147483000 (see AudioToggle.tsx Z_TOP), so
  // its invisible top-right box sat OVER a z-60 overlay — right where 關閉 is.
  // A modal must out-rank the persistent chrome, so this dialog goes above it.
  // Belt and braces: Escape closes, and clicking the dark backdrop closes, so
  // the overlay can never trap the user again whatever covers one control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <div
      role="dialog"
      aria-label="版權聲明"
      onClick={(e) => {
        // backdrop-only: a click that lands on the overlay itself (not on the
        // inner content) closes. Clicks on links/text inside do not.
        if (e.target === e.currentTarget) props.onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        // THE REAL "關閉不掉" CAUSE: this modal renders inside #hud-root, which is
        // `pointer-events: none` (see index.html), so without re-enabling events
        // the whole overlay — ✕ button AND backdrop — is click-through and every
        // click falls to the login page below (elementFromPoint proved it). The
        // earlier z-index bump only fixed painting order, not hit-testing.
        pointerEvents: "auto",
        // and stays painted above the AudioToggle's Z_TOP (2147483000).
        zIndex: 2147483600,
        overflowY: "auto",
        background: "rgba(8, 10, 20, 0.94)",
        color: TEXT_MAIN,
        padding: "32px 20px 60px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontSize: 22, margin: 0, color: GOLD }}>版權聲明</h1>
          <SfxButton
            kind="ghost"
            onClick={props.onClose}
            title="關閉"
            style={{
              marginLeft: "auto",
              padding: "4px 14px",
              borderRadius: 7,
              border: PANEL_BORDER,
              background: "transparent",
              color: TEXT_DIM,
              fontSize: 14,
            }}
          >
            ✕ 關閉
          </SfxButton>
        </div>
        <div style={{ fontSize: 13, color: TEXT_DIM, marginBottom: 22 }}>{COPYRIGHT_LINE}</div>

        {CREDITS.map((c) => (
          <section
            key={c.title}
            style={{
              marginBottom: 14,
              padding: "12px 14px",
              borderRadius: 9,
              background: PANEL_BG,
              border: c.mandatory ? "1px solid rgba(242,161,60,0.55)" : PANEL_BORDER,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: TEXT_DIM }}>{c.what}</span>
              {c.mandatory && (
                <span style={{ fontSize: 11, color: GOLD, fontWeight: "bold" }}>署名為授權條件</span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: "bold", marginTop: 3 }}>
              {c.sourceUrl ? (
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" style={LINK}>
                  {c.title}
                </a>
              ) : (
                c.title
              )}
            </div>
            <div style={{ fontSize: 13, color: "#c3cbdd", marginTop: 2 }}>
              {c.authorUrl ? (
                <a href={c.authorUrl} target="_blank" rel="noopener noreferrer" style={LINK}>
                  {c.author}
                </a>
              ) : (
                c.author
              )}
              {" · "}
              {c.licenseUrl ? (
                <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer" style={LINK}>
                  {c.license}
                </a>
              ) : (
                c.license
              )}
            </div>
            {c.terms && (
              <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 6, lineHeight: 1.6 }}>{c.terms}</div>
            )}
          </section>
        ))}

        <SfxLabList />
        <BlizzardVfxList />
      </div>
    </div>
  );
}

export function CreditsRoute(): React.JSX.Element | null {
  const [open, setOpen] = useState(hashIsCredits);

  useEffect(() => {
    const onHash = (): void => setOpen(hashIsCredits());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return open ? <CreditsPage onClose={closeCredits} /> : null;
}
