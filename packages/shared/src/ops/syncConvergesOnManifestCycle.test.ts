/**
 * ⭐⭐【`content:build` ↔ `assets:manifest` 是一個**環**，而環要收斂】（GH#1225）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 抓到的：跑完一次完整 sync，`editor-target-profile.json` 仍然是過期的
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-11 實測：`pnpm skills:sync` **EXIT=0 全綠**，
 * ⭐ 而 `ops/shippedEditorProfileIsCurrent.test.ts` 在同一棵樹上**是紅的** ——
 * `assetManifestDigest` 對不上，⛔ 而 `content/assets-manifest.json` 一個位元組都沒變。
 *
 * ⭐ 根因是一個**環**（⛔ 不是誰忘了跑）：
 *
 *   `content:build`   讀 `content/assets-manifest.json` → 算出 profile 的 `assetManifestDigest`
 *   `assets:manifest` 讀 `content/*​/_index.json`        → **重寫** `content/assets-manifest.json`
 *                     ↑ 而那些索引是 `content:build` 寫的
 *
 * ⇒ ⛔ **兩邊都讀對方的產物** ⇒ 任何一個線性順序都會讓其中一份記著上一版。
 * ⇒ ⭐ 環只有兩種解：**跑到收斂**（同一步再跑一次）或**拆開**（把 profile 那一格獨立出來）。
 *   今天選前者：`assets:manifest` 之後**再跑一次 `content:build`**。
 *   ⚠️ ⛔ 不可以改成「把 `assets:manifest` 搬到前面」—— 它讀 `_index.json`，那時還沒有。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 為什麼這條閘必須存在（⛔ 而不是在 package.json 寫一行註解）
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 那個環在 `skills:check` 的眼中**是隱形的**：守衛
 * `shippedEditorProfileIsCurrent` 是一支 **vitest**，⛔ 不是一支 `*:check` 腳本
 * ⇒ ⭐ 它不在那 72 步裡。⇒ 假綠燈⑪：**兩條各自對的閘，而沒有人驗接縫。**
 *
 * ⇒ 這一條驗的是**關係**（⛔ 不是名詞）：鏈上 `assets:manifest` 的**後面**
 * 必須還有一次 `content:build`。⭐ 有人為了省 40 秒把它拿掉 ⇒ 這裡紅。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function syncSteps(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const chain = pkg.scripts["skills:sync"];
  expect(chain, "package.json 裡找不到 skills:sync").toBeTruthy();
  return String(chain ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm /, ""))
    .filter(Boolean);
}

describe("skills:sync 的 manifest 環要收斂（GH#1225）", () => {
  it("⭐ 量尺自證：鏈讀得到，而且兩支都在上面", () => {
    // ⛔ 沒有這一條，一個回空陣列的解析會讓下面兩條**結構上永遠綠**。
    const steps = syncSteps();
    expect(steps.length, "鏈解析出來太短 —— 偵測壞了").toBeGreaterThan(40);
    expect(steps, "⛔ 鏈上沒有 content:build").toContain("content:build");
    expect(steps, "⛔ 鏈上沒有 assets:manifest").toContain("assets:manifest");
  });

  it("⛔ `assets:manifest` 之後必須還有一次 `content:build`", () => {
    const steps = syncSteps();
    const manifestAt = steps.indexOf("assets:manifest");
    const rebuildAfter = steps.indexOf("content:build", manifestAt + 1);
    expect(
      rebuildAfter,
      "⛔⛔ `assets:manifest` 重寫了 content/assets-manifest.json，" +
        "⭐ 而 `content:build` 的 editor-target-profile 記著那份清單的 digest ⇒ " +
        "沒有第二次 content:build，profile 記的就是**上一版** —— " +
        "而 `skills:check` 看不到它（那支守衛是 vitest，不在 72 步裡）。\n" +
        "⇒ 在 `pnpm assets:manifest` 後面補回 `pnpm content:build`，" +
        "⛔ 不要改這條測試，也⛔ 不要把 assets:manifest 搬到前面（它讀 _index.json）。",
    ).toBeGreaterThan(manifestAt);
  });

  it("⭐ 第一次 `content:build` 仍然要在 `assets:manifest` **之前**（⛔ 環的另一半）", () => {
    const steps = syncSteps();
    const firstBuild = steps.indexOf("content:build");
    const manifestAt = steps.indexOf("assets:manifest");
    expect(
      firstBuild,
      "⛔ `assets:manifest` 讀 `content/*/_index.json` —— 那是 `content:build` 寫的。" +
        "它跑在前面就會讀到上一版的索引（或根本沒有）。",
    ).toBeLessThan(manifestAt);
  });
});
