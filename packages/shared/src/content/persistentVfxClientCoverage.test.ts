/**
 * ⭐ GH#539 —— 常駐特效（`ability@1.persistentVfx`）的**客戶端可算繪性**。
 *
 * 客戶端今天只解析 `when` **缺席**的那一批（＝原作的
 * `GetUnitAbilityLevel(u, id) > 0`：「這支技能在身上就掛著」）。帶條件的那些需要
 * `SimWorld` 才求得了值（條件葉住在 sim 那一側），⛔ 而客戶端刻意不重寫一份會跟
 * sim 漂開的求值器（第二守則失敗形態⑤：被測的不是出貨的那個）。
 *
 * ⛔ 問題是「不支援就靜靜不掛」與「條件沒成立」**長得一模一樣** ——
 * 於是有人加了一格帶 `when` 的常駐特效之後，畫面上什麼都不會發生，
 * 而 `content:build` 與全套測試都是綠的（失敗形態②）。
 *
 * ⇒ 這條守衛把它變成一個**會紅的東西**：出貨內容一出現客戶端算不了的 `when`，
 * 就必須先去把求值接上（或明確登記豁免），⛔ 不是讓它靜靜消失。
 *
 * ⚠️ 它驗的是**機制的可達性**，⛔ 不是任何一個 vfxKey 或數值。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ABILITIES = join(__dirname, "../../../../content/abilities");
const CHAMPIONS = join(__dirname, "../../../../content/champions");

interface Spec {
  vfxKey?: unknown;
  when?: unknown;
}

/** 走訪整棵樹撈出每一個 `persistentVfx` 陣列（standalone 與 champion 內嵌都要）。 */
function collect(node: unknown, out: { file: string; spec: Spec }[], file: string): void {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out, file);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  const pv = rec["persistentVfx"];
  if (Array.isArray(pv)) for (const spec of pv) out.push({ file, spec: spec as Spec });
  for (const v of Object.values(rec)) collect(v, out, file);
}

function allSpecs(): { file: string; spec: Spec }[] {
  const out: { file: string; spec: Spec }[] = [];
  for (const dir of [ABILITIES, CHAMPIONS]) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      collect(JSON.parse(readFileSync(join(dir, f), "utf-8")), out, f);
    }
  }
  return out;
}

describe("persistentVfx 的客戶端可算繪性 (GH#539)", () => {
  it("每一份出貨的常駐特效，客戶端今天都算得出來（`when` 缺席）", () => {
    const unsupported = allSpecs()
      .filter((s) => s.spec.when !== undefined)
      .map((s) => `${s.file}: ${String(s.spec.vfxKey)}`);
    expect(
      unsupported,
      "這些常駐特效帶著 `when`，而客戶端（GameApp.persistentVfxFor）只解析 `when` 缺席的那一批 —— " +
        "⛔ 現在它們在遊戲裡什麼都不會發生，而且看起來跟「條件沒成立」一模一樣。" +
        "要嘛把條件求值接上（需要 sim→snapshot），要嘛把 `when` 拿掉。",
    ).toEqual([]);
  });

  it("每一個 vfxKey 都指向一份真的存在的文件", () => {
    const ids = new Set(
      readdirSync(join(__dirname, "../../../../content/vfx"))
        .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
        .map((f) => f.slice(0, -5)),
    );
    const dangling = allSpecs()
      .map((s) => String(s.spec.vfxKey))
      .filter((k) => !ids.has(k));
    expect(dangling, "常駐特效指向不存在的 vfx 文件 ⇒ 場上永遠是空的").toEqual([]);
  });
});
