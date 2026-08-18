/**
 * [格擋] 四支的 `authoringNote` 有沒有在說謊 —— 對照**出貨的資料**,不是對照我。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼這一條掃的是散文,而那**不是**失敗形態 ⑥
 *
 * CLAUDE.md 失敗形態 ⑥ 講的是「用掃原始碼字串代替行為」—— 掃 `grep xxx` 而不
 * 是跑真的 registry。這裡不一樣:`authoringNote` **本身就是出貨物**。它是
 * 後台 內容管理 頁面上 owner 會讀到的那一段字,和 `description` 一樣是內容,
 * 不是註解。所以「這段字有沒有跟同一份文件裡的資料打架」就是被測的行為本身,
 * 掃它不是代理指標。
 *
 * 這個檔存在的理由是 2026-08-01 抓到的一組真的漂移:
 *
 *   · 晨曦之光 `godie-i016` 出貨 `block.internalCooldown: 1`,而它自己的
 *     `authoringNote` 同時寫著「⚠️ **沒有內部冷卻**,而且這是 owner 自己刪掉
 *     的」以及「若 owner 要把冷卻放回去,那是一個新欄位(BlockGrant 目前沒有)」
 *     —— 一份文件在同一個欄位上自相矛盾,而**沒有任何測試看得到**。
 *   · 奇門盾甲 / 黃金聖鬥衣 / 晨曦之光 三份都還寫著被 owner 推翻的舊規則
 *     「多來源取最好的一個…所以帶兩件格擋不會比一件強」。出貨的
 *     `content/config/block.json` 是 `independent`,兩件 30% 實測 0.51。
 *   · 兩份把 `BlockGrant` 數成「五根軸」,而 `zItemBlockGrant` 有六個鍵。
 *
 * 三條都是「程式是對的、圍著它的字是錯的」,而 `legendary49OwnerText.test.ts`
 * (逐位元比 `description`)與 `legendaryClaims.test.ts`(比數值行 ⇔ modifiers)
 * 兩條既有守衛都看不到 `authoringNote`。
 *
 * ⚠️ 這個檔**只**看得到「出貨資料能自己證偽」的那一類謊。它看不出一段話講得
 * 對不對、也不讀 sim —— 機制本身的守衛在 `sim/combat/block.test.ts` 與
 * `sim/combat/block.shipped.test.ts`。誠實地寫在這裡,免得它被當成比它更強。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zItemDoc, zItemBlockGrant, type ItemDoc } from "./schema/item";
import { blockRulesFromDoc } from "../sim/blockRules";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const ITEMS_DIR = join(CONTENT_DIR, "items");

interface BlockItem {
  id: string;
  doc: ItemDoc;
  note: string;
  block: Record<string, unknown>;
}

/** 出貨的位元組,而且真的通得過 authoring schema。 */
function blockItems(): BlockItem[] {
  const out: BlockItem[] = [];
  for (const f of readdirSync(ITEMS_DIR).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const raw = JSON.parse(readFileSync(join(ITEMS_DIR, f), "utf-8")) as Record<string, unknown>;
    if (raw["block"] === undefined) continue;
    const doc = zItemDoc.parse(raw);
    out.push({
      id: f.replace(/\.json$/, ""),
      doc,
      note: (raw["authoringNote"] as string | undefined) ?? "",
      block: raw["block"] as Record<string, unknown>,
    });
  }
  return out;
}

/** 出貨的格擋規則(`content/config/block.json`)。 */
function shippedStacking(): string {
  const doc = JSON.parse(readFileSync(join(CONTENT_DIR, "config", "block.json"), "utf-8"));
  return blockRulesFromDoc(doc).stacking;
}

const ITEMS = blockItems();

describe("[格擋] authoringNote ⇔ 出貨資料", () => {
  it("池子裡真的有格擋道具 —— 一個掃不到東西的掃描器會永遠是綠的", () => {
    // 失敗形態 ③:整個檔可以在內容被搬走之後繼續全綠。
    //
    // ⚠️ 2026-08-18 **稍晚**回到四支：GANTZ Suit 與 千年積木 的 `block` 被**拿掉**了。
    // 那不是「把守衛改綠」，是規格真的變了 —— 那兩件寶具的
    // `block(fraction:1, lethalOnly:true)` + `onLethalDamage` hook 組合在這個引擎上
    // **後半段永遠不觸發**（`combat/damage.ts` 的 `blockCut` 先把 dmg 削成 0，而
    // `emit("lethalDamage")` 關在 `if (dmg > 0)` 裡面），所以兩張卡改走
    // `marks` + `MarkLethalRule`（逐條理由在它們各自的 `authoringNote`）。
    // ⇒ 它們**不再**是格擋道具，這張表因此回到 2026-08-18 之前的四支。
    expect(ITEMS.map((i) => i.id)).toEqual([
      "godie-i00j", // 奇門盾甲
      "godie-i00s", // 黃金聖鬥衣
      "godie-i016", // 晨曦之光
      "godie-i06g", // 殺豬刀
    ]);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §1 出貨的每一根軸,操作者讀得到的那段字裡都要被指名
  // ═════════════════════════════════════════════════════════════════════════
  it("§1 每一支文件裡真的存在的 block 欄位,authoringNote 都指名了它", () => {
    // 這就是 i016 的形狀:資料上 `internalCooldown: 1` 已經在跑,而 note 從頭到尾
    // 沒有提過這個欄位一次 —— 於是 owner 在後台讀到的是一件「沒有冷卻」的裝備。
    const broken: string[] = [];
    for (const it of ITEMS) {
      for (const key of Object.keys(it.block)) {
        if (!it.note.includes(key)) {
          broken.push(`${it.doc.name} (${it.id}) 出貨 block.${key},authoringNote 一次都沒提到它`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("§2 出貨帶內部冷卻的,不可以在同一段字裡說自己沒有", () => {
    // ⚠️ 禁的是**現在式的那一句原話**「沒有內部冷卻」,不是「冷卻」這個概念。
    // 一份文件要把被推翻的舊說法留下來當紀錄是好事(下一個人才不會又推導一次),
    // 但它必須用轉述而不是原句 —— 否則這道閘分不出「宣稱」和「引述」,而一道
    // 分不出來的閘只會被下一個人用 `// eslint-disable` 的方式繞過去。
    const broken: string[] = [];
    for (const it of ITEMS) {
      const icd = it.block["internalCooldown"];
      if (typeof icd !== "number" || icd <= 0) continue;
      if (it.note.includes("沒有內部冷卻")) {
        broken.push(
          `${it.doc.name} (${it.id}) 出貨 internalCooldown ${icd} 秒,note 卻寫「沒有內部冷卻」`,
        );
      }
    }
    expect(broken).toEqual([]);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §3 軸的清單是數出來的,不是寫出來的
  // ═════════════════════════════════════════════════════════════════════════
  const CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const AXES = Object.keys(zItemBlockGrant.shape);
  /** 出貨文件裡那一句列舉的**正規形**,直接從 schema 產生。 */
  const AXIS_LINE = `${AXES.join(" / ")} **${CN[AXES.length]}根軸**`;

  it(`§3 列舉軸的那一句 = schema 的鍵(現在是「${AXIS_LINE}」)`, () => {
    // 兩份文件本來寫「damageTypes / chance / fraction / lethalOnly / lethalBasis
    // 五根軸」—— 在 `internalCooldown` 補上之後,清單與數字**同時**過期。
    //
    // ⚠️ 不用「掃任何『N 根軸』」那種寫法:黃金聖鬥衣 有一句「文案把三根軸都寫死了」
    // 講的是**這一支的文案釘死了其中三根**,不是 BlockGrant 有幾根 —— 一道分不出
    // 這兩種用法的閘會逼作者改掉一句本來就對的話。所以觸發條件是**那個列舉本身**。
    const broken: string[] = [];
    let claims = 0;
    for (const it of ITEMS) {
      if (!it.note.includes(`${AXES[0]!} / ${AXES[1]!} / ${AXES[2]!}`)) continue;
      claims++;
      if (!it.note.includes(AXIS_LINE)) {
        broken.push(`${it.doc.name} (${it.id}) 的軸列舉跟 zItemBlockGrant 對不上`);
      }
    }
    expect(broken, `每一份列舉軸的 authoringNote 都要寫成「${AXIS_LINE}」`).toEqual([]);
    // 沒有任何一份在列舉 ⇒ 上面那個迴圈空轉,永遠綠(失敗形態 ③)。
    expect(claims, "沒有任何 authoringNote 在列舉軸 —— 這一條在空轉").toBeGreaterThanOrEqual(2);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // §3 多來源規則:出貨值說了算
  // ═════════════════════════════════════════════════════════════════════════
  describe("§4 多來源疊法 —— note 要跟 content/config/block.json 同一國", () => {
    const stacking = shippedStacking();

    it("出貨值就是 owner 裁決的 independent(這一節底下三條都以它為前提)", () => {
      expect(stacking).toBe("independent");
    });

    it("每一支都寫出了 owner 的裁決,而不只是指向某個檔案", () => {
      // 「機制寫在 block.ts」對讀後台的人沒有用 —— 他打不開那個檔。
      const broken = ITEMS.filter((i) => !i.note.includes("獨立判斷兩次")).map(
        (i) => `${i.doc.name} (${i.id})`,
      );
      expect(broken, "這幾支的 authoringNote 沒有寫出 owner 的多來源裁決").toEqual([]);
    });

    it("被推翻的舊規則只能以「舊的」出現,不能單獨站著", () => {
      // 舊句子留著當紀錄是好的(下一個人才不會又推導一次),但它旁邊一定要有
      // 「這已經被推翻了」。這一條就是在釘那個「旁邊」。
      const broken: string[] = [];
      for (const it of ITEMS) {
        if (!it.note.includes("不會比一件強")) continue;
        if (!it.note.includes("推翻")) {
          broken.push(
            `${it.doc.name} (${it.id}) 還寫著「帶兩件格擋不會比一件強」,` +
              `而出貨的 stacking 是 ${stacking} —— 兩件確實比一件強`,
          );
        }
      }
      expect(broken).toEqual([]);
    });
  });
});
