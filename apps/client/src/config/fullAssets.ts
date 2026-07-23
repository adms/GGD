/**
 * fullAssetsEnabled — THE build-time switch that decides whether this client
 * bundle ever ASKS for the local-only asset overlay. Task #176.
 *
 * THIS IS THE LAYER EVERYONE MISSES, so it gets the long comment.
 *
 * Two consumers gate on it: the Blizzard-overlay champion-model resolver
 * (render/views/blizzardOverlay.ts) and the champion-voice fallback
 * (audio/championVoice.ts). Both used to read `import.meta.env.DEV` directly.
 * In a `vite build` bundle — which is exactly what docker/edge.Dockerfile bakes
 * — that constant-folds to `false`, and the folded shape is visible in the
 * shipped file: `function LJ(){try{return!1}catch{return!1}}`.
 *
 * The consequence is not "the assets 404". It is that THE REQUEST IS NEVER
 * MADE. You can mount all 84 MB of data/blizzard-overlay into the edge, open
 * the nginx location, verify with curl that every byte is served — and the game
 * still shows 40 of 113 champions as one of four generic KayKit stand-ins with
 * no voice, because the client decided at BUILD time that it was a production
 * bundle and therefore had no overlay to look for. Nothing is logged. The
 * owner on localhost (a dev server, DEV=true) sees the right models; a family
 * member on the deployed build does not; neither can tell the builds differ.
 *
 * So the switch is now explicit and independent of the build mode:
 *
 *   VITE_GGD_FULL_ASSETS=1   → full assets, in a production bundle
 *   VITE_GGD_FULL_ASSETS=0   → no overlay, even in a dev server
 *   unset                    → import.meta.env.DEV (today's behaviour, exactly)
 *
 * The family edge image is built with VITE_GGD_FULL_ASSETS=1
 * (docker/compose.family.yaml passes it as a build arg). Nothing about local
 * development changes: unset still means DEV.
 *
 * WHY NOT READ THE TIER AT RUNTIME (fetch /api/v1/config and decide)? Because
 * the failure mode being fixed is silence, and a runtime probe adds a third
 * thing that can quietly answer "no". A build flag is inspectable: `grep -c
 * blizzard-local dist/assets/*.js` on the built bundle either finds the string
 * or does not, before anything is deployed.
 *
 * The guarded try/catch shape is deliberate and is the repo's convention
 * (see codexEditGate.test.ts): these modules are imported by vitest under plain
 * node, where `import.meta.env` does not exist and a bare access throws.
 */

/** Raw `import.meta.env.<key>`, or undefined outside a vite bundle. */
function viteEnv(key: string): string | boolean | undefined {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> })
      .env;
    return env?.[key];
  } catch {
    return undefined;
  }
}

/** Parse a vite env value that may arrive as a string or a real boolean. */
function truthy(v: string | boolean | undefined): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "on") return true;
  if (s === "0" || s === "false" || s === "no" || s === "off") return false;
  return undefined;
}

/**
 * The env var name, exported so build tooling and tests refer to one string.
 * Must start with `VITE_` or vite will not expose it to the bundle at all.
 */
export const FULL_ASSETS_ENV = "VITE_GGD_FULL_ASSETS";

/**
 * Should this bundle request the local-only asset overlay?
 *
 * Pure and injectable so the three-way decision is unit-testable without a
 * build; the no-argument call is what production code uses.
 */
export function resolveFullAssets(
  explicit: string | boolean | undefined,
  devBuild: boolean | undefined,
): boolean {
  const t = truthy(explicit);
  if (t !== undefined) return t;
  return Boolean(devBuild);
}

/** True when this bundle should probe and use the full local asset overlay. */
export function fullAssetsEnabled(): boolean {
  return resolveFullAssets(viteEnv(FULL_ASSETS_ENV), Boolean(viteEnv("DEV")));
}
