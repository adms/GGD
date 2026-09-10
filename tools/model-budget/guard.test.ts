/**
 * guard.test — the import gate's contract:
 *   • it scores a model against its role's gate (the four axes),
 *   • it exits non-zero on a real breach and stays quiet under --warn-only,
 *   • it refuses to guess a role it cannot resolve (exit 2).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const GUARD = path.join(HERE, "guard.ts");
/** A generated blocky champion — the post-#226 shape of the stand-in roster. */
const BLOCKY = path.join(ROOT, "content/assets/models/champions/blocky-knight.glb");
/**
 * A model that STILL breaches the champion gate, so the failure path stays
 * covered now that no champion does. `guardian_skeleton.glb` reproduces the
 * retired knight.glb profile almost exactly: 1024² albedo (over the 512 warn),
 * 9 draw calls (over the limit of 5) and 123 animation channels (warning at 120).
 */
const OVERSIZED = path.join(ROOT, "content/assets/models/props/guardian_skeleton.glb");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guard-test-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Run guard; return {status, stdout}. Never throws on non-zero exit. */
function run(args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync("npx", ["tsx", GUARD, ...args], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout };
  } catch (e: any) {
    return { status: e.status ?? 1, stdout: String(e.stdout ?? "") };
  }
}

describe("the import guard scores against the role gate", () => {
  it("passes the generated blocky champion clean on every axis", () => {
    // This test used to assert knight.glb's BREACHES (1024² texture warn, draw
    // calls and animation channels over). #226 replaced that mesh with a
    // 168-triangle / 1-material / 16²-texture box-man, and the point of the
    // change was precisely to clear those breaches — so the assertion is
    // inverted rather than deleted, and now pins that they STAY cleared.
    const { status, stdout } = run([BLOCKY, "--role", "champion", "--json"]);
    expect(status).toBe(0); // nothing over the gate → exit 0
    const out = JSON.parse(stdout);
    const r = out.results[0];
    expect(r.role).toBe("champion");
    const axis = (k: string) => r.axes.find((a: any) => a.key === k);
    expect(axis("maxTextureEdge").verdict).toBe("ok");
    expect(axis("triangles").verdict).toBe("ok");
    expect(axis("drawCalls").verdict).toBe("ok");
    expect(axis("animChannels").verdict).toBe("ok");
  });

  it("still flags a real breach, and --warn-only downgrades it (exit 0)", () => {
    // The failure path must stay covered now that no champion breaches: a 1024²
    // arena prop scored against the champion gate reproduces the old shape.
    const { status, stdout } = run([OVERSIZED, "--role", "champion", "--json"]);
    expect(status).toBe(1);
    const out = JSON.parse(stdout);
    const axis = (k: string) => out.results[0].axes.find((a: any) => a.key === k);
    expect(axis("maxTextureEdge").verdict).toBe("over");
    expect(axis("drawCalls").verdict).toBe("over");
    // ⭐ GH#1164 —— 這一行原本斷言 `warn`（那時警戒線是 120，而這顆是 123 通道）。
    // ⛔ owner 2026-09-10 把警戒線移到 300 ⇒ 123 通道現在是 `ok`，而那是**對的**。
    // ⭐ 這條測試真正的主體是 `drawCalls: over`（上一行）——⛔ 通道那一格只是順帶。
    expect(axis("animChannels").verdict).toBe("ok");
    expect(run([OVERSIZED, "--role", "champion", "--warn-only"]).status).toBe(0);
  });

  /**
   * ⭐⭐ GH#1164 —— 這一條原本拿 `dragon2.glb`（**412** 通道）當「超標」的夾具，
   * 因為當時上限是 160。⛔ owner 2026-09-10 把上限移到 **500** ⇒ 412 現在是 `warn`。
   *
   * ⚠️⚠️ ⭐ **而全 repo 426 顆模型裡，最重的就是那 412 —— 一顆都沒有超過 500。**
   * ⇒ ⛔ 這條測試**失去了它的夾具**。
   *
   * ⭐ 而正確的處置**不是刪掉它**（那會讓「超標會被擋」這件事沒有任何守衛）——
   * ⇒ 改成**兩段**：
   *   ① 出貨語料裡最重的那一顆確實只到 `warn`（⭐ 這是**現況**的斷言）
   *   ② ⭐ 把上限**臨時調到 400** 再跑同一顆 ⇒ 必須 `over` 且 `exit=1`
   *      （⭐ 這證明「擋」那條路**還活著**，⛔ 不是因為沒人超標才沒紅）
   */
  it("超標仍然會被擋 —— ⭐ 而出貨語料裡今天沒有人超標", () => {
    const dragon = path.join(ROOT, "content/assets/models/menu/dragon2.glb");
    // ① 現況：出貨上限 500 之下，最重的那一顆只到 warn
    const now = run([dragon, "--role", "champion", "--json"]);
    const axisOf = (out: string) =>
      JSON.parse(out).results[0].axes.find((a: any) => a.key === "animChannels");
    expect(axisOf(now.stdout).verdict).toBe("warn");
    // The 412-channel result remains only a warning, while the same fixture's
    // 1024px texture independently exceeds the current 256px hero ceiling.
    expect(now.status).toBe(1);
    // ② ⭐ 把上限壓到那顆之下 ⇒ 「擋」那條路必須真的擋
    const tight = run([dragon, "--role", "champion", "--json", "--channel-limit", "400"]);
    expect(axisOf(tight.stdout).verdict, "⛔ 上限壓到 400 而 412 通道沒被判 over ⇒ 擋的那條路是死的").toBe("over");
    expect(tight.status).toBe(1);
  });

  it("refuses to guess a role it cannot resolve (exit 2)", () => {
    // a copy outside content/ with no --role: not in the report, unresolved
    const orphan = path.join(tmp, "orphan.glb");
    fs.copyFileSync(BLOCKY, orphan);
    const { status, stdout } = run([orphan]);
    expect(status).toBe(2);
    expect(stdout).toContain("UNRESOLVED");
  });
});
