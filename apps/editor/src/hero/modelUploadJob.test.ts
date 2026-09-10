import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runModelUploadJob } from "./modelUploadJob";
class TestWorker {
  static all: TestWorker[] = [];
  onmessage?: (e: { data: unknown }) => void;
  onerror?: (e: { message: string }) => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.all.push(this); }
}
const job = { kind: "inspect" as const, bytes: new Uint8Array(), assetKind: "model" as const };
const result = { summary: { sha256: "test", clips: [], meshes: 0, triangles: 0 }, warnings: [] };
beforeEach(() => { vi.useFakeTimers(); TestWorker.all = []; vi.stubGlobal("Worker", TestWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("allows a cold validator to finish after 20 seconds and terminates the completed worker", async () => {
  const promise = runModelUploadJob(job); const worker = TestWorker.all[0]!;
  await vi.advanceTimersByTimeAsync(25_000); expect(worker.terminate).not.toHaveBeenCalled();
  worker.onmessage!({ data: { result } }); expect(await promise).toEqual(result); expect(worker.terminate).toHaveBeenCalledOnce();
});
it("still bounds a stuck validator at 60 seconds and frees the concurrency slot", async () => {
  const promise = runModelUploadJob(job); const worker = TestWorker.all[0]!;
  const rejected = expect(promise).rejects.toThrow("60 秒");
  await vi.advanceTimersByTimeAsync(60_000); await rejected; expect(worker.terminate).toHaveBeenCalledOnce();
  const next = runModelUploadJob(job); TestWorker.all[1]!.onmessage!({ data: { result } }); expect(await next).toEqual(result);
});
