import {
  ContentLoader,
  HttpContentSource,
  registerAll,
  type LoadResult,
} from "@ggd/shared/content";
import { api } from "../api/client";
import { applyVfxRuntimeLimits, type EffectiveVfxLimits } from "../vfx-forge/runtimeLimits";
import { readEffectiveVfxLimits } from "../vfx-forge/targetProfileLimits";

export interface PreviewContentReady {
  contentVersion: string;
  warnings: number;
  quarantined: number;
  limits: EffectiveVfxLimits;
  limitsSource: "runtime-resolver" | "target-profile";
  limitWarnings: readonly string[];
}

let active: Promise<PreviewContentReady> | null = null;

/**
 * Load the same parsed/expanded/registered content graph used by the game.
 *
 * A raw champion plus a raw ability is not enough for a truthful SimWorld:
 * combo-family cadence, tier values, statuses, projectiles and model presets
 * live in other collections.  Keeping this as one shared promise also makes
 * React StrictMode unable to start two competing registry loads.
 */
export function ensurePreviewContentReady(): Promise<PreviewContentReady> {
  if (active) return active;
  active = new ContentLoader(new HttpContentSource({
    baseUrl: "/content-api",
    mode: "api",
    // Chromium's Window.fetch requires its receiver. HttpContentSource keeps
    // the callback as a member and invokes that member, so hand it a closure
    // instead of the bare host function (which throws "Illegal invocation").
    fetchFn: (input, init) => globalThis.fetch(input, init),
  }))
    .load({ policy: "fail-closed" })
    .then(async (result: LoadResult) => {
      registerAll(result.store);
      const desktopSource = await api.desktopSource();
      const remoteBaseIsCurrent = desktopSource?.kind === "remote"
        && (desktopSource.state === "current" || desktopSource.state === "offline-cache");
      const targetProfile = remoteBaseIsCurrent ? await api.desktopTargetProfile() : null;
      const advertisedLimits = readEffectiveVfxLimits(targetProfile);
      const limitWarnings: string[] = [];
      if (desktopSource?.kind === "remote" && !remoteBaseIsCurrent) {
        limitWarnings.push("工作副本已偏離遠端 Base；上限以目前本機 runtime resolver 為準");
      } else if (desktopSource?.kind === "remote" && !targetProfile) {
        limitWarnings.push("找不到 Desktop 驗證過的 target profile；上限以目前本機 runtime resolver 為準");
      } else if (desktopSource?.kind === "remote" && !advertisedLimits) {
        limitWarnings.push("正式站 target profile 尚未提供 effectiveVfxLimits；上限以目前本機 runtime resolver 為準");
      }
      return {
        contentVersion: result.manifest.contentVersion,
        warnings: result.warnings.length,
        quarantined: result.quarantined.length,
        limits: applyVfxRuntimeLimits(advertisedLimits),
        limitsSource: advertisedLimits ? "target-profile" as const : "runtime-resolver" as const,
        limitWarnings,
      };
    })
    .catch((error: unknown) => {
      active = null;
      throw error;
    });
  return active;
}
