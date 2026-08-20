/**
 * ⛔ **技能說明裡不可以有手打的機制數字。**
 *
 * 這是 {@link ./abilityProse} 的閘（說明推導（票號待開））。它與姊妹閘的分界 ——
 * `descriptionClaims` 問「卡面寫的數字**對不對**」，這一支問
 * 「那個數字**是不是一段靜態文字**」。⭐ 兩者是不同的失敗形態：
 * 一句「45秒冷卻」今天可以完全正確（descriptionClaims 綠），而級距表明天一改
 * 它就變成謊話 —— **而那一刻沒有任何東西會紅**，因為卡面與 JSON 都各自合法。
 *
 * ⭐ 佔位符把「關係」變成「唯一住處」：`{{cd}}` 沒有自己的值，它**就是**
 * `cooldown[]`。⇒ 這一族的謊話從此在結構上寫不出來。
 *
 * 範圍：**只有開放的角色**（owner 2026-08-19「沒開放的別浪費 token」），
 * 與 `descriptionClaims.test.ts` 用同一份推導。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { FsContentSource } from "./node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "./registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { aoeTiersFromDoc } from "./aoeTiers";
import { rangeTiersFromDoc } from "./rangeTiers";
import { displacementTiersFromDoc, minBodyRadiusFromConfigs } from "./displacementTiers";
import {
  abilityQuantities,
  placeholderizeAbilityText,
  proseViolations,
  renderAbilityText,
  type ProseTables,
} from "./abilityProse";
import { KNOWN_MISMATCHES } from "./descriptionClaims.baseline";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** 一支開放的技能：磁碟上的原文（帶佔位符）＋註冊表那一份（已算繪）。 */
interface Subject {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly rendered: string;
  readonly q: ReturnType<typeof abilityQuantities>;
}

/**
 * ⭐ 綁不上的手打數字，**唯一**可以被原諒的兩個出處。
 * ⛔ 兩個都是**算出來的**，不是一張手打白名單 —— 名單會腐爛，而這兩條在被修好的
 *    那一刻自動失效。
 */
const EXCUSES = {
  /** 卡面與 JSON 本來就不一致（`descriptionClaims` 棘輪已經記著它）。 */
  "claims-baseline":
    "已在 descriptionClaims 棘輪基準線裡 —— 卡面與 JSON 本來就不一致，" +
    "⛔ 綁上去等於無聲改掉玩家看到的字。⭐ 反駁方式：修好那一筆，這一處會自動變成可綁",
  /** 引擎這一軸**整個是空的**（卡面寫了距離／範圍／傷害，JSON 上一格都沒有）。 */
  "engine-axis-empty":
    "引擎這一軸是空的 —— 沒有任何值可以綁，而換上去只會讓一句做不到的宣稱更像真的" +
    "（第一·五守則）。⭐ 反駁方式：把那一軸填進 JSON，這一處就會自動變成可綁。" +
    "⚠️ 它本身就是一處缺陷，只是**修法在 JSON 那一側**，⛔ 不在文案這一側",
} as const;

/** 一個 rule ⇒ `descriptionClaims` 裡對應的那一條（棘輪鍵的後半）。 */
const CLAIM_RULE: Readonly<Record<string, string>> = {
  cd: "cooldown-mismatch",
  mp: "mana-mismatch",
  dmg: "damage-absent",
};

/**
 * ⭐ **豁免表** —— 綁不上、而且上面兩條算得出來的出處都不適用的那幾處。
 *
 * ⛔ 這不是一張白名單，是一條**只准降不准升**的線（同 `descriptionClaims.baseline`
 * 的規矩）：修好了要從這裡刪掉，否則下面那條 stale 斷言會紅。
 * ⭐ 每一列都帶著**能被反駁的理由**：照著「反駁方式」做，這一列就會自動失效。
 */
const KNOWN_UNBINDABLE: Readonly<Record<string, string>> = {
  "godie-e00l.e|dmg":
    "卡面是 w3x 原文的**公式**（魔力*0.4+350），GGD 這一支改成了逐階 250/400/550/700 —— " +
    "兩者是**不同的設計**，⛔ 不是同一個數字的兩種寫法。修法是重寫這一句文案（卡面要說哪一個是 " +
    "owner 的決定），⛔ 不是機械代換。⭐ 反駁方式：文案改成逐階寫法，這一列就會 stale 而紅",
  // ⭐ 下面四支是**新抽取器多看見的**（「造成N傷害」這種**沒有「點」**的寫法，
  //    `descriptionClaims.damageClaims` 到今天為止抽不到它）。⛔ 四筆都是真的落差，
  //    ⛔ 不是誤報 —— 修法一律要動平衡資料或文案，那是 owner 的排序（第零守則⑧）。
  "godie-hart.w|dmg":
    "卡面寫 100、JSON 是 200/400/600/800/1000（五階）—— 卡面停在一個舊值。" +
    "⭐ 反駁方式：文案改成 {{dmg}}（卡面會印整串）或 JSON 改回 100，這一列就會 stale 而紅",
  "godie-n00p.q|dmg":
    "卡面寫 50、JSON 是 10/15/15 —— 18-01 風華圓舞陣同時是「傷害相對冷卻偏低」清單上的一格，" +
    "⛔ 不要在這裡順手挑一個數字。⭐ 反駁方式：傷害級距落地之後回來刪掉這一列",
  "godie-nsjs.q|dmg":
    "同 `godie-n00p.q`（18-01 風華圓舞陣的另一位持有者）—— 卡面 50 vs JSON 10/15/15。" +
    "⭐ 反駁方式：與上一列一起修，一起刪",
  "godie-u00h.r|dmg":
    "卡面寫「造成各120傷害」（每一段的分傷）、JSON 是 333/555/777（一發的總量）——" +
    "兩個是**不同的量**，⛔ 綁上去等於把「每段 120」偷偷寫成「每段 333」。" +
    "⭐ 反駁方式：文案改成講總量，或 JSON 拆成逐段，這一列就會 stale 而紅",
  "godie-osam.ex|dmg":
    "卡面寫 1300、引擎是 flat 300 + 70% [AP] —— 一處**真的**平衡落差（第一·五守則）。" +
    "⛔ 綁上去等於把卡面偷偷從 1300 改成 300。⭐ 反駁方式：JSON 補到 1300 或文案改成 300，" +
    "這一列就會 stale 而紅",
};

/** 引擎這一軸整個是空的（⇒ 綁不上不是文案的錯）。 */
const axisEmpty = (q: ReturnType<typeof abilityQuantities>, slot: string): boolean =>
  slot === "dmg" ? q.dmg.length === 0 : slot === "cd" ? q.cd === undefined : q.mp === undefined;

describe("技能說明從 JSON 推導（說明推導（票號待開））", () => {
  let open: Subject[] = [];
  let tables: ProseTables;

  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);

    const cfgs = Configs.all() as unknown as { schema?: string }[];
    const disp = displacementTiersFromDoc(
      cfgs.find((c) => c.schema === "config.displacement-tiers@1"),
      minBodyRadiusFromConfigs(cfgs as never),
    );
    const dist = (t: Record<string, { distance: number }>) =>
      Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.distance]));
    tables = {
      range: rangeTiersFromDoc(cfgs.find((c) => c.schema === "config.range-tiers@1")).range,
      radius: aoeTiersFromDoc(cfgs.find((c) => c.schema === "config.aoe-tiers@1")).radius,
      travel: dist(disp.travel as never) as ProseTables["travel"],
      push: dist(disp.push as never) as ProseTables["push"],
      zoneRadius: Math.min(...Arenas.all().flatMap((a) => a.zones.map((z) => z.boundaryRadius))),
    };

    // ⭐ 開放名單從出貨 roster 推導，⛔ 不抄字面值（與 descriptionClaims.test.ts 同一份）。
    const roster = JSON.parse(readFileSync(join(CONTENT, "config/roster.json"), "utf8")) as {
      retiredChampions?: string[];
    };
    const retired = new Set(roster.retiredChampions ?? []);
    const reachable = new Set<string>();
    for (const cid of Champions.ids()) {
      if (retired.has(cid)) continue;
      const c = Champions.get(cid)!;
      if (c.transform?.role === "alternate" && retired.has(c.transform.counterpartId ?? "")) continue;
      for (const slot of Object.keys(c.abilities) as (keyof typeof c.abilities)[]) {
        reachable.add(c.abilities[slot].id);
      }
      if (c.exAbility) reachable.add(c.exAbility);
      if (c.passiveAbility) reachable.add(c.passiveAbility);
    }

    open = [];
    for (const id of [...reachable].sort()) {
      const def = Abilities.get(id as never) as unknown as
        | (Record<string, unknown> & { description?: string })
        | undefined;
      if (def === undefined) continue;
      const source = JSON.parse(
        readFileSync(join(CONTENT, "abilities", `${id}.json`), "utf8"),
      ) as { description?: string; name?: string };
      if ((source.description ?? "").trim() === "") continue;
      open.push({
        id,
        label: String(source.name ?? id),
        source: source.description!,
        rendered: def.description ?? "",
        q: abilityQuantities(def, tables),
      });
    }
  });

  /**
   * ⭐ **最承重的一條** —— 把 `registries.ts` 的 `withProse` 那一行拿掉，
   * 卡片上就會出現一堆裸的 `{{cd}}`，而這一條會逐支點名。
   * ⛔ 它讀的是**註冊表**（＝每一個消費端真的拿到的那一份），不是磁碟。
   */
  it("① 註冊表裡的說明一個佔位符都不剩（＝唯一算繪處真的接上了）", () => {
    const bad = open
      .filter((s) => s.rendered.includes("{{"))
      .map((s) => `  ${s.id}（${s.label}）：${/\{\{[^}]*\}\}/.exec(s.rendered)?.[0]}`);
    expect(
      bad.join("\n"),
      `⛔ 這幾支的說明沒有被算繪 —— 玩家會在卡片上看到裸的佔位符：\n${bad.join("\n")}`,
    ).toBe("");
  });

  it("② 說明裡不可以有**綁得上**的手打機制數字", () => {
    const bad: string[] = [];
    for (const s of open) {
      for (const v of proseViolations(s.source, s.q)) {
        if (v.rule !== "hand-typed-number") continue;
        bad.push(`  ${s.id}（${s.label}）：「${v.text}」${v.why}`);
      }
    }
    expect(
      bad.join("\n"),
      `⛔ 手打的機制數字 —— 級距表一改它就變成謊話，而沒有任何東西會紅。\n` +
        `⭐ 跑 \`pnpm tsx tools/card-prose/apply_placeholders.ts\` 自動換掉：\n${bad.join("\n")}`,
    ).toBe("");
  });

  it("③ 綁不上的那些，每一處都要說得出出處（⛔ 不是一張手打白名單）", () => {
    const known = new Set(KNOWN_MISMATCHES);
    const orphan: string[] = [];
    const hit = new Set<string>();
    for (const s of open) {
      for (const f of placeholderizeAbilityText(s.source, s.q).findings) {
        if (f.rule === "geo-no-engine-value") continue; // ← EXCUSES["engine-axis-empty"]
        if (f.rule !== "num-unbound") continue;
        if (axisEmpty(s.q, f.slot)) continue; // ← EXCUSES["engine-axis-empty"]
        if (known.has(`${s.id}|${CLAIM_RULE[f.slot]}`)) continue; // ← EXCUSES["claims-baseline"]
        const key = `${s.id}|${f.slot}`;
        if (key in KNOWN_UNBINDABLE) {
          hit.add(key);
          continue; // ← 豁免表，帶著能被反駁的理由
        }
        orphan.push(`  ${s.id}（${s.label}）：「${f.before}」→ ${f.why}`);
      }
    }
    // 棘輪的第二半：修好的要從豁免表刪掉，否則這條線永遠不會縮。
    const stale = Object.keys(KNOWN_UNBINDABLE).filter((k) => !hit.has(k));
    expect(
      stale.join("\n"),
      `⭐ 這幾處已經修好了 —— 把它們從 KNOWN_UNBINDABLE 刪掉（豁免表只准降）：\n${stale.join("\n")}`,
    ).toBe("");
    expect(
      orphan.join("\n"),
      `⛔ 這幾處既綁不上佔位符、也沒有出處 —— 兩種可能，兩種都要動手：\n` +
        `  ① 卡面與 JSON 真的不一致 ⇒ 它應該出現在 descriptionClaims 的棘輪基準線裡\n` +
        `  ② 抽取器把不是那一軸的東西讀成了那一軸 ⇒ 那是 abilityProse 的誤報，修字樣\n` +
        `⭐ 兩個合法的出處：${Object.entries(EXCUSES)
          .map(([k, v]) => `\n     · ${k}：${v}`)
          .join("")}\n${orphan.join("\n")}`,
    ).toBe("");
  });

  /**
   * ⭐ 第〇·六守則②：`「…」` 是**角色對白不是效果**。
   * 44-04 心臟麻痺的台詞「在35秒後宣布勝利吧」曾被讀成一支有 35 秒時序的技能。
   * ⛔ 這一條**不用夾具**：它讀出貨的那一支，所以「台詞被改寫了」會直接紅。
   */
  it("④ 台詞裡的數字一個字都沒被動到", () => {
    const quoted = (s: string): string[] => [...s.matchAll(/「[^」]*」/gs)].map((m) => m[0]!);
    const bad: string[] = [];
    for (const s of open) {
      const a = quoted(s.source);
      const b = quoted(s.rendered);
      if (a.join("") !== b.join("")) bad.push(`  ${s.id}（${s.label}）`);
    }
    expect(bad.join("\n"), `⛔ 台詞被改寫了：\n${bad.join("\n")}`).toBe("");
  });
});

describe("算繪與轉檔（純函式）", () => {
  const q = {
    cd: "45",
    mp: "70/95/120/145",
    dmg: ["350/450/550/650"],
    range: "極大" as const,
    radius: undefined,
    travel: "極大" as const,
    push: undefined,
    forms: { cd: ["45/45/45/45", "45"], mp: ["70/95/120/145"], dmg: [["350/450/550/650"]] },
    ranks: { cd: [], mp: ["70", "95", "120", "145"], dmg: [["350", "450", "550", "650"]] },
    raw: { range: 12 },
  };

  it("解不開的佔位符**原樣印出來**，⛔ 不退回一個看起來合理的數字", () => {
    expect(renderAbilityText("半徑 {{radius}}／{{dmg3}}", q)).toBe("半徑 {{radius}}／{{dmg3}}");
    expect(proseViolations("半徑 {{radius}}", q).map((v) => v.rule)).toContain(
      "unresolved-placeholder",
    );
  });

  it("台詞（含跨行、含行中）與（GGD 註記）一個字都不動", () => {
    const src = "造成350/450/550/650點傷害「在35秒後\n宣布勝利吧」。\n\n（GGD 註記 2026-08-11）45秒冷卻。";
    const { next } = placeholderizeAbilityText(src, q);
    expect(next).toContain("「在35秒後\n宣布勝利吧」");
    expect(next).toContain("（GGD 註記 2026-08-11）45秒冷卻。");
    expect(next).toContain("造成{{dmg}}點傷害");
  });
});
