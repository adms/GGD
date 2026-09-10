import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HERO = "b2-kaiji";
const ACTIVE = "version.body.current";

function auditFixture(models: Record<string, object>, declared = true, active = ACTIVE) {
  const root = mkdtempSync(join(tmpdir(), "ggd-roster-history-"));
  const put = (path: string, data: object) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data));
  };
  try {
    put("content/config/model-lod.json", { championChannelLimit: 500 });
    put(`content/champions/${HERO}.json`, { schema: "champion@1", id: HERO, name: "伊藤開司", modelKey: active });
    for (const [id, model] of Object.entries(models)) put(`content/models/${id}.json`, { schema: "model@1", id, ...model });
    put("baseline.json", {
      idAliases: { rows: [] },
      skeletonPlaceholders: { rows: declared ? [{ id: HERO, kind: "pending-conversion", why: "No confirmed delivered model" }] : [] },
    });
    writeFileSync(join(root, "inventory.md"), [
      "## 第一批 37 名", "| 出處 | 角色 | 預設模型 | 來源 |",
      `| 賭博默示錄 | 伊藤開司<br>\`${HERO}\` | 待取得核准模型 | 待處理 |`,
      "## 第二批 37 名", "## LOL 追加 7 名",
    ].join("\n"));
    const code = [
      "import sys,json", "from pathlib import Path",
      "sys.path.insert(0, sys.argv[1])", "import roster_sync",
      "root=Path(sys.argv[2])", "roster_sync.BASELINE=root/'baseline.json'",
      "print(json.dumps(roster_sync.audit(root/'inventory.md',root)))",
    ].join("\n");
    return spawnSync("python3", ["-B", "-c", code, join(REPO, "tools/ship-81"), root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const nestedPlaceholder = {
  [ACTIVE]: { bodyVersion: { sourceModelKey: "version.body.previous" } },
  "version.body.previous": { bodyVersion: { sourceModelKey: "champ.thorne" } },
  "champ.thorne": {},
};

describe("roster audit follows frozen model provenance", () => {
  it("keeps a nested frozen placeholder declared and reports the actual active key", () => {
    const result = auditFixture(nestedPlaceholder);
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.skeletonDeclared).toEqual([{ id: HERO, modelKey: ACTIVE, kind: "pending-conversion", why: "No confirmed delivered model" }]);
    expect(report.skeletonStaleDeclarations).toEqual([]);
    expect(report.skeletonUndeclared).toEqual([]);
  });

  it("still exposes an undeclared frozen placeholder", () => {
    const result = auditFixture(nestedPlaceholder, false);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).skeletonUndeclared).toEqual([{ id: HERO, modelKey: ACTIVE }]);
  });

  it("preserves direct mage-placeholder classification", () => {
    const result = auditFixture({ "champ.sela": {} }, true, "champ.sela");
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).skeletonDeclared[0].modelKey).toBe("champ.sela");
  });

  it("retires a placeholder declaration only when the active version resolves to a real model", () => {
    const result = auditFixture({ [ACTIVE]: { bodyVersion: { sourceModelKey: "community.body.real" } }, "community.body.real": {} });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.skeletonDeclared).toEqual([]);
    expect(report.skeletonUndeclared).toEqual([]);
    expect(report.skeletonStaleDeclarations).toEqual([HERO]);
  });

  it.each([
    { name: "missing source document", models: { [ACTIVE]: { bodyVersion: { sourceModelKey: "community.body.missing" } } }, message: "Missing model document" },
    { name: "provenance cycle", models: { [ACTIVE]: { bodyVersion: { sourceModelKey: "version.body.loop" } }, "version.body.loop": { bodyVersion: { sourceModelKey: ACTIVE } } }, message: "Model provenance cycle" },
  ])("fails visibly on $name rather than counting the hero as completed", ({ models, message }) => {
    const result = auditFixture(models);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(HERO);
    expect(result.stderr).toContain(message);
    expect(result.stdout).toBe("");
  });
});
