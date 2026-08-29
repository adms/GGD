# measure-injectable — `measure()` 抽成可注入（GH#768 · GH#715）

> 📅 **證據的時間身分（GH#795）**：`HEAD=65e11fea` 工作樹
>
> ⭐ 這一行是 `visual-proof.sh --new` **拍攝當下**蓋的,⛔ 不是事後補的。
> 它回答的是「這份證據是不是比它要驗的修復更早」——⛔ 沒有它,那題永遠判不出來。

## ⭐ 這一筆改的是**量尺的接線**，⛔ 不是像素 —— 而「有沒有動到像素」是可以量的

`scripts/visual-proof.sh` 因為這一筆碰了 `apps/client/src/vfx/beamAudition.ts` 而 **EXIT=1**。
⚠️ ⭐ 它是對的：**改到畫面層就要拿終端證據**。
⇒ 這份報告回答的是：**這一筆有沒有改變玩家看到的任何一個像素？**

⛔ **沒有**貼 `@visual-proof` 標記 —— `auditionCalibrates.test.ts` 的檔頭自己誠實地寫著
「⛔ 這裡不做像素斷言」⇒ 貼上去會是一個**空殼標記**，⭐ 那正是閘 v2 的洞 b 要擋的。
⇒ 走選項②。

### 量測（⛔ 不是推論）—— 在**這個 worktree** 重新建一次 dist

```
cd apps/client && npx vite build      # EXIT=0,5.59s
… 最後一行：[ggd] stripped 21 audition/debug page(s) from the build output
```

| | 出貨 `apps/client/dist/assets/*.js`（**168** 個檔）中含此符號的檔數 |
|---|--:|
| `beamAudition` | **0** |
| `makeCertifiedMeasure`（⭐ 這一筆**新增**的 export） | **0** |
| `CertifiedMeasureDeps`（同上） | **0** |
| `countBright`（⭐ 這一筆從閉包**提到模組層**的） | **0** |
| `certifiedRead` | **0** |
| `calibrateTwoWay` · `assertTwoWay` · `pumpTicks` | **0** · **0** · **0** |
| ⭐ **對照組**：`playCastVfx` | **1** |
| ⭐ **對照組**：`handleEvent` | **1** |
| ⭐ **對照組**：`modelFxSpawn` | **1** |

⭐ **對照組是這份證據的關鍵**：它證明 `grep` 這把尺**是好的** ——
⚠️ 沒有它，「0 個檔」與「我的 grep 打錯了」**長得一模一樣**
（CLAUDE.md：一把只驗過單邊的尺不算自證過 ⇒ 要同時驗「已知有的量得到」與「已知沒有的量不到」）。

⭐ 第二把獨立的尺（⛔ 不是同一個 grep 的第二次）：
`dist/` 根目錄的 html 只有 **1 份**（`index.html`），`dist/beam-audition.html` **不存在** ——
也就是連承載這支量尺的那一頁都沒有進出貨。

### 為什麼是 0

`beamAudition.ts` 只被 audition／studio 那一族 import
（`auditionCalibrate.ts` · `featureProofAudition.ts` · `vfxScriptStudio.ts` · `beamAuditionWorld.ts`），
⭐ 而那些頁在 `main.tsx` 的 `import.meta.env.DEV` 之後才動態載入
⇒ 正式 build 的 tree-shaking 把整族搖掉，build 自己最後一行也逐字說它 stripped 21 頁。

## 結論

**A（功能開）／B（功能關）亮像素差：不適用** —— ⭐ 這一筆對玩家的畫面是**逐位元組的恆等**，
⛔ 不是「差異很小」。它改的是**開發期量尺的可測性**：
`measure()` 從 `createBeamAudition()` 的函式內區域常數，抽成模組層的
`makeCertifiedMeasure({certify, readPixels, census})`。

### ⚠️ 誠實的界線（⛔ 這一節不可以在轉述時被丟掉）

| 這份證據證明的 | ⛔ 它**證明不了**的 |
|---|---|
| **沒有任何像素被改變**（出貨 bundle 逐符號 0 命中 ＋ 對照組 3/3 命中） | 「量尺的自證是對的」—— ⭐ 那由 `auditionCalibrates.test.ts` 的**行為**守衛守 |

⭐ 而**行為**那一半這一輪真的換掉了（這正是 2026-08-29 對抗性複驗指名的那一條）：

| | 2026-08-29（上一輪） | ⭐ 這一輪 |
|---|---|---|
| 「`measure()` 有沒有自證」怎麼驗 | **掃字串**：`src.slice(m, m+500).toContain("certifiedRead(calibrate")` | ⭐ **行為**：餵一個會 reject 的 `certify` ⇒ 呼叫端**一個數字都拿不到**，且 `readPixels` **從沒被呼叫** |
| 「自證在前、讀數在後」怎麼驗 | ⛔ 沒有 | ⭐ **行為**：呼叫順序 log 的第 0 格必須是 `certify` |
| 「滿版亮幀數得到 ⇒ `lit` ⛔ 不是 0」（AC②） | ⛔ 沒有 | ⭐ **行為**：`countBright()` 餵一張滿版黃 `(255,255,0)` ⇒ 64/64；餵全黑 ⇒ 0/0（**兩個方向**） |
| 台子有沒有把零件接上去 | 掃字串 | ⚠️ **仍是掃字串** —— `createBeamAudition()` headless 建構不起來（Babylon ＋ WebGL ＋ 真內容載入）。⭐ 但它現在只負責**接縫**這一件事，零件本身由上面三條行為守 |

⛔ **AC② 仍未完整關閉**：它的另一半（真 GPU 上 `engine.readPixels()` 對一張滿版黃光的幀
回一塊空的緩衝）要開瀏覽器跑 `beam-audition.html`，⭐ 本 lane **沒有跑，沒有終端像素證據**。
⇒ 那一段仍然是「**鏈路已接上，⛔ 未驗收**」。
