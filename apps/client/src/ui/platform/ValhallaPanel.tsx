/**
 * ValhallaPanel — 英靈殿, the lobby's champion showcase (task #258).
 *
 * Owner's words: 「大廳中央上面 (單人vsBot 之上) 增加一個區塊 [英靈殿] 用 3d model
 * + 英雄全名+稱號, 描述, 技能介紹 隨機介紹一個英雄，並且每過1分鐘就會輪播隨機
 * 下一個英雄」. So: a 3D stage, 稱號 + 全名, the map's own 故事 text, the full
 * six-slot kit, one champion at a time, a new one every minute.
 *
 * ---------------------------------------------------------------------------
 * EVERYTHING HERE IS COMPOSITION — the data all comes from existing selectors
 * ---------------------------------------------------------------------------
 *   · roster    → `valhallaRoster` (registry ∩ operator whitelist, ./valhalla)
 *   · 稱號/全名/故事 → `championDisplayFor` + `parseDescriptionSections`
 *   · 技能      → `skillRows(champSelectSkillSeat(def))`, rendered with
 *                 champ-select's own `SkillRowView`
 *   · 3D        → `StorePreviewCanvas` (one shared Babylon viewer class)
 * No second parser, no second renderer, no second Babylon shell.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR WAYS A SHOWCASE LIKE THIS SHIPS BROKEN, AND WHAT STOPS EACH
 * ---------------------------------------------------------------------------
 * 1. PERMANENTLY EMPTY (#18/#170). The lobby paints BEFORE the content bundle
 *    loads, so `Champions.ids()` is `[]` on first render. This subscribes to
 *    `useContentReady()` and puts it in the memo deps; while either the content
 *    or the whitelist is still in flight it draws a SKELETON, never `null` —
 *    a null would look exactly like "the feature was never built".
 * 2. A BLACK HOLE WHERE THE MODEL SHOULD BE (#129). WebGL may be unavailable,
 *    the model doc may 404, the glb may fail to parse. `StorePreviewCanvas`
 *    now reports its status, and any non-"ready" outcome swaps in the
 *    champion's portrait (or a letter tile when even that is missing). The
 *    block is never blank, in any state.
 * 3. PUSHING 「一鍵開打」 OFF A PHONE (#151/#247). See `valhallaLayout` — at
 *    ≤520px of viewport height the card collapses to one 30px line.
 * 4. NUMBERS THAT DISAGREE WITH COMBAT (#125). `useDisplayEnv()` reads the
 *    MATCH's table and there is no match here, so the cooldowns would print
 *    5× too long. The pre-match table is resolved by `useLobbyCombatEnv` and
 *    passed explicitly into every row.
 *
 * CHROME IS SILENT; THE CHAMPION IS NOT (GH#256, wired 2026-08-02).
 * 「下一位」/「展開」/「試放」 are plain <button>s rather than the shared `Btn` —
 * `Btn` carries the #24 hover/click SFX, and a showcase that chirps every time a
 * family member's cursor crosses the lobby is noise. That part is unchanged.
 *
 * ⚠️ This header used to claim 「Nothing in this file imports the audio system…
 * there is no code path from here to `playSfx`」. That is NO LONGER TRUE and the
 * sentence was deleted rather than left to rot (CLAUDE.md 第三守則). owner asked
 * for the opposite of silence on the ROTATION itself:
 *
 *   「英靈殿 展示的時候要發出該角色的自己語音宣言」
 *
 * So every time the stage changes champion — the 60-second auto-swap, the
 * 「下一位」 button, and the first draw when the roster lands — this fires
 * {@link playValhallaDeclaration} for the champion NOW ON STAGE.
 *
 * ⚠️⚠️ WHAT IT ACTUALLY PLAYS, honestly: **not a 名言**. Measured: `quote` /
 * `famousQuote` is populated on 0 of 119 champion docs, so #139/#142 have no
 * content to play yet. The declaration seam falls through to the champion's own
 * per-champion voice (#27's ladder: authored map quip → generated pack → WC3
 * soundset → 名乗り). That is still 「該角色的自己語音」, which is why it ships —
 * but nobody should read this file and conclude the 名言 work is done. See
 * `./valhalla/valhallaDeclaration.ts`, which owns that seam and that caveat.
 *
 * Browser autoplay policy means the first champion after a cold page load is
 * usually inaudible until the player has clicked something; the mixer, not this
 * file, decides. `playValhallaDeclaration` reports which happened.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import { useContentReady } from "./ContentGate";
import { useWhitelist } from "../panels/whitelist";
import { championDisplayFor } from "./championDisplay";
import { championDescription, champSelectSkillSeat, parseDescriptionSections } from "../panels/champselect/championProfile";
import { isStandInModel, STAND_IN_NOTE_EN, STAND_IN_NOTE_ZH } from "../panels/champselect/standIn";
import { SkillRowView } from "../panels/champselect/ProfileBlock";
import { skillRows } from "../panels/skillDetails";
import { StorePreviewCanvas, type PreviewStatus } from "./StorePreviewCanvas";
import { IconImg } from "../components/IconImg";
import { championIconUrl } from "../icons";
import { attackTypeLabel } from "../codex/codexLabels";
import { pitchTooltipForChampion, PITCH_ACCENT } from "../panels/champselect/pitchTooltip";
import { useLobbyCombatEnv } from "./lobbyCombatEnv";
import { Panel, ACCENT } from "./widgets";
import { GOLD, PANEL_BG, TEXT_DIM, TEXT_MAIN } from "../theme";
import { ValhallaSandboxPanel } from "./valhalla/ValhallaSandboxPanel";
import { playValhallaDeclaration } from "./valhalla/valhallaDeclaration";
import {
  draw,
  EMPTY_ROTATION,
  shouldCount,
  VALHALLA_EXPANDED_STAGE,
  VALHALLA_ROTATION_MS,
  VALHALLA_TICK_MS,
  valhallaLayout,
  valhallaRoster,
  type RotationState,
  type ValhallaLayout,
} from "./valhalla";

const TITLE = "英靈殿";

/**
 * GH#256 —— 換人的時候要不要出聲。
 *
 * ⚠️ 這是一個**決策點**（CLAUDE.md 第一守則），所以它是一個可覆寫的值而不是一行
 * 寫死的 `void play(...)`。預設 `true`，因為那是 owner 明說的那一側
 * （「英靈殿展示的時候要發出該角色的自己語音宣言」）。
 *
 * ⛔ 它**還不是後台欄位**，而那是誠實的現況不是設計：英靈殿這一批的後台三落點
 * （`content/config/*.json` / `schema/config.ts` / `apps/admin/*`）目前由
 * `./valhalla/valhallaSandboxRules.ts` 的 `VALHALLA_SANDBOX_ADMIN_FIELDS` 那一批
 * 一起送，這一格要跟著那一批走，不要另外開第二條路。在那之前，要關掉的人可以
 * 傳 `declaimOnRotate={false}`。
 */
export const VALHALLA_DECLAIM_ON_ROTATE_DEFAULT = true;

/** Live viewport box — the layout tier is a function of it, so it must track resizes. */
function useViewport(): { width: number; height: number } {
  const [box, setBox] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 720 : window.innerHeight,
  }));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = (): void => setBox({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return box;
}

/** `document.hidden`, as a React value. Drives both the clock and the render loop. */
function useTabHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = (): void => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    onChange();
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}

/**
 * Is the card actually on screen? On a phone the lobby body scrolls, and a
 * showcase parked below the fold has no business holding a WebGL context busy.
 * No IntersectionObserver (jsdom/node test envs lack it) → assume visible.
 */
/**
 * ⛔ THIS USED TO BE DEAD CODE, and the adversarial pass measured it: with
 * `[ref]` as the deps (a `useRef` object is referentially STABLE, so that array
 * never changes) the effect ran exactly once — on the first commit, which is
 * ALWAYS the skeleton, because `useWhitelist()`'s cold cache starts `loading`.
 * The skeleton does not mount `ref`, so `ref.current` was `null`, the effect
 * returned early, and it never ran again for the life of the component.
 * `onScreen` was therefore permanently `true`: measured 1,324 GPU draws over 3 s
 * with the card scrolled 1,335 px off the top of the viewport.
 *
 * The fix is a CALLBACK REF, which React invokes whenever the node attaches or
 * detaches — so the observer is created the moment the real card replaces the
 * skeleton, and re-created if the card ever remounts. `document.hidden` (the
 * other half of the pause) was verified working and is untouched.
 */
function useOnScreen(): { onScreen: boolean; attach: (el: HTMLElement | null) => void } {
  const [onScreen, setOnScreen] = useState(true);
  const ioRef = useRef<IntersectionObserver | null>(null);

  const attach = useCallback((el: HTMLElement | null) => {
    ioRef.current?.disconnect();
    ioRef.current = null;
    if (!el || typeof IntersectionObserver === "undefined") {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e) setOnScreen(e.isIntersecting);
    });
    io.observe(el);
    ioRef.current = io;
  }, []);

  useEffect(() => () => ioRef.current?.disconnect(), []);
  return { onScreen, attach };
}

/** The portrait shown when the 3D stage cannot be trusted (or is collapsed). */
function ChampionPortrait({ id, size }: { id: string; size: number }): React.JSX.Element {
  const url = championIconUrl(id);
  const letter = (championDisplayFor(id).fullName || id).slice(0, 1);
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#121826",
        border: `1px solid ${ACCENT}55`,
        color: GOLD,
        fontWeight: 800,
        fontSize: Math.max(12, Math.round(size * 0.42)),
      }}
    >
      {/* IconImg renders NOTHING when the icon is absent or 404s, so the letter
          tile behind it is the real floor — 1 of the 49 has no icon at all. */}
      <IconImg src={url} size={size} alt="" style={{ borderRadius: 8 }} />
      {url === null && letter}
    </div>
  );
}

/** The 3D stage, with its portrait fallback and the 替身模型 badge. */
function ValhallaStage({
  championId,
  height,
  paused,
}: {
  championId: string;
  height: number;
  paused: boolean;
}): React.JSX.Element {
  const def = Champions.tryGet(championId as ChampionId);
  const modelKey = def?.modelKey ?? null;
  const [status, setStatus] = useState<PreviewStatus>("loading");
  const onStatus = useCallback((s: PreviewStatus) => setStatus(s), []);
  /**
   * Reset on the MODEL KEY, not the champion id.
   *
   * ⛔ This was keyed to `championId` and the adversarial pass caught what that
   * costs: `StorePreviewCanvas` only re-reports its status when `props.modelKey`
   * changes (its effect deps are `[props.modelKey, engineFailed]`), so rotating
   * from one champion to another that shares a model reset us to "loading" and
   * then NOTHING ever set us back to "ready" — the 「3D 模型載入中…」 overlay
   * stayed pinned over a model that was already drawn, permanently.
   *
   * That is not a rare edge: 43 of the roster borrow one of four shared voxel
   * bodies (see packages/shared/src/content/standinCensus.test.ts), so the
   * shuffle bag hits a same-key pair constantly.
   *
   * Keying the reset to `modelKey` makes the two sides agree: the status is
   * cleared exactly when the canvas will speak again, and a same-model rotation
   * keeps the "ready" it already earned. The original reason for the reset — a
   * stale "failed" pinning the fallback over a model that loads fine — still
   * holds, because a different champion with a broken model has a different key.
   */
  useEffect(() => setStatus("loading"), [modelKey]);
  const standIn = isStandInModel(modelKey);
  return (
    <div
      data-ggd-valhalla-stage=""
      // the 3D stage's real state, published to the DOM: "did the player get a
      // model or a fallback?" has to be answerable from a screenshot harness,
      // not inferred from how the pixels look (#93's lesson)
      data-ggd-valhalla-model={modelKey === null ? "none" : status}
      style={{
        position: "relative",
        height,
        flexShrink: 0,
        borderRadius: 10,
        overflow: "hidden",
        background: "#0e1219",
        // the canvas owns wheel + drag; without this a finger dragging the
        // phone lobby would spin the model instead of scrolling the page
        touchAction: "pan-y",
      }}
    >
      {modelKey !== null && (
        <StorePreviewCanvas
          modelKey={modelKey}
          // GH#31 —— 沒有 championId,overlay 認不出這位英雄,會原封不動退回共用
          // 替身。英靈殿是 owner 點名的四個場景之一(「別忘了 英雄殿 選擇英雄
          // 戰鬥 結算 四個場景都要替換喔」),而它是三個 StorePreviewCanvas 消費端
          // 裡唯一漏傳的 —— 商店與選擇英雄早就為了 #263 的 tint 傳了。
          championId={championId}
          paused={paused}
          hideEmptyHint
          minHeight={height}
          onStatus={onStatus}
        />
      )}
      {/* NEVER A HOLE. Three states cover the stage with the portrait: no model
          key at all, a failed load, and the seconds a large .glb spends in
          flight (measured: some champions take >20s to decode under software
          rendering, and an empty black box for 20s is indistinguishable from a
          broken feature). Only "ready" leaves the canvas alone. */}
      {(modelKey === null || status === "failed" || status === "loading") && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "#0e1219",
            opacity: status === "loading" ? 0.72 : 1,
          }}
        >
          <ChampionPortrait id={championId} size={Math.min(96, Math.max(48, height - 56))} />
          <div style={{ fontSize: 10.5, color: TEXT_DIM }}>
            {status === "loading" ? "3D 模型載入中…" : "3D 模型無法載入 · 以立繪代替"}
          </div>
        </div>
      )}
      {standIn && status !== "failed" && (
        // SHORT ON PURPOSE. The full champ-select wording is two lines wide and
        // covered the champion's HEAD on this 220px stage — a disclaimer that
        // hides the thing it is disclaiming. The long text moves to the tooltip.
        <div
          title={`${STAND_IN_NOTE_ZH} — ${STAND_IN_NOTE_EN}`}
          style={{
            position: "absolute",
            right: 6,
            top: 6,
            padding: "1px 6px",
            borderRadius: 999,
            background: "rgba(58, 44, 28, 0.85)",
            border: "1px solid #e0a878",
            color: "#f0cfa8",
            fontSize: 9.5,
            whiteSpace: "nowrap",
          }}
        >
          🎭 替身
        </div>
      )}
    </div>
  );
}

/** Grey placeholder shown until content + whitelist land — never `null`. */
function ValhallaSkeleton({ note }: { note: string }): React.JSX.Element {
  return (
    <Panel
      data-ggd-valhalla=""
      title={TITLE}
      style={{ border: `1px solid ${ACCENT}55`, gap: 8, flexShrink: 0 }}
    >
      <div
        aria-busy="true"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 44,
          color: TEXT_DIM,
          fontSize: 12,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "linear-gradient(90deg,#141a28,#1d2536,#141a28)",
            flexShrink: 0,
          }}
        />
        {note}
      </div>
    </Panel>
  );
}

export interface ValhallaPanelProps {
  /** 換人時要不要播宣言。見 {@link VALHALLA_DECLAIM_ON_ROTATE_DEFAULT}。 */
  declaimOnRotate?: boolean;
}

export function ValhallaPanel({
  declaimOnRotate = VALHALLA_DECLAIM_ON_ROTATE_DEFAULT,
}: ValhallaPanelProps): React.JSX.Element {
  const contentReady = useContentReady();
  const { whitelist, loading: whitelistLoading } = useWhitelist();
  const { env } = useLobbyCombatEnv(contentReady);
  const { width, height } = useViewport();
  const hidden = useTabHidden();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { onScreen, attach: attachOnScreen } = useOnScreen();

  // SUBSCRIBE, DON'T SNAPSHOT: `contentReady` in the deps is what keeps this
  // from freezing on the empty registry the lobby's first paint sees (#170).
  const roster = useMemo(
    () => (contentReady ? valhallaRoster(whitelist) : []),
    [contentReady, whitelist],
  );

  const [rotation, setRotation] = useState<RotationState>(EMPTY_ROTATION);
  const [current, setCurrent] = useState<string | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /**
   * GH#254 —— 技能試放空間。**預設關著**，而那是一個刻意的決定，不是省事：
   * 這個房間會開一個真的 `SimWorld` 並以 30Hz 步進，大廳輪播到誰就自動開一個
   * 的話，一個掛在大廳的分頁會整天在跑 sim。要玩的人自己按開。
   * 開著的時候輪播也停（`engaged`）—— 沒有人希望自己正在試放的英雄被換掉。
   */
  const [sandboxOpen, setSandboxOpen] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(0);
  const currentRef = useRef<string | null>(null);
  currentRef.current = current;

  /** Advance to the next champion and restart the minute. */
  const advance = useCallback(() => {
    setRotation((prev) => {
      const next = draw(prev, roster, Math.random, currentRef.current);
      if (next.id !== null) setCurrent(next.id);
      return next.state;
    });
    elapsedRef.current = 0;
    if (barRef.current) barRef.current.style.width = "0%";
  }, [roster]);

  // first draw (and a re-draw when the roster arrives / changes under us)
  useEffect(() => {
    if (roster.length === 0) {
      setCurrent(null);
      return;
    }
    if (current !== null && roster.includes(current)) return;
    advance();
    // `advance` closes over the roster; `current` is intentionally not a dep —
    // re-running on every swap would restart the bag every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);

  /**
   * GH#256 —— 「英靈殿展示的時候要發出該角色的自己語音宣言」。
   *
   * 掛在 `current` 上，所以三條換人的路都會出聲，而且**只出聲一次**：
   * 60 秒的自動輪播、「下一位 ▸」、以及 roster 到齊時的第一抽。
   *
   * ⚠️ 這一條在 2026-08-02 之前是**不存在的**。宣言只掛在試放空間裡的
   * 🔊 按鈕上 —— 要先按「⚔ 試放技能」再按 🔊，兩層點擊之後才碰得到，而且只在
   * full 版面有。也就是說 owner 要的「展示的時候」從來沒有發生過。刪掉這個
   * effect，`valhallaDeclaration.test.ts` 那六條會**照樣全綠**（失敗形態 ③），
   * 釘住它的是 `valhalla/ValhallaPanelMount.test.ts`。
   *
   * 播的是什麼、為什麼不是名言：見檔頭與 `valhalla/valhallaDeclaration.ts`。
   * 回傳的 promise 刻意不 await —— 混音器沒解鎖時它回 `silent`，那是合法結果，
   * 不是錯誤，展示櫃不因為沒聲音而改變任何畫面。
   */
  useEffect(() => {
    if (!declaimOnRotate || current === null) return;
    void playValhallaDeclaration(current);
  }, [current, declaimOnRotate]);

  // THE CLOCK. One 500ms interval, and it only accrues while the card is
  // countable: a hidden tab, an off-screen card, or a player with the pointer
  // parked on it all FREEZE the counter rather than queueing swaps. So a
  // deferred rotation fires the instant the player looks away — never six at
  // once when they come back to the tab.
  // GH#254：試放空間開著 = 玩家正在用這一位英雄，輪播必須停（和 owner 的
  // 「玩家正在讀的時候不要抽換」同一條規則，只是這次是「正在玩」）。
  const counting = shouldCount({ hidden, offscreen: !onScreen, engaged: engaged || sandboxOpen });
  useEffect(() => {
    if (!counting || current === null) return;
    const timer = window.setInterval(() => {
      elapsedRef.current += VALHALLA_TICK_MS;
      const frac = Math.min(1, elapsedRef.current / VALHALLA_ROTATION_MS);
      if (barRef.current) barRef.current.style.width = `${(frac * 100).toFixed(1)}%`;
      if (elapsedRef.current >= VALHALLA_ROTATION_MS) advance();
    }, VALHALLA_TICK_MS);
    return () => window.clearInterval(timer);
  }, [counting, current, advance]);

  const layout: ValhallaLayout = valhallaLayout({ viewportHeight: height, viewportWidth: width });

  if (!contentReady || whitelistLoading) {
    return <ValhallaSkeleton note={!contentReady ? "英靈殿整備中…" : "確認開放名單…"} />;
  }
  if (roster.length === 0 || current === null) {
    return <ValhallaSkeleton note="目前沒有開放中的英雄可以展示（請管理員在後台開放名單）。" />;
  }

  const def = Champions.tryGet(current as ChampionId);
  if (!def) return <ValhallaSkeleton note="英靈殿整備中…" />;

  const display = championDisplayFor(current);
  const sections = parseDescriptionSections(championDescription(def));
  const story = sections.story ?? (sections.hasSections ? "" : (championDescription(def) ?? ""));
  const blurb = story || display.blurb;
  const rows = skillRows(champSelectSkillSeat(def));
  // ⭐ 選角簡短介紹（owner 2026-08-16「包含英靈殿」）。⛔ 是**多加**的一段，
  //   上面的 `blurb`（w3x 故事）與 `attackType · 技能格數` 一個字都沒動。
  const pitchTip = pitchTooltipForChampion(def);
  const strip = layout.mode === "strip" && !expanded;
  const stageHeight = layout.mode === "strip" ? VALHALLA_EXPANDED_STAGE : layout.stageHeight;
  // ~3 lines of 11.5px/1.6 prose, never more than a third of the detail budget
  const descHeight = Math.min(56, Math.round(layout.bodyMaxHeight * 0.34));

  /** Chrome button styling — deliberately NOT `Btn` (which carries the #24 SFX). */
  const chip = (small: boolean): React.CSSProperties => ({
    border: `1px solid ${ACCENT}77`,
    background: "transparent",
    color: TEXT_MAIN,
    borderRadius: 6,
    padding: small ? "0 6px" : "2px 9px",
    fontSize: small ? 10 : 11,
    lineHeight: small ? "16px" : undefined,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  });

  const nextButton = (
    <button
      type="button"
      data-ggd-valhalla-next=""
      onClick={advance}
      title="立刻換下一位英雄（不必等滿 1 分鐘）"
      style={chip(strip)}
    >
      下一位 ▸
    </button>
  );

  const expandButton = layout.mode === "strip" && (
    <button
      type="button"
      data-ggd-valhalla-expand=""
      onClick={() => setExpanded((v) => !v)}
      title={expanded ? "收合英靈殿" : "展開英靈殿（會佔用畫面高度）"}
      style={chip(strip)}
    >
      {expanded ? "收合 ▴" : "展開 ▾"}
    </button>
  );

  // GH#254 —— 進試放空間。只出現在 full 模式：strip 是手機橫向的一行，塞不下
  // 一個 200px 的 3D 舞台，而 #151/#247 的教訓是那一行的每一個像素都來自
  // 「⚔️ 一鍵開打」的邊界。
  const sandboxButton = layout.mode === "full" && (
    <button
      type="button"
      data-ggd-valhalla-sandbox-open=""
      onClick={() => setSandboxOpen((v) => !v)}
      title={
        sandboxOpen
          ? "關閉技能試放空間"
          : "開啟技能試放空間：對著 10,000 生命的假人試放這位英雄的六格技能（人不會移動）"
      }
      style={chip(false)}
    >
      {sandboxOpen ? "收起試放 ▴" : "⚔ 試放技能"}
    </button>
  );

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, color: TEXT_DIM, flexShrink: 0 }}>
        🏛 {TITLE}
      </span>
      <span style={{ fontSize: 10, color: TEXT_DIM, flexShrink: 0 }}>
        每分鐘輪播 · 共 {roster.length} 位
      </span>
      <div style={{ flex: 1 }} />
      {sandboxButton}
      {expandButton}
      {nextButton}
    </div>
  );

  const identity = (
    <div style={{ minWidth: 0 }}>
      {display.title && (
        <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1, lineHeight: 1.3 }}>{display.title}</div>
      )}
      <div
        style={{
          fontSize: strip ? 14 : 19,
          fontWeight: 700,
          color: TEXT_MAIN,
          lineHeight: 1.25,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: strip ? "nowrap" : "normal",
        }}
      >
        {display.fullName}
      </div>
      {!strip && (
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
          {attackTypeLabel(def.attackType)} · {rows.length} 個技能格
        </div>
      )}
      {/* ⭐ 選角簡短介紹（owner 2026-08-16「包含英靈殿」）。
          ⛔ **加在上面那一行底下，不取代它** —— 兩者說的不是同一件事：
          上面是 `attackType`（投射物 vs 近身揮擊）+ 技能格數，
          這裡是**出身 × 距離量級**加上 owner 手寫的玩法意圖。
          ⚠️ 出貨資料裡有 10 位兩者「看起來矛盾」（藏馬近戰揮擊卻是遠程 8.2）——
          那是刻意的，⛔ 不要為了讓兩行一致去改任何一邊。 */}
      {!strip && pitchTip !== null && !pitchTip.empty && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 11, color: PITCH_ACCENT, fontWeight: 600 }}>
            {pitchTip.headlineTail}
            {pitchTip.playstyleLine && ` · ${pitchTip.playstyleLine}`}
          </div>
          {pitchTip.pitch && (
            <div style={{ fontSize: 11, color: "#c8d0e0", lineHeight: 1.5 }}>{pitchTip.pitch}</div>
          )}
        </div>
      )}
    </div>
  );

  // ── the collapsed one-liner (phone landscape) ───────────────────────────
  //
  // ONE 30px ROW, and the budget is not aesthetic. MEASURED at 844×390 on this
  // build: 「⚔️ 一鍵開打」 sits at y=283..337, i.e. 53px from the bottom edge.
  // Every pixel this card spends comes straight out of that margin (plus the
  // column's 12px gap), so a two-row strip — the first attempt, 86px — pushed
  // the button to y=380..434 and off the screen. Title, portrait, 稱號·全名 and
  // both controls share a single line; the minute bar is the row's own 2px hem.
  if (strip) {
    return (
      <Panel
        data-ggd-valhalla={current}
        ref={(el) => {
          rootRef.current = el;
          attachOnScreen(el);
        }}
        style={{ border: `1px solid ${ACCENT}55`, gap: 0, padding: "3px 8px", flexShrink: 0 }}
        onMouseEnter={() => setEngaged(true)}
        onMouseLeave={() => setEngaged(false)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, height: 21 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_DIM, flexShrink: 0 }} title={TITLE}>
            🏛
          </span>
          <ChampionPortrait id={current} size={18} />
          <span
            style={{
              fontSize: 11.5,
              color: TEXT_MAIN,
              fontWeight: 600,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`${TITLE} · ${display.name}`}
          >
            {display.title && <span style={{ color: GOLD, fontWeight: 400 }}>{display.title} · </span>}
            {display.fullName}
          </span>
          <div style={{ flex: 1 }} />
          {expandButton}
          {nextButton}
        </div>
        <div style={{ height: 2, background: "#1b2233", borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
          <div ref={barRef} style={{ height: "100%", width: "0%", background: `${ACCENT}aa` }} />
        </div>
      </Panel>
    );
  }

  // ── the full card ───────────────────────────────────────────────────────
  return (
    <Panel
      data-ggd-valhalla={current}
      ref={(el) => {
        rootRef.current = el;
        attachOnScreen(el);
      }}
      style={{
        border: `1px solid ${ACCENT}55`,
        background: `linear-gradient(180deg, rgba(111,143,224,0.10) 0%, ${PANEL_BG} 55%)`,
        gap: 8,
        flexShrink: 0,
      }}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
    >
      {header}
      <div
        style={{
          display: "flex",
          flexDirection: layout.stacked ? "column" : "row",
          gap: 12,
          minWidth: 0,
        }}
      >
        <div style={{ flex: layout.stacked ? "0 0 auto" : "0 0 240px", minWidth: 0 }}>
          <ValhallaStage
            championId={current}
            height={stageHeight}
            paused={hidden || !onScreen}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {identity}
          {/* TWO scroll regions, not one. Sharing a single scroller looked
              tidier but meant a champion with a six-line 故事 pushed 技能介紹
              entirely below the fold — the player would have had to scroll to
              discover the showcase even HAS a kit, which is half of what the
              owner asked for. The description gets a small fixed budget with
              its own scrollbar; the kit always starts on screen. */}
          <div
            data-ggd-valhalla-desc=""
            onScroll={() => setEngaged(true)}
            style={{
              maxHeight: descHeight,
              overflowY: "auto",
              overflowX: "hidden",
              paddingRight: 4,
              fontSize: 11.5,
              lineHeight: 1.6,
              color: "#c8d0e0",
              whiteSpace: "pre-wrap",
              flexShrink: 0,
            }}
          >
            {blurb || "（此英雄在原地圖沒有描述文字）"}
          </div>
          {/* KIT: NAMES ONLY, one wrapped line.
              owner 2026-07-26, after seeing it: 「英靈殿佔的高度太多了 你可以拿掉
              技能詳細說明的部分」. The full `SkillRowView` rows (icon + name +
              cooldown + mana + the whole description) were the single tallest
              thing on the card — six of them could run past 300 px on their own.
              That height is exactly what pushed 「⚔️ 一鍵開打」 off the bottom of
              every 720–1099 × 521–850 viewport (iPad landscape included), with
              `html, body { overflow: hidden }` making the page unable to scroll
              down to it. So this is not only the owner's taste call, it is the
              root-cause fix for the adversarial pass's blocking finding.
              What survives is what a showcase actually needs: WHICH slots this
              hero has and what they are CALLED. The full detail already lives one
              click away in champ-select, which is where a player reads it before
              committing — the lobby card only has to make them curious. */}
          <div
            data-ggd-valhalla-body=""
            onPointerLeave={() => setEngaged(false)}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "3px 6px",
              paddingTop: 5,
              borderTop: "1px solid #1b2233",
              fontSize: 11,
              lineHeight: 1.5,
            }}
          >
            {rows.length === 0 ? (
              <div style={{ color: TEXT_DIM }}>此英雄沒有技能資料</div>
            ) : (
              rows.map((r) => (
                <span
                  key={`${r.slot}-${r.rawName}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "baseline",
                    gap: 4,
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "#141a26",
                    border: "1px solid #1b2233",
                    maxWidth: "100%",
                  }}
                >
                  <b style={{ color: ACCENT, fontWeight: 500, flex: "0 0 auto" }}>{r.slot}</b>
                  <span
                    style={{
                      color: "#c8d0e0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.rawName}
                  </span>
                </span>
              ))
            )}
          </div>
        </div>
      </div>
      {/* GH#254 技能試放空間。開著的時候輪播是停的（見 `counting`）。 */}
      {sandboxOpen && (
        <ValhallaSandboxPanel
          championId={current}
          combatEnv={env}
          paused={hidden || !onScreen}
          onClose={() => setSandboxOpen(false)}
        />
      )}
      <div style={{ height: 2, background: "#1b2233", borderRadius: 2, overflow: "hidden" }}>
        <div ref={barRef} style={{ height: "100%", width: "0%", background: `${ACCENT}aa` }} />
      </div>
    </Panel>
  );
}
