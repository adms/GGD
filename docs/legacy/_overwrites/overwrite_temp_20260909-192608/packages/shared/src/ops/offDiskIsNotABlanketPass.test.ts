import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **一條「不在磁碟上就放過」的閘，等於沒有閘。**
 *
 * 2026-09-09：素材照 owner 的裁決住 S3 ⇒ **兩條**閘同時紅
 * （`tools/asset-manifest/gen.ts` 96 個「不存在」· `tools/vfx-asset-safety/check.py` 96 個 blocker）。
 * ⭐ 兩條都問**一個名詞**（檔案在磁碟上嗎），⛔ 而該問**關係**
 * （這個引用解析得到一顆**有 sha 的**資產嗎）。
 *
 * ⇒ 修法是讓它們去問 `content/assets-offdisk.json`。
 * ⚠️ ⭐ 而這條守衛守的是**修法本身**：⛔ 沒有宣告的缺席資產**仍然要紅**。
 *   （⭐ 一個沒有這一條的修法，就是把 fail-loud 換成 fail-open。）
 */

const REPO = join(import.meta.dirname, "../../../..");
const CHECK = join(REPO, "tools/vfx-asset-safety/check.py");

function runOn(glbPath: string): { code: number; out: string } {
  // ⭐ 造一份**真的** model@1 文件放進出貨樹的暫存 id，跑完就刪
  const id = `zz-offdisk-probe-${process.pid}`;
  const p = join(REPO, "content/models", `${id}.json`);
  mkdirSync(join(REPO, "content/models"), { recursive: true });
  writeFileSync(p, JSON.stringify({ id, schema: "model@1", glbPath, scale: 1 }, null, 2) + "\n");
  try {
    const out = execFileSync("python3", [CHECK], { cwd: REPO, encoding: "utf8", timeout: 300_000 });
    return { code: 0, out };
  } catch (e) {
    const x = e as { status?: number; stdout?: string; stderr?: string };
    return { code: x.status ?? -1, out: `${x.stdout ?? ""}${x.stderr ?? ""}` };
  } finally {
    rmSync(p, { force: true });
  }
}

describe("不在磁碟上的資產：⛔ 宣告不是放行清單", () => {
  it("① 一個**沒有宣告**的缺席 GLB ⇒ ⛔ 仍然紅並指名它", () => {
    const missing = `assets/models/community/${"f".repeat(64)}.glb`;
    const { code, out } = runOn(missing);
    expect(code, `⛔ 缺席的資產被放過了 —— 那是把 fail-loud 換成 fail-open\n${out.slice(0, 600)}`).not.toBe(0);
    expect(out).toContain("zz-offdisk-probe");
  });

  it("② **宣告過**的缺席 GLB ⇒ ⭐ 放行（⭐ 這一條證明①不是「一律紅」）", () => {
    const decl = JSON.parse(
      execFileSync("cat", [join(REPO, "content/assets-offdisk.json")], { encoding: "utf8" }),
    ) as { entries: Record<string, unknown> };
    const declared = Object.keys(decl.entries)[0]!;
    expect(declared, "⛔ 宣告是空的 —— 這把尺是瞎的").toBeTruthy();
    expect(runOn(declared).code, "⛔ 宣告過的仍然被擋 ⇒ 那個修法根本沒生效").toBe(0);
  });
});
