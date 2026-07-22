/// <reference types="vite/client" />

/**
 * Client-injected env vars, merged into Vite's built-in `ImportMetaEnv`.
 */
interface ImportMetaEnv {
  /**
   * Build stamp (short git sha + date) baked in at BUILD TIME by vite's
   * `define` in vite.config.ts — never computed at runtime. Absent under vitest
   * and in a build with no git, where the reader falls back to "dev". Powers the
   * bottom-pinned VersionBadge on every screen (task #66).
   */
  readonly VITE_BUILD_STAMP?: string;
}
