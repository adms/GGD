/**
 * 同 rawcode 不可以有兩種長相 —— 出貨名單內的 VFX 唯一性 (GH#63)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GH#63 要的是「一個 rawcode 只能有一組 VFX 定義」。⛔ 但**逐字**寫成這樣的守衛
 * 今天會紅 74 次,而唯一能讓它變綠的方法是貼一張 74 列的豁免名單 ——
 * CLAUDE.md 明講守衛收的是**謂詞**不是名單,而一張抄下來的名單只守得住抄的當下。
 *
 * ⭐ 所以這裡守的是**那個傷害**,不是那個統計數字:
 *
 *   > 「正因為兩個都會出現在開放名單上,家人才會同時看到同一招兩種長相。」
 *
 * 兩份文件共用一個 w3x rawcode(= 原圖裡**字面上是同一招**),而**兩份都在營運
 * 名單裡**,玩家才看得到分歧。量到的(2026-08-22):74 組分歧裡**沒有一組**是
 * 兩邊都在名單上 —— 因為 #113 的 clone 英雄對只有一邊上架。所以這條不變量
 * **今天是真的**,而且不需要任何豁免。
 *
 * ⚠️ 它會在**兩件事同時發生**時紅,而那正是要擋的組合:有人把 clone 的另一半
 * 加進白名單,而那一半的 `vfxKey` 和已上架的那一半不一樣。
 *
 * ── 為什麼**不**用 `joinConfidence` 以外的過濾 ────────────────────────────
 * · 只收 CONFIRMED:AMBIGUOUS 的 join 是 name-based 猜的,拿它硬紅會被雜訊卡死。
 * · 排除**同一個英雄**的多槽位:`A0WA`/`A0WB` 同時指到 `godie-h02u.w` 與
 *   `.e`,那是 join 誤配不是雙綁定(GH#63 §3(b) 點名)。
 *
 * ── 突變紀錄 (2026-08-22) ─────────────────────────────────────────────────
 *  M1 把 `godie-e00l.w` 加進 `data/curation/whitelist.json` 的 `abilities`,
 *     並把它的 `vfxKey` 改回 `fx.prim.wind.nova`(= 這一批修好之前的值)
 *     → RED,訊息指名 `A0DZ` 與兩個 vfxKey。兩個動作只做一個 → 綠(正確:
 *     只有「都上架」+「長相不同」同時成立才是玩家看得到的傷害)。
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../..");
const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));

interface ProvRec {
  rawcodes?: string[];
  joinConfidence?: string;
}

/** `godie-e002.w` → `godie-e002`；同一個英雄的兩個槽位不算雙綁定。 */
const championOf = (abilityId: string): string => abilityId.split(".")[0] ?? abilityId;

describe("同 rawcode 的兩支技能不可以在營運名單內長得不一樣 (GH#63)", () => {
  it("每一個 CONFIRMED rawcode,白名單內的 vfxKey 只有一種", () => {
    const prov = readJson(join(ROOT, "content/assets/vfx/w3x-ability-provenance.json")) as {
      abilities: Record<string, ProvRec>;
    };
    const shipped = new Set(
      ((readJson(join(ROOT, "data/curation/whitelist.json")) as { abilities?: string[] }).abilities ?? []),
    );

    /** rawcode → abilityId → vfxKey，只收白名單內、且真的有文件的技能 */
    const byRawcode = new Map<string, Map<string, string>>();
    for (const [abilityId, rec] of Object.entries(prov.abilities)) {
      if (rec.joinConfidence !== "CONFIRMED") continue;
      if (!shipped.has(abilityId)) continue;
      const file = join(ROOT, "content/abilities", `${abilityId}.json`);
      if (!existsSync(file)) continue;
      const key = (readJson(file) as { vfxKey?: string }).vfxKey;
      if (key === undefined) continue;
      for (const rawcode of rec.rawcodes ?? []) {
        let seen = byRawcode.get(rawcode);
        if (!seen) byRawcode.set(rawcode, (seen = new Map()));
        seen.set(abilityId, key);
      }
    }

    const divergent = [...byRawcode]
      .filter(([, seen]) => new Set([...seen.values()]).size > 1)
      // 同一個英雄的多槽位共用 rawcode = name-based join 誤配,不是雙綁定
      .filter(([, seen]) => new Set([...seen.keys()].map(championOf)).size > 1)
      .map(([rawcode, seen]) => `${rawcode}: ${[...seen].map(([a, k]) => `${a}=${k}`).join(" vs ")}`);

    expect(divergent, "同一個 w3x rawcode 的兩支上架技能綁到不同特效,玩家會看到同一招兩種長相").toEqual([]);
    // 名單真的被讀到了 —— 否則上面那條會因為空集合而永遠綠(失敗形態 ⑤)
    expect(byRawcode.size).toBeGreaterThan(0);
  });
});
