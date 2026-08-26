/**
 * 移速**加成**五級距（GH#789）的守衛 —— 第〇·四守則在 `ms` % modifier 上的閘。
 *
 * owner 2026-08-27（逐字）：
 * > 「移動速度加成一律的 %轉換為五級距，一樣列表可設定，五級距上下限增加移速為 0.1~4」
 *
 * 四件事，四個都是「改壞就會紅」的方向：
 *   ① **exclusive**：出貨檔裡級別與 `value` 不同時存在；沒級別的 % 節點要嘛被
 *     豁免罩住，要嘛紅；豁免規則再也匹配不到 → 也紅（棘輪只准變短）。
 *   ② **載入時解析**：註冊之後每一個帶級別的節點 `value` 就是表上那個數字
 *     （配對性質：出貨內容 × 出貨註冊路徑 —— 同 `shippedDamageTiersResolve`）。
 *   ③ **兩個住處說同一句話**：`content/config/move-speed-tiers.json` 與
 *     `DEFAULT_MOVE_SPEED_TIERS` 逐格相等，且每格都在 owner 的 0.1~4 裡。
 *   ④ **卡面**：`{{msb}}` 在出貨技能上真的算得出來（解不開會裸印）。
 *
 * 突變紀錄（整批一條，挑最承重的線）：
 *   · `moveSpeedTiers.ts::resolveMsBonusTier` 的 `out["value"] = v` 改成不寫
 *     → ②紅（收到 undefined）＋④紅（{{msb}} 裸印）。驗證於 2026-08-27。
 *
 * ⚠️ 這一支點名的 `content/abilities|champions` 是**產物**（tiers:apply /
 * skillremake:json 就地改寫）：紅了改**來源**（tools/skill-remake/tierize.py 或
 * config），再 `bash scripts/genrun.sh <step>`，⛔ 不要手改出貨 JSON。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { Abilities, Augments, Items } from "../sim/content/registry";
import { registerAll } from "./registries";
import type { ContentStore } from "./store";
import {
  DEFAULT_MOVE_SPEED_TIERS,
  MS_BONUS_MAX,
  MS_BONUS_MIN,
  MS_BONUS_TIER_NAMES,
  moveSpeedTiersFromDoc,
  msExemptionFor,
  resolveMsBonusTier,
  scanMsBonusNodes,
  type MsBonusNode,
} from "./moveSpeedTiers";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf-8")) as unknown;
const load = (coll: string): unknown[] =>
  readdirSync(join(CONTENT_DIR, coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => readJson(join(CONTENT_DIR, coll, f)));

const COLLECTIONS = ["abilities", "items", "augments", "champions"] as const;

/** 出貨表（⛔ 不抄字面值 —— 斷言的期望值全部從它推導）。 */
const SHIPPED = moveSpeedTiersFromDoc(
  load("config").find((c) => (c as { schema?: string }).schema === "config.move-speed-tiers@1"),
);

const NODES: MsBonusNode[] = COLLECTIONS.flatMap((coll) =>
  readdirSync(join(CONTENT_DIR, coll))
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .flatMap((f) => scanMsBonusNodes(`${coll}/${f}`, readJson(join(CONTENT_DIR, coll, f)))),
);

const where = (n: MsBonusNode): string => `${n.file} ${n.path} (op=${n.op})`;

describe("移速加成五級距 (#789 move-speed-bonus-tiers)", () => {
  it("① exclusive：級別↔value 互斥；沒級別的要嘛被豁免、要嘛紅；豁免不匹配也紅", () => {
    cover("ms-bonus-tier-exclusive");
    // GUARD-THE-GUARD：掃到 0 個節點的掃描器對任何內容都是綠的（失敗形態⑥）。
    expect(NODES.length, "ms % modifier 母體空了 —— 掃描器壞了不是內容變乾淨了").toBeGreaterThan(40);

    const both = NODES.filter((n) => n.tier !== undefined && n.value !== undefined);
    expect(
      both.map(where).join("\n"),
      "⛔ 級別與 value 同時存在（第二個住處，必然過期）—— 改來源再 genrun，⛔ 不要手改產物",
    ).toBe("");

    const untiered = NODES.filter(
      (n) => n.tier === undefined && typeof n.value === "number" && n.value > 0,
    );
    const naked = untiered.filter((n) => msExemptionFor(n, SHIPPED) === undefined);
    expect(
      naked.map(where).join("\n"),
      "⛔ 沒級別、也沒有豁免規則罩住的 ms % 節點 —— 補級別（tierize）或給一條帶理由的豁免",
    ).toBe("");

    // ③ 反向：每一條豁免都要**真的還罩著**至少一個沒級別的節點 —— 收乾淨就要刪。
    for (const ex of SHIPPED.exemptions) {
      const hits = untiered.filter((n) => msExemptionFor(n, SHIPPED) === ex);
      expect(
        hits.length,
        `豁免規則過期了（再也匹配不到任何節點）：${JSON.stringify({ op: ex.op, id: ex.id })} —— 刪掉它`,
      ).toBeGreaterThan(0);
    }
  });

  it("② 載入時解析：註冊之後帶級別的節點 value 就是表上那個數字（技能＋道具＋增益卡）", () => {
    cover("ms-bonus-tier-load-time");
    const byCollection: Record<string, unknown[]> = {
      abilities: load("abilities"),
      items: load("items"),
      augments: load("augments"),
      config: load("config"),
      // ⚠️ 一定要餵模板：07-01 的 ms 住在 tpl-buff-self 的 params 裡，
      //    少了它那一支會降級成空殼而從母體消失（失敗形態⑤）。
      "ability-templates": load("ability-templates"),
    };
    registerAll({ all: (c: string) => byCollection[c] ?? [] } as ContentStore);

    let checked = 0;
    const scanRegistered = (id: string, def: unknown): void => {
      for (const n of scanMsBonusNodes(id, def)) {
        if (n.tier === undefined) continue;
        expect(
          n.value,
          `${id} ${n.path} 的「${n.tier}」沒有被解析回來 —— resolveMsBonusTier 從 withTiers 掉出去了？`,
        ).toBe(SHIPPED.enabled ? SHIPPED.bonus[n.tier as never] : DEFAULT_MOVE_SPEED_TIERS.bonus[n.tier as never]);
        checked += 1;
      }
    };
    for (const d of byCollection["abilities"]!) scanRegistered((d as { id: string }).id, Abilities.tryGet((d as { id: string }).id as never));
    for (const d of byCollection["items"]!) scanRegistered((d as { id: string }).id, Items.tryGet((d as { id: string }).id as never));
    for (const d of byCollection["augments"]!) scanRegistered((d as { id: string }).id, Augments.tryGet((d as { id: string }).id as never));
    expect(checked, "註冊後一個帶級別的節點都沒有 —— 這條斷言在空跑").toBeGreaterThan(20);

    // ④ 卡面：{{msb}} 真的算得出來（解不開的佔位符會**原樣裸印**在卡上）。
    const e001 = Abilities.tryGet("godie-e001.q" as never) as { description?: string } | undefined;
    expect(e001?.description ?? "").not.toContain("{{msb}}");
    expect(
      e001?.description ?? "",
      "22-01 的移速佔位沒有算出逐階數列（perRank 那一半斷了）",
    ).toContain("/");
  });

  it("③ 兩個住處說同一句話：出貨 JSON ↔ DEFAULT 逐格相等，且都在 owner 的 0.1~4 裡", () => {
    cover("ms-bonus-tier-drift");
    for (const n of MS_BONUS_TIER_NAMES) {
      const v = SHIPPED.bonus[n];
      expect(v, `出貨 config 的「${n}」與 DEFAULT 漂移`).toBe(DEFAULT_MOVE_SPEED_TIERS.bonus[n]);
      expect(v).toBeGreaterThanOrEqual(MS_BONUS_MIN);
      expect(v).toBeLessThanOrEqual(MS_BONUS_MAX);
    }
    expect(SHIPPED.exemptions.map((e) => `${e.op ?? ""}|${e.id ?? ""}`).join(",")).toBe(
      DEFAULT_MOVE_SPEED_TIERS.exemptions.map((e) => `${e.op ?? ""}|${e.id ?? ""}`).join(","),
    );
    // 每一條豁免要有一個**能被反駁**的理由（⛔ 不是「還沒收」）。
    for (const e of SHIPPED.exemptions) expect(e.reason.trim().length).toBeGreaterThan(20);
  });

  it("resolve 的三條規則：查表贏、關掉退回出貨預設表、認不得的級別不猜", () => {
    cover("ms-bonus-tier-resolve-rules");
    const doc = {
      effects: [
        { kind: "applyBuff", modifiers: [{ stat: "ms", op: "pctAdd", msBonusTier: "中" }] },
      ],
    };
    const custom = { ...SHIPPED, enabled: true, bonus: { ...SHIPPED.bonus, 中: 0.9 } };
    const on = resolveMsBonusTier(doc, custom) as typeof doc;
    expect((on.effects[0]!.modifiers[0] as { value?: number }).value).toBe(0.9);
    // 關掉 ⇒ 退回**程式內出貨預設表**（⛔ 不是不解析 —— 沒 value 會在 statPipeline 變 NaN）
    const off = resolveMsBonusTier(doc, { ...custom, enabled: false }) as typeof doc;
    expect((off.effects[0]!.modifiers[0] as { value?: number }).value).toBe(
      DEFAULT_MOVE_SPEED_TIERS.bonus.中,
    );
    const weird = {
      effects: [{ kind: "applyBuff", modifiers: [{ stat: "ms", op: "pctAdd", msBonusTier: "超大" }] }],
    };
    const kept = resolveMsBonusTier(weird, custom) as typeof weird;
    expect((kept.effects[0]!.modifiers[0] as { value?: number }).value).toBeUndefined();
  });
});
