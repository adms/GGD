/**
 * useAudio — React binding for the (framework-free) AudioSystem. Lives under
 * ui/ because the client architecture gate keeps React imports out of every
 * non-ui layer; audio/ itself stays plain WebAudio + pure modules.
 *
 * Nothing here runs per frame: `useAudioScene` fires only when the discrete
 * scene value changes, and `useAudioVolumes` re-renders only on a mixer edit.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  audioSettings,
  audioSystem,
  bgmOverride,
  stepLoginRotation,
  LOGIN_ROTATION_INITIAL,
  LOGIN_THEMES,
  type AudioScene,
  type AudioVolumes,
  type LoginRotationState,
} from "../audio";

/**
 * Boot the mixer once per app: fetch the audio map, warm the SFX buffers and
 * arm the first-gesture autoplay unlock. Idempotent (StrictMode-safe) and
 * deliberately does NOT dispose on unmount — the system outlives any screen.
 */
export function useAudioBoot(): void {
  useEffect(() => {
    void audioSystem.init();
    // Dev-only introspection handle (mirrors main.tsx's __ggdPerf) so the dev
    // harness / playtest sweep can read mixer state — context lifecycle, the
    // live bed, SFX voice counts — and script one-shots. Tree-shaken out of
    // prod bundles; no gameplay path reads it.
    if (import.meta.env.DEV && typeof window !== "undefined") {
      (window as unknown as { __ggdAudio?: unknown }).__ggdAudio = audioSystem;
    }
  }, []);
}

/**
 * Keep the background bed in sync with a discrete scene value. `null` fades
 * the bed out; re-rendering with the same scene is a no-op inside the system.
 */
export function useAudioScene(scene: AudioScene | null): void {
  useEffect(() => {
    audioSystem.playBgm(scene);
  }, [scene]);
}

/**
 * Declare that THIS screen wants a specific background bed while it is mounted
 * (task #134: the ranked ladder → the serene `menuNocturne`). Pushes a request
 * onto the shared override registry on mount and drops it on unmount, so the
 * AudioDirector — the single owner of the bed — layers it over the scene it
 * computes from store state, and the previous bed returns when the screen leaves.
 * `null` opts out (declares nothing), so a caller can bind it to a condition.
 */
export function useBgmSceneOverride(scene: AudioScene | null): void {
  useEffect(() => {
    if (scene === null) return undefined;
    const token = bgmOverride.request(scene);
    return () => bgmOverride.release(token);
  }, [scene]);
}

/**
 * The bed a mounted screen has requested via {@link useBgmSceneOverride}, or
 * null when none is active. Read by the AudioDirector, which prefers it over the
 * scene it derives from discrete store state.
 */
export function useBgmOverride(): AudioScene | null {
  return useSyncExternalStore(
    (cb) => bgmOverride.subscribe(cb),
    () => bgmOverride.current(),
    () => bgmOverride.current(),
  );
}

/**
 * The login screen's theme. SINGLE-THEME since task #134 — the serene nocturne
 * moved to the ranked ladder, so this always resolves to the epic `menu` bed.
 * The pure `stepLoginRotation` machine (audio/loginRotation) is kept and simply
 * holds `menu`; this hook is the timer shell around it, unchanged, so a future
 * second login theme needs no new wiring here.
 *
 * `active` false parks the rotation and resets it, so leaving the login screen
 * and coming back always opens on LOGIN_THEMES[0] (= `menu`) rather than
 * mid-cycle. That reset is also why the scripted return-intro roar always lands
 * on `menu` and is never calmed — see audio/loginAmbience (now dormant).
 */
export function useLoginTheme(active: boolean): AudioScene {
  const [theme, setTheme] = useState<AudioScene>(LOGIN_THEMES[0]!);
  const state = useRef<LoginRotationState>(LOGIN_ROTATION_INITIAL);
  useEffect(() => {
    if (!active) {
      state.current = LOGIN_ROTATION_INITIAL;
      setTheme(LOGIN_THEMES[0]!);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const clock = (): number =>
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const tick = (): void => {
      if (cancelled) return;
      const { step, next } = stepLoginRotation(state.current, {
        bedStartedAtMs: audioSystem.bedStartedAtMs,
        nowMs: clock(),
      });
      state.current = next;
      setTheme(step.theme);
      timer = setTimeout(tick, step.waitMs);
    };
    state.current = LOGIN_ROTATION_INITIAL;
    tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [active]);
  return theme;
}

/** Live mixer state (master/BGM/SFX + mute) for the settings UI. */
export function useAudioVolumes(): AudioVolumes {
  return useSyncExternalStore(
    (cb) => audioSettings.subscribe(cb),
    () => audioSettings.get(),
    () => audioSettings.get(),
  );
}

/** Imperative handle for one-shot triggers (SFX / stings) from event handlers. */
export function useAudioActions(): {
  playSfx: (event: string) => boolean;
  playSting: (scene?: AudioScene) => void;
  unlock: () => void;
} {
  return {
    playSfx: (event) => audioSystem.playSfx(event),
    playSting: (scene) => audioSystem.playSting(scene),
    unlock: () => audioSystem.unlock(),
  };
}
