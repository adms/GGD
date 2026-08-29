# audition-ruler-selfcert — 量尺自證（GH#768 · GH#715）

> 📅 **證據的時間身分（GH#795）**：`HEAD=136c7ca5` 工作樹
>
> ⭐ 這一行是 `visual-proof.sh --new` **拍攝當下**蓋的,⛔ 不是事後補的。
> 它回答的是「這份證據是不是比它要驗的修復更早」——⛔ 沒有它,那題永遠判不出來。


台子：`（⬜ audition 頁的 URL,含 ability id）`
鏈路：`（⬜ 逐段寫出來,證明沒有一段是台子造的）`
⭐ **量尺先自證**：`calibrate()` 全亮 quad = **⬜** 亮像素（⛔ 量不到 ⇒ 這台量尺的一切結論作廢）
亮像素 = max(R,G,B) > 200;lit = > 96。

| 擷圖 | tick | 亮像素 | lit | 說明 |
|---|--:|--:|--:|---|
| f0_precast | 0 | ⬜ | ⬜ | 施放前基線 |
| f1_peak | ⬜ | ⬜ | ⬜ | ⬜ |

## 結論

⬜ A（功能開）vs B（功能關）的亮像素差,以及它為什麼是**終端**證據。

## ⭐ 這一筆改的是**量尺**，⛔ 不是像素 —— 而那是可以量的

`scripts/visual-proof.sh` 因為這一筆碰了 `apps/client/src/vfx/beamAudition.ts` 而紅。
⚠️ ⭐ 它是對的：**改到畫面層就要拿終端證據**。
⇒ 這份報告回答的是：**這一筆有沒有改變玩家看到的任何一個像素？**

### 量測（⛔ 不是推論）

| | 結果 |
|---|---:|
| 出貨 `apps/client/dist/assets/*.js` 裡含 `beamAudition` / `calibrateTwoWay` / `certifiedRead` 的檔 | **0** |
| ⭐ **對照組**：含 `playCastVfx`（一個確定會出貨的符號）的檔 | **1** |

⭐ **對照組是這份證據的關鍵**：它證明 `grep` 這把尺**是好的** ——
⚠️ 沒有它，「0 個檔」與「我的 grep 打錯了」**長得一模一樣**
（CLAUDE.md：一把只驗過單邊的尺不算自證過）。

### 為什麼是 0

`beamAudition.ts` 只被 audition／studio 那一族 import
（`auditionCalibrate.ts` · `featureProofAudition.ts` · `vfxScriptStudio.ts` · `beamAuditionWorld.ts`），
⭐ 而那些頁在 `main.tsx` 的 `import.meta.env.DEV` 之後才動態載入
⇒ 正式 build 的 tree-shaking 把整族搖掉。

## 結論

**A/B 亮像素數：不適用** —— ⭐ 這一筆對玩家的畫面是**逐位元組的恆等**，
⛔ 不是「差異很小」。它改的是**開發期量尺的自證**（`measure()` 讀之前先校準，
校準失敗就擲例外而不是回 0）。

⚠️ **誠實的界線**：這份證據證明的是「**沒有像素被改變**」，
⛔ **不是**「量尺的自證是對的」—— ⭐ 後者由
`apps/client/src/vfx/auditionCalibrates.test.ts` 與 `beamAuditionWiring.test.ts` 守，
⚠️ 而 2026-08-29 的對抗性複驗指出**其中幾條是掃字串**（失敗形態⑥）⇒ 已記在 GH#768。
