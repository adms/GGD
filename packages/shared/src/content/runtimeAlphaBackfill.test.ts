/**
 * ⭐【runtime alpha 逐技能接線】GH#690（#688 Phase 4b）的對帳守衛。
 *
 * 原作的透明度**只存在 runtime**（w3u `ucua` 全檔 0 次）—— 它住在 war3map.j 的
 * **57 個 `SetUnitVertexColorBJ` 呼叫點**上，`pnpm locust:build` 把它們掃進
 * `tools/locust-census/census.json` 的 `runtimeAlpha`／`units[].runtimeAlphaPct`。
 * ⇒ census 是那個值的**唯一住處**（第〇·四守則），內容欄只是**從它回填**的副本。
 *
 * 兩個方向都要關（⛔ 只關一半＝值可以單邊漂走）：
 *  ① **census → 內容**：census 量到某具 dummy 有 alpha，而出貨有節點用它的模型
 *     ⇒ 那個節點**必須**帶著同一個值。沒有任何節點用它的模型 ⇒ 必須在 `EXEMPT`
 *     裡帶著一個**能被反駁的理由**。
 *  ② **內容 → census**：出貨節點上的每一格 `alpha` 都要回得到 census 的某一具
 *     dummy ⇒ ⛔ 沒有人可以自己挑一個透明度填進去（第一守則：出貨數值要引用得到出處）。
 *
 * ⭐ **α=100% 的一律不填**：那是「一格乘 1」的空宣稱（第一·五守則，同 `fxTint`
 * 中性色不填的前例）。原作那些 `(100,100,100,0)` 呼叫是**染回原色**的還原呼叫，
 * ⛔ 不是一個效果。⇒ ①的 α=100 分支反過來斷言那個節點**沒有** `alpha`。
 *
 * ⛔ **這一批只回填 α，⛔ 不回填 tint**：tint 的來源是 w3u 的 `uclr/uclg/uclb`
 * （`UNIT_TINTS.json`），⛔ 不是這 57 個呼叫點 —— 混在一起就是把兩個來源的帳算成一本。
 *
 * ── ⚠️ 這一條紅了要改哪裡 ────────────────────────────────────────────────
 * ⛔ **不要直接編 `content/abilities/*.json`** —— 這一族被 `apconv:build` 與
 * `tiers:apply` 就地改欄位，其中幾份還是 `skillremake:json` 的**完整產物**。
 * ⇒ 動手前先問：`bash scripts/genguard.sh content/abilities/<id>.json`
 *   · 產生器的產物 ⇒ 改**來源**（`tools/skill-remake/heroes/*.py` 的 `model_fx=`
 *     表格出口）再 `bash scripts/genrun.sh <step>`（⭐ 看它**最後一行**，
 *     ⛔ 不要只看 `$?` —— 管道會吃掉離開碼）
 *   · 兩個正規化器都只覆寫**自己那幾格**（α 不在其中）⇒ 手改的 `alpha` 會留下來，
 *     ⛔ 但那不代表這個檔是手編的（先 grep 一次 `tools/`）
 * ⚠️ 同一支技能在內容樹裡有**兩份**：standalone ＋ `content/champions/<hero>.json`
 *   的內嵌鏡射 —— **兩份都要動**，否則 `abilityCodeParityForms` 會紅。
 *
 * ── 突變紀錄（一批一條，挑最承重的線）───────────────────────────────────────
 *  · `content/abilities/godie-u01u.r.json` 的 `alpha` 0.5 → 0.4
 *    → ① 紅：「11-04 三千世界…alpha 與 census 不符：內容 0.4 · census 50% ⇒ 0.5」。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTENT = join(ROOT, "content");
const CENSUS = join(ROOT, "tools/locust-census/census.json");

/**
 * census 量到 alpha、⛔ 但出貨的 `spawnModelFx` 一個節點都沒有用它的模型的 dummy。
 * ⭐ 理由要**能被反駁**：那支技能一旦移植（或改成用這具 dummy 的模型），
 * 這一列就會 stale —— ①會指名它「已經有採用者了，把它從 EXEMPT 刪掉」。
 */
const EXEMPT: Record<string, string> = {
  h016: "飛鼠先生殘影（HeroDeathKnight，trigger MoriyaShadow）—— 出貨沒有 imported.herodeathknight 這份模型文件，那支技能的殘影還沒移植",
  h023: "熊熊幻影（PolarBear，trigger GiveMeHoney）—— 同上，stock PolarBear 還沒進 glb",
  // h027 已搬去 SHARED_MODEL_UNADOPTED —— TornadoElemental 落地之後（GH#688 Phase 6
  // TORNADO lane）這具模型有了採用者，⛔ 但採用的是**同模型的另外六隻 dummy**，不是 h027。
  h02G: "Saber 殘影（HeroSaber，trigger ExcaliburMAX）—— imported.herosaber 有模型文件，⛔ 但出貨的 20-03／20-04 用的是 w3x.stock.monsoonbolttarget，沒有任何節點生 Saber 本體",
  o01C: "殺生丸幻影（Sesshomaru，trigger lzfsEffect）—— imported.sesshomaru 有模型文件，⛔ 出貨零節點引用",
  o01E: "雷光劍（BlinkTarget，trigger Light Fight）—— 名字對得上 77-04 真-雷光劍，⛔ 但出貨那支用的是 w3x.stock.monsoonbolttarget；⛔ 不靠名字猜歸屬（模型才是 join key）",
  o01V: "黑龍波龍形2（DuneWorm，trigger EatDragon）—— 出貨的 38-03／38-002 用 darkraor/blackhole/tectonicfury，沒有 DuneWorm",
  o02J: "涅吉雷之投擲（Banditmissile，trigger ThunderCreate）—— 出貨沒有 Banditmissile 模型文件",
  o02K: "戰鬥涅吉巨神殺（Banditmissile，trigger fist）—— 同上（與 o02J 同一份模型）",
  o02T: "B 叔殘影（FelgaurdBlue，trigger Nine Lives Hits）—— 出貨沒有這份模型文件",
  o02X: "96-04x 獨孤九劍殘影（hzyn，trigger NineSwords）—— imported.hzyn 有模型文件，⛔ 但 96-04 的九劍是**召喚**（fieldAdoption 的 summon 那一列逐字記著），還沒移植成 spawnModelFx",
  u018: "安云衝刺（DarkPortalTarget，trigger AzumiShadow/ExcaliburMAX/…）—— 出貨沒有這份模型文件",
};

/**
 * ⭐【模型共用、⛔ 本尊未採用】census 的 alpha 是**逐 dummy**（呼叫點回溯到 rawcode），
 * 而這條守衛的 join key 是**模型**（節點只記 modelKey）—— 兩個粒度在「一份模型被
 * 多隻 dummy 共用」時對不上：TornadoElemental.mdl 被 **9 隻** dummy 共用
 * （census templateSuggestions），其中只有 h027 有 runtime alpha（0.01% ≈ 全隱形），
 * 而 GH#688 Phase 6（TORNADO lane）落地的採用者是**另外六隻**沒有 alpha 的 dummy
 * （e00Y/e013/e016/h01S/o01H/o01P）。⇒ 把 h027 的 0.0001 塞給那六個節點是把
 * 別隻 dummy 的帳記到它們頭上（而且會讓六具龍捲風全隱形）。
 *
 * 這張表的一列＝「這具 dummy 的模型有採用者，⛔ 但沒有一個採用者是**它**」。
 * ①對這一列改驗的不變量：**沒有任何一個採用節點帶著它那個 α**（帶了＝有人把
 * 它的帳記錯了 ⇒ 紅）。它自己要移植時（若 owner 裁決那個 0.01% 不是死演出），
 * 節點會帶 0.0001 ⇒ 這一列當場紅 ⇒ 把它從這張表刪掉。理由可被反駁，⛔ 不是白名單。
 */
const SHARED_MODEL_UNADOPTED: Record<string, string> = {
  h027: "三檔旋風（TornadoElemental，trigger Luf Three Effect）—— 出生即 SetUnitVertexColorBJ(100,100,100,99.99) ⇒ α=0.01%（≈全隱形）的原作死演出；GH#688 Phase 6 的六個 TornadoElemental 節點屬於同模型的另外六隻 dummy，⛔ 不是 h027 的移植",
};

/**
 * 57 個呼叫點裡**回溯不到 dummy 的 rawcode** 的兩類 —— census 已經逐字記著理由，
 * ⛔ 這裡照抄，不重新判斷（第〇·六階梯：JASS 是第 3 層，census 是它的機讀副本）。
 */
const SITE_CATEGORIES: Record<string, string> = {
  "event-unit":
    "目標是**事件單位**（GetTriggerUnit/GetDyingUnit/udg_XxxUnit＝施法者本人），⛔ 不是生成的 dummy ⇒ 那是「把英雄自己染色」的狀態演出，引擎對應物不是 spawnModelFx（要等狀態層的染色機制），⛔ 不猜一支技能塞進去",
  "event-unit-var": "同 event-unit（經由 udg 變數指到事件單位）",
  unresolved:
    "原作死碼：`udg_BlackDragonUnit` 在 war3map.j **全檔零指派**（5 筆）＋ `udg_PandaUnit` 有一筆解不開的指派（1 筆）—— census 逐字標 unresolved，⛔ 不猜",
};

type Census = {
  meta: { counts: Record<string, number> };
  units: { id: string; name: string; model: string | null; runtimeAlphaPct: number[] | null }[];
  runtimeAlpha: { source: string; rawcode: string | null; alphaPct: number | null }[];
};

/** census 的 `Path\To\Foo.mdl` → 出貨模型文件 id（`imported.foo` / `w3x.stock.foo`）。 */
function modelDocIds(): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const f of readdirSync(join(CONTENT, "models"))) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const id = f.slice(0, -5);
    const tail = id.slice(id.lastIndexOf(".") + 1);
    by.set(tail, [...(by.get(tail) ?? []), id]);
  }
  return by;
}

function mdlTail(model: string | null): string | null {
  if (!model) return null;
  return basename(model.replace(/\\/g, "/")).replace(/\.mdl$/i, "").toLowerCase();
}

/** 出貨的每一個 `spawnModelFx` 節點（standalone ability ＋ champion 內嵌鏡射都掃）。 */
function shippedNodes(): { file: string; modelKey?: string; alpha?: number }[] {
  const out: { file: string; modelKey?: string; alpha?: number }[] = [];
  for (const dir of ["abilities", "champions"]) {
    for (const f of readdirSync(join(CONTENT, dir))) {
      if (!f.endsWith(".json") || f.startsWith("_")) continue;
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) n.forEach(walk);
        else if (n && typeof n === "object") {
          const r = n as Record<string, unknown>;
          if (r["kind"] === "spawnModelFx")
            out.push({
              file: `${dir}/${f}`,
              modelKey: r["modelKey"] as string | undefined,
              alpha: r["alpha"] as number | undefined,
            });
          Object.values(r).forEach(walk);
        }
      };
      walk(JSON.parse(readFileSync(join(CONTENT, dir, f), "utf8")));
    }
  }
  return out;
}

describe("runtime alpha 回填對帳（GH#690）", () => {
  const census = JSON.parse(readFileSync(CENSUS, "utf8")) as Census;
  const docIds = modelDocIds();
  const nodes = shippedNodes();

  it("① census 量到 alpha 的每一具 dummy：有採用者就逐格相符，沒有就帶理由豁免", () => {
    for (const u of census.units) {
      const pcts = u.runtimeAlphaPct;
      if (!pcts?.length) continue;
      const tail = mdlTail(u.model);
      const keys = new Set(tail ? (docIds.get(tail) ?? []) : []);
      const users = nodes.filter((n) => n.modelKey && keys.has(n.modelKey));
      if (users.length === 0) {
        expect(
          EXEMPT[u.id],
          `${u.id}（${u.name}）有 runtime alpha 但既沒回填也沒豁免 —— 補一列 EXEMPT 並寫下為什麼`,
        ).toBeTruthy();
        continue;
      }
      expect(
        EXEMPT[u.id],
        `${u.id}（${u.name}）已經有 ${users.length} 個出貨節點採用了 —— 把它從 EXEMPT 刪掉`,
      ).toBeUndefined();
      // ⭐ 同一具 dummy 的多個呼叫點取**最不透明**那一個（還原呼叫 α=100 不算一個效果）。
      const pct = Math.min(...pcts);
      if (SHARED_MODEL_UNADOPTED[u.id]) {
        // 模型共用、本尊未採用：採用節點屬於同模型的**其他** dummy ⇒ 它們一格都
        // 不可以帶著這具 dummy 的 α（帶了＝記錯帳，或它真的被移植了 ⇒ 刪這一列）。
        for (const n of users) {
          expect(
            n.alpha === undefined || Math.abs(n.alpha - pct / 100) > 1e-6,
            `${n.file} 帶著 ${u.id} 的 α=${pct / 100} —— 若這是 ${u.id} 的移植，把它從 SHARED_MODEL_UNADOPTED 刪掉`,
          ).toBe(true);
        }
        continue;
      }
      for (const n of users) {
        if (pct >= 100) {
          expect(
            n.alpha,
            `${n.file} 用 ${n.modelKey} 而 census 的 α=100%（全不透明＝乘 1 的空宣稱）⇒ ⛔ 這一格不可以填`,
          ).toBeUndefined();
        } else {
          expect(
            n.alpha,
            `${n.file}（${u.id}）alpha 與 census 不符：內容 ${n.alpha} · census ${pct}% ⇒ ${pct / 100}`,
          ).toBeCloseTo(pct / 100, 6);
        }
      }
    }
  });

  it("② 出貨節點上的每一格 alpha 都回得到 census（⛔ 沒有人可以自己挑一個透明度）", () => {
    const backing = new Map<string, number>();
    for (const u of census.units) {
      if (!u.runtimeAlphaPct?.length) continue;
      for (const id of docIds.get(mdlTail(u.model) ?? "") ?? [])
        backing.set(id, Math.min(...u.runtimeAlphaPct) / 100);
    }
    const filled = nodes.filter((n) => n.alpha !== undefined);
    expect(filled.length, "一格 alpha 都沒回填 —— 接線掉了").toBeGreaterThan(0);
    for (const n of filled) {
      const want = backing.get(n.modelKey ?? "");
      expect(
        want,
        `${n.file} 填了 alpha=${n.alpha} 而 ${n.modelKey} 在 census 裡沒有 runtime alpha —— 那個數字沒有出處`,
      ).toBeDefined();
      expect(n.alpha!, `${n.file} 的 alpha 與 census 不符`).toBeCloseTo(want!, 6);
    }
  });

  it("③ 57 個呼叫點逐筆有歸宿：有 rawcode 的走①，其餘兩類帶著 census 的理由", () => {
    const c = census.meta.counts;
    expect(census.runtimeAlpha.length).toBe(c["vertexColorCalls"]);
    for (const s of census.runtimeAlpha) {
      if (s.rawcode) continue;
      expect(
        SITE_CATEGORIES[s.source],
        `呼叫點 source=${s.source} 既回溯不到 rawcode 也不在分類豁免表上`,
      ).toBeTruthy();
    }
    const noRaw = census.runtimeAlpha.filter((s) => !s.rawcode).length;
    expect(noRaw, "無 rawcode 的呼叫點數與 census meta 對不上").toBe(
      (c["alphaEventUnit"] ?? -1) + (c["alphaUnresolved"] ?? -1),
    );
  });
});
