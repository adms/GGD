/**
 * ⭐⭐ **預設演出規則只有一個住處**（Codex 阻塞清單 P0-3）。
 *
 * Codex 逐字：「**`GameApp`、`VfxSystem`、`VfxScriptPlayer`、產生器不可各自維護不同規則。**」
 *
 * ⛔ 在此之前它們散在 `EntityViewRegistry` 的**六個 case** 裡，各自寫死一行 `pulse(...)`
 * ⇒ ⭐ 外部編輯器**問不出**這張表，⛔ 而新增事件時漏接不會有任何東西紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRESENTATION_RULES,
  NEVER_FAKE_CAST_TRIGGERS,
  resolveAbilityPresentation,
} from "./abilityPresentation";
import { ANIM_PULSES } from "./animPulse";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function shipped(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === "dist" || n.startsWith(".")) continue;
    const f = join(dir, n);
    if (statSync(f).isDirectory()) shipped(f, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.|\.spec\./.test(n)) out.push(f);
  }
  return out;
}

describe("預設演出規則的唯一住處（Codex P0-3）", () => {
  it("⭐ 每一條規則的 `pulse` 都在**詞彙表**裡（⛔ 不是一個自由字串）", () => {
    for (const r of PRESENTATION_RULES) {
      expect(
        (ANIM_PULSES as readonly string[]).includes(r.pulse),
        `⛔ ${r.trigger}/${r.actor} 的 pulse "${r.pulse}" 不在 ANIM_PULSES 裡`,
      ).toBe(true);
      expect(r.why.length, `⛔ ${r.trigger}/${r.actor} 沒有寫理由`).toBeGreaterThan(20);
      expect(r.channel.length, `⛔ ${r.trigger}/${r.actor} 沒有取代通道`).toBeGreaterThan(3);
    }
  });

  it("⭐ 同一個 `trigger × actor` 不可以有兩列（⛔ 否則查表會播兩次）", () => {
    const seen = new Set<string>();
    for (const r of PRESENTATION_RULES) {
      const k = `${r.trigger}|${r.actor}`;
      expect(seen.has(k), `⛔ ${k} 有兩列 ⇒ 同一刀會播兩份動作`).toBe(false);
      seen.add(k);
    }
  });

  it("⭐⭐ Codex 逐字點名的規則**逐條都在**（⛔ 不是「有一張表」就算）", () => {
    const has = (t: string, a: string, p: string): boolean =>
      resolveAbilityPresentation(t as never).some((r) => r.actor === a && r.pulse === p);
    // 「主動技能在 castStart/castEffect 必須有施法者 cast/attack」
    expect(has("abilityCast", "caster", "cast"), "⛔ 施法沒有施法者動作").toBe(true);
    // 「每個權威 strikeIndex 必須有施法者 attack ＋ 目標 hurt/reaction」
    expect(has("comboStrike", "caster", "attack"), "⛔ 連斬沒有攻擊者動作").toBe(true);
    expect(has("comboStrike", "target", "hurt"), "⛔ 連斬沒有受擊反應").toBe(true);
    // 「projectileHit 必須有目標反應」
    expect(has("projectileHit", "target", "hurt"), "⛔ 投射物命中沒有目標反應").toBe(true);
    // 「格擋：防禦者播放 guard」⛔ 不是 hurt
    expect(has("hitImpactBlocked", "target", "guard"), "⛔ 格擋沒有播 guard").toBe(true);
    expect(has("hitImpactBlocked", "target", "hurt"), "⛔ 格擋播了 hurt —— Codex 逐字禁止").toBe(false);
    // 「迴避：防禦者播放 dodge」
    expect(has("evade", "target", "dodge"), "⛔ 迴避沒有播 dodge").toBe(true);
    // 「反彈：從 reflectSuccess 播放防禦／反擊動作」
    expect(has("reflectSuccess", "target", "guard"), "⛔ 反彈沒有動作").toBe(true);
    // 「displace/leapStart 等位移節點應有對應角色動作」
    expect(has("displace", "caster", "cast"), "⛔ 位移沒有施法者動作").toBe(true);
  });

  it("⛔ **純被動不可以生成假的 cast** —— 那幾個 trigger 永遠不在表上", () => {
    for (const t of NEVER_FAKE_CAST_TRIGGERS) {
      expect(
        PRESENTATION_RULES.some((r) => r.trigger === (t as never)),
        `⛔ ${t} 出現在預設演出表上 ⇒ 一個純被動會演出一次假的施放`,
      ).toBe(false);
    }
  });

  it("⭐⭐ 出貨原始碼裡**沒有第二處**在寫死「事件 → 動作」", () => {
    // ⛔ 掃「有沒有 import 這張表」是形態⑥ —— ⭐ 這裡掃的是**繞過它的寫法**：
    //   在事件分派的檔案裡直接呼叫 `pulse("<字面值>"` 或 `trigger<Guard|Dodge|Hurt>`。
    const HOME = join(ROOT, "packages/shared/src/content/abilityPresentation.ts");
    const VIEW = join(ROOT, "apps/client/src/render/views/ChampionView.ts");
    const offenders: string[] = [];
    for (const dir of ["apps/client/src/render", "apps/client/src/vfx", "apps/client/src/game"]) {
      for (const f of shipped(join(ROOT, dir))) {
        if (f === HOME || f === VIEW) continue; // ⭐ ChampionView 是**執行**者不是決策者
        const code = readFileSync(f, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        // ⚠️ `playDefaultPresentation` 內部那一行是合法的（它就是查表的結果）
        if (/\.pulse\(\s*"(attack|cast|hurt|guard|dodge)"/.test(code)) {
          offenders.push(relative(ROOT, f));
        }
      }
    }
    expect(
      offenders,
      "⛔ 這些檔在事件分派層**寫死**了「播哪一塊動作」⇒ 規則有了第二個住處。\n" +
        '   ⇒ 改成 `resolveAbilityPresentation("<trigger>")` 查表。',
    ).toEqual([]);
  });
});
