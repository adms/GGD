import { beforeEach, expect, it, vi } from "vitest";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { createHeroProject } from "./projectModel";
import type { HeroDraftPayload } from "./store";

const mocks = vi.hoisted(() => ({ account: "alice", binary: vi.fn(), load: vi.fn(), save: vi.fn() }));
vi.mock("./communitySession", () => ({ heroPlatform: { binaryResponse: mocks.binary }, useHeroAccount: { getState: () => ({ account: { id: mocks.account } }) } }));
vi.mock("./modelAssets", async (original) => ({ ...await original<typeof import("./modelAssets")>(), loadHeroModelBytes: mocks.load, saveHeroModelBytes: mocks.save }));
import { syncHeroModelAssets, restoreCloudHeroModels } from "./cloudModelAssets";
import { emptyModelSelections } from "./modelAssets";

const bytes = new Uint8Array([1, 2, 3, 4]), sha256 = sha256Bytes(bytes);
const ref = { sha256, bytes: bytes.length, name: "original.glb" };
const value: HeroDraftPayload = { project: createHeroProject("model-sync"), rawInputs: {}, mode: "visual", origin: "鬥士", modelDraft: { active: true, originals: [ref], working: ref, selections: emptyModelSelections(), yawOffsetDeg: 0 } };
beforeEach(() => { vi.clearAllMocks(); mocks.account = "alice"; mocks.load.mockResolvedValue(bytes); mocks.binary.mockResolvedValue(new Response(JSON.stringify({ sha256, bytes: bytes.length }))); });

it("uploads each fixed version once and checks the server receipt", async () => {
  await syncHeroModelAssets(value, "alice");
  expect(mocks.binary).toHaveBeenCalledTimes(1);
  const [path, body, options] = mocks.binary.mock.calls[0]!;
  expect(path).toBe(`/hero-model-assets/${sha256}`);
  expect(new Uint8Array(await body.arrayBuffer())).toEqual(bytes);
  expect(options.method).toBe("PUT");
  mocks.binary.mockResolvedValue(new Response(JSON.stringify({ sha256: "wrong", bytes: bytes.length })));
  await expect(syncHeroModelAssets(value, "alice")).rejects.toThrow("版本回應不符");
});

it("does not carry an asset upload across an account switch", async () => {
  mocks.binary.mockImplementation(async () => { mocks.account = "bob"; return new Response(JSON.stringify({ sha256, bytes: bytes.length })); });
  await expect(syncHeroModelAssets(value, "alice")).rejects.toThrow("帳號已切換");
});

it("recovers missing originals with their exact hash and rejects changed bytes before saving", async () => {
  mocks.load.mockRejectedValue(new Error("missing"));
  mocks.binary.mockResolvedValue(new Response(bytes));
  await restoreCloudHeroModels(value, "alice");
  expect(mocks.save).toHaveBeenCalledWith(bytes, "original.glb");
  mocks.save.mockClear();
  mocks.binary.mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 5])));
  await expect(restoreCloudHeroModels(value, "alice")).rejects.toThrow("完整性");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("keeps a verified local copy without making a cloud request", async () => {
  await restoreCloudHeroModels(value, "alice");
  expect(mocks.binary).not.toHaveBeenCalled();
});
