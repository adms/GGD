/**
 * 🔊 技能音效對照 —— 技能 → 施放音／特效發射音／命中音／落點音 的 live join；
 * 施放音欄可存（POST /__live/sfx-map/save → 技能文件的 sfxKey，GH#821 —— 產物由
 * genguard 在寫入端擋，訊息指名擁有者）。
 *
 * owner 2026-08-26（逐字）：「這些後台頁面的內容都要 **script 實時動態產生**，
 * **不是靜態內容**喔」⇒ 這一頁 mount 時 fetch `/__live/sfx-map`（dev-only vite
 * middleware，tools/admin-live/datasets/sfx-map.mjs 當場算），⛔ 不 build-time
 * import 任何 JSON、⛔ 不把資料抄進這個檔。
 *
 * 資料側只 join 不重算（第〇·四守則）：施放音＝ability doc 的 `sfxKey`；
 * 特效層＝config/vfx-families.json（abilities 覆寫 > families 原型）；
 * 模型音＝effects 的 spawnModelFx `soundKey`／`arriveSoundKey`。
 * 零綁定（三個通道全空）標紅 —— 那支技能只會發通用池的聲音。
 *
 * ⚠️ 設定的家：音量／冷卻／同時發聲數住 `content/config/audio-map.json`；
 * 特效音綁定住 `content/config/vfx-families.json`（⚠️ 產生器產物 —— 改來源，
 * 見 scripts/genguard.sh）。後台目前沒有這兩份的表單頁（混音頁管的是
 * config/audio-mix，不是這張表），所以這一頁不放「連去設定」的假連結。
 */
import { useEffect, useMemo, useState } from "react";
import { Panel, TextInput } from "../widgets";
import { DANGER, DANGER_BG, GOLD, OK, PANEL_BORDER, TEXT_DIM, TEXT_MAIN, WARN } from "../theme";
import { ReviewStrip } from "./ReviewStrip";
import { LiveEditCell } from "./LiveEditCell";

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

interface SoundHit {
  key: string;
  src: string; // 覆寫 | 家族
}

interface SfxRow {
  id: string;
  name: string;
  slot: string;
  champ: string;
  champName: string | null;
  cast: string | null;
  castSrc: "doc" | "overlay" | null;
  fam: string | null;
  launch: SoundHit | null;
  impact: SoundHit | null;
  loop: SoundHit | null;
  dissipate: SoundHit | null;
  model: { when: "launch" | "arrive"; key: string }[];
  sug: { key: string | null; tier: string | null; applicable: boolean; needsCueDeclaration: boolean } | null;
  bad: string[];
  silent: boolean;
}

interface SfxMapData {
  id: string;
  stats: {
    abilities: number;
    cast: number;
    vfxLaunch: number;
    vfxImpact: number;
    loopOrDissipate: number;
    modelSound: number;
    silent: number;
    broken: number;
    audioMapKeys: number;
    declaredCues: number;
    suggestionCensus: { overlay: number; sfxKey: number; element: number; generic: number } | null;
  };
  rows: SfxRow[];
  unported: { ability: string; name: string; champion: string; reservedCue: string | null }[];
  errors: string[];
  _live?: { computedAt: string; ms: number };
}

function Th(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <th
      style={{
        padding: "6px 8px",
        textAlign: "left",
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
  mono?: boolean;
  color?: string;
  title?: string;
}): React.JSX.Element {
  return (
    <td
      style={{
        padding: "5px 8px",
        borderTop: PANEL_BORDER,
        fontSize: 12.5,
        fontFamily: props.mono ? MONO : undefined,
        color: props.color ?? TEXT_MAIN,
        whiteSpace: "nowrap",
      }}
      title={props.title}
    >
      {props.children}
    </td>
  );
}

/** 一格「音效 key ＋ 來源」；key 壞掉（列在 bad 裡）畫紅。 */
function KeyCell(props: { hit: SoundHit | null; badKeys: Set<string> }): React.JSX.Element {
  if (props.hit === null) return <span style={{ color: TEXT_DIM }}>—</span>;
  const broken = props.badKeys.has(props.hit.key);
  return (
    <span style={{ fontFamily: MONO, color: broken ? DANGER : TEXT_MAIN }}>
      <ReviewStrip family={["sfx", "audio", "voice"]} title="技能音效" />
      {props.hit.key}
      <span style={{ color: TEXT_DIM, fontSize: 10, marginLeft: 4 }}>{props.hit.src}</span>
    </span>
  );
}

/** bad 訊息開頭都是「<通道> <key>（原因）」—— 撈出 key 集合給格子上色。 */
function badKeySet(row: SfxRow): Set<string> {
  const s = new Set<string>();
  for (const msg of row.bad) {
    const key = msg.split(" ")[1];
    if (key !== undefined) s.add(key.replace(/（.*$/, ""));
  }
  return s;
}

export function SfxMapPage(): React.JSX.Element {
  const [data, setData] = useState<SfxMapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [onlySilent, setOnlySilent] = useState(false);
  const [onlyBroken, setOnlyBroken] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    fetch("/__live/sfx-map")
      .then(async (res) => {
        const body: unknown = await res.json();
        if (!alive) return;
        const asErr = body as { error?: string };
        if (!res.ok || typeof asErr.error === "string") {
          setError(asErr.error ?? `HTTP ${res.status}`);
          return;
        }
        setData(body as SfxMapData);
      })
      .catch((err: unknown) => {
        if (alive) setError(String(err));
      });
    return () => {
      alive = false;
    };
  }, [reloadTick]);

  const rows = useMemo(() => {
    if (data === null) return [];
    const needle = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (onlySilent && !r.silent) return false;
      if (onlyBroken && r.bad.length === 0) return false;
      if (needle === "") return true;
      const hay = [
        r.id,
        r.name,
        r.champName ?? "",
        r.cast ?? "",
        r.fam ?? "",
        r.launch?.key ?? "",
        r.impact?.key ?? "",
        ...r.model.map((m) => m.key),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [data, q, onlySilent, onlyBroken]);

  if (error !== null) {
    return (
      <Panel title="🔊 技能音效對照">
        <div style={{ color: DANGER, fontFamily: MONO, fontSize: 13, whiteSpace: "pre-wrap" }}>
          /__live/sfx-map 載入失敗：{error}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setReloadTick((t) => t + 1)}
            style={{
              background: "transparent",
              border: PANEL_BORDER,
              color: TEXT_MAIN,
              borderRadius: 8,
              padding: "6px 14px",
              cursor: "pointer",
            }}
          >
            重試
          </button>
          <span style={{ color: TEXT_DIM, fontSize: 12, marginLeft: 10 }}>
            這一頁靠 dev server 的 /__live middleware（tools/admin-live/）—— production build 沒有它。
          </span>
        </div>
      </Panel>
    );
  }

  if (data === null) {
    return (
      <Panel title="🔊 技能音效對照">
        <div style={{ color: TEXT_DIM }}>載入中⋯（/__live/sfx-map 當場計算）</div>
      </Panel>
    );
  }

  const st = data.stats;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1420 }}>
      <Panel title={`🔊 技能音效對照（${st.abilities} 支技能）`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: TEXT_DIM, lineHeight: 1.7 }}>
            施放音＝技能文件 <code style={{ fontFamily: MONO }}>sfxKey</code>（沒填的執行期退回
            元素 whoosh → 通用 abilityCast 池，那條退路在 combatSfx.ts，這裡不重算）；
            發射／命中／循環／消散＝<code style={{ fontFamily: MONO }}>config/vfx-families.json</code>
            （逐支覆寫 &gt; 家族原型）；模型音＝effects 的 spawnModelFx{" "}
            <code style={{ fontFamily: MONO }}>soundKey</code>（施放）／
            <code style={{ fontFamily: MONO }}>arriveSoundKey</code>（落點）。
            每個 key 都對 audio-map（{st.audioMapKeys} 個）驗存在；施放音另對 cues 名單（
            {st.declaredCues} 個）驗。<span style={{ color: DANGER }}>紅列＝零綁定</span>
            （只發通用池聲音）。音量／冷卻設定住 content/config/audio-map.json（後台目前沒有它的表單頁）。
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
            <span>
              施放音 <b style={{ color: GOLD }}>{st.cast}</b>
            </span>
            <span>
              特效發射 <b style={{ color: TEXT_MAIN }}>{st.vfxLaunch}</b>
            </span>
            <span>
              特效命中 <b style={{ color: TEXT_MAIN }}>{st.vfxImpact}</b>
            </span>
            <span>
              循環/消散 <b style={{ color: TEXT_MAIN }}>{st.loopOrDissipate}</b>
            </span>
            <span>
              模型音 <b style={{ color: TEXT_MAIN }}>{st.modelSound}</b>
            </span>
            <span>
              零綁定 <b style={{ color: st.silent > 0 ? DANGER : OK }}>{st.silent}</b>
            </span>
            <span>
              壞引用 <b style={{ color: st.broken > 0 ? DANGER : OK }}>{st.broken}</b>
            </span>
            {st.suggestionCensus !== null && (
              <span style={{ color: TEXT_DIM }}>
                施放路徑普查（suggest_keys.py）：sfxKey {st.suggestionCensus.sfxKey} · 元素{" "}
                {st.suggestionCensus.element} · 通用池 {st.suggestionCensus.generic}
              </span>
            )}
          </div>
          {data.errors.length > 0 && (
            <div style={{ color: DANGER, fontSize: 12, fontFamily: MONO, whiteSpace: "pre-wrap" }}>
              資料側讀檔錯誤：{"\n"}
              {data.errors.join("\n")}
            </div>
          )}
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 320px" }}>
              <TextInput
                value={q}
                onChange={setQ}
                placeholder="過濾：技能 id / 名 / 英雄 / 音效 key…"
              />
            </div>
            <label style={{ fontSize: 12.5, color: TEXT_MAIN, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={onlySilent}
                onChange={(e) => setOnlySilent(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              只看零綁定
            </label>
            <label style={{ fontSize: 12.5, color: TEXT_MAIN, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={onlyBroken}
                onChange={(e) => setOnlyBroken(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              只看壞引用
            </label>
            <span style={{ fontSize: 12, color: TEXT_DIM }}>顯示 {rows.length} 列</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1240 }}>
              <thead>
                <tr>
                  <Th>技能 id</Th>
                  <Th>技能名</Th>
                  <Th>英雄</Th>
                  <Th>格</Th>
                  <Th>施放音</Th>
                  <Th>特效家族</Th>
                  <Th>發射音</Th>
                  <Th>命中音</Th>
                  <Th>循環/消散</Th>
                  <Th>模型音（施放/落點）</Th>
                  <Th>建議 cue</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bads = badKeySet(r);
                  return (
                    <tr
                      key={r.id}
                      style={r.silent ? { background: DANGER_BG } : undefined}
                      title={r.bad.length > 0 ? r.bad.join("\n") : undefined}
                    >
                      <Td mono color={r.silent ? DANGER : undefined}>
                        {r.id}
                      </Td>
                      <Td>{r.name}</Td>
                      <Td color={TEXT_DIM}>{r.champName ?? `（${r.champ} 未上架）`}</Td>
                      <Td mono>{r.slot}</Td>
                      <Td
                        mono
                        color={
                          r.cast === null ? TEXT_DIM : bads.has(r.cast) ? DANGER : GOLD
                        }
                        title={r.castSrc === "overlay" ? "來源：ability-sfx-cues.json bindings 覆蓋層（產物）—— ✏️ 存的是技能文件自己的 sfxKey（綁定真正的家）" : undefined}
                      >
                        {r.castSrc === "overlay" ? `${r.cast} ⧉ / doc:` : ""}
                        <LiveEditCell
                          dataset="sfx-map"
                          path={`content/abilities/${r.id}.json`}
                          pointer="/sfxKey"
                          current={r.castSrc === "doc" ? r.cast : null}
                          type="string"
                          nullable
                          onSaved={() => setReloadTick((t) => t + 1)}
                        />
                      </Td>
                      <Td mono color={TEXT_DIM}>
                        {r.fam ?? "—"}
                      </Td>
                      <Td>
                        <KeyCell hit={r.launch} badKeys={bads} />
                      </Td>
                      <Td>
                        <KeyCell hit={r.impact} badKeys={bads} />
                      </Td>
                      <Td>
                        {r.loop === null && r.dissipate === null ? (
                          <span style={{ color: TEXT_DIM }}>—</span>
                        ) : (
                          <span style={{ fontFamily: MONO, fontSize: 11.5 }}>
                            {r.loop !== null && <KeyCell hit={r.loop} badKeys={bads} />}
                            {r.loop !== null && r.dissipate !== null && " / "}
                            {r.dissipate !== null && <KeyCell hit={r.dissipate} badKeys={bads} />}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {r.model.length === 0 ? (
                          <span style={{ color: TEXT_DIM }}>—</span>
                        ) : (
                          <span style={{ fontFamily: MONO, fontSize: 11.5 }}>
                            {r.model.map((m, i) => (
                              <span key={`${m.when}-${m.key}-${i}`}>
                                {i > 0 && " · "}
                                <span style={{ color: TEXT_DIM }}>
                                  {m.when === "arrive" ? "落點:" : "施放:"}
                                </span>
                                <span style={{ color: bads.has(m.key) ? DANGER : TEXT_MAIN }}>
                                  {m.key}
                                </span>
                              </span>
                            ))}
                          </span>
                        )}
                      </Td>
                      <Td
                        mono
                        color={r.sug === null ? TEXT_DIM : r.sug.applicable ? OK : WARN}
                        title={
                          r.sug === null
                            ? undefined
                            : `tier: ${r.sug.tier ?? "?"}${r.sug.applicable ? "（可機械套用）" : "（要裁決）"}${r.sug.needsCueDeclaration ? "；cue 還沒進名單" : ""}`
                        }
                      >
                        {r.sug?.key ?? "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {data.unported.length > 0 && (
        <Panel title={`⏳ 未上架英雄的保留施放音（${data.unported.length} 支，tools/sfx-bind/UNPORTED_SFX_LEDGER.json）`}>
          <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 8 }}>
            JASS 掃到有施法音、但英雄還沒進 content 的技能 —— 英雄上架時把 reservedCue 寫進那支技能的
            sfxKey，這一列會自動消失。
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  <Th>技能</Th>
                  <Th>名稱</Th>
                  <Th>英雄</Th>
                  <Th>保留 cue</Th>
                </tr>
              </thead>
              <tbody>
                {data.unported.map((u) => (
                  <tr key={u.ability}>
                    <Td mono>{u.ability}</Td>
                    <Td>{u.name}</Td>
                    <Td mono color={TEXT_DIM}>
                      {u.champion}
                    </Td>
                    <Td mono color={GOLD}>
                      {u.reservedCue ?? "—"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <div style={{ fontSize: 11.5, color: TEXT_DIM, fontFamily: MONO }}>
        {data._live !== undefined
          ? `這一頁算於 ${new Date(data._live.computedAt).toLocaleString()} · 花 ${data._live.ms}ms（deps 沒動時回快取）`
          : "（_live 中繼資料缺席 —— middleware 版本不符？）"}
      </div>
    </div>
  );
}
