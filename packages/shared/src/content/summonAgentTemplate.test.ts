/**
 * ⭐⭐ GH#898 / GH#903 —— 召喚代理模板。
 *
 * ── ⛔ 在此之前 ────────────────────────────────────────────────────────
 * owner 2026-09-01：「**普屋 分身沒有任何分身**」。
 * ⭐ 而引擎的 `summon` 機制**早就出貨**（`schema/effects/summon.ts`，20 個決策點
 * 全部是資料），⛔ 問題是**沒有任何一支技能用得到它** ——
 * `tpl-summon-agent.json` 是一份 `status:"draft"` 的**空殼**（`params: {}`）。
 * ⇒ 於是 9 支召喚／分身技能被丟進**別的**模板：普屋 E 拿到的是
 *   `tpl-single-strike`（⭐ **單體打擊**）⇒ 卡面說「創造出 2 個實體」而它只打一下。
 *
 * ⭐ 這條驗的是**出貨那一份真的展得出召喚**，⛔ 不是「schema 收得下」（形態⑤）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `FAMILIES["summon-agent"]` 的 `summon` 那一格拿掉 → ① 紅
 *   · 模板 `params` 拿掉 `cleanse`                      → ③ 紅（卡面第三件事消失）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expandStack } from "./templates/expand";

const ROOT = resolve(__dirname, "../../../..");
const doc = (dir: string, id: string) =>
  JSON.parse(readFileSync(resolve(ROOT, "content", dir, `${id}.json`), "utf8")) as Record<string, unknown>;

function expandShipped(abilityId: string): Record<string, unknown>[] {
  const a = doc("abilities", abilityId);
  const cards = (Array.isArray(a.template) ? a.template : [a.template]).map(
    (c: { ref: string; params?: Record<string, unknown> }) => ({
      template: doc("ability-templates", c.ref) as never,
      params: c.params ?? {},
    }),
  );
  return (expandStack(cards as never).result as unknown as { effects: Record<string, unknown>[] }).effects;
}

describe("GH#898 普屋 E 真的生得出 2 個分身", () => {
  const effects = expandShipped("godie-huth.e");

  it("★ ① 展開之後**有一格 `summon`**（⛔ 在此之前它是 `damage` —— 單體打擊）", () => {
    const s = effects.find((e) => e.kind === "summon");
    expect(
      s,
      `⛔ 展開出來的是 ${effects.map((e) => e.kind).join("/")} —— ⭐ 卡面說「創造出 2 個普烏的實體」`,
    ).toBeDefined();
    expect(s!.count, "⛔ 卡面逐字寫「2 個」").toBe(2);
    expect(s!.body, "⭐ 「普烏的實體」＝ 複製施法者自己（⛔ 不必再指名一次英雄 id）").toBe("self");
  });

  it("★ ② 卡面的另外兩個數字也到得了（30% 攻擊力 · 10 秒）", () => {
    const s = effects.find((e) => e.kind === "summon")!;
    expect(s.damageMult, "⛔ 卡面「具有 30% 攻擊力」").toBe(0.3);
    expect(s.durationSec, "⛔ 卡面「可持續 10 秒」").toBe(10);
  });

  it("★ ③ 「除掉身上的所有法術效果」是**獨立的一格**（⛔ 綁死在召喚裡就表達不出只召喚的技能）", () => {
    const d = effects.find((e) => e.kind === "dispel");
    expect(d, "⛔ 卡面第三件事沒有任何實作（第一·五守則）").toBeDefined();
    // ⭐ ⛔ 沒有 `applyTo` 也沒有 `side` —— Zod 逐字擋掉：「`shape:"single"` 讀不到 `side`⋯
    //   否則這一格是一個看起來有設、其實沒有人讀的數字」（第一·五守則）。
    expect(d!.shape, "⭐ single ＝ 只清施法者自己（卡面：除掉**身上**的法術效果）").toBe("single");
    expect((d!.pools as { status?: boolean }).status).toBe(true);
  });

  it("⭐ ④ 模板不再是草稿（⛔ 一份 draft 的空殼與不存在沒有差別）", () => {
    const t = doc("ability-templates", "tpl-summon-agent");
    expect(t.status).toBe("enabled");
    expect(Object.keys(t.params as object).length).toBeGreaterThan(5);
  });

  it("⭐ ⑤ 它是**一道機制**：`FAMILIES` 裡零個 `if (family === …)`（第〇·五守則）", () => {
    const src = readFileSync(resolve(ROOT, "packages/shared/src/content/templates/expand.ts"), "utf8");
    const body = src.slice(src.indexOf('"summon-agent": (t, p)'), src.indexOf('"single-strike": (t, p)'));
    expect(body.includes("godie-huth"), "⛔ 家族 builder 裡出現了某一支技能的 id ＝ 越線").toBe(false);
    // ⭐ 其餘 8 支召喚技能也指得過來 —— 這裡只證「模板存在且可用」，⛔ 不代它們接線。
    const users = readdirSync(resolve(ROOT, "content/abilities")).filter(
      (f) => f.endsWith(".json") && readFileSync(resolve(ROOT, "content/abilities", f), "utf8").includes("tpl-summon-agent"),
    );
    expect(users.length, "⛔ 一支都沒有人用 ⇒ 模板做了等於沒做").toBeGreaterThan(0);
  });
});
