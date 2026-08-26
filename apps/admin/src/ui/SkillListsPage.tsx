/**
 * 📜 詠唱>1秒清單（GH#682）＋ 💨 移速加成清單（GH#683）—— 兩頁唯讀表。
 *
 * owner 2026-08-24（逐字，各票第二次點名）：
 * > 「施法準備/詠唱/吟唱時間超過1秒的技能列表(md) & 後台」
 * > 「任何增加移動速度的技能列表(md) &後台」
 *
 * ⭐ 資料來源是 `tools/skill-lists/lists.json` —— **`pnpm speedlists:build`
 * 產生的那一份**，與 `docs/技能詠唱清單.md` / `docs/技能移速清單.md` 共用同一次
 * 計算（第〇·四守則：同一份知識只有一個住處）。這一頁**零重算**：連「加多少」
 * 「持續多久」的字串都是產生器排好的，後台只負責畫。
 *
 * ⚠️ 為什麼是 build-time import 而不是 fetch：這份 JSON 不是 config 文件
 *（沒有 schema tag、不進 content bundle、owner 不會編它），它跟導覽列一樣是
 * 「這一版 build 的事實」。跑 `pnpm skills:sync`（含 speedlists:build）後重新
 * build/重啟 dev server 就是最新 —— 與 md 的更新節奏完全相同。
 *
 * 與 tierOverview 同一類：唯讀、一格都不寫，⛔ 不在 SESSION_REQUIRED_PAGES。
 */
import { useMemo, useState } from "react";
import { Panel, TextInput } from "./widgets";
import { GOLD, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "./theme";
import lists from "../../../../tools/skill-lists/lists.json";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const KIND_ZH: Record<string, string> = { ability: "技能", item: "道具", augment: "增益卡" };
const INTERRUPT_ZH: Record<string, string> = {
  none: "不會（僅死亡/暈眩/擊倒）",
  damage: "會（掉血就斷）",
};

function Th(props: { children: React.ReactNode; align?: "left" | "right" }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 10px",
        textAlign: props.align ?? "left",
        fontSize: 12,
        color: TEXT_DIM,
        borderBottom: PANEL_BORDER,
        whiteSpace: "nowrap",
      }}
    >
      {props.children}
    </th>
  );
}

function Td(props: {
  children: React.ReactNode;
  align?: "left" | "right";
  mono?: boolean;
  color?: string;
}): React.JSX.Element {
  return (
    <td
      style={{
        padding: "6px 10px",
        borderTop: PANEL_BORDER,
        fontSize: 13,
        textAlign: props.align ?? "left",
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
      }}
    >
      {props.children}
    </td>
  );
}

function SourceNote(): React.JSX.Element {
  return (
    <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.6 }}>
      資料來源：<code style={{ fontFamily: MONO }}>tools/skill-lists/lists.json</code>
      （<code style={{ fontFamily: MONO }}>pnpm speedlists:build</code> 產生，與 docs 的兩份 md
      共用同一次計算 —— 這一頁唯讀、零重算）。技能母體：{lists.provenance}。
    </div>
  );
}

/**
 * 📜 詠唱 >1 秒的技能（GH#682）＋ ⏳ owner 夾的記錄（GH#787）。
 *
 * owner 2026-08-27（逐字）：
 * > 「把所有詠唱超過一秒的都調整至一秒 但是在後台留下記錄」
 * ⇒ 這一頁就是那個「記錄」：原值／夾後／差三欄，被夾的標 ⏳。
 * 夾子本身住在「吟唱規則」頁的 castTimeMaxSec（出貨 1.0；拉到 8 = 不夾）。
 */
export function CastTimeListPage(): React.JSX.Element {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "") return lists.cast;
    return lists.cast.filter((r) =>
      `${r.id} ${r.name} ${r.championName}`.toLowerCase().includes(needle),
    );
  }, [q]);
  const clampedCount = useMemo(() => lists.cast.filter((r) => r.clamped).length, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1180 }}>
      <Panel
        title={
          `📜 詠唱超過 ${lists.castThresholdSec} 秒的技能` +
          `（共 ${lists.cast.length} 支，⏳ 被夾 ${clampedCount} 支）`
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SourceNote />
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            ⏳ owner 2026-08-27（#787）：「把所有詠唱超過一秒的都調整至一秒
            但是在後台留下記錄」—— 這一頁就是那個記錄。「原值」＝技能文件（含鑄技工坊模板補完）的
            castTimeSec（⛔ 一份都沒改）；「夾後」＝套完出貨 config.cast-time@1（castTimeMaxSec=
            {lists.castTimeMaxSec}／倍率／上下限／tick 對齊）後玩家實際等的秒數；「差」＝原值−夾後，
            被夾的標 ⏳。夾子在「吟唱規則」頁的「詠唱調整上限」；拉到 8 ＝ 不夾（止血閥）。
          </div>
          <TextInput value={q} onChange={setQ} placeholder="過濾：技能 id / 名 / 英雄…" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
              <thead>
                <tr>
                  <Th>技能 id</Th>
                  <Th>技能名</Th>
                  <Th>英雄</Th>
                  <Th>格</Th>
                  <Th align="right">詠唱（原值）</Th>
                  <Th align="right">詠唱（夾後）</Th>
                  <Th align="right">差</Th>
                  <Th>castType</Th>
                  <Th>可否被打斷</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td mono>{r.id}</Td>
                    <Td>{r.name}</Td>
                    <Td color={TEXT_DIM}>{r.championName}</Td>
                    <Td mono>{r.slot}</Td>
                    <Td align="right" mono color={TEXT_DIM}>
                      {r.castTimeSec}
                    </Td>
                    <Td align="right" mono color={GOLD}>
                      {r.effectiveSec}
                    </Td>
                    <Td align="right" mono color={r.clamped ? WARN : TEXT_DIM}>
                      {r.clamped ? `⏳ ${r.deltaSec}` : r.deltaSec}
                    </Td>
                    <Td mono color={TEXT_DIM}>
                      {r.castType}
                    </Td>
                    <Td color={r.interruptOn === "damage" ? WARN : TEXT_DIM}>
                      {INTERRUPT_ZH[r.interruptOn] ?? r.interruptOn}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** 💨 任何增加移動速度的技能／道具／增益卡（GH#683）。 */
export function MoveSpeedListPage(): React.JSX.Element {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "") return lists.ms;
    return lists.ms.filter((r) =>
      `${r.id} ${r.name} ${r.championName ?? ""}`.toLowerCase().includes(needle),
    );
  }, [q]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1180 }}>
      <Panel title={`💨 移動速度加成清單（共 ${lists.ms.length} 列）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <SourceNote />
          <div style={{ fontSize: 12, color: TEXT_DIM }}>
            收錄條件：stat ms、op 為 flat / pctAdd / pctMult 且 value &gt; 0 —— 含
            applyBuff（與其 perRank）、常駐被動、靈氣、死亡守衛、道具本體、增益卡；
            道具與增益卡不篩母體，全列。
          </div>
          <TextInput value={q} onChange={setQ} placeholder="過濾：來源 id / 名 / 英雄…" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr>
                  <Th>來源 id</Th>
                  <Th>名稱</Th>
                  <Th>種類</Th>
                  <Th>英雄</Th>
                  <Th>掛在哪</Th>
                  <Th>加多少</Th>
                  <Th>持續多久</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}|${r.id}|${r.context}|${r.op}`}>
                    <Td mono>{r.id}</Td>
                    <Td>{r.name}</Td>
                    <Td color={TEXT_DIM}>{KIND_ZH[r.kind] ?? r.kind}</Td>
                    <Td color={TEXT_DIM}>{r.championName ?? "—"}</Td>
                    <Td color={TEXT_DIM}>{r.context}</Td>
                    <Td mono color={GOLD}>
                      {r.amountText}
                    </Td>
                    <Td>{r.durationText}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </div>
  );
}
