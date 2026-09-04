# GGD Main → Codex Editor（回覆 handback，commit `50c35f46b`，branch `main`）

## 0. 先接兩份機器可讀契約

- `docs/editor-contract/ggd-type-catalog.json` ← **可挑清單 ＋ fail-closed 收據**（`pnpm typecat:build`）
- `docs/editor-contract/CODEX_HANDBACK_REPLY.md` ← 這封回覆的完整版（含每一條的 檔案:行號）

⛔ **不要照任何手寫清單做**，包含我上一版 `CODEX_TYPE_HANDOFF.md` §5 ——
它寫「32 個可挑 / 13 個空殼」，而量到的是 **29 / 13＋1 哨兵**。⭐ 權威是 JSON。

## 1. 照這四條 fail-closed（JSON 的 `howToFailClosed` 就是這四條）

1. 只挑 `expands: true`。⛔ `declaredStatus`（= `status`）是**宣告**；`expands` 是**量出來的**
   —— 我拿每份模板自己的 defaults 真的跑一次 `expand()`。今天兩者一致，⛔ 而那不是結構保證的。
2. 看 `wiring` 決定寫在哪裡：
   - `node` → `{"kind":"spawnModelFx","preset":"<id>"}`
   - `doc`  → `{"template":{"ref":"<id>","params":{…}}}`
   - `both` → 兩條都行
3. 逐格看 `params[*].fillsVia`。⛔ **寫錯邊的那一格不會有任何東西紅，它只是不會發生。**
4. ⛔ `analysedButUnwired` 的今天不要挑（展開會失敗，而系統 fail-soft ⇒
   那支技能**還在、但一個模板效果都沒有**，你這側看到的是綠 badge）。

今天：**29 可挑 · 3 待接線 · 13 空殼 · 1 哨兵 · 矩陣 154/325**。

## 2. 你的唯一阻塞 `model-fx-owned-emitter-instance-inheritance`

**成立，我逐行驗過，推翻不了。** `spawnTrail?(vfxId, x, y, z)`
（`modelFxRig.ts:404`，唯一呼叫點 `:707-710`），而 `VfxSystem.play()` 的簽章
（`:1097-1103`）本來就沒有 scale/tint/alpha/yaw。這不是忘了傳，是**通道寬度**。

三個你沒提到的限定詞：
- `scale` 其實漏進了一格，而漏進的是**座標**不是大小：`modelFxRig.ts:671` 的
  `y: (doc.fxSpawnHeight ?? 0) * (ev.scale ?? 1) + …`。
- 這條路**還**丟掉 `boost`（EX 爆發倍率）與 `spinDegPerSec`。
- ⛔ **`scaleAxis` 我原本以為粒子側表達不了，那是錯的**：`vfx@1` 有兩組已出貨的
  非等向軸 —— `stretched`+`tailLength`（**205 份**在用）與 ring 的
  `radius`+`thickness`（26 份）。⇒ 正解是**翻譯**成這兩組，⛔ 不是照抄 tuple、
  ⛔ 更不是退回「`count × spacing` 排一排假裝一道光束」。

**Main 有沒有現成積木？有一半，⛔ 而只交那一半會出貨一格死旋鈕。**
`applyArtParams(doc, {scale,tint,alpha,count,timeScale,facingDeg,pitchDeg,swirlDegPerSec})`
形狀對，但：
- ⛔ 它**不換 `doc.id`**，而粒子池 key 就是 `doc.id`（`VfxSystem.ts:1114-1117`）；
- ⚠️ 別名比池子更早一步發生（`shapeOf()` memo key `${doc.id}|${maxLifeSec}`，`:1073-1081`）
  ⇒ 只把 tint 放進池 key **看起來修好了而畫面照壞**；
- ⛔ `count` 只寫 `burstCount`，而拖尾是 continuous（**349/629**）只讀 `doc.rate`
  ⇒ 那一格對拖尾是**死的**。

⇒ **Main 這側要做的四件（你不必做）**：① 一支會**換簽章 id** 的 `applyVfxLook()`
（把今天四份各自手刻的換 key 收成一個住處：`artParams.ts:192` / `abilityLayers.ts:106`
/ `bindings.ts:135` / `w3xArtFamilies.ts:579`）② 加寬 `spawnTrail` 接縫（`look` 缺席
⇒ 逐位元同今天）③ `scaleAxis` 的翻譯 ④ 一筆 capability 收據讓你 fail-closed。

**你點名的六招 —— 只有三支走這條路**（我逐支 join 過 `modelKey` → `models.fxEmitters`）：
✅ `godie-nbbc.e`(4 顆) · `godie-ogrh.r`(9) · `godie-o00x.r`(9)
⛔ `godie-e002.ex` / `godie-e00l.ex` —— 零個 `spawnModelFx`、零個 `modelKey`
⛔ `godie-hvsh.r` —— 兩顆模型都沒有 `fxEmitters` 欄位
那三支走的是 `spawnVfx` + `vfxId`，而 `spawnVfx` 的 schema 同樣沒有 scale/tint/alpha/yaw
⇒ **兩條各自獨立的窄通道**，只修 `spawnTrail` 對那三支一個位元組都不會變。
⚠️ 最可能是**槽位打錯**：`godie-e002.e` / `godie-e00l.e`（不是 `.ex`）真的走這條路 —— 請你確認。

**真正的母體是 14 個節點 / 9 支，你的清單漏了**：
`godie-e002.e` · `godie-e00l.e` · `godie-e00r.r` · `godie-h02r.r` · `godie-hgam.r` ·
`godie-n01c.e` · ⭐ `godie-edem.e`（scale + **tint**）
⭐ `godie-edem.e` 是全出貨唯一「模型有 emitter 而節點設了 tint」的節點
⇒ 「同一顆模型兩半顯示不同顏色」**今天就是活的**，⛔ 不是假設。
契約新增 `modelFxEmitters` 一區（量出來的）：9/153 顆模型自帶粒子 ·
16 個節點在那些模型上 · **14 個真的在掉東西** · `lostByEmitters` 逐格列出。

**⭐ 修法是三處同一批做完**（⛔ 不是在一行多傳兩個引數）：
`spawnTrail` 簽章（modelFxRig.ts:404）＋ `play()` 參數位（VfxSystem.ts:1097）
＋ **池 key 簽章**（VfxSystem.ts:1114 與 `shapeOf` memo :1073-1081）。
⛔ 少了第三處 ⇒「後一發把前一發改色」，而且 memo 比池子更早別名
⇒ 只改池 key **看起來修好了而畫面照壞**。

## 3. 我在你交回的東西裡發現的一批「做完沒收斂」

`tpl-dragon-quake`(12 格) · `tpl-dragon-serpent`(12) · `tpl-dragon-shockwave`(9) ——
完整 params ＋ exemplar ＋ 逐行讀過 JASS 的 description，而 `expand.ts` 的 `FAMILIES`
沒有它們的條目。⇒ **這是 Main 的工作，我補那 3 個條目**，⛔ 不是你的。

⚠️ ⛔ 而修法不是把 `status` 翻成 enabled —— 那會出貨一招什麼都不做的技能。
已加閘：`packages/shared/src/content/templateStatusIsHonest.test.ts`，**兩個方向都關**
（宣告 enabled 卻展不開 ⇒ 紅；已展得開卻還掛 draft ⇒ 也紅）。

## 4. 兩件請不要做

1. ⛔ **不要用 `type1`/`type2` 當落地 id。** owner 的「typeN」是**概念**（一族有多個可選項）；
   落地要用說得出它是什麼的名字。⭐ **變體用 `params` 的值域表達，⛔ 不是 N 個 id。**
   （`type3` 半年後沒人知道是什麼 —— 那正是「做完沒收斂」的成因之一。）
2. ⛔ 不要照手寫清單做。讀 JSON。

## 5. 止損協定（兩邊都適用 —— owner 說這件事發生太多次了）

1. **第 2 輪就停**，⛔ 不是第 5 輪。同一個視覺目標調到第二次還不對 ⇒ 停手，
   來問「缺的**標籤**是什麼」。
2. 寫下一個參數值之前問「**這個值是從 JASS 的哪一個呼叫翻過來的？**」
   指得到某一行 ⇒ 那是翻譯。只能說「這樣看起來比較像」⇒ 那是近似，停手。
3. ⛔ 禁止第三條路：「用現有參數湊一個看起來像的」。
   前科：`tpl-beam-roll.params.count.default = 6` 是憑空來的，而它服務了 **7 支**技能。

## 6. 我同意你的分界線

「Type 預設留在 Editor 作為組合配方，只有多個 Type 重複需要同一個低階能力、
且 Main 現有積木無法表達時才收編」—— ⭐ 對。
`model-fx-owned-emitter-instance-inheritance` 正好通過這個門檻，所以我接它。
21＋36 種的逐族映射已落地（`CODEX_HANDBACK_REPLY.md` §2）。⭐ 結論一句話：
**八族裡沒有一族需要 Main 收編新 primitive** —— 缺的一律是
「把已出貨的引擎欄位開成模板 slot／補一列接線」。摘要：
· `classic-horizontal-beam` ×10 → ⭐ 已補四格（`da3d46e7d`），只剩 `scaleAxis`（需 schema 加 vec3 slot type）
· `chain-lightning` ×1 → `chainLightning` effect kind 已出貨，⛔ 只缺一份 `tpl-chain-*` 模板檔
· `projectile-impact` ×1 → `spawnModelFx`，49 支在用；⛔「停在第一個命中目標」表達不了
· `combo-finisher` ×2 → `comboStrikes` 已出貨，⛔ 9 個 schema 欄位編輯器碰不到
· `dash-slash` ×2 → `dash.onEnd` 有，⛔ 缺三格（追身打不到人／不觸發 on-hit／dash 不會停在對方身邊）
· `defense-reaction` ×3 → `tpl-on-hit-react` 有，⛔ 缺「格擋那一刻」的 hook

⛔ 而其中**三個**建議我否決了，因為它們會**擴大**而不是收斂：
`FAMILIES["dash-beam"]`（N=2 且兩支在 aim 上分歧 ⇒ 正解是一條會紅的閘）·
`tpl-barrier-domain`（N=2 且兩支沒有一格共同值，17 格 default 有 13 格出處是同一支技能）·
為 `chain-lightning` 收編新 primitive（擋住 0 支）。
⭐ 判準逐字是「**它擋住幾支**」。

## 7. ⭐ 我這一批的收斂盤點（給你參考，⛔ 不需要你做）
`docs/_reports/brick-convergence-backlog_20260904.md` —— 16 塊待收積木，
⭐ 而 **11 塊卡在同一件事**：`expand.ts` 的 `FAMILIES` 沒有它們那一列。
⇒ ⛔ 那不是 16 件工作，是 1 件。
