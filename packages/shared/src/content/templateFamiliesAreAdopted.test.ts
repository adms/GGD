/**
 * 🧩 每一個出貨模板家族，要嘛**有內容引用**，要嘛在豁免表裡帶一個**能被反駁的理由**。
 *
 * ⛔ 這條閘在 2026-08-26 之前不存在，而當時 **46 個家族裡 30 個零引用** ——
 * 其中三個有票在等它（#648 的 43 支迴圈技能等 `tpl-periodic-field`、#401 的 6 支等
 * `tpl-line-sweep`、#672 龍虎亂舞等 `tpl-dragon-*`）⇒ **票看起來在跑，而實際上一步都沒動**，
 * 因為「模板做好了」與「技能用得到它」是兩件事，⛔ 而沒有任何東西在問第二件。
 *
 * ⭐ 這是第〇·四守則那一族的形狀：一份沒有人引用的模板，它的參數預設值就是
 * 「後台存得起來、遊戲一輩子看不到」（第一·五守則）。
 *
 * ⚠️ 豁免不是罪 —— 一個**刻意**先於內容落地的機制模板可以在表裡等，
 * ⛔ 但它要寫得出「在等什麼」（票號／前提），而且那句話下一輪讀得懂。
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TPL_DIR = join(REPO, "content/ability-templates");
/** 會引用模板的內容集合（⛔ 不含 champions —— 它是 abilities 的鏡像，會重複計數）。 */
const CONSUMERS = ["content/abilities", "content/items", "content/augments"];

/**
 * 還沒有任何內容引用、但**刻意**留著的家族。每一列要寫「在等什麼」。
 * ⭐ 這張表**只能變短**：把一個家族接上內容之後就把它從這裡刪掉。
 */
const AWAITING_CONTENT: Record<string, string> = {
  // ── 有票在等，⭐ 接上內容就是那張票的第一步 ──────────────────────────
  // ⭐⭐ 2026-08-31：`tpl-periodic-field` 從這張表**刪掉了** —— GH#648 內容批落地，
  //    6 支真正的領域技能接上了它（04-02 炸彈陣 ×2 · 90-01 飛葉快刀 ×2 · 92-04 · 37-03）。
  //    ⚠️ ⭐ 而這一列在此之前逐字寫著「**38 支**的內容批還沒套用」——⛔ **那個數字是假的**：
  //    逐支讀完卡面之後，套得上這份模板的**只有 6 支**，其餘 13 支的正解是引擎早就有的
  //    `dot` / `delayed` / `healthRegen`。⇒ 一張豁免表上的數字**也會過期**，
  //    而它過期的樣子是「看起來還有 38 支要做」——⛔ 那正是這張表要防的東西。
  // ⚠️ ⭐ 2026-08-31：`tpl-ground-nova` **變成零引用**了 —— 它唯一的採用者
  //    `godie-hgam.q`（90-01 飛葉快刀）在 GH#648 搬去了 `tpl-periodic-field`。
  //    ⛔ 那**不是**退步：這一族是「圍著施法者炸**一發**」，而 90-01 的卡面逐字是
  //    「每秒對附近的敵人造成傷害，**持續2秒**」⇒ 它從一開始就選錯家族，
  //    而在此之前沒有任何東西問得出這一題（第一·五守則）。
  //    ⭐ 反駁方式：找到一支真的「一發原地震波」的技能接上去，這一列就要刪掉。
  "tpl-ground-nova": "#648 —— 唯一的採用者 90-01 飛葉快刀搬去 tpl-periodic-field（它的卡面是「每秒…持續2秒」，⛔ 不是一發）；這一族在等一支真正的「原地一發震波」",
  "tpl-dragon-quake": "#672 龍虎亂舞 —— 家族指認（哪幾支屬於這一族）是第一步，還沒做",
  "tpl-dragon-serpent": "#672 同上",
  "tpl-dragon-shockwave": "#672 同上",
  "tpl-combo-finisher": "#672 —— owner 說的「龍虎亂舞」本體（放招後自動連打＋收尾大招）；家族指認未做",
  // ── 機制模板：機器做好了，內容側**還沒有人挑它** ──────────────────
  // ⭐ 這一族的共同狀態：`#244` 的模板總類表把 JASS 分群產出的家族，
  //    引擎機制與 paramsSchema 都在，⛔ 但沒有任何一支出貨技能改成引用它。
  //    ⇒ 接上的順序由 #244 的採用率表決定（按「擋住幾支」排，⛔ 不是按家族順序）。
  "tpl-charge-push": "#244 分群產物 —— 直線衝鋒＋落點推開（52-02 蹂躪編年史那一族）；內容未套用",
  "tpl-leap-strike": "#244 分群產物 —— 拋物線跳躍落地範圍傷害；內容未套用",
  "tpl-teleport": "#244 分群產物 —— 瞬移三種終點（08-02 萊丁快速劍那一族）；內容未套用",
  "tpl-lock-combo": "#244 分群產物 —— 鎖住單體打完整段＋收招掃周圍；內容未套用",
  "tpl-mark-stacks": "#244 分群產物 —— 具名層數標記（【試煉】【風王結界】）＋免死牌；內容未套用",
  "tpl-on-attack": "#244 分群產物 —— 普攻/造成傷害觸發的被動（條件用下拉組出來）；內容未套用",
  "tpl-on-hit-react": "#244 分群產物 —— 受傷反制窗；內容未套用",
  "tpl-proxy-fanout": "#244 分群產物 —— 範圍內每個目標各結算一次單體法術（原作 dummy 繞道的正解）；內容未套用",
  "tpl-random-barrage": "#244 分群產物 —— 區域內連續 N 發隨機落點爆炸（原作 8 支同一個迴圈）；內容未套用",
  "tpl-blink-strike": "#244 分群產物（P2 瞬移突斬）—— 位移詞彙已有，內容未套用",
  "tpl-pull-throw": "#244 分群產物（P2 拉扯投擲）—— 位移詞彙已有，內容未套用",
  // ── P3：⭐ 只有**分類名**，機制與參數都還沒設計 ────────────────────
  // ⚠️ 這一族與上面不同：它們是普查的**分群標籤**，⛔ 不是做好的機器。
  //    ⇒ 接內容之前要先設計 paramsSchema；在那之前它們零引用是**正確**的。
  // ⭐ 2026-09-04（GH#916）：理由從「未設計」改成**量到的需求**——
  //    引擎機制其實齊備（`godie-hvsh.e` 每一場都在跑），⛔ 而 **N=2 且兩支沒有一格共同值**
  //    （duration 10 vs 6 · slow 0.5 vs 0.7 · atkSpd −0.5 vs −1.0）⇒ 17 格 default 有 13 格
  //    出處是同一支技能 ＝ 專屬積木外面包一層模板（違反第一守則規矩 4）。
  "tpl-barrier-domain": "GH#916 量到：機制齊備而 **N=2 且無共同值**（17 格 default 有 13 格出處同一支）⇒ 收斂會擴大不會收斂",
  "tpl-channel-beam": "#244 P3 分類名（引導型持續光束）—— 同上",
  "tpl-death-mechanic": "#244 P3 分類名（死亡機制）—— 同上",
  "tpl-drain-leech": "#244 P3 分類名（汲取吸附）—— 同上",
  "tpl-global-rule": "#244 P3 分類名（全場規則）—— 同上",
  "tpl-growth-charge": "#244 P3 分類名（成長蓄能）—— 同上",
  "tpl-life-manipulate": "#244 P3 分類名（生命操作）—— 同上",
  "tpl-range-gamble": "GH#916 量到：`distanceScale` 出貨採用 **0 支**，而 `docs/ability-templates.csv` 這一族**只有 1 列**（06-00 猜猜拳）⇒ N=1，收它就是專屬積木",
  "tpl-resource-ops": "GH#916 量到：描述含「獲得金錢／黃金／經驗值」的只有 **2 支**，⭐ 而那兩支是**同一隻英雄**的兩格（`godie-h02u.ex` ＋ `godie-h02u.r`）⇒ N=1",
  "tpl-strip-transform": "#244 P3 分類名（剝奪變化）—— 同上",
  "tpl-team-synergy": "GH#916 量到：描述含「全隊／隊友／集結」的只有 **2 支**，⭐ 而那兩支是**孿生英雄的鏡像**（`godie-n00p.passive` ＋ `godie-nsjs.passive`）⇒ N=1",
  // ── ⭐ 永遠不會有引用（刻意）──────────────────────────────────────
  "tpl-data-no-trigger":
    "⭐ **刻意永遠零引用**：它是普查的**分流終點**（25 張行為卡落在這裡＝那些 rawcode 在 JASS 裡沒有觸發器），" +
    "檔頭逐字寫著「永遠不會有參數，也永遠不會 enabled」⇒ 有引用才是缺陷。",
  "tpl-pure-cosmetic":
    "⭐ 同上族：純演出物件資料（無觸發）—— 它描述的是**原作那一邊**的形狀，⛔ 不是 GGD 要套用的機器。",
};

function familyIds(): string[] {
  return readdirSync(TPL_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => f.slice(0, -5))
    .sort();
}

function referenced(): Set<string> {
  const ids = familyIds();
  const hit = new Set<string>();
  for (const dir of CONSUMERS) {
    let files: string[];
    try {
      files = readdirSync(join(REPO, dir));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const raw = readFileSync(join(REPO, dir, f), "utf8");
      for (const id of ids) if (raw.includes(`"${id}"`)) hit.add(id);
    }
  }
  return hit;
}

describe("模板家族的採用率 (template-families-adopted)", () => {
  it("⭐ 零引用的家族一定要在豁免表裡帶理由（⛔ 不是「先做著等以後用」）", () => {
    const used = referenced();
    const orphans = familyIds().filter((id) => !used.has(id) && AWAITING_CONTENT[id] === undefined);
    expect(
      orphans.join("\n"),
      `⛔ ${orphans.length} 個出貨模板家族**沒有任何內容引用**，也沒有在 AWAITING_CONTENT 裡說明在等什麼。\n` +
        `⭐ 兩條路：①把它接上內容（那才是它存在的理由）②在 AWAITING_CONTENT 補一列，` +
        `寫出**在等什麼**（票號／前提）——⛔ 「以後會用到」不算理由，它下一輪讀不懂。\n` +
        `⚠️ 一份沒有人引用的模板，它的參數預設值就是「後台存得起來、遊戲一輩子看不到」。`,
    ).toBe("");
  });

  it("⭐ 豁免表只能變短 —— 已經有引用的家族要從表裡刪掉", () => {
    const used = referenced();
    const stale = Object.keys(AWAITING_CONTENT).filter((id) => used.has(id));
    expect(
      stale.join(", "),
      "✅ 這幾個家族已經有內容引用了 —— 把它們從 AWAITING_CONTENT 刪掉，棘輪才會往下轉。",
    ).toBe("");
  });

  it("⛔ 豁免表不可以指向不存在的家族（打錯字＝那一列在保護空氣）", () => {
    const ids = new Set(familyIds());
    const ghosts = Object.keys(AWAITING_CONTENT).filter((id) => !ids.has(id));
    expect(ghosts.join(", "), "AWAITING_CONTENT 指到不存在的模板家族").toBe("");
  });
});
