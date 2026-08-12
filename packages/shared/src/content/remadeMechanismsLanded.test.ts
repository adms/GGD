/**
 * B2 填值的**承重守衛** —— 90 支重製技能真的用到了那些機制。
 *
 * ⚠️ 這條守衛的存在理由是一次**失敗的突變驗證**（2026-08-12）：
 * 我把 `buff()` 的 `o.update(kw)` 拿掉（＝ B2-G 的五格授權欄位整批消失，
 * 20-00 的格擋、77-02 的會心、77-03 的翅膀、60-03 的三圍全部回到 0 採用），
 * 而 `fieldAdoption.test.ts` **仍然是綠的**。
 *
 * 原因：`fieldAdoption` 只守**一個方向** —— 「豁免還在、但欄位已經有人用了」
 * （stale）。反方向（「採用歸零、而且沒有豁免」）它只印一行 ZERO 不會紅。
 * ⇒ 整批填值可以被刪掉而**沒有任何東西叫**（第二守則的失敗形態③）。
 *
 * ⛔ 這裡驗的是**機制有沒有落在出貨內容上**，不是數值是多少
 *   （第二守則：驗機制不驗數字。0.3 / 1.5 / 10.0 那些是 owner 每週在調的東西）。
 *
 * 突變紀錄：
 *   · `batch1.py::buff()` 的 `o.update(kw)` 拿掉 → 重新產出 → 紅（4 個機制歸零）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/abilities");

/** 深度搜尋：這份文件的任何一層有沒有這個鍵。 */
function hasKey(node: unknown, key: string): boolean {
  if (Array.isArray(node)) return node.some((v) => hasKey(v, key));
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (key in o) return true;
    return Object.values(o).some((v) => hasKey(v, key));
  }
  return false;
}

/**
 * B1/B2 讓這些機制第一次真的出貨。每一格後面是**誰在用** ——
 * ⚠️ 那些 id 只是給紅燈時的線索，斷言本身只問「有沒有人用」。
 */
const LANDED: [file: string, key: string, who: string][] = [
  ["godie-e002.passive.json", "block", "20-00 銀色甲胄「30% 機率格擋 100% 魔法傷害」"],
  ["godie-h01n.ex.json", "block", "79-002 虛化「30% 機率格擋物理傷害」"],
  ["godie-e00w.w.json", "critStrike", "77-02 雷鳴劍「1.5 倍會心」"],
  ["godie-h02k.q.json", "critStrike", "89-01 憤怒的頭槌「10 倍暴擊」"],
  ["godie-h00l.e.json", "attributes", "60-03 三角神力．勇氣「智慧/敏捷/力量 3-12 點」"],
  ["godie-emns.w.json", "attributes", "44-02 死神的規則「智慧 7-22 點」"],
  ["godie-e00w.e.json", "flight", "77-03「變換為[飛行]狀態無視碰撞」"],
  ["godie-emns.r.json", "resourcePct", "44-04 心臟麻痺「[現存生命] 30/40/50%」"],
  // ⛔ 13-02 牙突的「目標[最大生命] 6-12%」**不在這裡** —— owner 2026-08-12 明確拿掉，
  //    守衛是 sim/efurKit.test.ts 的 efur-w-hppct（反方向：它長回來就紅）。
  ["godie-hapm.r.json", "victimCondition", "52-04「若敵人具有[恐懼]則額外追加」"],
  ["godie-h01n.ex.json", "whileForm", "79-002 的格擋只在卍解狀態"],
  ["godie-e00s.e.json", "onHitTargets", "B1-B 兄弟酬載折疊（70-03）"],
  // ── B3/B4（2026-08-13）──
  ["godie-e002.r.json", "incomingPct", "B3-A 20-04 理想鄉「反彈量 3/5/7 倍」"],
  ["godie-edem.passive.json", "negateOriginal", "B3-A 45-00 寫輪眼是**免傷**反彈（owner 逐字裁決）"],
  ["godie-h00l.ex.json", "hookKey", "B3-A 60-002「反彈成功則冷卻重置」"],
  ["godie-h02k.ex.json", "condition", "B3-C4 89-002 致盲/混亂改寫死亡權重"],
  ["godie-e00w.ex.json", "augment", "B4-K 77-002 御雷劍改寫另外兩支技能（全 repo 第一份）"],
  ["godie-hapm.passive.json", "lethal", "52-00 十二道試煉是**免死牌**，不是 HP≤5% 的 hook"],
  ["godie-hapm.passive.json", "perStackLost", "52-00「每失去一層永久 +10% 攻擊力與最大生命」"],
  ["godie-emfr.ex.json", "buff", "15-002「將該傷害短暫加成至 AP」"],
  ["godie-h01n.w.json", "whileForm", "79-02「卍解狀態下傷害額外追加 200% AP」"],
];

describe("重製技能的機制真的落在出貨內容上", () => {
  it("⭐ 每一支被點名的技能真的帶著它的機制 —— 出口或填值被移除就紅", () => {
    cover("remade-mechanisms-landed");
    const dead: string[] = [];
    for (const [file, key, who] of LANDED) {
      let doc: unknown;
      try {
        doc = JSON.parse(readFileSync(join(CONTENT, file), "utf8"));
      } catch {
        dead.push(`${file} 讀不到 —— ${who}`);
        continue;
      }
      if (!hasKey(doc, key)) dead.push(`${file} 沒有 ${key} —— ${who}`);
    }
    expect(
      dead,
      "這些機制從出貨內容上消失了 —— 產生器的出口或表格填值被移除了。\n" +
        "⛔ 不要改這條測試：跑 `python3 tools/skill-remake/batch1.py` 看它是不是還會產出。\n" +
        "⚠️ `fieldAdoption.test.ts` **不會**替你抓這個方向（它只守「豁免過期」那一半，\n" +
        "   2026-08-12 實測：把整批填值拿掉它照樣全綠）。",
    ).toEqual([]);
  });
});
