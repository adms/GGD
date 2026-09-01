/**
 * ⭐⭐ **`template:` 文件自己寫的效果不可以被無聲吃掉**（GH#698 的推廣，2026-09-02）。
 *
 * ── ⛔ 量到的 ────────────────────────────────────────────────────────────
 * 12 份出貨文件同時有 `template` 與自己的 `effects`。GH#698 只救了 `spawnModelFx`
 * 那 9 份 —— ⭐ 而**另外 3 份帶的是行為**：
 *
 * | 技能 | 被吃掉的 | 玩家看到什麼 |
 * |---|---|---|
 * | `godie-etyr.r`（14-04 聖夜降臨） | `damageArea` | ⭐ 卡面印**裸的 `{{dmg}}`**，而且真的沒有傷害 |
 * | `godie-nbbc.w` | `blink` | 卡面說位移，⛔ 而人不會動 |
 * | `godie-udea.w` | `dash` | 同上 |
 *
 * ⚠️ ⭐ 而它是**兩層一起錯**才看得見的：`{{dmg}}` 綁不上是因為效果樹裡沒有傷害葉，
 * ⛔ 而效果樹裡沒有傷害葉是因為展開把它刪了。⇒ 少了任何一層，這個缺陷是**靜默**的
 * （`godie-nbbc.w` / `godie-udea.w` 的卡面沒有佔位符 ⇒ 它們**今天仍然是靜默的**，
 * 只有這條守衛叫得出來）。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `mergeExpansion` 的保留改回只留 `spawnModelFx` → 🔴（三支的行為全部消失）
 *   · 保留條件的「展開已有同 kind ⇒ 不留」拿掉 → 🔴（同一個 kind 出現兩次）
 */
import { describe, expect, it, beforeAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Abilities } from "../sim/content/registry";
import { registerAll } from "./registries";
import { ContentLoader } from "./loader";
import { mergeExpansion } from "./templates/expand";
import { shippedContentSource } from "./__fixtures__/shippedContent";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

interface Doc {
  readonly id: string;
  readonly template?: unknown;
  readonly effects?: { kind?: string }[];
}

let onDisk: Doc[] = [];

beforeAll(async () => {
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  onDisk = readdirSync(join(CONTENT, "abilities"))
    .filter((f) => f.endsWith(".json") && f !== "_index.json")
    .map((f) => JSON.parse(readFileSync(join(CONTENT, "abilities", f), "utf8")) as Doc);
});

describe("template 文件自己寫的效果", () => {
  it("★★ ⭐ 每一個 kind 都活到註冊表裡（除非展開自己產出了同一個 kind）", () => {
    const lost: string[] = [];
    let checked = 0;
    for (const d of onDisk) {
      if (d.template === undefined || d.template === null) continue;
      const authored = (d.effects ?? []).map((e) => e.kind).filter((k): k is string => !!k);
      if (authored.length === 0) continue;
      const reg = Abilities.get(d.id as never) as unknown as Doc | undefined;
      if (reg === undefined) continue;
      checked += 1;
      const got = new Set((reg.effects ?? []).map((e) => e.kind));
      for (const k of new Set(authored)) {
        if (!got.has(k)) lost.push(`${d.id} 掉了 ${k}`);
      }
    }
    expect(checked, "儀器：一份同時有 template 與 effects 的文件都沒讀到 ⇒ 下面量的是空氣")
      .toBeGreaterThan(5);
    expect(
      lost,
      "⛔⛔ 這幾支自己寫的效果**在註冊表裡消失了** —— ⭐ JSON 上看起來完全正確、\n" +
        "   Zod 收得下、卡片印得出來，⛔ 而遊戲裡不存在（第一·五守則最貴的那個形狀）。",
    ).toEqual([]);
  });

  it("★★ ⭐ 展開**自己產出同一個 kind** ⇒ ⛔ 不保留（兩個節點會打架）", () => {
    // ⚠️ ⭐ 這一條刻意是**單元**測試而不是掃出貨樹：
    //   出貨樹上「同一個 kind 出現兩次」是**合法**的（`godie-hvsh.r` 自己就寫了
    //   3 個 `spawnModelFx`，而展開一個都沒產出 ⇒ 三個都該留）。
    //   ⛔ 掃出貨樹分不出「作者寫了三個」與「保留邏輯疊了三次」——
    //   ⭐ 而要問的是後者。
    const skeleton = {
      id: "x",
      effects: [{ kind: "spawnModelFx", modelKey: "作者的" }, { kind: "dash", distance: 3 }],
    };
    const expansion = {
      effects: [{ kind: "spawnModelFx", modelKey: "模板的" }],
    } as unknown as Parameters<typeof mergeExpansion>[1];
    const merged = mergeExpansion(skeleton, expansion);
    const kinds = (merged["effects"] as { kind: string; modelKey?: string }[]).map((e) => e.kind);
    expect(kinds.filter((k) => k === "spawnModelFx").length, "⛔ 疊出了第二具模型").toBe(1);
    expect(
      (merged["effects"] as { kind: string; modelKey?: string }[])[0]?.modelKey,
      "⛔ 保留的是作者那一個 —— ⭐ 展開產出時應該**模板贏**",
    ).toBe("模板的");
    // ⭐ 而展開**沒有**產出的那個 kind 要活下來。
    expect(kinds, "⛔ `dash` 被吃掉了").toContain("dash");
  });

  it("★★ ⭐ **冪等** —— 把已經 merge 過的結果再 merge 一次，⛔ 不會長大", () => {
    const expansion = { effects: [{ kind: "summon", count: 1 }] } as unknown as Parameters<
      typeof mergeExpansion
    >[1];
    const once = mergeExpansion(
      { id: "x", effects: [{ kind: "damageArea", radius: 6 }] },
      expansion,
    );
    const twice = mergeExpansion(once, expansion);
    expect(
      (twice["effects"] as unknown[]).length,
      "⛔⛔ 重新 merge 一份已經 merge 過的文件疊出了第二份 ⇒\n" +
        "⭐ 而 `registries` 在 standalone 與 champion-embedded 兩條路上都會 merge",
    ).toBe((once["effects"] as unknown[]).length);
  });

  it("★ ⭐ 展開**沒有 `effects`** ⇒ ⛔ 不保留（純被動／純標記的模板不跑 effects）", () => {
    const merged = mergeExpansion(
      { id: "x", effects: [{ kind: "dash", distance: 3 }] },
      { passive: {} } as unknown as Parameters<typeof mergeExpansion>[1],
    );
    expect(
      merged["effects"],
      "⛔ 硬塞進去只是把「被洗掉」換成「留著但沒有人跑」—— 同一個謊，更難查",
    ).toBeUndefined();
  });

  it("★★ ⭐ 14-04 聖夜降臨：召喚**與**傷害都在（⛔ 這是引發這條守衛的那一支）", () => {
    const reg = Abilities.get("godie-etyr.r" as never) as unknown as
      | (Doc & { description?: string })
      | undefined;
    expect(reg, "儀器：這一支不在註冊表裡").toBeDefined();
    const kinds = (reg?.effects ?? []).map((e) => e.kind);
    expect(kinds, "⛔ 召喚不見了").toContain("summon");
    expect(kinds, "⛔⛔ 傷害不見了 —— 而卡面逐字說「召喚瞬間會造成周圍…傷害」").toContain(
      "damageArea",
    );
    expect(
      reg?.description ?? "",
      "⛔ 卡面還印著裸的佔位符 —— 玩家會直接看到 `{{dmg}}`",
    ).not.toContain("{{");
  });
});
