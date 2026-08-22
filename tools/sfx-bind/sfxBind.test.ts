/**
 * ⭐【技能施法音的綁定表是**產生的**，而且 `cause` 真的在驅動分類】(GH#554)
 *
 * 兩條，各自關掉一個真的發生過的形態：
 *   ① 承重：`build_bindings.py --check` 對出貨樹是綠的。這份 JSON 在 GH#529 之後
 *      是**手寫的衍生檔** —— 它已經用「看起來完全正確」的方式腐爛過：兩列 unmatched
 *      的理由要人去跑一個**不可能成功**的抽取（那個 clip 根本不在地圖封存裡）。
 *      ⛔ 沒有閘的時候，一句過期的理由跟一句對的理由長得一模一樣。
 *   ② `reason` 是從 `cause` **推導**的，⛔ 不是另外手寫的一句話。這是①那個缺陷的
 *      形狀本身：兩個住處（機制 + 給人看的解釋）各自漂移，而只有人看得出來。
 *
 * ⛔ 這裡**不驗數字**（幾個 cue、誰用哪一個、unmatched 幾列）——那是內容，會變，
 * 而它已經有三個住處在守（doc 的 `sfxKey` × audio-map × reserved.json）。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../..");

const CUES = JSON.parse(
  readFileSync(join(REPO, "content/audio-manifests/ability-sfx-cues.json"), "utf8"),
) as {
  unmatched: { ability: string; ggSnd: string; cause: string; reason: string }[];
};
const RESERVED = JSON.parse(readFileSync(join(HERE, "reserved.json"), "utf8")) as {
  sourceMapSilent: Record<string, unknown>;
};

describe("技能施法音綁定表 (GH#554)", () => {
  it("`build_bindings.py --check` 對出貨樹是綠的 —— 這份 JSON ⛔ 不是手寫的", () => {
    expect(() =>
      execFileSync("python3", [join(HERE, "build_bindings.py"), "--check"], {
        cwd: REPO,
        encoding: "utf8",
      }),
    ).not.toThrow();
  });

  it("每一列 unmatched 的 `reason` 都由它的 `cause` 推導出來", () => {
    expect(CUES.unmatched.length, "unmatched 是空的 —— 這條在測空氣").toBeGreaterThan(0);

    // 同一個 cause 必須永遠給出同一個模板：把 `{gg}` / `{primary}` 這種會變的部分
    // 遮掉之後，一個 cause 只能剩下一種骨架。兩個住處漂移 → 這裡會多出一種。
    const skeletons = new Map<string, Set<string>>();
    for (const row of CUES.unmatched) {
      const bare = row.reason
        .split(row.ggSnd).join("§")
        .replace(/wc3\.[a-z0-9]+/g, "§");
      if (!skeletons.has(row.cause)) skeletons.set(row.cause, new Set());
      skeletons.get(row.cause)!.add(bare);
    }
    for (const [cause, forms] of skeletons) {
      expect(
        [...forms],
        `cause "${cause}" 有不只一種 reason 骨架 ⇒ 有人手改了 reason，` +
          "而它下一次 build_bindings.py 就會被覆蓋掉（或更糟：它現在就在說謊）",
      ).toHaveLength(1);
    }

    // ⭐ 承重的那一半：reserved.json 的 sourceMapSilent 真的在**驅動**分類。
    // 拿掉那張表的效果，就是這幾列退回「去跑抽取」——那正是 GH#554 修的謊。
    const silent = new Set(Object.keys(RESERVED.sourceMapSilent).filter((k) => k[0] !== "_"));
    expect(silent.size, "sourceMapSilent 是空的 —— 這條在測空氣").toBeGreaterThan(0);
    for (const row of CUES.unmatched) {
      if (silent.has(row.ggSnd)) {
        expect(
          row.cause,
          `${row.ability} 的 ${row.ggSnd} 被 reserved.json 記為「原作自己就是啞的」，` +
            "但表上的 cause 不是 source-map-silent ⇒ 那張表沒有在管事",
        ).toBe("source-map-silent");
      }
    }
  });
});
