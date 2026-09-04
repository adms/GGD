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

**你點名的六招我還沒逐支驗** —— 要先確認每一支真的都走 `model@1.fxEmitters`。
若其中幾支根本沒宣告它，那「固定大小固定黃色」有第二個成因，修接縫治不了。

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
21＋36 種的逐族映射我正在跑，落地後補進 `CODEX_HANDBACK_REPLY.md` §2。
