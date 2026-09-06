import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HeroWork } from "@ggd/shared/content/communityHero";
import type { LocalIconKey, StagedLocalIcon } from "../local-icons/model";
import { stageLocalIcon } from "../local-icons/model";
import { ApiError } from "../../../admin/src/session";
import { createHeroProject } from "./projectModel";
import { useHeroStore, type HeroDraftPayload } from "./store";
import { heroPlatform, useHeroAccount } from "./communitySession";
import { copyHeroDraftAsNew, resolveHeroDraftConflict } from "./conflictResolution";
import { syncHeroDraft } from "./communityDrafts";

type Row = { key: string; payload: HeroDraftPayload };
const io = vi.hoisted(() => ({ pending: [] as Row[], stored: [] as Row[], flush: vi.fn<() => Promise<void>>(), icons: new Map<string, StagedLocalIcon>() }));
vi.mock("../drafts/session", () => ({ enqueueDraft: (key: string, _kind: string, payload: HeroDraftPayload) => io.pending.push({ key, payload: structuredClone(payload) }), autosave: { flush: () => io.flush() } }));
vi.mock("../local-icons/storage", () => ({
  getStagedLocalIcon: async (key: LocalIconKey) => [...io.icons.values()].find((icon) => icon.kind === key.kind && icon.docId === key.docId) ?? null,
  getStagedLocalIconVersion: async (key: LocalIconKey, hash: string) => io.icons.get(`${key.kind}/${key.docId}/${hash}`) ?? null,
  putStagedLocalIconVersion: async (icon: StagedLocalIcon) => { io.icons.set(`${icon.kind}/${icon.docId}/${icon.contentSha256}`, icon); },
  getNormalizedIcon: async () => null, rememberNormalizedIcon: async () => {},
}));

function fixture() {
  const local: HeroDraftPayload = { project: createHeroProject("hero-conflict"), rawInputs: { "brief.name": { kind: "number", text: "1e-" } }, mode: "advanced", origin: "鬥士", cloud: { accountId: "owner-a", revision: 2 }, submission: { id: "submission-old", operationId: "op-old", packageDigest: "old", allowAttributionRemix: false } };
  local.project.brief.concept = "本機完整原文\n「不要刪掉這句。」\n";
  local.project.sections.identity.fieldOwnership = { "brief.concept": "locked" };
  const draft = structuredClone(local); draft.project.brief.concept = "遠端原文\n另一個分行";
  const remote: HeroWork = { schema: "ggd-hero-work@1", id: local.project.projectId, ownerId: "owner-a", draftRevision: 7, draftDigest: `sha256:${"a".repeat(64)}`, draft, createdAt: "2026-09-06T00:00:00Z", updatedAt: "2026-09-06T00:00:00Z" };
  useHeroAccount.setState({ account: { id: "owner-a", username: "author" }, ready: true });
  useHeroStore.setState({ key: "hero/working", value: local, past: [], future: [] });
  return { local, remote };
}
beforeEach(() => {
  vi.restoreAllMocks(); io.pending.length = 0; io.stored.length = 0; io.icons.clear(); io.flush.mockReset();
  io.flush.mockImplementation(async () => { io.stored.push(...io.pending.splice(0)); });
});

describe("explicit cloud draft conflict resolution", () => {
  it("persists both compared sides before adopting local and uses the compared revision once", async () => {
    const { local, remote } = fixture();
    const request = vi.spyOn(heroPlatform, "request").mockImplementation(async (_path, options) => {
      expect(io.stored.map((row) => row.payload.project.brief.concept)).toContain(local.project.brief.concept);
      expect(io.stored.map((row) => row.payload.project.brief.concept)).toContain((remote.draft as HeroDraftPayload).project.brief.concept);
      expect(options?.body).toMatchObject({ workId: remote.id, expectedRevision: 7, payload: { rawInputs: local.rawInputs, project: { brief: local.project.brief } } });
      return { ...remote, draftRevision: 8 } as never;
    });
    await resolveHeroDraftConflict(remote, "owner-a", "local");
    expect(request).toHaveBeenCalledTimes(1);
    expect(useHeroStore.getState().value).toMatchObject({ project: { brief: local.project.brief }, cloud: { accountId: "owner-a", revision: 8 } });
    expect((remote.draft as HeroDraftPayload).project.brief.concept).toBe("遠端原文\n另一個分行");
  });
  it("opens a durable remote copy and leaves local raw input and locks in a separate backup", async () => {
    const { local, remote } = fixture(); const request = vi.spyOn(heroPlatform, "request");
    await resolveHeroDraftConflict(remote, "owner-a", "remote");
    expect(request).not.toHaveBeenCalled();
    expect(io.stored.some((row) => row.payload.project.brief.concept === local.project.brief.concept && row.payload.rawInputs["brief.name"]?.text === "1e-")).toBe(true);
    expect(useHeroStore.getState().key).not.toBe("hero/working");
    expect(useHeroStore.getState().value?.project.brief.concept).toBe("遠端原文\n另一個分行");
    expect(io.stored.find((row) => row.payload.project.brief.concept === local.project.brief.concept)?.payload.project.sections.identity.fieldOwnership).toEqual(local.project.sections.identity.fieldOwnership);
  });
  it.each(["local", "remote", "new-work"] as const)("a failed durable backup prevents the %s action", async (choice) => {
    const { local, remote } = fixture(); const request = vi.spyOn(heroPlatform, "request");
    io.flush.mockRejectedValueOnce(new Error("disk full"));
    await expect(resolveHeroDraftConflict(remote, "owner-a", choice)).rejects.toThrow("disk full");
    expect(request).not.toHaveBeenCalled(); expect(useHeroStore.getState().key).toBe("hero/working"); expect(useHeroStore.getState().value).toEqual(local);
  });
  it("does not retry an unseen cloud revision when another authoring device wins again", async () => {
    const { local, remote } = fixture();
    const request = vi.spyOn(heroPlatform, "request").mockRejectedValue(new ApiError(409, "hero_conflict", "cloud changed again"));
    await expect(resolveHeroDraftConflict(remote, "owner-a", "local")).rejects.toThrow("cloud changed again");
    expect(request).toHaveBeenCalledTimes(1); expect(useHeroStore.getState().value).toEqual(local); expect(io.stored).toHaveLength(2);
  });
  it.each(["account", "draft", "edit"])("does not act on a stale comparison after a %s switch", async (change) => {
    const { remote } = fixture(); const request = vi.spyOn(heroPlatform, "request");
    let release!: () => void;
    io.flush.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    const running = resolveHeroDraftConflict(remote, "owner-a", "remote");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    if (change === "account") useHeroAccount.setState({ account: { id: "other", username: "other" } });
    else if (change === "draft") useHeroStore.setState({ key: "hero/another-copy" });
    else useHeroStore.setState({ value: { ...useHeroStore.getState().value!, rawInputs: { latest: { kind: "number", text: "5e" } } } });
    const before = useHeroStore.getState().value; release();
    await expect(running).rejects.toThrow("原稿仍保留"); expect(request).not.toHaveBeenCalled(); expect(useHeroStore.getState().value).toEqual(before);
  });
  it("creates a new incomplete local work without inheriting publication identity", async () => {
    const { local, remote } = fixture(); const request = vi.spyOn(heroPlatform, "request");
    await resolveHeroDraftConflict(remote, "owner-a", "new-work");
    const copy = useHeroStore.getState().value!;
    expect(copy.project.projectId).not.toBe(local.project.projectId); expect(copy.project.brief).toEqual(local.project.brief);
    expect(copy.rawInputs).toEqual(local.rawInputs); expect(copy.project.sections.identity.fieldOwnership).toEqual(local.project.sections.identity.fieldOwnership);
    expect(copy.cloud).toBeUndefined(); expect(copy.submission).toBeUndefined(); expect(request).not.toHaveBeenCalled(); expect(io.stored).toHaveLength(3);
  });
  it("copies original image bytes under the new identity without conversion or touching the old version", async () => {
    const { local } = fixture();
    const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ0kAAAAASUVORK5CYII=", "base64");
    const icon = await stageLocalIcon("champions", local.project.projectId, new File([bytes], "original.png", { type: "image/png" }), { maxSourceEdge: 4096, baseSha256: null });
    io.icons.set(`champions/${icon.docId}/${icon.contentSha256}`, icon);
    local.project.presentation.championIcon = icon.contentPath; local.originalIconRefs = { [`champions/${icon.docId}`]: icon.contentSha256 };
    const copy = await copyHeroDraftAsNew(local, "new-hero");
    expect(copy.project.presentation.championIcon).toBe("assets/icons/champions/new-hero.webp");
    const rebound = io.icons.get(`champions/new-hero/${icon.contentSha256}`)!;
    expect(new Uint8Array(await rebound.blob.arrayBuffer())).toEqual(new Uint8Array(bytes));
    expect(rebound.sourcePath).toBe("assets/icon/champions/new-hero/source.png");
    expect(local.project.presentation.championIcon).toBe(icon.contentPath); expect(io.icons.get(`champions/${icon.docId}/${icon.contentSha256}`)).toEqual(icon);
  });
  it("does not apply a delayed sync receipt to a different local copy of the same work", async () => {
    const { local, remote } = fixture(); let release!: (value: HeroWork) => void;
    vi.spyOn(heroPlatform, "request").mockImplementation(() => new Promise((resolve) => { release = resolve as (value: HeroWork) => void; }));
    const syncing = syncHeroDraft(local, "owner-a"); await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    useHeroStore.setState({ key: "hero/another-copy" }); release({ ...remote, draftRevision: 8 }); await syncing;
    expect(useHeroStore.getState().value?.cloud?.revision).toBe(2);
  });
});
