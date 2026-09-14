import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HeroPackageTarget } from "@ggd/shared/content/import/heroPackage";
import type { EditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import type { ValidateInput, ValidateOutput } from "@ggd/shared/content/import/validatePackage";
import type { IconUploadPolicy } from "@ggd/shared/content/import/iconAssets";
import type { OverlayBundle } from "@ggd/shared/content/overlay";

export type HeroPackageJob = ({ kind: "build"; project?: unknown; target: HeroPackageTarget; sourcePackage?: unknown; iconPolicy?: IconUploadPolicy }
  | { kind: "validate"; input: Omit<ValidateInput, "heroCatalog" | "assetSha256"> }) & { overlay?: OverlayBundle; templateHistoryDir?: string; repoRoot?: string; canonicalTakeoverId?: string };

const require = createRequire(import.meta.url);
let active = 0;
/** Housekeeping must not evict a cache while a worker is building its package. */
export function heroPackageJobsIdle(): boolean { return active === 0; }
let bundledWorker: string | undefined;
/** Desktop builds ship a compiled worker; native Main keeps its TS entrypoint. */
export function setBundledHeroPackageWorker(path: string): void { bundledWorker = path; }
export class HeroWorkerUnavailable extends Error { readonly statusCode = 503; }

/**
 * ⭐ worker 的預算分兩段，⛔ 不是一個從 `new Worker` 起算的 20 秒。
 *
 * | 段 | 做什麼 | 預算 |
 * |---|---|---|
 * | 準備（可信） | 載入 worker、讀出貨樹、保存建包來源、overlay、模板 —— ⛔ 不碰送來的包 | `setupMs` |
 * | 編譯（送來的包） | 圖示正規化、上傳模型、編譯／SimWorld | `compileMs`（原本那 20 秒） |
 *
 * ⚠️ 為什麼要拆（2026-09-15 量到，⛔ 不是推測）：單獨跑一次建包 13.5 秒裡 **12.5 秒是準備段**
 * （tsx 載入 3.4 · 首次保存 1,168 份建包來源 7.4 · overlay 0.6 · 模板 1.2），
 * 真正在編譯送來的包只有約 1 秒。⇒ 負載一高（`ship:check` 全包並行）準備段就把 20 秒吃完，
 * 合法英雄回 503「英雄編譯／SimWorld 超過 20 秒」—— ⛔ 那句話在那一刻是假的。
 *
 * `setupMs` 的出處：`heroImportServer.ts` 的 `requestTimeout: 90000` − `compileMs` 20 秒 − 10 秒回應餘裕
 * ⇒ 60 秒；兩段加起來仍在私有匯入通道的請求逾時之內，逾時時回的是結構化 503。
 * ⚠️ 準備段的上限只防**卡死**（它不讀送來的位元組），⛔ 不是在限制送來的包。
 */
export const HERO_WORKER_BUDGET = Object.freeze({ setupMs: 60_000, compileMs: 20_000 });

/**
 * ⭐ 回頭開關（只有作者／CI 會轉 ⇒ 環境變數，⛔ 不進後台）：
 * `GGD_HERO_WORKER_BUDGET_SCOPE=whole-job` ⇒ 回到 2026-09-15 之前：一個 20 秒從起 worker 算到結果。
 * 預設 `untrusted`（編譯預算只算送來的包那一段）。⛔ 打錯字不靜默退回預設，直接擋下並指名變數。
 */
export type HeroWorkerBudget = { setupMs: number; compileMs: number; scope: "untrusted" | "whole-job" };
export function heroWorkerBudget(env: Record<string, string | undefined> = process.env): HeroWorkerBudget {
  const raw = env.GGD_HERO_WORKER_BUDGET_SCOPE?.trim();
  if (raw && raw !== "untrusted" && raw !== "whole-job") throw new HeroWorkerUnavailable(`GGD_HERO_WORKER_BUDGET_SCOPE 只接受 untrusted／whole-job，收到「${raw}」。`);
  return { ...HERO_WORKER_BUDGET, scope: raw === "whole-job" ? "whole-job" : "untrusted" };
}

type HeroWorkerMessage = { phase: "ready" } | { ok: boolean; result?: EditorImportPackage | ValidateOutput; message?: string };
export interface HeroWorkerLike {
  on(event: "message", listener: (message: HeroWorkerMessage) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "exit", listener: (code: number) => void): unknown;
}

/** 等 worker 的結果，照 {@link HeroWorkerBudget} 分段計時。 */
export function superviseHeroWorker(worker: HeroWorkerLike, budget: HeroWorkerBudget): Promise<EditorImportPackage | ValidateOutput> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined, ready = false;
    const arm = (ms: number, message: string) => { clearTimeout(timer); timer = setTimeout(() => reject(new HeroWorkerUnavailable(message)), ms); };
    const compile = () => arm(budget.compileMs, `英雄編譯／SimWorld 超過 ${budget.compileMs / 1000} 秒，已中止本次檢查。`);
    if (budget.scope === "whole-job") compile();
    else arm(budget.setupMs, `英雄檢查準備（讀取出貨內容、保存建包來源）超過 ${budget.setupMs / 1000} 秒，已中止本次檢查。`);
    const done = () => clearTimeout(timer);
    worker.once("error", (error) => { done(); reject(error); });
    worker.once("exit", (code) => { done(); reject(new HeroWorkerUnavailable(`英雄檢查程序中止（${code}）。`)); });
    worker.on("message", (message) => {
      if ("phase" in message) { if (!ready && budget.scope === "untrusted") compile(); ready = true; return; }
      done();
      // ⛔ 成功結果卻沒先回報準備完成 ⇒ 送來的包那一段根本沒被計時。擋下，⛔ 不靜默放行。
      if (message.ok && !ready) reject(new Error("英雄檢查程序未回報準備完成就交出結果，編譯預算沒有生效。"));
      else if (message.ok && message.result) resolve(message.result); else reject(new Error(message.message ?? "英雄檢查失敗。"));
    });
  });
}

export function runHeroPackageJob(root: string, job: Extract<HeroPackageJob, { kind: "build" }>, importDir?: string): Promise<EditorImportPackage>;
export function runHeroPackageJob(root: string, job: Extract<HeroPackageJob, { kind: "validate" }>, importDir?: string): Promise<ValidateOutput>;
export async function runHeroPackageJob(root: string, job: HeroPackageJob, importDir?: string): Promise<EditorImportPackage | ValidateOutput> {
  if (active >= 2) throw new HeroWorkerUnavailable("英雄檢查佇列已滿，請稍後重試。");
  const budget = heroWorkerBudget();
  active += 1;
  let worker: Worker | undefined;
  try {
  const moduleUrl = new URL("./heroPackageWorker.ts", import.meta.url).href;
  const limits = { maxOldGenerationSizeMb: 512, stackSizeMb: 8 };
  worker = bundledWorker ? new Worker(bundledWorker, { execArgv: [], resourceLimits: limits, workerData: { root, job, importDir } })
    : new Worker(`const { workerData, parentPort } = require("node:worker_threads");
    import(workerData.tsxApi).then(({ tsImport }) => tsImport(workerData.moduleUrl, { parentURL: workerData.moduleUrl, tsconfig: workerData.tsconfig }))
      .catch(error => parentPort.postMessage({ ok: false, message: String(error) }));`, {
    eval: true, execArgv: [], resourceLimits: limits,
    workerData: { root, job, importDir, moduleUrl, tsxApi: pathToFileURL(require.resolve("tsx/esm/api")).href, tsconfig: fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url)) },
  });
    return await superviseHeroWorker(worker, budget);
  } finally { try { await worker?.terminate(); } finally { active -= 1; } }
}
