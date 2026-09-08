import { describe, expect, it } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { buildHeroImportPackage } from "./heroPackage";
import { buildRuntimePackageZip, packageZipInput, deterministicStoredZip } from "./packageZip";
import { readPackageZip } from "./readPackageZip";
import { readCentralDirectory, extractEntry } from "./zipReader";

const catalog = shippedHeroCatalog();
const project = heroPackageProject(catalog);
const target = { gameRevision: "fixture", contentVersion: "fixture", migrationFingerprint: "fixture", processorFingerprint: "fixture" };
const pkg = buildHeroImportPackage(project, catalog, target);
const makeZip = () => buildRuntimePackageZip(packageZipInput(pkg, project.projectId));
const rewrite = (bytes: Uint8Array, edit: (files: Map<string, Uint8Array>) => void) => {
  const files = new Map(readCentralDirectory(bytes).entries.map((entry) => [entry.path, extractEntry(bytes, entry)]));
  edit(files);
  return deterministicStoredZip([...files].map(([path, bytes]) => ({ path, bytes })));
};

describe("one package ZIP reader in Main and offline Editor", () => {
  it("recovers full source text, runtime and exact binary assets without a server", async () => {
    const { bytes } = await makeZip();
    const decoded = readPackageZip(bytes);
    expect(decoded.documents).toEqual([...pkg.documents].sort((a, b) => a.path.localeCompare(b.path, "en")));
    expect(decoded.manifest.packageDigest).toBe(pkg.manifest.packageDigest);
    expect(decoded.compiled).toHaveLength(pkg.compiled.length);
    expect(decoded.assets.map((asset) => [asset.path, [...asset.bytes as Uint8Array]])).toEqual([...pkg.assets].sort((a, b) => a.path.localeCompare(b.path, "en")).map((asset) => [asset.path, [...asset.bytes as Uint8Array]]));
  });
  it.each(["missing", "extra", "data", "transport", "semantic"])("rejects %s drift even with a freshly computed archive CRC", async (kind) => {
    const { bytes } = await makeZip();
    const changed = rewrite(bytes, (files) => {
      const root = pkg.documents[0]!.path;
      if (kind === "missing") files.delete(root);
      if (kind === "extra") files.set("authoring/hero-projects/hidden.json", new TextEncoder().encode("{}"));
      if (kind === "data") files.set(root, new TextEncoder().encode("{}"));
      if (kind === "transport" || kind === "semantic") {
        const manifest = JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
        if (kind === "transport") manifest.transport.entries[0].rawSha256 = "sha256:" + "0".repeat(64);
        else { delete manifest.transport; manifest.entries[0].contentSha256 = "sha256:" + "0".repeat(64); }
        files.set("manifest.json", new TextEncoder().encode(JSON.stringify(manifest)));
      }
    });
    expect(() => readPackageZip(changed)).toThrow();
  });
  it("refuses to produce an archive when a declared payload is absent", async () => {
    const input = packageZipInput(pkg, project.projectId);
    (input.binaryEntries as Map<string, Uint8Array>).delete(pkg.assets[0]!.path);
    await expect(buildRuntimePackageZip(input)).rejects.toThrow("一一對應");
  });
});
