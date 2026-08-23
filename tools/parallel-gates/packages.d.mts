/** `packages.mjs` 的型別 —— 守衛（TS）與 `ship.mjs`（JS）共用同一支實作。 */
export declare function packagesWithVitest(repo: string): string[];
export declare function suitesForPaths(
  paths: string[],
  repo: string,
): { suites: string[] | null; extras: string[]; why: string };
