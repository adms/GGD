import { describe, expect, it, vi } from "vitest";
vi.mock("./session", () => ({ recoverDraft: vi.fn() }));
import { encodeBackupValue, decodeBackupValue, parseDesktopBackup, restoreDesktopBackup } from "./desktopBackup";
import { createLocalDraft } from "./repository";
import { recoverDraft } from "./session";
import { sha256Hex } from "@ggd/shared/content/sha256";

function envelope(body: unknown) {
  const text = JSON.stringify(body);
  return JSON.stringify({ schema: "ggd-editor-backup-envelope@1", body: text, sha256: sha256Hex(text) });
}
describe("desktop draft backup", () => {
  it("round-trips incomplete input, original image bytes and non-finite draft values", async () => {
    const input = { owner: "原文\n「完整對白」", raw: "1e-", unset: undefined, nan: NaN, negativeZero: -0, image: new Blob([new Uint8Array([0, 255, 12])], { type: "image/png" }) };
    const encoded = await encodeBackupValue(input);
    const restored = decodeBackupValue(JSON.parse(JSON.stringify(encoded))) as typeof input;
    expect({ ...restored, image: null }).toEqual({ ...input, image: null });
    expect(new Uint8Array(await restored.image.arrayBuffer())).toEqual(new Uint8Array([0, 255, 12]));
    expect(restored.image.type).toBe("image/png");
  });
  it("rejects corrupt and future backups without writing", () => {
    expect(() => parseDesktopBackup(JSON.stringify({ schema: "ggd-editor-backup-envelope@1", body: "{}", sha256: "bad" }))).toThrow("完整性");
    expect(() => parseDesktopBackup(envelope({ schema: "ggd-editor-local-backup@1", draftFormat: 2, databases: [] }))).toThrow("不相容");
  });
  it("recovers known drafts as copies and retains unreadable future projects in the source backup", async () => {
    const known = createLocalDraft("document/test", "document", 3, { rawInputs: { value: "1e-" } });
    const future = createLocalDraft("hero/future", "hero", 1, { project: { schema: "ggd-hero-project@99" } });
    const records = await Promise.all([known, future].map(async (value) => ({ key: await encodeBackupValue(value.key), value: await encodeBackupValue(value) })));
    const result = await restoreDesktopBackup(envelope({ schema: "ggd-editor-local-backup@1", draftFormat: 1, databases: [{ name: "ggd-editor-drafts", version: 1, stores: [{ name: "drafts", records }] }] }));
    expect(result).toEqual({ restored: 1, retained: 1 });
    expect(recoverDraft).toHaveBeenCalledTimes(1);
    expect(recoverDraft).toHaveBeenCalledWith(known);
  });
});
