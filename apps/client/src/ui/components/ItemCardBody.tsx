/**
 * ItemCardBody — 一段道具 description 的**唯一**渲染器。
 *
 * owner 2026-08-02:「卡片道具的排版連在一起不好閱讀，關於效果及數值的部分應該要
 * 特殊顏色表示」。他點名的四個地方全部走這個元件:
 *
 *   ① 商店卡片          `panels/MerchantShop.tsx`
 *   ② 三選一抽卡        `panels/AugmentDraftPanel.tsx`
 *   ③ 裝備欄 hover 詳情  `hud/EquipmentBar.tsx`(#140)
 *   ④ 圖鑑/後台         `codex/CodexDetail.tsx`
 *
 * ⛔ **它不會改 owner 的文案一個字。** 49 支傳說武器的 description 是 owner 手寫
 * 的規格,`legendary49OwnerText.test.ts` 逐位元組比對。所以排版全部發生在渲染那
 * 一刻:`parseItemCard` 把原文切成 token,這裡只負責上色與斷行。
 *
 * ── 為什麼「斷行」和「上色」一樣是需求的一半 ────────────────────────────────
 * owner 說的是「連在一起」。在這個元件之前,商店那一列走
 * `panels/itemStats.effectLine`,它把效能區**每一行用 ` · ` 接成一整條**;黃金聖
 * 鬥衣的五行效能會變成一句 60 字的長句。所以這裡一行就是一列 `<div>`,而且
 * chip 用 `display:inline-block` + `white-space:nowrap`,長行折行時標記不會被拆開。
 *
 * ── 顏色從哪來 ──────────────────────────────────────────────────────────────
 * `itemCardTheme.getItemCardConfig()`,也就是 `content/config/item-card.json`。
 * 這個元件裡**沒有任何 hex 字面值** —— 有的話 owner 想換色就要 rebuild。
 */
import type { CSSProperties } from "react";
import { parseItemCard, type ItemCard, type ItemCardToken } from "@ggd/shared/content";
import { getItemCardConfig } from "./itemCardTheme";

export interface ItemCardBodyProps {
  /** owner 手寫的原文。undefined/空字串 → 什麼都不畫。 */
  description: string | null | undefined;
  /** 要不要畫 `解說` 那一段。hover tooltip 這種矮的地方可以關掉。 */
  showLore?: boolean;
  /** 基礎字級(px)。chip 與數值都相對它縮放,所以一個參數就能換場合。 */
  fontSize?: number;
  /** 一般文字的顏色(由呼叫端的面板決定,因為四個面板的底色不同)。 */
  textColor?: string;
  style?: CSSProperties;
}

/** chip 的底是它自己的顏色壓到很暗 —— 只有 8 個 hex 位元,不需要色彩函式庫。 */
function chipBackground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.14)`;
}

function Token({
  token,
  fontSize,
}: {
  token: ItemCardToken;
  fontSize: number;
}): React.JSX.Element {
  const cfg = getItemCardConfig();
  if (token.kind === "tag") {
    const color = cfg.categories[token.category].color;
    return (
      <span
        // 分類名進 title,因為 chip 上只放標記本身(放兩個詞就又「連在一起」了)。
        title={cfg.categories[token.category].label}
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          color,
          background: chipBackground(color),
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: "0 5px",
          marginRight: 5,
          fontSize: Math.round(fontSize * 0.92),
          fontWeight: 700,
          lineHeight: 1.5,
        }}
      >
        {token.text}
      </span>
    );
  }
  if (token.kind === "num") {
    return <span style={{ color: cfg.numberColor, fontWeight: 700 }}>{token.text}</span>;
  }
  return <>{token.text}</>;
}

export function ItemCardBody({
  description,
  showLore = true,
  fontSize = 12,
  textColor = "#c3cbdd",
  style,
}: ItemCardBodyProps): React.JSX.Element | null {
  const cfg = getItemCardConfig();
  const card: ItemCard = parseItemCard(description, cfg);
  if (card.efficacy.length === 0 && card.lore.length === 0 && card.rarity === null) return null;
  return (
    <div style={{ fontSize, lineHeight: 1.6, color: textColor, ...style }}>
      {card.rarity !== null && (
        <div
          style={{
            display: "inline-block",
            fontSize: Math.round(fontSize * 0.88),
            letterSpacing: "0.08em",
            color: cfg.loreColor,
            border: `1px solid ${cfg.loreColor}`,
            borderRadius: 3,
            padding: "0 5px",
            marginBottom: 4,
          }}
        >
          {card.rarity}
        </div>
      )}
      {card.efficacy.map((line, i) => (
        // 一行 = 一列。這一行就是 owner 那句「連在一起不好閱讀」的解法。
        <div key={i} style={{ marginTop: i === 0 ? 0 : 3 }}>
          {line.tokens.map((t, j) => (
            <Token key={j} token={t} fontSize={fontSize} />
          ))}
        </div>
      ))}
      {showLore && card.lore.length > 0 && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 5,
            borderTop: `1px solid ${chipBackground(cfg.loreColor)}`,
            fontSize: Math.round(fontSize * 0.92),
            color: cfg.loreColor,
          }}
        >
          {card.lore.map((p, i) => (
            <div key={i}>{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}
