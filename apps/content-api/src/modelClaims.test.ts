import { afterEach, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { MODEL_ACQUISITION_REGISTRY_PATH } from "@ggd/shared/content/heroForge/modelClaims";
import { readHeroBodyModels } from "./modelClaims";
import { buildServer } from "./server";

/**
 * ⭐ GH#1188：待認領 ＝ 可挑的身體裡「英雄根本沒設計過（包含上架及未上架）」（owner 2026-09-11 01:02 +0800，逐字）。
 * ⛔ 2026-09-15 更正 991b02ed6 那一版只看 `champions/` 身體鏈 —— 這裡每一種「設計過」的證據各放一顆，少讀任何一種就有一顆被標錯。
 */
const repo = resolve(__dirname, "../../.."), roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("GET /content-api/hero-body-models：卡（含 _legacy）、skin、heroForge TS、下載清單任一條連到設計過的英雄就不是待認領", async () => {
  const root = mkdtempSync(join(tmpdir(), "ggd-model-claims-")); roots.push(root);
  const put = (path: string, doc: object) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), JSON.stringify(doc)); };
  const content = join(root, "content"), model = (id: string) => ({ id, schema: "model@1", glbPath: `assets/models/${id}.glb`, scale: 1, collisionRadius: 0.5, heroBody: true, clipMap: { idle: "i", run: "r", attack: "a", cast: "c", hurt: "h", death: "d" } });
  // `ou99.470351` 沒有任何卡引用，只在 heroForge TS 的 `ACQUIRED_MODEL_OPTIONS["godie-eevi"]`（劍心拔刀齋 —— owner：「劍心 明明就有」）。
  for (const id of ["waiting", "source", "legacy-body", "skin-body", "ou99.470351", "ou99.9-a", "ou99.8"]) put(`content/models/${id}.json`, model(id));
  put("content/champions/versioned.json", { id: "versioned", modelKey: "version.body.x", modelVersions: [{ modelKey: "version.body.x", sourceModelKey: "source" }] });
  put("content/_legacy/champions/old.json", { id: "old", modelKey: "legacy-body" });
  put("content/skins/skin.versioned.alt.json", { id: "skin.versioned.alt", schema: "skin@1", championId: "versioned", modelKey: "skin-body" });
  put(MODEL_ACQUISITION_REGISTRY_PATH, { entries: [{ heroIds: ["old"], sources: [{ sourceId: "ou99:9" }] }, { heroIds: ["nobody-designed-this"], sources: [{ sourceId: "ou99:8" }] }] });

  const claims = readHeroBodyModels(content, root);
  expect(claims.unclaimed).toEqual(["ou99.8", "waiting"]);
  expect(claims.evidence.missing).toEqual([]);
  expect(claims.claimedBy).toMatchObject({ source: ["versioned（champions）"], "legacy-body": ["old（_legacy/champions）"], "skin-body": ["versioned（skins）"], "ou99.9-a": ["old（download-sources）"], "ou99.470351": ["godie-eevi（ACQUIRED_MODEL_OPTIONS）", "godie-eevi（heroForge）"] });
  // ⚠️ 下載清單讀不到 ⇒ 不擋，但要說出來（⛔ 不靜默多標）
  const blind = readHeroBodyModels(content, join(root, "no-materials"));
  expect(blind.unclaimed).toContain("ou99.9-a");
  expect(blind.evidence.missing).toEqual([MODEL_ACQUISITION_REGISTRY_PATH]);

  const app = buildServer({ contentDir: content, backupDir: join(root, "backups"), repoRoot: repo });
  try {
    const response = await app.inject({ url: "/content-api/hero-body-models" });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual(readHeroBodyModels(content, repo));
  } finally { await app.close(); }
});
