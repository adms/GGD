# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 5.0 — Main 關鍵接縫已完成，等待 feature branch 可取得後驗證**

最後驗證：**2026-09-02 08:15（Asia/Taipei）**

可直接交給 Main Codex 的最小訊息：
[`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`](docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md)。

## 現況結論

Main 回報 `feat/editor-seam-20260902` 的 `b54441df8`、`cf40d5db3` 已完成三條關鍵接縫：

1. 完整且可重算的 `active/runtime-bundle`；
2. 帶 identity receipt 的 `effectiveVfxLimits`；
3. 作為唯一 representation／endpoint 真相來源的 `contract-index`。

因此 Main 本輪沒有新的程式功能待辦。唯一必要動作是把該 feature branch 推到 origin，仍然不要推 main，
讓 Editor 分支能抓取並跑 integration tests。

本次重新驗證：origin 沒有任何 `*editor*`／`*seam*` branch；直接 fetch 兩個 commit SHA 也失敗；正式站
contract-index／runtime-bundle 均為 404。因此仍只能驗證 Editor 消費端，不能宣稱真接縫已完成。

## Editor 接下來自行完成

```text
contract-index
  → 決定 ability@1／item@1 是否支援及可用 modes
  → 未知 representation fail closed
  → URL bridge 只允許 target profile 同源的固定 contract-index path

active/runtime-bundle
  → 重算每份 hashDoc
  → 重算每個 hashCollection + count
  → 重算 contentVersion
  → 核對 activationDigest／packageDigest 與 target profile
  → 通過後才成為 full／delta exact Base

effectiveVfxLimits
  → 驗 schema／limitProfileId／resolverFingerprint
  → 讀八個 resolver 實際值
  → null maxOneShotEmitters = Infinity
  → 不完整時拒收遠端收據，預覽明示降級到本機 resolver

generator-owned write
  → Forge 寫入前重新讀 ability 與 champion 的 editor-source receipt
  → champion mirror 只有 writePolicy=document 才可 PATCH
  → source-adapter／readonly／缺收據全部在送出前拒絕
```

## 保持抽象化分工

- Main 做「積木」：runtime effect、hook、VFX primitive、resolver、限制與機器契約。
- Editor／後台做「堆積木」：完整表單、拖拉、時間軸、即時視覺預覽、模組配方、驗證與 JSON／ZIP。
- 技能、特效與英雄資料不得依賴 AI 無止境逼近；AI 只能提出候選，玩家必須能用 no-code 介面精確修改，
  並經人工批核與 Promote 才能進入遊戲。
- `vfx-script@1` 目前在 contract index 為 `planned/G5` 時，Editor 顯示規劃狀態，不偽裝成可匯入。

## 本輪不再要求 Main

`validate-single`、AI promote 409、新 Eva 模型、appearance resolver、七色 palette 都已有 issue 或不是目前
Editor importer 的關鍵路徑；不得塞回本輪阻塞清單。沒有 active snapshot 時維持 bootstrap-only 是正確狀態，
不要求 Main 造假收據來解鎖 full／delta。
