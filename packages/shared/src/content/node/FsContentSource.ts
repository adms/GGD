/**
 * FsContentSource — node:fs ContentSource for the game-server and scripts.
 * NODE-ONLY: lives under content/node so the browser-facing "./content"
 * export never pulls in node builtins.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CollectionName } from "../schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "../types";

export class FsContentSource implements ContentSource {
  constructor(private readonly rootDir: string) {}

  private async readJson(rel: string): Promise<unknown> {
    const text = await readFile(join(this.rootDir, rel), "utf8");
    return JSON.parse(text) as unknown;
  }

  async readManifest(): Promise<Manifest> {
    return (await this.readJson("manifest.json")) as Manifest;
  }

  async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    return (await this.readJson(join(collection, "_index.json"))) as CollectionIndex;
  }

  async readObject(_collection: CollectionName, entry: IndexEntry): Promise<unknown> {
    return this.readJson(entry.path);
  }
}
