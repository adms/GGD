import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contentVersion, hashCollection, hashDoc, sha256Hex } from "@ggd/shared/content";
import { buildCapabilityManifest } from "@ggd/shared/content/editorCapabilities";
import { rebuildAllIndexes, writeDocAtomic } from "@ggd/shared/content/node";
import {
  contentDirForRemoteWorkspace,
  normalizeRemoteSource,
  readPinnedTargetProfile,
  remoteWorkspacePolicy,
  syncRemoteWorkspace,
  validateRemoteBundle,
  validateRemoteTargetProfile,
} from "./remoteWorkspace";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temp(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function remotePayload(cost: number, extra = false) {
  const root = temp("ggd-remote-origin-");
  const primary = {
    id: "remote-item",
    schema: "item@1",
    name: "Remote Item",
    cost,
    tier: 2,
    modifiers: [{ stat: "ap", op: "flat", value: 20 }],
    tags: ["ap"],
  };
  writeDocAtomic(root, "items", primary);
  if (extra) {
    const added = {
      id: "new-item",
      schema: "item@1",
      name: "New Item",
      cost: 500,
      tier: 1,
      modifiers: [],
      tags: [],
    };
    writeDocAtomic(root, "items", added);
  }
  const manifest = rebuildAllIndexes(root);
  const profile = publishedProfile(manifest);
  return {
    manifest: readFileSync(join(root, "manifest.json"), "utf8"),
    bundle: readFileSync(join(root, "bundle.json"), "utf8"),
    profile: JSON.stringify(profile),
    contentVersion: manifest.contentVersion,
  };
}

function fakeFetch(payload: ReturnType<typeof remotePayload>, online = true): typeof fetch {
  return (async (input: string | URL | Request) => {
    if (!online) throw new Error("offline");
    const path = new URL(typeof input === "string" || input instanceof URL ? input : input.url).pathname;
    const raw = path.endsWith("/manifest.json")
      ? payload.manifest
      : path.endsWith("/bundle.json")
        ? payload.bundle
        : path.endsWith("/editor-target-profile.json")
          ? payload.profile
          : null;
    if (raw === null) return new Response("missing", { status: 404 });
    return new Response(raw, { status: 200, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(raw)) } });
  }) as typeof fetch;
}

function publishedProfile(manifest: ReturnType<typeof JSON.parse>) {
  const body = {
    schema: "ggd-editor-target-profile@1",
    readOnly: true,
    note: "public read-only contract",
    content: {
      contentVersion: manifest.contentVersion,
      collections: manifest.collections,
      collectionCount: Object.keys(manifest.collections).length,
    },
    contract: {
      profileSchema: "ggd-content-target-profile@1",
      capabilitiesSchema: "ggd-runtime-capabilities@1",
      packageSpec: { file: "GGD_EDITOR_PACKAGE_SPEC.md", digest: "test", bytes: 1, label: "test" },
      compiler: { contractVersion: null, fingerprint: null },
    },
    runtimeCapabilities: buildCapabilityManifest(),
    tagManifest: { digest: null, matchesEngine: false },
    authoringRules: { digest: null },
    curation: { championDigest: null, itemDigest: null },
    assetManifestDigest: null,
    deltaExportAllowed: false,
    supportedModes: ["bootstrap"],
    authoringModel: {
      accepts: ["ability@1", "item@1"],
      notRequired: ["effect-template@1", "effect-product@1", "effect-chain@1", "expectedCompiled"],
      intentField: "template.cards",
    },
    unavailable: [{ field: "compiler", reason: "not versioned" }],
  };
  return { ...body, profileDigest: sha256Hex(JSON.stringify(body)).slice(0, 12) };
}

describe("remote editor workspace", () => {
  it("normalizes the official URL and refuses arbitrary remote hosts", () => {
    expect(normalizeRemoteSource("ggd.adms.ai")).toEqual({
      sourceUrl: "https://ggd.adms.ai",
      contentBaseUrl: "https://ggd.adms.ai/content/",
    });
    expect(normalizeRemoteSource("https://ggd.adms.ai/content/").contentBaseUrl).toBe("https://ggd.adms.ai/content/");
    expect(() => normalizeRemoteSource("https://example.com")).toThrow(/白名單/);
    expect(() => normalizeRemoteSource("http://ggd.adms.ai")).toThrow(/HTTPS/);
  });

  it("reads host and transport limits from one validated runtime policy", () => {
    const policy = remoteWorkspacePolicy({
      GGD_EDITOR_REMOTE_HOSTS: "assets.example.test,ggd.adms.ai",
      GGD_EDITOR_REMOTE_MANIFEST_MAX_BYTES: "65536",
      GGD_EDITOR_REMOTE_BUNDLE_MAX_BYTES: "1048576",
      GGD_EDITOR_REMOTE_ASSET_MAX_BYTES: "2097152",
      GGD_EDITOR_REMOTE_TIMEOUT_MS: "1500",
    });
    expect(policy).toMatchObject({
      allowedHosts: ["assets.example.test", "ggd.adms.ai"],
      maxManifestBytes: 65536,
      maxBundleBytes: 1048576,
      maxAssetBytes: 2097152,
      requestTimeoutMs: 1500,
    });
    expect(normalizeRemoteSource("https://assets.example.test", policy).contentBaseUrl)
      .toBe("https://assets.example.test/content/");
    expect(() => remoteWorkspacePolicy({ GGD_EDITOR_REMOTE_TIMEOUT_MS: "0" })).toThrow(/GGD_EDITOR_REMOTE_TIMEOUT_MS/);
  });

  it("stops an oversized remote JSON stream even without Content-Length", async () => {
    const workspace = temp("ggd-remote-oversized-");
    const oversized = " ".repeat(64 * 1024 + 1);
    const fetchImpl = (async () => new Response(oversized, {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
    await expect(syncRemoteWorkspace({
      sourceInput: "http://127.0.0.1:9999",
      workspaceRoot: workspace,
      fetchImpl,
      policy: remoteWorkspacePolicy({ GGD_EDITOR_REMOTE_MANIFEST_MAX_BYTES: String(64 * 1024) }),
    })).rejects.toThrow(/超過下載上限/);
  });

  it("downloads, validates and pins a remote Base while keeping a local working tree", async () => {
    const workspace = temp("ggd-remote-workspace-");
    const payload = remotePayload(900);
    const source = await syncRemoteWorkspace({
      sourceInput: "http://127.0.0.1:9999",
      workspaceRoot: workspace,
      fetchImpl: fakeFetch(payload),
    });
    expect(source.state).toBe("current");
    expect(source.pinnedContentVersion).toBe(payload.contentVersion);
    expect(source.contractStatus).toBe("remote-target-profile");
    expect(source.targetProfileDigest).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.parse(readFileSync(join(contentDirForRemoteWorkspace(workspace), "items", "remote-item.json"), "utf8")).cost).toBe(900);
    expect(existsSync(join(workspace, "base", payload.contentVersion, "content", "bundle.json"))).toBe(true);
  });

  it("accepts main contentVersion's private asset-tree component while fully verifying JSON", () => {
    const payload = remotePayload(900);
    const manifest = JSON.parse(payload.manifest);
    const bundle = JSON.parse(payload.bundle);
    const hashes = Object.fromEntries(
      Object.entries(bundle.collections).map(([name, value]) => [name, (value as { hash: string }).hash]),
    );
    const assetAwareVersion = contentVersion({ ...hashes, __assets: "asset-tree-test" });
    manifest.contentVersion = bundle.contentVersion = assetAwareVersion;

    const editable = validateRemoteBundle(bundle, manifest);
    expect(editable.collections.items?.entries).toHaveLength(1);

    bundle.collections.items.entries[0].doc.cost = 901;
    expect(() => validateRemoteBundle(bundle, manifest)).toThrow(/hash 不一致/);
  });

  it("three-way merges remote-only changes and preserves local documents on a collision", async () => {
    const workspace = temp("ggd-remote-merge-");
    const first = remotePayload(900);
    await syncRemoteWorkspace({ sourceInput: "http://127.0.0.1:9999", workspaceRoot: workspace, fetchImpl: fakeFetch(first) });
    const working = contentDirForRemoteWorkspace(workspace);
    const localEdit = {
      id: "remote-item",
      schema: "item@1",
      name: "Remote Item",
      cost: 950,
      tier: 2,
      modifiers: [{ stat: "ap", op: "flat", value: 20 }],
      tags: ["ap"],
    };
    writeDocAtomic(working, "items", localEdit);
    rebuildAllIndexes(working);

    const second = remotePayload(1000, true);
    const source = await syncRemoteWorkspace({ sourceInput: "http://127.0.0.1:9999", workspaceRoot: workspace, fetchImpl: fakeFetch(second) });
    expect(source.state).toBe("merged-with-conflicts");
    expect(source.conflicts).toContainEqual({ collection: "items", id: "remote-item", reason: "both-modified" });
    expect(JSON.parse(readFileSync(join(working, "items", "remote-item.json"), "utf8")).cost).toBe(950);
    expect(JSON.parse(readFileSync(join(working, "items", "new-item.json"), "utf8")).name).toBe("New Item");
    expect(source.pinnedContentVersion).toBe(second.contentVersion);
  });

  it("falls back to the last local cache when the website is unavailable", async () => {
    const workspace = temp("ggd-remote-offline-");
    const payload = remotePayload(900);
    await syncRemoteWorkspace({ sourceInput: "http://127.0.0.1:9999", workspaceRoot: workspace, fetchImpl: fakeFetch(payload) });
    const source = await syncRemoteWorkspace({ sourceInput: "http://127.0.0.1:9999", workspaceRoot: workspace, fetchImpl: fakeFetch(payload, false) });
    expect(source.state).toBe("offline-cache");
    expect(source.offline).toBe(true);
  });

  it("rejects a target profile whose digest was altered", () => {
    const payload = remotePayload(900);
    const manifest = JSON.parse(payload.manifest);
    const profile = JSON.parse(payload.profile);
    profile.gameVersion = "tampered";
    expect(() => validateRemoteTargetProfile(profile, manifest)).toThrow(/digest/);
  });

  it("validates and pins the published read-only target profile without inventing fields", async () => {
    const workspace = temp("ggd-remote-published-profile-");
    const payload = remotePayload(900);
    const manifest = JSON.parse(payload.manifest);
    const profile = publishedProfile(manifest);
    const publishedPayload = { ...payload, profile: JSON.stringify(profile) };
    const source = await syncRemoteWorkspace({
      sourceInput: "http://127.0.0.1:9999",
      workspaceRoot: workspace,
      fetchImpl: fakeFetch(publishedPayload),
    });
    expect(source.pinnedContentVersion).toBe(manifest.contentVersion);
    expect(source.targetProfileDigest).toBe(profile.profileDigest);
    const pinned = readPinnedTargetProfile(workspace, manifest.contentVersion);
    expect(pinned?.content.contentVersion).toBe(manifest.contentVersion);
    expect(pinned?.contract.compiler).toEqual({ contractVersion: null, fingerprint: null });
    expect(pinned?.supportedModes).toEqual(["bootstrap"]);
    expect(pinned?.authoringModel?.accepts).toEqual(["ability@1", "item@1"]);
    expect(pinned?.authoringModel?.intentField).toBe("template.cards");
  });

  it("verifies unknown remote collections but excludes them from the editable workspace", () => {
    const payload = remotePayload(900);
    const manifest = JSON.parse(payload.manifest);
    const bundle = JSON.parse(payload.bundle);
    const doc = { id: "future.test", schema: "future@1", name: "Not part of this editor build" };
    const entry = { id: doc.id, hash: hashDoc(doc), doc };
    const maps = { hash: hashCollection([entry]), entries: [entry] };
    bundle.collections["future-collection"] = maps;
    manifest.collections["future-collection"] = { hash: maps.hash, count: 1 };
    const hashes = Object.fromEntries(Object.entries(bundle.collections).map(([name, value]) => [name, (value as { hash: string }).hash]));
    bundle.contentVersion = manifest.contentVersion = contentVersion(hashes);

    const warnings: string[] = [];
    const editable = validateRemoteBundle(bundle, manifest, warnings);
    expect("future-collection" in editable.collections).toBe(false);
    expect(editable.contentVersion).not.toBe(bundle.contentVersion);
    expect(warnings).toContainEqual(expect.stringMatching(/^future-collection：/));
  });
});
