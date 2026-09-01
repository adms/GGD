import type { CollectionName } from "./content/schema/index";

/** Loopback-only desktop shell status. This is not a per-document write-authority contract. */
export const EDITOR_DESKTOP_SOURCE_SCHEMA = "ggd-editor-desktop-source@1" as const;

export interface EditorDesktopConflict {
  readonly collection: CollectionName;
  readonly id: string;
  readonly reason:
    | "both-modified"
    | "remote-added-local-added"
    | "remote-deleted-local-modified";
}

export interface EditorDesktopSourceInfo {
  readonly schema: typeof EDITOR_DESKTOP_SOURCE_SCHEMA;
  readonly kind: "local" | "remote";
  readonly state: "local" | "current" | "local-changes" | "merged-with-conflicts" | "offline-cache";
  readonly sourceUrl: string | null;
  readonly contentBaseUrl: string | null;
  readonly workspacePath: string;
  readonly pinnedContentVersion: string | null;
  readonly latestRemoteContentVersion: string | null;
  readonly workingContentVersion: string | null;
  readonly offline: boolean;
  readonly conflicts: readonly EditorDesktopConflict[];
  readonly compatibilityWarnings: readonly string[];
  readonly contractStatus: "local-content-api" | "remote-target-profile" | "static-content-only";
  readonly targetProfileDigest: string | null;
  readonly message: string;
}
