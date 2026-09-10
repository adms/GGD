import Fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { sha256Hex } from "@ggd/shared/content/import/editorSource";
import { registerEditorSourceRoutes } from "./editorSourceRoutes";
import { makeSourceSandbox, removeSandbox } from "./testSourceSandbox";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) removeSandbox(root); });

it("restores source, partial outputs, mirrors, binary bundles and declared docs after a late generator failure", async () => {
  const root = makeSourceSandbox("routes"); roots.push(root);
  const source = "tools/skill-remake/heroes/godie-e00s.py";
  const ability = "content/abilities/godie-e00s.r.json";
  const other = "content/abilities/godie-e010.r.json";
  const champion = "content/champions/godie-e00s.json";
  const index = "content/abilities/_index.json";
  const bundle = "content/bundle.json.br";
  const doc = "docs/editor-contract/ggd-ability-prose.json";
  const unrelated = "docs/my-unrelated-draft.md";
  const added = "content/abilities/partial-new.json";
  const write = (path: string, data: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); };
  write(champion, '{"abilities":["original mirror"]}\n'); write(index, '["original"]\n');
  write(bundle, Buffer.from([0, 255, 12, 1])); write(doc, "original generated prose\r\n");
  write(unrelated, "keep this independent draft"); chmodSync(join(root, doc), 0o444);
  const paths = [source, ability, other, champion, index, bundle, doc, unrelated];
  const before = new Map(paths.map(path => [path, readFileSync(join(root, path))]));
  const app = Fastify(); let reachedPartialWrite = false;
  registerEditorSourceRoutes(app, {
    repoRoot: root, contentDir: join(root, "content"),
    runRegenerate: (_command, cwd) => {
      expect(cwd).toBe(root);
      expect(readFileSync(join(root, source), "utf8")).toContain("# edited source");
      reachedPartialWrite = true;
      // A real child process writes outputs and then exits nonzero. Its format
      // failure is deliberate; this proves recovery, not generator correctness.
      execFileSync(process.execPath, ["-e", `
        const fs = require("node:fs");
        const paths = ${JSON.stringify({ ability, other, champion, index, bundle, added, doc })};
        fs.writeFileSync(paths.ability, "{partial invalid json");
        fs.writeFileSync(paths.other, "normalizer modified another ability");
        fs.writeFileSync(paths.champion, "partial mirror"); fs.writeFileSync(paths.index, "partial index");
        fs.unlinkSync(paths.bundle); fs.writeFileSync(paths.added, "partial new output");
        fs.chmodSync(paths.doc, 0o644); fs.writeFileSync(paths.doc, "partial generated prose"); fs.chmodSync(paths.doc, 0o444);
        process.stderr.write("fixture: final validation failed after writing outputs"); process.exit(7);
      `], { cwd, stdio: "pipe" });
    },
  });
  try {
    const result = await app.inject({ method: "POST", url: "/content-api/editor-source", payload: {
      collection: "abilities", id: "godie-e00s.r", expectedSourceSha256: sha256Hex(before.get(source)!.toString()),
      source: before.get(source)!.toString() + "\n# edited source\n",
    } });
    expect(reachedPartialWrite).toBe(true); expect(result.statusCode, result.body).toBe(422);
    expect(result.json().error).toBe("REGENERATE_FAILED");
    expect(result.json().detail).toContain("fixture: final validation failed");
    expect(result.json().recovery).toEqual({ restored: 7, removed: 1 });
    for (const path of paths) expect(readFileSync(join(root, path)), path).toEqual(before.get(path));
    expect(existsSync(join(root, added))).toBe(false);
    expect(statSync(join(root, doc)).mode & 0o777).toBe(0o444);
  } finally { await app.close(); }
});

it("keeps successful generated output and does not revert it with the temporary checkpoint", async () => {
  const root = makeSourceSandbox("routes"); roots.push(root);
  const source = join(root, "tools/skill-remake/heroes/godie-e00s.py"), ability = join(root, "content/abilities/godie-e00s.r.json");
  const before = readFileSync(source, "utf8"), next = before + "\n# success\n", app = Fastify();
  registerEditorSourceRoutes(app, { repoRoot: root, contentDir: join(root, "content"), runRegenerate: () => {
    const value = JSON.parse(readFileSync(ability, "utf8")); value.name = "updated by registered generator";
    writeFileSync(ability, JSON.stringify(value));
  } });
  try {
    const result = await app.inject({ method: "POST", url: "/content-api/editor-source", payload: {
      collection: "abilities", id: "godie-e00s.r", expectedSourceSha256: sha256Hex(before), source: next,
    } });
    expect(result.statusCode, result.body).toBe(200); expect(result.json().product.changed).toBe(true);
    expect(readFileSync(source, "utf8")).toBe(next); expect(JSON.parse(readFileSync(ability, "utf8")).name).toBe("updated by registered generator");
  } finally { await app.close(); }
});

it("retains a usable recovery map and returns 503 if a failed generator introduces an unsafe destination", async () => {
  const root = makeSourceSandbox("routes"); roots.push(root);
  const sourcePath = "tools/skill-remake/heroes/godie-e00s.py", source = join(root, sourcePath);
  const before = readFileSync(source, "utf8"), app = Fastify(); let saved: string | undefined;
  const unrelated = join(root, "untouched-draft.txt"); writeFileSync(unrelated, "outside the generated tree");
  registerEditorSourceRoutes(app, { repoRoot: root, contentDir: join(root, "content"), runRegenerate: () => {
    symlinkSync(unrelated, join(root, "content/unsafe.txt")); throw new Error("fixture: failed after creating link");
  } });
  try {
    const result = await app.inject({ method: "POST", url: "/content-api/editor-source", payload: {
      collection: "abilities", id: "godie-e00s.r", expectedSourceSha256: sha256Hex(before), source: before + "\n# failure\n",
    } });
    expect(result.statusCode, result.body).toBe(503); expect(result.json().error).toBe("REGENERATE_RECOVERY_FAILED");
    saved = result.json().recoveryDirectory;
    expect(typeof saved).toBe("string");
    const manifest = JSON.parse(readFileSync(join(saved!, "recovery.json"), "utf8"));
    expect(manifest.repoRoot).toBe(realpathSync(root));
    const entry = manifest.files.find((file: { path: string }) => file.path === sourcePath);
    expect(readFileSync(join(saved!, entry.backup), "utf8")).toBe(before);
    expect(readFileSync(unrelated, "utf8")).toBe("outside the generated tree");
  } finally { await app.close(); if (saved) rmSync(saved, { recursive: true, force: true }); }
});
