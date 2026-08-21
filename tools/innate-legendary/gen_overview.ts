/**
 * 產生《固有能力及寶具總覽》—— **完全從出貨的 content + schema + 註冊表推導**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ① 為什麼這一支必須存在（owner 2026-08-18）
 *
 *   「script 自動產出 **固有能力及寶具總覽** md」
 *
 * 這兩族東西今天**沒有任何一份完整清單**，而它們正好是最容易無聲漂掉的兩族：
 *
 *   · **固有能力（天生技）** —— `slot: "PASSIVE"` 的 ability doc，等級 1 就有，
 *     由 `champion@1.passiveAbility` 指過來。它不在 QWER 四格裡，所以每一張
 *     「英雄有哪些技能」的表都很容易只數到四支就收工。
 *   · **寶具（傳說武器）** —— 買不到、只能抽。它的階級**不寫在道具文件上**，
 *     而是「它在哪一張獎池裡」推出來的（見 ③）。所以一件寶具的階級沒有任何一格
 *     欄位可以 grep —— 手寫的清單在這裡必然說謊。
 *
 * ⚠️ 手寫清單宣稱自己有資料來源，正是 CLAUDE.md 第三守則點名的形狀：
 * 「已驗證」「資料來源」這類宣稱本身不會過期，被它們描述的事實會。
 *
 * ② 這一份與 `技能標記機制與效果規則.md` / `ggd-runtime-capabilities.md` 的分工
 *
 *   | 文件 | 回答什麼 |
 *   |---|---|
 *   | `ggd-runtime-capabilities.md`（`pnpm caps:export`） | 「這個**名字**存不存在」 |
 *   | `技能標記機制與效果規則.md`（`pnpm spec:build`） | 「一個機制**怎麼用**」 |
 *   | **本檔**（`pnpm overview:build`） | 「**誰**用了它們」—— 逐位英雄的天生技、逐件寶具 |
 *
 *   三者共用同一個 `buildCapabilityManifest()`，所以名詞那一層不可能互相矛盾。
 *
 * ③ ⭐ 「階級」是**推導**出來的，⛔ 不是欄位
 *
 * 一件寶具屬於哪一階，唯一的真相是**它出現在哪一張獎池**：
 *
 *   · 基礎「寶具」= `sim/economy/itemTiers.ts` 的 `LEGENDARY_POOL_TABLE`
 *     （＝`legendary-weapons`；`sim/economy/shopShelf.ts` 逐字寫著「『寶具』的出貨
 *     定義 = 那張表**整張**」）。
 *   · 更高階 = `config.arena-rules@1.weaponTiers` 的每一列（`label` + `table`），
 *     出貨是 **EX ＜ [EX解放] ＜ [EX∅ 根源]**（owner 2026-08-17 正式定名）。
 *
 * ⇒ owner 加第三、第四階（或替某一階換池）時，這份文件**自己就會多一節**，
 *   ⛔ 不必改這支程式。這正是 `weaponTiers.ts` 那個機制的形狀延伸到文件層。
 *
 * ⚠️ `tags` 裡的 `"legendary"` **不是**判準（也真的對不上）：出貨現在有 4 件在
 * [EX解放] 池裡卻沒有這個標籤，2 件有標籤卻不在任何一張池裡。這種不一致不該被
 * 一份文件抹平 —— 它被列在 §5，而且 `--check` 會在它變動的那一刻叫。
 *
 * ④ ⛔ 刻意沒有時間戳（與 `tools/skill-spec/gen_spec.ts`、`capability-export` 同）
 *
 * 任何隨時鐘變動的欄位都會讓「重新產生 → 逐位元組比對」永遠不相等，於是 `--check`
 * 只能被放寬成模糊比對，而**一條被放寬的閘等於沒有閘**。身分由 `fingerprint` 帶，
 * 它只在引擎事實真的變了的時候變。
 *
 * ⑤ 「每次 deploy 都會重 build」落在哪裡
 *
 *   · `pnpm content:build` 會連帶跑這一支（root package.json，跟 `spec:build`
 *     掛在同一條鏈上）—— CLAUDE.md 規定每一次 `content/` 編輯都要跑它。
 *   · `packages/shared/src/ops/innateLegendaryDocFresh.test.ts` 用 `--check`
 *     真的把這支跑起來（⛔ 不是掃字串）。文件過期 = `pnpm test` 紅。
 *
 *   ⚠️ 刻意**不**在 `host-deploy.sh` 產生：那台機器是 `git pull` 來的，在遠端
 *   產生文件只會造出一份沒有人 commit 的工作區漂移（＝2026-08-02 事故的形狀）。
 *
 * 用法：
 *   npx tsx tools/innate-legendary/gen_overview.ts            # 產生／更新
 *   npx tsx tools/innate-legendary/gen_overview.ts --check    # 過期就回非零（閘）
 *   npx tsx tools/innate-legendary/gen_overview.ts --out <路徑>
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCapabilityManifest } from "../../packages/shared/src/content/editorCapabilities";
import { HERO_NUMBER_RE } from "../../packages/shared/src/content/championIdentity";
import { DEFAULT_WEAPON_TIERS } from "../../packages/shared/src/content/schema/config";
import { LEGENDARY_POOL_TABLE } from "../../packages/shared/src/sim/economy/itemTiers";
import {
  shippedChampionIds,
  SHIPPED_SURFACE_PROVENANCE,
} from "../../packages/shared/testkit/shippedSurface";
import { Stat } from "../../packages/shared/src/sim/stats/statTypes";
import { ModOp } from "../../packages/shared/src/sim/stats/modifiers";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const CONTENT = join(REPO, "content");
/**
 * ⭐ 說明推導（票號待開） —— 算繪好的技能說明（id → 玩家看到的字）。
 * 技能說明在 JSON 裡是**帶佔位符的原文**（`{{cd}}秒冷卻`）。這一份是
 * `pnpm spec:build` 的產物（跑在 `content:build` 裡、`overview:build` 之前），
 * ⛔ 這裡不自己再算一次 —— 第二份算繪就是下一次「文件說 A、場上跑 B」。
 */
const ABILITY_PROSE = join(REPO, "docs/editor-contract/ggd-ability-prose.json");

const renderedProse = (): Readonly<Record<string, string>> => {
  if (!existsSync(ABILITY_PROSE)) return {};
  const d = JSON.parse(readFileSync(ABILITY_PROSE, "utf8")) as { rendered?: Record<string, string> };
  return d.rendered ?? {};
};

export const DEFAULT_OUT = join(REPO, "docs/固有能力及寶具總覽.md");

// ---------------------------------------------------------------------------
// 讀 content/ —— ⛔ 一份手寫清單都沒有
// ---------------------------------------------------------------------------

type Doc = Record<string, unknown>;

/**
 * 讀一個集合底下的所有文件。
 *
 * ⛔ `_` 開頭的檔與目錄一律跳過：`_index.json` 是產物，`_legacy/` 不進出貨
 * bundle（把它算進來會讓一批早就退役的東西看起來還活著 —— 出貨 78 位英雄，
 * `_legacy/champions` 另有 41 位）。判準與 `gen_spec.ts::walkDir` 逐字相同。
 */
function readCollection(name: string): Doc[] {
  const dir = join(CONTENT, name);
  if (!existsSync(dir)) return [];
  const out: Doc[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || !e.name.endsWith(".json") || !e.isFile()) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, e.name), "utf8")) as Doc);
    } catch {
      // 壞掉的 JSON 由 `content:validate` 負責報，這裡跳過就好 —— 但它會在
      // §5 的「對不上的地方」以「少了一份」的形式現形，⛔ 不是無聲。
    }
  }
  return out.sort((a, b) => str(a["id"]).localeCompare(str(b["id"])));
}

/**
 * ⭐【這一份總覽的母體是**上架面**，⛔ 不是 `content/champions/` 的檔案數】
 *
 * GH#472，owner 講過兩次：
 * > M48（2026-08-18）：「這些是哪裡來的老舊東西，**根本沒上架阿 幹嘛修**…」
 * > M105-1（2026-08-19）：「只要做**有開放的**角色技能…**沒開放的別浪費 token**」
 *
 * ⚠️ 這一行以前寫 `readCollection("champions").length` 並且把它印成
 * **「出貨英雄總數」** —— 那是 **71**，而其中 2 張是 `main.tsx` 內容載入失敗時
 * 註冊的 **fail-open 骨架**（`sela` / `thorne`），玩家永遠選不到。
 * ⇒ 一份自稱從出貨資料產生的總覽，第一格統計就在說謊（第三守則）。
 *
 * ⛔ 上架面**推導**自 `starterChampions − retired − 變身態 ＋ 那些本體的變身態`，
 * ⛔ 不是一張手打的 id 名單。
 */
function shippedChampionDocs(): Doc[] {
  const open = shippedChampionIds(REPO);
  const docs = readCollection("champions").filter((d) => open.has(str(d["id"])));
  // ⚠️ 空母體 = 讀壞了，⛔ 不是「沒有人上架」。
  if (docs.length === 0) {
    throw new Error(
      `上架面過濾之後剩 0 位英雄 —— 讀取器壞了。來源：${SHIPPED_SURFACE_PROVENANCE}`,
    );
  }
  return docs;
}

/**
 * 已退場的道具（`content/_legacy/items/`）—— ⭐ owner 2026-08-18：
 * 「不應該再出現在現有任何文件上⋯**包括道具總表**，但**可附註 legacy 路徑**」。
 *
 * ⛔ 這裡回的是**數量與分類**，⛔ 不是逐筆內容 —— 逐筆的家在 `docs/legacy-index.md`。
 * ⛔ 也沒有任何「哪些 id 退場了」的硬編名單：`readCollection` 只掃
 * `content/<name>/` 頂層，所以退場的東西**自動**不在這份總覽裡，這一支只是把
 * 「還有幾件、在哪裡」也變成推導出來的一句話。
 */
function readRetiredItems(): Doc[] {
  const dir = join(CONTENT, "_legacy", "items");
  if (!existsSync(dir)) return [];
  const out: Doc[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || !e.name.endsWith(".json") || !e.isFile()) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, e.name), "utf8")) as Doc);
    } catch {
      /* 壞掉的 JSON 由 content:validate 負責報 */
    }
  }
  return out;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// ---------------------------------------------------------------------------
// 從一份 JSON 推出「它用到哪些機制」
// ---------------------------------------------------------------------------

interface Mechanics {
  effectKinds: string[];
  hookEvents: string[];
  conditionLeaves: string[];
  /** `stat(op)` 的清單，例：`ad(pctMult)`。 */
  statOps: string[];
  /** `applyStatus.statusId` / `applyBuff.statusId` 指到的狀態。 */
  statuses: string[];
  /** 授權格（`block` / `critStrike` / `vision` …）—— `modifiers`/`hooks` 以外的那些。 */
  grants: string[];
}

/**
 * 授權格的欄位名 —— `modifiers` / `hooks` 以外還能給什麼（`SOURCE_GRANT_SHAPE` 那一族）。
 *
 * ⚠️ 掃的是**任意深度**，⛔ 不是只掃頂層：道具把它們放在頂層（`item@1.flight`），
 * 但技能把它們放在 `passive.ranks[]` 裡（`04-00 翔封界` 的 `flight` 就在那）。
 * 只掃頂層會讓一半的天生技看起來「什麼都沒做」—— 那是失敗形態⑦（掃屬性代替掃行為）
 * 的近親：掃錯了**位置**，於是報告與事實一致地錯。
 */
const GRANT_KEYS = [
  "attributes",
  "auras",
  "block",
  "critStrike",
  "damageTypeOverride",
  "flight",
  "penetration",
  "vision",
  "marks",
  "sets",
  "recipe",
] as const;

/**
 * ⚠️ `kind` 是**兩個**東西的判別欄：effect（`{kind:"damage"}`）與條件葉
 * （`{kind:"stat", subject:…}`）。分辨它們的**不是**欄位名，是**位置** ——
 * 條件只出現在 `condition` / `victimCondition` 底下。判準與 `gen_spec.ts` 同一份。
 */
const CONDITION_KEYS = ["condition", "victimCondition"];

function mechanicsOf(doc: Doc): Mechanics {
  const effectKinds = new Set<string>();
  const hookEvents = new Set<string>();
  const conditionLeaves = new Set<string>();
  const statOps = new Set<string>();
  const statuses = new Set<string>();
  const grants = new Set<string>();

  const walk = (node: unknown, inCondition: boolean): void => {
    if (Array.isArray(node)) {
      for (const n of node) walk(n, inCondition);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Doc;
    const kind = str(o["kind"]);
    if (kind) (inCondition ? conditionLeaves : effectKinds).add(kind);
    if (str(o["on"]) && Array.isArray(o["effects"])) hookEvents.add(str(o["on"]));
    // 一條 modifier 固定是 `{stat, op, value}` —— 兩格都在才算，避免把條件葉的
    // `{stat, op, value}`（比較式）誤記成一條屬性改動。條件葉的 `op` 是比較運算
    // （`gte` …），所以用 ModOp 的成員資格當判準，⛔ 不是欄位名。
    const st = str(o["stat"]);
    const op = str(o["op"]);
    if (st && op && MOD_OPS.has(op)) statOps.add(`${st}(${op})`);
    if (str(o["statusId"])) statuses.add(str(o["statusId"]));
    for (const g of GRANT_KEYS) if (o[g] !== undefined) grants.add(g);
    for (const [k, v] of Object.entries(o)) {
      walk(v, inCondition || CONDITION_KEYS.includes(k));
    }
  };
  walk(doc, false);

  const sorted = (s: Set<string>): string[] => [...s].sort();
  return {
    effectKinds: sorted(effectKinds),
    hookEvents: sorted(hookEvents),
    conditionLeaves: sorted(conditionLeaves),
    statOps: sorted(statOps),
    statuses: sorted(statuses),
    grants: sorted(grants),
  };
}

const MOD_OPS = new Set<string>(Object.values(ModOp));
const ALL_STATS = new Set<string>(Object.values(Stat));

/** 一行機制摘要：`applyBuff · onBasicAttack · ad(pctMult)`。空的就是 `—`。 */
function mechanicsLine(m: Mechanics): string {
  const parts: string[] = [];
  const push = (label: string, list: readonly string[]): void => {
    if (list.length > 0) parts.push(`**${label}** ${list.map((t) => `\`${t}\``).join(" ")}`);
  };
  push("效果", m.effectKinds);
  push("觸發", m.hookEvents);
  push("條件", m.conditionLeaves);
  push("屬性", m.statOps);
  push("狀態", m.statuses);
  push("授權格", m.grants);
  return parts.length === 0 ? "—" : parts.join("　·　");
}

// ---------------------------------------------------------------------------
// 文案 —— ⚠️ 「」是**角色對白不是效果**（CLAUDE.md 第〇·六守則細則②）
// ---------------------------------------------------------------------------

/**
 * 剝掉整段 `「…」`。
 *
 * ⚠️ 剝的是**整段**（含跨行、含行中），⛔ 不是「行首是「的那幾行」——
 * 後者漏掉「造成 X 傷害「台詞」再造成 Y」這種寫法。與
 * `tools/skill-remake/batch1.py::_mechanics_text()` 同一條規則。
 *
 * 這裡剝它的理由跟那支不同、但方向一樣：本檔的「效果摘要」一律從 JSON 推導，
 * 文案只是給人對照用的；留著對白只會讓讀者以為那句話是機制。
 */
function stripDialogue(text: string): string {
  return text.replace(/「[\s\S]*?」/g, "").replace(/[ \t]+\n/g, "\n");
}

/** 把描述壓成單行、剝掉對白、截斷。⛔ 不從它推導任何機制。 */
function blurb(desc: string, max = 160): string {
  const flat = stripDialogue(desc)
    .replace(/\s*\n\s*/g, " ／ ")
    .replace(/\|/g, "／")
    .replace(/\s{2,}/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || "—";
}

/** 逐行的完整文案（給 `<details>` 用），一樣先剝對白。 */
function descriptionBlock(desc: string): string[] {
  const body = stripDialogue(desc).trim();
  if (!body) return [];
  return ["```text", body, "```", ""];
}

// ---------------------------------------------------------------------------
// 固有能力（天生技）
// ---------------------------------------------------------------------------

/**
 * `01-00 怒斬` → `{ code: "01-00", hero: 1 }`。解析不出來是 null（那本身是資料，見 §5）。
 *
 * ⭐ 用的是 `championIdentity.ts` 出貨的 **同一條** `HERO_NUMBER_RE`，⛔ 不自己再寫一條
 * —— 它刻意不要求前綴後面有分隔符（為了 `61-01惡魔球` 這種少空格的名字），
 * 而一條複製過來的正則遲早會漏掉那個細節，然後**安靜地**少算幾支。
 */
function parseCode(name: string): { code: string; hero: number } | null {
  const m = HERO_NUMBER_RE.exec(name);
  return m ? { code: m[0]!, hero: Number(m[1]) } : null;
}

interface Innate {
  id: string;
  /** 從技能名解析出的 `NN-00`；解析不出來是 null。 */
  code: string | null;
  /** 排序用的英雄編號。⛔ 不用字串比 —— 那會把 `100-00` 排在 `09-00` 與 `11-00` 之間。 */
  hero: number;
  name: string;
  /** 擁有者 champion id → 顯示名。空陣列 = 沒有人指向它（孤兒）。 */
  owners: { id: string; name: string }[];
  kind: string;
  cooldown: number | undefined;
  manaCost: number | undefined;
  mech: Mechanics;
  description: string;
}

interface Champion {
  id: string;
  name: string;
  passiveAbility: string;
}

function collectInnates(): {
  innates: Innate[];
  champions: Champion[];
  danglingRefs: { champion: string; ref: string }[];
} {
  const abilities = readCollection("abilities");
  const champs = shippedChampionDocs();

  const byId = new Map<string, Doc>();
  for (const a of abilities) byId.set(str(a["id"]), a);

  const champions: Champion[] = [];
  const ownersOf = new Map<string, { id: string; name: string }[]>();
  const danglingRefs: { champion: string; ref: string }[] = [];
  for (const c of champs) {
    const ref = str(c["passiveAbility"]);
    if (!ref) continue;
    const entry = { id: str(c["id"]), name: str(c["name"]) };
    champions.push({ ...entry, passiveAbility: ref });
    if (!byId.has(ref)) {
      danglingRefs.push({ champion: entry.id, ref });
      continue;
    }
    const list = ownersOf.get(ref) ?? [];
    list.push(entry);
    ownersOf.set(ref, list);
  }

  const innates: Innate[] = [];
  for (const a of abilities) {
    if (str(a["slot"]) !== "PASSIVE") continue;
    const id = str(a["id"]);
    const name = str(a["name"]);
    const parsed = parseCode(name);
    innates.push({
      id,
      code: parsed?.code ?? null,
      // 解析不出編號的排到最後（`Infinity`），⛔ 不是排到最前面假裝它是 0 號。
      hero: parsed?.hero ?? Number.POSITIVE_INFINITY,
      name,
      owners: (ownersOf.get(id) ?? []).sort((x, y) => x.id.localeCompare(y.id)),
      kind: str(a["innateKind"]) || "—",
      cooldown: num(arr(a["cooldown"])[0]),
      manaCost: num(arr(a["manaCost"])[0]),
      mech: mechanicsOf(a),
      description: renderedProse()[id] ?? str(a["description"]),
    });
  }
  innates.sort((x, y) => x.hero - y.hero || x.id.localeCompare(y.id));
  return { innates, champions, danglingRefs };
}

// ---------------------------------------------------------------------------
// 寶具（傳說武器）—— 階級由「它在哪一張獎池」推導，⛔ 不是欄位
// ---------------------------------------------------------------------------

interface Grade {
  /** 顯示用的階級名。 */
  label: string;
  /** 獎池 id（`content/loot-tables/<table>.json`）。 */
  table: string;
  /** 這一階的取得規則（更高階才有；基礎階是 null）。 */
  rule: (typeof DEFAULT_WEAPON_TIERS)[number] | null;
  /** 這張池裡的道具 id（照獎池原順序，⛔ 不排序 —— 順序本身是資料）。 */
  members: string[];
  /** 池檔案存不存在。false = 機制在、池還沒建（[EX∅ 根源] 出貨就是這樣）。 */
  tableExists: boolean;
}

interface Treasure {
  id: string;
  name: string;
  /** 它出現在哪幾階（一件可以同時在基礎池與 [EX解放] 池裡）。 */
  grades: string[];
  cost: number | undefined;
  tags: string[];
  craftRole: string;
  mech: Mechanics;
  description: string;
  hasPayload: boolean;
}

/** 讀出貨的 `weaponTiers`；沒有這一格就落到 schema 的 `DEFAULT_WEAPON_TIERS`。 */
function shippedWeaponTiers(): typeof DEFAULT_WEAPON_TIERS {
  const p = join(CONTENT, "config/arena-rules.json");
  if (!existsSync(p)) return DEFAULT_WEAPON_TIERS;
  try {
    const doc = JSON.parse(readFileSync(p, "utf8")) as Doc;
    const tiers = doc["weaponTiers"];
    if (Array.isArray(tiers) && tiers.length > 0) return tiers as typeof DEFAULT_WEAPON_TIERS;
  } catch {
    /* 壞掉的 config 由 `content:validate` 報；這裡落回 schema 預設 */
  }
  return DEFAULT_WEAPON_TIERS;
}

function lootTable(id: string): { exists: boolean; members: string[] } {
  const p = join(CONTENT, "loot-tables", `${id}.json`);
  if (!existsSync(p)) return { exists: false, members: [] };
  try {
    const doc = JSON.parse(readFileSync(p, "utf8")) as Doc;
    return {
      exists: true,
      members: arr(doc["entries"]).map((e) => str((e as Doc)["itemId"])).filter(Boolean),
    };
  } catch {
    return { exists: false, members: [] };
  }
}

function collectTreasures(): {
  grades: Grade[];
  treasures: Treasure[];
  taggedNotPooled: string[];
  /** 帶 `tags:["legendary"]` 的道具 id（排序過）—— §5.1 的另一半。 */
  taggedIds: string[];
  missingItems: { table: string; itemId: string }[];
} {
  // 由**低到高**：基礎池在前，`weaponTiers` 出貨是由高到低排的（`pickWeaponTable`
  // 逐階問的順序），所以反過來讀就是階級由低到高。
  const tiers = [...shippedWeaponTiers()].reverse();
  const grades: Grade[] = [];
  const base = lootTable(LEGENDARY_POOL_TABLE);
  grades.push({
    label: "寶具（基礎）",
    table: LEGENDARY_POOL_TABLE,
    rule: null,
    members: base.members,
    tableExists: base.exists,
  });
  for (const t of tiers) {
    const lt = lootTable(t.table);
    grades.push({ label: t.label, table: t.table, rule: t, members: lt.members, tableExists: lt.exists });
  }

  const items = readCollection("items");
  const byId = new Map<string, Doc>();
  for (const i of items) byId.set(str(i["id"]), i);

  const gradesOf = new Map<string, string[]>();
  const missingItems: { table: string; itemId: string }[] = [];
  for (const g of grades) {
    for (const id of g.members) {
      if (!byId.has(id)) {
        missingItems.push({ table: g.table, itemId: id });
        continue;
      }
      const list = gradesOf.get(id) ?? [];
      if (!list.includes(g.label)) list.push(g.label);
      gradesOf.set(id, list);
    }
  }

  const treasures: Treasure[] = [];
  for (const [id, labels] of [...gradesOf].sort((a, b) => a[0].localeCompare(b[0]))) {
    const doc = byId.get(id)!;
    treasures.push({
      id,
      name: str(doc["name"]),
      grades: labels,
      cost: num(doc["cost"]),
      tags: arr(doc["tags"]).map(str).filter(Boolean).sort(),
      craftRole: str(doc["craftRole"]) || "—",
      mech: mechanicsOf(doc),
      description: str(doc["description"]),
      // 「有沒有 payload」與商店上架用的是同一條判準（`sim/economy/shop.ts`）：
      // 有 `modifiers` 或 `passive` 才是真的付得出東西的一件。
      hasPayload: arr(doc["modifiers"]).length > 0 || arr(doc["passive"]).length > 0,
    });
  }

  const pooled = new Set(gradesOf.keys());
  const tagged = new Set(
    items.filter((i) => arr(i["tags"]).map(str).includes("legendary")).map((i) => str(i["id"])),
  );
  const taggedNotPooled = [...tagged].filter((i) => !pooled.has(i)).sort();
  return { grades, treasures, taggedNotPooled, taggedIds: [...tagged].sort(), missingItems };
}

// ---------------------------------------------------------------------------
// 產生 Markdown
// ---------------------------------------------------------------------------

/** 表格欄位裡的字串：`|` 會拆欄，換行會把表格整個截斷。 */
function cell(s: string): string {
  return s.replace(/\|/g, "／").replace(/\s*\n\s*/g, " ").trim() || "—";
}

function countBy(lists: readonly (readonly string[])[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lists) for (const t of l) out.set(t, (out.get(t) ?? 0) + 1);
  return out;
}

export function buildOverviewMarkdown(): string {
  const man = buildCapabilityManifest();
  const { innates, champions, danglingRefs } = collectInnates();
  const { grades, treasures, taggedNotPooled, taggedIds, missingItems } = collectTreasures();
  const taggedSet = new Set(taggedIds);

  const L: string[] = [];
  /** ⚠️ 要吃 `p(...lines)` —— 只收一個參數的版本會把每一張表截成只剩表頭。 */
  const p = (...lines: string[]): void => void L.push(...(lines.length === 0 ? [""] : lines));

  // ── 檔頭 ────────────────────────────────────────────────────────────
  p("# GGD 固有能力及寶具總覽");
  p();
  p("> ⛔ **這份檔案是產生出來的，不要手改。**");
  p(">");
  p("> ```bash");
  p("> pnpm overview:build      # 重新產生（`pnpm content:build` 已經連帶跑它）");
  p("> pnpm overview:check      # 過期就回非零（`pnpm test` 會跑它）");
  p("> ```");
  p(">");
  p("> **固有能力**＝天生技：`slot: \"PASSIVE\"` 的 ability doc，編號 `NN-00`，等級 1 就有，");
  p("> 由 `champion@1.passiveAbility` 指過來。⛔ 不在 QWER 四格裡。");
  p("> **寶具**＝傳說武器：買不到、只能抽。");
  p(">");
  p("> 來源：`content/**/*.json`（誰有什麼）＋ 出貨的註冊表（機制名詞）＋ 出貨的常數");
  p("> （`LEGENDARY_POOL_TABLE`）＋ 出貨的 `config.arena-rules@1.weaponTiers`（階級）。");
  p("> ⛔ 這份檔案裡沒有任何一列是手寫的。");
  p(">");
  p(`> 引擎指紋 \`${man.schema} / ${man.fingerprint}\`。`);
  p("> ⛔ 刻意沒有產生日期：任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，");
  p("> 於是 `--check` 只能被放寬成模糊比對，而一條被放寬的閘等於沒有閘。");
  p();
  p("| 文件 | 回答什麼 |");
  p("|---|---|");
  p("| [`docs/editor-contract/ggd-runtime-capabilities.md`](editor-contract/ggd-runtime-capabilities.md) | 「這個**名字**存不存在」 |");
  p("| [`docs/技能標記機制與效果規則.md`](技能標記機制與效果規則.md) | 「一個機制**怎麼用**」——參數、上下界、觸發時機 |");
  p("| **本檔** | 「**誰**用了它們」——逐位英雄的天生技、逐件寶具 |");
  p();

  // ── 1 統計 ──────────────────────────────────────────────────────────
  p("---");
  p();
  p("## 1. 統計");
  p();
  const withInnate = innates.filter((i) => i.owners.length > 0);
  const orphanInnates = innates.filter((i) => i.owners.length === 0);
  const champTotal = shippedChampionDocs().length;
  const byKind = new Map<string, number>();
  for (const i of innates) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);

  p("### 1.1 固有能力");
  p();
  p("| | 數量 |");
  p("|---|---:|");
  p(`| **上架面英雄總數**（可選本體＋它們的變身態） | ${champTotal} |`);
  p(`| **帶 \`passiveAbility\` 的英雄** | **${champions.length}** |`);
  p(`| 沒有天生技的英雄 | ${champTotal - champions.length} |`);
  p(`| 天生技文件（\`slot: "PASSIVE"\`） | ${innates.length} |`);
  p(`| ├ 被至少一位英雄指到 | ${withInnate.length} |`);
  p(`| └ **沒有人指到（孤兒）** | **${orphanInnates.length}** |`);
  for (const [k, n] of [...byKind].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    const zh = k === "passive" ? "純被動（光環／機率觸發／回復）" : k === "active" ? "主動（有冷卻，原本掛 D 鍵）" : "未標";
    p(`| \`innateKind: "${k}"\` —— ${zh} | ${n} |`);
  }
  p(`| 編號解析不出 \`NN-00\` 的 | ${innates.filter((i) => i.code === null).length} |`);
  p();

  p("### 1.2 寶具");
  p();
  p("階級 **EX ＜ [EX解放] ＜ [EX∅ 根源]**（owner 2026-08-17 定名）。⛔ 階級不是道具上的欄位 ——");
  p("它是「這件東西在**哪一張獎池**裡」推出來的，所以 owner 換池、加階，這張表自己就跟著動。");
  p();
  p("| 階級 | 獎池 | 件數 | 出現回合 | 平手方機率 | 劣勢加權 | 數量上限 |");
  p("|---|---|---:|---|---:|---|---|");
  for (const g of grades) {
    const r = g.rule;
    const round = r ? `${r.minRound}${r.maxRound !== undefined ? `–${r.maxRound}` : " 起"}` : "依回合表排程";
    const base = r ? `${r.basePct}%` : "—";
    const under = r ? `×(1 + ${r.underdogFactor}·D^${r.underdogExponent})` : "—";
    const limit = r ? `每${r.limitScope === "team" ? "隊" : "名英雄"} ${r.limitCount} 件` : "—";
    const count = g.tableExists ? `${g.members.length}` : "**池不存在**";
    p(`| **${g.label}** | \`${g.table}\` | ${count} | ${round} | ${base} | ${under} | ${limit} |`);
  }
  p();
  p(`- **相異寶具 ${treasures.length} 件**（同一件可能同時在兩張池裡，所以 ⛔ 不是各階相加）。`);
  const bothPools = treasures.filter((t) => t.grades.length > 1);
  p(`- 同時屬於 ${bothPools.length > 0 ? "兩階以上" : "多階"} 的有 **${bothPools.length}** 件。`);
  p(`- 沒有 payload（沒有 \`modifiers\` 也沒有 \`passive\`）的有 **${treasures.filter((t) => !t.hasPayload).length}** 件 —— 抽到等於空手。`);
  const retired = readRetiredItems();
  if (retired.length > 0) {
    const books = retired.filter((i) => str(i["name"]).includes("製作書")).length;
    const comp = retired.filter(
      (i) => str(i["craftRole"]) === "component" && !str(i["name"]).includes("製作書"),
    ).length;
    const token = retired.filter((i) => str(i["craftRole"]) === "token").length;
    p(
      `- 🗄️ **另有 ${retired.length} 件已退場道具不在這份總覽裡**（製作書系列 ${books}、` +
        `合成過渡期道具 ${comp}、兌換券 ${token}）—— 它們在商店貨架與每一張獎池上都不存在。` +
        "全文保存於 [`content/_legacy/items/`](../content/_legacy/items/)，" +
        "逐筆索引見 [`docs/legacy-index.md`](legacy-index.md)。" +
        "⛔ 退場與否由檔案在哪個目錄決定，這份總覽沒有第二份名單。",
    );
  }
  const emptyGrades = grades.filter((g) => !g.tableExists);
  if (emptyGrades.length > 0) {
    p(
      `- ⚠️ **${emptyGrades.map((g) => g.label).join("、")} 的獎池檔案還不存在**（\`content/loot-tables/${emptyGrades[0]!.table}.json\`）。` +
        "這是刻意的：`pickWeaponTable` 的 `hasEligible` 探針探不到東西就**往下一階讓**，所以這一階今天永遠不會中，" +
        "owner 把那張池建出來的當天它自己就活了，⛔ 不必改任何程式。",
    );
  }
  p();

  // ── 2 固有能力逐支 ──────────────────────────────────────────────────
  p("---");
  p();
  p("## 2. 固有能力（天生技）");
  p();
  p("⚠️ 「效果摘要」**一律從 JSON 推導**，⛔ 不從文案。文案那一欄只是給人對照的，");
  p("而且已經把 `「…」`（角色對白，不是效果）整段剝掉了 —— CLAUDE.md 第〇·六守則細則②。");
  p();
  p("| 編號 | 名稱 | 擁有者 | 型態 | 冷卻 | 魔力 | 效果摘要 |");
  p("|---|---|---|---|---:|---:|---|");
  for (const i of innates) {
    const owners = i.owners.length === 0 ? "⛔ **無人指向**" : i.owners.map((o) => `\`${o.id}\` ${o.name.split(" - ")[0] ?? o.name}`).join("<br>");
    const kind = i.kind === "passive" ? "被動" : i.kind === "active" ? "主動" : i.kind;
    p(
      `| ${i.code ? `\`${i.code}\`` : "—"} | ${cell(i.name)} | ${cell(owners)} | ${kind} |` +
        ` ${i.cooldown !== undefined && i.cooldown > 0 ? i.cooldown : "—"} |` +
        ` ${i.manaCost !== undefined && i.manaCost > 0 ? i.manaCost : "—"} |` +
        ` ${cell(mechanicsLine(i.mech))} |`,
    );
  }
  p();
  p("### 2.1 逐支文案");
  p();
  for (const i of innates) {
    p(`<details><summary><code>${i.id}</code> — ${i.code ?? "（無編號）"} ${i.name}</summary>`);
    p();
    p(`- **擁有者**：${i.owners.length === 0 ? "⛔ 無人指向" : i.owners.map((o) => `${o.name}（\`${o.id}\`）`).join("、")}`);
    p(`- **機制**：${mechanicsLine(i.mech)}`);
    p();
    p(...descriptionBlock(i.description));
    p("</details>");
    p();
  }

  // ── 3 寶具逐件 ──────────────────────────────────────────────────────
  p("---");
  p();
  p("## 3. 寶具（傳說武器）");
  p();
  p("**取得方式**這一欄就是階級的來源：一件東西的階級 = 它在哪一張獎池裡。");
  p("寶具的正常取得路徑是**抽**，不是買 —— 後台把 `legendaryShelf.open` 打開之後才會用");
  p("統一價上架（價格 = 傳說寶玉價 × `priceMultiplier`，⛔ 不是道具自己的 `cost`）。");
  p();
  {
    // ⭐ 這一句以前是寫死的「`cost` 全部是 0」，而它**是假的**（`godie-i021` 是 1000）。
    // 改成量出來的：一份產生的文件不可以有一句沒有人在驗的斷言（第三守則）。
    const priced = treasures.filter((t) => (t.cost ?? 0) !== 0);
    p(
      priced.length === 0
        ? `- ${treasures.length} 件寶具的 \`cost\` **全部是 0**。`
        : `- ⚠️ ${treasures.length} 件寶具裡有 **${priced.length} 件帶著非 0 的 \`cost\`**：` +
            `${priced.map((t) => `\`${t.id}\`（${t.cost}）`).join(" · ")}` +
            "　—— 那個數字**不是**它的售價（寶具走統一價），它是 w3x 匯入留下來的欄位。",
    );
    p();
  }
  for (const g of grades) {
    const list = treasures.filter((t) => t.grades.includes(g.label));
    p(`### 3.${grades.indexOf(g) + 1} ${g.label} —— ${list.length} 件（\`${g.table}\`）`);
    p();
    if (!g.tableExists) {
      p(`⚠️ 獎池檔案 \`content/loot-tables/${g.table}.json\` 還不存在，所以這一階今天抽不到東西。`);
      p();
      continue;
    }
    if (list.length === 0) {
      p("（這張池是空的。）");
      p();
      continue;
    }
    p("| 名稱 | id | 也屬於 | payload | 標籤 | 效果摘要 |");
    p("|---|---|---|:-:|---|---|");
    for (const t of list) {
      const also = t.grades.filter((x) => x !== g.label);
      p(
        `| ${cell(t.name)} | \`${t.id}\` | ${also.length ? also.join("、") : "—"} |` +
          ` ${t.hasPayload ? "✅" : "⛔"} | ${t.tags.map((x) => `\`${x}\``).join(" ") || "—"} |` +
          ` ${cell(mechanicsLine(t.mech))} |`,
      );
    }
    p();
  }

  p(`### 3.${grades.length + 1} 逐件文案`);
  p();
  for (const t of treasures) {
    p(`<details><summary><code>${t.id}</code> — ${t.name}（${t.grades.join(" ／ ")}）</summary>`);
    p();
    p(`- **階級**：${t.grades.join(" ／ ")}`);
    p(`- **craftRole**：\`${t.craftRole}\`　·　**cost**：${t.cost ?? "—"}　·　**payload**：${t.hasPayload ? "有" : "⛔ 沒有"}`);
    p(`- **機制**：${mechanicsLine(t.mech)}`);
    p();
    p(...descriptionBlock(t.description));
    p("</details>");
    p();
  }

  // ── 4 這兩族用到哪些機制 ────────────────────────────────────────────
  p("---");
  p();
  p("## 4. 這兩族用到哪些機制");
  p();
  p("⭐ 這一節回答的是設計時最想知道的一格：**引擎有的東西，這兩族實際用了多少。**");
  p("「0」不是壞掉 —— 是「機制在，但這一族還沒有人用它」。");
  p();
  const innateEffects = countBy(innates.map((i) => i.mech.effectKinds));
  const treasureEffects = countBy(treasures.map((t) => t.mech.effectKinds));
  const innateHooks = countBy(innates.map((i) => i.mech.hookEvents));
  const treasureHooks = countBy(treasures.map((t) => t.mech.hookEvents));
  const innateLeaves = countBy(innates.map((i) => i.mech.conditionLeaves));
  const treasureLeaves = countBy(treasures.map((t) => t.mech.conditionLeaves));

  const usageTable = (
    title: string,
    all: readonly string[],
    a: Map<string, number>,
    b: Map<string, number>,
  ): void => {
    const usedA = all.filter((k) => a.has(k)).length;
    const usedB = all.filter((k) => b.has(k)).length;
    p(`### ${title} —— 引擎 ${all.length} 種，固有能力用 ${usedA}、寶具用 ${usedB}`);
    p();
    p("| 名稱 | 固有能力 | 寶具 |");
    p("|---|---:|---:|");
    for (const k of all) p(`| \`${k}\` | ${a.get(k) ?? 0} | ${b.get(k) ?? 0} |`);
    p();
    const neither = all.filter((k) => !a.has(k) && !b.has(k));
    if (neither.length > 0) {
      p(`⛔ **兩族都沒用過的 ${neither.length} 個**：${neither.map((k) => `\`${k}\``).join(" · ")}`);
      p();
    }
  };
  usageTable("4.1 效果（effect kind）", man.effectKinds, innateEffects, treasureEffects);
  usageTable("4.2 觸發（hook event）", man.hookEvents, innateHooks, treasureHooks);
  usageTable("4.3 條件葉（condition leaf）", man.conditionLeafKinds, innateLeaves, treasureLeaves);

  p("### 4.4 屬性（`Stat`）");
  p();
  p("哪幾條屬性真的被這兩族碰到。⛔ 沒被碰到的不代表壞掉，代表沒有內容用它。");
  p();
  const statOf = (list: string[]): string[] => list.map((s) => s.slice(0, s.indexOf("(")));
  const innateStats = countBy(innates.map((i) => statOf(i.mech.statOps)));
  const treasureStats = countBy(treasures.map((t) => statOf(t.mech.statOps)));
  p("| 屬性 | 固有能力 | 寶具 |");
  p("|---|---:|---:|");
  for (const s of [...ALL_STATS].sort()) p(`| \`${s}\` | ${innateStats.get(s) ?? 0} | ${treasureStats.get(s) ?? 0} |`);
  p();
  const unusedStats = [...ALL_STATS].sort().filter((s) => !innateStats.has(s) && !treasureStats.has(s));
  if (unusedStats.length > 0) {
    p(`⛔ **兩族都沒碰過的 ${unusedStats.length} 條**：${unusedStats.map((s) => `\`${s}\``).join(" · ")}`);
    p();
  }

  p("### 4.5 運算（`ModOp`）");
  p();
  const opOf = (list: string[]): string[] => list.map((s) => s.slice(s.indexOf("(") + 1, -1));
  const innateOps = countBy(innates.map((i) => opOf(i.mech.statOps)));
  const treasureOps = countBy(treasures.map((t) => opOf(t.mech.statOps)));
  p("| 運算 | 固有能力 | 寶具 |");
  p("|---|---:|---:|");
  for (const o of [...MOD_OPS].sort()) p(`| \`${o}\` | ${innateOps.get(o) ?? 0} | ${treasureOps.get(o) ?? 0} |`);
  p();

  // ── 5 對不上的地方 ──────────────────────────────────────────────────
  p("---");
  p();
  p("## 5. ⚠️ 對不上的地方");
  p();
  p("這一節是**量出來的**，不是我列的待辦。它存在的理由是 CLAUDE.md 第二守則那句：");
  p("**fail-open 沒錯，靜默才是缺陷。** 下面每一項今天都不會讓任何測試變紅，");
  p("所以如果它們不印在這裡，就沒有任何地方看得到 —— 而 `--check` 會在它們**變動**的那一刻叫。");
  p();

  p("### 5.1 `tags: [\"legendary\"]` 只是標籤，⛔ 不是寶具的判準");
  p();
  p("⭐ **判準是獎池**（`sim/economy/shopShelf.ts` 逐字：「『寶具』的出貨定義 = 那張表整張」）。");
  p("⛔ 沒有任何程式讀 `tags` 來決定一件東西是不是寶具，所以下面的落差**不影響遊戲行為** ——");
  p("它影響的是任何**照標籤**找寶具的人（後台篩選、外部編輯器、下一個接手的 session）。");
  p();
  p("| 階級 | 池裡幾件 | 其中帶 `legendary` 標籤 |");
  p("|---|---:|---:|");
  for (const g of grades) {
    if (!g.tableExists) continue;
    const inPool = new Set(g.members);
    p(`| ${g.label} | ${inPool.size} | ${[...inPool].filter((i) => taggedSet.has(i)).length} |`);
  }
  p();
  p(
    `- **有標籤、卻不在任何一張池裡**（${taggedNotPooled.length} 件）：` +
      `${taggedNotPooled.length === 0 ? "（沒有）" : taggedNotPooled.map((i) => `\`${i}\``).join(" · ")}` +
      "　—— 標籤說它是寶具，但**抽不到**。",
  );
  // ⭐ 只把「這一階裡帶標籤是常態、少數幾件沒有」的那些點名 —— 標籤在基礎池
  // 本來就幾乎不存在（它是跟著新一批一起進來的），把 49 個 id 全列出來只是噪音，
  // 而噪音會讓真正該看的那幾件消失。判準是**這一階裡帶標籤的比沒帶的多**。
  for (const g of grades) {
    if (!g.tableExists) continue;
    const inPool = [...new Set(g.members)];
    const untagged = inPool.filter((i) => !taggedSet.has(i)).sort();
    if (untagged.length === 0 || untagged.length >= inPool.length - untagged.length) continue;
    p(
      `- **${g.label} 池裡沒有標籤的 ${untagged.length} 件**（同一階其餘 ${inPool.length - untagged.length} 件都有）：` +
        `${untagged.map((i) => `\`${i}\``).join(" · ")}`,
    );
  }
  p();

  p("### 5.2 天生技的參照");
  p();
  if (danglingRefs.length === 0) {
    p("- ✅ 每一個 `passiveAbility` 都指得到一份存在的 ability doc。");
  } else {
    p("| 英雄 | 指向 |");
    p("|---|---|");
    for (const d of danglingRefs) p(`| \`${d.champion}\` | ⛔ \`${d.ref}\`（不存在） |`);
  }
  if (orphanInnates.length === 0) {
    p("- ✅ 每一份 `slot: \"PASSIVE\"` 的技能都有英雄指向它。");
  } else {
    p(`- ⚠️ **${orphanInnates.length} 份天生技沒有任何英雄指向**（做了但玩家拿不到，失敗形態②）：`);
    p(`  ${orphanInnates.map((i) => `\`${i.id}\``).join(" · ")}`);
  }
  const noCode = innates.filter((i) => i.code === null);
  if (noCode.length > 0) {
    p(`- ⚠️ **${noCode.length} 份天生技的名字解析不出 \`NN-00\` 編號**（\`HERO_NUMBER_RE\`）：`);
    p(`  ${noCode.map((i) => `\`${i.id}\``).join(" · ")}`);
  }
  p();

  p("### 5.3 獎池指到不存在的道具");
  p();
  if (missingItems.length === 0) {
    p("- ✅ 每一張寶具獎池的每一列都指得到一份存在的 `item@1`。");
  } else {
    p("| 獎池 | 指向 |");
    p("|---|---|");
    for (const m of missingItems) p(`| \`${m.table}\` | ⛔ \`${m.itemId}\`（不存在） |`);
  }
  p();

  p("### 5.4 抽到等於空手的寶具");
  p();
  const noPayload = treasures.filter((t) => !t.hasPayload);
  if (noPayload.length === 0) {
    p("- ✅ 每一件寶具都有 `modifiers` 或 `passive`。");
  } else {
    p(`⚠️ 這 ${noPayload.length} 件在池裡、抽得到，但既沒有 \`modifiers\` 也沒有 \`passive\` ——`);
    p("**描述在承諾機制，資料是空的**，玩家看得到卡面但拿到的是零。");
    p();
    p("| 名稱 | id | 階級 |");
    p("|---|---|---|");
    for (const t of noPayload) p(`| ${cell(t.name)} | \`${t.id}\` | ${t.grades.join("／")} |`);
  }
  p();

  p("### 5.5 機制摘要是空的固有能力");
  p();
  const emptyInnates = innates.filter((i) => mechanicsLine(i.mech) === "—");
  if (emptyInnates.length === 0) {
    p("- ✅ 每一份天生技都至少接得到一個效果、觸發、屬性或授權格。");
  } else {
    p(`⚠️ 這 ${emptyInnates.length} 份天生技的 JSON 裡**找不到任何**效果／觸發／屬性／授權格 ——`);
    p("描述還在，機制是空的（失敗形態②：描述在承諾，資料是零）。");
    p();
    p("| 編號 | 名稱 | 擁有者 |");
    p("|---|---|---|");
    for (const i of emptyInnates)
      p(`| ${i.code ? `\`${i.code}\`` : "—"} | ${cell(i.name)} | ${cell(i.owners.map((o) => o.id).join("、"))} |`);
  }
  p();

  return `${L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv: readonly string[]): number {
  const check = argv.includes("--check");
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? resolve(argv[outIdx + 1] ?? "") : DEFAULT_OUT;

  const md = buildOverviewMarkdown();

  if (check) {
    if (!existsSync(out)) {
      process.stderr.write(`⛔ 固有能力及寶具總覽還沒產生：${out}\n   跑 \`pnpm overview:build\`。\n`);
      return 1;
    }
    if (readFileSync(out, "utf8") !== md) {
      process.stderr.write(
        `⛔ ${out} 已經過期 —— content／schema／註冊表改過了，但這份文件沒跟上。\n` +
          `   跑 \`pnpm overview:build\` 然後 \`git add docs/\`。⛔ 不要改測試。\n`,
      );
      return 1;
    }
    process.stdout.write(`✅ 固有能力及寶具總覽是最新的（${md.split("\n").length} 行）\n`);
    return 0;
  }

  writeFileSync(out, md);
  process.stdout.write(`✅ 寫出 ${out}（${md.split("\n").length} 行）\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
