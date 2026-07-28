# docs/legacy —— 封存,不是垃圾桶

這裡放的是**已經不該被當作現況參考、但值得留著查的**文件。

owner 2026-07-28:「你不應該刪除而是移到 legacy」。

## 為什麼是移動而不是刪除

刪除的理由聽起來很充分 —— 「git log 已經記了同一件事」—— 但那句話只在**有人知道
要去 git log 裡找什麼**的時候成立。一份 `git show HEAD~5:docs/xxx.md` 才拿得到的
文件，實務上等於不存在；而這些檔案裡有些東西是 commit 訊息不會記的：當時**量到的
數字**、當時**判斷錯的理由**、以及踩過而還沒沉澱成守衛的坑。

## ⚠️ 這裡的每一份都可能在說謊

它們被移進來的**共同理由**就是「內容已與現況不符」。查閱時的規矩：

- 把裡面的數字當作**當時的量測**，不是現在的事實
- 要用它下判斷之前，先回程式碼確認一次
- 不要從這裡複製 TODO —— 2026-07-28 的分流已經把仍然成立的部分開成 GitHub issue
  （標籤 `docs-triage`），沒被開出來的就是查證後確認已完成或已作廢

## 目錄

| 檔案 | 為什麼移進來 |
|---|---|
| `_ttk-experiment-153.md` | 結論 maxHealth≈15.7 從未上線，隔天被 `_ttk-retune.md` 取代成 8.0，owner 後來又改回 4.0。方法論留在 `tools/ttk-sim`；產出路徑已改到 gitignore 的 `data/reports/`（GH#56） |
| `_requirements-audit-gaps20260723.md` | 277 行裡 276 行逐字存在於現行的 `_requirements-audit-gaps.md`；四個欄位已過期 |
| `改進延遲.md` | 檔頭自掛「已廢棄，不要參考」，三處查證為錯；現行分析是 `_延遲改進計畫.md` |
| `_execution-batches-history-2026072{5,6,7}.md` | 逐日封存。它們記的事 git log 記過一次，額外攜帶的只有過期判定（例：標「godie-hblm 仍待辦」，實際 #212 早已完成）。**20260727 那份夾了幾個獨有缺陷，已開成 issue** |
| `_session-handoff-2026-07-24.md`<br>`_session-handoff-20260725.md`<br>`_session-handover.md` | session 交接。內容已被後續部署與 `_execution-batches.md` 吸收。**`_session-handover.md` §六的兩個機制陷阱是獨有的，已開成 GH#54 / GH#56** |
| `_local-image-gen-setup.md` | 「證明 + 驗收」快照；流程已被 `tools/icon-gen/local/batch.py` 與 `daemon.py` 走過頭 |

## 規則

- **不要在這裡新增「逐日封存」**。`_execution-batches.md` 的規則已經改成「做完就從
  那份拿掉」，不要再搬進歷史檔 —— 逐日封存本身就是一種會腐爛的重複記錄。
- 移進來的東西如果之後被證明還有現行價值，就把那一段**搬回去**或開成 issue，
  不要讓人依賴這個目錄。
