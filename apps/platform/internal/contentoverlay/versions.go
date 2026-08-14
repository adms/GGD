// Package contentoverlay — 版本歷史與回滾（GH#326）。
//
// owner 2026-08-14：
//
//	「編譯及檢查過後**直接變成預設採用**，但舊版本可以有版本編號 rollback
//	 **往前 n 版都可以（下拉選單）**，**可以單獨項目版本控制也可以批次版本控制**變更」
//
// ── ⛔ 為什麼這裡不自己造一個版本庫 ────────────────────────────────────────
//
// owner 同一天：「像你剛剛提到的 git tree 等機制應該都有很成熟的第三方套件可以
// 使用」「只要授權是 MIT, Apache 這種友善的都可以使用」。
//
// 自製的版本庫要做的四件事，git 全部免費給：
//
//	內容定址物件庫 + 去重  → blob
//	批次版本清單          → commit（tree 就是 {路徑 → hash}）
//	往前 n 版下拉選單      → git log
//	append-only 歷史      → 本來就是
//
// 所以這個檔案是 **go-git（Apache-2.0）的一層薄包裝**，⛔ 不是一個新的儲存引擎。
// 前例：`scripts/backup-rules.sh` 已經用同一招把記憶目錄變成本機 repo。
//
// ── ⭐ 兩個軸必須互相說得通 ─────────────────────────────────────────────
//
// 「單支往前 n 版」與「整批往前 n 版」如果各自獨立，「線上現在是哪一版」就沒有
// 答案。所以這裡採 **git revert 模型而不是 git checkout 模型**：
//
//	整批回滾 = 取出舊 commit 的 overlay.json → **寫成一個新 commit**
//	單支回滾 = 取出舊 commit 的那一格 → 併進現在這份 → **寫成一個新 commit**
//
// ⭐ 兩者都**鑄一個新版本**，歷史永遠是線性 append-only，最新的一個永遠就是線上
// 跑的那個。⛔ 不做「指標指回舊版」——那會產生 detached HEAD 的概念，而「現在
// 到底是哪一版」正是這整套要回答的問題。
//
// ── ⚠️ 失敗一律 best-effort，⛔ 但不可以靜默 ────────────────────────────
//
// 版本化壞掉**不可以弄壞一次存檔**（同 MatchRecorder 的理由：「壞掉的錄影不可以
// 弄壞一場遊戲」）。但 CLAUDE.md 同時說「fail-open 沒錯，**靜默**才是缺陷」——
// 所以每一次失敗都 `slog.Warn` 並且**在 `Versions()` 的回傳裡帶一格 `Unavailable`**，
// 後台看得到「歷史目前是壞的」，⛔ 不會把空清單誤讀成「沒有歷史」。
package contentoverlay

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"sort"
	"time"

	"github.com/ggd/platform/internal/httpx"
	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"
	"github.com/go-git/go-git/v5/plumbing/object"
)

// overlayFile 是 repo 內的相對路徑（jsonstore 把它寫成 <root>/content-overlay/overlay.json，
// 而 repo 的根就是 content-overlay/ 那一層）。
const overlayFile = DocID + ".json"

// VersionsLimit 是下拉選單一次拿幾筆。⚠️ 有上界不是只有下界（第一守則）——
// 一個沒有上界的 `limit` 讓一個 query string 就能要求把整部歷史讀進記憶體。
const (
	VersionsLimitDefault = 50
	VersionsLimitMax     = 500
)

// VersionEntry 是下拉選單的一列。
type VersionEntry struct {
	// Hash 是完整 commit id；Short 是給人看的 7 碼。
	Hash  string `json:"hash"`
	Short string `json:"short"`
	// At / By 是這一版是什麼時候、誰存的。
	At time.Time `json:"at"`
	By string    `json:"by"`
	// Generation 是 overlay 自己的流水號（與 commit 一一對應，方便對帳）。
	Generation int `json:"generation"`
	// Summary 是「做了什麼」的一句話（op + key）。
	Summary string `json:"summary"`
	// Current 標記線上正在跑的那一版（永遠是第一列）。
	Current bool `json:"current"`
}

// VersionList 是 `Versions()` 的回傳。
type VersionList struct {
	Entries []VersionEntry `json:"entries"`
	// ⚠️ 歷史讀不到時為非空。⛔ 沒有這一格，空清單與「壞掉」長得一模一樣。
	Unavailable string `json:"unavailable,omitempty"`
}

// repoDir 回傳 overlay.json 所在的目錄 —— 那一層就是版本庫。
func (s *Service) repoDir() (string, error) {
	p, err := s.store.Path(Collection, DocID)
	if err != nil {
		return "", err
	}
	return filepath.Dir(p), nil
}

// openOrInitRepo 開啟版本庫，不存在就建一個。
//
// ⚠️ `git.PlainInit` 對一個**已經有檔案**的目錄是安全的：它只建 `.git/`，
// 不碰既有內容。所以既有主機第一次跑到這裡時，第一個 commit 就是「現況」。
func (s *Service) openOrInitRepo() (*git.Repository, error) {
	dir, err := s.repoDir()
	if err != nil {
		return nil, err
	}
	repo, err := git.PlainOpen(dir)
	if err == nil {
		return repo, nil
	}
	if !errors.Is(err, git.ErrRepositoryNotExists) {
		return nil, err
	}
	return git.PlainInit(dir, false)
}

// snapshot 把現在的 overlay.json 存成一個版本。
//
// ⚠️ **best-effort**：任何失敗都只 warn，⛔ 不讓它把一次成功的存檔變成失敗
// （同 MatchRecorder：壞掉的錄影不可以弄壞一場遊戲）。
func (s *Service) snapshot(o Overlay, by, op, k string) {
	repo, err := s.openOrInitRepo()
	if err != nil {
		slog.Warn("contentoverlay: 版本庫開不起來，這次存檔沒有留下版本", "err", err)
		return
	}
	wt, err := repo.Worktree()
	if err != nil {
		slog.Warn("contentoverlay: 版本庫的工作區讀不到", "err", err)
		return
	}
	if _, err := wt.Add(overlayFile); err != nil {
		slog.Warn("contentoverlay: overlay.json 加不進版本庫", "err", err)
		return
	}
	msg := fmt.Sprintf("gen %d · %s · %s", o.Generation, op, k)
	if _, err := wt.Commit(msg, &git.CommitOptions{
		Author: &object.Signature{
			// ⚠️ `by` 是操作者的帳號 ULID。它已經在 audit log 裡，這裡放在同一個
			// 地方是為了讓「哪一版是誰存的」不必跨兩份檔案對。
			Name:  by,
			Email: "admin@ggd.local",
			When:  o.UpdatedAt,
		},
		// ⚠️ `AllowEmptyCommits` 保持預設 false：連按兩次儲存而內容沒變時
		// ⛔ 不要多一列假的歷史。
	}); err != nil && !errors.Is(err, git.ErrEmptyCommit) {
		slog.Warn("contentoverlay: 版本存不進去（overlay 本身已經寫好了）", "err", err)
	}
}

// Versions 列出最近 n 版，最新的在最前面。
func (s *Service) Versions(ctx context.Context, limit int) (VersionList, error) {
	if limit <= 0 {
		limit = VersionsLimitDefault
	}
	if limit > VersionsLimitMax {
		limit = VersionsLimitMax
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	repo, err := s.openOrInitRepo()
	if err != nil {
		return VersionList{
			Entries:     []VersionEntry{},
			Unavailable: "版本庫開不起來：" + err.Error(),
		}, nil
	}
	iter, err := repo.Log(&git.LogOptions{Order: git.LogOrderCommitterTime})
	if err != nil {
		// 一個還沒有任何 commit 的新 repo 會走到這裡 —— 那不是錯誤，是「還沒有歷史」。
		return VersionList{Entries: []VersionEntry{}}, nil
	}
	defer iter.Close()

	out := make([]VersionEntry, 0, limit)
	err = iter.ForEach(func(c *object.Commit) error {
		if len(out) >= limit {
			return errStopIter
		}
		out = append(out, VersionEntry{
			Hash:       c.Hash.String(),
			Short:      c.Hash.String()[:7],
			At:         c.Author.When.UTC(),
			By:         c.Author.Name,
			Generation: generationFromMessage(c.Message),
			Summary:    firstLine(c.Message),
			Current:    len(out) == 0,
		})
		return nil
	})
	if err != nil && !errors.Is(err, errStopIter) {
		return VersionList{
			Entries:     out,
			Unavailable: "歷史讀到一半失敗：" + err.Error(),
		}, nil
	}
	return VersionList{Entries: out}, nil
}

var errStopIter = errors.New("stop")

// overlayAt 讀出某一版的整份 overlay。
func (s *Service) overlayAt(hash string) (Overlay, error) {
	repo, err := s.openOrInitRepo()
	if err != nil {
		return Overlay{}, err
	}
	h := plumbing.NewHash(hash)
	if h.IsZero() {
		return Overlay{}, httpx.BadRequest("版本編號不合法")
	}
	c, err := repo.CommitObject(h)
	if err != nil {
		return Overlay{}, httpx.BadRequest("找不到這一版：" + hash)
	}
	f, err := c.File(overlayFile)
	if err != nil {
		return Overlay{}, httpx.BadRequest("那一版裡沒有 " + overlayFile)
	}
	raw, err := f.Contents()
	if err != nil {
		return Overlay{}, err
	}
	var o Overlay
	if err := json.Unmarshal([]byte(raw), &o); err != nil {
		return Overlay{}, fmt.Errorf("那一版的 overlay 解不開：%w", err)
	}
	return normalizeOverlay(o), nil
}

// RestoreAll 把整份 overlay 換回某一版。
//
// ⭐ 它**鑄一個新版本**（generation +1），⛔ 不是把指標指回去 —— 見檔頭。
func (s *Service) RestoreAll(ctx context.Context, hash, by string) (Head, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	old, err := s.overlayAt(hash)
	if err != nil {
		return Head{}, err
	}
	cur, err := s.load()
	if err != nil {
		return Head{}, err
	}
	// 只換內容，⛔ 不換流水號 —— generation 必須單調遞增，否則「線上是第幾版」
	// 這個問題會有兩個答案。
	cur.Docs = old.Docs
	cur.Deleted = old.Deleted
	cur.Bases = old.Bases
	return s.commit(ctx, cur, by, "restore-all", shortHash(hash))
}

// RestoreDoc 只把**一份**文件換回某一版，其餘不動。
//
// ⭐ 它同樣鑄一個新的批次版本 —— 這是硬性的：不然兩個下拉選單會互相矛盾，
// 而且沒有辦法回答「線上現在跑的到底是什麼」。
func (s *Service) RestoreDoc(ctx context.Context, hash, collection, id, by string) (Head, error) {
	if err := validateKey(collection, id); err != nil {
		return Head{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	old, err := s.overlayAt(hash)
	if err != nil {
		return Head{}, err
	}
	cur, err := s.load()
	if err != nil {
		return Head{}, err
	}
	k := key(collection, id)
	doc, had := old.Docs[k]
	switch {
	case had:
		cur.Docs[k] = doc
		delete(cur.Deleted, k)
		if b, ok := old.Bases[k]; ok {
			cur.Bases[k] = b
		}
	case old.Deleted[k]:
		// 那一版把它刪了 ⇒ 還原成「刪掉」，⛔ 不是「不動」。
		delete(cur.Docs, k)
		cur.Deleted[k] = true
	default:
		// 那一版根本沒有這一格 ⇒ 還原成「沒有覆蓋」，回到出貨的那一份。
		delete(cur.Docs, k)
		delete(cur.Deleted, k)
		delete(cur.Bases, k)
	}
	return s.commit(ctx, cur, by, "restore-doc", k)
}

// ---------------------------------------------------------------- helpers ----

func shortHash(h string) string {
	if len(h) > 7 {
		return h[:7]
	}
	return h
}

func firstLine(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			return s[:i]
		}
	}
	return s
}

// generationFromMessage 從 "gen 12 · put · champions/sela" 挖出 12。
// 挖不到回 0 —— ⛔ 不要猜，0 在畫面上讀作「不明」。
func generationFromMessage(msg string) int {
	var g int
	if _, err := fmt.Sscanf(firstLine(msg), "gen %d", &g); err != nil {
		return 0
	}
	return g
}

// normalizeOverlay 補齊三個 map，讓還原回來的舊版本不會帶著 nil map 進來
// （`EmptyOverlay` 的同一條契約：兩個 map ALWAYS non-nil）。
func normalizeOverlay(o Overlay) Overlay {
	if o.Docs == nil {
		o.Docs = map[string]json.RawMessage{}
	}
	if o.Deleted == nil {
		o.Deleted = map[string]bool{}
	}
	if o.Bases == nil {
		o.Bases = map[string]BaseRef{}
	}
	return o
}

// DocVersions 列出**某一份文件**在歷史上變動過的那幾版（單項下拉選單）。
//
// ⚠️ 它不是 `Versions()` 的過濾 —— 一份文件在大多數版本裡都沒有變，把那些列出來
// 只會讓下拉選單塞滿「跟現在一樣」的選項。這裡只回**內容真的變過**的那幾版。
func (s *Service) DocVersions(ctx context.Context, collection, id string, limit int) (VersionList, error) {
	if err := validateKey(collection, id); err != nil {
		return VersionList{}, err
	}
	all, err := s.Versions(ctx, VersionsLimitMax)
	if err != nil || all.Unavailable != "" {
		return all, err
	}
	if limit <= 0 || limit > VersionsLimitMax {
		limit = VersionsLimitDefault
	}
	k := key(collection, id)

	out := make([]VersionEntry, 0, limit)
	var prev string
	// ⚠️ 由舊到新掃，才知道「這一版跟上一版比有沒有變」。
	sort.SliceStable(all.Entries, func(i, j int) bool {
		return all.Entries[i].At.Before(all.Entries[j].At)
	})
	for _, e := range all.Entries {
		o, err := s.overlayAt(e.Hash)
		if err != nil {
			continue
		}
		cur := docFingerprint(o, k)
		if cur == prev {
			continue
		}
		prev = cur
		e.Current = false
		out = append(out, e)
	}
	// 最新的在最前面，並標記現行那一版。
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	if len(out) > 0 {
		out[0].Current = true
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return VersionList{Entries: out}, nil
}

// docFingerprint 是「這一版對這一格說了什麼」的可比字串。
// 三種狀態各自不同：有內容 / 被刪掉 / 沒有覆蓋。
func docFingerprint(o Overlay, k string) string {
	if doc, ok := o.Docs[k]; ok {
		return "doc:" + string(doc)
	}
	if o.Deleted[k] {
		return "deleted"
	}
	return "absent"
}
