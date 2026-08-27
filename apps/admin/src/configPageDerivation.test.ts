/**
 * ⭐ GH#807 —— 「加一份設定 ⇒ `store.ts` 一行都不用改」這件事**真的成立嗎**。
 *
 * 第〇·七守則的「一行接線」病：那一行是**機械的**（59/59 全部照抄），⛔ 不是一個
 * 決定，所以正解是**讓它自動推導**，⛔ 不是把 `store.ts` 拆成一百個。
 *
 * 兩層，各自守一半，⛔ 兩層都不是散文：
 *
 *   1. **型別層（tsc 就會紅）**：`configForms.ts` 上那個 `as const` 是**承重**的 ——
 *      拿掉它，`ConfigDocPage` 會靜靜地塌成 `string`，`Page` 從此收不住任何打錯的
 *      路由名，而**沒有任何測試會紅**（那正是第三守則講的那種沉默）。下面那條型別
 *      斷言把它變成一個 `tsc -p apps/admin` 的錯。
 *   2. **來源層**：`store.ts` 裡**不可以**再出現任何一個 config 頁的字面名 ——
 *      出現了就代表有人又手打了那一行，而這張票的整個目的就是那一行不該存在。
 *
 * ⚠️ 「這 59 頁**有沒有** session-gate」不在這裡驗 —— `configDocCoverage.test.ts`
 * 已經逐份問過 `pageRequiresSession(s.page)`（那也是這次推導的**突變靶**：把
 * `...CONFIG_DOC_SPECS.map((s) => s.page)` 那一行拿掉 ⇒ 它紅並指名那些頁）。
 * ⛔ 同一件事不要用兩條斷言從兩個角度再寫一次（第零守則⏱）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { CONFIG_DOC_SPECS } from "./configForms";
import type { ConfigDocPage, Page } from "./store";

const TAG = "adminui-config-page-derivation";
const STORE_SRC = readFileSync(fileURLToPath(new URL("./store.ts", import.meta.url)), "utf8");

/**
 * 型別層斷言：`ConfigDocPage` 必須**比 `string` 窄**。
 * `as const` 被拿掉 ⇒ `string extends ConfigDocPage` 成立 ⇒ 這個型別變成 `never`
 * ⇒ 下面那個 `= true` 是 tsc 錯誤（TS2322），⛔ 而不是一次沉默的降級。
 */
type ConfigDocPageIsLiteral = string extends ConfigDocPage ? never : true;
const CONFIG_DOC_PAGE_IS_LITERAL: ConfigDocPageIsLiteral = true;

/** 同上，另一半：推導出來的 key 真的進得了 `Page`（⛔ 不是被 `Page` 悄悄忽略）。 */
const SAMPLE_DERIVED_PAGE: Page = CONFIG_DOC_SPECS[0].page;

describe("設定頁的路由 key 從出貨註冊表推導", () => {
  it("`ConfigDocPage` 比 string 窄 —— `as const` 還在", () => {
    cover(TAG);
    expect(CONFIG_DOC_PAGE_IS_LITERAL).toBe(true);
    expect(SAMPLE_DERIVED_PAGE).toBe(CONFIG_DOC_SPECS[0].page);
  });

  it("`store.ts` 裡一個 config 頁的字面名都沒有 —— 那一行接線不存在了", () => {
    cover(TAG);
    const handwritten = CONFIG_DOC_SPECS.map((s) => s.page).filter((p) =>
      STORE_SRC.includes(`"${p}"`),
    );
    expect(
      handwritten,
      `這些設定頁被手打進 store.ts 了：${handwritten.join(", ")} —— ` +
        `它們應該由 CONFIG_DOC_SPECS 推導（Page union 與 SESSION_REQUIRED_PAGES 兩處都是）。` +
        `⛔ 不要在 store.ts 補那一行，加一筆 spec 就好。`,
    ).toEqual([]);
    // 對照組：非設定頁**仍然**逐頁列名（那是決定，不是接線），所以掃描確實掃得到東西。
    expect(STORE_SRC).toContain('"dataMigration"');
  });
});
