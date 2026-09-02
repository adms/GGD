package submissions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// SyncIOOwnership answers "is this shipped document a generator product?" by
// reading the MEASURED registry (`tools/parallel-gates/sync-io.json`).
//
// ⭐⭐ **它讀的是量出來的戶籍表，⛔ 不是一份手寫的路徑清單。**
//
// ── ⚠️ 為什麼那個區別是這一支存在的理由 ────────────────────────────────
// CLAUDE.md 逐字：「⛔ 不要記路徑，要問工具」——
// `content/` 底下是**混的**（621 份產物與手編檔並存），⭐ 而肉眼分不出來。
// ⇒ 一份手寫的「哪些是產物」清單會過期，⛔ 而它過期時**不會有東西紅**。
//
// ── ⛔ 而「正規化器」不算作者 ───────────────────────────────────────────
// 戶籍表裡有兩種寫入端：**產生器**（產出整份文件）與**正規化器**
// （就地改一兩個欄位，例如 `castTimeSec` / `provenance`）。
// ⭐ 只有前者讓「直接寫這份文件」變成錯的 —— ⛔ 把後者也算進去，
// 會讓 331 份**手編**技能落進「改產物被擋／改來源沒有來源」的死路
// （GH#707 記錄過：那個形狀一天內擋掉三條 lane）。
type SyncIOOwnership struct {
	repoRoot string
	once     sync.Once
	// authored 是「有**作者**（產生器）」的那些路徑。
	authored map[string]bool
	loaded   bool
}

// NewSyncIOOwnership builds the oracle. `repoRoot` 是 repo 根。
func NewSyncIOOwnership(repoRoot string) *SyncIOOwnership {
	return &SyncIOOwnership{repoRoot: repoRoot}
}

func (o *SyncIOOwnership) load() {
	type step struct {
		Name   string   `json:"name"`
		Writes []string `json:"writes"`
	}
	type io struct {
		Steps []step `json:"steps"`
	}
	type norm struct {
		Step string `json:"step"`
		// ⭐⭐ 這一支**只在自己 `writes` 之外**才是正規化器 —— 在裡面它是**作者**。
		//
		// ⚠️ ⛔ 忽略這一格是**同一個 bug 的第二個實例**：TypeScript 那側
		// （`editorSource.ts` 的 `ownershipOf`）2026-09-02 才修過同一條 ——
		// `skillremake:json` 內部呼叫 `deriveCastTimes` ⇒ 它被登記成正規化器，
		// ⛔ 而一旦「登記了就整支跳過」，它**逐檔列名產生**的 126 份就會
		// 被判成手編檔 ⇒ ⭐ 通用 promote 會放行它們，而下一次 sync 打回來。
		OnlyOutsideOwnWrites bool `json:"onlyOutsideOwnWrites"`
	}
	type norms struct {
		Normalizers []norm `json:"normalizers"`
	}
	base := filepath.Join(o.repoRoot, "tools", "parallel-gates")
	ioRaw, err := os.ReadFile(filepath.Join(base, "sync-io.json"))
	if err != nil {
		return // ⛔ 讀不到 ⇒ `loaded` 留 false ⇒ 呼叫端 fail-closed
	}
	nRaw, err := os.ReadFile(filepath.Join(base, "normalizers.json"))
	if err != nil {
		return
	}
	var i io
	var n norms
	if json.Unmarshal(ioRaw, &i) != nil || json.Unmarshal(nRaw, &n) != nil {
		return
	}
	normalizerOnly := map[string]bool{}
	for _, x := range n.Normalizers {
		// ⭐ 帶 `onlyOutsideOwnWrites` 的**不算**純正規化器 ——
		//   ⚠️ `writes` 已經只列「這一支真的產生的檔」⇒ 出現在裡面就代表它是作者。
		if x.OnlyOutsideOwnWrites {
			continue
		}
		normalizerOnly[x.Step] = true
		normalizerOnly[strings.TrimSuffix(x.Step, ":raw")] = true
	}
	o.authored = map[string]bool{}
	for _, st := range i.Steps {
		// ⭐ 正規化器的 writes **不算作者**（見型別註解）。
		if normalizerOnly[st.Name] || normalizerOnly[st.Name+":raw"] {
			continue
		}
		for _, w := range st.Writes {
			// ⛔ glob 一律跳過 —— ⭐ 一條 `content/abilities/*.json` 會把
			//   **全部 422 份**算成產物，而 CLAUDE.md 逐字記過那個誤判
			//   （「一個被 glob 灌大的統計，讀起來跟真的一模一樣」）。
			//
			// ⚠️ ⭐ **誠實記著：這一行今天不是承重的。** 突變驗過（拿掉它 → 仍然綠）——
			//   因為出貨戶籍表裡**帶 glob 的那幾支正好都是正規化器**，
			//   ⇒ 它們在上面那個 `normalizerOnly` 判斷就已經走了。
			//   ⭐ 留著是防禦性的：哪天一支**真的產生器**用 glob 宣告 writes，
			//   ⛔ 沒有這一行它會把整個目錄算成產物。
			if strings.ContainsAny(w, "*?[") {
				continue
			}
			o.authored[w] = true
		}
	}
	o.loaded = true
}

// IsGeneratorOwned implements GeneratorOwned.
//
// ⚠️ ⭐ 回 `ok=false` 的每一條路都讓呼叫端**拒絕 promote** ——
// ⛔「查不到」與「不是產物」是兩件事，而只有後者可以上線。
func (o *SyncIOOwnership) IsGeneratorOwned(collection, id string) (bool, bool) {
	o.once.Do(o.load)
	if !o.loaded {
		return false, false // ⛔ 戶籍表讀不到 ⇒ 不知道
	}
	if collection == "" || id == "" {
		return false, false
	}
	// ⭐ 出貨文件的路徑形狀（與 content-api 的 `productPathOf` 同一個規則）。
	p := "content/" + collection + "/" + id + ".json"
	return o.authored[p], true
}
