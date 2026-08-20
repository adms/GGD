/**
 * ⭐【平衡量測的**母體**只有一個住處 —— 而且它是推導出來的】
 *
 * owner 2026-08-21（逐字）：
 *
 * > 「**錯誤的母體資料**　下架沒使用的英雄 技能 說明 道具 請都整理到 legacy 好嗎」
 *
 * ── 被量到的錯 ───────────────────────────────────────────────────────────────
 * `anchors:build` / `statcaps:build` / `mana:audit` / `lowdmg:build` 四支都拿
 * **`readdirSync(content/champions)`**（或註冊表全體）當母體 —— 那是 **71 張卡**：
 *
 *   | 是什麼 | 幾張 | 為什麼不該進母體 |
 *   |---|---:|---|
 *   | 對戰可選名單（`starterChampions`） | **49** | ✅ 這才是母體 |
 *   | **變身態**（`CHAMPION_FORM_PAIRS` 的 alternate） | 20 | 同一位英雄的第二張卡 ⇒ **重複計數**，把中位數往「有變身的人」拉 |
 *   | `sela` / `thorne` | 2 | fail-open 的**骨架佔位**，不是遊戲內容 |
 *
 * ⇒ 傷害五級距、屬性柵欄、滿魔秒數**全部**是用一個含 22 張雜訊卡的母體算出來的，
 * 而 ⛔ **沒有任何東西會紅** —— 檔案數永遠讀得出來，讀得出來就永遠「成功」。
 *
 * ── owner 2026-08-21 的兩則裁決（⛔ 不要再問） ───────────────────────────────
 *
 * > ①「**上架不能包含變身態 我們討論過了 之前就是這樣才沒改到正確的英雄技能**」
 * > ②「並且我們**查所有屬性級距等 都是不考慮變身態的**」
 *
 * ⇒ 母體 = **可選本體**，三種東西一律出局：**變身態**、**退場**、**fail-open 骨架**。
 *
 * ── 為什麼母體是 `starterChampions` 而不是 `data/curation/whitelist.json` ─────
 * ⚠️ 線上白名單（`GET /api/v1/curation/whitelist`）才是玩家看得到的那一份，但它
 * **① `.gitignore` 掉了**（`data/curation/whitelist.json` 是這台機器的營運狀態）、
 * **② CI 上根本不存在**。一份逐位元組比對的產出如果掛在它身上，`--check` 的紅綠
 * 就取決於「跑的人這台機器勾了什麼」—— 那條閘等於沒有閘。
 *
 * ⭐ 而它是**推導得回來的**：2026-08-21 量到線上白名單有 **59**，其中 **10 個是變身態**
 * （`transform.role === "alternate"`）—— 那 10 個⛔**不是十位英雄**，是那 49 位裡某些人的
 * 第二張卡。owner 裁決 ① 之後它們已經從白名單拔掉 ⇒ 線上與 `starterChampions` 都是 **49**。
 * ⚠️ 拔掉是安全的：`whitelist.allowsChampion()` 只在 `MatchController.selectChampion`
 * 被呼叫 —— 它**只擋選人**，⛔ 變身時不查它。
 *
 * ⇒ **母體 = `starterChampions` − `retiredChampions` − 變身態**，三份來源全部在 git 裡。
 *
 * ⛔ 這支不做 `readdirSync(content/champions)` —— 目錄裡有什麼是**檔案系統的事實**
 * （71 張卡：49 本體 ＋ 20 變身態 ＋ 2 骨架佔位），「誰在這一場比賽裡選得出來」是
 * **名單的事實**，兩者從 2026-08-13 的 legacy 搬遷起就不再相等。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readStarterRoster, STARTER_GO_REL } from "./starterRoster";

/** `content/config/roster.json` —— 下架名單的唯一住處。 */
export const ROSTER_JSON_REL = "content/config/roster.json";
/** 英雄卡的目錄 —— ⛔ 只拿來讀 `transform.role`，⚠️ **不是**母體。 */
export const CHAMPIONS_DIR_REL = "content/champions";

/** ⛔ 唯一的母體定義，逐字印進每一份產出，讓讀報告的人知道自己在看誰。 */
export const BALANCE_POPULATION_PROVENANCE =
  `${STARTER_GO_REL} 的 starterChampions（對戰可選名單）− ${ROSTER_JSON_REL} 的 retiredChampions` +
  ` − 變身態（英雄卡的 transform.role === "alternate"）`;

/** 下架名單（`retiredChampions`）。 */
export function readRetiredChampions(repoRoot: string): Set<string> {
  const doc = JSON.parse(readFileSync(join(repoRoot, ROSTER_JSON_REL), "utf8")) as {
    retiredChampions?: string[];
  };
  return new Set(doc.retiredChampions ?? []);
}

/**
 * **變身態**的 id —— 從每一張英雄卡自己的 `transform.role` 推導。
 *
 * ⛔ 這裡刻意**不用** `CHAMPION_FORM_PAIRS`：那張表是 w3x 抽取器的產物（26 對，
 * 含兩邊都已歸檔的 6 對），而「這張卡是不是一個變身態」是**卡自己說的事實**。
 * ⚠️ 也刻意**不寫成一張名單** —— owner 2026-08-21：「之前就是這樣才沒改到正確的英雄技能」。
 */
export function readAlternateFormIds(repoRoot: string): Set<string> {
  const dir = join(repoRoot, CHAMPIONS_DIR_REL);
  const out = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const doc = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
      id?: string;
      transform?: { role?: string };
    };
    if (doc.transform?.role === "alternate" && doc.id) out.add(doc.id);
  }
  // ⚠️ 0 個變身態 = 讀壞了（這棵樹有 20 個），⛔ 不是「沒有人有變身」。
  //    靜默回空集合的代價正是「變身態悄悄回到母體」，而每一份報告照樣產得出來。
  if (out.size === 0) {
    throw new Error(
      `${CHAMPIONS_DIR_REL} 讀出 0 個變身態（transform.role === "alternate"）—— 讀取器壞了，⛔ 不是沒有變身`,
    );
  }
  return out;
}

/**
 * 純函式那一半 —— ⛔ 沒有 I/O，所以守衛驗得動它。
 *
 * @param selectable 對戰可選名單（宣告順序）
 * @param retired    下架名單
 * @param alternates 變身態（⛔ 一律出局，owner 2026-08-21「上架不能包含變身態」）
 * @returns 排序過的母體 id
 */
export function balancePopulationFrom(
  selectable: readonly string[],
  retired: ReadonlySet<string>,
  alternates: ReadonlySet<string>,
): string[] {
  const ids = [
    ...new Set(selectable.filter((id) => !retired.has(id) && !alternates.has(id))),
  ].sort();
  // ⚠️ 空母體 = 讀壞了，⛔ 不是「名單是空的」。一個靜默回 0 的母體會讓每一份
  //    產出變成「中位數 0」而每一支腳本都 EXIT 0。
  if (ids.length === 0) {
    throw new Error(
      `平衡量測母體算出 0 位 —— 讀取器壞了，⛔ 不是名單空了（來源：${BALANCE_POPULATION_PROVENANCE}）`,
    );
  }
  return ids;
}

/** 母體的英雄 id（排序）。⭐ 每一支平衡量測都必須走這一支。 */
export function balancePopulationIds(repoRoot: string): string[] {
  return balancePopulationFrom(
    readStarterRoster(repoRoot),
    readRetiredChampions(repoRoot),
    readAlternateFormIds(repoRoot),
  );
}

/**
 * 母體的英雄**卡**（`content/champions/<id>.json`），與 {@link balancePopulationIds} 同序。
 *
 * ⚠️ 讀不到就 throw：母體上有一位而內容樹沒有他，是**關係破了**
 * （種子清單 ↔ 內容樹，`roster:check` 的第 ② 條），⛔ 不是「跳過他就好」。
 */
export function balancePopulationDocs(repoRoot: string): Record<string, unknown>[] {
  return balancePopulationIds(repoRoot).map((id) => {
    const path = join(repoRoot, "content/champions", `${id}.json`);
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `母體上的 ${id} 在 content/champions/ 裡找不到（${path}）：${(err as Error).message}\n` +
          `→ 要嘛把卡加回內容樹，要嘛把 id 從 ${STARTER_GO_REL} 拿掉。⛔ 不要靜默跳過。`,
      );
    }
  });
}

/**
 * 母體英雄的**技能 id 前綴**集合 —— 技能語料要篩的時候用這一份。
 *
 * ⛔ **不含變身態的技能**（owner 2026-08-21：「查所有屬性級距等 都是不考慮變身態的」）。
 * ⚠️ 這不只是口味問題：變身態的技能是本體那一支的**第二份**（同一個 `NN-XX` 編號，
 * 例 `godie-e001.passive` 與 `godie-e00n.passive` 都是「22-00 嗚鎖打!」）——
 * 兩份都算進語料就是把同一支技能數兩次，而「傷害偏低」清單會因此列出兩列一樣的東西。
 */
export function balanceAbilityOwners(repoRoot: string): Set<string> {
  return new Set(balancePopulationIds(repoRoot));
}
