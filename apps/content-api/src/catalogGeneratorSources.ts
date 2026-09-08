import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { adapterFor, ownershipOf, type NormalizerFacts, type SyncIoFacts } from "@ggd/shared/content/import/editorSource";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { sha256Bytes } from "@ggd/shared/content/sha256";

export interface CatalogSourceBinding { productPath: string; sourcePath: string | null; adapterId: string | null; generatorVersion: string | null; authors: string[] }
export interface CatalogSourceArchive {
  schema: "ggd-catalog-generator-sources@1";
  bindings: CatalogSourceBinding[];
  generators: { versionId: string; step: string; files: { path: string; sha256: string; bytes: number }[] }[];
}

/** Save the actual registered source adapter inputs together with its products.
 * Never run source text, use the client's paths, or claim older missing sources.
 * The generator's build/finalization environment still needs separate replay
 * verification before a historical source may be applied. */
export function readCatalogGeneratorSources(repoRoot: string, productPaths: readonly string[]) {
  const root = realpathSync(repoRoot), files = new Map<string, Uint8Array>();
  const observed = new Map<string, string>(), directories = new Map<string, string>();
  let total = 0;
  const local = (path: string) => {
    if (!/^[a-zA-Z0-9._/-]+$/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("產生器來源路徑不合法。");
    const full = realpathSync(resolve(root, path));
    if (!full.startsWith(root + sep)) throw new Error(`產生器來源路徑越界：${path}`);
    return full;
  };
  const read = (path: string) => {
    const key = `generator-source/${path}`;
    if (files.has(key)) return files.get(key)!;
    const full = local(path), stat = statSync(full);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || total + stat.size > 32 * 1024 * 1024 || files.size >= 1000) throw new Error("產生器來源超過保存上限。");
    const bytes = new Uint8Array(readFileSync(full)); total += bytes.length;
    observed.set(path, sha256Bytes(bytes)); files.set(key, bytes); return bytes;
  };
  const io = JSON.parse(Buffer.from(read("tools/parallel-gates/sync-io.json")).toString()) as SyncIoFacts;
  const norms = JSON.parse(Buffer.from(read("tools/parallel-gates/normalizers.json")).toString()) as NormalizerFacts;
  const manifest: CatalogSourceArchive = { schema: "ggd-catalog-generator-sources@1", bindings: [], generators: [] };
  const byStep = new Map<string, string>();
  const walk = (path: string, found: Set<string>) => {
    const entries = readdirSync(local(path), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "__pycache__" || entry.name.endsWith(".py")).sort((a,b) => a.name.localeCompare(b.name, "en"));
    directories.set(path, entries.map((entry) => entry.name).join("\n"));
    for (const entry of entries) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) walk(child, found); else { read(child); found.add(child); }
    }
  };
  for (const productPath of [...productPaths].sort()) {
    if (!/^catalog\/[^/]+\/[^/]+\.json$/.test(productPath) || productPath.endsWith("/_index.json")) continue;
    const product = "content/" + productPath.slice(8), ownership = ownershipOf(product, io, norms);
    if (ownership.ownership !== "generator-owned") continue;
    const adapter = adapterFor(product, ownership.authors), sourcePath = adapter?.sourceFor(product) ?? null;
    let generatorVersion: string | null = null;
    if (adapter && sourcePath) {
      read(sourcePath); // A missing known source aborts before overwriting it.
      generatorVersion = byStep.get(adapter.step) ?? null;
      if (!generatorVersion) {
        const paths = new Set(adapter.archive.files);
        for (const directory of adapter.archive.pythonDirectories) walk(directory, paths);
        paths.add("packages/shared/src/content/import/editorSource.ts");
        const facts = [...paths].sort().map((path) => { const bytes = read(path); return {path: `generator-source/${path}`, sha256: `sha256:${sha256Bytes(bytes)}`, bytes: bytes.length}; });
        generatorVersion = contentSha256({ step: adapter.step, files: facts });
        manifest.generators.push({ versionId: generatorVersion, step: adapter.step, files: facts });
        byStep.set(adapter.step, generatorVersion);
      }
    }
    manifest.bindings.push({ productPath, sourcePath: sourcePath ? `generator-source/${sourcePath}` : null, adapterId: adapter?.adapterId ?? null, generatorVersion, authors: ownership.authors });
  }
  const verify = () => {
    for (const [path, digest] of observed) if (sha256Bytes(new Uint8Array(readFileSync(local(path)))) !== digest) throw new Error(`保存期間產生器來源已更新：${path}`);
    for (const [path, names] of directories) {
      const current = readdirSync(local(path), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== "__pycache__" || entry.name.endsWith(".py")).sort((a,b) => a.name.localeCompare(b.name, "en")).map((entry) => entry.name).join("\n");
      if (current !== names) throw new Error(`保存期間產生器來源目錄已更新：${path}`);
    }
  };
  return { files, manifest, verify };
}
