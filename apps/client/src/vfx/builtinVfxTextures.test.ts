import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { BUILTIN_VFX_TEXTURES } from "@ggd/shared/content/builtinVfxTextures";

it("pins every Main fallback texture in the distributable asset manifest and rejects hidden VFX asset literals", () => {
  const root = resolve(__dirname, "../../../..");
  const manifest = JSON.parse(readFileSync(join(root, "content/assets-manifest.json"), "utf8")) as { entries: { path: string; bytes: number; sha256: string }[] };
  const references = new Set<string>();
  const untracked: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { walk(path); continue; }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteralLike(node) && node.text.includes("assets/textures/")) untracked.push(`${entry.name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "BUILTIN_VFX_TEXTURES") references.add(node.name.text);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  walk(__dirname);
  expect(untracked, "runtime texture paths must use the shared asset closure").toEqual([]);
  expect([...references].sort()).toEqual(Object.keys(BUILTIN_VFX_TEXTURES).sort());
  for (const path of Object.values(BUILTIN_VFX_TEXTURES)) {
    const entry = manifest.entries.find((item) => item.path === path);
    const bytes = readFileSync(join(root, "content", path));
    expect(entry, path).toMatchObject({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
});
