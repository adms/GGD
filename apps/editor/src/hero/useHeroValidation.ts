import { useEffect, useRef, useState } from "react";
import type { HeroProject } from "@ggd/shared/content";
import type { HeroCatalog } from "./catalog";
import type { HeroValidationResult } from "./validation";

export function useHeroValidation(project: HeroProject | null, catalog: HeroCatalog, hasInvalidInput: boolean) {
  const worker = useRef<Worker>();
  const request = useRef(0);
  const [result, setResult] = useState<HeroValidationResult | null>(null);
  const [preview, setPreview] = useState<HeroValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const instance = new Worker(new URL("./heroValidation.worker.ts", import.meta.url), { type: "module" });
    worker.current = instance;
    instance.onmessage = (event: MessageEvent<{ request: number; result: HeroValidationResult }>) => {
      if (event.data.request === request.current) {
        setResult(event.data.result); setError(null);
        if (event.data.result.compiled) setPreview(event.data.result);
      }
    };
    instance.onerror = (event) => { setError(event.message || "背景驗證失敗，請重新開啟作品。"); setResult(null); };
    return () => { instance.terminate(); worker.current = undefined; };
  }, []);
  useEffect(() => {
    const id = ++request.current;
    setResult(null);
    if (!project?.acceptedPlan || hasInvalidInput) return;
    const timer = setTimeout(() => worker.current?.postMessage({ request: id, project, catalog }), 300);
    return () => clearTimeout(timer);
  }, [project, catalog, hasInvalidInput]);
  return { result: result?.revision === project?.revision ? result : null,
    preview: preview?.compiled?.champion.id === project?.projectId ? preview : null, error };
}
