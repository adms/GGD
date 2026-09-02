/**
 * ⭐⭐ **反打的範圍語意說得出真話**（GH#941）。
 *
 * owner 2026-09-02 逐字：
 * > 「20-04 Avalon 77-00 浮雲-旋一閃 => 這兩個是**反彈條件單體**，但**反彈傷害是範圍**喔」
 *
 * ⚠️ ⭐ 而動手之後量到一件票文沒寫的事：**兩支不是同一個形狀**。
 *
 * | | 今天 | 為什麼 |
 * |---|---|---|
 * | **77-00 浮雲** | ⭐ 已改成 `damageArea`（`radiusTier: "小"`） | 它的傷害是純 `damageTier + ratios` ⇒ 換 kind 就成 |
 * | **20-04 Avalon** | ⛔ 仍是單體 `damage` | ⭐ 它帶 `incomingPct`（「反彈受到傷害的 X%」）—— 而 `damageArea` **收不下那一格** |
 *
 * ⛔⛔ 而把 `incomingPct` 複製進 `damageArea` 是**第二個住處**：
 * 那一族的邏輯住在 `sim/effects/damage.ts`（深度記帳、`negateOriginal`、
 * 避免乘兩次的 `applyGlobalDamageMult`），⭐ 複製它遲早分歧。
 * ⇒ 20-04 要的是**一個新機制**（範圍反彈），⛔ 不是換一個 kind ——
 * 誠實列在票上，⛔ 不假裝做完了。
 *
 * ⭐ 這一支釘的是**兩個方向**（票文 Scope ⑤ 逐字）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = join(ROOT, "content/abilities");

interface Hook {
  on?: string;
  target?: string;
  effects?: { kind?: string; radius?: number; radiusTier?: string; incomingPct?: unknown }[];
}

/** 出貨樹上每一個「反應式」hook（`onEvade` / `onDamageTaken`）。 */
function reactiveHooks(): { id: string; hook: Hook }[] {
  const out: { id: string; hook: Hook }[] = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(DIR, f), "utf8")) as { id: string };
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== "object") return;
      const h = o as Hook;
      if (h.on === "onEvade" || h.on === "onDamageTaken") out.push({ id: d.id, hook: h });
      for (const v of Object.values(o)) walk(v);
    };
    walk(d);
  }
  return out;
}

describe("反應式 hook 的範圍語意（GH#941）", () => {
  const hooks = reactiveHooks();

  it("⭐ 量尺先自證：真的掃到反應式 hook 了", () => {
    expect(hooks.length, "⛔ 一個都沒有 ⇒ 這條在量空氣").toBeGreaterThan(0);
  });

  it("★★ ⭐ 正方向：宣告 `damageArea` 的**一定有半徑**（⛔ 否則打不到任何人）", () => {
    const bad: string[] = [];
    for (const { id, hook } of hooks)
      for (const e of hook.effects ?? [])
        if (e.kind === "damageArea" && !(typeof e.radius === "number" && e.radius > 0))
          bad.push(`${id}(${hook.on})`);
    expect(bad, "⛔ 宣告了範圍而沒有半徑 —— 那一發打不到任何人").toEqual([]);
  });

  it("★★ ⭐ 反方向：半徑**落在五級距上**（⛔ 不是一個字面值第二住處）", () => {
    const tiers = JSON.parse(
      readFileSync(join(ROOT, "content/config/aoe-tiers.json"), "utf8"),
    ) as { radius: Record<string, number> };
    const bad: string[] = [];
    for (const { id, hook } of hooks)
      for (const e of hook.effects ?? [])
        if (e.kind === "damageArea") {
          if (!e.radiusTier) bad.push(`${id}: 沒有 radiusTier`);
          else if (tiers.radius[e.radiusTier] !== e.radius)
            bad.push(`${id}: radius ${e.radius} ≠ 級距「${e.radiusTier}」的 ${tiers.radius[e.radiusTier]}`);
        }
    expect(bad, "⛔ 半徑與級距表對不上 ⇒ 那是第二個住處（第〇·四守則）").toEqual([]);
  });

  it("⭐⭐ 77-00 浮雲**真的是範圍**了（owner 2026-09-02 逐字要求）", () => {
    const d = JSON.parse(
      readFileSync(join(DIR, "godie-e00w.passive.json"), "utf8"),
    ) as { passive?: { ranks?: { hooks?: Hook[] }[] } };
    const h = d.passive?.ranks?.[0]?.hooks?.find((x) => x.on === "onEvade");
    expect(h, "⛔ 那個 onEvade hook 不見了").toBeTruthy();
    const dmg = (h!.effects ?? []).find((e) => e.kind === "damageArea");
    expect(dmg, "⛔ 迴避反擊還是單體 —— owner 逐字說它是範圍").toBeTruthy();
  });

  it("⛔ Avalon 仍是單體 —— ⭐ 而那是**記錄的事實**，⛔ 不是被遺忘", () => {
    // ⚠️ 這一條**刻意驗它還沒改**：它帶 `incomingPct`，而 `damageArea` 收不下。
    //   ⭐ 哪天有人把範圍反彈的機制做出來 ⇒ 這一條會紅，而那是**提醒回來改票**，
    //   ⛔ 不是回歸。
    const d = JSON.parse(readFileSync(join(DIR, "godie-e002.r.json"), "utf8")) as {
      effects?: { hooks?: Hook[] }[];
    };
    const h = d.effects?.[0]?.hooks?.find((x) => x.on === "onDamageTaken");
    const e = (h?.effects ?? []).find((x) => x.incomingPct !== undefined);
    expect(e, "⛔ 那個反彈效果不見了").toBeTruthy();
    expect(
      e!.kind,
      "⭐ 它變成 damageArea 了 ⇒ 表示範圍反彈的機制做出來了 —— 回 GH#941 把這一條改掉",
    ).toBe("damage");
  });
});
