import { createElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { mount } from "@ggd/shared/testkit/headlessUi";
import { shippedHeroCatalog } from "@ggd/shared/testkit/heroPackageFixture";
import type { TemplateDoc } from "@ggd/shared/content/schema/template";
import { COMMUNITY_ACQUIRED_HEROES, ACQUIRED_MODEL_OPTIONS } from "@ggd/shared/content/heroForge/communityAcquired";
import { AcquiredHeroExamples } from "./AcquiredHeroExamples";
import { saveHeroLocalCopy } from "./communityDrafts";
import { autosave, useDraftSession } from "../drafts/session";
const catalog = shippedHeroCatalog();
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("./catalog", () => ({ useHeroCatalog: () => ({ data: { templates: [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc), modelIds: Object.values(ACQUIRED_MODEL_OPTIONS).flat() } }) }));
vi.mock("./communityDrafts", () => ({ saveHeroLocalCopy: vi.fn((payload) => ({ key: payload.project.projectId, payload })) }));
vi.mock("../drafts/session", () => ({ autosave: { flush: vi.fn(async () => undefined) }, useDraftSession: { getState: vi.fn(() => ({ drafts: [] })) } }));
beforeEach(() => vi.clearAllMocks());

it("creates an independent selected model version and waits for durable save before opening", async () => {
  let finish!: () => void;
  vi.mocked(autosave.flush).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const onOpen = vi.fn(); const view = mount(createElement(AcquiredHeroExamples, { onOpen }));
  expect(view.hosts().filter((node) => node.type === "h3")).toHaveLength(34);
  const hero = COMMUNITY_ACQUIRED_HEROES.find((row) => row.id === "godie-hlgr")!;
  const select = view.hosts().find((node) => node.props["aria-label"] === `${hero.name}模型版本`)!;
  view.enter(select, "ou99.493659");
  view.click(`建立${hero.name}作品`);
  expect(onOpen).not.toHaveBeenCalled();
  finish(); await view.flush();
  const first = vi.mocked(saveHeroLocalCopy).mock.calls[0]![0];
  expect(first.project.projectId).toBe("godie-hlgr");
  expect(first.project.presentation.modelKey).toBe("ou99.493659");
  expect(hero.modelKey).toBe("ou99.472273");
  expect(onOpen).toHaveBeenCalledTimes(1);
  const another = COMMUNITY_ACQUIRED_HEROES.find((row) => row.id === "godie-eevi")!;
  view.click(`建立${another.name}作品`); await view.flush();
  const second = vi.mocked(saveHeroLocalCopy).mock.calls[1]![0];
  expect(second.project.projectId).not.toBe(first.project.projectId);
  expect(second.project.presentation.modelKey).toBe("ou99.470351");
});

it("uses an explicit versioned proxy when the acquired native source has no usable actions", async () => {
  const onOpen = vi.fn(); const view = mount(createElement(AcquiredHeroExamples, { onOpen }));
  const hero = COMMUNITY_ACQUIRED_HEROES.find((row) => row.id === "acquired-zero")!;
  view.click(`建立${hero.name}作品`); await view.flush();
  const project = vi.mocked(saveHeroLocalCopy).mock.calls[0]![0].project;
  expect(project.presentation.modelKey).toBe("imported.herosephiroth");
  expect(project.brief.concept).toContain("目前使用已核准 GGD 替代模型");
  expect(project.brief.concept).toContain("之後以獨立模型版本替換");
  expect(view.text()).toContain("本尊來源缺可用六動作");
  expect(onOpen).toHaveBeenCalledTimes(1);
});


it("opens the existing canonical draft without replacing its model, edits or cloud revision", async () => {
  const existing = { key: "hero/godie-hlgr/saved", kind: "hero", updatedAt: 10, payload: { project: { projectId: "godie-hlgr", revision: 9 }, cloud: { revision: 7 } } };
  vi.mocked(useDraftSession.getState).mockReturnValueOnce({ drafts: [existing] } as never);
  const onOpen = vi.fn(); const view = mount(createElement(AcquiredHeroExamples, { onOpen }));
  view.click("建立鋼彈作品"); await view.flush();
  expect(saveHeroLocalCopy).not.toHaveBeenCalled();
  expect(onOpen).toHaveBeenCalledWith(existing);
});
