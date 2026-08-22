/**
 * ⭐ GH#53 —— 一支「讀某個狀態」的被動 EX，與**掛上那個狀態的那一支技能**，
 * 是一對；而這一對從來沒有守衛。
 *
 * 這是「配對式後置條件」那個形狀（CLAUDE.md 部署協定那一節）：兩個名詞各自
 * 都合法 —— `condition.statusId` 是 **soft ref**（打錯不紅），`applyStatus`
 * 也是 soft ref（掛一個沒有人讀的狀態同樣不紅）—— 壞掉的是它們之間的**關係**。
 * 兩半分開檢查永遠是綠的，而遊戲裡那條被動一次都不會觸發（失敗形態②）。
 *
 * 量到的起點（2026-08-22）：`godie-orkn.ex` 卡面寫「攻擊身上有酒精灌腸效果的
 * 敵人⋯」，而 30-02 酒精灌腸（`godie-orkn.w`）**一個狀態都不掛**；
 * `godie-u00j.ex` 卡面寫「在八刀一閃施展後瞬間施展獄門」，而整份文件是一支
 * 60 秒的主動增益，⛔ 連段的兩半一半都不存在。
 *
 * ⛔ 這條**不驗數字**（第二守則：驗機制不驗數值）—— 減速多少、傷害幾點、
 * 窗口幾秒全部是後台/級距的事。它只問一件事：
 * **每一個被讀的狀態，在同一位英雄的技能組裡真的有人掛得上去嗎？**
 *
 * 名單從 `content/abilities/` **推導**（掃出「條件讀 statusId」的每一支被動），
 * ⛔ 不是抄來的三支 —— 下一支這樣寫的技能自動被守住。
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const ABILITY_DIR = join(CONTENT_DIR, "abilities");
const CHAMPION_DIR = join(CONTENT_DIR, "champions");

/**
 * 這一族狀態**不是**同一位英雄掛的：引擎、道具或**對手**身上的東西會產生它們，
 * 所以「自己掛不上」不是缺陷。⛔ 這張表要帶著能被反駁的理由，不是「還沒收」。
 */
const AMBIENT: ReadonlyMap<string, string> = new Map([
  ["burn", "【燃燒】是元素標記，任何一支火系技能都掛得上（45-04 讀的甚至是 tag 不是 id）"],
  ["stun", "硬控由整個引擎共用"],
  ["root", "同上"],
]);

/**
 * ⭐ 掛上一個狀態有**兩個**寫入口，⛔ 不是只有 `applyStatus`：
 * `applyBuff` 也帶 `statusId`（那是這份增益在狀態列上的名字，79-04 卍解就是這樣掛的）。
 * 只認一個入口 = 這條守衛會對一半的正常內容假紅。
 */
const WRITE_KINDS = new Set(["applyStatus", "applyBuff"]);

function collect(node: unknown, want: "read" | "write", out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, want, out);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const rec = node as Record<string, unknown>;
  const sid = rec["statusId"];
  const kind = rec["kind"];
  const isRead = kind === "status" && typeof rec["subject"] === "string";
  if (typeof sid === "string") {
    if (want === "read" ? isRead : WRITE_KINDS.has(kind as string)) out.add(sid);
  }
  for (const v of Object.values(rec)) collect(v, want, out);
}

/** champion id -> {讀了哪些狀態, 掛得上哪些狀態}，全部從磁碟推導。 */
function census(): Map<string, { reads: Set<string>; writes: Set<string> }> {
  const byHero = new Map<string, { reads: Set<string>; writes: Set<string> }>();
  for (const f of readdirSync(ABILITY_DIR)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const hero = f.split(".")[0]!;
    const doc: unknown = JSON.parse(readFileSync(join(ABILITY_DIR, f), "utf8"));
    const row = byHero.get(hero) ?? { reads: new Set<string>(), writes: new Set<string>() };
    collect(doc, "read", row.reads);
    collect(doc, "write", row.writes);
    byHero.set(hero, row);
  }
  return byHero;
}

/**
 * ⭐ 變身態與本體是**同一具身體** —— 79-04 卍解之後掛在身上的【卍解】與【破魔】
 * 是本體 `godie-h01n` 的技能掛的，而讀它的是變身態 `godie-h01o` 的技能。
 * ⇒ 一對 counterpart 的寫入面要合起來看，⛔ 不是各自為政（那會對正確的內容假紅）。
 * 配對從 `champion@1.transform.counterpartId` **推導**，⛔ 不是一張手寫名單。
 */
function counterparts(): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of readdirSync(CHAMPION_DIR)) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const doc = JSON.parse(readFileSync(join(CHAMPION_DIR, f), "utf8")) as {
      id?: unknown;
      transform?: { counterpartId?: unknown };
    };
    const id = doc.id;
    const cp = doc.transform?.counterpartId;
    if (typeof id === "string" && typeof cp === "string") out.set(id, cp);
  }
  return out;
}

describe("讀狀態的被動 ↔ 掛那個狀態的技能，必須是同一具身體上真的存在的一對", () => {
  it("每一個被條件讀到的狀態，這具身體自己掛得上去", () => {
    const rows = census();
    const cp = counterparts();
    const orphans: string[] = [];
    for (const [hero, { reads, writes }] of rows) {
      const alsoWrites = rows.get(cp.get(hero) ?? "")?.writes;
      for (const sid of reads) {
        if (AMBIENT.has(sid) || writes.has(sid) || alsoWrites?.has(sid)) continue;
        orphans.push(`${hero} 的技能讀 "${sid}"，但這具身體沒有任何一支技能掛得上它`);
      }
    }
    expect(orphans, orphans.join("\n")).toEqual([]);
  });
});
