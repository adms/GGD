/**
 * AuthScreen — register/login forms with client-side validation mirroring the
 * backend rules; server error-envelope messages surface inline. The
 * "Play offline vs bots" escape hatch keeps the game playable without the
 * platform running (dev direct-join path).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, appStore } from "./store";
import { validateRegistration, validateUsername, validatePassword, type RegisterErrors } from "./validation";
import { ErrorToast } from "./LobbyScreen";
import { Btn, TextInput, FieldError, Panel, ACCENT } from "./widgets";
import { ARENA_OPTIONS, DEFAULT_MAP_ID } from "./maps";
import { TEXT_DIM, TEXT_MAIN } from "../theme";
import { HomeFooter } from "./HomeFooter";
import { ChampionMarquee } from "./ChampionMarquee";
import { MatchLoadingOverlay } from "./MatchLoadingOverlay";
import {
  audioSettings,
  audioSystem,
  effectiveGain,
  stepCalmRoar,
  CALM_ROAR_INITIAL,
  type CalmRoarState,
} from "../../audio";
// Imported directly (not via a render barrel) so the menu module can't collide
// with the parallel gameplay-render job. render/menu owns its own Babylon
// Engine + Scene + canvas.
import { LoginScene } from "../../render/menu/LoginScene";
import { prefersReducedMotion, shouldAnimateBackground, type BgMode } from "../../render/menu/background";
import { chooseEnterMode, chooseReturnMode } from "../../render/menu/procedural/transition";
import { roarSfxKey, SOFT_RETURN_ROAR_VOLUME } from "../../render/menu/roarSfx";
import { screenTracker, wireScreenTracker } from "./screenHistory";

// Record screen transitions from module load (all modules evaluate before the
// app boots), so by the time AuthScreen mounts we know whether the user came
// BACK from the app (lobby/match → auth) or cold-loaded onto the login page.
wireScreenTracker();

type Mode = "login" | "register";

// BgMode: "scene" = animated Babylon isekai background (WebGL ok, motion
// allowed); "shimmer" = CSS-only light drift (WebGL failed but motion allowed);
// "static" = just the radial gradient (prefers-reduced-motion).

export function AuthScreen(): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /**
   * 邀請碼 — the private-deploy gate (task #174). It is NOT validated here on
   * purpose: the CLIENT CANNOT KNOW whether this platform is gated (a dev
   * platform is not, and the gate is deliberately not advertised by an
   * endpoint — that would be a probe surface). So the field is always offered,
   * never blocks submit, and the server's 403 is what the player sees. The
   * gate is the server; this box is UX.
   */
  const [inviteCode, setInviteCode] = useState("");
  const [offlineMap, setOfflineMap] = useState(DEFAULT_MAP_ID);
  const [fieldErrors, setFieldErrors] = useState<RegisterErrors>({});
  const authBusy = useApp((s) => s.authBusy);
  const authError = useApp((s) => s.authError);
  const doLogin = useApp((s) => s.doLogin);
  const doRegister = useApp((s) => s.doRegister);
  // login→battle handoff (task #74): stage the offline launch behind the >=1s
  // loading bar (requesting the roar fade) instead of jumping straight to match
  const beginOfflineLoading = useApp((s) => s.beginOfflineLoading);

  // Animated 3D background. Mounted here, disposed on unmount — so when the
  // screen switches to lobby/match (AuthScreen unmounts) the menu Babylon
  // engine is torn down and never leaks alongside the game's engine.
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [bgMode, setBgMode] = useState<BgMode>("static");
  // Live LoginScene handle (for playEnterTransition) + the white-flash overlay
  // it drives; both are refs so the frame loop / callbacks never re-render React.
  const sceneRef = useRef<LoginScene | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  // per-field keystroke-FX targets (glow pulse); null under reduced motion
  const unameSparkRef = useRef<HTMLSpanElement | null>(null);
  const emailSparkRef = useRef<HTMLSpanElement | null>(null);
  const pwSparkRef = useRef<HTMLSpanElement | null>(null);
  const inviteSparkRef = useRef<HTMLSpanElement | null>(null);
  // guards a single in-flight enter transition (double-submit / double-click safe)
  const enteringRef = useRef(false);
  // Rolling spacing state for the serene theme's dragon gate (#88). A ref, not
  // state: a roar must never re-render the form, and the scene owns the timing.
  const calmRoarRef = useRef<CalmRoarState>(CALM_ROAR_INITIAL);
  // reduced-motion is stable for the life of the screen; gates keystroke visuals
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  // Did we get here by EXITING the app (lobby/match → auth) rather than a cold
  // load? Captured once on mount — drives the cinematic RETURN intro (#26).
  const returnFromApp = useMemo(() => screenTracker.cameFromApp(), []);
  /**
   * THE ONE PLACE a dragon becomes a sound (task #88, the dragon clash).
   *
   * Every roar — ambient breath edge, scripted swoop, or the reduced-motion
   * arrival — passes the pure `stepCalmRoar` gate before it reaches the mixer,
   * so "the serene theme keeps the dragons distant" is a single rule with a
   * single implementation rather than a condition sprinkled per call site.
   *
   * The gate reads `audioSystem.scene` — the bed that is ACTUALLY playing —
   * rather than a React copy of it, because the rotation's timer lives in
   * AudioDirector (a sibling, not a parent) and the truth we care about is what
   * is audible right now. It also reads the live mixer: with music muted or the
   * BGM slider at zero there is no stillness to protect, so the calm lifts and
   * the dragons keep the level the scene was tuned at (#14 / #54).
   */
  const emitRoar = (ev: { volume: number; pan: number; big: boolean }): void => {
    // login→battle handoff (task #74): once the roar fade is requested (the
    // player is entering a match) stop layering NEW roars — the loading bar is
    // now covering the tail of the roar already playing, and a fresh roar here
    // would carry straight into the combat scene's voices.
    if (appStore.getState().matchLoading?.roarFadeRequested) return;
    const { decision, next } = stepCalmRoar(calmRoarRef.current, ev, {
      scene: audioSystem.scene,
      bgmAudible: effectiveGain(audioSettings.get(), "bgm") > 0,
      nowMs: typeof performance !== "undefined" ? performance.now() : Date.now(),
    });
    calmRoarRef.current = next;
    if (decision.volume === null) return; // spaced out by the calm gate
    audioSystem.playSfx(roarSfxKey(ev), { volume: decision.volume, pan: ev.pan });
  };

  useEffect(() => {
    /**
     * Kick the return-from-app intro (reverse enter swoop). With the scene live
     * → the camera starts ON the island and pulls back to the sky vista (the
     * scene emits the big angry roar via onRoar). Reduced-motion / WebGL-off →
     * no swoop, login shows immediately, but the arrival still gets ONE soft
     * angry roar (the SFX-bus mute still gates it).
     *
     * This roar is never calmed: it fires at MOUNT, and the rotation resets to
     * LOGIN_THEMES[0] on every visit, so it always lands on the epic theme.
     */
    const beginReturnIntro = (scene: LoginScene | null): void => {
      if (!returnFromApp) return;
      if (scene && chooseReturnMode(prefersReducedMotion(), true) === "swoop") {
        scene.playReturnIntro();
      } else {
        emitRoar({ volume: SOFT_RETURN_ROAR_VOLUME, pan: 0, big: true });
      }
    };
    if (!shouldAnimateBackground(prefersReducedMotion())) {
      setBgMode("static"); // keep the calm gradient; no animation at all
      beginReturnIntro(null);
      return;
    }
    const canvas = bgCanvasRef.current;
    if (!canvas) {
      setBgMode("shimmer");
      beginReturnIntro(null);
      return;
    }
    // DEFER engine creation one frame. React StrictMode (dev) runs the effect
    // mount→cleanup→mount synchronously; building the Babylon Engine on the
    // first mount then disposing it LOSES the canvas's WebGL context, so the
    // second mount can't reacquire it and Babylon silently falls back to an
    // offscreen 300×150 canvas — leaving the visible canvas blank (a dark
    // gradient). Scheduling via rAF lets the first mount's pending build be
    // cancelled by its cleanup, so exactly ONE engine is ever created.
    let scene: LoginScene | null = null;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      try {
        scene = new LoginScene(canvas, {
          // a dragon roared → route by kind (scripted big → the ANGRY
          // dragonRoarBig clip; ambient breath → the near/far dragonRoar howl)
          // and let the serene theme hush the ambient ones. See emitRoar.
          onRoar: emitRoar,
          // enter-transition white flash → drive the overlay opacity directly
          onFlash: (a) => {
            const el = flashRef.current;
            if (el) el.style.opacity = String(a);
          },
        });
        sceneRef.current = scene;
        setBgMode("scene");
        beginReturnIntro(scene); // reverse pull-back when we exited the app here
      } catch (err) {
        // WebGL unavailable/blocked → graceful CSS-only shimmer over the gradient
        console.warn("[login] 3D background unavailable; CSS fallback", err);
        setBgMode("shimmer");
        beginReturnIntro(null);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
    };
  }, []);

  // ---- UI SFX (hover / click / keystroke) --------------------------------
  const playHover = (): void => {
    audioSystem.playSfx("uiHover");
  };
  const playClick = (): void => {
    audioSystem.playSfx("uiClick");
  };
  /** Restart the field's glow-pulse CSS animation (no-op under reduced motion). */
  const pulseSpark = (ref: React.RefObject<HTMLSpanElement | null>): void => {
    const el = ref.current;
    if (!el) return;
    el.style.animation = "none";
    void el.offsetWidth; // force reflow so the animation re-triggers each keystroke
    el.style.animation = "ggdKeySpark 420ms ease-out";
  };
  /** Wrap a setState so every keystroke ticks the type SFX + a glow pulse. */
  const onType =
    (setter: (v: string) => void, sparkRef: React.RefObject<HTMLSpanElement | null>) =>
    (v: string): void => {
      audioSystem.playSfx("uiType");
      pulseSpark(sparkRef); // reduced-motion → ref is null → visual skipped (sound stays)
      setter(v);
    };

  // ---- enter transition (swoop → white flash → proceed) ------------------
  const quickFlash = (cb: () => void): void => {
    const el = flashRef.current;
    if (!el) {
      cb();
      return;
    }
    el.style.transition = "opacity 220ms ease";
    el.style.opacity = "1";
    window.setTimeout(cb, 260);
  };
  const fadeFlashOut = (): void => {
    const el = flashRef.current;
    if (!el) return;
    el.style.transition = "opacity 320ms ease";
    el.style.opacity = "0";
  };

  /**
   * Play the cinematic enter transition, then run `proceed` (the screen switch)
   * in its onComplete. A single hard fallback (~1.8 s) guarantees we ALWAYS
   * proceed even if the swoop stalls. Path is chosen purely: swoop (WebGL scene
   * live) → quick flash (WebGL off) → instant (reduced motion).
   */
  const runEnter = (proceed: () => void | Promise<void>): void => {
    if (enteringRef.current) return;
    enteringRef.current = true;
    let fired = false;
    let fb: number | undefined;
    const finish = (): void => {
      if (fired) return;
      fired = true;
      if (fb !== undefined) clearTimeout(fb);
      void proceed();
    };
    fb = window.setTimeout(finish, 1800); // hard fallback: never get stuck on the flash
    const scene = sceneRef.current;
    const mode2 = chooseEnterMode(prefersReducedMotion(), !!scene && bgMode === "scene");
    if (mode2 === "swoop" && scene) scene.playEnterTransition(finish);
    else if (mode2 === "flash") quickFlash(finish);
    else finish(); // instant (reduced motion): no swoop, no flash
  };

  /**
   * Auth then transition: the store's doLogin/doRegister already switch the
   * screen on SUCCESS (and stay on auth + set authError on failure). We run the
   * cinematic and kick off auth in its onComplete; on failure we fade the flash
   * back out and re-enable the form. (doLogin/doRegister logic is untouched —
   * only the screen-switch is wrapped in the transition.)
   */
  const runEnterAuth = (authAction: () => Promise<void>): void => {
    runEnter(async () => {
      await authAction();
      if (appStore.getState().screen === "auth") {
        // failed (or otherwise still here) — undo the flash, allow another try
        fadeFlashOut();
        enteringRef.current = false;
      }
    });
  };

  const submit = (): void => {
    if (authBusy || enteringRef.current) return;
    if (mode === "register") {
      const errs = validateRegistration(username, email, password);
      setFieldErrors(errs);
      if (Object.keys(errs).length > 0) return;
      runEnterAuth(() => doRegister(username.trim(), email.trim(), password, inviteCode.trim()));
    } else {
      const errs: RegisterErrors = {};
      const u = validateUsername(username.trim());
      // logins also accept an email address in the username field
      if (u && !username.includes("@")) errs.username = u;
      const p = validatePassword(password);
      if (p) errs.password = p;
      setFieldErrors(errs);
      if (Object.keys(errs).length > 0) return;
      runEnterAuth(() => doLogin(username.trim(), password));
    }
  };

  const tab = (m: Mode, label: string): React.JSX.Element => (
    <button
      onMouseEnter={playHover}
      onClick={() => {
        playClick();
        setMode(m);
        setFieldErrors({});
      }}
      style={{
        flex: 1,
        padding: "10px 0",
        background: "none",
        border: "none",
        borderBottom: mode === m ? `2px solid ${ACCENT}` : "2px solid transparent",
        color: mode === m ? TEXT_MAIN : TEXT_DIM,
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "auto",
        overflow: "hidden",
        background: "radial-gradient(ellipse at 50% 30%, #141b2e 0%, #0b0e14 70%)",
      }}
    >
      {/* Procedural animated isekai background. Absolutely positioned inset:0,
          BEHIND the card (zIndex 0), pointer-events:none so the form stays
          clickable. Visible only once the Babylon scene is live; otherwise it
          stays transparent and the gradient (+ optional shimmer) shows. */}
      <canvas
        ref={bgCanvasRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          zIndex: 0,
          pointerEvents: "none",
          opacity: bgMode === "scene" ? 1 : 0,
          transition: "opacity 900ms ease",
        }}
      />
      {bgMode === "shimmer" && (
        <>
          <style>{
            "@keyframes ggdLoginShimmer{0%{transform:translate(-8%,-6%) scale(1.1)}" +
            "50%{transform:translate(8%,6%) scale(1.2)}100%{transform:translate(-8%,-6%) scale(1.1)}}"
          }</style>
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "-10%",
              zIndex: 0,
              pointerEvents: "none",
              // dark, warm-ember + cold-arc glow (matches the dark scene; WebGL-fail
              // must NOT flash back to the old bright dawn) — slow, non-strobing.
              background:
                "radial-gradient(closest-side at 38% 32%, rgba(255,110,60,0.12), transparent 70%)," +
                "radial-gradient(closest-side at 66% 68%, rgba(90,130,255,0.12), transparent 70%)",
              animation: "ggdLoginShimmer 18s ease-in-out infinite",
            }}
          />
        </>
      )}

      {/* CONTRAST SCRIM — sits BETWEEN the canvas and the card (zIndex 0, painted
          after the canvas in DOM). A focused dark well behind the title+card
          region plus a gentle top/bottom vignette keep the text readable EVEN
          when a bright beam or explosion flares behind them, while the epic
          vista stays visible around the edges. pointer-events:none. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 480px 420px at 50% 45%, rgba(3,5,11,0.74) 0%, rgba(3,5,11,0.34) 46%, rgba(3,5,11,0) 72%)," +
            "linear-gradient(to bottom, rgba(3,5,11,0.4) 0%, rgba(3,5,11,0) 16%, rgba(3,5,11,0) 82%, rgba(3,5,11,0.55) 100%)",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, marginBottom: 26, textAlign: "center" }}>
        <div
          style={{
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: 4,
            color: "#ffffff",
            textShadow: "0 2px 20px rgba(120,150,255,0.55), 0 1px 3px rgba(0,0,0,0.85)",
          }}
        >
          去死團的逆襲
        </div>
        <div
          style={{
            fontSize: 15,
            color: "#d5ddf2",
            letterSpacing: 3,
            textShadow: "0 1px 8px rgba(0,0,0,0.85)",
          }}
        >
          動漫亂鬥競技場
        </div>
      </div>

      <Panel
        style={{
          position: "relative",
          zIndex: 1,
          width: 340,
          padding: 0,
          overflow: "hidden",
          // dark glass so the form stays legible over the FX
          background: "rgba(9, 12, 21, 0.86)",
          backdropFilter: "blur(9px)",
          WebkitBackdropFilter: "blur(9px)",
          border: "1px solid rgba(130,150,210,0.42)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", borderBottom: "1px solid #2c3448" }}>
          {tab("login", "Sign in")}
          {tab("register", "Create account")}
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div onMouseEnter={playHover}>
            <div style={{ position: "relative" }}>
              <TextInput
                value={username}
                onChange={onType(setUsername, unameSparkRef)}
                placeholder={mode === "login" ? "username or email" : "username"}
                onEnter={submit}
                autoFocus
              />
              {!reducedMotion && <span ref={unameSparkRef} aria-hidden className="ggd-key-spark" />}
            </div>
            <FieldError text={fieldErrors.username} />
          </div>
          {mode === "register" && (
            <div onMouseEnter={playHover}>
              <div style={{ position: "relative" }}>
                <TextInput value={email} onChange={onType(setEmail, emailSparkRef)} placeholder="email" onEnter={submit} />
                {!reducedMotion && <span ref={emailSparkRef} aria-hidden className="ggd-key-spark" />}
              </div>
              <FieldError text={fieldErrors.email} />
            </div>
          )}
          {mode === "register" && (
            <div onMouseEnter={playHover}>
              <div style={{ position: "relative" }}>
                <TextInput
                  value={inviteCode}
                  // uppercase as you type — the codes are minted uppercase, and
                  // seeing them line up is how you catch a mistyped character.
                  // Cosmetic only: the server normalises case, spaces and
                  // hyphens itself.
                  onChange={onType((v) => setInviteCode(v.toUpperCase()), inviteSparkRef)}
                  placeholder="邀請碼 invite code (GGD-XXXX-XXXX)"
                  onEnter={submit}
                />
                {!reducedMotion && <span ref={inviteSparkRef} aria-hidden className="ggd-key-spark" />}
              </div>
              <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4, lineHeight: 1.5 }}>
                內測期間需要邀請碼才能註冊，請向管理員索取。
              </div>
            </div>
          )}
          <div onMouseEnter={playHover}>
            <div style={{ position: "relative" }}>
              <TextInput
                value={password}
                onChange={onType(setPassword, pwSparkRef)}
                placeholder="password"
                type="password"
                onEnter={submit}
              />
              {!reducedMotion && <span ref={pwSparkRef} aria-hidden className="ggd-key-spark" />}
            </div>
            <FieldError text={fieldErrors.password} />
          </div>
          {authError && (
            <div
              style={{
                background: "#3a1c1e",
                border: "1px solid #7a3230",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 12,
                color: "#f0a0a0",
              }}
            >
              {authError}
            </div>
          )}
          <span onMouseEnter={playHover} style={{ display: "block", marginTop: 2 }}>
            <Btn
              kind="primary"
              onClick={() => {
                playClick();
                submit();
              }}
              disabled={authBusy || enteringRef.current}
              style={{ width: "100%" }}
            >
              {authBusy ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </Btn>
          </span>
        </div>
      </Panel>

      <div style={{ position: "relative", zIndex: 1, marginTop: 22, textAlign: "center" }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
          <select
            value={offlineMap}
            onMouseEnter={playHover}
            onChange={(e) => setOfflineMap(e.target.value)}
            title="offline arena"
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #3a4868",
              background: "rgba(12,16,26,0.9)",
              color: TEXT_MAIN,
              fontSize: 13,
            }}
          >
            {ARENA_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span onMouseEnter={playHover}>
            <Btn
              onClick={() => {
                playClick();
                // The enter cinematic plays, then in its onComplete we STAGE the
                // launch behind the >=1s loading bar (beginOfflineLoading) rather
                // than flipping straight to match — so the login roar fades out
                // behind the bar before the combat scene's voices start (#74).
                runEnter(() => beginOfflineLoading(offlineMap));
              }}
            >
              Play offline vs bots
            </Btn>
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#aeb8d0",
            marginTop: 8,
            textShadow: "0 1px 6px rgba(0,0,0,0.85)",
          }}
        >
          no account needed — jumps straight into a bot match
        </div>
      </div>
      {/* Roster showcase: a display-only, auto-scrolling strip of champion
          portraits pinned above the footer. pointer-events:none — the form,
          map-select and Play-offline button stay fully clickable. */}
      <ChampionMarquee />
      <HomeFooter />
      <ErrorToast />

      {/* keystroke glow-pulse: a short edge/blur flare over the focused field,
          re-triggered per keystroke via pulseSpark(). Only rendered when motion
          is allowed (the spark spans are omitted under reduced motion). */}
      {!reducedMotion && (
        <style>{
          ".ggd-key-spark{position:absolute;inset:0;border-radius:8px;pointer-events:none;" +
          "opacity:0;z-index:3;}" +
          "@keyframes ggdKeySpark{0%{opacity:0.85;box-shadow:0 0 0 1px rgba(150,180,255,0.85)," +
          "0 0 16px 3px rgba(120,150,255,0.5);}100%{opacity:0;box-shadow:0 0 0 1px rgba(150,180,255,0)," +
          "0 0 26px 7px rgba(120,150,255,0);}}"
        }</style>
      )}

      {/* ENTER-TRANSITION white flash: full-screen, above everything, opacity 0
          at rest. The LoginScene swoop drives its opacity via onFlash (or the
          quick-flash fallback ramps it) right before the screen switches. */}
      <div
        ref={flashRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 40,
          pointerEvents: "none",
          background: "#ffffff",
          opacity: 0,
        }}
      />

      {/* login→battle handoff (task #74): the >=1s loading bar. Renders only
          while a launch is staged (matchLoading set); holds this screen — and
          its still-running login scene — until the roar has faded behind the
          bar, then flips to the match. */}
      <MatchLoadingOverlay />
    </div>
  );
}
