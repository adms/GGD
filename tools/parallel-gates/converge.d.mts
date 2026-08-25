/**
 * 型別門面給 `converge.mjs`（GH#710）—— 讓 `syncConverges.test.ts` 可以**跑真的那一支**，
 * ⛔ 而不是在測試裡重抄一份迴圈（失敗形態⑤：被測的不是出貨的那個）。
 */
export declare const DEFAULT_MAX_ROUNDS: number;

export declare function staleStepsFrom(out: string): string[];

export interface ConvergeRun {
  code: number;
  out: string;
}

export interface ConvergeResult {
  converged: boolean;
  rounds: number;
  stale: string[];
  reason: string;
}

export declare function converge(io: {
  runSync: (round: number) => Promise<ConvergeRun>;
  runCheck: (round: number) => Promise<ConvergeRun>;
  maxRounds?: number;
  log?: (s: string) => void;
}): Promise<ConvergeResult>;
