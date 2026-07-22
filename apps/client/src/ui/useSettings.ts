/**
 * useSettings — React binding for the (non-Zustand) SettingsStore. Uses
 * useSyncExternalStore so components re-render on any settings change; a
 * selector narrows the subscription. The store itself is plain pub/sub — this
 * hook is the only React-aware adapter (React stays confined to ui/).
 */
import { useSyncExternalStore } from "react";
import { settingsStore, type Settings } from "../settings";

export function useSettings<T>(selector: (s: Settings) => T): T {
  return useSyncExternalStore(
    (cb) => settingsStore.subscribe(cb),
    () => selector(settingsStore.get()),
    () => selector(settingsStore.get()),
  );
}

/** Full settings snapshot (re-renders on any change). */
export function useAllSettings(): Settings {
  return useSyncExternalStore(
    (cb) => settingsStore.subscribe(cb),
    () => settingsStore.get(),
    () => settingsStore.get(),
  );
}
