/**
 * ⚠️ **不吃五級距的傷害節點** —— 後台唯一會說出「這些數字改級距表也不會動」的地方。
 *
 * owner 2026-08-22（#534）逐字：
 * > 「①②③ **作為例外在後台跳出警告就好**，④ **你拉上來**」
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 為什麼「豁免」必須在畫面上，而不是只寫在一份 JSON 裡
 *
 * 第〇·四守則的整個重點是「改公式表 = 全改完」。豁免節點是那句話**唯一的例外**，
 * 而例外如果只住在檔案裡，它的症狀是：owner 把「極大」從 2000 拉到 3000，
 * 全樹跟著動，**只有這幾十個節點原地不動** —— 而且 `content:build` 全綠、
 * 全套測試全綠、畫面上沒有任何東西不一樣。那正是第一·五守則說的「每一個零件都
 * 是對的，只有它們的組合是空的」。
 *
 * ⇒ 這一頁的文案講的是**後果**（「級距拉高 X%，這些節點的相對強度就掉 X%」），
 * ⛔ 不是複述「它被豁免了」。複述沒有替任何人做任何決定。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ 這個檔案裡**一個門檻數字都沒有**
 *
 * 「判定用的 1 點」那一類的界線（`值 ≤ 5`）住在產生豁免表的那支腳本裡。後台如果
 * 自己再判一次，那個 5 就有了第二個住處 —— 而第二個住處必然過期（第〇·四守則）。
 * 所以分類**一律讀文件自己宣告的 `group`**，讀不到才退回用 `kind` 對照，
 * 對不上就是「其他」⛔ 不猜。畫面上寧可顯示「其他」，也不要顯示一個後台自己編的答案。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 讀不到那份文件時要說「尚未產生」，⛔ 不是畫一張空表
 *
 * `content/config/damage-tier-exemptions.json` 是產生出來的。它不存在的時候，
 * 一張空表的意思是「零個豁免節點」——那是一句**謊話**，而且是最危險的那種：
 * 它讓 owner 以為級距表管得到全部。所以 `present === false` 走的是一條**明著說
 * 自己不知道**的路（fail-loud，第二守則）。
 *
 * 邏輯全部在這裡（純函式、node 可測）；`DamageTierWarningsPage` 只負責畫。
 */
import {
  createElement as h,
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { getOverlayDoc, getShippedDoc } from "./api";
import { Panel } from "./ui/widgets";
import { DANGER, GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./ui/theme";

/** ⛔ 後台不重打一次這個字串 —— `configDocCoverage` 的豁免列拿它當證據。 */
export const DAMAGE_TIER_EXEMPTIONS_DOC_ID = "damage-tier-exemptions";
export const DAMAGE_TIER_EXEMPTIONS_COLLECTION = "config";

/** 一列 = 一個「填了字面值、而且**刻意**不掛級距」的傷害節點。 */
export interface ExemptionRow {
  /** 技能（id 或名字，看那份文件寫了什麼） */
  readonly ability: string;
  /** 節點在那份 JSON 裡的路徑 */
  readonly path: string;
  /** effect kind（`shield` / `dot` / `damageArea`…） */
  readonly kind: string;
  /** **為什麼**它不該有級別 —— 一個能被反駁的理由（第〇·四守則） */
  readonly why: string;
  /** 目前的字面值；讀不到就是 null（⛔ 不要填 0 假裝知道） */
  readonly flat: number | null;
  /** 這一列的分類 key（見 {@link GROUP_ZH}） */
  readonly group: GroupKey;
}

/**
 * 五類。①②③⑤ 是豁免，④（真的該有級別）**不在這裡** —— 它被拉上級距了，
 * 所以它不是這一頁的內容。`other` 是「文件沒說、kind 也對不上」的收容格。
 */
export type GroupKey = "not-damage" | "probe" | "per-tick" | "per-hit" | "other";

const GROUP_ORDER: readonly GroupKey[] = ["not-damage", "probe", "per-tick", "per-hit", "other"];

export const GROUP_ZH: Readonly<Record<GroupKey, string>> = Object.freeze({
  "not-damage": "① 本來就不是傷害",
  probe: "② 判定用的極小值",
  "per-tick": "③ 持續傷害的每一跳",
  "per-hit": "⑤ 每次攻擊追加（法球效應）",
  other: "❓ 未分類",
});

/**
 * 每一類**如果硬套單發五級距會發生什麼** —— ⛔ 不是「它被豁免了」的同義反覆。
 * 這幾句是這一頁存在的理由：它們是 owner 下次調級距時需要記得的那件事。
 */
export const GROUP_WHY: Readonly<Record<GroupKey, string>> = Object.freeze({
  "not-damage":
    "護盾／治療／耗魔不是傷害。把傷害級距套上去，等於讓「這一發打多痛」決定「這一發補多少血」—— 兩條完全不同的曲線被綁成同一條。",
  probe:
    "這些節點的值只是「有沒有打到」的判定憑證，真正的效果是它旁邊那個狀態（暈／減速／標記）。拉成級距值＝這支技能突然多出一發它從來沒有過的傷害。",
  "per-tick":
    "持續傷害的數字是**每一跳**，一次施法會跳很多次。套單發級距＝實際傷害被乘上跳數 —— 級距表上的「中」在這裡會打出「極大」的總量。",
  "per-hit":
    "法球／每次攻擊追加是掛在**每一刀**上的，一次戰鬥發生幾十次。套單發級距＝每刀都是一發技能，那是量級的錯誤，⛔ 不是數值的錯誤。",
  other:
    "文件沒有宣告分類，`kind` 也對不上任何一類。⚠️ 這一格不是「安全」，是**還沒有人看過它** —— 它可能是漏掉的第 ④ 類（真的該拉上級距）。",
});

/** `kind` → 分類的退路。⛔ 只在文件沒宣告 `group` 時才用，而且對不上就是 `other`。 */
const KIND_GROUP: Readonly<Record<string, GroupKey>> = Object.freeze({
  shield: "not-damage",
  heal: "not-damage",
  spendMana: "not-damage",
  dot: "per-tick",
});

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pick(obj: Record<string, unknown>, keys: readonly string[]): string {
  for (const k of keys) {
    const s = str(obj[k]);
    if (s !== "") return s;
  }
  return "";
}

function num(obj: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * 文件裡那個陣列在哪一格。⚠️ 刻意接受好幾個鍵名：這份文件由另一條產線產生，
 * 而後台**猜錯鍵名的症狀是一張空表**（＝上面說的那句謊話）。多認幾個鍵，
 * 換到的是「換了鍵名也還看得見」，代價只有這幾行。
 */
const ARRAY_KEYS = ["exemptions", "nodes", "rows", "entries"] as const;

function arrayIn(doc: unknown): unknown[] | null {
  if (Array.isArray(doc)) return doc;
  if (!doc || typeof doc !== "object") return null;
  const obj = doc as Record<string, unknown>;
  for (const k of ARRAY_KEYS) if (Array.isArray(obj[k])) return obj[k] as unknown[];
  return null;
}

/** 文件 → 畫面上的列。讀不到／型別不對 → 空陣列（呼叫端據此走「尚未產生」那條路）。 */
export function exemptionRowsFrom(doc: unknown): ExemptionRow[] {
  const arr = arrayIn(doc);
  if (arr === null) return [];
  const out: ExemptionRow[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const kind = pick(r, ["kind", "effectKind", "effect"]);
    const declared = pick(r, ["group", "category", "class"]);
    const group: GroupKey = GROUP_ORDER.includes(declared as GroupKey)
      ? (declared as GroupKey)
      : (KIND_GROUP[kind] ?? "other");
    out.push({
      ability: pick(r, ["ability", "abilityId", "skill", "id"]),
      path: pick(r, ["path", "pointer", "at"]),
      kind,
      why: pick(r, ["why", "reason", "note"]),
      flat: num(r, ["flat", "value", "amount"]),
      group,
    });
  }
  return out;
}

export interface ExemptionGroupView {
  readonly key: GroupKey;
  readonly zh: string;
  readonly why: string;
  readonly rows: readonly ExemptionRow[];
}

export interface ExemptionView {
  /** 那份文件真的讀到了嗎。false ⇒ 畫面上要說「尚未產生」，⛔ 不是畫一張空表 */
  readonly generated: boolean;
  /** 值是從哪裡來的 —— 操作者要知道他看的是不是線上生效的那一份 */
  readonly source: "overlay" | "shipped" | "none";
  readonly rows: readonly ExemptionRow[];
  /** 只含**有列**的分類（空分類不畫，那只是雜訊） */
  readonly groups: readonly ExemptionGroupView[];
  /** 頁首那一句：講後果、數字現算 */
  readonly banner: string;
}

/**
 * 讀不到那份文件時畫面上的那一段。⚠️ 它刻意**不**說「目前沒有豁免節點」——
 * 那句話會讓 owner 以為級距表管得到全部，而那正是這一頁在防的誤判。
 */
export const NOT_GENERATED_NOTICE =
  "⚠️ **尚未產生** —— 讀不到 `content/config/damage-tier-exemptions.json`（還沒跑產生器，或線上這一版還沒有這份文件）。" +
  "⛔ 這**不代表沒有豁免節點**，只代表這一頁現在數不出來。在它產生之前，改「傷害五級距」那一頁請當作**還有一批節點不會跟著動**。";

/** 頁首警告 —— ⭐ 數量現算，⛔ 不是說明裡手打的數字（第〇·四守則）。 */
export function warningBanner(rows: readonly ExemptionRow[]): string {
  const n = rows.length;
  const kinds = new Set(rows.map((r) => r.kind).filter((k) => k !== "")).size;
  return (
    `⚠️ 這 **${n}** 個節點（${kinds} 種 effect kind）的傷害**不會**隨五級距變動。` +
    "改「傷害五級距」那一頁時它們**原地不動** —— 那是刻意的，⛔ 但每一次調平衡都要記得它們：" +
    "級距整體拉高 X%，這些節點的相對強度就**掉** X%，而且畫面上、測試裡、`content:build` 全部不會有任何東西變紅。"
  );
}

/** 分組 —— 順序固定（①②③⑤ 然後未分類），空的分類不畫。 */
export function groupRows(rows: readonly ExemptionRow[]): ExemptionGroupView[] {
  return GROUP_ORDER.map((key) => ({
    key,
    zh: GROUP_ZH[key],
    why: GROUP_WHY[key],
    rows: rows.filter((r) => r.group === key),
  })).filter((g) => g.rows.length > 0);
}

/** 整頁的 view model。`present` 是 `getShippedDoc` 回的那一格，⛔ 不要用 `doc !== null` 代替。 */
export function exemptionView(input: {
  doc: unknown;
  present: boolean;
  source: "overlay" | "shipped" | "none";
}): ExemptionView {
  const rows = input.present ? exemptionRowsFrom(input.doc) : [];
  const generated = input.present && arrayIn(input.doc) !== null;
  return {
    generated,
    source: generated ? input.source : "none",
    rows,
    groups: groupRows(rows),
    banner: warningBanner(rows),
  };
}

// ───────────────────────────────────────────────────────────────── 畫面 ────
// ⚠️ 用 `createElement` 而不是 JSX，是因為這個檔案是 `.ts`：邏輯與畫面住同一個
// 檔案，一條 lane 只動一個檔案（2026-08-22 發生過四次 lane 互相掃走對方的檔）。

const TH: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: PANEL_BORDER,
  color: TEXT_DIM,
  fontSize: 12,
  whiteSpace: "nowrap",
};
const TD: CSSProperties = {
  padding: "6px 8px",
  borderBottom: PANEL_BORDER,
  color: TEXT_MAIN,
  fontSize: 12,
  verticalAlign: "top",
};

function groupBlock(g: ExemptionGroupView): ReactNode {
  return h(
    "div",
    { key: g.key, style: { marginTop: 18 }, "data-group": g.key },
    h(
      "div",
      { style: { color: GOLD, fontWeight: 600, fontSize: 13 } },
      `${g.zh} — ${g.rows.length} 個節點`,
    ),
    h("div", { style: { color: TEXT_DIM, fontSize: 12, lineHeight: 1.7, margin: "4px 0 8px" } }, g.why),
    h(
      "div",
      { style: { overflowX: "auto" } },
      h(
        "table",
        { style: { borderCollapse: "collapse", width: "100%", minWidth: 720 } },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", { style: TH }, "技能"),
            h("th", { style: TH }, "路徑"),
            h("th", { style: TH }, "kind"),
            h("th", { style: TH }, "目前的值"),
            h("th", { style: TH }, "為什麼不掛級距"),
          ),
        ),
        h(
          "tbody",
          null,
          ...g.rows.map((r, i) =>
            h(
              "tr",
              { key: `${r.ability}/${r.path}/${i}` },
              h("td", { style: TD }, r.ability || "—"),
              h("td", { style: TD }, h("code", null, r.path || "—")),
              h("td", { style: TD }, h("code", null, r.kind || "—")),
              h("td", { style: TD }, r.flat === null ? "—" : String(r.flat)),
              h("td", { style: { ...TD, color: TEXT_DIM } }, r.why || "⚠️ 文件沒有寫理由"),
            ),
          ),
        ),
      ),
    ),
  );
}

export function DamageTierWarningsPage(): ReactElement {
  const [view, setView] = useState<ExemptionView | null>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const overlay = await getOverlayDoc(
          DAMAGE_TIER_EXEMPTIONS_COLLECTION,
          DAMAGE_TIER_EXEMPTIONS_DOC_ID,
        );
        if (overlay !== null) {
          if (live) setView(exemptionView({ doc: overlay, present: true, source: "overlay" }));
          return;
        }
        const shipped = await getShippedDoc(
          DAMAGE_TIER_EXEMPTIONS_COLLECTION,
          DAMAGE_TIER_EXEMPTIONS_DOC_ID,
        );
        if (live)
          setView(
            exemptionView({ doc: shipped.doc, present: shipped.present, source: "shipped" }),
          );
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const body: ReactNode[] = [];
  if (err !== "")
    body.push(h("div", { key: "err", style: { color: DANGER, fontSize: 12 } }, `讀取失敗：${err}`));
  else if (view === null) body.push(h("div", { key: "load", style: { color: TEXT_DIM } }, "讀取中…"));
  else if (!view.generated)
    body.push(
      h(
        "div",
        {
          key: "none",
          "data-field": "not-generated",
          style: { color: GOLD, fontSize: 13, lineHeight: 1.8 },
        },
        NOT_GENERATED_NOTICE,
      ),
    );
  else {
    body.push(
      h(
        "div",
        {
          key: "banner",
          "data-field": "banner",
          style: {
            color: GOLD,
            fontSize: 13,
            lineHeight: 1.8,
            padding: "10px 12px",
            border: PANEL_BORDER,
            borderRadius: 6,
          },
        },
        view.banner,
      ),
      h(
        "div",
        { key: "src", style: { color: TEXT_DIM, fontSize: 12, marginTop: 6 } },
        view.source === "overlay" ? "值來自線上覆蓋層（data/）" : "值來自出貨 JSON（content/config/）",
      ),
      ...view.groups.map(groupBlock),
    );
  }

  return h(Panel, {
    title: "⚠️ 不吃五級距的傷害節點",
    children: [
      h(
        "div",
        { key: "lead", style: { color: TEXT_DIM, fontSize: 12, lineHeight: 1.8, marginBottom: 10 } },
        "這一頁是唯讀的。要改這些數字請改那支技能自己的 JSON —— ⛔ 它們**刻意**不掛 `damageTier`，所以「傷害五級距」那一頁動不到它們。",
      ),
      ...body,
    ],
  });
}
