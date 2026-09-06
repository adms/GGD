/**
 * PlatformNotice —— 「這台裝置在不在支援範圍內」的**告知**（GH#1089）。
 *
 * owner 2026-09-06（逐字）：
 * > 「請你開票修改所有來源 本遊戲不支援手機但支援平板最高 30fps  手機是 30fps
 * >  以 ipad mini 的 A17 Pro 為最低配備標準來設計」
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三個刻意的決定
 * ════════════════════════════════════════════════════════════════════════════
 * ① **告知，⛔ 不是硬擋**（出貨 `phoneHardBlock = false`）。web 上分不乾淨手機
 *    與平板（`input/mobileDetect.ts` 的 `classifyDevice` 檔頭寫了為什麼），
 *    而「把平板誤判成手機」＝擋住一位付錢的玩家。⇒ 有一顆「仍要繼續」。
 *    要硬擋是後台一格 —— ⛔ 不是改這個檔。
 *
 * ② **每一個字都從 config 讀**：最低配備那一行是
 *    `config.model-lod@1.platformPolicy.minDevice`。⛔ 這裡不可以出現
 *    「iPad mini」四個字 —— owner 換機型的成本必須是一格下拉，⛔ 不是一次部署。
 *
 * ③ **它會等政策**。內容是開機之後幾百 ms 才落地的，所以這個元件訂閱
 *    `subscribePlatformPolicy`：⛔ 少了它，操作者在後台改的那一格會在「已經畫過
 *    一次」之後才到，而畫面停在出貨政策上（失敗形態②）。
 *
 * ⚠️ 這**不是** GlobalChrome 的成員：它只掛在 `AppRoot`（玩家真正進場的那棵樹）。
 * `#replay=` 那棵樹是給 owner 看錄影用的，⛔ 在那裡蓋一張全螢幕告知只會擋住他。
 */
import { useEffect, useState } from "react";
import { classifyDevice, readDeviceSizeEnv } from "../input/mobileDetect";
import { platformPolicy, subscribePlatformPolicy } from "../render/frameCap";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

export function PlatformNotice(): React.JSX.Element | null {
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bump = (): void => setTick((n) => n + 1);
    // 政策是內容載入之後才到的；轉螢幕會改變短邊，兩者都要重問一次。
    const off = subscribePlatformPolicy(bump);
    window.addEventListener("resize", bump);
    window.addEventListener("orientationchange", bump);
    return () => {
      off();
      window.removeEventListener("resize", bump);
      window.removeEventListener("orientationchange", bump);
    };
  }, []);
  void tick;

  const policy = platformPolicy();
  const deviceClass = classifyDevice(readDeviceSizeEnv(), policy.phoneShortEdgePx);
  if (policy.phone !== "unsupported" || deviceClass !== "phone") return null;
  if (dismissed && !policy.phoneHardBlock) return null;

  return (
    <div
      data-testid="platform-notice"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "#0b0e14",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        pointerEvents: "auto",
        color: TEXT_MAIN,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          padding: "18px 20px",
          background: PANEL_BG,
          border: PANEL_BORDER,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 34 }}>📱🚫</div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>本遊戲不支援手機</div>
        <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.6 }}>
          最低配備標準：<b style={{ color: TEXT_MAIN }}>{policy.minDevice}</b>
          <br />
          平板可以玩（畫面上限 {policy.tabletFpsCap} fps），手機的螢幕與散熱都不在設計範圍內。
        </div>
        {!policy.phoneHardBlock && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            style={{
              marginTop: 4,
              padding: "8px 14px",
              borderRadius: 8,
              border: PANEL_BORDER,
              background: "transparent",
              color: TEXT_MAIN,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            仍要繼續 · Continue anyway
          </button>
        )}
      </div>
    </div>
  );
}
