import { createLocalDraft, DraftConflictError, type DraftRepository, type LocalDraft } from "./repository";

export interface AutosaveStatus {
  phase: "idle" | "pending" | "saving" | "saved" | "error" | "conflict";
  key?: string;
  revision?: number;
  message?: string;
}

/** Serializes writes and keeps edits made while a save is in flight. */
export class DraftAutosave {
  private readonly pending = new Map<string, LocalDraft>();
  private readonly tokens = new Map<string, string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  constructor(private readonly repository: DraftRepository, private readonly status: (value: AutosaveStatus) => void, private intervalMs: number) {}

  hydrate(drafts: readonly LocalDraft[]): void { for (const draft of drafts) this.tokens.set(draft.key, draft.token); }
  setInterval(ms: number): void { this.intervalMs = ms; }
  get unsaved(): boolean { return this.pending.size > 0 || this.running !== null; }
  forget(key: string): void { this.pending.delete(key); }

  enqueue(key: string, kind: LocalDraft["kind"], revision: number, payload: unknown): void {
    const draft = createLocalDraft(key, kind, revision, payload);
    if (this.tokens.get(key) === draft.token && !this.pending.has(key)) return;
    this.pending.set(key, draft);
    this.status({ phase: "pending", key, revision });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => undefined); }, this.intervalMs);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (this.pending.size === 0) return Promise.resolve();
    const task = this.drain();
    this.running = task;
    void task.finally(() => { if (this.running === task) this.running = null; }).catch(() => undefined);
    return task;
  }

  private async drain(): Promise<void> {
    for (const [key, draft] of this.pending) {
      this.status({ phase: "saving", key, revision: draft.revision });
      try {
        await this.repository.put(draft, this.tokens.get(key) ?? null);
        this.tokens.set(key, draft.token);
        if (this.pending.get(key) === draft) this.pending.delete(key);
        else { await this.drain(); return; }
      } catch (error) {
        this.status({ phase: error instanceof DraftConflictError ? "conflict" : "error", key,
          message: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    this.status({ phase: "saved" });
  }

  beforeUnload(event: BeforeUnloadEvent): void {
    if (!this.unsaved) return;
    event.preventDefault();
    event.returnValue = "";
    void this.flush().catch(() => undefined);
  }
}
