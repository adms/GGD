/**
 * ⛔⛔ **owner 旋鈕的值，⛔ 不准在散文裡被抄第二份**（2026-08-23）。
 *
 * ── 為什麼這條閘必須存在 ────────────────────────────────────────────────────
 * owner 2026-08-22 逐字：「**系統冷卻倍率0.2->0.4**」。他轉了那一格，而
 * `content/config/cooldown-tiers.json` 的 `note` 裡寫死著「出貨 0.2 ⇒ 單體·極小
 * 6 卡面秒 = **1.2 實際秒**」—— 真值是 **2.4**。
 *
 * ⚠️ 而那段 `note` **就是產生器的來源**：`docs/editor-contract/ggd-skill-tiers.md`
 * （**給外部編輯器的對外契約**）逐字貼著它。⇒ 我們對 Codex 說了一個差兩倍的謊。
 * ⭐ 而 `pnpm tiers:check` 是**綠的** —— 它比對產物與來源，而兩邊抄的是同一句話，
 * 自己跟自己永遠對得上（第二守則失敗形態⑥的近親：閘量的是複製，不是真相）。
 *
 * ── 判準：**引用**可以，**複述**不行 ────────────────────────────────────────
 * 一段文字提到 `combatEnv.cooldown` 完全沒問題（那是引用）。
 * ⛔ 不可以的是在它附近寫一個**數字**當成那一格的值 —— 那是第二個住處，
 * 而它沒有守衛，所以它必然過期，而且**用最貴的方式過期**（對外契約說謊）。
 *
 * ⭐ 兩邊都從出貨的東西推導：旋鈕名與值讀 `content/config/owner-knobs.json`，
 * 掃描面是**真的**出貨檔。⛔ 沒有手抄的名單。
 *
 * 突變紀錄：把 `cooldown-tiers.json` 的 note 改回「出貨 0.2」 → 紅並指名那個檔。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONFIG_DIR = join(ROOT, "content/config");

interface Knob {
  value: number;
  quote: string;
}

/**
 * 這一格的值在散文裡被抄了一份的樣子 —— ⭐ 只抓**緊接在旋鈕名之後**的那一個。
 *
 * ⚠️ 窗口刻意很窄（{@link NEAR}）：同一段文字裡常常還有**別的欄位自己的**出貨值
 * （例如 `cooldown-rules.json` 的「出貨 0 = 沒有地板」講的是 `hookMinSeconds`）。
 * ⛔ 寬窗口會把那些一起抓進來 —— 而一條會誤報的閘會被人放寬，
 * 而被放寬的閘等於沒有閘。
 */
const RESTATE = /^[^。\n]{0,28}?出貨\s*\**\s*(-?\d+(?:\.\d+)?)/;
/** 從旋鈕名往後看多少字。⭐ 只夠涵蓋「（出貨 X）」與「，出貨 X）」這種緊鄰的寫法。 */
const NEAR = 40;

function knobs(): Record<string, Knob> {
  const raw = JSON.parse(readFileSync(join(CONFIG_DIR, "owner-knobs.json"), "utf8")) as {
    doc?: { knobs?: Record<string, Knob> };
    knobs?: Record<string, Knob>;
  };
  return raw.doc?.knobs ?? raw.knobs ?? {};
}

/** 掃描面：出貨 config ＋ owner 自己會讀的後台欄位說明。 */
function scanned(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const f of readdirSync(CONFIG_DIR)) {
    if (!f.endsWith(".json") || f === "owner-knobs.json") continue;
    out.push({ path: `content/config/${f}`, text: readFileSync(join(CONFIG_DIR, f), "utf8") });
  }
  const admin = join(ROOT, "apps/admin/src/configForms.ts");
  out.push({ path: "apps/admin/src/configForms.ts", text: readFileSync(admin, "utf8") });
  return out;
}

describe("owner 旋鈕的值不可以在散文裡被複述", () => {
  it("⛔ 沒有任何一段說明抄了一個過期的旋鈕值", () => {
    const ks = knobs();
    expect(Object.keys(ks).length, "owner-knobs.json 讀不到 knobs —— 檔案形狀變了").toBeGreaterThan(0);

    const lies: string[] = [];
    for (const { path, text } of scanned()) {
      for (const [name, knob] of Object.entries(ks)) {
        // 提到這一格的每一個位置
        for (const hit of text.matchAll(new RegExp(`combatEnv\\.${name}`, "g"))) {
          const from = hit.index ?? 0;
          const window = text.slice(from + hit[0].length, from + hit[0].length + NEAR);
          const m = RESTATE.exec(window);
          if (m === null) continue;
          const said = Number(m[1]);
          if (said !== knob.value) {
            lies.push(
              `${path}：combatEnv.${name} 後面緊跟著「出貨 ${said}」，` +
                `而出貨值是 ${knob.value}（owner 的原話：「${knob.quote}」）`,
            );
          }
        }
      }
    }

    expect(
      lies,
      "⛔ owner 轉了旋鈕，而這幾段散文還抄著舊值 —— ⭐ 修法是**把數字拿掉**改成引用" +
        "（`content/config/owner-knobs.json` 是唯一住處），⛔ 不是把數字改成新的" +
        "（那只是把下一次過期往後推）。⚠️ 這些文字有些是**產生器的來源** ⇒ 它同時是對外契約。",
    ).toEqual([]);
  });
});
