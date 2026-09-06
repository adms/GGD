/**
 * 護盾規則 —— 兩條:
 *   ① **同一個單位身上有多個護盾池時,誰先被吃掉**(`absorbOrder`)
 *   ② ⭐ GH#1091 **法術護盾擋整發還是只擋狀態**(`spellWardBlocksWholeCast`)
 *
 * ⚠️ 兩條的性質**刻意不同**:①的出貨值逐位元等於它變成欄位之前的行為(這一頁
 * 上線不改平衡);②的出貨值**會**改變比賽 —— 它把 07-01 臨、兵、鬥從「只吃掉
 * 減益」改成原作 `ANss` 的「整發消失」。理由見 {@link SpellWardScope}。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 為什麼這是一個欄位,而不是程式裡的一個 if
 * ════════════════════════════════════════════════════════════════════════════
 * owner 2026-07-30:「我們所有開發都要以**編輯器可以彈性設定**為準,**尤其是
 * 決策點**」。
 *
 * 「全類型護盾 + 只吸 AP 護盾同時在身上,先花哪一個」就是一個決策點 ——
 * 我在寫 `combat/damage.ts` 的時候心裡出現了「這裡要選 A 還是 B」,依照 CLAUDE.md
 * 第一守則,那一刻它就該變成一個欄位。
 *
 * ⚠️ 這一段以前**不是**欄位。`absorbOrder` 原本把 narrow-before-broad 寫死,
 * 註解裡還寫著「there is no defensible second option / The reverse ordering never
 * helps the defender in any situation」。那句話是**假的**,兩個方向都假:
 *
 *   · 對**防守方**而言 narrow-first 的確不會比較差 —— 但遊戲平衡不是只有防守方。
 *     破法對咒是**別人**幫你上的 650 點抗魔盾;先花掉它等於讓對面的物理輸出
 *     完全不用處理那道盾。generalFirst 讓「先打掉泛用盾、逼出抗魔盾」變成一個
 *     真的可以操作的節奏,那是設計選擇,不是錯誤。
 *   · 「絕不浪費比較專用的資源」在**護盾會過期**的世界裡也不成立:一個 3 秒的
 *     全類型小盾 + 一個 12 秒的抗魔大盾,先花會過期的那個(insertionOrder /
 *     generalFirst,看施放順序)才不會浪費。
 *
 * 所以三種順序都保留,出貨值是 `specificFirst`(= 這條規則變成欄位之前的行為,
 * 一場都不會因為這次改動而改變),另外兩種等 owner 想調的時候在後台切。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 缺文件 = 出貨預設,不是空表
 * ════════════════════════════════════════════════════════════════════════════
 * `shieldRulesFromDoc` 對「沒有文件 / schema 不對 / 值不認得」一律回
 * `DEFAULT_SHIELD_RULES`。這和 `statCaps.ts` / `combatFeel.ts` 同一條規矩,理由
 * 也一樣:回一個「空的」順序會讓 `absorbOrder` 一個池子都不回傳,於是**所有護盾
 * 靜默失效** —— 遊戲照跑、盾照上、數字照顯示,就是一點傷害都擋不掉。
 *
 * PURITY: 純資料 + 純函式,沒有 `Math.random` / `Date.now` / 三角函式 / `**`,
 * 也沒有 Map/Set 迭代(`sim/purity.test.ts` 在守)。
 */

/**
 * 多個護盾池同時可以吃這一發時的消耗順序。
 *
 *   specificFirst   先花**只吸這一型**的池子,再花全類型的(出貨值 = 舊行為)
 *   generalFirst    先花**全類型**的池子,再花只吸這一型的
 *   insertionOrder  完全不看類型專一性,就照上盾的先後(舊的先花)
 *
 * 每一種內部都是**上盾順序**(舊的先),所以三者都是穩定的分組,不需要排序,
 * 也不會有比較器 —— 決定性由建構方式保證,不是靠註解。
 */
export type ShieldAbsorbOrder = "specificFirst" | "generalFirst" | "insertionOrder";

/** 後台下拉選單的選項來源;也是 `normalizeShieldRules` 的合法值清單。 */
export const SHIELD_ABSORB_ORDERS: readonly ShieldAbsorbOrder[] = Object.freeze([
  "specificFirst",
  "generalFirst",
  "insertionOrder",
]);

/**
 * ⭐ GH#1091 —— **法術護盾擋掉多少**（`statusImmunity.charges` 那一族,07-01 臨、兵、鬥）。
 *
 *   whole        擋**整發**敵方的指定目標法術:傷害與減益一起消失(原作 `ANss`
 *                Spell Shield 的語意 —— Storm Bolt 打上來,暈眩沒中而且一點傷害
 *                都沒有)。⭐ **出貨值**(第〇·六守則:優先權大的那一層預設啟動)。
 *   status-only  只擋**狀態**那一半(`sim/effects/applyStatus.ts` 那道閘,
 *                ＝ GH#1085 那一版的行為):減益被吃掉,傷害照樣落地。
 *                這一格存在的理由**只有一個** —— 一鍵 rollback。
 *
 * ⚠️ 為什麼是決策點而不是「照原作做完就好」:「純傷害的敵方指定目標法術算不算
 * **負性魔法**」在卡面上沒有答案(07-01 的卡面只寫「可抵擋對方負性魔法」),而
 * owner 從來沒有裁決過它。⇒ 第〇·六守則:自己挑一個、預設走高層級(原作),
 * 但**留一格可以翻回來的開關**。
 */
export type SpellWardScope = "whole" | "status-only";

/** 後台下拉選單的選項來源;也是 `normalizeShieldRules` 的合法值清單。 */
export const SPELL_WARD_SCOPES: readonly SpellWardScope[] = Object.freeze([
  "whole",
  "status-only",
]);

export interface ShieldRules {
  absorbOrder: ShieldAbsorbOrder;
  /** 見 {@link SpellWardScope}。消費端:`sim/spellWardCast.ts::spellWardRefusesCast`。 */
  spellWardBlocksWholeCast: SpellWardScope;
}

/**
 * 出貨預設。
 *
 * `specificFirst` 是**這條規則變成欄位之前**寫死的那一個,所以這一版對每一場
 * 比賽都是 byte-identical;換句話說,把決策點搬上後台這件事本身沒有動到平衡。
 */
export const DEFAULT_SHIELD_RULES: ShieldRules = Object.freeze({
  absorbOrder: "specificFirst",
  // ⭐ GH#1091 —— ⚠️ 這一格與上面那一格**不同**:它**會**改變比賽(法術護盾從
  // 「只擋狀態」變成「擋整發」)。刻意的 —— 第〇·六守則的優先序階梯把原作
  // `ANss` 的整發語意排在我上一版的近似之上,而高層級的更新**預設啟動**。
  spellWardBlocksWholeCast: "whole",
});

/** 文件的 schema 字串 —— 讀寫兩端(sim / 後台 overlay)共用這一個常數。 */
export const SHIELD_SCHEMA = "config.shield@1";
/** 文件 id(`config` collection 裡的 `shield`)。 */
export const SHIELD_DOC_ID = "shield";

function isWardScope(v: unknown): v is SpellWardScope {
  // 逐一比對,理由與 `isOrder` 逐字相同。
  return v === "whole" || v === "status-only";
}

function isOrder(v: unknown): v is ShieldAbsorbOrder {
  // 逐一比對而不是 `includes`,因為 `readonly T[]` 的 `includes(unknown)` 在
  // TS 下要先斷言,而斷言正是讓一個打錯的字串溜進 sim 的那一步。
  return v === "specificFirst" || v === "generalFirst" || v === "insertionOrder";
}

/**
 * 正規化操作者/文件給的值。認不得的字串 → 出貨預設,**不是** throw,也不是
 * undefined:sim 不能在解碼設定時炸掉,而 undefined 一路傳下去會讓
 * `absorbOrder` 的 switch 掉到「都不符合」而回傳空陣列(= 護盾全部失效)。
 */
export function normalizeShieldRules(raw: unknown): ShieldRules {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    absorbOrder: isOrder(r.absorbOrder) ? r.absorbOrder : DEFAULT_SHIELD_RULES.absorbOrder,
    // 缺席(舊的覆蓋層、`shieldAbsorb.test.ts` 的夾具)⇒ 出貨預設,⛔ 不是 undefined:
    // 一個 undefined 一路傳到 `spellWardRefusesCast` 會讓整發攔截靜默關閉。
    spellWardBlocksWholeCast: isWardScope(r.spellWardBlocksWholeCast)
      ? r.spellWardBlocksWholeCast
      : DEFAULT_SHIELD_RULES.spellWardBlocksWholeCast,
  });
}

/**
 * 讀一份 `config.shield@1` 文件(sim 與後台共用的那個 `Configs` registry)。
 * 沒有文件 / schema 不對 → 出貨預設。
 */
export function shieldRulesFromDoc(doc: unknown): ShieldRules {
  if (!doc || typeof doc !== "object") return DEFAULT_SHIELD_RULES;
  const d = doc as { schema?: unknown; absorbOrder?: unknown };
  if (d.schema !== SHIELD_SCHEMA) return DEFAULT_SHIELD_RULES;
  return normalizeShieldRules(d);
}
