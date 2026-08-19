/**
 * ⛔ **卡片上寫的數字，必須是引擎裡真的那個數字。**
 *
 * 這一支是 {@link ./descriptionClaims} 那組抽取規則的**閘**（GH#462）。
 * 它與三個姊妹閘的分界寫在抽取器的檔頭，⛔ 不要合併：`noOpModifierClaims` 問
 * 「這條 modifier 改得動任何數字嗎」、`abilityNoOpEffects` 問「這段效果改得動嗎」、
 * `abilityCastClaims` 只看標籤 —— 三支對「卡面寫 1500、引擎打 350」全部是綠的，
 * 因為**每一半單獨看都是對的**（配對式後置條件那條教訓的技能版）。
 *
 * ── 範圍：**只有開放的角色 + 三選一**（owner 2026-08-19）───────────────────
 *
 * > 「只要做**有開放的角色技能及隨機三選一**就好，**沒開放的別浪費 token**」
 *
 * 開放＝`content/config/roster.json` 的 `retiredChampions` **以外**的英雄。
 * ⭐ `hiddenChampions` 算**開放**：隱藏角色隨機抽得到（owner 2026-08-17），
 * 玩家一樣看得到那張卡面。
 * ⚠️ 退場英雄與**沒有任何英雄指得到**的孤兒技能不進棘輪，但它們的處數會被印出來 ——
 * ⛔ 讓數字變好看不是目的。
 *
 * ── 為什麼是**棘輪**而不是「全綠」──────────────────────────────────────────
 *
 * 開工當天開放範圍內就有上百處。要求一次全綠 = 這條閘從第一天起就是紅的，
 * 而一條永遠紅的閘會在三天內被人加 `.skip`。棘輪只擋**新增**，並且在任何一處
 * 被修好時逼基準線跟著縮 —— 它會單調地走向零，而中間每一天都是綠的。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import type { AbilityDef, AugmentDef } from "../sim/content/defs";
import { scanAbility, mismatchKey, type Mismatch } from "./descriptionClaims";
import { KNOWN_MISMATCHES } from "./descriptionClaims.baseline";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** 被掃的一份文件（技能或固有能力）＋它的來歷，只為了紅字訊息好讀。 */
interface Subject {
  readonly id: string;
  readonly label: string;
  readonly def: AbilityDef & { description?: string };
}

/**
 * 一張固有能力卡攤成抽取器看得懂的形狀。
 * ⭐ `internalCooldown` 就是卡面那個「N 秒冷卻」，餵進 `cooldown` 才不會誤報。
 */
const asAbility = (a: AugmentDef): AbilityDef & { description?: string } =>
  ({
    ...a,
    cooldown: (a.hooks ?? [])
      .map((h) => (h as { internalCooldown?: number }).internalCooldown)
      .filter((n): n is number => typeof n === "number"),
    manaCost: [],
    effects: a.hooks,
    passive: a.modifiers,
  }) as unknown as AbilityDef & { description?: string };

describe("描述↔JSON 一致性（開放範圍棘輪）", () => {
  let open: Subject[] = [];
  let closedCount = 0;
  let closedAbilities = 0;

  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);

    // ⭐ 從出貨的 roster 推導開放名單，⛔ 不抄字面值。
    const roster = JSON.parse(readFileSync(join(CONTENT, "config/roster.json"), "utf8")) as {
      retiredChampions?: string[];
    };
    const retired = new Set(roster.retiredChampions ?? []);

    const reachable = new Set<string>();
    for (const cid of Champions.ids()) {
      if (retired.has(cid)) continue;
      const c = Champions.get(cid)!;
      // ⭐ 本體下架 ⇒ 它的變身態連 fail-open 的路徑也進不來（roster.json 的
      // 註記逐字說了這件事）。⛔ 出貨只有 godie-e00z 一位，但這是推導不是名單。
      if (c.transform?.role === "alternate" && retired.has(c.transform.counterpartId ?? "")) continue;
      for (const slot of Object.keys(c.abilities) as (keyof typeof c.abilities)[]) {
        reachable.add(c.abilities[slot].id);
      }
      if (c.exAbility) reachable.add(c.exAbility);
      if (c.passiveAbility) reachable.add(c.passiveAbility);
    }

    for (const id of Abilities.ids().sort()) {
      const def = Abilities.get(id) as AbilityDef & { description?: string };
      if (reachable.has(id)) open.push({ id, label: def.name ?? id, def });
      else {
        closedAbilities++;
        closedCount += scanAbility(def).length;
      }
    }
    for (const id of Augments.ids().sort()) {
      const a = Augments.get(id)!;
      open.push({ id, label: `固有能力 ${a.name}`, def: asAbility(a) });
    }
  });

  it("開放範圍內不可以冒出新的『說了但不會發生』", () => {
    const found = new Map<string, { s: Subject; m: Mismatch }>();
    for (const s of open) for (const m of scanAbility(s.def)) found.set(mismatchKey(s.id, m), { s, m });

    if (process.env.GGD_DESC_CLAIMS_DUMP) {
      const rows = [...found.entries()].map(
        ([k, { s, m }]) => `${k}\t${s.label}\t${m.claim.replace(/\s+/g, " ")}\t${m.why}`,
      );
      writeFileSync(join(tmpdir(), "ggd-desc-claims-open.tsv"), rows.sort().join("\n"));
      const per: Record<string, number> = {};
      for (const { m } of found.values()) per[m.rule] = (per[m.rule] ?? 0) + 1;
      console.log(
        `開放 ${open.length} 份（技能 ${open.length - Augments.ids().length} + 固有能力 ${Augments.ids().length}）` +
          `：${found.size} 處 / ${new Set([...found.keys()].map((k) => k.split("|")[0])).size} 份\n` +
          Object.entries(per)
            .sort()
            .map(([r, n]) => `  ${r}: ${n}`)
            .join("\n") +
          `\n退場英雄 + 孤兒技能 ${closedAbilities} 份：${closedCount} 處（⛔ 不處理）`,
      );
    }

    const known = new Set(KNOWN_MISMATCHES);
    const added = [...found.entries()]
      .filter(([k]) => !known.has(k))
      .map(([k, { s, m }]) => `  ${k}（${s.label}）：「${m.claim}」→ ${m.why}`);
    expect(added.join("\n"), `⛔ 新的描述↔JSON 不一致 —— 卡面說了引擎不做的事：\n${added.join("\n")}`).toBe(
      "",
    );

    // 棘輪的第二半：修好的要從基準線刪掉，否則這條線永遠不會縮。
    const stale = KNOWN_MISMATCHES.filter((k) => !found.has(k));
    expect(
      stale.join("\n"),
      `⭐ 這幾處已經修好了 —— 把它們從 descriptionClaims.baseline.ts 刪掉（棘輪只准降）：\n${stale.join("\n")}`,
    ).toBe("");
  });
});
