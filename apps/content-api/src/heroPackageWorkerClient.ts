import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HeroPackageTarget } from "@ggd/shared/content/import/heroPackage";
import type { EditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import type { ValidateInput, ValidateOutput } from "@ggd/shared/content/import/validatePackage";
import type { IconUploadPolicy } from "@ggd/shared/content/import/iconAssets";

export type HeroPackageJob = { kind: "build"; project?: unknown; target: HeroPackageTarget; sourcePackage?: unknown; iconPolicy?: IconUploadPolicy }
  | { kind: "validate"; input: Omit<ValidateInput, "heroCatalog" | "assetSha256"> };

const require = createRequire(import.meta.url);
let active = 0;
let bundledWorker: string | undefined;
/** Desktop builds ship a compiled worker; native Main keeps its TS entrypoint. */
export function setBundledHeroPackageWorker(path: string): void { bundledWorker = path; }
export class HeroWorkerUnavailable extends Error { readonly statusCode = 503; }

export function runHeroPackageJob(root: string, job: Extract<HeroPackageJob, { kind: "build" }>, importDir?: string): Promise<EditorImportPackage>;
export function runHeroPackageJob(root: string, job: Extract<HeroPackageJob, { kind: "validate" }>, importDir?: string): Promise<ValidateOutput>;
export async function runHeroPackageJob(root: string, job: HeroPackageJob, importDir?: string): Promise<EditorImportPackage | ValidateOutput> {
  if (active >= 2) throw new HeroWorkerUnavailable("英雄檢查佇列已滿，請稍後重試。");
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
    const running = worker;
    return await new Promise<EditorImportPackage | ValidateOutput>((resolve, reject) => {
      const timer = setTimeout(() => reject(new HeroWorkerUnavailable("英雄編譯／SimWorld 超過 20 秒，已中止本次檢查。")), 20_000);
      const done = () => clearTimeout(timer);
      running.once("error", (error) => { done(); reject(error); });
      running.once("exit", (code) => { done(); reject(new HeroWorkerUnavailable(`英雄檢查程序中止（${code}）。`)); });
      running.once("message", (message: { ok: boolean; result?: EditorImportPackage | ValidateOutput; message?: string }) => {
        done(); if (message.ok && message.result) resolve(message.result); else reject(new Error(message.message ?? "英雄檢查失敗。"));
      });
    });
  } finally { try { await worker?.terminate(); } finally { active -= 1; } }
}
