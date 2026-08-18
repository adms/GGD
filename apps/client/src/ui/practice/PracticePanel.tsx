/**
 * 練習面板（GH#365）—— owner 逐字要的六個分頁：
 * **成長 · 寶具 · 屬性 · 技能 · 狀態 · 殭屍**。
 *
 * owner 2026-08-18：「重新設計一個適合現在的比較快」。⭐ 舊的那個
 * （`CheatConsole` 的單欄清單）**沒有被丟掉**：它的槽位、🐞 按鈕、backtick 開關、
 * 環境分級與練習房豁免全部留在 `../CheatConsole.tsx`，這一支只換掉**內容**。
 * 分開的理由是它們是兩個問題：「這顆按鈕該不該出現在畫面上」（chrome）與
 * 「按下去有哪些東西可以調」（content）。
 *
 * ── 每一顆按鈕都送**同一條既有通道** ────────────────────────────────────────
 * `hudActions.sendCheat` → `MSG.CHEAT` → `MatchRoom` 的 hard gate → `applyCheat`。
 * ⛔ 沒有新的網路訊息、⛔ 沒有動 `EntityState` 的 `defineTypes`（APPEND-ONLY）。
 * 六個分頁 = 六個新的 `Cheat.kind`**帶不同參數**，⛔ 不是六十個。
 *
 * ── ⛔ 這個面板不是安全機制 ────────────────────────────────────────────────
 * 它藏起來與否，跟一個手動送 WebSocket 訊息的人送不送得動這些指令**完全無關**。
 * 真正的閘在伺服器（`match/cheatGate.ts` + `rooms/MatchRoom.ts` 的
 * `if (!this.cheatsAllowed) return;`），守衛在 `match/practiceCheatGate.test.ts`。
 */
import { useMemo, useState } from "react";
import { hudActions } from "../actions";
import { cheat, clampLevel, filterEntries, type CheatListEntry } from "../cheats";
import { SfxButton } from "../SfxButton";
import { TEXT_DIM, TEXT_MAIN } from "../theme";
import {
  PRACTICE_CAST_SLOTS,
  PRACTICE_TABS,
  parseCheatNumber,
  practiceChampionRows,
  practiceItemRows,
  practiceStatRows,
  practiceStatusRows,
  type PracticeTabId,
} from "./practiceModel";

const btn: React.CSSProperties = {
  minHeight: 32,
  padding: "5px 10px",
  borderRadius: 7,
  cursor: "pointer",
  background: "#1b2233",
  border: "1px solid #2c3448",
  color: TEXT_MAIN,
  fontSize: 12,
};
const btnOn: React.CSSProperties = { ...btn, background: "#2c5f3f", border: "1px solid #57c98a" };
const label: React.CSSProperties = { fontSize: 11, color: TEXT_DIM, margin: "10px 0 4px" };
const field: React.CSSProperties = {
  minHeight: 32,
  padding: "6px 8px",
  fontSize: 16, // 16px avoids iOS focus zoom
  borderRadius: 7,
  background: "#0f1420",
  border: "1px solid #2c3448",
  color: TEXT_MAIN,
  boxSizing: "border-box",
};
const row: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" };

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div style={label}>{title}</div>
      <div style={row}>{children}</div>
    </div>
  );
}

/** 可搜尋的登錄表清單（寶具／狀態／屬性共用）→ onPick(id)。 */
function PickList<T extends CheatListEntry>({
  entries,
  placeholder,
  onPick,
  render,
}: {
  entries: readonly T[];
  placeholder: string;
  onPick: (e: T) => void;
  render?: (e: T) => React.ReactNode;
}): React.JSX.Element {
  const [q, setQ] = useState("");
  const shown = useMemo(() => filterEntries(entries, q).slice(0, 200), [entries, q]);
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ ...field, width: "100%" }}
      />
      <div
        style={{
          maxHeight: 220,
          overflowY: "auto",
          marginTop: 6,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 4,
        }}
      >
        {shown.map((e) => (
          <SfxButton key={e.id} onClick={() => onPick(e)} style={{ ...btn, textAlign: "left" }} title={e.id}>
            {render ? render(e) : e.name}
          </SfxButton>
        ))}
        {shown.length === 0 && (
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: TEXT_DIM, padding: 6 }}>無符合項目</div>
        )}
      </div>
      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3 }}>
        {shown.length} / {entries.length}
      </div>
    </div>
  );
}

const send = (c: Parameters<typeof hudActions.sendCheat>[0]): void => hudActions.sendCheat(c);

// ── 分頁① 成長 ──────────────────────────────────────────────────────────────
function GrowthTab(): React.JSX.Element {
  const [level, setLevel] = useState(18);
  const [xp, setXp] = useState("1000");
  const [gold, setGold] = useState("5000");
  const champions = useMemo(practiceChampionRows, []);
  const xpN = parseCheatNumber(xp);
  const goldN = parseCheatNumber(gold);
  return (
    <>
      <Section title="等級 —— 直接設到 N">
        <input
          type="range"
          min={1}
          max={18}
          value={level}
          onChange={(e) => setLevel(clampLevel(Number(e.target.value)))}
          style={{ flex: 1, minWidth: 110 }}
          aria-label="level"
        />
        <span style={{ fontSize: 12, width: 22, textAlign: "center" }}>{level}</span>
        <SfxButton onClick={() => send(cheat.setLevel(level))} style={btn}>
          設為 Lv {level}
        </SfxButton>
      </Section>

      <Section title="經驗值 —— 直接灌 N 點（會連續升級）">
        <input
          value={xp}
          onChange={(e) => setXp(e.target.value)}
          style={{ ...field, width: 90 }}
          aria-label="xp amount"
          inputMode="numeric"
        />
        <SfxButton
          onClick={() => xpN !== null && send(cheat.grantXp(xpN))}
          style={btn}
          title="送出 grantXp。⛔ 空白不送。"
        >
          +{xpN ?? "?"} 經驗
        </SfxButton>
      </Section>

      <Section title="金錢">
        <input
          value={gold}
          onChange={(e) => setGold(e.target.value)}
          style={{ ...field, width: 90 }}
          aria-label="gold amount"
          inputMode="numeric"
        />
        <SfxButton onClick={() => goldN !== null && send(cheat.grantGold(goldN))} style={btn}>
          +{goldN ?? "?"} 金
        </SfxButton>
        <SfxButton onClick={() => send(cheat.rerollOffers())} style={btn} title="重抽這一座位的三選一">
          重抽 offer
        </SfxButton>
        <SfxButton onClick={() => send(cheat.skipPhase())} style={btn} title="強制推進相位">
          跳過階段
        </SfxButton>
      </Section>

      <div style={label}>切換英雄 —— 同座位／同隊伍／同位置重新生成</div>
      <PickList
        entries={champions}
        placeholder="搜尋英雄…"
        onPick={(e) => send(cheat.swapChampion(e.id))}
      />
    </>
  );
}

// ── 分頁② 寶具 ──────────────────────────────────────────────────────────────
function ItemsTab(): React.JSX.Element {
  const items = useMemo(practiceItemRows, []);
  return (
    <div>
      <div style={label}>
        任選一件直接給 —— {items.length} 件，⭐ 全部從出貨註冊表推導（含 [EX∅ 根源]）
      </div>
      <PickList entries={items} placeholder="搜尋寶具（名稱／id／標籤）…" onPick={(e) => send(cheat.giveItem(e.id))} />
    </div>
  );
}

// ── 分頁③ 屬性 ──────────────────────────────────────────────────────────────
function StatsTab(): React.JSX.Element {
  const rows = useMemo(practiceStatRows, []);
  const [value, setValue] = useState("100");
  const v = parseCheatNumber(value);
  const entries = useMemo<CheatListEntry[]>(
    () => rows.map((r) => ({ id: r.key, name: r.label, tags: r.attr ? ["三圍"] : ["屬性"] })),
    [rows],
  );
  return (
    <div>
      <Section title="要設成多少（⛔ 空白不送；負值是允許的）">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ ...field, width: 100 }}
          aria-label="stat value"
          inputMode="numeric"
        />
        <span style={{ fontSize: 11, color: TEXT_DIM }}>點下面任一條 ⇒ 設成 {v ?? "?"}</span>
      </Section>
      <div style={label}>
        {rows.length} 條 —— ⭐ 從 Stat enum + 三圍推導。⚠️ 上限仍由 `config/stat-caps.json` 夾。
      </div>
      <PickList
        entries={entries}
        placeholder="搜尋屬性（力量／攻擊力／as…）…"
        onPick={(e) => v !== null && send(cheat.setStat(e.id, v))}
        render={(e) => (
          <span>
            {e.name}
            <span style={{ color: TEXT_DIM, fontSize: 10 }}> {e.id}</span>
          </span>
        )}
      />
    </div>
  );
}

// ── 分頁④ 技能 ──────────────────────────────────────────────────────────────
function AbilitiesTab(): React.JSX.Element {
  const [zeroCd, setZeroCd] = useState(false);
  const [infMana, setInfMana] = useState(false);
  const [god, setGod] = useState(false);
  return (
    <>
      <Section title="開關">
        <SfxButton
          onClick={() => {
            const n = !zeroCd;
            setZeroCd(n);
            send(cheat.zeroCooldown(n));
          }}
          style={zeroCd ? btnOn : btn}
          title="技能永遠不進冷卻"
        >
          {zeroCd ? "⚡ 冷卻歸零 ON" : "⚡ 冷卻歸零"}
        </SfxButton>
        <SfxButton
          onClick={() => {
            const n = !infMana;
            setInfMana(n);
            send(cheat.infiniteMana(n));
          }}
          style={infMana ? btnOn : btn}
          title="每 tick 補滿魔力。⭐ 冷卻不動 —— 要看耗魔技能的真實節奏就只開這一格。"
        >
          {infMana ? "🔵 無限魔力 ON" : "🔵 無限魔力"}
        </SfxButton>
        <SfxButton
          onClick={() => {
            const n = !god;
            setGod(n);
            send(cheat.godMode(n));
          }}
          style={god ? btnOn : btn}
        >
          {god ? "🛡 無敵 ON" : "🛡 無敵"}
        </SfxButton>
      </Section>

      <Section title="一次性">
        <SfxButton onClick={() => send(cheat.resetCooldowns())} style={btn}>
          冷卻立刻歸零
        </SfxButton>
        <SfxButton onClick={() => send(cheat.fullHeal())} style={btn}>
          補滿血魔
        </SfxButton>
        <SfxButton onClick={() => send(cheat.maxAbilities())} style={btn} title="學滿 Q/W/E/R 並解鎖 EX">
          技能全滿
        </SfxButton>
      </Section>

      <Section title="加一階">
        {(["Q", "W", "E", "R"] as const).map((s) => (
          <SfxButton key={s} onClick={() => send(cheat.rankAbility(s))} style={btn}>
            +{s}
          </SfxButton>
        ))}
      </Section>

      <Section title="指定施放 —— 朝自己面向">
        {PRACTICE_CAST_SLOTS.map((s) => (
          <SfxButton
            key={s}
            onClick={() => send(cheat.castAbility(s))}
            style={btn}
            title="走出貨的 castAbility：冷卻／魔力／沉默／射程照跑。被拒的理由會回到畫面上。"
          >
            ▶ {s}
          </SfxButton>
        ))}
      </Section>
      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 8 }}>
        ⚠️ 指定施放「不繞過」冷卻與魔力（繞過的話練習房測到的就不是真的技能）。要連放就先開上面兩格。
      </div>
    </>
  );
}

// ── 分頁⑤ 狀態 ──────────────────────────────────────────────────────────────
function StatusTab(): React.JSX.Element {
  const rows = useMemo(practiceStatusRows, []);
  const [secs, setSecs] = useState("10");
  const [off, setOff] = useState(false);
  const dur = parseCheatNumber(secs) ?? undefined;
  const entries = useMemo<CheatListEntry[]>(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        tags: [r.polarity ?? "", ...(r.effect === "" ? ["僅圖示"] : r.effect.split("·"))].filter(Boolean),
      })),
    [rows],
  );
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  return (
    <div>
      <Section title="模式">
        <SfxButton onClick={() => setOff(false)} style={off ? btn : btnOn}>
          掛上
        </SfxButton>
        <SfxButton onClick={() => setOff(true)} style={off ? btnOn : btn}>
          解除
        </SfxButton>
        <input
          value={secs}
          onChange={(e) => setSecs(e.target.value)}
          style={{ ...field, width: 64 }}
          aria-label="status seconds"
          inputMode="numeric"
          disabled={off}
        />
        <span style={{ fontSize: 11, color: TEXT_DIM }}>秒（解除時忽略）</span>
      </Section>
      <div style={label}>
        {rows.length} 種 —— ⭐ 從出貨的 status-effect@1 文件推導。
        <span style={{ color: "#c9a227" }}> ◇ = 掛上去只有 HUD 圖示，遊戲裡不會發生事。</span>
      </div>
      <PickList
        entries={entries}
        placeholder="搜尋狀態（暈眩／slow／debuff…）…"
        onPick={(e) => send(cheat.setStatus(e.id, !off, off ? undefined : dur))}
        render={(e) => {
          const r = byId.get(e.id);
          return (
            <span>
              {r?.hasMechanics === false ? "◇ " : ""}
              {e.name}
              <span style={{ color: TEXT_DIM, fontSize: 10 }}> {r?.effect}</span>
            </span>
          );
        }}
      />
    </div>
  );
}

// ── 分頁⑥ 殭屍 ──────────────────────────────────────────────────────────────
function MobsTab(): React.JSX.Element {
  const [count, setCount] = useState("");
  const [wave, setWave] = useState("10");
  const n = parseCheatNumber(count);
  const w = parseCheatNumber(wave);
  const suffix = n === null ? "" : ` ×${Math.max(1, Math.floor(n))}`;
  const c = n === null ? undefined : Math.max(1, Math.floor(n));
  return (
    <>
      <Section title="生成 N 隻（空白 = 用後台『生怪指令的預設數量』）">
        <input
          value={count}
          onChange={(e) => setCount(e.target.value)}
          placeholder="N"
          style={{ ...field, width: 72 }}
          aria-label="spawn count"
          inputMode="numeric"
        />
        <SfxButton onClick={() => send(cheat.spawnMob("normal", c))} style={btn}>
          一般殭屍{suffix}
        </SfxButton>
        <SfxButton onClick={() => send(cheat.spawnMob("special", c))} style={btn}>
          特殊殭屍{suffix}
        </SfxButton>
        <SfxButton onClick={() => send(cheat.spawnMob("boss", c))} style={btn}>
          殭屍王{suffix}
        </SfxButton>
      </Section>

      <Section title="指定波次 —— 把波次時鐘搬到「下一 tick 就是第 k 波」">
        <input
          value={wave}
          onChange={(e) => setWave(e.target.value)}
          style={{ ...field, width: 72 }}
          aria-label="wave index"
          inputMode="numeric"
        />
        <SfxButton
          onClick={() => w !== null && send(cheat.setWave(w))}
          style={btn}
          title="⚠️ 每一波幾隻仍由後台的 mobsPerWaveCap / maxAlivePerZone 決定"
        >
          跳到第 {w ?? "?"} 波
        </SfxButton>
      </Section>

      <Section title="場面">
        <SfxButton onClick={() => send(cheat.killEnemies())} style={btn}>
          清場（殺敵）
        </SfxButton>
        <SfxButton onClick={() => send(cheat.spawnFlower())} style={btn}>
          生成花朵
        </SfxButton>
      </Section>
      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 8 }}>
        ⚠️ 生怪一律吃每區同時存活上限；撞到上限會停下並回報「zone-full」。
      </div>
    </>
  );
}

const TAB_BODY: Readonly<Record<PracticeTabId, () => React.JSX.Element>> = {
  growth: GrowthTab,
  items: ItemsTab,
  stats: StatsTab,
  abilities: AbilitiesTab,
  status: StatusTab,
  mobs: MobsTab,
};

/** 六個分頁的內容。chrome（槽位／🐞 按鈕／backtick）在 `../CheatConsole.tsx`。 */
export function PracticePanel(): React.JSX.Element {
  const [tab, setTab] = useState<PracticeTabId>("growth");
  const Body = TAB_BODY[tab];
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "8px 0 2px" }}>
        {PRACTICE_TABS.map((t) => (
          <SfxButton
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...(t.id === tab ? btnOn : btn), padding: "5px 9px", minHeight: 30 }}
          >
            {t.label}
          </SfxButton>
        ))}
      </div>
      <Body />
    </div>
  );
}
