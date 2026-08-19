/**
 * 新英雄模板 — the owner's spec step 3: author a brand-new champion from a
 * fill-in template in the UI (mirroring the 新英雄完整模板 doc). DEV-ONLY, mounted
 * inside ContentPage's dev chunk so the gate is untouched.
 *
 * ── WHY THIS IS NOT ContentPage's inline ＋新增 ──────────────────────────────
 * champions is create-ONLY through here (not the inline box) because a champion
 * is never one document: its Q/W/E/R are EMBEDDED, its EX and 天生技 are HARD
 * REFS to standalone ability docs, and the content-api's per-doc /validate is
 * schema-only (refs are checked later by content:build). A single-doc champion
 * create would dangle those refs and break the bundle build. So the wizard
 * emits the standalone twins too (heroTemplate.buildHeroDocs), validates ALL of
 * them (validate-all-then-write), then POSTs abilities-BEFORE-champion so the
 * champion's refs already resolve. Every write rides the SAME contentApi gate.
 */
import { useEffect, useMemo, useState } from "react";
import type { ContentEditApi, EditIssue } from "../contentApi";
import { createContentEditApi } from "../contentApi";
import {
  CAST_TYPES,
  blankHeroForm,
  buildHeroDocs,
  emptyNewHeroContext,
  heroDocWarnings,
  loadNewHeroContext,
  type AbilityRow,
  type CastType,
  type HeroTemplateForm,
  type NewHeroContext,
} from "../heroTemplate";
import type { CoreSlot } from "@ggd/shared/content/editModel";
import { Btn, ErrorBanner, Panel, TextInput } from "./widgets";
import { DANGER, GOLD, OK, TEXT_DIM, TEXT_MAIN } from "./theme";

/** The nav entry — lives in this dev chunk so a prod build lacks even the label. */
export const NEWHERO_NAV = { page: "newHero", label: "新英雄模板", emoji: "✨" } as const;

/** The base-stat keys offered as labelled inputs (Stat enum string values). */
const STAT_FIELDS: readonly { key: string; label: string }[] = [
  { key: "maxHealth", label: "生命" },
  { key: "maxMana", label: "魔力" },
  { key: "ad", label: "攻擊力" },
  { key: "ap", label: "法強" },
  { key: "armor", label: "護甲" },
  { key: "mr", label: "魔抗" },
  { key: "as", label: "攻速" },
  { key: "ms", label: "移速" },
  { key: "range", label: "攻擊距離" },
];

export interface NewHeroPageProps {
  api: ContentEditApi;
  /** deep-link into 英雄管理 with the new id selected after a successful create */
  onNavigate?: (page: string, selectId?: string) => void;
}

/** Dev-chunk root: constructs the write API here (never in the shell). */
export function NewHeroPageRoot(props: { onNavigate?: (page: string, selectId?: string) => void }): React.JSX.Element {
  const api = useMemo(() => createContentEditApi(), []);
  return <NewHeroPage api={api} onNavigate={props.onNavigate} />;
}

type Tone = "ok" | "err";

export function NewHeroPage({ api, onNavigate }: NewHeroPageProps): React.JSX.Element {
  const [form, setForm] = useState<HeroTemplateForm>(blankHeroForm);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; tone: Tone } | null>(null);
  const [issues, setIssues] = useState<readonly { where: string; issue: EditIssue }[]>([]);
  /**
   * ⭐【GH#480】六欄的**生成代入**所需的語料與開關。
   * ⚠️ 讀不到就是 `corpus: []`，而那一刻六欄**一格都不代入**（見 heroTemplate
   * 的註解：⛔ 不可以拿沒有出處的保守值假裝成量出來的中位數），
   * 錯誤逐條印在下面 —— fail-open 沒錯，靜默才是缺陷。
   */
  const [ctx, setCtx] = useState<NewHeroContext>(emptyNewHeroContext);
  useEffect(() => {
    let alive = true;
    void loadNewHeroContext().then((c) => {
      if (alive) setCtx(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  const docs = useMemo(() => buildHeroDocs(form, ctx), [form, ctx]);
  /**
   * ⭐【GH#480】六欄／十一項屬性的警示 —— **按下建立的那一刻**算，⛔ 不等 content:build。
   * ⛔ 它不擋（owner：「只是個警告標記，並不會擋」），所以建立照樣往下走。
   * ⭐ 走 `ctx.checks`＝後台「新英雄檢查警示」那一頁存的開關，⛔ 不是寫死的出貨值。
   */
  const warnings = useMemo(() => heroDocWarnings(docs, ctx.checks), [docs, ctx.checks]);

  const set = <K extends keyof HeroTemplateForm>(key: K, value: HeroTemplateForm[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  const setStat = (which: "baseStats" | "growth", key: string, raw: string): void =>
    setForm((f) => {
      const next: Record<string, number> = { ...f[which] };
      const trimmed = raw.trim();
      if (trimmed === "") delete next[key];
      else {
        const n = Number(trimmed);
        if (Number.isFinite(n)) next[key] = n;
      }
      return { ...f, [which]: next };
    });

  const setRow = (slot: "q" | "w" | "e" | "r" | "ex" | "passive", patch: Partial<AbilityRow>): void =>
    setForm((f) => {
      const cur = (f[slot] as AbilityRow | null) ?? { name: "", castType: "self", maxRank: 1, cooldown: 0, manaCost: 0, range: 0 };
      return { ...f, [slot]: { ...cur, ...patch } };
    });

  const toggleOptional = (slot: "ex" | "passive", on: boolean): void =>
    setForm((f) => ({
      ...f,
      [slot]: on ? { name: "", castType: "self" as CastType, maxRank: 1, cooldown: 0, manaCost: 0, range: 0 } : null,
    }));

  const submit = (): void => {
    const id = form.id.trim();
    if (id === "") {
      setStatus({ text: "請先填英雄 id。", tone: "err" });
      return;
    }
    if (form.modelKey.trim() === "") {
      setStatus({ text: "請填 modelKey（模型 key）— 空的會讓打包驗證 modelKey dangling。", tone: "err" });
      return;
    }
    setBusy(true);
    setStatus(null);
    setIssues([]);
    void (async () => {
      // ⭐ 送出去的就是畫面上被檢查過的那一批（含六欄代入），⛔ 不重建一份 ——
      //   重建一份 = 「被驗的不是出貨的那個」（失敗形態⑤）。
      // 1. validate-all-then-write: every doc through the schema dry-run first.
      const found: { where: string; issue: EditIssue }[] = [];
      let transport: string | null = null;
      for (const d of docs) {
        const r = await api.validate(d.collection, d.id, d.doc);
        if (r.error !== null) transport = r.error;
        for (const issue of r.issues) found.push({ where: `${d.collection}/${d.id}`, issue });
      }
      if (transport !== null) {
        setBusy(false);
        setStatus({ text: transport, tone: "err" });
        return;
      }
      if (found.length > 0) {
        setBusy(false);
        setIssues(found);
        setStatus({ text: `${found.length} 個欄位不符合 schema，尚未建立任何檔案。`, tone: "err" });
        return;
      }
      // 2. create abilities-BEFORE-champion (POST=201, refuses to clobber) so
      //    the champion's exAbility/passiveAbility/embedded refs already resolve.
      for (const d of docs) {
        const r = await api.create(d.collection, d.id, d.doc);
        if (!r.ok) {
          setBusy(false);
          const detail = r.issues.length > 0 ? r.issues.map((i) => `${i.path} ${i.message}`).join("；") : r.error;
          setStatus({
            text: `建立 ${d.collection}/${d.id} 失敗：${detail ?? "未知錯誤"}（前面的檔案已建立，可到對應清單刪除重試）。`,
            tone: "err",
          });
          return;
        }
      }
      setBusy(false);
      setStatus({ text: `已建立英雄 ${id} 及其技能。轉到英雄管理繼續編輯…`, tone: "ok" });
      onNavigate?.("champions", id);
    })();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, color: TEXT_MAIN }}>新英雄模板</h2>
        <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 6, lineHeight: 1.7 }}>
          從模板建立全新英雄：會一次產生 champion 文件與其 Q/W/E/R（＋可選的 EX／天生技）
          standalone 技能文件，全部先經過 schema 驗證，再依「先技能後英雄」的順序寫入，
          走的是與內容編輯相同的 content-api 閘門。成功後轉到英雄管理繼續細調。
        </div>
      </div>

      {!api.enabled && <ErrorBanner text={api.offMessage} />}

      <Panel title="識別">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Labeled label="id（檔名即 id）">
            <TextInput value={form.id} onChange={(v) => set("id", v)} placeholder="godie-xxxx" />
          </Labeled>
          <Labeled label="名稱 name">
            <TextInput value={form.name} onChange={(v) => set("name", v)} />
          </Labeled>
          <Labeled label="定位 role">
            <TextInput value={form.role} onChange={(v) => set("role", v)} placeholder="fighter / mage …" />
          </Labeled>
          <Labeled label="攻擊類型 attackType">
            <select
              value={form.attackType}
              onChange={(e) => set("attackType", e.target.value as "melee" | "ranged")}
              style={selectStyle}
            >
              <option value="melee">melee</option>
              <option value="ranged">ranged</option>
            </select>
          </Labeled>
          <Labeled label="modelKey">
            <TextInput value={form.modelKey} onChange={(v) => set("modelKey", v)} placeholder="champ.xxxx" />
          </Labeled>
          <Labeled label="icon（選填，需 assets/ 開頭）">
            <TextInput value={form.icon ?? ""} onChange={(v) => set("icon", v)} />
          </Labeled>
          <Labeled label="標籤 tags（逗號分隔）">
            <TextInput value={form.tags.join(", ")} onChange={(v) => set("tags", splitList(v))} />
          </Labeled>
          <Labeled label="加點順序 skillOrder">
            <TextInput
              value={form.skillOrder.join(", ")}
              onChange={(v) => set("skillOrder", splitList(v).filter(isSlot))}
              placeholder="Q, W, E, R"
            />
          </Labeled>
          <Labeled label="推薦出裝 buildPriority（items id）">
            <TextInput value={form.buildPriority.join(", ")} onChange={(v) => set("buildPriority", splitList(v))} />
          </Labeled>
        </div>
      </Panel>

      <Panel title="基礎數值 / 每級成長（皆選填，空白代表不設）">
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 11, color: GOLD }}>屬性</div>
          <div style={{ fontSize: 11, color: GOLD }}>baseStats</div>
          <div style={{ fontSize: 11, color: GOLD }}>growth（每級）</div>
          {STAT_FIELDS.map((s) => (
            <StatRow
              key={s.key}
              label={s.label}
              base={form.baseStats[s.key]}
              growth={form.growth[s.key]}
              onBase={(v) => setStat("baseStats", s.key, v)}
              onGrowth={(v) => setStat("growth", s.key, v)}
            />
          ))}
        </div>
      </Panel>

      <Panel title="技能">
        {(["q", "w", "e", "r"] as const).map((slot) => (
          <AbilityRowEditor
            key={slot}
            title={slot.toUpperCase()}
            row={form[slot]}
            onChange={(patch) => setRow(slot, patch)}
          />
        ))}
        <OptionalAbility
          title="EX 技能"
          row={form.ex}
          onToggle={(on) => toggleOptional("ex", on)}
          onChange={(patch) => setRow("ex", patch)}
        />
        <OptionalAbility
          title="天生技 PASSIVE"
          row={form.passive}
          onToggle={(on) => toggleOptional("passive", on)}
          onChange={(patch) => setRow("passive", patch)}
        />
      </Panel>

      {/*
        ⭐【GH#480】六欄代入的**預覽**。
        ⚠️ 它讀的是 `docs` —— 也就是按下建立時真的會被寫出去的那一批文件，
        ⛔ 不是另外算一次。表單上那幾格 0 不是最後的值，少了這一塊，操作者會
        以為他建出來的技能六欄全是 0（而那正是這一票在修的東西）。
      */}
      <Panel title="六欄生成代入（說明 · 施展距離 · 範圍 · 傷害 · 冷卻 · 耗魔）">
        <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 8, lineHeight: 1.7 }}>
          {ctx.corpus.length === 0
            ? "⛔ 還沒讀到技能語料 —— 六欄不會自動代入，留白的格子會照原樣（0／空）寫出去。⚠️ 這裡刻意不拿一組保守值頂替：一個沒有出處的數字和量出來的中位數在畫面上長得一模一樣。"
            : `✅ 語料 ${ctx.corpus.length} 支出貨技能。空著的格子會用「同槽位＋同施放型態」的中位數代入（樣本不足就往上退到同槽位／全語料）；作者填過的一格都不動。${ctx.checks.autofillDescription ? "說明由同一組數字生成，所以它與 JSON 依構造一致。" : "⚠️ 後台把「自動代入技能說明」關掉了，所以【說明】那一欄會留白。"}`}
        </div>
        {ctx.errors.map((e, n) => (
          <div key={`ctxerr-${n}`} style={{ fontSize: 12, color: DANGER }}>
            {e}
          </div>
        ))}
        <div style={{ display: "grid", gap: 4 }}>
          {docs
            .filter((d) => d.collection === "abilities")
            .map((d) => (
              <div key={d.id} style={{ fontSize: 11, color: TEXT_DIM }}>
                <code style={{ color: GOLD }}>{String(d.doc["slot"] ?? "")}</code>{" "}
                冷卻 {String((d.doc["cooldown"] as number[] | undefined)?.[0] ?? 0)} 秒 · 耗魔{" "}
                {String((d.doc["manaCost"] as number[] | undefined)?.[0] ?? 0)} · 施展距離{" "}
                {String(d.doc["range"] ?? 0)} · 範圍 {String(d.doc["radius"] ?? "—")} · 傷害效果{" "}
                {String((d.doc["effects"] as unknown[] | undefined)?.length ?? 0)} 個
                {typeof d.doc["description"] === "string" && d.doc["description"] !== "" ? " · 說明✅" : " · 說明⛔"}
              </div>
            ))}
        </div>
      </Panel>

      {warnings.length > 0 && (
        <Panel title={`⚠️ 六欄與十一項屬性檢查（${warnings.length} 條 · 只警告不擋）`}>
          <div style={{ display: "grid", gap: 6 }}>
            {warnings.map((w, n) => (
              <div key={`${w.doc}:${w.rule}:${w.field}:${n}`} style={{ fontSize: 12, color: w.level === "block" ? DANGER : GOLD }}>
                <code style={{ color: GOLD }}>{w.doc}</code> <code>{w.field}</code>{" "}
                <span style={{ color: TEXT_DIM }}>[{w.rule}]</span> — {w.message}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {issues.length > 0 && (
        <Panel title="Schema 驗證問題（尚未建立任何檔案）">
          <div style={{ display: "grid", gap: 6 }}>
            {issues.map(({ where, issue }, n) => (
              <div key={`${where}:${issue.path}:${n}`} style={{ fontSize: 12, color: DANGER }}>
                <code style={{ color: GOLD }}>{where}</code>{" "}
                <code>{issue.path === "" ? "(整份)" : issue.path}</code> — {issue.message}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Btn kind="primary" onClick={submit} disabled={busy || !api.enabled}>
          建立英雄
        </Btn>
        {status !== null && (
          <span style={{ fontSize: 12, color: status.tone === "ok" ? OK : DANGER }}>{status.text}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const selectStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 9px",
  borderRadius: 7,
  border: "1px solid #2c3448",
  background: "#10141f",
  color: TEXT_MAIN,
  fontSize: 12,
};

function Labeled(props: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: TEXT_DIM }}>{props.label}</span>
      {props.children}
    </label>
  );
}

function StatRow(props: {
  label: string;
  base: number | undefined;
  growth: number | undefined;
  onBase: (v: string) => void;
  onGrowth: (v: string) => void;
}): React.JSX.Element {
  return (
    <>
      <div style={{ fontSize: 12, color: TEXT_DIM }}>{props.label}</div>
      <input value={props.base ?? ""} onChange={(e) => props.onBase(e.target.value)} style={selectStyle} inputMode="decimal" />
      <input value={props.growth ?? ""} onChange={(e) => props.onGrowth(e.target.value)} style={selectStyle} inputMode="decimal" />
    </>
  );
}

function numInput(value: number, onChange: (n: number) => void): React.JSX.Element {
  return (
    <input
      value={String(value)}
      onChange={(e) => {
        const n = Number(e.target.value.trim());
        if (Number.isFinite(n)) onChange(n);
      }}
      style={selectStyle}
      inputMode="decimal"
    />
  );
}

function AbilityRowEditor(props: {
  title: string;
  row: AbilityRow;
  onChange: (patch: Partial<AbilityRow>) => void;
}): React.JSX.Element {
  const { row, onChange } = props;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "40px 1.4fr 1fr 0.7fr 0.8fr 0.8fr 0.8fr", gap: 6, alignItems: "center", marginBottom: 6 }}>
      <div style={{ fontSize: 12, color: GOLD, fontWeight: 700 }}>{props.title}</div>
      <TextInput value={row.name} onChange={(v) => onChange({ name: v })} placeholder="名稱" />
      <select value={row.castType} onChange={(e) => onChange({ castType: e.target.value as CastType })} style={selectStyle}>
        {CAST_TYPES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {numInput(row.maxRank, (n) => onChange({ maxRank: Math.max(1, Math.round(n)) }))}
      {numInput(row.cooldown, (n) => onChange({ cooldown: n }))}
      {numInput(row.manaCost, (n) => onChange({ manaCost: n }))}
      {numInput(row.range, (n) => onChange({ range: n }))}
    </div>
  );
}

function OptionalAbility(props: {
  title: string;
  row: AbilityRow | null;
  onToggle: (on: boolean) => void;
  onChange: (patch: Partial<AbilityRow>) => void;
}): React.JSX.Element {
  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontSize: 12, color: TEXT_DIM, display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
        <input type="checkbox" checked={props.row !== null} onChange={(e) => props.onToggle(e.target.checked)} />
        啟用{props.title}
      </label>
      {props.row !== null && <AbilityRowEditor title={props.title.slice(0, 2)} row={props.row} onChange={props.onChange} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function splitList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function isSlot(s: string): s is CoreSlot {
  return s === "Q" || s === "W" || s === "E" || s === "R";
}
