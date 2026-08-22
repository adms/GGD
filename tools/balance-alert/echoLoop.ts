/**
 * ⚠️ **回音迴圈偵測器**（echo-loop-feedback）—— 「調了等於白調」的那一類缺陷。
 *
 * owner 2026-08-22（逐字，兩則）：
 *
 * > 「script 比對**任何傷害跟生命相關參數一起調整的時候要特別發 alert**
 * >  來查看是否造成 **echo-loop-feedback 調了等於白調**的可能性」
 * > 「若你有發現**任何 AP/AD 等傷害與生命值系統倍率或最終生命最大值掛勾**，
 * >  你都要能用 script **檢測出來額外判斷 loop**」
 *
 * ── 它抓的是什麼 ──────────────────────────────────────────────────────────
 * 傷害五級距是**從生命反推**的。只要推導鏈裡出現一個也會放大生命的因子，
 * 那個因子就會在**分子與分母上同時**出現而互相抵銷：
 *
 *     佔血條 = 級距(HP) / 血條(HP)   —— 兩邊一起動 ⇒ 比值恆定
 *
 * ⭐ 這正是 #532/#533 的那個 bug：`maxHealth` 4.0 / 6.0 / 7.2 三個值實測落在
 *   **51.0% / 52.0% / 50.9%** —— ⛔ 一格出貨的後台欄位**轉不動任何東西**，
 *   而 `content:build` 綠、全套測試綠、頁面顯示新值。
 *
 * ── ⛔ 三態，不是兩態（這是這支的關鍵） ──────────────────────────────────
 * 一個「結果沒動」的旋鈕**不一定**是回音迴圈 —— 它也可能只是**不在這條路上**。
 * 把兩者混為一談就會產生假警報，而假警報會讓人關掉這支 script。
 *
 * | 傷害端動了？ | 生命端動了？ | 比值動了？ | 判定 |
 * |---|---|---|---|
 * | ✅ | ✅ | ⛔ **沒動** | 🚨 **回音迴圈** —— 兩邊一起動，抵銷 |
 * | ✅ 或 ✅ | 其一 | ✅ | ⭐ 真的旋鈕 |
 * | ⛔ | ⛔ | ⛔ | ⚪ 不在這條路上（⛔ 不是缺陷） |
 *
 * ── ⛔ 它一定要跑**出貨的那份程式** ──────────────────────────────────────
 * 前一版是 Python 自己重算一次公式 —— 結果它對三個它**根本沒讀**的旋鈕
 * 報了 ALERT（失敗形態⑤：被測的不是出貨的那個）。
 * ⇒ 這一版 import `anchorFloorFrom` / `tiersFromAnchor` / `championStatBase`，
 *   ⛔ 一個公式都沒有重寫。
 *
 * ── ⛔ 它不驗任何出貨數值 ────────────────────────────────────────────────
 * 數值是 owner 每週在調的（第二守則）。它驗的是「**這一格轉得動嗎**」這個**機制**。
 *
 * 用法：
 *     pnpm echoloop            # 印報告
 *     pnpm echoloop:check      # 有 🚨 就非零離開
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anchorFloorFrom, tiersFromAnchor, DAMAGE_TIER_NAMES } from "@ggd/shared/content/damageTiers";
import { COMBAT_ENV_KEYS, type CombatEnvMultipliers } from "@ggd/shared/sim/combatEnv";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../..");
const cfg = (n: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(REPO, "content/config", `${n}.json`), "utf-8")) as Record<string, unknown>;

/** 把值換掉再量一次結果 —— ⭐ 兩個**玩家看得到**的數字。 */
interface Outcome {
  /** 一發最高級距的傷害（減傷前，含全域傷害倍率）。 */
  damage: number;
  /** LV30 中位的引擎最終血量。 */
  hp: number;
  /** 佔血條 % —— ⭐ 回音迴圈就是這一格不動而上面兩格都動。 */
  pct: number;
}

const EPS = 0.005; // 把旋鈕翻倍之後動不到 0.5% ⇒ 當成沒動

function measure(env: CombatEnvMultipliers, baseHp: number, hpBonus: number): Outcome {
  // ⭐ 級距在**純基礎空間**推導（owner：「不能把系統倍率乘進去再反推」）——
  //    走的是出貨的那一支，⛔ 這裡沒有重寫任何公式。
  const smallest = anchorFloorFrom(baseHp, hpBonus);
  const tiers = tiersFromAnchor(smallest);
  const top = tiers[DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]!]!;
  const damage = top * (env.damageDealt ?? 1);
  const hp = baseHp * (env.maxHealth ?? 1) + hpBonus;
  return { damage, hp, pct: (damage / hp) * 100 };
}

function main(): number {
  const check = process.argv.includes("--check");
  const env = cfg("combat-env")["multipliers"] as unknown as CombatEnvMultipliers;
  const doc = readFileSync(join(REPO, "docs/平衡錨點量測.md"), "utf-8");
  const baseHp = Number(/純基礎中位\(LV\d+\) ([\d.]+)/.exec(doc)?.[1]);
  const hpBonus = Number(/\+ 初始加成 ([\d,]+)/.exec(doc)?.[1]?.replace(/,/g, ""));
  if (!Number.isFinite(baseHp) || !Number.isFinite(hpBonus)) {
    console.error("⛔ 讀不到純基礎中位／初始加成 —— docs/平衡錨點量測.md 的格式變了");
    return 2;
  }

  const now = measure(env, baseHp, hpBonus);
  console.log("⚠️  回音迴圈偵測（echo-loop-feedback）—— 「調了等於白調」");
  console.log(
    `   出貨：一發「${DAMAGE_TIER_NAMES[DAMAGE_TIER_NAMES.length - 1]}」＝血條 ${now.pct.toFixed(1)}%` +
      ` · ${(now.hp / now.damage).toFixed(1)} 發送走 LV30 中位`,
  );
  console.log("");
  console.log(`   ${"旋鈕".padEnd(20)}${"傷害端".padStart(8)}${"生命端".padStart(8)}${"佔血條".padStart(8)}   判定`);

  const alerts: string[] = [];
  // ⭐ 掃**每一格**（`COMBAT_ENV_KEYS` 是推導出來的），⛔ 不是一張手挑的名單 ——
  //    owner：「**任何** AP/AD 等傷害與生命值…掛勾，你都要能用 script 檢測出來」。
  for (const knob of COMBAT_ENV_KEYS) {
    const cur = (env as unknown as Record<string, number>)[knob];
    if (typeof cur !== "number" || cur === 0) continue;
    const lo = measure({ ...env, [knob]: cur * 0.5 } as CombatEnvMultipliers, baseHp, hpBonus);
    const hi = measure({ ...env, [knob]: cur * 2 } as CombatEnvMultipliers, baseHp, hpBonus);
    const moved = (a: number, b: number, ref: number): boolean => Math.abs(b - a) / Math.max(ref, 1e-9) > EPS;
    const dmgMoved = moved(lo.damage, hi.damage, now.damage);
    const hpMoved = moved(lo.hp, hi.hp, now.hp);
    const pctMoved = moved(lo.pct, hi.pct, now.pct);

    // ⭐ 三態 —— ⛔ 「沒動」不等於「回音迴圈」
    if (!dmgMoved && !hpMoved) continue; // ⚪ 不在這條路上,⛔ 不是缺陷,不印
    const echo = dmgMoved && hpMoved && !pctMoved;
    const verdict = echo
      ? "🚨 ALERT：回音迴圈（兩邊一起動，調了等於白調）"
      : "⭐ 真的旋鈕";
    console.log(
      `   ${knob.padEnd(20)}${(dmgMoved ? "動" : "—").padStart(8)}${(hpMoved ? "動" : "—").padStart(8)}` +
        `${(pctMoved ? "動" : "⛔不動").padStart(8)}   ${verdict}`,
    );
    if (echo) alerts.push(knob);
  }

  console.log("");
  if (alerts.length > 0) {
    console.log(`🚨 ${alerts.join("、")}：傷害端與生命端**一起**動，而佔血條**沒動**。`);
    console.log("   ⇒ 那一格在推導鏈的分子與分母上同時出現，互相抵銷了。");
    console.log("   ⛔ 修法是把它從**推導**那一側拿掉（owner：「不能把系統倍率乘進去再反推」），");
    console.log("      ⛔ 不是換一個數字 —— 換數字對回音迴圈是完全無效的。");
    return check ? 1 : 0;
  }
  console.log("✔ 沒有回音迴圈：每一個碰得到傷害或生命的旋鈕，佔血條都跟著動。");
  return 0;
}

process.exit(main());
