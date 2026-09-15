/**
 * 🧍 **上架英雄的模型要真的到得了玩家** —— GH#1181。
 *
 * owner 2026-09-11（逐字）：「缺的兩項：**38 名跑進體素替身（GLB 不在版控**，#1181）」
 *
 * ## ⛔⛔ 為什麼「宣告過」不算通過
 *
 * `content/assets-offdisk.json` 回答的是「**位元組在哪、雜湊是多少**」，
 * ⛔ 它**不回答**「玩家載不載得到」——因為部署是 `git fetch + checkout`、
 * `content/` 是 live bind-mount，⭐ **而全 repo 沒有任何一步把 S3 的位元組拉回來**
 * （`tools/asset-cdn/upload.py` 只有上傳那一半）。
 * ⇒ 一顆只有宣告的 GLB 在伺服器上**不存在** ⇒ `AssetManager.load()` 回 null
 * ⇒ 客戶端保留程序化體素替身 ⇒ ⭐ **那支英雄長得不是本人，而沒有任何東西喊**。
 *
 * ⚠️ 我自己的 `tools/hero-intake/run.mjs` 第一版就把「宣告過」判成 `ok` ——
 * ⭐ 那正是 CLAUDE.md 說的「一個看起來已經量過的東西，量的不是你以為的那個」。
 *
 * ## 兩個方向都走（形態⑫）
 *  ① 從**英雄**走：每一支的 `modelKey` 都要解析到一顆**在 git 裡**的 GLB。
 *  ② 從**宣告**走：`assets-offdisk.json` 裡不可以有任何一筆被上架英雄引用到。
 *
 * ── 突變紀錄 ───────────────────────────────────────────────────────
 *  · 把一顆 GLB 從 git 移除並改宣告進 `assets-offdisk.json` → ①②都紅並指名那支英雄。實測過。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dirname, "../../../..");
const CONTENT = join(REPO, "content");
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

/** ⭐ 出貨的是 **git**，⛔ 不是你這台機器的工作樹（同 shippedBundleHasTrackedSources 的理由）。 */
function trackedModelFiles(): Set<string> {
  const out = execFileSync("git", ["ls-files", "content/assets/models"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return new Set(out.split("\n").filter(Boolean).map((p) => p.slice("content/".length)));
}

function champions(): { id: string; modelKey: string | null }[] {
  return readdirSync(join(CONTENT, "champions"))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => ({ id: f.slice(0, -5), modelKey: readJson(join(CONTENT, "champions", f)).modelKey ?? null }));
}

function modelDocs(): Map<string, { glbPath?: string }> {
  const m = new Map<string, { glbPath?: string }>();
  for (const f of readdirSync(join(CONTENT, "models"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const d = readJson(join(CONTENT, "models", f));
    if (d?.id) m.set(d.id, d);
  }
  return m;
}

describe("上架英雄的模型要到得了玩家 (GH#1181)", () => {
  it("⭐ ① 每一支英雄的 modelKey 都解析到一顆**在 git 裡**的 GLB", () => {
    const tracked = trackedModelFiles();
    const docs = modelDocs();
    const offDisk = new Set(Object.keys(readJson(join(CONTENT, "assets-offdisk.json")).entries ?? {}));
    const broken: string[] = [];
    for (const c of champions()) {
      const g = c.modelKey ? docs.get(c.modelKey)?.glbPath : undefined;
      if (!g) { broken.push(`${c.id}：modelKey「${c.modelKey ?? "(無)"}」指不到 glbPath`); continue; }
      if (tracked.has(g)) continue;
      broken.push(
        `${c.id}：${g} ${offDisk.has(g) ? "**只有宣告**（位元組在 S3）" : "**哪裡都沒有**"}` +
          " ⇒ 伺服器上不存在 ⇒ 玩家看到體素替身",
      );
    }
    expect(broken, `⛔ ${broken.length} 支英雄的模型到不了玩家：\n${broken.join("\n")}\n` +
      "⭐ 修法：把位元組抓回來放進 git（owner 2026-09-10「成品一律上傳至 git」），並從 assets-offdisk.json 移除那一筆。").toEqual([]);
  });

  it("⭐ ② 反方向：off-disk 宣告裡不可以有任何一筆被上架英雄引用", () => {
    const docs = modelDocs();
    const offDisk = new Set(Object.keys(readJson(join(CONTENT, "assets-offdisk.json")).entries ?? {}));
    const used = champions()
      .map((c) => ({ id: c.id, g: c.modelKey ? docs.get(c.modelKey)?.glbPath : undefined }))
      .filter((x) => x.g && offDisk.has(x.g))
      .map((x) => `${x.id} → ${x.g}`);
    expect(used, "⛔ 宣告是給**沒有人在玩的**資產用的（造型庫、未上架）——" +
      "一支上架英雄引用到它，就代表那支英雄在線上是體素替身。").toEqual([]);
  });
});
