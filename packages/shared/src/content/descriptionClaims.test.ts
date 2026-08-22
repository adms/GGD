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
import { claimOwner, KNOWN_MISMATCHES, KNOWN_MISMATCHES_BY_OWNER } from "./descriptionClaims.baseline";
import { writeShardedBaseline } from "./baselineShards";

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
  /** 出貨樹上真的存在的分片擁有者（⛔ 不等於開放名單，見 beforeAll 末尾）。 */
  const shippedOwners = new Set<string>();

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
      shippedOwners.add(claimOwner(id));
    }
    // ⭐ 這份基準線有**第二個消費端**：`ops/skillNormalizeGate` 掃的是**整棵出貨樹**
    // （⛔ 不是開放名單）。#552 五個變身態下架時退場的是 roster 的**入口**，
    // 那些 ability 文件**還在 content/ 裡**，所以它們的豁免仍然在承重。
    // ⇒ 「孤兒」的判準必須是「出貨樹上找不到這個擁有者」，⛔ 不是「它不在開放名單上」。
    for (const id of Abilities.ids()) shippedOwners.add(claimOwner(id));
  });

  it("開放範圍內不可以冒出新的『說了但不會發生』", () => {
    const found = new Map<string, { s: Subject; m: Mismatch }>();
    for (const s of open) for (const m of scanAbility(s.def)) found.set(mismatchKey(s.id, m), { s, m });

    if (process.env.GGD_DESC_CLAIMS_DUMP) {
      const rows = [...found.entries()].map(
        ([k, { s, m }]) => `${k}\t${s.label}\t${m.claim.replace(/\s+/g, " ")}\t${m.why}`,
      );
      writeFileSync(join(tmpdir(), "ggd-desc-claims-open.tsv"), rows.sort().join("\n"));
      // ⭐ 基準線是**按英雄分片**的，所以 dump 直接吐出整個目錄的形狀 ——
      // ⛔ 不要叫人拿第一欄手工切成 60 個檔（`descriptionClaims.baseline.ts` 檔頭有 cp 指令）。
      writeShardedBaseline(join(tmpdir(), "ggd-desc-claims-baseline"), [...found.keys()].sort(), claimOwner);
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
    // ⚠️ 只追**開放範圍內**的鍵。退場英雄的鍵在 `found` 裡永遠不會出現（它們根本沒被掃），
    // 那不是「修好了」，是「不在這條棘輪的管轄內」—— 而它們的豁免仍被 skillNormalizeGate 讀。
    const openOwners = new Set(open.map((s2) => claimOwner(s2.id)));
    const stale = KNOWN_MISMATCHES.filter((k) => !found.has(k) && openOwners.has(claimOwner(k.split("|")[0]!)));
    expect(
      stale.join("\n"),
      `⭐ 這幾處已經修好了 —— 把它們從 descriptionClaims.baseline/<英雄>.json 刪掉（棘輪只准降）：\n${stale.join(
        "\n",
      )}`,
    ).toBe("");
  });

  /**
   * ⭐ 分片之後多出來的腐爛形態：**孤兒檔**。
   * 一個檔名不對應任何開放英雄／固有能力的分片留在目錄裡 ⇒ 它列的每一筆都被
   * **永久豁免**，而上面那條棘輪**不會叫**（它只看得到鍵，看不到鍵來自哪個檔）。
   * ⚠️ 英雄退場、id 改名、變身態跟著本體下架都會製造孤兒檔。
   */
  it("⭐ 分片目錄裡不可以有孤兒檔（＝一批永久關掉的豁免）", () => {
    const orphans = [...KNOWN_MISMATCHES_BY_OWNER.keys()].filter((o) => !shippedOwners.has(o));
    expect(
      orphans.join("\n"),
      `⛔ descriptionClaims.baseline/ 裡這幾個檔在**出貨樹上找不到擁有者** —— ` +
        `它們豁免的每一筆都永遠不會被棘輪追回來。⭐ 刪掉那些檔：\n${orphans
          .map((o) => `  ${o}.json（${KNOWN_MISMATCHES_BY_OWNER.get(o)!.length} 筆）`)
          .join("\n")}`,
    ).toBe("");
  });
});
