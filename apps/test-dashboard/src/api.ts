/** Thin fetch/SSE client for the testrunner REST API. */
import type { CoverageMatrix, RunnerEvent, RunSnapshot, SuitesResponse } from "./types";

export const RUNNER_URL: string =
  (import.meta.env?.VITE_RUNNER_URL as string | undefined) ?? "http://127.0.0.1:8799";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RUNNER_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* keep status text */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  suites: () => req<SuitesResponse>("/api/suites"),
  coverage: () => req<CoverageMatrix>("/api/coverage"),
  getRun: (id: string) => req<RunSnapshot>(`/api/runs/${id}`),
  createRun: (body: { mode: string; category?: string; suiteId?: string; stepped?: boolean }) =>
    req<RunSnapshot>("/api/runs", { method: "POST", body: JSON.stringify(body) }),
  next: (id: string) => req<unknown>(`/api/runs/${id}/next`, { method: "POST", body: "{}" }),
  cancel: (id: string) => req<unknown>(`/api/runs/${id}/cancel`, { method: "POST", body: "{}" }),
  rerunFailed: (id: string) =>
    req<RunSnapshot>(`/api/runs/${id}/rerun-failed`, { method: "POST", body: "{}" }),
};

/** Subscribe to a run's SSE stream; returns an unsubscribe fn. */
export function subscribeRunEvents(
  runId: string,
  onEvent: (ev: RunnerEvent) => void,
  onError?: (e: Event) => void,
): () => void {
  const es = new EventSource(`${RUNNER_URL}/api/runs/${runId}/events`);
  const handle = (msg: MessageEvent) => {
    try {
      onEvent(JSON.parse(msg.data as string) as RunnerEvent);
    } catch {
      /* ignore malformed frames */
    }
  };
  for (const type of ["suite-start", "line", "suite-end", "run-end"]) {
    es.addEventListener(type, handle as EventListener);
  }
  es.onerror = (e) => {
    onError?.(e);
    // run-end closes the server side; EventSource auto-reconnect would 404
    // spam once the stream is done, so close on error after completion.
  };
  return () => es.close();
}
