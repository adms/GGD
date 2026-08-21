/**
 * 大廳公告 — the popup a player meets when they arrive in the lobby (task #259).
 *
 * ---- WHY A POPUP, AND WHY IT STILL DOES NOT NAG ----------------------------
 * The owner's words were 「給玩家看的公告 應該是玩家會在大廳跳出訊息看到才對」 —
 * 跳出, a thing that pops. So this leads with a modal rather than a banner. The
 * two failure modes of that choice are known and both are closed:
 *
 *   • a modal on EVERY visit is nagware, and nagware gets closed unread. So
 *     dismissal is remembered PER ANNOUNCEMENT ID (./announcements, localStorage
 *     `ggd.announcements.dismissed.v1`). Closing it closes it for good — until
 *     the operator publishes a DIFFERENT announcement, which pops again. The
 *     only thing that can interrupt a player is genuinely new news.
 *   • a modal you dismissed is unrecoverable. So the store keeps TWO separate
 *     facts — "what is published" and "should it interrupt you" — and the lobby
 *     header carries a 📢 公告 chip for as long as an announcement exists at
 *     all, including across reloads. Dismissal stops the interruption; it never
 *     discards the text.
 *
 * A persistent banner was the alternative and was rejected on the same evidence
 * the owner gave: he had been writing release notes into a GitHub release page
 * for months and the family had read none of them. Something that can be
 * ignored forever had already been tried.
 *
 * ---- IT HAS TO READ WELL ---------------------------------------------------
 * The audience is a non-technical family and the language is Traditional
 * Chinese. The admin authoring form is a plain `<textarea>` (apps/admin ·
 * AnnouncementsPage) capped at 4000 chars — no markdown, no HTML, no rich
 * editor anywhere in the path — so the renderer's whole job is: PRESERVE THE
 * LINE BREAKS the operator typed, wrap long lines, and scroll when there are
 * many of them. Lines are painted as separate elements (see
 * `announcementLines`) rather than one `white-space: pre-wrap` blob, so each
 * one wraps independently and the body scrolls inside the card instead of
 * pushing the 知道了 button off a short screen.
 *
 * React escapes the text, so an operator who types `<script>` sees `<script>`.
 *
 * ---- CHROME CONTRACTS (#107 safe-area, #66 version badge) ------------------
 * The scrim is `position: fixed` and covers the viewport EXCEPT a reserved
 * bottom band, so the build stamp — the whole point of which is that every
 * screenshot is traceable to a build — stays legible underneath an open
 * announcement. The band is read from a CSS custom property with a derived
 * fallback (`bottomChromeClear`), the same publish/consume shape ../chromeReserve
 * uses for the top-right audio cluster: if the badge ever publishes its real
 * measured height, this picks it up with no edit here, and until then the
 * fallback is comfortably taller than the 10px/line-height-1 stamp.
 *
 * The card itself is height-capped against the SCRIM (not the viewport), so on
 * an iPhone in landscape — 390px of height, the #151 case — the title, the
 * scrolling body and the button all fit, and nothing lands under the badge.
 */
import { useEffect } from "react";
import { useApp } from "./store";
import { announcementDate, announcementLines, type PublicAnnouncement } from "./announcements";
import { Btn, ACCENT } from "./widgets";
import { GOLD, PANEL_BG, TEXT_DIM, TEXT_MAIN } from "../theme";
import { padModalScope } from "../padModalScope";

/**
 * Height (px) of the bottom strip left uncovered for the build stamp (#66).
 * The badge is a single 10px line at `bottom: 2` with `line-height: 1`; 18px
 * clears it with room for a descender and a hairline of breathing space.
 * A LOCAL fallback on purpose — VersionBadge is owned by another lane, and this
 * module must not depend on importing anything out of it.
 */
export const BOTTOM_CHROME_FALLBACK_H = 18;

/** CSS custom property the bottom chrome may publish its measured height on. */
export const CHROME_BOTTOM_H = "--ggd-chrome-bottom-h";

/**
 * PURE: what `bottomChromeClear()`'s CSS resolves to, so the reserve can be
 * asserted without a browser. `published = null` models "nobody publishes it"
 * — today's case — and yields the derived fallback.
 */
export function bottomChromeClearPx(published: number | null | undefined, safeAreaInset = 0): number {
  return (published ?? BOTTOM_CHROME_FALLBACK_H) + safeAreaInset;
}

/**
 * The consumer-side CSS value: how far above the viewport's bottom edge an
 * overlay must stop so it never covers the persistent bottom chrome.
 */
export function bottomChromeClear(): string {
  return `calc(var(${CHROME_BOTTOM_H}, ${BOTTOM_CHROME_FALLBACK_H}px) + env(safe-area-inset-bottom, 0px))`;
}

/**
 * PURE, prop-driven view — the render target for tests and the thing the store
 * connector below wraps. Everything about how an announcement LOOKS is here;
 * nothing about where it comes from is.
 */
export function LobbyAnnouncementCard(props: {
  announcement: PublicAnnouncement;
  onDismiss: () => void;
}): React.JSX.Element {
  const { announcement, onDismiss } = props;
  const lines = announcementLines(announcement.body);
  const date = announcementDate(announcement.createdAt);
  return (
    <div
      data-ggd-announcement=""
      className="ggd-platform"
      role="dialog"
      aria-modal="true"
      aria-label="大廳公告"
      // GH#504 — without this the pad's root fell back to `document.body` and
      // the D-pad walked onto the lobby buttons UNDER the scrim (A clicked
      // them: PadFocusNav uses `el.click()`, which ignores pointer-events).
      {...padModalScope("announcement")}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        top: 0,
        // #66: stop short of the build stamp instead of `inset: 0`.
        bottom: bottomChromeClear(),
        background: "rgba(4, 6, 12, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
        boxSizing: "border-box",
        pointerEvents: "auto",
        // Under ChangePasswordDialog / SettingsScreen (100) so a dialog the
        // player deliberately opened is never trapped behind this one.
        zIndex: 90,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          // Capped against the SCRIM, which already excludes the badge band —
          // so on a 390px-tall phone the card, its scroll area and the button
          // all fit without a second media query.
          maxHeight: "100%",
          width: "min(94vw, 520px)",
          background: PANEL_BG,
          border: `1px solid ${ACCENT}`,
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0, 0, 0, 0.55)",
          color: TEXT_MAIN,
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(120, 140, 190, 0.22)" }}>
          <div style={{ fontSize: 11, letterSpacing: 2, color: GOLD, fontWeight: 700 }}>📢 最新公告</div>
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 5, lineHeight: 1.4, wordBreak: "break-word" }}>
            {announcement.title}
          </div>
          {date !== "" && <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>{date}</div>}
        </div>

        {/* THE BODY. Its own scroll container: a long patch note scrolls here,
            never by growing the card past the screen. `flex: 1 1 auto` +
            `minHeight: 0` is what actually lets it shrink inside a flex column
            on a short viewport. */}
        <div
          data-ggd-announcement-body=""
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            padding: "12px 16px",
            fontSize: 13,
            lineHeight: 1.85,
            color: TEXT_MAIN,
            overflowWrap: "anywhere",
          }}
        >
          {lines.map((line, i) =>
            line === "" ? (
              // A blank line the operator typed = a paragraph break, kept as
              // vertical space rather than an empty text node with no height.
              <div key={i} style={{ height: 10 }} />
            ) : (
              <div key={i}>{line}</div>
            ),
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "10px 16px 14px",
            borderTop: "1px solid rgba(120, 140, 190, 0.22)",
          }}
        >
          <Btn kind="primary" padBack onClick={onDismiss} title="關閉公告（同一則不會再跳出）">
            知道了
          </Btn>
        </div>
      </div>
    </div>
  );
}

/**
 * The lobby's mount point. Renders NOTHING unless the store holds an
 * announcement that this browser has not already closed — which is the state
 * whenever the operator has published nothing, or the feed was unreachable, or
 * the player has seen this one. So the lobby looks exactly as it does today in
 * every case except the one this feature exists for.
 *
 * Escape closes it (and counts as a dismissal), because on a keyboard that is
 * what a player will try first. Clicking the scrim deliberately does NOT: a
 * stray click on the way to the lobby would otherwise silently retire an
 * announcement the family never read.
 */
export function LobbyAnnouncement(): React.JSX.Element | null {
  const announcement = useApp((s) => s.announcement);
  const open = useApp((s) => s.announcementOpen);
  const dismissAnnouncement = useApp((s) => s.dismissAnnouncement);
  const showing = open && announcement !== null;

  useEffect(() => {
    if (!showing || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") dismissAnnouncement();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showing, dismissAnnouncement]);

  if (!showing || announcement === null) return null;
  return <LobbyAnnouncementCard announcement={announcement} onDismiss={dismissAnnouncement} />;
}
