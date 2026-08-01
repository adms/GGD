/**
 * 格擋規則 —— 目前只有一條:**同一個單位身上有多個格擋來源時,它們怎麼疊**。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * owner 的裁決 (2026-07-31)
 * ════════════════════════════════════════════════════════════════════════════
 * 問題:晨曦之光 (30% 抵擋致命一擊) + 殺豬刀 (30% 抵擋致命一擊) 同時在身上時,
 * 擋下來的機率是 30% 還是 51%?兩件都在 `content/loot-tables/legendary-weapons.json`
 * 的池子裡、兩件都沒有 `unique`,所以這不是假想題,是一場真的湊得出來的組合。
 *
 * owner:「這種情形應該是**獨立判斷兩次**,拿第一次檔掉剩餘繼續算下一次」
 *
 * 所以出貨值是 `independent`:每一個合格來源**各抽各的**,而且**照順序把剩下的
 * 傷害往下傳** —— 第一個擋掉一半之後,第二個看到的是剩下的那一半。兩個 30% 的
 * 全額格擋 ⇒ 1 − 0.7 × 0.7 = **51%**。
 *
 * ⚠️ 這條規則在 owner 裁決之前是 `best`(取 `chance × fraction` 最大的一個,
 * 抽一次),而當時的檔頭寫著一整段論證說「取 max 才對,因為 WC3 的 `Ansk` 不
 * 疊加」。那段論證**被 owner 推翻了**,所以它已經從 `combat/block.ts` 刪掉 ——
 * CLAUDE.md 第三守則:一個活得比它描述的行為還久的註解,是一句等著被相信的謊。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼 `best` 還留著
 * ════════════════════════════════════════════════════════════════════════════
 * CLAUDE.md 第一守則:「拿不定主意的決策,解法是**兩種模式都做,後台可切**,
 * 不是挑一個然後在註解裡辯護。預設值選 owner 明說的那個。」
 *
 * `best` 就是這條規則變成欄位之前的行為(WC3 迴避/格擋族不疊加的那個讀法)。
 * 它留著不是因為我覺得它比較好 —— owner 已經講了 —— 而是因為「兩件同樣的格擋
 * 要不要比一件強」是**平衡**問題,而 owner 反覆推翻過自己的平衡數值。留著它,
 * 下次要換回去是後台一個下拉選單;刪掉它,是一次 PR + 全套測試重跑。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 缺文件 = 出貨預設,不是空表
 * ════════════════════════════════════════════════════════════════════════════
 * `blockRulesFromDoc` 對「沒有文件 / schema 不對 / 值不認得」一律回
 * {@link DEFAULT_BLOCK_RULES}。同 `shieldRules.ts` / `statCaps.ts` 的規矩:
 * 一個 `undefined` 的 stacking 會讓 `blockCutFor` 的 switch 掉到「都不符合」,
 * 而那個結果是**所有格擋靜默失效** —— 卡片照顯示、擋格語音照喊、傷害一點沒少。
 *
 * PURITY: 純資料 + 純函式,沒有 `Math.random` / `Date.now` / 三角函式 / `**`,
 * 也沒有 Map/Set 迭代(`sim/purity.test.ts` 在守)。
 */

/**
 * 多個格擋來源同時吃得到這一發時,它們怎麼疊。
 *
 *   independent  每個來源**各抽各的**,依 `StatsComp.sources` 的插入序,
 *                每一個擋中的都從**剩餘**傷害裡扣掉自己的 `fraction`,
 *                再把剩下的交給下一個(owner 2026-07-31 的裁決 = 出貨值)。
 *   best         只有 `chance × fraction` 最大的那一個參與,**每一發只抽一次**
 *                (是「每一發傷害封包一次」,不是「整場一次」—— 這一行原本寫
 *                「整場」,而 `bestBlockCut` 是每一次 `blockCutFor` 呼叫都抽,
 *                也就是每一發。其餘四處文案寫的都是「整發」)
 *                (= 這條規則變成欄位之前的行為)。
 *
 * 兩者都是**插入序**走訪一個陣列,所以都不需要排序、也不會有比較器 ——
 * 決定性由 `sc.sources` 是 push/splice 陣列這件事保證,不是靠註解。
 */
export type BlockStacking = "independent" | "best";

/** 後台下拉選單的選項來源;也是 `normalizeBlockRules` 的合法值清單。 */
export const BLOCK_STACKINGS: readonly BlockStacking[] = Object.freeze([
  "independent",
  "best",
]);

export interface BlockRules {
  stacking: BlockStacking;
}

/**
 * 出貨預設 —— owner 明說的那一個。
 *
 * ⚠️ 和 `DEFAULT_SHIELD_RULES` 不同:那一份的出貨值刻意等於「變成欄位之前的
 * 行為」,所以搬上後台不動平衡。**這一份會改變平衡**,而且是故意的 ——
 * owner 推翻了舊行為。兩件 30% 致死格擋從 30% 變成 51%。
 */
export const DEFAULT_BLOCK_RULES: BlockRules = Object.freeze({
  stacking: "independent",
});

/** 文件的 schema 字串 —— 讀寫兩端(sim / 後台 overlay)共用這一個常數。 */
export const BLOCK_SCHEMA = "config.block@1";
/** 文件 id(`config` collection 裡的 `block`)。 */
export const BLOCK_DOC_ID = "block";

function isStacking(v: unknown): v is BlockStacking {
  // 逐一比對而不是 `includes`,因為 `readonly T[]` 的 `includes(unknown)` 在 TS
  // 下要先斷言,而斷言正是讓一個打錯的字串溜進 sim 的那一步(同 shieldRules)。
  return v === "independent" || v === "best";
}

/**
 * 正規化操作者/文件給的值。認不得的字串 → 出貨預設,**不是** throw,也不是
 * undefined:sim 不能在解碼設定時炸掉,而 undefined 傳下去會讓 `blockCutFor`
 * 兩條分支都不走 = 格擋整族靜默失效。
 */
export function normalizeBlockRules(raw: unknown): BlockRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    stacking: isStacking(r.stacking) ? r.stacking : DEFAULT_BLOCK_RULES.stacking,
  });
}

/**
 * 讀一份 `config.block@1` 文件(sim 與後台共用的那個 `Configs` registry)。
 * 沒有文件 / schema 不對 → 出貨預設。
 */
export function blockRulesFromDoc(doc: unknown): BlockRules {
  if (!doc || typeof doc !== "object") return DEFAULT_BLOCK_RULES;
  const d = doc as { schema?: unknown; stacking?: unknown };
  if (d.schema !== BLOCK_SCHEMA) return DEFAULT_BLOCK_RULES;
  return normalizeBlockRules(d);
}
