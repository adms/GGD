package submissions

import "github.com/ggd/platform/internal/httpx"

// ⭐⭐ GH#1025 —— promote 的**第四段**：把審過的那一份**真的寫進出貨內容**。
//
// ── ⛔ 在此之前 promote 只寫了一張紙 ──────────────────────────────────────
// 2026-09-07 逐行量到：`Promote` 唯一的寫入是
// `s.store.Put(CollectionPromotion, id, p)` —— 一筆「這一份被核准上線了」的**紀錄**。
// ⚠️ ⭐ 而**沒有任何一行**把 `Material.Payload` 送進耐久覆蓋層／出貨內容樹。
// ⇒ 按下「套用」之後，那份文件**哪裡都沒有去**：
//   · game-server 的登錄表沒有它（`loadContent()` 讀的是 content/ ⊕ overlay）
//   · ⛔ 重啟也沒有用 —— 它從來沒有被寫進 overlay
//   · 而 `View.Promoted` 會回 **true**，畫面上顯示「✅ 已套用」
//
// ⭐ 這正是本 repo 記過的失敗形態②「算出來了但從沒送到」的最貴版本：
// 每一個零件都是對的（有審核頁 · 有 promotion 紀錄 · 有耐久覆蓋層），
// ⛔ 而**接縫上沒有人站**。
//
// ── ⭐ 為什麼是「注入一個 Publisher」而不是 import contentoverlay ──────────
// 與 `Revalidator` / `GeneratorOwned` 同一個形狀（這個套件已經用了兩次）：
// submissions 不認識 contentoverlay，也不認識 curation ——
// ⭐ 那兩個是 `server.go` 才拼得起來的東西。
//
// ⛔⛔ **nil ⇒ 拒絕**，⛔ 不是「跳過發布照樣記一筆」。
// ⚠️ 這一格與 `Revalidator` 一樣**沒有安全的預設值**：
// 「跳過發布」正好就是上面那個缺陷本人 —— 一條看起來會動、
// 而玩家永遠拿不到東西的上線路徑。
type Publisher func(m Material, by string) (map[string]any, error)

// PublishFailed 把發布失敗包成 409。
//
// ⭐ 呼叫端要知道的只有一件事：**舊版一個位元組都沒有動**。
// 覆蓋層的寫入是「稽核先寫、寫不成就整筆失敗」（contentoverlay.commit），
// 而這裡在它回錯時**不寫 promotion 紀錄** ⇒ 這一份仍然是「審過但沒上線」，
// 重試是安全的。
func PublishFailed(err error) error {
	return httpx.Err(409, "publish_failed",
		"the reviewed document was NOT published; nothing was changed and the previously "+
			"published version is still in force: "+err.Error())
}
