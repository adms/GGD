/** `worktree.mjs` 的型別 —— 守衛（TS）與 helper（JS）共用同一支實作。 */
export declare const LOCKED_SCRIPTS: string[];
export declare function sanitizeLane(name: string): string;
export declare function laneDir(repo: string, lane: string): string;
export declare function laneBranch(lane: string): string;
export declare function overlap(laneFiles: string[], mainDirty: string[]): string[];
export declare function mainRepo(cwd?: string): string;
export declare function escapedWorkspaceLinks(dir: string): string[];
export declare function parseArgs(argv: string[]): {
  cmd?: string;
  lane?: string;
  from?: string;
  force: boolean;
};
