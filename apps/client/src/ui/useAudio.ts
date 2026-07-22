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
 * The login screen's rotating theme: the epic title bed, then the nocturne,
 * then back (task #88, 「第二首輪播」).
 *
 * ALL the rule lives in the pure `stepLoginRotation` (audio/loginRotation) —
 * including the two things that are easy to get wrong and impossible to see in
 * a browser: timing the swap off the BED's own start rather than mount, and
 * refusing to re-arm until the bed anchor actually CHANGES. This hook is only
 * the timer shell around it, which is why the rotation is covered headlessly.
 *
 * `active` false parks the rotation and resets it, so leaving the login screen
 * and coming back always opens on LOGIN_THEMES[0] rather than mid-cycle. That
 * reset is also what keeps the scripted angry roar off the nocturne — see
 * audio/loginAmbience.
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
