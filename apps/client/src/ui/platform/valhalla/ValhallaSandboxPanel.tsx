/**
 * ValhallaSandboxPanel — 英靈殿的「施展技能小模擬空間」畫面 (GH#254)。
 *
 * 三個東西合在一起：
 *   · 3D 舞台 —— `StorePreviewCanvas`（#129 的那一個，**沒有**開第二個 glb 載入器）
 *   · 真的 sim —— `ValhallaSandbox`（見那個檔的檔頭）
 *   · 六格技能按鈕 + 假人血條 + 浮動傷害數字
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 誠實地說：**技能特效（粒子）還沒有畫出來**
 * ---------------------------------------------------------------------------
 * 這一版畫得出來的是：3D 模型、假人血條、復活倒數、**真的傷害數字**、施法回饋
 * （#181 的「按了為什麼沒反應」）。畫不出來的是技能的粒子特效 —— 那需要
 * `render/ArenaScene` + `EntityViewRegistry` 那一整套，而它們掛在 `GameApp`
 * 上面（另一個 lane 的檔）。所以這個房間目前是**數值可信、特效缺席**。
 *
 * 這句話寫在這裡而不只寫在交接單裡，是因為 CLAUDE.md 第三守則：一個「看得到
 * 特效」的宣稱如果只活在 PR 描述裡，下一個人會相信它。
 *
 * ---------------------------------------------------------------------------
 * 「鏡頭永遠跟著人」
 * ---------------------------------------------------------------------------
 * 英雄站在畫面正中央而且**不會移動**（sim 那一側是結構性保證的），所以
 * `StorePreviewCanvas` 的自動取景器把他框在中間這件事本身就是「鏡頭跟著人」。
 * 這裡**不提供自由鏡頭**：canvas 的拖曳只轉模型，不會把人轉出畫面。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Champions } from "@ggd/shared/sim/content/registry";
import { TICK_MS } from "@ggd/shared/constants";
import type { CastableSlot, CastResult, CombatEnvMultipliers } from "@ggd/shared/sim";
import type { ChampionId } from "@ggd/shared/ids";
import { StorePreviewCanvas } from "../StorePreviewCanvas";
import { championDisplayFor } from "../championDisplay";
import { ACCENT } from "../widgets";
import { GOLD, TEXT_DIM, TEXT_MAIN } from "../../theme";
import { ValhallaSandbox, type SandboxFrame } from "./valhallaSandbox";
import { DEFAULT_VALHALLA_SANDBOX, type ValhallaSandboxRules } from "./valhallaSandboxRules";
import { DECLARATION_PROVENANCE_NOTE, playValhallaDeclaration } from "./valhallaDeclaration";

/** 六格的顯示順序 —— owner 的規矩是 天生技 / Q / W / E / R / EX（#192）。 */
const SLOT_ORDER: readonly CastableSlot[] = ["PASSIVE", "Q", "W", "E", "R", "EX"];

/** 鍵盤對應。天生技沿用戰鬥中的 D，EX 沿用 F。 */
const KEY_TO_SLOT: Readonly<Record<string, CastableSlot>> = {
  q: "Q",
  w: "W",
  e: "E",
  r: "R",
  f: "EX",
  d: "PASSIVE",
};

const SLOT_LABEL: Readonly<Record<CastableSlot, string>> = {
  PASSIVE: "天生",
  Q: "Q",
  W: "W",
  E: "E",
  R: "R",
  EX: "EX",
};

/** #181：每一次按下去都要有回話，包括「為什麼沒發生」。 */
const CAST_REASON: Readonly<Record<CastResult, string>> = {
  ok: "",
  "not-learned": "這一格還沒學",
  dead: "英雄倒下了",
  stunned: "被控制中",
  silenced: "被沉默",
  cooldown: "冷卻中",
  "no-mana": "魔力不足",
  "out-of-range": "距離太遠",
  "bad-target": "沒有合法目標",
  passive: "這是永久被動，沒有東西可以施放",
  // 暴走系主動技（59-001 完全暴走）：血夠低才按得下去。門檻是後台欄位
  // `world.berserkRules.castHpPct`（出貨 15%），見
  // packages/shared/src/sim/abilities/berserkRules.ts。
  "hp-too-high": "血還太多 —— 生命 15% 以下才放得出來",
  recovery: "上一發打空了，後搖中",
};

interface FloatingNumber {
  id: number;
  amount: number;
  /** 出現在血條上方的水平偏移（%），純視覺 */
  offset: number;
}

export function ValhallaSandboxPanel({
  championId,
  combatEnv,
  rules = DEFAULT_VALHALLA_SANDBOX,
  onClose,
  paused = false,
}: {
  championId: string;
  combatEnv?: CombatEnvMultipliers;
  rules?: ValhallaSandboxRules;
  onClose: () => void;
  paused?: boolean;
}): React.JSX.Element {
  const def = Champions.tryGet(championId as ChampionId);
  const display = championDisplayFor(championId);
  const sandboxRef = useRef<ValhallaSandbox | null>(null);
  const [frame, setFrame] = useState<SandboxFrame | null>(null);
  const [notice, setNotice] = useState<string>("");
  const [floats, setFloats] = useState<FloatingNumber[]>([]);
  const floatSeq = useRef(0);

  // 一個沙盒 = 一隻英雄。換英雄就整個重建（world 是有狀態的，重用會把上一隻的
  // buff / 冷卻 / 假人血量帶過來 —— 那正是「試放空間會說謊」的第一種方式）。
  useEffect(() => {
    if (!def) {
      sandboxRef.current = null;
      setFrame(null);
      return;
    }
    const sb = new ValhallaSandbox({ championId, rules, combatEnv });
    sandboxRef.current = sb;
    setFrame(sb.snapshot());
    setFloats([]);
    return () => {
      sb.dispose();
      sandboxRef.current = null;
    };
  }, [championId, def, rules, combatEnv]);

  // 30Hz 的步進迴圈。暫停（分頁在背景 / 面板收起來）時整個停掉 —— 一個沒有人在
  // 看的房間不該繼續燒 CPU。
  useEffect(() => {
    if (paused || !sandboxRef.current) return;
    const timer = window.setInterval(() => {
      const sb = sandboxRef.current;
      if (!sb) return;
      const f = sb.step();
      setFrame(f);
      if (f.dummyHits.length > 0) {
        setFloats((prev) => {
          const added = f.dummyHits.map((amount) => ({
            id: ++floatSeq.current,
            amount,
            // 位移只是為了讓同一 tick 的多發不重疊；不是資料
            offset: ((floatSeq.current * 37) % 60) - 30,
          }));
          // 上限 12 個，超過就丟掉最舊的 —— 一發 AoE 打出 30 個數字會把面板撐爆
          return [...prev, ...added].slice(-12);
        });
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [paused, championId, def]);

  // 浮動數字的壽命。用 wall-clock 是對的：它是**表演**，不是 sim 狀態。
  useEffect(() => {
    if (floats.length === 0) return;
    const timer = window.setTimeout(() => setFloats((prev) => prev.slice(1)), 900);
    return () => window.clearTimeout(timer);
  }, [floats]);

  const doCast = useCallback((slot: CastableSlot) => {
    const sb = sandboxRef.current;
    if (!sb) return;
    const result = sb.cast(slot);
    // #181：ok 也要回話（一聲「放出去了」），失敗更要說出原因。
    setNotice(result === "ok" ? `${SLOT_LABEL[slot]} 施放` : `${SLOT_LABEL[slot]}：${CAST_REASON[result]}`);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const slot = KEY_TO_SLOT[e.key.toLowerCase()];
      if (!slot) return;
      e.preventDefault();
      doCast(slot);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doCast]);

  const declare = useCallback(() => {
    void playValhallaDeclaration(championId);
  }, [championId]);

  const rows = useMemo(
    () =>
      SLOT_ORDER.map((slot) => ({
        slot,
        label: SLOT_LABEL[slot],
        cooldown: frame?.cooldownTicks[slot] ?? 0,
      })),
    [frame],
  );

  if (!def || !frame) {
    return (
      <div data-ggd-valhalla-sandbox="unavailable" style={{ color: TEXT_DIM, fontSize: 12, padding: 12 }}>
        英靈殿試放空間整備中…
      </div>
    );
  }

  const hpPct = frame.dummyMaxHp > 0 ? Math.max(0, frame.dummyHp / frame.dummyMaxHp) : 0;
  const respawnIn =
    frame.dummyRespawnAtTick === null
      ? null
      : Math.max(0, ((frame.dummyRespawnAtTick - frame.tick) * TICK_MS) / 1000);

  return (
    <div
      data-ggd-valhalla-sandbox={championId}
      // 沙盒的真實狀態公布到 DOM，讓截圖/自動化答得出「假人現在幾滴血」
      data-ggd-sandbox-dummy-hp={Math.round(frame.dummyHp)}
      data-ggd-sandbox-dummy-alive={frame.dummyAlive ? "1" : "0"}
      data-ggd-sandbox-hero-pos={`${frame.heroPos.x.toFixed(3)},${frame.heroPos.z.toFixed(3)}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        border: `1px solid ${ACCENT}55`,
        borderRadius: 10,
        padding: 8,
        background: "#0e1219",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>⚔ 技能試放空間</span>
        <span style={{ fontSize: 11, color: TEXT_MAIN, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {display.fullName}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          data-ggd-valhalla-declare=""
          onClick={declare}
          title={DECLARATION_PROVENANCE_NOTE}
          style={chip}
        >
          🔊 宣言
        </button>
        <button type="button" data-ggd-valhalla-sandbox-close="" onClick={onClose} style={chip}>
          離開 ✕
        </button>
      </div>

      {/* 3D 舞台。人不會移動 → 自動取景器把他框在正中央 = 「鏡頭永遠跟著人」。 */}
      <div style={{ position: "relative", height: 200, borderRadius: 8, overflow: "hidden", background: "#0a0d13" }}>
        <StorePreviewCanvas
          modelKey={def.modelKey ?? null}
          championId={championId}
          paused={paused}
          hideEmptyHint
          minHeight={200}
        />
        {/* 浮動傷害數字。⚠️ 這是 DOM 疊層，不是 3D 世界裡的數字 —— 技能粒子特效
            還沒接（見檔頭）。數字本身讀的是真的 `damage` 事件。 */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {floats.map((f) => (
            <div
              key={f.id}
              data-ggd-sandbox-damage={Math.round(f.amount)}
              style={{
                position: "absolute",
                left: `calc(50% + ${f.offset}px)`,
                top: 40,
                color: "#ffd479",
                fontWeight: 800,
                fontSize: 15,
                textShadow: "0 1px 3px #000",
              }}
            >
              {Math.round(f.amount)}
            </div>
          ))}
        </div>
      </div>

      {/* 假人 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11, color: TEXT_DIM }}>
          <span>🎯 假人</span>
          <span style={{ color: TEXT_MAIN, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(frame.dummyHp).toLocaleString()} / {frame.dummyMaxHp.toLocaleString()}
          </span>
          <div style={{ flex: 1 }} />
          {respawnIn !== null && <span style={{ color: "#ff9a9a" }}>{respawnIn.toFixed(1)} 秒後補滿</span>}
        </div>
        <div style={{ height: 8, background: "#1b2233", borderRadius: 4, overflow: "hidden" }}>
          <div
            data-ggd-sandbox-dummy-bar={hpPct.toFixed(4)}
            style={{
              height: "100%",
              width: `${(hpPct * 100).toFixed(2)}%`,
              background: frame.dummyAlive ? "linear-gradient(90deg,#4ad07a,#8ae6a8)" : "#3a3f4c",
              transition: "width 80ms linear",
            }}
          />
        </div>
      </div>

      {/* 六格 */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {rows.map((r) => (
          <button
            key={r.slot}
            type="button"
            data-ggd-sandbox-slot={r.slot}
            onClick={() => doCast(r.slot)}
            style={{
              ...chip,
              minWidth: 48,
              opacity: r.cooldown > 0 ? 0.5 : 1,
              borderColor: r.cooldown > 0 ? "#3a3f4c" : `${ACCENT}77`,
            }}
          >
            {r.label}
            {r.cooldown > 0 && (
              <span style={{ marginLeft: 4, color: TEXT_DIM, fontVariantNumeric: "tabular-nums" }}>
                {((r.cooldown * TICK_MS) / 1000).toFixed(1)}s
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ minHeight: 15, fontSize: 11, color: notice.includes("：") ? "#ff9a9a" : TEXT_DIM }}>
        {notice || "按 Q / W / E / R / F(EX) / D(天生技)，或直接點上面的按鈕。人不會移動。"}
      </div>
    </div>
  );
}

/** 刻意**不是** `Btn` —— `Btn` 帶 #24 的 hover/click 音效，大廳裡會很吵。 */
const chip: React.CSSProperties = {
  border: `1px solid ${ACCENT}77`,
  background: "transparent",
  color: TEXT_MAIN,
  borderRadius: 6,
  padding: "2px 9px",
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap",
  flexShrink: 0,
};
