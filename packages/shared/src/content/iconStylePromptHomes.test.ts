/**
 * 圖示畫風的提示詞有 **三個住處**，這一條守它們逐字相同。
 *
 * 2026-08-19 量到的：三份裡有兩份已經漂移，而**零個守衛** ——
 * `DEFAULT_ICON_STYLE` 全 repo **沒有任何 import**（純文件），
 * `keywords.py` 的 fail-open 退路還停在更早的版本。
 * 於是後台改了風格、產圖器讀到新的，而另外兩份繼續說舊的故事。
 *
 * ⚠️ 這不是潔癖：`_ICON_STYLE_FALLBACK` 是**讀不到 JSON 時真的會被拿去畫圖**的
 * 那一份。它一旦落後，一次讀檔失敗就會安靜地畫出一整批舊畫風的圖示，
 * 而 stderr 那行 warning 沒有人在看。
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ICON_STYLE } from "./schema/iconStyleDoc";

const REPO = join(__dirname, "..", "..", "..", "..");

/** 從 python 的 `NAME = ( "a" "b" )` 取出串接後的字串。 */
function pyConst(src: string, name: string): string {
  const m = new RegExp(`^${name} = \\(([\\s\\S]*?)\\n\\)`, "m").exec(src);
  if (!m) throw new Error(`keywords.py 找不到 ${name}`);
  return [...m[1]!.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]).join("");
}

describe("圖示畫風提示詞：三個住處逐字相同", () => {
  const shipped = JSON.parse(
    readFileSync(join(REPO, "content/config/icon-style.json"), "utf8"),
  ) as { stylePrompt: string; negativePrompt: string };
  const py = readFileSync(
    join(REPO, "tools/icon-gen/local/keywords.py"),
    "utf8",
  );

  it("① content/config ↔ ② Zod 的 DEFAULT_ICON_STYLE", () => {
    expect(DEFAULT_ICON_STYLE.stylePrompt).toBe(shipped.stylePrompt);
    expect(DEFAULT_ICON_STYLE.negativePrompt).toBe(shipped.negativePrompt);
  });

  it("① content/config ↔ ③ keywords.py 的 fail-open 退路", () => {
    expect(pyConst(py, "ANIME_STYLE")).toBe(shipped.stylePrompt);
    expect(pyConst(py, "ANIME_NEGATIVE")).toBe(shipped.negativePrompt);
  });

  /**
   * ⭐ 產圖器的「這張還新不新」戳記必須**含風格** ——
   * 只比對 METHOD_VERSION 的話，改風格 = 一張都不會重畫（2026-08-19 之前的行為）。
   *
   * ⛔ **這一條刻意不掃原始碼字串。** 第一版就是掃 `_method_stamp` 函式體裡有沒有
   * `stylePrompt` / `sha256`，而突變驗證當場證明它是假的：把 return 改回
   * `keywords.METHOD_VERSION`（功能整個消失）之後，那些字仍然留在 docstring 與
   * 上一行的 `raw = ...` 裡，**測試照樣全綠**（失敗形態⑥：掃字串代替行為）。
   *
   * 所以現在真的把 python 跑起來，換一份風格，看戳記**會不會跟著變**。
   * 突變：`_method_stamp` 改回只回 METHOD_VERSION → 兩次戳記相同 → 紅。
   */
  it("batch.py 的新鮮度戳記會跟著風格變（真的執行）", () => {
    const out = execFileSync(
      "python3",
      [
        "-c",
        [
          "import sys, json",
          `sys.path[:0] = [${JSON.stringify(join(REPO, "tools/icon-gen/local"))}, ${JSON.stringify(join(REPO, "tools/icon-gen/src"))}]`,
          "import keywords, batch",
          "a = batch._method_stamp()",
          // 換掉風格（⛔ 不碰磁碟上的檔案），再問一次戳記
          "keywords.load_icon_style = lambda path=None: {'stylePrompt': 'X', 'negativePrompt': 'Y'}",
          "keywords._icon_style_cache = None",
          "b = batch._method_stamp()",
          "print(json.dumps([a, b]))",
        ].join("\n"),
      ],
      { encoding: "utf8", cwd: REPO },
    );
    const [withShipped, withOther] = JSON.parse(out.trim()) as [string, string];
    expect(withShipped).not.toBe(withOther);
  });
});
