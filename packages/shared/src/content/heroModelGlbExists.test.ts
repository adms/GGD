/**
 * ⭐⭐【每一支上架英雄的模型檔要**真的在**】（GH#1181）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 為什麼在此之前沒有東西喊
 * ═══════════════════════════════════════════════════════════════════════════
 * `AssetManager.load()` 失敗時回 `null`，呼叫端**保留程序化體素替身**
 *（`AssetManager.ts:6` 逐字：「load() resolves null on any failure — callers keep
 * their procedural fallback」）。⭐ 那是**對的設計**：一顆載不動的模型不可以讓整場遊戲黑掉。
 *
 * ⛔ 錯的是**沒有任何東西 fail-loud** —— CLAUDE.md 逐字：
 *「fail-open 沒錯，**靜默**才是缺陷⋯選擇 fail-open 的同時，必須有一個**會回非零、
 * 或畫面上擋不掉**的東西說出來 —— 一行沒有人讀的 log 不算。」
 *
 * ⇒ 今天量到的：**45 支英雄長得都不是本人**，而且**每一條既有的閘都是綠的** ——
 * `content:build` 與 `shippedBundleIsCurrent` 驗的是**文件與索引**，
 * ⛔ 它們從來不問「`glbPath` 指到的那顆檔案在不在」。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 它為什麼是**棘輪**而不是一條硬斷言
 * ═══════════════════════════════════════════════════════════════════════════
 * 今天就有 45 支缺席 ⇒ 一條硬斷言會是「**一個永遠不會綠的閘**」，
 * 而 CLAUDE.md 把那個形狀記成一種**假綠燈的來源**（⑨）：
 *「⚠️ 一個從來沒人看它綠過的閘，與一個不存在的閘**沒有差別**。」
 *
 * ⇒ 所以它問的是**兩個方向**（⛔ 一個方向不算）：
 *   ① ⛔ **不可以變多** —— 名單以外冒出新的缺席 ⇒ 紅（⭐ 這是它真正在防的事：
 *      下一批英雄上架時再度靜靜地全是體素）
 *   ② ⛔ **修好了不劃掉也要紅** —— 名單上的某一支其實找得到檔案了 ⇒ 紅，
 *      要求把它從名單刪掉（⭐ 否則名單會變成一句過期的散文）
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CONTENT = join(ROOT, "content");

/**
 * ⭐ GH#1181 —— 今天 `modelKey` 指到一顆**不存在的 GLB** 的 45 支英雄。
 *
 * ⚠️ 它們**不會壞掉**，玩家看到的是程序化體素替身 ⇒ ⛔ 沒有人會回報。
 * ⭐ 那些 GLB **從來沒有進過版控** —— `content/assets/models/community/` 這個目錄
 * 根本不存在（⛔ 不是被 `.gitignore` 擋掉，`git check-ignore` 沒有命中）。
 *
 * ⭐ 三群，⛔ 而它們缺席的理由不一樣：
 *   · `b2-*`（14）· `community-review-*`（24）—— 社群投稿的上傳模型，⭐ 檔案沒跟著進 repo
 *   · `lol-*`（7）—— GH#1158 自己的收尾逐字寫過：「⑤ 正式發布 ⛔ **0/7** —— S3 零顆、repo 零引用」
 *
 * ⛔ **這張名單只能變短。** 找回一顆就刪掉那一行（⭐ 沒刪會紅 —— 見第三條測試）。
 */
const KNOWN_MISSING_GLB: readonly string[] = [
  // ── b2-*（第二批 37 名裡的 14 支）
  "b2-albus",
  "b2-bojji",
  "b2-goblin",
  "b2-kisaragi",
  "b2-kumoko",
  "b2-maple",
  "b2-maple-alt-9769eb88b85b",
  "b2-misery",
  "b2-popp",
  "b2-rem",
  "b2-rin",
  "b2-takopi",
  "b2-yogiri",
  "b2-zenitsu",
  // ── community-review-*（社群 37 名裡的 24 支）
  "community-review-01-20260907",
  "community-review-03-20260907",
  "community-review-04-20260907",
  "community-review-06-20260907",
  "community-review-08-20260907",
  "community-review-10-20260907",
  "community-review-12-20260907",
  "community-review-13-20260907",
  "community-review-16-20260907",
  "community-review-17-20260907",
  "community-review-18-20260907",
  "community-review-19-20260907",
  "community-review-20-20260907",
  "community-review-21-20260907",
  "community-review-23-20260907",
  "community-review-24-20260907",
  "community-review-25-20260907",
  "community-review-26-20260907",
  "community-review-27-20260907",
  "community-review-28-20260907",
  "community-review-29-20260907",
  "community-review-31-20260907",
  "community-review-32-20260907",
  "community-review-35-20260907",
  // ── lol-* —— ⭐ **2026-09-11 七名全部找回來了**（合併 `codex/community-acquired-heroes`：
  //   那條分支帶的 34 顆 GLB 裡有 7 顆正好是他們缺的）⇒ ⛔ 這一群已經空了。
  //   ⭐ 而這條閘**正確地叫了**：它要求修好的那幾支從名單上劃掉，⛔ 不是留著變成過期的散文。
];

interface HeroModel {
  readonly id: string;
  readonly championId: string;
  readonly path: string;
}

function shippedChampionModels(): HeroModel[] {
  const models = new Map<string, Record<string, unknown>>();
  for (const f of readdirSync(join(CONTENT, "models"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(CONTENT, "models", f), "utf8")) as Record<string, unknown>;
    if (typeof d.id === "string") models.set(d.id, d);
  }
  const out: HeroModel[] = [];
  for (const f of readdirSync(join(CONTENT, "champions"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const c = JSON.parse(readFileSync(join(CONTENT, "champions", f), "utf8")) as Record<string, unknown>;
    const key = c.modelKey;
    if (typeof key !== "string" || typeof c.id !== "string") continue;
    const m = models.get(key);
    if (m === undefined) continue; // 「查無此模型文件」是**另一條**閘的事
    const path =
      typeof m.glbPath === "string"
        ? m.glbPath
        : typeof m.path === "string"
          ? m.path
          : typeof m.sha256 === "string"
            ? `assets/models/community/${m.sha256}.glb`
            : null;
    if (path === null) continue; // 程序化／體素模型沒有 GLB —— ⛔ 它們本來就不該有
    out.push({ id: key, championId: c.id, path });
  }
  return out.sort((a, b) => (a.championId < b.championId ? -1 : 1));
}

const present = (p: string): boolean => existsSync(join(CONTENT, p)) || existsSync(join(ROOT, p));

describe("每一支上架英雄的模型檔要真的在（GH#1181）", () => {
  const rows = shippedChampionModels();
  const missing = rows.filter((r) => !present(r.path)).map((r) => r.championId);

  it("⭐ 量尺自證：真的有掃到英雄，而且已存在的那些量得到", () => {
    // ⛔ 沒有這一條，一個回空陣列的掃描會讓下面兩條**結構上永遠綠**。
    expect(rows.length, "⛔ 一支英雄都沒掃到 —— 偵測壞了").toBeGreaterThan(100);
    expect(rows.length - missing.length, "⛔ 一顆存在的 GLB 都沒量到 —— 路徑推導壞了").toBeGreaterThan(50);
  });

  it("⛔ 缺席的模型檔不可以變多（GH#1181 棘輪）", () => {
    const listed = new Set(KNOWN_MISSING_GLB);
    const fresh = missing.filter((id) => !listed.has(id));
    expect(
      fresh,
      `⛔ 這幾支英雄的 modelKey 指到一顆**不存在的 GLB** —— 玩家看到的是程序化體素替身，` +
        `而 \`AssetManager.load()\` 靜靜地回 null（fail-open 沒錯，靜默才是缺陷）。\n` +
        `⇒ 找回檔案，或把 modelKey 換成一個真的存在的模型。\n` +
        `⚠️ 真的要先讓它上架，就把 id 加進 KNOWN_MISSING_GLB **並寫下為什麼**（GH#1181）。`,
    ).toEqual([]);
  });

  it("⛔ 名單上已經修好的要劃掉（⭐ 否則它會變成一句過期的散文）", () => {
    const listed = KNOWN_MISSING_GLB;
    const fixed = listed.filter((id) => !missing.includes(id));
    expect(
      fixed,
      "⭐ 這幾支的 GLB 已經找得到了 —— 把它們從 KNOWN_MISSING_GLB 刪掉，" +
        "⛔ 讓名單繼續代表今天的真相。",
    ).toEqual([]);
  });
});
