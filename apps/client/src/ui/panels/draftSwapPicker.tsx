/**
 * 🎒 **背包滿時的換裝介面**（GH#1110 B）—— 三選一的道具卡 → 選要賣掉哪一格 → 換上。
 *
 * > 「隨機選寶具的時候 道具欄已滿 怎麼辦」
 * > 「A ＋ B 開票」
 * —— owner 2026-09-08 02:28（`docs/_daily/ledger-source_temp_20260908.md:13` · 裁決紀錄 `docs/_daily/2026-09-08.md:13`）。
 * ⚠️ 下面這段是 Claude 在裁決紀錄裡補的定義，⛔ 不是 owner 原話：
 *   A＝明確告知「背包已滿」且不消耗那次機會；B＝讓玩家挑一件丟掉/賣掉再換上。⛔ 不做 C「事前不發卡」。
 *
 * ⭐ 送出的就是**同一個** `pickOffer` 指令，多一格 `swapSlot` —— ⛔ 沒有第二條通道。
 * 伺服器賣掉那一格（退款＝那一格實付 × 賣出退款率，`sim/economy/shop.ts::sellItem`）
 * 再把新道具放進去；被擋（開關關著／商店規則不准）⇒ 卡片留著、回拒絕原因。
 *
 * ⚠️ 選擇器回**字串**（⛔ 不是陣列）—— GH#618 的閘（`augmentDraftNoReconcile`）：
 * `seats` 每張快照都是新物件，回陣列會讓這棵子樹每 tick 重跑 React。
 */
import { useHud } from "../../net/RoomStore";
import { hudActions } from "../actions";
import { GlyphTile } from "../components/GlyphTile";
import { SfxButton } from "../SfxButton";
import { resolveChoice } from "./resolveChoice";
import { TEXT_DIM, TEXT_MAIN } from "../theme";

/** 卡面上那一行（背包滿但可以換）。⛔ 不是 `REJECT_TEXT["no-slot"]`：這一張點得下去。 */
export const SWAP_HINT = "道具欄已滿 · 點選後挑一件換掉";

/** 送出換裝那一次選取。⭐ 與一般選取同一個指令、同一個 `offerId#idx` 編碼。 */
export function sendSwapPick(offerId: string, choiceIdx: number, swapSlot: number): void {
  hudActions.sendCommand({ kind: "pickOffer", offerId: `${offerId}#${choiceIdx}`, swapSlot });
}

export function DraftSwapPicker(props: {
  offerId: string;
  choiceIdx: number;
  choiceName: string;
  onCancel: () => void;
}): React.JSX.Element | null {
  // 「id\u0001退款」逐格以 \u0000 串起來；`?` ＝ 伺服器還沒回報退款（⛔ 不寫 0）。
  const key = useHud((s) => {
    const seat = s.localSeatId === null ? undefined : s.seats.find((v) => v.seatId === s.localSeatId);
    if (!seat) return "";
    return seat.items.map((id, i) => `${id}\u0001${seat.itemRefund?.[i] ?? "?"}`).join("\u0000");
  });
  if (key === "") return null;
  const slots = key.split("\u0000").map((row) => row.split("\u0001") as [string, string]);
  return (
    <div data-draft-swap-picker style={{ marginTop: 10, textAlign: "center", color: TEXT_MAIN }}>
      <div style={{ fontSize: 12, marginBottom: 6 }}>
        選一件賣掉，換上「<b>{props.choiceName}</b>」（退款＝實付價 × 退款率）
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
        {slots.map(([id, refund], slot) => {
          const r = id ? resolveChoice(id) : null;
          const name = r ? r.name || id : "";
          return (
            <SfxButton
              key={slot}
              kind="subdued"
              data-swap-slot={slot}
              disabled={!id}
              aria-label={id ? `賣掉 ${name}（+${refund} g）` : "空格"}
              onClick={() => sendSwapPick(props.offerId, props.choiceIdx, slot)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: 4 }}
            >
              {r ? <GlyphTile seed={id} icon={r.icon ?? null} label={name} size={30} /> : null}
              <span style={{ fontSize: 10, lineHeight: 1.2 }}>{name}</span>
              {id ? <span style={{ fontSize: 10, color: "#ffd27a" }}>+{refund} g</span> : null}
            </SfxButton>
          );
        })}
      </div>
      <SfxButton kind="subdued" onClick={props.onCancel} style={{ marginTop: 6, fontSize: 11, color: TEXT_DIM }}>
        取消
      </SfxButton>
    </div>
  );
}
