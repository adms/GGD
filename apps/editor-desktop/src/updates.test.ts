import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareVersions, downloadVerifiedUpdate, verifyStableRelease, type StableRelease, type UpdatePolicy } from "./updates";

const keys = generateKeyPairSync("ed25519");
const policy: UpdatePolicy = { schema: "ggd-editor-update-policy@1", enabled: true, feedUrl: "https://updates.example.invalid/stable.json", publicKeys: { release: keys.publicKey.export({ type: "spki", format: "pem" }).toString() }, macTeamId: "TESTTEAM12", windowsPublisherThumbprints: ["fixture"] };
const bytes = Buffer.from("signed installer fixture");
const asset: StableRelease["assets"][number] = { target: "darwin-universal", url: "https://updates.example.invalid/editor.dmg", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
const now = Date.parse("2026-09-06T00:00:00Z");
function release(): StableRelease { return { schema: "ggd-editor-stable-release@1", channel: "stable", version: "0.2.0", issuedAt: "2026-09-05T00:00:00Z", expiresAt: "2026-09-20T00:00:00Z", draftFormat: { min: 1, max: 1 }, assets: [asset, { ...asset, target: "win32-x64", url: "https://updates.example.invalid/editor.exe" }] }; }
function envelope(value: unknown) {
  const payload = Buffer.from(JSON.stringify(value));
  return { keyId: "release", payload: payload.toString("base64"), signature: sign(null, payload, keys.privateKey).toString("base64") };
}
describe("verified stable installer delivery", () => {
  it("accepts the pinned Ed25519 signature and compares complete numeric versions", () => {
    expect(verifyStableRelease(envelope(release()), policy, "0.1.0", now)).toEqual(release());
    expect(compareVersions("1.10.0", "1.9.9")).toBe(1);
  });
  it("rejects tampering, unknown keys and disabled publishing", () => {
    const original = envelope(release());
    expect(() => verifyStableRelease({ ...original, payload: Buffer.from(JSON.stringify({ ...release(), version: "9.0.0" })).toString("base64") }, policy, "0.1.0", now)).toThrow("簽章");
    expect(() => verifyStableRelease({ ...original, keyId: "outsider" }, policy, "0.1.0", now)).toThrow("不受信任");
    expect(() => verifyStableRelease(original, { ...policy, enabled: false }, "0.1.0", now)).toThrow("尚未啟用");
  });
  it.each([
    ["downgrade", (value: StableRelease) => { value.version = "0.0.1"; }],
    ["expired", (value: StableRelease) => { value.expiresAt = "2026-09-05T00:00:00Z"; }],
    ["incompatible drafts", (value: StableRelease) => { value.draftFormat = { min: 2, max: 2 }; }],
    ["foreign origin", (value: StableRelease) => { value.assets[0]!.url = "https://foreign.example.invalid/editor.dmg"; }],
    ["missing platform", (value: StableRelease) => { value.assets.pop(); }],
  ] as const)("rejects a correctly signed but invalid release: %s", (_name, mutate) => {
    const value = release(); mutate(value);
    expect(() => verifyStableRelease(envelope(value), policy, "0.1.0", now)).toThrow();
  });
  it("stores verified bytes and removes corrupt or oversized partial downloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ggd-update-test-"));
    try {
      const output = await downloadVerifiedUpdate(asset, dir, new Response(bytes));
      expect(await readFile(output)).toEqual(bytes);
      for (const body of [Buffer.from("wrong"), Buffer.alloc(bytes.length + 1)]) {
        await expect(downloadVerifiedUpdate(asset, dir, new Response(body))).rejects.toThrow();
        expect((await readdir(dir)).some((name) => name.endsWith(".download"))).toBe(false);
        expect(await readFile(output)).toEqual(bytes);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
