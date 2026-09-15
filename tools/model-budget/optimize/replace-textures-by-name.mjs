#!/usr/bin/env node
/** Replace named embedded GLB textures with PNG files from a directory. */
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

const [, , inputPath, textureDirectory, outputPath, ...names] = process.argv;
if (!inputPath || !textureDirectory || !outputPath || names.length === 0) {
  throw new Error("usage: replace-textures-by-name.mjs input.glb texture-dir output.glb texture-name [...]");
}
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(inputPath);
const textures = new Map(document.getRoot().listTextures().map((texture) => [texture.getName(), texture]));
const replaced = [];
for (const name of names) {
  const texture = textures.get(name);
  if (!texture) throw new Error(`texture not found: ${name}`);
  const replacementPath = path.join(textureDirectory, `${name}.png`);
  texture.setImage(new Uint8Array(fs.readFileSync(replacementPath))).setMimeType("image/png");
  replaced.push({name, replacementPath});
}
await io.write(outputPath, document);
console.log(JSON.stringify({tool: "model-budget/replace-textures-by-name@1", inputPath, outputPath, replaced}));
