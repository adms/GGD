/**
 * 退場的抽獎池 —— 「退場」這兩個字的**機械意義**，只有這一份實作。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-08-01 的裁決,以及為什麼它需要一個檔案
 * ═══════════════════════════════════════════════════════════════════════════
 * 「第 2、5 回合改發棱彩傳說之後,那 13 支任務小飾品沒有任何回合排它＝拿不到。
 *   排回去還是退場? **=> 退場**」
 *
 * 動手前實際的狀態(量出來的,不是聽說的):`content/config/arena-rules.json` 的
 * 第 2、5 回合都寫 `weaponLootTable: "legendary-weapons"`,`gacha` 整塊不存在,
 * `itemDraft.fallbackTable` 是空字串 —— 所以 `quest-rewards` 真的沒有任何入口。
 * owner 的診斷是對的。
 *
 * 但「已經沒有人排它」和「它退場了」是**兩種不同的狀態**,而磁碟上長得一模一樣。
 * 前者是一次疏漏,後者是一個決定;分辨不出來的後果是,下一個看到「有一張表沒被
 * 排到」的人會把它排回去 —— 那正是 owner 剛剛否決的事。
 *
 * 所以退場 = `arena-rules.retiredLootTables` 裡有它的 id,而且**沒有任何回合、
 * gacha 或備援欄位可以再指到它**。這個檔案就是那條規則,`ContentLoader` 與
 * game-server 的 `rulesFromDoc` 讀的是同一支函式(兩份實作 = 兩份會漂走的規則,
 * 而漂走的那天沒有東西會紅)。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 為什麼不是 Zod 的 `.superRefine`
 * ═══════════════════════════════════════════════════════════════════════════
 * `zConfigDoc` 是 `z.discriminatedUnion("schema", …)`,而 discriminated union 的
 * 成員必須是 `ZodObject`。一個 `.superRefine` 會把 `zConfigArenaRulesDoc` 變成
 * `ZodEffects`,整個 config 聯集當場失效 —— 這件事 `schema/config.ts` 的
 * `zStatCapsTable` 檔頭已經記過一次。跨欄位的規則因此只能站在 schema 之外,
 * 而站在 `ContentLoader` 裡的好處是它**同時**守住 `pnpm content:build`
 * (那支腳本先跑同一個嚴格 loader 才寫檔) 與每一條用嚴格 loader 的測試。
 *
 * ⚠️ 它守不住的那條路要說在明處:後台耐久覆蓋層的寫入路徑目前**完全沒有 Zod
 * 驗證**(#283 —— 那裡的註解宣稱有,是假的)。所以 game-server 側還有第二道:
 * {@link rulesFromDoc} 會把退場的表從回合上剝掉並且 `console.warn`,而不是
 * 靜靜地發下去(失敗形態 ②)。
 */
import { ContentError } from "./errors";
import type { ContentStore } from "./store";
import type { AnyConfigDoc, ConfigArenaRulesDoc } from "./schema/config";

/** 一個「退場的表被排回去」的現場:哪一個欄位,指到哪一張表。 */
export interface RetiredTableUse {
  /** 文件內的點路徑,例如 `rounds.4.weaponLootTable` */
  field: string;
  /** 被指到的那張退場的表 */
  table: string;
}

/** 一份 arena-rules 文件宣告退場的表(順序無關,所以是 Set)。 */
export function retiredLootTables(doc: ConfigArenaRulesDoc): ReadonlySet<string> {
  return new Set(doc.retiredLootTables ?? []);
}

/**
 * 這份文件裡**每一個**指到退場的表的欄位。空陣列 = 這份文件是乾淨的。
 *
 * 三個地方都要看,因為三個都是真的入口 ——
 *   · `rounds[n].weaponLootTable` 免費三選一武器卡(owner 講的那一個)
 *   · `gacha.lootTable`           舊的每回合抽卡(出貨關著,但欄位還在)
 *   · `itemDraft.fallbackTable`   候選不足時的借用池(借來的照樣發到玩家手上)
 *
 * 只擋第一個等於留兩扇後門,而後兩扇一樣會把那 13 支小飾品發出去。
 * 回合鍵**依數字排序**,所以錯誤訊息的順序是穩定的(不是物件鍵的插入序)。
 */
export function scheduledRetiredTables(doc: ConfigArenaRulesDoc): RetiredTableUse[] {
  const retired = retiredLootTables(doc);
  if (retired.size === 0) return [];
  const out: RetiredTableUse[] = [];
  const rounds = Object.keys(doc.rounds)
    .map((k) => [Number(k), k] as const)
    .sort((a, b) => a[0] - b[0]);
  for (const [, key] of rounds) {
    const table = doc.rounds[key]?.weaponLootTable;
    if (table !== undefined && retired.has(table)) {
      out.push({ field: `rounds.${key}.weaponLootTable`, table });
    }
  }
  if (doc.gacha && retired.has(doc.gacha.lootTable)) {
    out.push({ field: "gacha.lootTable", table: doc.gacha.lootTable });
  }
  const fallback = doc.itemDraft?.fallbackTable;
  if (fallback !== undefined && fallback !== "" && retired.has(fallback)) {
    out.push({ field: "itemDraft.fallbackTable", table: fallback });
  }
  return out;
}

/** 一張退場的表被排回某個發放入口。 */
export class RetiredLootTableError extends ContentError {
  constructor(
    readonly docId: string,
    readonly field: string,
    readonly table: string,
  ) {
    super(
      `config/${docId} 欄位 "${field}" 排了已退場的抽獎池 "${table}" —— ` +
        `owner 2026-08-01 裁定它退場,所以它不可以再被任何回合、gacha 或備援欄位指到。` +
        `真的要復活它,先把 "${table}" 從 config/${docId} 的 retiredLootTables 拿掉` +
        `(那是一個看得見的決定),並確認那張表的內容值得再發給玩家。`,
    );
  }
}

/**
 * 整個 store 的退場檢查。`ContentLoader.load()` 呼叫它,所以
 * `pnpm content:build` 在寫任何索引之前就會失敗,而且訊息指名文件與欄位。
 */
export function validateRetiredLootTables(store: ContentStore): RetiredLootTableError[] {
  const out: RetiredLootTableError[] = [];
  for (const doc of store.all<AnyConfigDoc>("config")) {
    if (doc.schema !== "config.arena-rules@1") continue;
    for (const use of scheduledRetiredTables(doc)) {
      out.push(new RetiredLootTableError(doc.id, use.field, use.table));
    }
  }
  return out;
}
