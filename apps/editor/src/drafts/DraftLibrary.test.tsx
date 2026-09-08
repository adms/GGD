import { createElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { mount } from "@ggd/shared/testkit/headlessUi";
import { createLocalDraft, type LocalDraft } from "./repository";
import { createHeroProject } from "../hero/projectModel";
const state = vi.hoisted(() => ({ drafts: [] as LocalDraft[], enqueue: vi.fn(), flush: vi.fn(async () => {}) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("./session", () => ({
  useDraftSession: () => ({ drafts: state.drafts, recoveries: [], status: { phase: "idle" } }),
  documentPayload: () => null, autosave: { flush: state.flush }, enqueueDraft: state.enqueue, recoverDraft: vi.fn(), reportDraftError: vi.fn(), restoreDocumentDraft: vi.fn(), saveDraftCopy: vi.fn(),
}));
vi.mock("../store", () => ({ useEditorStore: () => ({ restoredDraft: false, draftKey: null }) }));
vi.mock("./CloudHeroLibrary", () => ({ CloudHeroLibrary: () => null }));
vi.mock("../hero/CommunityHeroExamples", () => ({ CommunityHeroExamples: () => null }));
import { DraftLibrary } from "./DraftLibrary";
beforeEach(() => { state.enqueue.mockClear(); state.flush.mockReset().mockResolvedValue(); });

it("shows unknown future heroes as read-only and never passes them to the editor", () => {
  const payload = { project: { schema: "ggd-hero-project@99", brief: { name: "新版英雄", concept: "完整原文\n「原稿不能回寫。」\n" }, futureFields: { untouched: [1, 2, 3] } } };
  const draft = createLocalDraft("hero/future", "hero", 4, payload); state.drafts = [draft];
  const open = vi.fn(); const view = mount(createElement(DraftLibrary, { onOpenDocument: vi.fn(), onOpenHero: open }));
  expect(view.text()).toContain("ggd-hero-project@99"); expect(view.text()).toContain("唯讀檢視原稿"); expect(view.text()).toContain("futureFields");
  expect(view.hosts().some((node) => node.type === "button" && node.children.includes("繼續編輯"))).toBe(false);
  expect(open).not.toHaveBeenCalled(); expect(draft.payload).toEqual(payload);
  expect(view.hosts().some((node) => node.type === "button" && node.children.includes("複製為新作品"))).toBe(false);
});

it("copies an unfinished local hero with its full text and locks, then durably saves before reporting success", async () => {
  const project = createHeroProject("hero-original"); project.brief.concept = "完整原文\n「不要刪掉這句。」\n";
  project.sections.identity.fieldOwnership = { "brief.concept": "locked" };
  const payload = { project, rawInputs: { damage: { text: "1e-", kind: "number" } }, mode: "advanced", origin: "鬥士", cloud: { accountId: "alice", revision: 7 }, submission: { id: "old-candidate" } };
  const draft = createLocalDraft("hero/original", "hero", 1, payload); state.drafts = [draft];
  const open = vi.fn(); const view = mount(createElement(DraftLibrary, { onOpenDocument: vi.fn(), onOpenHero: open }));
  view.click("複製為新作品"); await view.flush();
  expect(state.enqueue).toHaveBeenCalledTimes(1); const [key, kind, copy] = state.enqueue.mock.calls[0]!;
  expect(kind).toBe("hero"); expect(key).toBe(`hero/${copy.project.projectId}`); expect(copy.project.projectId).not.toBe(project.projectId);
  expect(copy.rawInputs).toEqual(payload.rawInputs); expect(copy.project.brief).toEqual(project.brief); expect(copy.project.sections.identity.fieldOwnership).toEqual(project.sections.identity.fieldOwnership);
  expect(copy.cloud).toBeUndefined(); expect(copy.submission).toBeUndefined(); expect(state.flush).toHaveBeenCalledTimes(2);
  expect(view.text()).toContain("已建立新的本機英雄作品"); expect(open).not.toHaveBeenCalled(); expect(draft.payload).toEqual(payload);
});

it("preserves the source and reports a save failure instead of claiming a copied work is durable", async () => {
  const draft = createLocalDraft("hero/original", "hero", 1, { project: createHeroProject("hero-original"), rawInputs: {}, mode: "quick", origin: "鬥士" }); state.drafts = [draft];
  state.flush.mockResolvedValueOnce().mockRejectedValueOnce(new Error("disk full"));
  const open = vi.fn(); const view = mount(createElement(DraftLibrary, { onOpenDocument: vi.fn(), onOpenHero: open }));
  view.click("複製為新作品"); await view.flush();
  expect(view.text()).toContain("複製未完成，原稿仍保留"); expect(view.text()).toContain("disk full"); expect(view.text()).not.toContain("已建立新的本機英雄作品"); expect(open).not.toHaveBeenCalled();
});

it("reports a failed known-version open without replacing or discarding the library draft", () => {
  const draft = createLocalDraft("hero/broken", "hero", 1, { project: createHeroProject("broken") }); state.drafts = [draft];
  const view = mount(createElement(DraftLibrary, { onOpenDocument: vi.fn(), onOpenHero: () => { throw new Error("migration failed"); } }));
  expect(() => view.click("繼續編輯")).not.toThrow(); expect(view.text()).toContain("原稿仍保留"); expect(view.text()).toContain("migration failed");
  expect(state.drafts).toEqual([draft]);
});
