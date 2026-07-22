/**
 * Shared module-resolution settings for the repo's vitest projects.
 *
 * WHY THIS EXISTS — the dual-instance registry trap:
 *
 * Vite's default `resolve.extensions` tries `.js` BEFORE `.ts`. A stray
 * compiled `foo.js` sitting next to its `foo.ts` source therefore wins every
 * EXTENSIONLESS relative import — and a bare `tsc some/file.ts` emits exactly
 * that, right beside the source, because naming a file on the command line
 * makes tsc ignore the project tsconfig (and its `noEmit`).
 *
 * Bare `@ggd/shared/*` specifiers do NOT go that route: they resolve through
 * the package's `exports` map, which names the `.ts` file explicitly. So the
 * two routes load the SAME module twice, and the module-level singletons in
 * src/sim/content/registry.ts exist twice over — `registerAll()` fills one
 * copy while `Champions.get()` reads the other, empty one and throws
 * `content not registered: <id>`. That is a silent, confusing failure: the
 * content loads perfectly, it just lands in the wrong instance.
 *
 * Putting TypeScript ahead of JavaScript makes the source win both routes, so
 * a stray artifact can no longer split a singleton in half. The companion
 * guard is packages/shared/src/staleArtifacts.test.ts, which fails loudly if
 * such a file appears at all — it protects the dev-server and production build
 * paths, whose resolution this file deliberately leaves alone.
 */
export const RESOLVE_TS_FIRST = {
  extensions: [".mts", ".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
};
