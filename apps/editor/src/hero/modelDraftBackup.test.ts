import { beforeEach, expect, it, vi } from "vitest";
import { modelUploadFixture } from "@ggd/shared/content/modelUpload/fixtures";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { createHeroProject } from "./projectModel";
import type { HeroDraftPayload } from "./store";
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), recover: vi.fn() }));
vi.mock("./modelAssets", async (original) => ({ ...await original<typeof import("./modelAssets")>(), loadHeroModelBytes: mocks.load, saveHeroModelBytes: mocks.save }));
vi.mock("../drafts/session", () => ({ recoverDraft: mocks.recover }));
import { emptyModelSelections } from "./modelAssets";
import { heroTransferDraft, restoreHeroDraftAssets } from "./draftAssets";
import { encodeBackupValue, decodeBackupValue, restoreDesktopBackup } from "../drafts/desktopBackup";
import { sha256Hex } from "@ggd/shared/content/sha256";
const bytes = modelUploadFixture().bytes, sha256 = sha256Bytes(bytes), ref = { sha256, bytes: bytes.length, name: "source.glb" };
const value: HeroDraftPayload = { project: createHeroProject("model-backup"), mode: "visual", origin: "鬥士", rawInputs: { damage: { kind: "number", text: "1e" } }, modelDraft: { active: true, originals: [ref], working: ref, selections: emptyModelSelections(), yawOffsetDeg: 90 } };
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue(bytes); });

it("preserves original bytes and unfinished mappings locally while keeping cloud JSON binary-free", async () => {
  const backup = await heroTransferDraft(value);
  expect(backup.modelFiles).toHaveLength(1);
  mocks.load.mockRejectedValue(new Error("new device"));
  const restored = await restoreHeroDraftAssets(backup);
  expect(restored.modelDraft).toEqual(value.modelDraft);
  expect(restored.rawInputs).toEqual(value.rawInputs);
  expect(mocks.save).toHaveBeenCalledWith(bytes, "source.glb");
  mocks.load.mockClear();
  const cloud = await heroTransferDraft(value, { includeModels: false });
  expect(cloud.modelFiles).toBeUndefined();
  expect(cloud.modelDraft).toEqual(value.modelDraft);
  expect(mocks.load).not.toHaveBeenCalled();
});
it("rejects mismatched backups before writing any model", async () => {
  const backup = await heroTransferDraft(value);
  backup.modelFiles![0]!.base64 = btoa("corrupt");
  await expect(restoreHeroDraftAssets(backup)).rejects.toThrow("完整性");
  expect(mocks.save).not.toHaveBeenCalled();
});
it("desktop backup uses the compact model encoding and validates every record before restoring", async () => {
  const blob = new Blob([Uint8Array.from(bytes)], { type: "model/gltf-binary" });
  const encoded = await encodeBackupValue(blob);
  expect(encoded[0]).toBe("model-glb-base64@1");
  expect(new Uint8Array(await (decodeBackupValue(encoded) as Blob).arrayBuffer())).toEqual(bytes);
  const wrap = (keys: string[]) => {
    const body = JSON.stringify({ schema: "ggd-editor-local-backup@1", draftFormat: 1, databases: [{ name: "ggd-editor-model-assets", version: 1, stores: [{ name: "files", records: keys.map((key) => ({ key: ["string", key], value: encoded })) }] }] });
    return JSON.stringify({ schema: "ggd-editor-backup-envelope@1", sha256: sha256Hex(body), body });
  };
  await expect(restoreDesktopBackup(wrap([sha256, "wrong"]))).rejects.toThrow("完整性");
  expect(mocks.save).not.toHaveBeenCalled();
  expect(await restoreDesktopBackup(wrap([sha256]))).toEqual({ restored: 0, retained: 0 });
  expect(mocks.save).toHaveBeenCalledWith(bytes, "hero-body.glb");
});
