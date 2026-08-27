/**
 * GH#565 / #674 —— `spawnVfx at:"bone"` 的**兩個名詞之間的關係**。
 *
 * ⚠️ `spawnVfx.vfxId` 是 **soft ref**（`zRef("vfx", { soft: true })`）——
 * 打錯一個字元，內容驗證是綠的、`content:build` 是綠的、schema 的
 * `at`⇔`attach` refine 也是綠的，而畫面上**一個像素都沒有**。
 * 那正是第一·五守則的形狀：每一個零件都是對的，只有它們的組合是空的。
 *
 * ── 這一支關掉的兩個口子（2026-08-27 lane W 量到的）─────────────────────
 *
 * ① **vfxId 指到一份不存在的文件。** soft ref 刻意不擋（美術可以後補），
 *    ⛔ 但「後補」與「打錯」在出貨的那一刻長得一模一樣。
 *
 * ② ⭐ **vfxId 指到一份 `attachment@1`（穿在骨頭上的網格）。**
 *    `spawnVfx` 走的是**粒子**通道（vfx@1 / ribbon@1）；原作有一整族掛件
 *    （`HeroCloudCyd.mdx` = mesh-only / 0 emitters）**表達不成粒子文件**，
 *    它們的住處是 `attachment@1` + ambient-vfx 綁定，⛔ 不是這裡。
 *    ⚠️ #565 票文把兩個通道混成一個（它要人去補一份 `model@1` 給
 *    `spawnVfx` 吃）—— 這一格就是那個誤讀的閘。
 *
 * ⭐ **⛔ 不可以空集合通過**：這一族在 2026-08-27 之前的出貨狀態正是
 * 「機制在、引用 0 份」，而一條掃描式守衛對空集合是**綠的**。
 * 所以下面第三條斷言釘住「至少要有一份引用」——⛔ 沒有它，這支守衛
 * 會在它最該紅的那一天保持沉默。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = <T,>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), "utf8")) as T;

/** 粒子通道收得下的 schema —— ⛔ `attachment@1`/`model@1` 不在內。 */
const PARTICLE_SCHEMAS = new Set(["vfx@1", "ribbon@1"]);

type BoneUse = { ability: string; vfxId: string; attach: string };

/** 遞迴撈出每一個 `at:"bone"` 的 spawnVfx（巢狀在 comboStrikes/onHit/… 底下也算）。 */
function collect(node: unknown, ability: string, out: BoneUse[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, ability, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  if (o.kind === "spawnVfx" && o.at === "bone") {
    out.push({ ability, vfxId: String(o.vfxId), attach: String(o.attach) });
  }
  for (const v of Object.values(o)) collect(v, ability, out);
}

describe("spawnVfx at:\"bone\" 指到的 vfx 文件真的存在、而且是粒子通道", () => {
  const uses: BoneUse[] = [];
  for (const f of readdirSync(join(ROOT, "content/abilities")).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    collect(read(`content/abilities/${f}`), f.replace(/\.json$/, ""), uses);
  }

  const entries = read<{ entries: { id: string; path: string }[] }>("content/vfx/_index.json").entries;
  const byId = new Map(entries.map((e) => [e.id, e.path]));

  it("① 每一個 vfxId 都在 content/vfx 的登錄表裡（soft ref 的洞）", () => {
    const missing = uses.filter((u) => !byId.has(u.vfxId));
    expect(missing, `這幾支的 at:"bone" 指到不存在的 vfx 文件 ⇒ 靜靜地零像素：\n${
      missing.map((m) => `  ${m.ability} → ${m.vfxId}`).join("\n")
    }`).toEqual([]);
  });

  it("② ⛔ 不可以指到 attachment@1（那是網格掛件，⛔ 不是粒子）", () => {
    const wrong = uses
      .filter((u) => byId.has(u.vfxId))
      .map((u) => ({ ...u, schema: read<{ schema: string }>(`content/${byId.get(u.vfxId)!}`).schema }))
      .filter((u) => !PARTICLE_SCHEMAS.has(u.schema));
    expect(wrong, `spawnVfx 走粒子通道；這幾筆指到別的 schema（mesh 掛件請走 attachment@1 + ambient-vfx）：\n${
      wrong.map((w) => `  ${w.ability} → ${w.vfxId} (${w.schema})`).join("\n")
    }`).toEqual([]);
  });

  it("③ ⭐ 至少有一支出貨技能引用它（⛔ 空集合不算通過）", () => {
    expect(uses.length, 'at:"bone" 機制在引擎裡，而出貨內容引用 0 份 —— 這支守衛會對空集合永遠綠').toBeGreaterThan(0);
  });
});
