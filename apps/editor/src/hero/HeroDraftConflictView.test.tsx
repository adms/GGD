import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { mount } from "@ggd/shared/testkit/headlessUi";
import type { HeroWork } from "@ggd/shared/content/communityHero";
import { createHeroProject } from "./projectModel";
import type { HeroDraftPayload } from "./store";
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
vi.mock("./draftAssets", async (original) => ({ ...await original<typeof import("./draftAssets")>(), heroTransferDraft: async (value: HeroDraftPayload) => ({ ...value, originalIcons: [], normalizedIcons: [] }) }));
import { compareHeroDrafts, HeroDraftComparison, HeroDraftConflictView } from "./HeroDraftConflictView";

function fixture() {
  const local: HeroDraftPayload = { project: createHeroProject("hero-conflict-ui"), rawInputs: {}, mode: "quick", origin: "鬥士" };
  local.project.brief.concept = "第一行\n「完整對白、幽默與標點！」\n最後一行\n";
  const draft = structuredClone(local); draft.project.brief.concept = "遠端的另一段完整原文\n";
  const remote: HeroWork = { schema: "ggd-hero-work@1", id: local.project.projectId, ownerId: "owner", draftRevision: 7, draftDigest: `sha256:${"a".repeat(64)}`, draft, createdAt: "2026-09-06T00:00:00Z", updatedAt: "2026-09-06T00:00:00Z" };
  return { local, remote };
}

it("compares full author text and raw edits while ignoring sync and submission receipts", async () => {
  const { local, remote } = fixture();
  local.cloud = { accountId: "owner", revision: 2 }; local.submission = { operationId: "old", packageDigest: "digest", allowAttributionRemix: false };
  const differences = compareHeroDrafts(local, remote.draft);
  expect(differences).toEqual([{ path: "project.brief.concept", local: local.project.brief.concept, remote: (remote.draft as HeroDraftPayload).project.brief.concept }]);
  const choose = vi.fn();
  const view = mount(createElement(HeroDraftConflictView, { local, remote, busy: false, onChoose: choose })); await view.flush();
  expect(view.text()).toContain(local.project.brief.concept); expect(view.text()).toContain((remote.draft as HeroDraftPayload).project.brief.concept);
  expect(view.text()).toContain("雲端第 7 版");
  for (const label of ["採本機並同步", "採遠端並開啟", "本機另存新作"]) view.click(label);
  expect(choose.mock.calls).toEqual([["local"], ["remote"], ["new-work"]]);
});

it("compares a frozen submission read-only without offering conflict overwrite actions", async () => {
  const { local, remote } = fixture();
  const view = mount(createElement(HeroDraftComparison, { local, remote: remote.draft, remoteLabel: "固定投稿" })); await view.flush();
  expect(view.text()).toContain("固定投稿"); expect(view.text()).toContain(local.project.brief.concept); expect(view.text()).toContain((remote.draft as HeroDraftPayload).project.brief.concept);
  expect(view.hosts().filter((node) => node.type === "button")).toHaveLength(0);
});

it("paginates every difference without dropping late incomplete inputs", async () => {
  const { local, remote } = fixture();
  for (let index = 0; index < 120; index++) local.rawInputs[`field${String(index).padStart(3, "0")}`] = { kind: "number", text: `${index}e-` };
  const view = mount(createElement(HeroDraftConflictView, { local, remote, busy: true, onChoose: vi.fn() })); await view.flush();
  expect(view.text()).toContain("共 121 個欄位不同");
  view.click("下一頁差異"); view.click("下一頁差異");
  expect(view.text()).toContain("119e-"); expect(view.text()).toContain("第 3／3 頁");
  expect(view.hosts().filter((node) => node.type === "button" && node.props.disabled === true)).toHaveLength(4);
});
