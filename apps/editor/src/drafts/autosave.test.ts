import { afterEach, describe, expect, it, vi } from "vitest";
import { DraftAutosave, type AutosaveStatus } from "./autosave";
import { createLocalDraft, DraftConflictError, type DraftRepository, type LocalDraft } from "./repository";

function memoryRepository(): DraftRepository & { rows: Map<string, LocalDraft> } {
  const rows = new Map<string, LocalDraft>();
  return { rows, list: async () => [...rows.values()], get: async (key) => rows.get(key) ?? null,
    async put(draft, token) {
      const previous = rows.get(draft.key);
      if (previous && previous.token !== token) throw new DraftConflictError(previous);
      rows.set(draft.key, structuredClone(draft));
    },
  };
}
afterEach(() => vi.useRealTimers());

describe("durable draft autosave", () => {
  it("waits for commit, drains edits during a write, and reopens invalid raw input losslessly", async () => {
    vi.useFakeTimers();
    const repository = memoryRepository();
    const originalPut = repository.put;
    let commit!: () => void;
    repository.put = async (draft, token) => { await new Promise<void>((resolve) => { commit = resolve; }); await originalPut(draft, token); };
    const statuses: AutosaveStatus[] = [];
    const saver = new DraftAutosave(repository, (status) => statuses.push(status), 500);
    saver.enqueue("hero/a", "hero", 1, { concept: "「原文」\n尚未填完", slots: { Q: { cooldown: "1e" } } });
    const writing = saver.flush();
    expect(statuses.at(-1)?.phase).toBe("saving");
    expect(saver.unsaved).toBe(true);
    saver.enqueue("hero/a", "hero", 2, { rawJson: "{\n  \"template\":", overrides: [null, undefined, Number.NaN], dialogue: "\n整段原文\n" });
    repository.put = originalPut;
    commit(); await writing;
    const reopened = await repository.get("hero/a");
    expect(reopened?.payload).toEqual({ rawJson: "{\n  \"template\":", overrides: [null, undefined, Number.NaN], dialogue: "\n整段原文\n" });
    expect(reopened?.revision).toBe(2);
    expect(saver.unsaved).toBe(false);
    expect(statuses.at(-1)?.phase).toBe("saved");
  });

  it("keeps failed writes pending and does not overwrite another window's winner", async () => {
    vi.useFakeTimers();
    const repo = memoryRepository();
    const initial = createLocalDraft("a", "hero", 1, { text: "初稿" }); await repo.put(initial, null);
    const saver = new DraftAutosave(repo, () => {}, 500); saver.hydrate([initial]);
    const winner = createLocalDraft("a", "hero", 2, { text: "另一視窗" }); await repo.put(winner, initial.token);
    saver.enqueue("a", "hero", 2, { text: "我的修改" });
    await expect(saver.flush()).rejects.toBeInstanceOf(DraftConflictError);
    expect(await repo.get("a")).toEqual(winner);
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    saver.beforeUnload(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(saver.unsaved).toBe(true);
  });
});
