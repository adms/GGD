import type { ModelDoc } from "@ggd/shared/content/schema/model";
import type { UploadClip } from "@ggd/shared/content/modelUpload/inspect";
import type { HeroModelSelections, UploadedHeroModel } from "@ggd/shared/content/modelUpload/heroModelSchema";

export type ModelUploadJob = { kind: "inspect"; bytes: Uint8Array; assetKind: "model" | "animations" }
  | { kind: "merge"; bytes: Uint8Array; library: Uint8Array; selected: number[] }
  | { kind: "prepare"; bytes: Uint8Array; selections: HeroModelSelections; yawOffsetDeg: number }
  | { kind: "verify"; bytes: Uint8Array; model: UploadedHeroModel };
export interface ModelUploadSummary { sha256: string; clips: UploadClip[]; meshes: number; triangles: number }
export interface ModelUploadResult { summary: ModelUploadSummary; bytes?: Uint8Array; model?: UploadedHeroModel; document?: ModelDoc; warnings: string[] }

let active = 0;
export async function runModelUploadJob(job: ModelUploadJob, signal?: AbortSignal): Promise<ModelUploadResult> {
  if (active >= 2) throw new Error("模型檢查正在進行，請稍後再試。");
  if (signal?.aborted) throw new Error("模型處理已取消。");
  active++;
  let worker: Worker | undefined;
  try {
    worker = new Worker(new URL("./modelUpload.worker.ts", import.meta.url), { type: "module" });
    const instance = worker;
    return await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", aborted); };
      const aborted = () => { cleanup(); reject(new Error("模型處理已取消。")); };
      const timer = setTimeout(() => { cleanup(); reject(new Error("模型檢查未在 60 秒內完成（包含檢查器載入），請確認本機服務後重試。")); }, 60_000);
      signal?.addEventListener("abort", aborted, { once: true });
      instance.onerror = (event) => { cleanup(); reject(new Error(event.message || "模型處理程序失敗。")); };
      instance.onmessage = (event: MessageEvent<{ result?: ModelUploadResult; error?: string }>) => {
        cleanup(); if (event.data.result) resolve(event.data.result); else reject(new Error(event.data.error || "模型檢查未完成。"));
      };
      try { instance.postMessage(job); } catch (error) { cleanup(); reject(error); }
    });
  } finally { worker?.terminate(); active--; }
}
