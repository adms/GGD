import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **PR 越守規矩，那條閘越紅。**
 *
 * owner 2026-09-08 逐字：「資源庫 我覺得**不要進 git** 但可以**存到 S3**」。
 * ⇒ 社群英雄的 96 顆 GLB 照裁決住 S3 ⇒ CI 的磁碟上沒有它們
 * ⇒ `tools/asset-manifest/gen.ts` 印「⛔ 96 個被引用的資產**不存在**」並 exit 2。
 *
 * ⭐ 而那條閘沒有寫錯 —— 它問的是**一個名詞**（檔案在不在），
 *   ⛔ 而該問的是**關係**：這個引用**解析得到一顆有 sha 的資產**嗎。
 *
 * ⇒ `content/assets-offdisk.json` 就是 owner 歸屬表裡「進 git 的 **SHA-256**」那一格。
 *
 * ⚠️ ⭐ 它**不可以**變成一張放行清單 —— 所以兩個方向都要驗。
 */

const REPO = join(import.meta.dirname, "../../../..");
const DECL = join(REPO, "content/assets-offdisk.json");
const GEN = join(REPO, "tools/asset-manifest/gen.ts");

interface Decl {
  entries: Record<string, { bytes: number; sha256: string }>;
}

function run(declPath: string): { code: number; err: string } {
  try {
    execFileSync("npx", ["tsx", GEN, "--check"], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, GGD_ASSETS_OFFDISK: declPath },
    });
    return { code: 0, err: "" };
  } catch (e) {
    const x = e as { status?: number; stderr?: string; stdout?: string };
    return { code: x.status ?? -1, err: `${x.stderr ?? ""}${x.stdout ?? ""}` };
  }
}

describe("不在 git 裡的資產：宣告驗得起來（owner 2026-09-08 「不要進 git 但存 S3」）", () => {
  const decl = JSON.parse(readFileSync(DECL, "utf8")) as Decl;

  it("① 每一筆都是**內容定址且自洽**的，⛔ 而且不在磁碟上（⛔ 不可以有第二個住處）", () => {
    const rows = Object.entries(decl.entries);
    expect(rows.length, "⛔ 宣告是空的 —— 這把尺是瞎的").toBeGreaterThan(0);
    const contradictory = rows.filter(([p, d]) => {
      const m = /^([0-9a-f]{64})\.[a-z0-9]+$/.exec(p.split("/").pop() ?? "");
      return m !== null && m[1] !== d.sha256;
    });
    expect(contradictory.map(([p]) => p), "⛔ 檔名說一個 sha、欄位說另一個 ⇒ 這份宣告是編的").toEqual([]);
    const onDisk = rows.filter(([p]) => existsSync(join(REPO, "content", p)));
    expect(onDisk.map(([p]) => p), "⛔ 磁碟上有它 ⇒ 宣告是**第二個住處**（第〇·四守則）").toEqual([]);
  });

  it("② 自我矛盾的宣告 ⇒ ⛔ 當場擋下並指名那一筆", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-off-"));
    const p = join(dir, "assets-offdisk.json");
    writeFileSync(
      p,
      JSON.stringify({
        entries: {
          [`assets/models/community/${"a".repeat(64)}.glb`]: {
            bytes: 1,
            sha256: "b".repeat(64), // ⛔ 與檔名不合
          },
        },
      }),
    );
    const { code, err } = run(p);
    expect(code, "⛔ 一句自我矛盾的宣告被接受了 ⇒ 這就是放行清單").not.toBe(0);
    expect(err).toContain("自我矛盾");
  });

  it("③ 換成**空**宣告 ⇒ main 仍然綠（⭐ 證明①不是靠這份宣告撐著）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-off-"));
    const p = join(dir, "assets-offdisk.json");
    writeFileSync(p, JSON.stringify({ entries: {} }));
    expect(run(p).code, "⛔ main 上有資產靠宣告才解析得到 —— 那不該發生").toBe(0);
  });

  // ⭐⭐ **這一條才是重點**：宣告⛔不可以變成「不在磁碟上就放過」。
  //   ⚠️ 一個沒有這一條的修法，就是把 fail-loud 換成 fail-open ——
  //   而那比原本那條「問錯問題」的閘更糟（它至少會說話）。
  it("④ **沒有宣告**的缺席資產 ⇒ ⛔ 仍然 fail-loud 並指名它", () => {
    const id = `zz-offdisk-probe-${process.pid}`;
    const doc = join(REPO, "content/models", `${id}.json`);
    const ghost = `assets/models/community/${"f".repeat(64)}.glb`;
    writeFileSync(doc, JSON.stringify({ id, schema: "model@1", glbPath: ghost, scale: 1 }, null, 2) + "\n");
    try {
      const { code, err } = run(DECL); // ⭐ 出貨那份宣告 —— 而它裡面**沒有**這個幽靈
      expect(code, "⛔ 一個誰都沒宣告過的缺席資產被放過了 ⇒ 這就是放行清單").not.toBe(0);
      expect(err).toContain(ghost);
    } finally {
      rmSync(doc, { force: true });
    }
  });
});
