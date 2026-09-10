import { createElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { mount, textOf } from "@ggd/shared/testkit/headlessUi";
import { shippedHeroCatalog } from "@ggd/shared/testkit/heroPackageFixture";
import type { TemplateDoc } from "@ggd/shared/content/schema/template";
import { heroBodyModelIds } from "@ggd/shared/content/heroForge/bodyModels";
import { COMMUNITY_HERO_EXAMPLES } from "@ggd/shared/content/heroForge/communityExamples";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "@ggd/shared/content/heroForge/communityLolBatch2";
import { createLocalDraft, draftFingerprint, type LocalDraft } from "../drafts/repository";
import { useHeroStore, type HeroDraftPayload } from "./store";

const state = vi.hoisted(() => ({ templates: [] as TemplateDoc[], modelIds: [] as string[], enqueue: vi.fn(), flush: vi.fn(async () => {}), download: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("./catalog", () => ({ useHeroCatalog: () => ({ data: { templates: state.templates, modelIds: state.modelIds } }) }));
vi.mock("../drafts/session", () => ({ autosave: { flush: state.flush }, enqueueDraft: state.enqueue }));
vi.mock("./packageClient", () => ({ downloadHeroFile: state.download, prepareHeroZip: vi.fn(), openHeroZip: vi.fn(), recoveredHeroModelDraft: vi.fn() }));
vi.mock("./HeroCommunityPanel", () => ({ HeroCommunityPanel: () => null }));
vi.mock("./HeroHandoffImportPanel", () => ({ HeroHandoffImportPanel: () => null }));
import { CommunityHeroExamples } from "./CommunityHeroExamples";
import { HeroPackagePanel } from "./HeroPackagePanel";

const catalog = shippedHeroCatalog();
const modelIds = heroBodyModelIds(catalog.documents);
state.templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
beforeEach(() => {
  vi.clearAllMocks(); state.flush.mockReset().mockResolvedValue(); state.modelIds = [...modelIds];
  useHeroStore.setState({ key: null, value: null, restored: false, past: [], future: [] });
});

it("keeps the original seven cards and exposes eleven candidates with their unresolved differences outside collapsed details", () => {
  const view = mount(createElement(CommunityHeroExamples, { onOpen: vi.fn() }));
  const old = view.hosts().find((node) => node.props["aria-label"] === "社群角色驗收範例")!;
  const candidates = view.hosts().find((node) => node.props["aria-label"] === "LoL 第四批可編輯草稿候選")!;
  for (const recipe of COMMUNITY_HERO_EXAMPLES) expect(textOf(old.children)).toContain(`建立${recipe.inspiration}改編作品`);
  expect(textOf(candidates.children)).toContain("核心機制尚未完成");
  expect(textOf(candidates.children)).toContain("尚未發布");
  for (const recipe of COMMUNITY_LOL_BATCH2_EXAMPLES) {
    expect(textOf(candidates.children)).toContain(`建立${recipe.inspiration}草稿候選`);
    for (const difference of recipe.adaptations) expect(textOf(candidates.children)).toContain(difference);
  }
  expect(view.hosts().filter((node) => node.type === "details")).toHaveLength(COMMUNITY_HERO_EXAMPLES.length);
});

it("creates all eleven independent candidates and preserves complete editable data through actual draft download, file import and reopening", async () => {
  const ids = new Set<string>();
  for (const recipe of COMMUNITY_LOL_BATCH2_EXAMPLES) {
    const onOpen = vi.fn<(draft: LocalDraft) => void>();
    const chooser = mount(createElement(CommunityHeroExamples, { onOpen }));
    chooser.click(`建立${recipe.inspiration}草稿候選`);
    expect(onOpen).not.toHaveBeenCalled();
    await chooser.flush();
    expect(onOpen, recipe.id).toHaveBeenCalledTimes(1);
    const created = onOpen.mock.calls[0]![0];
    const value = structuredClone(created.payload) as HeroDraftPayload;
    expect(value.project.presentation.modelKey).toBe(recipe.modelKey);
    expect(value.project.acceptedPlan!.templateVersions).not.toEqual({});
    ids.add(value.project.projectId);
    // Incomplete user text and ownership are draft data, not valid runtime content.
    value.rawInputs = { damage: { kind: "number", text: "1e-" } };
    value.mode = "advanced";
    value.project.sections.identity.fieldOwnership["brief.concept"] = "locked";
    const expectedProject = JSON.parse(JSON.stringify(value.project));
    const panel = mount(createElement(HeroPackagePanel, { value, valid: false }));
    const build = panel.hosts().find((node) => node.type === "button" && textOf(node.children) === "建立完整英雄 ZIP")!;
    expect(build.props.disabled).toBe(true);
    state.download.mockClear(); panel.click("下載草稿備份"); await panel.flush();
    expect(state.download).toHaveBeenCalledTimes(1);
    const [blob, name] = state.download.mock.calls[0] as [Blob, string];
    const saved = JSON.parse(await blob.text()) as LocalDraft;
    expect(saved.token).toBe(draftFingerprint(saved.payload));
    const fileInput = panel.hosts().find((node) => node.type === "input" && node.props.type === "file")!;
    (fileInput.props.onChange as (event: unknown) => void)({ target: { files: [new File([blob], name, { type: "application/json" })] }, currentTarget: { value: name } });
    await panel.flush();
    expect(panel.text(), recipe.id).toContain("已開啟為獨立本機副本");
    const imported = useHeroStore.getState();
    expect(imported.key).not.toBe(created.key);
    expect(imported.value!.project).toEqual(expectedProject);
    expect(imported.value!.rawInputs).toEqual(value.rawInputs);
    expect(imported.value!.mode).toBe(value.mode);
    expect(imported.value!.origin).toBe(value.origin);
    expect(imported.value!.submission).toBeUndefined();
    // Reopen the actual payload queued by the import handler, as My Works does.
    const [key, kind, payload] = state.enqueue.mock.calls.at(-1)! as [string, "hero", HeroDraftPayload];
    useHeroStore.getState().open(createLocalDraft(key, kind, payload.project.revision, payload));
    expect(useHeroStore.getState().value!.project).toEqual(expectedProject);
    expect(useHeroStore.getState().value!.rawInputs).toEqual(value.rawInputs);
  }
  expect(ids.size).toBe(COMMUNITY_LOL_BATCH2_EXAMPLES.length);
  expect(state.flush).toHaveBeenCalledTimes(COMMUNITY_LOL_BATCH2_EXAMPLES.length);
});

it("reports an unavailable catalog model while preserving the candidate reference and saves before opening", async () => {
  state.modelIds = [];
  const onOpen = vi.fn();
  const view = mount(createElement(CommunityHeroExamples, { onOpen }));
  expect(view.text()).toContain("模型目前不在可用目錄");
  state.flush.mockRejectedValueOnce(new Error("disk full"));
  view.click(`建立${COMMUNITY_LOL_BATCH2_EXAMPLES[0]!.inspiration}草稿候選`); await view.flush();
  expect(view.text()).toContain("disk full"); expect(onOpen).not.toHaveBeenCalled();
  const payload = state.enqueue.mock.calls[0]![2] as HeroDraftPayload;
  expect(payload.project.presentation.modelKey).toBe(COMMUNITY_LOL_BATCH2_EXAMPLES[0]!.modelKey);
});
