/**
 * ⭐【技能施法音的 cue 宣告住 JSON，而且那份 JSON 真的在管事】(GH#529)
 *
 * 三條，各自關掉一個**「每一半都是對的，只有組合是空的」**的形態：
 *   ① 出貨的 JSON 宣告的每一個 cue，都要真的是引擎播得出來的那條路
 *      （`SFX_REACHABILITY` 的 `abilityCast/sfxKey` 列）。JSON 憑空多一個名字 →
 *      執行期會變成一次 audio-map miss（＝靜音），⛔ 而不是退回元素風聲。
 *   ② 註冊表**真的換得掉** —— 這是承重的那一條：`applyAbilitySfxCuesDoc` 一旦
 *      失效，52 支技能會靜靜退回推導值，而其餘每一條測試照樣全綠。
 *   ③ `bindings` 覆蓋層不可以與 `content/abilities/*.json` 的 `sfxKey` 重疊 ——
 *      同一支技能兩個住處必然分岔（CLAUDE.md 第〇·四）。
 *
 * ⛔ 這裡**不驗數字**（cue 有幾個、誰用哪一個）：那是內容，住 JSON，會變。
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ABILITY_SFX_CUES_PATH,
  abilitySfxCueAllowed,
  abilitySfxCueForAbility,
  abilitySfxCueRegistry,
  applyAbilitySfxCuesDoc,
  derivedAbilityCastCues,
  resetAbilitySfxCuesForTest,
} from "./abilitySfxCues";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = join(HERE, "../../../../content");
const DOC = JSON.parse(readFileSync(join(CONTENT, ABILITY_SFX_CUES_PATH), "utf8")) as {
  cues: Record<string, { ggSnd?: string; origin?: string }>;
  bindings: Record<string, string>;
  unmatched: { ability: string; reason: string }[];
};

afterEach(resetAbilitySfxCuesForTest);

describe("技能施法音 cue 註冊表 (GH#529)", () => {
  it("出貨 JSON 宣告的每一個 cue，引擎都真的走得到那條路", () => {
    const reachable = derivedAbilityCastCues();
    expect(reachable.size, "推導集合是空的 —— 這條在測空氣").toBeGreaterThan(40);
    const ghosts = Object.keys(DOC.cues).filter((c) => !reachable.has(c));
    expect(
      ghosts,
      "這幾個 cue 在 JSON 上被宣告成「技能可以用」，但 sfxReachability 沒有一列說它由 " +
        "`abilityCast` 的 `sfxKey` 播 ⇒ 執行期是一次 audio-map miss（靜音），⛔ 不是退回風聲。" +
        "補它要**同時**加 reachability 那一列：\n  " + ghosts.join("\n  "),
    ).toEqual([]);
  });

  it("承重：換一份文件，註冊表就真的換掉（⛔ 不是永遠回推導值）", () => {
    expect(abilitySfxCueAllowed("wc3.zzz-not-a-cue")).toBeNull();
    const ok = applyAbilitySfxCuesDoc({
      schema: "audio.ability-sfx-cues@1",
      cues: { "wc3.zzz-not-a-cue": {} },
      bindings: { "godie-test.q": "wc3.zzz-not-a-cue" },
    });
    expect(ok, "文件沒有被接受").toBe(true);
    expect(abilitySfxCueAllowed("wc3.zzz-not-a-cue")).toBe("wc3.zzz-not-a-cue");
    expect(abilitySfxCueForAbility("godie-test.q")).toBe("wc3.zzz-not-a-cue");
    // 別的文件（schema 不符 / 空的 cues）一律**不動**現行註冊表
    expect(applyAbilitySfxCuesDoc({ schema: "audio.other@1", cues: { a: {} } })).toBe(false);
    expect(applyAbilitySfxCuesDoc({ schema: "audio.ability-sfx-cues@1", cues: {} })).toBe(false);
    expect(abilitySfxCueAllowed("wc3.zzz-not-a-cue")).toBe("wc3.zzz-not-a-cue");
    resetAbilitySfxCuesForTest();
    expect(abilitySfxCueRegistry().cues.has("wc3.zzz-not-a-cue")).toBe(false);
  });

  it("`bindings` 覆蓋層⛔ 不可以碰已經有 `sfxKey` 的技能，`unmatched` 也要指真的技能", () => {
    const bound = new Map<string, string>();
    for (const f of readdirSync(join(CONTENT, "abilities"))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const d = JSON.parse(readFileSync(join(CONTENT, "abilities", f), "utf8")) as {
        sfxKey?: string;
      };
      if (d.sfxKey) bound.set(f.slice(0, -5), d.sfxKey);
    }
    expect(bound.size, "沒有任何技能帶 sfxKey —— 這條在測空氣").toBeGreaterThan(0);
    const clash = Object.keys(DOC.bindings).filter((a) => bound.has(a));
    expect(
      clash,
      "這幾支技能同時被 `bindings` 與自己的 `sfxKey` 指定 —— 兩個住處必然分岔：\n  " +
        clash.join("\n  "),
    ).toEqual([]);
    // 每一列 unmatched 都要有理由,而且指的是一支**真的出貨**的技能 ——
    // ⛔ 一張指向不存在技能的舊名單,讀的人會以為那是還沒付的帳。
    const shipped = new Set(readdirSync(join(CONTENT, "abilities")));
    for (const row of DOC.unmatched) {
      expect(row.reason.length, `${row.ability} 的 unmatched 沒有理由`).toBeGreaterThan(8);
      expect(shipped.has(`${row.ability}.json`), `unmatched 指到不存在的技能 ${row.ability}`).toBe(true);
    }
  });
});
