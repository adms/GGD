/**
 * GH#706 —— `config.stat-normalization@1` 的三住處 drift 閘。
 *
 * `DEFAULT_STAT_NORMALIZATION` 的檔尾註解承諾「這裡的數字與
 * `content/config/stat-normalization.json` 必須一致」，而那句話在 2026-08-25
 * 之前引用的守衛（configDrift.test.ts）是幽靈名 —— 全 repo 零測試讀那份出貨檔。
 * 手法照 `replayPolicyShipped.test.ts`（失敗形態⑤：被測的要是**出貨的那個**）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_STAT_NORMALIZATION, statNormalizationFromDoc } from "./statNormalization";

const SHIPPED = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../content/config/stat-normalization.json",
);

describe("屬性正規化 —— 出貨的那一份 (stat-normalization-shipped)", () => {
  it("解析出貨檔得到的規則，和缺文件時的退路完全一樣（刪掉文件不可以偷偷改行為）", () => {
    const doc = JSON.parse(readFileSync(SHIPPED, "utf8")) as unknown;
    expect(statNormalizationFromDoc(doc)).toEqual(DEFAULT_STAT_NORMALIZATION);
  });
});
