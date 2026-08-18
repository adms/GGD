/**
 * 「掛上一個狀態」在引擎裡到底會發生什麼 —— **從那份 `status-effect@1` 文件的
 * tags 推導**，一個地方，兩個讀者（GH#365 練習面板的狀態分頁）。
 *
 * ── 為什麼需要這支函式 ────────────────────────────────────────────────────
 * `status-effect@1` 文件裡**沒有機制**。它有 id / name / polarity / tags，
 * 而真正讓【暈眩】暈眩的 `stun: true` 是**技能 JSON 的 `applyStatus` 參數**
 * 在施加的那一刻寫進 `StatusEffect` 的。所以一個「掛上 statusId」的通用指令
 * 如果只 push 一筆 `{statusId, expiresAtTick}`，得到的是一個
 * **HUD 上看得到、遊戲裡什麼都不做**的圖示 —— 第一·五守則那條紅線的教科書形狀。
 *
 * ⭐ 出貨的 40 份文件已經把答案寫在 `tags` 裡了（那是 owner 2026-08-08 要求
 * 「專屬 tag ＋ 所有適用的類別 tag」的直接紅利）：`stun,hard-cc,cc,disable,
 * move-denied,attack-denied,cast-denied` 這一串就是【暈眩】的機制描述。
 * 所以這裡**讀那一串**，⛔ 不在程式裡寫一份 id → 旗標的對照表 —— 後者上線第二天
 * 就會漏掉新加的狀態，而且不會有任何東西紅。
 *
 * ── ⛔ 為什麼客戶端不可以自己送旗標 ──────────────────────────────────────
 * 那等於讓面板發明第二份「暈眩是什麼」的定義。面板與伺服器**呼叫同一支函式**，
 * 所以按鈕上的提示（「會讓你：暈眩·禁足」）與真的發生的事在結構上不可能不一致。
 *
 * ⚠️ 這支函式**刻意不完整**，而缺的那些是有理由的：
 *   · `missChance`（【致盲】【詛咒】的 tags 有 `miss`）—— 文件沒有記**多少**，
 *     憑空挑一個數字就是在卡片上寫一句做不到的話。⇒ 不設。
 *   · `berserk` / `charmed` / `confusion`（tags 有 `ai-override`）—— 那幾條需要
 *     一個 AI 接管者，而練習房是單人的（沒有別人可以被你混亂）。⇒ 不設。
 * 兩者都由 {@link cheatStatusEffects} 的回傳值誠實地說出來：沒進表就是不會發生。
 */

/** 一份狀態文件裡「掛上去真的會發生」的那幾格。全部選填 = 什麼都不會發生。 */
export interface CheatStatusFlags {
  stun?: boolean;
  root?: boolean;
  feared?: boolean;
  silenced?: boolean;
  disarmed?: boolean;
  /** 移動速度倍率（0.8 = 減速 20%）。`undefined` = 不動。 */
  moveSpeedMult?: number;
}

/**
 * 減速幅度住在**文件 id** 裡（`slow20` … `slow60`），⛔ 不在 tags 裡 ——
 * 出貨的七份減速文件 tags 全部只寫 `slow`，分不出 20% 與 60%。
 *
 * ⚠️ 這是一條**規則**不是一份名單：`slow<N>` 這個命名法一旦有人加了 `slow15`，
 * 這裡自動就懂。⛔ 對不上這個形狀的減速（將來有人取名 `chill`）會拿到
 * `undefined` ＝ 不減速，而那正是誠實的答案：這支函式讀不出它減多少。
 */
const SLOW_ID = /^slow(\d{1,2})$/;

/** 一份狀態文件（id + tags）→ 掛上去會發生的機制。純函式，兩端共用。 */
export function cheatStatusFlags(id: string, tags: readonly string[] | undefined): CheatStatusFlags {
  const t = new Set(tags ?? []);
  const out: CheatStatusFlags = {};
  // 硬控 —— `hard-cc` 與 `stun` 在出貨的六份文件裡永遠同時出現，兩個都認是為了
  // 讓將來只標其中一個的文件也能work（⛔ 不是為了容錯一份寫錯的文件）。
  if (t.has("stun") || t.has("hard-cc")) out.stun = true;
  // 禁足 —— `root` 是專屬 tag，`immobilize` 是類別 tag。
  if (t.has("root") || t.has("immobilize")) out.root = true;
  // 恐懼 —— `flee` 是它與其他 `ai-override` 家族成員的分野（暴走/混亂/魅惑沒有）。
  if (t.has("fear") || t.has("flee")) out.feared = true;
  // 沉默 / 繳械 —— 它們是「這半個操作被拿走」的類別 tag。暈眩身上兩個都有，
  // 而那是對的：一個被暈的人本來就既放不出技能也打不出普攻。
  if (t.has("cast-denied")) out.silenced = true;
  if (t.has("attack-denied")) out.disarmed = true;
  const m = SLOW_ID.exec(id);
  if (m) {
    const pct = Number(m[1]);
    // 100% 減速在引擎裡是 `moveSpeedMult = 0`，那與禁足不同（禁足擋的是位移技能）。
    // 夾在 [0,1] 是防一份 `slow99` 之外的手滑，⛔ 不是平衡意見。
    if (Number.isFinite(pct) && pct > 0 && pct <= 100) out.moveSpeedMult = 1 - pct / 100;
  }
  return out;
}

/** 這份狀態掛上去**會不會真的做任何事**（⛔ 只是一個 HUD 圖示）。 */
export function cheatStatusHasMechanics(flags: CheatStatusFlags): boolean {
  return (
    flags.stun === true ||
    flags.root === true ||
    flags.feared === true ||
    flags.silenced === true ||
    flags.disarmed === true ||
    flags.moveSpeedMult !== undefined
  );
}

/** 繁中標籤 —— 面板按鈕的提示與伺服器的行為讀同一份，所以提示不可能說謊。 */
export const CHEAT_STATUS_FLAG_LABEL: Readonly<Record<keyof CheatStatusFlags, string>> = {
  stun: "暈眩",
  root: "禁足",
  feared: "恐懼",
  silenced: "沉默",
  disarmed: "繳械",
  moveSpeedMult: "減速",
};

/** 「掛上去會發生什麼」的人話，給按鈕的 `title`。空字串 = 只有圖示，沒有機制。 */
export function describeCheatStatusFlags(flags: CheatStatusFlags): string {
  const parts: string[] = [];
  if (flags.stun) parts.push(CHEAT_STATUS_FLAG_LABEL.stun);
  if (flags.root) parts.push(CHEAT_STATUS_FLAG_LABEL.root);
  if (flags.feared) parts.push(CHEAT_STATUS_FLAG_LABEL.feared);
  if (flags.silenced) parts.push(CHEAT_STATUS_FLAG_LABEL.silenced);
  if (flags.disarmed) parts.push(CHEAT_STATUS_FLAG_LABEL.disarmed);
  if (flags.moveSpeedMult !== undefined) {
    parts.push(`${CHEAT_STATUS_FLAG_LABEL.moveSpeedMult} ${Math.round((1 - flags.moveSpeedMult) * 100)}%`);
  }
  return parts.join("·");
}
