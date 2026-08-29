/**
 * 🗺 導覽地圖 —— owner 2026-08-26：
 *
 * > 「後台左側選項**已經太長 不容易尋找、閱覽及管理** 你有什麼好建議做**資訊視覺化改善**嗎」
 *
 * 左欄是**一條線**：121 頁 × 11 組由上往下排成一列，要找一頁只能用眼睛從頭掃到尾。
 * ⚠️ 而今天已經拆過兩輪分組了（戰鬥規則 31→16、系統 36→23）—— ⇒ **再拆分組治不了它**。
 * 那是第〇·七守則講的「**一行接線**」病的導覽版：每加一頁就多一列要掃過去，
 * 而分組只是把同一條線折成幾段，長度一個像素都沒有變短。
 *
 * 這一頁把**同一份資料**（`NAV` 的那些列，⛔ 沒有第二個住處）換成一個**平面**：
 *
 *   · 一組一個區塊，**區塊的寬度反映它有幾頁** ⇒「這個 console 有哪些領域、
 *     哪個領域最大」是一眼看到的，⛔ 不是數出來的。
 *   · 每一頁一格 tile（emoji＋名稱），點下去就到 ⇒ 找到＝抵達，中間沒有第二步。
 *   · 一格過濾框：打字時**不符的 tile 變暗而不是消失** —— 保留空間感，
 *     所以「我要的東西在哪一區」這個記憶在過濾之後仍然成立。
 *   · **狀態徽章**：哪幾頁**現在有線上覆蓋層生效中**（owner 說的「管理」那一半）。
 *
 * ⚠️ ⭐ 這一頁**自己沒有任何一份頁面清單**。它吃 props 進來的 `rows`，
 * 也就是左欄畫的那一份 —— 少了這一條，地圖會變成第二個會腐爛的住處
 * （第〇·四守則），而它腐爛的樣子正好是「地圖上那一頁不見了」。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "./widgets";
import { ACCENT, ACCENT_BG, BG, OK, PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import { isNavItem, rowKey, type NavRow } from "./navGroups";
import { useApp } from "../store";
import { getOverlayStatus } from "../api";
import { STATE_HINT, STATE_LABEL, STATE_TONE, type OverlayStatus, type OverlayStatusEntry } from "../contentOverlay";
import { specForPage } from "../configForms";
// ⚠️ ⛔ 這裡刻意**不** import `../configDocCoverage`（那份 OWN_PAGE 表列的正是下面
// 這幾頁）—— 它 `import { readFileSync } from "node:fs"`，拉進瀏覽器 bundle 會直接
// 炸掉 build。⇒ 改成直接引用**那幾頁自己匯出的 docId 常數**，值只有一個住處。
import { BONUS_DOC_ID } from "../baseBonus";
import { COMBAT_FEEL_DOC_ID } from "../combatFeel";
import { DAMAGE_TIER_EXEMPTIONS_DOC_ID } from "../damageTierWarnings";
import { FORM_VISUALS_DOC_ID } from "../formVisuals";
import { ARENA_RULES_DOC_ID } from "../itemDraft";
import { MATCH_DOC_ID } from "../matchConfig";
import { ROSTER_DOC_ID } from "../roster";
import { CAPS_DOC_ID } from "../statCaps";
import { STORE_DOC_ID } from "../storeEconomy";
import { VFX_FAMILIES_DOC_ID } from "../vfxForge";
import { BARCODE_DOC_ID } from "../voxelBarcode";
import { BODY_DOC_ID } from "../voxelBody";

// ─────────────────────────────────────────────────────────────── 版面 ─────

/** 網格欄數。12 是因為 2/3/4/6 都整除它，區塊寬度不會出現半格。 */
export const GRID_COLUMNS = 12;
/** 最窄的區塊仍要塞得下一格 tile ＋ 標題，所以有下限。 */
export const MIN_SPAN = 2;

/** 一組在地圖上的一塊。 */
export interface NavMapBlock {
  section: string;
  rows: NavRow[];
  count: number;
  /** 佔幾欄（1…{@link GRID_COLUMNS}）。 */
  span: number;
}

/**
 * 寬度取**頁數的平方根**，⛔ 不是頁數本身。
 *
 * ⭐ 這正是 treemap 的算法而不是裝飾：tile 在區塊裡自己換行，所以區塊的高度
 * ≈ 頁數 ÷ 寬度。取 `寬 ∝ √頁數` ⇒ `高 ∝ √頁數` ⇒ **面積 ∝ 頁數** ——
 * 也就是「一組佔多少版面」等於「它有幾頁」，而那正是要被看到的量。
 * （⛔ 寬度直接取頁數的話，23 頁的組會是 2 頁那組的 11.5 倍寬，
 *   小組被壓成一條線，而它們的面積反而比大組還大。）
 */
export function spanForCount(count: number, maxCount: number): number {
  if (maxCount <= 0) return GRID_COLUMNS;
  const span = Math.round(Math.sqrt(Math.max(count, 0) / maxCount) * GRID_COLUMNS);
  return Math.min(GRID_COLUMNS, Math.max(MIN_SPAN, span));
}

/**
 * 把列切成區塊並算好每塊佔幾欄。**純函式**（沒有 React、沒有 DOM）—— 守衛驗的就是它。
 *
 * 分組順序：`order` 先，`order` 沒列到的**接在後面**而不是被丟掉（同 `groupRows`
 * 的理由：有人加了新分類卻忘了排序，正確的表現是排序怪怪的，⛔ 不是那幾頁人間蒸發）。
 * 不給 `order` 就用**首次出現順序**，也就是左欄的順序 —— 兩個畫面對得起來。
 */
export function layoutSections(rows: readonly NavRow[], order?: readonly string[]): NavMapBlock[] {
  const bySection = new Map<string, NavRow[]>();
  for (const row of rows) {
    const list = bySection.get(row.section);
    if (list) list.push(row);
    else bySection.set(row.section, [row]);
  }
  const sections: string[] = [];
  for (const s of order ?? []) if (bySection.has(s) && !sections.includes(s)) sections.push(s);
  for (const s of bySection.keys()) if (!sections.includes(s)) sections.push(s);

  let maxCount = 0;
  for (const list of bySection.values()) maxCount = Math.max(maxCount, list.length);

  return sections.map((section) => {
    const list = bySection.get(section) ?? [];
    return { section, rows: list, count: list.length, span: spanForCount(list.length, maxCount) };
  });
}

// ─────────────────────────────────────────────────── 覆蓋層狀態徽章 ─────

/**
 * 有專屬頁（⛔ 不走通用表單引擎）而仍然編一份 `config/` 文件的那幾頁。
 *
 * ⚠️ 值全部是**那一頁自己匯出的常數**，⛔ 不是在這裡重打一次字串 ——
 * 重打就是第二份會 drift 的知識，而 drift 的症狀正好是這張表要說的那件事
 * （「這一頁被覆蓋了」變成指著一份不存在的文件）。
 */
const HAND_ROLLED_CONFIG_PAGES: Readonly<Record<string, string>> = {
  baseBonus: BONUS_DOC_ID,
  combatFeel: COMBAT_FEEL_DOC_ID,
  damageTierWarnings: DAMAGE_TIER_EXEMPTIONS_DOC_ID,
  formVisuals: FORM_VISUALS_DOC_ID,
  itemDraft: ARENA_RULES_DOC_ID,
  matchConfig: MATCH_DOC_ID,
  roster: ROSTER_DOC_ID,
  statCaps: CAPS_DOC_ID,
  storeEconomy: STORE_DOC_ID,
  vfxForge: VFX_FAMILIES_DOC_ID,
  voxelBarcode: BARCODE_DOC_ID,
  voxelBody: BODY_DOC_ID,
  // ⚠️ 這三頁在 `configDocCoverage` 的 OWN_PAGE 表裡也是字面值 —— 它們的模組沒有
  // 匯出 docId 常數。⛔ 沒有常數可引用時寧可留字面值也不要漏掉它們：漏掉的後果是
  // 一頁**明明被覆蓋了卻不帶徽章**，那比沒有徽章更糟。
  arenaPool: "arena-pool",
  combatEnv: "combat-env",
  mapReport: "map-report",
};

/** 這一頁編的是哪一份 `config/` 文件（查不到回 null —— 多數頁本來就不編 config）。 */
export function configDocIdForPage(page: string): string | null {
  return specForPage(page)?.docId ?? HAND_ROLLED_CONFIG_PAGES[page] ?? null;
}

const TONE_COLOR = { ok: OK, warn: WARN, info: TEXT_DIM } as const;

// ───────────────────────────────────────────────────────────── 元件 ─────

const CSS = `
.ggd-navmap { display: grid; grid-template-columns: repeat(${GRID_COLUMNS}, 1fr); gap: 12px; grid-auto-flow: row dense; }
.ggd-navmap-tile { display: flex; align-items: center; gap: 6px; text-align: left; font: inherit; font-size: 12px;
  padding: 6px 8px; border-radius: 8px; border: 1px solid ${PANEL_BG}; background: ${PANEL_BG};
  color: ${TEXT_MAIN}; cursor: pointer; text-decoration: none; }
.ggd-navmap-tile:hover { border-color: ${ACCENT}; background: ${ACCENT_BG}; }
@media (max-width: 900px) { .ggd-navmap > * { grid-column: 1 / -1 !important; } }
`;

function matches(row: NavRow, q: string): boolean {
  if (q === "") return true;
  const page = isNavItem(row) ? row.page : row.key;
  return `${row.label} ${page} ${row.section}`.toLowerCase().includes(q);
}

export function NavMapPage(props: {
  rows: NavRow[];
  onNavigate: (page: string) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState("");
  const account = useApp((s) => s.account);
  const [overlay, setOverlay] = useState<OverlayStatus | null>(null);
  const [overlayNote, setOverlayNote] = useState<string | null>(null);

  // ⭐ 沒有 session 時**整頁仍然畫得出來** —— 結構是本機資料，只有徽章那一格降級，
  // 而且它降級成一句**說出實情**的話，⛔ 不是一個編出來的「一致」狀態。
  useEffect(() => {
    if (!account) {
      setOverlay(null);
      setOverlayNote("⚪ 未登入 —— 線上覆蓋層狀態查不到（登入後這一欄才會出現）。");
      return;
    }
    let live = true;
    setOverlayNote(null);
    getOverlayStatus()
      .then((st) => {
        if (live) setOverlay(st);
      })
      .catch((e: unknown) => {
        if (live) setOverlayNote(`⚠️ 線上覆蓋層狀態讀取失敗：${e instanceof Error ? e.message : String(e)}`);
      });
    return () => {
      live = false;
    };
  }, [account]);

  const blocks = useMemo(() => layoutSections(props.rows), [props.rows]);
  const overlayByPage = useMemo(() => {
    const out = new Map<string, OverlayStatusEntry>();
    if (!overlay) return out;
    const byDocId = new Map<string, OverlayStatusEntry>();
    for (const e of overlay.entries) if (e.collection === "config") byDocId.set(e.id, e);
    for (const row of props.rows) {
      if (!isNavItem(row)) continue;
      const docId = configDocIdForPage(row.page);
      const hit = docId === null ? undefined : byDocId.get(docId);
      if (hit) out.set(row.page, hit);
    }
    return out;
  }, [overlay, props.rows]);

  const q = query.trim().toLowerCase();
  const hits = props.rows.filter((r) => matches(r, q)).length;

  return (
    <Panel title="🗺 導覽地圖">
      <style>{CSS}</style>
      <div style={{ color: TEXT_DIM, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
        左欄是一條線，這裡是一個平面 —— <strong>區塊愈寬代表那一組頁數愈多</strong>
        （寬度取頁數的平方根，所以佔的<strong>面積</strong>正比於頁數）。點任何一格直接跳過去。
        <br />
        {blocks.length} 組 · {props.rows.length} 頁
        {overlay !== null && <> · 🟡 {overlayByPage.size} 頁有線上覆蓋層生效中</>}
        {overlayNote !== null && <> · {overlayNote}</>}
      </div>

      <div style={{ maxWidth: 360, marginBottom: 16 }}>
        <TextInput
          value={query}
          onChange={setQuery}
          dataField="navmap-filter"
          placeholder={`過濾（名稱／路由／分組）— ${hits}/${props.rows.length} 符合`}
        />
      </div>

      <div className="ggd-navmap">
        {blocks.map((b) => (
          <section
            key={b.section}
            style={{
              gridColumn: `span ${b.span}`,
              background: BG,
              border: PANEL_BORDER,
              borderRadius: 10,
              padding: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT_MAIN }}>{b.section}</div>
              <div style={{ fontSize: 11, color: TEXT_DIM }}>{b.count} 頁</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {b.rows.map((row) => {
                const dim = !matches(row, q);
                const entry = isNavItem(row) ? overlayByPage.get(row.page) : undefined;
                const style: React.CSSProperties = { opacity: dim ? 0.18 : 1 };
                const inner = (
                  <>
                    <span aria-hidden>{row.emoji}</span>
                    <span>{row.label}</span>
                    {entry && (
                      <span
                        title={STATE_HINT[entry.state]}
                        style={{ color: TONE_COLOR[STATE_TONE[entry.state]], fontSize: 10, fontWeight: 700 }}
                      >
                        ●{STATE_LABEL[entry.state]}
                      </span>
                    )}
                  </>
                );
                return isNavItem(row) ? (
                  <button
                    key={rowKey(row)}
                    className="ggd-navmap-tile"
                    data-field={`navmap-${row.page}`}
                    style={style}
                    onClick={() => props.onNavigate(row.page)}
                  >
                    {inner}
                  </button>
                ) : (
                  <a
                    key={rowKey(row)}
                    className="ggd-navmap-tile"
                    href={row.href}
                    title={row.note}
                    target="_blank"
                    rel="noreferrer"
                    style={style}
                  >
                    {inner}
                    <span style={{ color: TEXT_DIM, fontSize: 10 }}>↗</span>
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}
