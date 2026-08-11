/**
 * 「分帶要拿誰的數值去算」—— 統計母體的**唯一**判定處。
 *
 * ⛔ 這一支不做統計，只回答一個問題：**這份英雄文件，玩家到得了嗎？**
 * 分帶（`tiers.ts`）只讀它的結論。分開是刻意的：上一版把母體條件寫成
 * `d.attributes?.source === "w3x"` 一行內嵌在迴圈裡，於是沒有人發現那條件
 * 收進了 43 位玩家永遠碰不到的文件（沙包、測試英雄、未開放本體、下架英雄），
 * 而其中一位（腦包英雄 - 打我阿笨蛋）一個人定義了三個帶的邊界。
 *
 * ---------------------------------------------------------------------------
 * 判準：三層 AND，而且**三層都不在同一個檔案裡**
 * ---------------------------------------------------------------------------
 * 「玩家真的選得到誰」沒有單一來源。實際生效的是三個獨立的閘：
 *
 *   ① **營運白名單**（platform，可變）
 *      durable truth 是 host 上 `data/curation/whitelist.json`
 *      （`apps/platform/internal/curation/curation.go`，Collection="curation"
 *      / DocID="whitelist"），對外走 `GET /api/v1/curation/whitelist`。
 *      ⚠️ 它**預設是空的**，而且 repo 裡沒有這個檔（`data/` 只有 .gitkeep）。
 *      ⛔ 所以本機**拿不到線上那一份**，也不可以去線上抓（第零守則 / 不碰正式站）。
 *      本機唯一可重現的代理是它的**種子**：`starterChampions`
 *      （`apps/platform/internal/curation/starter.go`）—— 那份 Go 切片是
 *      「⭐啟用示範組合 / seed -starter」會 union 進白名單的清單。
 *      ⚠️ **種子 ≠ 線上那一份**。`ApplyStarterSet` 是 union-only、永不移除，
 *      而 operator 可以用後台的 PUT / bulk 任意增減。所以線上與這裡的差距
 *      **上下都未知**，見 `POPULATION_CAVEATS`。
 *
 *   ② **內容可選性規則**（客戶端＋伺服器，寫死，刻意不可被 operator 覆蓋）
 *      · 變身態永遠不可被「選」：`isTransformedBody`（`Emeu` 變身態 ＋ `Nef1`
 *        分裂階）。owner 講過兩次（2026-07-26「換成本體，變身態改由技能觸發」、
 *        2026-07-30「不要出現讓人解鎖變身後的英雄吧」）。這道閘刻意寫在
 *        **白名單之外**（`champSelectFilter.ts` 檔頭自己寫了為什麼：白名單的
 *        `enforced:false` 分支原樣放行，而 dev／平台掛掉都走那條）。
 *      · 下架：`content/config/roster.json` 的 `retiredChampions`
 *        （`retiredChampionIdsFromDoc`）。
 *
 *   ③ **帳號擁有權**（藍水晶，逐帳號）
 *      `MatchController.selectChampion` 的 `not-owned` 與 `not-whitelisted`
 *      是**並列**的兩個拒絕理由。`content/config/store.json`：
 *      `championUnlockCost` ＋ `freeChampionIds`。
 *      ⛔ **這一層不進統計母體**，理由寫在 `OWNERSHIP_NOTE`：它是逐帳號、
 *      隨遊玩時間變動的，而分帶要的是「這個遊戲的設計單位有哪些」。
 *      但它會被**報出來**，因為「第一天選得到幾隻」是另一個真問題。
 *
 * ---------------------------------------------------------------------------
 * 為什麼變身態算在母體裡（而它明明「選不到」）
 * ---------------------------------------------------------------------------
 * 判準是**「到得了」不是「選得到」**：`championForm` effect（`sim/effects/
 * championForm.ts`）換掉的是「這個 entity 解析哪一份 champion doc」——
 * 不是疊 buff。所以變身態自己那一份三圍（hp／armor／攻速／射程／移速）
 * 真的會在對局裡生效。把它們排除，就等於宣告一批**真的會出現在畫面上的數值**
 * 不需要分帶。
 *
 * 「可達」的定義：**它的本體在①②裡是可選的**。這正好解釋 owner 點名的
 * 死亡老二 - 克勞薩先生 `godie-u011` 為什麼選不到 —— 不是因為它是變身態
 * （21 個可達的也是），是因為它的本體 `godie-u012` 不在白名單，沒有任何一條
 * 路走得到那個身體。
 *
 * ⚠️ 但**「進母體」與「進 Jenks 擬合」是兩件事**，因為變身態幾乎是本體的複本：
 * 量到 21 個可達變身態裡，生命有 17 個與本體**逐格相同**、防禦 17 個、魔抗 17 個。
 * Jenks 是最小化類內平方差 = **依點數加權**，所以那 17 筆重複值等於把「剛好有
 * 變身」的英雄權重加倍。所以擬合母體做成一個**可切的模式**
 * （{@link FIT_MODES}），預設 `reachable`，另外兩個模式一起量出來對照。
 * 這是決策點，不是我在註解裡辯護選了哪一個。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  baseFormIdOf,
  isSplitFormBody,
  isTransformedBody,
} from "../../packages/shared/src/content/championForms";
import { retiredChampionIdsFromDoc } from "../../packages/shared/src/content/championRetirement";

/** 一份英雄文件在「玩家到不到得了」這件事上的處境。 */
export type Reachability =
  /** 本體，在白名單種子裡 —— 玩家在選人畫面**直接**選得到。 */
  | "本體·可選"
  /** 變身態，而且它的本體可選 —— 玩家選不到，但技能會把他變成這具身體。 */
  | "變身·可達"
  /** 變身態，但本體不可選 —— 沒有任何一條路走得到（例：死亡老二）。 */
  | "變身·不可達"
  /** 本體，但不在白名單種子裡 —— 內容有，營運沒開放。 */
  | "本體·未開放"
  /** 在 `roster.json` 的 retiredChampions 裡。 */
  | "已下架"
  /** `Nef1` 分裂階（巴恩大魔王的三階）—— `tiersInContent=false`，content 裡沒有文件。 */
  | "分裂態"
  /** 不是 `godie-` 文件：`main.tsx` 內容載入失敗時註冊的骨架替身。 */
  | "骨架替身";

export interface Verdict {
  readonly id: string;
  readonly reachable: boolean;
  readonly reachability: Reachability;
  /** 這一份是不是玩家能在選人畫面**鎖定**的（變身態一律 false）。 */
  readonly pickable: boolean;
  /** 變身態時，它的本體 id。 */
  readonly baseId?: string;
  /** 一句話說明為什麼 —— owner 檢查母體對不對時讀的就是這一欄。 */
  readonly why: string;
}

/**
 * 白名單**種子**的英雄清單，從出貨的 Go 原始碼解析出來。
 *
 * ⚠️ 解析而不是抄一份：抄一份就是第四個住處，一定會過期。用的是
 * `apps/game-server/src/curation/whitelist.test.ts` 那支已經在跑的同款解析
 * （starter.go 的註解自己要求「keep this declared as
 * `starterChampions = []string{` with one quoted id per line」，因為已經有測試
 * 在解析它）。行內註解先剝掉，否則註解裡的引號會被當成 id 掃進來。
 */
export function starterChampionIds(repoRoot: string): string[] {
  const src = readFileSync(
    join(repoRoot, "apps/platform/internal/curation/starter.go"),
    "utf8",
  );
  const name = "starterChampions";
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`starter.go 不再宣告 ${name} —— 母體來源斷了，去修這裡`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  if (close < 0) throw new Error(`找不到 ${name} 的結尾`);
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  const ids = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (ids.length < 12) throw new Error(`${name} 只解析出 ${ids.length} 個 id —— 解析壞了`);
  return ids;
}

/** `content/config/roster.json` 的下架清單（走出貨的純函式，不自己讀欄位）。 */
export function retiredIds(repoRoot: string): ReadonlySet<string> {
  return retiredChampionIdsFromDoc(
    JSON.parse(readFileSync(join(repoRoot, "content/config/roster.json"), "utf8")),
  );
}

/**
 * ⛔ 這裡是**唯一**決定「誰進母體」的地方。
 *
 * @param ids       bundle 裡全部的英雄文件 id
 * @param whitelist 白名單種子（`starterChampionIds`）
 * @param retired   下架清單（`retiredIds`）
 */
export function classifyPopulation(
  ids: readonly string[],
  whitelist: ReadonlySet<string>,
  retired: ReadonlySet<string>,
): Map<string, Verdict> {
  // 白名單也在 base 空間比對 —— 與出貨的 `applyChampionWhitelist` 同一條規則
  //（operator 勾了變身態 = 勾了那位英雄，不是「那具身體可以選」）。
  const allowedBases = new Set([...whitelist].map((id) => baseFormIdOf(id)));
  const pickableBase = (id: string): boolean =>
    allowedBases.has(id) && !retired.has(id) && !isTransformedBody(id);

  const out = new Map<string, Verdict>();
  for (const id of ids) {
    const base = baseFormIdOf(id);
    const mk = (v: Omit<Verdict, "id">): void => void out.set(id, { id, ...v });

    if (!id.startsWith("godie-")) {
      mk({
        reachable: false,
        reachability: "骨架替身",
        pickable: false,
        why: "不是 godie- 文件；main.tsx 內容載入失敗時註冊的骨架，不在任何白名單",
      });
      continue;
    }
    if (retired.has(id) || retired.has(base)) {
      mk({
        reachable: false,
        reachability: "已下架",
        pickable: false,
        why: "在 content/config/roster.json 的 retiredChampions",
      });
      continue;
    }
    if (isSplitFormBody(id)) {
      mk({
        reachable: false,
        reachability: "分裂態",
        pickable: false,
        baseId: base,
        why: "Nef1 分裂階（CHAMPION_SPLIT_FORMS，tiersInContent=false）—— content 裡沒有這份文件的路徑",
      });
      continue;
    }
    if (isTransformedBody(id)) {
      const ok = pickableBase(base);
      mk({
        reachable: ok,
        reachability: ok ? "變身·可達" : "變身·不可達",
        pickable: false,
        baseId: base,
        why: ok
          ? `變身態，本體 ${base} 可選 → 技能（championForm）會把玩家變成這具身體，它自己的三圍會生效`
          : `變身態，而本體 ${base} 不在白名單 → 沒有任何一條路走得到這具身體`,
      });
      continue;
    }
    const ok = allowedBases.has(id);
    mk({
      reachable: ok,
      reachability: ok ? "本體·可選" : "本體·未開放",
      pickable: ok,
      why: ok
        ? "本體，在白名單種子（starter.go starterChampions）裡"
        : "本體，但不在白名單種子裡 —— 內容有，營運沒開放",
    });
  }
  return out;
}

/**
 * 擬合母體的三種模式。**這是一個決策點，所以它是一格開關而不是一段註解。**
 *
 * · `reachable`（預設）—— 母體 = 玩家到得了的每一具身體。與「對局裡會出現的
 *   數值分布」對得起來，代價是變身態與本體的重複值會被 Jenks 加權兩次。
 * · `pickable`      —— 只有本體。owner 在做的是「英雄的設計」，而變身態是
 *   同一位英雄的第二面。代價是變身態自己那份三圍不在界線的依據裡。
 * · `reachable-dedup` —— 可達，但**逐項**丟掉「與本體同值」的變身態。
 *   兩邊的折衷：變身態帶來新資訊時算，只是複製本體時不算。
 */
export const FIT_MODES = ["reachable", "pickable", "reachable-dedup"] as const;
export type FitMode = (typeof FIT_MODES)[number];
export const DEFAULT_FIT_MODE: FitMode = "reachable";

/** 舊版母體的定義，只為了「新舊差多少」的對照而留。⛔ 不要拿它當母體。 */
export const LEGACY_FIT_NOTE =
  "attributes.source === 'w3x'（116 份）—— 這是上一版用的條件，收進 43 位玩家永遠到不了的文件";

/** 這份母體**不**回答的問題，以及為什麼。owner 要看到這一段。 */
export const OWNERSHIP_NOTE =
  "藍水晶擁有權（config.store@1：championUnlockCost + freeChampionIds）是第三層閘，逐帳號、隨遊玩時間變動。" +
  "所以「第一天選得到幾隻」比母體小很多，但那是**帳號進度**不是**遊戲的設計單位**，不進分帶母體。兩個數字都報。";

/** 本機量不到、也不可以去線上量的東西。⚠️ 這一段是誠實度，不要刪。 */
export const POPULATION_CAVEATS: readonly string[] = [
  "白名單種子（starter.go）**不是**線上那一份。durable truth 是 host 的 data/curation/whitelist.json，repo 裡沒有這個檔，而且不可以連線上去抓。",
  "ApplyStarterSet 是 union-only（永不移除），而後台的 PUT /curation/whitelist 與 bulk 可以任意增減任何 id → 線上與種子的差距**上下都未知**，不要只往「線上更少」寫。",
  "要關掉這一格只有一條路：請 owner 從後台匯出 whitelist（或 #179 的遷移包）貼進來。⛔ 不可以從「線上顯示 63 隻」這個數字反推內容。",
  "伺服器側 randomChampionPool() 不呼叫 isTransformedBody，所以 bot／殭屍王抽到的身體可能超出這份母體 —— 那是另一個缺口（已記在 docs/hero-tiers-proposal.md），不影響玩家自己選得到誰。",
];
