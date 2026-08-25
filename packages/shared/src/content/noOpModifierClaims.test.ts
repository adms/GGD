/**
 * ⛔ **卡片上不可以有任何「說了但不會發生」的字。**
 *
 * owner 2026-08-18：
 *
 * > 「我們的規則應該是**不放任何無效說明**，應該**替換類似效果更新**，
 * >  其他有類似狀況也要記得替換」
 *
 * ── 為什麼這是一條**閘**而不是一句提醒 ─────────────────────────────────────
 * 這一族缺陷是 CLAUDE.md 失敗形態②的**最終形態**：schema 收得下、後台存得起來、
 * 卡片上印著那句話、`content:build` 全綠、全套測試全綠 —— 而遊戲裡什麼都不發生。
 * ⛔ 沒有任何既有的守衛會紅，**因為每一個零件都是對的**，只有它們的組合是空的。
 *
 * 2026-08-18 實測：三件新寶具身上有 **25 處**這種宣稱（`shining-golden-orbs` 22 處、
 * `ultimate-mod-shiranui` 2 處、`odm-gear` 1 處），而它們全部通過了
 * content:build + 3,594 條測試。CLAUDE.md 元規則：**判準治不了，只有閘可以。**
 *
 * ── 這一支現在關掉的兩個口子 ───────────────────────────────────────────────
 *
 * ① **`capRaise` / `capRaisePct` 指向一條沒有解鎖空間的屬性。**
 *    `sim/statCaps.ts::effectiveCap` 會把任何解鎖夾回 `unlocked`，所以當
 *    `unlocked === base` 時，這條 modifier 逐位元等於不存在。
 *    出貨的 13 條上限**只有 `as`（4→10）與 `lifesteal`（0.8→20）有空間**。
 *    ⚠️ 這一支**從 config 推導**那張名單，⛔ 不抄字面值 —— owner 哪天替某一條開了
 *    空間，這條守衛會自動跟著放行，⛔ 不必改測試。
 *
 * ② **`pctMult` 掛在「加成型」屬性上**（`outputDamagePct` / `outputHealingPct` /
 *    `outputShieldPct`）。那三條的 base 是 **0**，而管線是
 *    `(base + Σflat) × (1 + ΣpctAdd) × Π(1 + pctMult)` —— `0 × 任何東西 = 0`。
 *    所以它們**只有 `flat` 動得了**，而「不填 stackKey ＝複利」那條慣例對它們用不上。
 *    ⚠️ 這一條是 2026-08-18 那五個平行工作流其中一個**量**出來的，不是推測。
 *
 * ⚠️ 這一支**不是**在審美。它只問一件事：**這條 modifier 在出貨設定下，
 * 有沒有可能改變任何一個數字？** 答案是「不可能」的才會紅。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Stat } from "../sim/stats/statTypes";
import { ModOp } from "../sim/stats/modifiers";
import type { StatusEffect } from "../sim/components";
import { zEffectDefUnion } from "./schema/effect";
import { DEFAULT_DISPEL_RULES, dispelRulesFromDoc } from "../sim/dispelRules";
import {
  shippedAbilityIds,
  shippedChampionIds,
  shippedItemIds,
  SHIPPED_SURFACE_PROVENANCE,
} from "../../testkit/shippedSurface";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 這一支要掃的四個集合 —— 順序固定，讓失敗訊息可重現。 */
const COLLECTIONS = ["items", "abilities", "augments", "champions"] as const;

/**
 * ⭐【一支迭代器，兩種母體】—— GH#472：「稽核／工作的範圍收斂到**上架中**」。
 *
 * owner 講過兩次：
 * > M48（2026-08-18）：「這些是哪裡來的老舊東西，**根本沒上架阿 幹嘛修**…」
 * > M105-1（2026-08-19）：「只要做**有開放的**角色技能及隨機三選一就好，**沒開放的別浪費 token**」
 *
 * ⚠️ 但**不是每一條都該收窄**，所以這一支要一個 `scope` 參數而不是一個過濾器：
 *
 * | scope | 誰用 | 判準 |
 * |---|---|---|
 * | `"shipped"` | 「**卡片上的字會不會騙到玩家**」那一族 | 玩家看不到的卡，說謊不花任何人的成本 |
 * | `"all"` | 「**知識有沒有無聲消失**」「**機制平手線**」那一族 | 與玩家看不看得到無關 |
 *
 * ⭐ 上架面是**推導**的（`testkit/shippedSurface.ts`）：獎池 ∪ 後台貨架開關 ∪ 合成前置。
 * ⛔ 不是一張手打的 id 名單 —— owner 在後台把 `weaponShelfOpen` 打開的那一刻，
 * 這裡掃的東西自己就變多，⛔ 不必改測試。
 *
 * ⚠️ 被略過的那些**沒有消失**：`pnpm roster:check` 的第 ⑫ 條每次都把它們的數量印出來，
 * 所以「未上架的東西悄悄變多」看得見。
 */
function eachContentDoc(
  scope: "all" | "shipped",
  cb: (label: string, raw: string, coll: string, id: string) => void,
): void {
  const allow =
    scope === "all"
      ? null
      : {
          items: shippedItemIds(REPO),
          abilities: shippedAbilityIds(REPO),
          champions: shippedChampionIds(REPO),
          // 增益卡沒有貨架也沒有獎池表 —— 抽卡直接吃整個集合，
          // 所以對它們而言「掃全部」就是「掃上架中」（見 shippedSurface 的檔尾）。
          augments: null as ReadonlySet<string> | null,
        };
  let seen = 0;
  for (const coll of COLLECTIONS) {
    let files: string[];
    try {
      files = readdirSync(join(CONTENT, coll));
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const id = basename(f, ".json");
      if (allow) {
        const set = allow[coll];
        if (set && !set.has(id)) continue;
      }
      let raw: string;
      try {
        raw = readFileSync(join(CONTENT, coll, f), "utf8");
      } catch {
        continue;
      }
      seen += 1;
      cb(`${coll}/${id}`, raw, coll, id);
    }
  }
  // ⚠️ 掃到 0 份 = 過濾條件或路徑壞了，⛔ 不是「內容是空的」。一支空轉的掃描器
  //    對「全綠」與「壞掉」給出一模一樣的答案（失敗形態③）。
  if (seen === 0) {
    throw new Error(
      `內容掃描器掃到 0 份文件（scope=${scope}）—— 路徑或過濾條件壞了。` +
        `上架面來源：${SHIPPED_SURFACE_PROVENANCE}`,
    );
  }
}

/**
 * 這些屬性的 base 是 0 且語意是「加成」，所以乘區對它們恆為 0。
 * ⛔ 加新的加成型 Stat 時要記得補進來 —— 判準是「它的預設值是不是 0，而 0 的意思是
 * 『不動』而不是『歸零』」。
 */
const ADDEND_STATS: readonly Stat[] = [
  Stat.OutputDamagePct,
  Stat.OutputHealingPct,
  Stat.OutputShieldPct,
];

/** 從**出貨的 config** 推導「哪幾條屬性真的解得開」。⛔ 不抄字面值。 */
function raisableStats(): Set<string> {
  const caps = JSON.parse(readFileSync(join(CONTENT, "config/stat-caps.json"), "utf8")) as {
    caps: Record<string, { base: number; unlocked: number }>;
  };
  const out = new Set<string>();
  for (const [stat, c] of Object.entries(caps.caps)) {
    if (Number.isFinite(c.unlocked) && Number.isFinite(c.base) && c.unlocked > c.base) out.add(stat);
  }
  return out;
}

interface Claim {
  doc: string;
  path: string;
  stat: string;
  op: string;
  why: string;
}

/** 這份文件裡有沒有一條**抬高移速上限**的 modifier。 */
function raisesMoveSpeedCap(doc: unknown): boolean {
  if (Array.isArray(doc)) return doc.some(raisesMoveSpeedCap);
  if (doc === null || typeof doc !== "object") return false;
  const o = doc as Record<string, unknown>;
  if (o.stat === Stat.MoveSpeed && (o.op === ModOp.CapRaise || o.op === ModOp.CapRaisePct)) return true;
  return Object.values(o).some(raisesMoveSpeedCap);
}

/**
 * 這份文件裡有沒有一格**真的飛行授權**（`zFlightGrant`）。
 *
 * ⛔ 判準是「`flight` 這個鍵的值是一個**物件**」，⛔ 不是「檔案裡出現 flight 這個字」——
 * 後者被 `tags: ["flight"]`、`authoringNote`、`description` 逐字滿足，而那三個
 * 都不會讓任何人飛起來。授權面有四個（道具頂層 / 天生技 rank / 增益卡頂層 /
 * `applyBuff` effect，見 `schema/effect.ts` 的 `SOURCE_GRANT_SHAPE`），所以遞迴找。
 */
function grantsFlight(doc: unknown): boolean {
  if (Array.isArray(doc)) return doc.some(grantsFlight);
  if (doc === null || typeof doc !== "object") return false;
  const o = doc as Record<string, unknown>;
  const g = o.flight;
  if (g !== null && typeof g === "object" && !Array.isArray(g)) return true;
  return Object.values(o).some(grantsFlight);
}

function walk(node: unknown, path: string, doc: string, raisable: Set<string>, out: Claim[]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, doc, raisable, out));
    return;
  }
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;
  const stat = typeof n.stat === "string" ? n.stat : undefined;
  const op = typeof n.op === "string" ? n.op : undefined;
  if (stat !== undefined && op !== undefined) {
    if ((op === ModOp.CapRaise || op === ModOp.CapRaisePct) && !raisable.has(stat)) {
      out.push({
        doc,
        path,
        stat,
        op,
        why: `「${stat}」在 config.stat-caps@1 裡 unlocked === base（沒有解鎖空間）→ effectiveCap 會把它夾回去，這條 modifier 逐位元等於不存在`,
      });
    }
    if (op === ModOp.PercentMult && (ADDEND_STATS as readonly string[]).includes(stat)) {
      out.push({
        doc,
        path,
        stat,
        op,
        why: `「${stat}」是**加成型**（base 0），而管線是 (base+Σflat)×(1+ΣpctAdd)×Π(1+pctMult) → 0×任何東西=0。只有 flat 動得了它`,
      });
    }
  }
  for (const [k, v] of Object.entries(n)) walk(v, `${path}.${k}`, doc, raisable, out);
}

/**
 * ⭐ 機制欄位的名字**從 `sim/components.ts` 的 `StatusEffect` 推導**（`keyof`）。
 * ⛔ 這裡不可以是一串裸 string —— 哪天那個介面把 `moveSpeedMult` 改名，
 * 這一行要在 tsc 就紅，⛔ 不是等到某一場比賽裡沒有人被減速。
 */
type MechField = keyof StatusEffect;
const ANTIHEAL: readonly MechField[] = ["healingTakenMult", "lifestealMult", "regenMult"];
/**
 * 狀態文件的 **tag** ⇒ 這筆狀態要真的發生，`applyStatus` 上至少要有其中一格。
 *
 * ⚠️ 只收「除了這幾格之外**沒有別的表達方式**」的 tag。泛用的 `cc` / `disable`
 * 不在這裡（理由見下面那條測試的檔頭：那一族的正解是隔壁的 effect）。
 */
const TAG_NEEDS: Readonly<Record<string, readonly MechField[]>> = {
  stun: ["stun"],
  root: ["root"],
  immobilize: ["root"],
  slow: ["moveSpeedMult"],
  "move-speed-down": ["moveSpeedMult"],
  antiheal: ANTIHEAL,
  "heal-down": ANTIHEAL,
  miss: ["missChance"],
  "accuracy-down": ["missChance"],
  flee: ["feared"],
};

/** 出貨的 Zod union 上 `applyStatus` 真的開了哪幾格。⛔ 不抄字面值。 */
function applyStatusSchemaFields(): Set<string> {
  const options = (zEffectDefUnion as unknown as { options: { shape?: Record<string, unknown> }[] })
    .options;
  const opt = options.find(
    (o) => (o.shape?.kind as { _def?: { value?: unknown } } | undefined)?._def?.value === "applyStatus",
  );
  return new Set(Object.keys(opt?.shape ?? {}));
}

/** 每一份狀態文件宣告的 tags（＝內容側自己講的身分）。 */
function statusTags(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const f of readdirSync(join(CONTENT, "status-effects"))) {
    if (!f.endsWith(".json") || f === "_index.json") continue;
    const d = JSON.parse(readFileSync(join(CONTENT, "status-effects", f), "utf8")) as {
      id?: unknown;
      tags?: unknown;
    };
    if (typeof d.id !== "string" || !Array.isArray(d.tags)) continue;
    out.set(d.id, new Set(d.tags.filter((t): t is string => typeof t === "string")));
  }
  return out;
}

interface FakeStatus {
  doc: string;
  path: string;
  statusId: string;
  needs: string[];
}

/** `docs` 省略時掃出貨內容；給值時是夾具（掃描器自我驗證用）。 */
function scanFakeStatuses(
  tags: Map<string, Set<string>>,
  docs?: readonly (readonly [string, unknown])[],
): FakeStatus[] {
  const out: FakeStatus[] = [];
  const visit = (n: unknown, path: string, doc: string, siblings: readonly unknown[]): void => {
    if (Array.isArray(n)) {
      n.forEach((v, i) => visit(v, `${path}[${i}]`, doc, n));
      return;
    }
    if (n === null || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    if (o.kind === "applyStatus" && typeof o.statusId === "string") {
      const t = tags.get(o.statusId) ?? new Set<string>();
      const needs = new Set<string>();
      for (const [tag, fields] of Object.entries(TAG_NEEDS)) {
        if (!t.has(tag)) continue;
        // ⭐ 機制寫在**同一個 effects[] 裡的另一格**也算數（52-03【麻痺】那種寫法）。
        const covered = [o, ...siblings].some(
          (s) =>
            s !== null &&
            typeof s === "object" &&
            fields.some((f) => (s as Record<string, unknown>)[f] !== undefined),
        );
        if (!covered) for (const f of fields) needs.add(f);
      }
      if (needs.size > 0) out.push({ doc, path, statusId: o.statusId, needs: [...needs].sort() });
    }
    for (const [k, v] of Object.entries(o)) visit(v, `${path}.${k}`, doc, siblings);
  };
  if (docs !== undefined) {
    for (const [name, d] of docs) visit(d, "", name, []);
    return out;
  }
  // ⭐ 只掃**上架面**：一句玩家永遠看不到的假狀態不騙任何人（GH#472）。
  eachContentDoc("shipped", (label, raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    visit(parsed, "", label, []);
  });
  return out;
}

function scan(): Claim[] {
  const raisable = raisableStats();
  const out: Claim[] = [];
  // ⭐ 只掃**上架面**：這一條問的是「卡片上的字會不會騙到玩家」，
  //    而玩家拿不到的卡上面寫什麼都不會發生在任何一場比賽裡（GH#472）。
  eachContentDoc("shipped", (label, raw) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    walk(parsed, "", label, raisable, out);
  });
  return out;
}

describe("⛔ 卡片上不可以有「說了但不會發生」的字（owner 2026-08-18）", () => {
  it("★ 出貨的內容裡沒有任何**結構上不可能生效**的 modifier", () => {
    const claims = scan();
    const message = [
      "",
      "⛔ 無效宣稱 —— 這些 modifier 在**出貨設定下不可能改變任何一個數字**。",
      "",
      "owner 2026-08-18 的規則：「不放任何無效說明，應該**替換類似效果更新**」。",
      "⛔ 正確的修法是把那一句換成一個**做得到的等效效果**，",
      "⛔ 不是刪掉 modifier 卻把描述留著（那樣卡片還是在說謊）。",
      "",
      ...claims.map((c) => `  ${c.doc}${c.path}\n      ${c.op} ${c.stat} —— ${c.why}`),
      "",
      "兩條出路：",
      "  1. 換成做得到的等效機制（多數情況的正解）",
      "  2. 如果你真的要那條屬性可以被解鎖 → 把 unlocked 抬高",
      "     （那是一個**平衡決定**，屬於 owner）",
      "",
      "⚠️⚠️ **抬高之前先查那一格是誰寫的**：bash scripts/genguard.sh content/config/stat-caps.json",
      "  · content/config/stat-caps.json 是 **statcaps:build 的產物**（隔離區 chmod 444）。",
      "  · maxHealth/maxMana/healthRegen/manaRegen/ad/armor/mr 這 7 格在 DERIVED_CAP_STATS 裡 ——",
      "    base/unlocked 每次重生成都被 gen_stat_caps.ts 的 capAt[STAT_CAP_ANCHOR_LEVEL] 覆寫。",
      "    ⇒ 手改必被 statcaps:check 逐位元組判 stale。改**來源**：tools/stat-caps/gen_stat_caps.ts。",
      "  · as/ap/lifesteal/cdr/range/ms 這 6 格不在那張表裡，值會留下來 —— ⛔ 但仍然要走",
      "    bash scripts/genrun.sh statcaps:build，⛔ 不要 chmod +w 直接改產物。",
      "",
    ].join("\n");
    expect(claims, message).toEqual([]);
  });

  it("⭐ 守衛自己是活的：把一個加成型屬性配上 pctMult 一定被抓到", () => {
    // ⚠️ 這一條在驗**掃描器**，⛔ 不是驗內容 —— 一支永遠回空陣列的掃描器
    // 會讓上面那條測試對「全綠」與「壞掉」給出一樣的答案（失敗形態③）。
    const out: Claim[] = [];
    walk(
      { modifiers: [{ stat: Stat.OutputDamagePct, op: ModOp.PercentMult, value: 0.2 }] },
      "",
      "fake/doc",
      new Set(["as"]),
      out,
    );
    expect(out.map((c) => c.stat)).toEqual([Stat.OutputDamagePct]);
  });

  /**
   * ⛔ **撞到字數上限時要另存，不是壓縮取代。**
   *
   * owner 2026-08-18：
   *
   * > 「應該是**先備份原本內容成另一份檔案**，不應該直接壓縮取代」
   *
   * 前科（同一天，就在修無效宣稱的那一手）：`authoringNote` 有 2000 字硬上限，
   * 我把補充寫進去撐爆之後，**直接把原文截斷**塞回去 —— `shining-golden-orbs`
   * 因此少了 **254 字**（[完全體] 那一段的逐句對照），而 `content:build` 是綠的。
   *
   * ⚠️ 這與 `docs/legacy/_w3x-fidelity-superseded.md` 是同一條規矩：
   * 被取代的東西要另存 —— **測試可以跟著設計走，知識不可以無聲消失**。
   *
   * 這一條把它變成閘：**任何 `authoringNote` 都不可以帶截斷標記**。
   * 撞到上限的正解是把全文寫進 `docs/legacy/_item-authoring-notes-full.md`，
   * 然後在 JSON 裡留一行指標 —— ⛔ 不是把原文剪掉。
   */
  it("★ ⛔ 沒有任何 authoringNote 是被**截斷**的（撞上限要另存，不是壓縮）", () => {
    const MARKERS = ["…（略）", "…(略)", "……（略", "[truncated]", "（以下略）"];
    const bad: string[] = [];
    // ⚠️ 這一條**刻意掃全部**（GH#472 的例外之一）：它問的是「**知識有沒有無聲消失**」
    //    （第一·五守則：撞字數上限要另存，⛔ 不是壓縮取代），而那與這件東西玩家
    //    拿不拿得到完全無關 —— 一段被剪掉的原文，不會因為那件道具下架就長回來。
    eachContentDoc("all", (label, raw) => {
      let d: { authoringNote?: unknown };
      try {
        d = JSON.parse(raw) as { authoringNote?: unknown };
      } catch {
        return;
      }
      const note = typeof d.authoringNote === "string" ? d.authoringNote : "";
      for (const m of MARKERS) {
        if (note.includes(m)) bad.push(`${label} —— 帶截斷標記「${m}」`);
      }
    });
    expect(
      bad,
      [
        "",
        "⛔ 這些 authoringNote 是被**截斷**的（owner 2026-08-18：「應該是先備份原本內容成另一份檔案，",
        "不應該直接壓縮取代」）。",
        "",
        ...bad.map((b) => `  ${b}`),
        "",
        "正解：把**全文**寫進 docs/legacy/_item-authoring-notes-full.md，",
        "JSON 裡只留一行指標。⛔ 不是把原文剪掉。",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  /**
   * ⭐ **抬移速上限的文件必須同時給飛行。**
   *
   * owner 2026-08-18 對 #60 立體機動裝置的裁決是「**改成飛行型態 並且移動速度上限就好**」——
   * 那兩件事是**一個決定**，不是兩個。
   *
   * ⚠️ 理由是量到的：`sim/statCaps.ts` 記著 30Hz × 0.6(身體半徑) = **18.0 就是離散碰撞的
   * 穿牆平手線**，而新的 `unlocked` 24 = 每 tick 0.8u = 半徑 **133%**，確實在線外。
   * 它安全的**唯一**理由是持有者在飛：`sim/flight.ts` 讓 `MovementSystem` 跳過全部三處推擠，
   * 所以「會不會穿牆」對飛行者不是一個問題 —— 它本來就被允許穿過去。
   *
   * ⛔ 但 `stat-caps` 的 `unlocked` 是**全域**的：任何帶 `ms` capRaise 的來源都吃得到 24，
   * 包含**不會飛的**。那正是平手線會回來的那條路，而它的症狀是「偶爾穿牆」——
   * 查不出來、也不會有任何測試紅。
   *
   * ⇒ 把那個耦合寫成閘。⛔ 它紅了不要改閘：要嘛給那份文件 `flight`，
   * 要嘛把 `ms` 的 capRaise 拿掉。
   *
   * ── ⚠️ 2026-08-18：這一條在此之前是**字串比對**，所以它可以空轉 ──────────
   * 它問的是 `raw.includes('"flight"')` —— 而 `"flight"` 這個字在一份 JSON 裡
   * 出現的地方**不只有授權格**：`tags` 裡一個字、`authoringNote` / `description`
   * 裡一句話，逐字都長成同一個樣子。實測：把 `odm-gear` 的**頂層 flight 授權格
   * 整個刪掉**、`ms` 的 `capRaisePct` 一個字都不動 ⇒ 這條守衛**仍然是綠的**，
   * 因為它的 `tags` 裡還留著 `"flight"`。
   *
   * 那正是它存在要擋的那個結果：移速抬到 24、而持有者**不會飛** ⇒ 偶爾穿牆。
   * ⭐ 而「把 `ms.unlocked` 從 18 抬到 24」這件事的**唯一安全理由**就是這道耦合，
   * 所以一道會空轉的閘等於那次抬高沒有任何依據。
   *
   * ⇒ 現在改成**結構檢查**：`flight` 必須是一格真的授權物件（`zFlightGrant`），
   * ⛔ 不看 tags / authoringNote / description。授權面有四個（道具頂層、天生技
   * rank、增益卡頂層、`applyBuff` effect —— 見 `schema/effect.ts` 的
   * `SOURCE_GRANT_SHAPE`），所以它是**整份文件遞迴找一格物件**，不是只看頂層。
   */
  it("★ ⛔ 抬「移速上限」的文件必須同時給飛行（穿牆平手線的唯一豁免）", () => {
    const offenders: string[] = [];
    // ⚠️ 這一條也**刻意掃全部**（GH#472 的例外之二）：穿牆平手線是**遊戲機制**，
    //    而「有沒有上架」是一格後台開關（`arena-rules.weaponShelfOpen`）——
    //    ⛔ 未上架不等於永遠不上架，而開關翻開的那一刻沒有人會重跑這條稽核。
    eachContentDoc("all", (label, raw) => {
      // 先便宜地篩掉絕大多數文件，再做結構檢查。
      if (!raw.includes("capRaise")) return;
      let doc: unknown;
      try {
        doc = JSON.parse(raw);
      } catch {
        return;
      }
      if (raisesMoveSpeedCap(doc) && !grantsFlight(doc)) {
        offenders.push(label);
      }
    });
    expect(
      offenders,
      [
        "",
        "⛔ 這些文件抬高了**移動速度上限**卻沒有給飛行：",
        ...offenders.map((o) => `  ${o}`),
        "",
        "⚠️ `ms.unlocked` 24 = 每 tick 0.8u = 身體半徑 133%，**在穿牆平手線之外**",
        "（30Hz × 0.6 = 18.0，見 sim/statCaps.ts 的量測）。它安全的唯一理由是",
        "持有者在飛 —— 飛行讓 MovementSystem 跳過全部三處推擠。",
        "",
        "⛔ 不要改這條測試。要嘛給那份文件 `flight`，要嘛把 ms 的 capRaise 拿掉。",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("⭐ 飛行閘認的是**授權格**，不是 tags 裡那個字（兩個方向）", () => {
    // ⚠️ 這一條就是上面那條守衛的突變驗證，寫成斷言而不是一次手動改檔：
    // ⛔ 突變靶不可以是 content/items（會與別人的編輯打架），而寫成夾具之後
    // 它每一次 CI 都重跑，⛔ 不是只有我改的那一天成立。
    const msCapRaise = { modifiers: [{ stat: Stat.MoveSpeed, op: ModOp.CapRaise, value: 24 }] };
    // ① 授權格刪掉、只剩 tags/描述裡那個字 → 必須被抓到（舊的字串比對會漏掉這個）
    const tagOnly = { ...msCapRaise, tags: ["flight"], description: "[飛行] 你會飛" };
    expect(raisesMoveSpeedCap(tagOnly) && !grantsFlight(tagOnly), "tags 裡一個字就讓閘空轉了").toBe(
      true,
    );
    // ② 真的有授權格 → 必須放行
    const granted = { ...msCapRaise, flight: { ignoreObstacles: true } };
    expect(grantsFlight(granted), "真的有 flight 授權格卻被判成沒有").toBe(true);
    // ③ 沒有抬移速上限的文件不受這條管（否則整個 repo 都會紅）
    expect(raisesMoveSpeedCap({ modifiers: [{ stat: Stat.MoveSpeed, op: ModOp.Flat, value: 3 }] })).toBe(
      false,
    );
  });

  it("⭐ 而且它讀的是 config，不是寫死的名單", () => {
    const raisable = raisableStats();
    expect(raisable.size, "config.stat-caps@1 一條解鎖空間都沒有 —— 那整族機制是死的").toBeGreaterThan(0);
    // 有空間的那一條配 capRaise **不可以**被判成無效。
    const someRaisable = [...raisable][0]!;
    const out: Claim[] = [];
    walk(
      { modifiers: [{ stat: someRaisable, op: ModOp.CapRaise, value: 99 }] },
      "",
      "fake/doc",
      raisable,
      out,
    );
    expect(out, `${someRaisable} 有解鎖空間卻被判成無效`).toEqual([]);
  });

  /**
   * ⭐ **第三個口子：`applyStatus` 的假狀態**（2026-08-18）。
   *
   * 上面三條全部只掃 `modifiers`，所以整個 `applyStatus` 家族從它們旁邊走過去
   * 一路全綠。而那一族有一個**比無效 modifier 更糟**的形態：
   *
   * `applyStatus` 的 `statusId` 是一個**軟參照的字串**，schema 收得下任何一個
   * 存在的 id。但機制**不住在狀態文件上** —— `sim/effects/applyStatus.ts` 讀的是
   * `e.stun` / `e.root` / `e.moveSpeedMult` / `e.missChance` / `e.feared` /
   * 三格治療倍率，全部在 **effect 節點自己身上**（`status-effects/*.json` 只負責
   * 身分與文案，那份 schema 的檔頭自己寫著 mechanical parameters live on the card）。
   *
   * ⇒ 一張寫 `{ kind: "applyStatus", statusId: "stun", duration: 1.5 }` 的卡：
   * schema 綠、`content:build` 綠、狀態列**真的會畫出暈眩圖示**、HUD 有倒數 ——
   * 而對方**完全自由**。⚠️ 這比「什麼都沒發生」更貴：玩家看到對面被暈了就衝上去，
   * 於是它不是少一個效果，是**主動誤導決策**。
   *
   * ── 判準怎麼來的（⛔ 兩邊都不抄字面值） ──────────────────────────────────
   * · **要求什麼**：從 `content/status-effects/*.json` 的 `tags` 推導 ——
   *   帶 `stun` 就要有 `stun`、`slow` 要有 `moveSpeedMult`、`antiheal` 要有三格
   *   治療倍率其中之一⋯。tag 是內容側自己宣告的身分，⛔ 不是我在這裡發明的分類。
   * · **有哪些格可以填**：`MechField = keyof StatusEffect`（`sim/components.ts`），
   *   所以任何一格被改名或刪掉，**tsc 當場紅**；再加一條測試比對**出貨的 Zod
   *   union**真的有這幾個鍵，把「型別有但 schema 沒開」那個方向也關起來。
   *
   * ── ⚠️ 已知缺口，⛔ 不要宣稱「applyStatus 的口子全關了」 ──────────────────
   * 這一刀**只做 cc 與 antiheal 那兩族**。刻意留著的：
   * · `shred`（`armor-break` / `magic-break`）與 `dot`（`burn`）在 `applyStatus`
   *   上**根本沒有對應欄位** —— 它們的機制走別條路（`applyBuff` 的 modifier /
   *   週期傷害），所以在這裡沒有東西可以檢查。要關這一族得先有欄位。
   * · 泛用的 `cc` / `disable` 桶（麻痺、癱瘓、混亂）**故意不管**：它們的狀態文件
   *   自己掛著 `mechanism-on-card`，而出貨的正解是把機制寫在**隔壁的 effect** 上
   *   （52-03 無銘斧劍的【麻痺】＝同一個 hook 裡一格 `as -40%` 的 `applyBuff`）。
   *   ⛔ 拿泛用桶去要求節點自己帶欄位會誤報那一整族 —— 實測 8 處。
   */
  it("★ ⛔ 沒有任何 `applyStatus` 是**只有名字沒有機制**的假狀態", () => {
    const tags = statusTags();
    expect(tags.size, "一份狀態文件都讀不到 —— 這條守衛是空轉的").toBeGreaterThan(0);
    const fakes = scanFakeStatuses(tags);
    expect(
      fakes.map((k) => `${k.doc}${k.path} —— [${k.statusId}] 少了 ${k.needs.join(" / ")}`),
      [
        "",
        "⛔ 這幾筆 `applyStatus` **只掛得上名字**：狀態列會畫圖示、HUD 會倒數，",
        "而 `sim/effects/applyStatus.ts` 讀的那幾格一個都沒填 ⇒ 對方完全自由。",
        "",
        "⚠️ 它比「沒有效果」更糟：玩家看到圖示就當對方被控住，於是這是一個",
        "**主動誤導決策**的缺陷，而不是一個少掉的效果。",
        "",
        "修法：把機制那一格填在**這個 effect 節點上**（機制不住在狀態文件上），",
        "或者機制真的在隔壁那個 effect 上時，把它放進同一個 effects[] 陣列。",
        "⛔ 不要改這條測試，也⛔ 不要只改描述 —— 圖示還是會畫出來。",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  it("⭐ 假狀態掃描器自己是活的，而且它認的是**出貨 schema** 上真的有的欄位", () => {
    // ① 兩邊對帳：`keyof StatusEffect` 上有的那幾格，出貨的 Zod union 也要開。
    //    ⛔ 少了這條，型別改對了而 schema 沒開 = 作者永遠填不進去，掃描器卻照樣要求。
    const offered = applyStatusSchemaFields();
    expect(offered.size, "讀不到 applyStatus 的 schema 形狀 —— 掃描器沒有依據").toBeGreaterThan(0);
    const notOffered = [...new Set(Object.values(TAG_NEEDS).flat())].filter((f) => !offered.has(f));
    expect(notOffered, "這幾格 StatusEffect 有、出貨 schema 卻沒開，作者填不進去").toEqual([]);

    // ② 掃描器真的會抓 —— ⛔ 突變靶用夾具，不用 content/items（那是別人正在改的檔）。
    const tags = new Map([["stun", new Set(["stun", "cc", "hard-cc"])]]);
    const fake = { effects: [{ kind: "applyStatus", statusId: "stun", duration: 1.5 }] };
    expect(scanFakeStatuses(tags, [["fixture", fake]]).map((k) => k.needs)).toEqual([["stun"]]);
    // ③ 填了機制那一格就放行
    const real = { effects: [{ kind: "applyStatus", statusId: "stun", duration: 1.5, stun: true }] };
    expect(scanFakeStatuses(tags, [["fixture", real]])).toEqual([]);
    // ④ 機制在**隔壁**那個 effect 上也放行（52-03【麻痺】那種寫法）
    const sibling = {
      effects: [
        { kind: "applyStatus", statusId: "stun", duration: 1.5 },
        { kind: "applyStatus", statusId: "stun", duration: 1.5, stun: true },
      ],
    };
    expect(scanFakeStatuses(tags, [["fixture", sibling]])).toEqual([]);
  });

  /**
   * ⭐ 【淨化】的 `count` 不可以大於出貨的全域上限 —— **靜默夾取**那一族。
   *
   * `sim/effects/dispel.ts` 是 `Math.min(e.count ?? cap, cap)`：一份寫 `count: 50`
   * 的文件在引擎上**逐位元等於寫 3**，而它通過 schema、通過 `content:build`、
   * 通過全套測試。作者（與後台編輯器、與 Codex）於是照著自己填的那個數字寫卡面
   * ——「淨化掉身上**全部**可淨化的減益」—— 而遊戲裡只會拔掉 3 個。
   * 量到的前例（2026-08-18）：8 份文件、7 份寫 50、1 份寫 9。
   *
   * ⭐ 上限**從 `content/config/dispel.json` 推導**，⛔ 不抄字面值 3 ——
   * owner 哪天把 `maxCountCap` 調高，這條守衛自動放行，⛔ 不必改測試。
   * ⚠️ 缺檔／缺欄位時退回 `DEFAULT_DISPEL_RULES`（＝引擎自己的退路），
   * ⛔ 不是「讀不到就跳過」——那會讓這條閘在最需要它的時候靜靜關掉。
   *
   * ⛔ 它紅了不要改這條測試：要嘛把文件的 `count` 改成真話，
   * 要嘛去 `content/config/dispel.json` 把 `maxCountCap` 抬高（那是**平衡決定**，
   * 屬於 owner，而且線上若存過後台覆蓋層，改檔案不會生效）。
   */
  it("★ ⛔ 沒有任何 `dispel.count` 大於出貨的 `maxCountCap`（靜默夾取）", () => {
    const shipped = ((): number => {
      try {
        const doc = JSON.parse(readFileSync(join(CONTENT, "config/dispel.json"), "utf8")) as unknown;
        return dispelRulesFromDoc(doc).maxCountCap;
      } catch {
        return DEFAULT_DISPEL_RULES.maxCountCap;
      }
    })();
    const walkDispel = (n: unknown, path: string, doc: string, out: string[]): void => {
      if (Array.isArray(n)) {
        n.forEach((v, i) => walkDispel(v, `${path}[${i}]`, doc, out));
        return;
      }
      if (n === null || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.kind === "dispel" && typeof o.count === "number" && o.count > shipped) {
        out.push(`${doc}${path} —— count: ${o.count}，引擎實際只會拔 ${shipped}`);
      }
      for (const [k, v] of Object.entries(o)) walkDispel(v, `${path}.${k}`, doc, out);
    };
    // 掃描器自己是活的：一份寫超過上限的夾具一定被抓到
    //（⛔ 突變靶用夾具，不用 content/ —— 那是別人正在改的檔）。
    const canary: string[] = [];
    walkDispel({ effects: [{ kind: "dispel", count: shipped + 1 }] }, "", "fixture", canary);
    expect(canary.length, "掃描器空轉 —— 它對一份違規夾具也回空").toBe(1);

    const over: string[] = [];
    // ⭐ 只掃**上架面**：靜默夾取的傷害是「卡面寫淨化全部、實際只淨化 N 個」——
    //    那是一句騙玩家的話，而玩家拿不到的卡騙不到任何人（GH#472）。
    eachContentDoc("shipped", (label, raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      walkDispel(parsed, "", label, over);
    });

    expect(
      over,
      [
        "",
        `⛔ 這幾處 \`dispel.count\` 大於出貨上限 ${shipped}（\`config/dispel.json.maxCountCap\`）：`,
        ...over.map((o) => `  ${o}`),
        "",
        "`sim/effects/dispel.ts` 是 `Math.min(e.count ?? cap, cap)` —— 多寫的部分**靜默消失**，",
        "而卡面通常照著那個數字寫成「淨化全部」。",
        "",
        "⛔ 不要改這條測試。兩條出路：",
        "  1. 把文件的 count 改成真的會發生的數字（卡面文案要一起改）",
        "  2. 抬高 config/dispel.json 的 maxCountCap —— 那是**平衡決定**，屬於 owner",
        "",
      ].join("\n"),
    ).toEqual([]);
  });

  /**
   * ⭐ 同一族的另一半：上面幾條抓「說了不會發生」，這一條抓「**根本拿不到**」。
   *
   * 出貨慣例是 `cost: 0` ＝「不上架賣，只從獎池掉」。所以一件 `cost: 0` 的寶具
   * 如果**不在任何 loot table 裡**，它對玩家而言不存在 —— 而且**沒有任何東西會叫**：
   * schema 綠、bundle 綠、圖示綠、描述漂亮，只是永遠不會出現在任何一場遊戲裡。
   * 這正是失敗形態②（做了但從沒送到玩家手上）在內容側的樣子。
   *
   * 量到的前例（2026-08-18）：`piercer-crossbow` 穿甲弩 與 `sage-ward-amulet`
   * 賢者的護身符 —— 兩件 tier-5、各有 2 條 modifier + 1 個 passive，`legendary`
   * 標籤也掛著，**在 51 件的基礎池裡一件都沒有**。⚠️ 而 `legendary` 標籤全 repo
   * 沒有任何行為消費者，所以「有標籤」從來就不是「拿得到」的證據。
   *
   * ⚠️ 2026-08-18 稍晚的獎池重新策展（#356）把 49 支拆成三張池，那兩件一張都沒進，
   * 於是它們與 `godie-i063` 一起落進下面的 `CURATION_PENDING`（連同各自的理由）。
   *
   * 突變紀錄：把任何一件現役 `cost: 0` 寶具從它所在的 loot table 拿掉 → 這條紅並
   * 指名它；放回 → 綠。
   */
  it("★ ⛔ 沒有任何 `cost: 0` 的寶具是**任何獎池都抽不到**的（失敗形態②）", () => {
    const pooled = new Set<string>();
    for (const f of readdirSync(join(CONTENT, "loot-tables"))) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = JSON.parse(readFileSync(join(CONTENT, "loot-tables", f), "utf8")) as {
        entries?: { itemId?: string }[];
      };
      for (const e of doc.entries ?? []) if (e.itemId) pooled.add(e.itemId);
    }
    expect(pooled.size, "一個獎池條目都讀不到 —— 這條守衛是空轉的").toBeGreaterThan(0);

    /**
     * ⛔ 具名豁免 —— **不是**把守衛放寬，是把「為什麼還拿不到」寫下來讓它會過期。
     *
     * ⚠️ 加一筆進來之前先確認：真的**沒有任何一個池收得下它**嗎？出貨的三張池
     * 依設計全部關閉 —— `legendary-weapons` 是策展過的基礎池、
     * `ex-release-weapons` 與 `ex-origin-weapons` 是 tier-5 的 [EX解放] / [EX∅ 根源]
     * 專用（owner 2026-08-18：「我們最近新建的不要變更 EX EX解放 EX根源都不要動到」），
     * 而 `quest-rewards` / `round-reward` 已經封存進 `content/_legacy/loot-tables/`
     * 並且宣告退場（`retiredLootTables.test.ts`）。所以「開一條取得路徑」是
     * **策展決定**，不是隨手能補的欄位 —— 那正是這格豁免存在的理由。
     */
    const CURATION_PENDING: Record<string, string> = {
      // ══ 2026-08-18（#356）獎池重新策展之後新增的三筆 ══════════════════════
      // ⚠️ 這三筆**不是**把守衛放寬：這條斷言問的是「玩家拿不拿得到」，而三件的
      // 答案現在都是「拿不到」。差別在於**該由誰決定怎麼修** —— 把一件寶具塞進
      // 哪一張池是策展決定（owner 2026-08-18：「我們最近新建的不要變更
      // EX EX解放 EX根源都不要動到」），⛔ 不是清紅燈的人隨手能補的欄位。
      // ⭐ 而且每一筆都會過期：任何一件被排進任何一張池的那一刻，上面的 `stale`
      //    那條就會紅並要求刪掉這一列。
      "piercer-crossbow":
        "穿甲弩（tier 5、`legendary` + `true-damage` + `marksman`，2 條 modifier + 1 個 " +
        "[限遠程] passive）。2026-08-18 把 49 支傳說拆成三張池（legendary-weapons 29 / " +
        "ex-release-weapons 35 / ex-origin-weapons 5）時它一張都沒進 —— 而它**不在 owner " +
        "親筆的 49 支基準裡**（`__fixtures__/legendary49OwnerText.json`），所以它進哪一張、" +
        "或者要不要退場，是 owner 的策展決定。⛔ 不要自己挑一張池塞進去。",
      "sage-ward-amulet":
        "賢者的護身符（tier 5、`legendary` + `survivability` + `mage`，2 條 modifier + 1 個 " +
        "[限智力] 護盾 passive）。與穿甲弩完全同一個處境、同一批被留在池外，同樣不在 " +
        "owner 的 49 支基準裡。",
      "godie-i063":
        "防狼電擊棒（tier 1、`wc3-import`，2 條 modifier + 1 個主動 passive）。與下面的 " +
        "正義之杖同型：三張武器池全部是 tier-5 策展池收不下 tier-1，而定價上架會被 " +
        "`itemTiers.test.ts`（只有 300/1200 兩個價）擋下。等 owner 決定要不要為這一族 " +
        "wc3-import 舊道具開一條 draft 路徑，或明確讓它們退場到 `content/_legacy/items/`。",
      "godie-i04v":
        "正義之杖（tier 3、wc3-import）。定價上架被 `itemTiers.test.ts`（只有 300/1200 兩個價）" +
        "與 `buildPath.test.ts`（逐字把它當 draft-only 0g 的樣本）擋下；" +
        "加進 quest-rewards 被 `retiredLootTables.test.ts` 擋下。等 owner 決定要不要為它" +
        "開一條 draft 路徑，或明確讓它退場。",
    };

    const orphans: string[] = [];
    for (const f of readdirSync(join(CONTENT, "items"))) {
      if (!f.endsWith(".json") || f === "_index.json") continue;
      const doc = JSON.parse(readFileSync(join(CONTENT, "items", f), "utf8")) as {
        id?: string;
        cost?: number;
        craftRole?: string;
        modifiers?: unknown[];
        passive?: unknown[];
      };
      const id = doc.id ?? basename(f, ".json");
      // ⛔ 只看「不上架賣」而且**真的有效果**的：合成元件與空殼不是這條要管的。
      if (doc.cost !== 0) continue;
      if (doc.craftRole === "component") continue;
      if ((doc.modifiers?.length ?? 0) + (doc.passive?.length ?? 0) === 0) continue;
      if (!pooled.has(id) && !(id in CURATION_PENDING)) orphans.push(id);
    }

    // ⭐ 豁免自己也要會過期:某一天有人把它放進池裡,這一行就紅,提醒把豁免刪掉。
    const stale = Object.keys(CURATION_PENDING).filter((id) => pooled.has(id));
    expect(
      stale,
      `這幾筆豁免過期了 —— 它們已經在獎池裡,把 CURATION_PENDING 的對應條目刪掉:\n${stale.join("\n")}`,
    ).toEqual([]);

    expect(
      orphans,
      [
        "這幾件寶具 `cost: 0`（＝不上架賣）卻不在任何 loot table 裡 —— **玩家永遠拿不到**：",
        ...orphans.map((o) => `  · ${o}`),
        "把它放進 content/loot-tables/ 的某一張表，或把它改成買得到（cost > 0）。",
      ].join("\n"),
    ).toEqual([]);
  });
});
