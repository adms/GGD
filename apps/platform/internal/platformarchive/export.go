package platformarchive

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
)

// ExportOptions parameterise Export.
type ExportOptions struct {
	// DataDir is the DATA_DIR to read. Required.
	DataDir string
	// ContentDir is the content/ tree, read only for the version stamp.
	ContentDir string
	// ReplayDir is where the game-server's recordings live. Empty defaults to
	// <DataDir>/replays. A missing directory reports zero files and is NOT an
	// error — see failure mode #7.
	ReplayDir string
	// Groups selects what to carry. core is always included.
	Groups []string
	// PlatformVersion stamps Source.PlatformVersion.
	PlatformVersion string
	// Now / Hostname / Tool override the environment (tests).
	Now      func() time.Time
	Hostname string
	Tool     string
	// SkipDir, when non-nil, excludes an absolute directory from the replay
	// enumeration. Used to keep _migration backups out of a re-export.
	SkipDir func(path string) bool
}

// ExportReport is what the CLI prints and the console renders: what went in,
// what did not, and why.
type ExportReport struct {
	Groups      []string         `json:"groups"`
	Collections []CollectionInfo `json:"collections"`
	Entries     int              `json:"entries"`
	Bytes       int64            `json:"bytes"`
	Notes       []string         `json:"notes"`
	Warnings    []string         `json:"warnings"`
}

func (r *ExportReport) note(format string, args ...any) {
	r.Notes = append(r.Notes, fmt.Sprintf(format, args...))
}

func (r *ExportReport) warn(format string, args ...any) {
	r.Warnings = append(r.Warnings, fmt.Sprintf(format, args...))
}

// Preview sizes an export WITHOUT producing one, so the console can show the
// operator what each group costs before they click.
type Preview struct {
	Groups []GroupPreview `json:"groups"`
}

// GroupPreview is one row of the export tab's checklist.
type GroupPreview struct {
	Group   string `json:"group"`
	ZH      string `json:"zh"`
	Entries int    `json:"entries"`
	Bytes   int64  `json:"bytes"`
	// Note carries the group-specific caveat the UI must show (replays, above
	// all: they belong to the game-server and scp is the better tool).
	Note string `json:"note,omitempty"`
}

// exportItem is one file selected for the archive.
type exportItem struct {
	collection string
	id         string // the archive id (no extension for doc/jsonl; full name for opaque)
	name       string // entry name inside the ZIP
	path       string // absolute source path
	size       int64
}

// selectItems walks the RULE TABLE — never the data directory — and returns
// every file in scope, grouped by collection.
//
// THE ENUMERATION IS `Scan`, NEVER `List`. jsonstore.readIndex reads a MISSING
// _index.json as an EMPTY collection (fail-OPEN). A source host with a lost or
// corrupt index would therefore export an archive with ZERO ACCOUNTS that then
// imports perfectly, leaving the new host with nobody on it. #225's
// GrantCrystalAll already chose Scan over List for exactly this reason
// (internal/admin/admin.go). We additionally compare the two counts and warn
// when they disagree, so a broken index on the SOURCE is visible rather than
// merely survived.
func selectItems(store *jsonstore.Store, opts ExportOptions, groups []string, rep *ExportReport) (map[string][]exportItem, error) {
	root := store.Root()
	want := map[string]bool{}
	for _, g := range groups {
		want[g] = true
	}
	out := map[string][]exportItem{}

	for _, rule := range Rules() {
		if !want[rule.Group] {
			continue
		}
		if rule.Kind == KindOpaque {
			items, err := selectReplays(opts, rep)
			if err != nil {
				return nil, err
			}
			if len(items) > 0 {
				out[ColReplays] = items
			}
			continue
		}
		cols, err := rule.Enum(root)
		if err != nil {
			return nil, err
		}
		for _, col := range cols {
			ext := ".json"
			if rule.Kind == KindJSONL {
				ext = ".jsonl"
			}
			ids, err := scanCollection(root, col, ext)
			if err != nil {
				return nil, fmt.Errorf("platformarchive: scanning %s: %w", col, err)
			}
			if rule.Kind == KindDoc {
				if listed, err := store.List(col); err == nil && len(listed) != len(ids) {
					rep.warn("%s: _index.json lists %d id(s) but %d file(s) exist on disk — "+
						"this archive follows THE FILES. Check the source host's index.",
						col, len(listed), len(ids))
				}
			}
			items := []exportItem{}
			for _, id := range sortedIDs(ids) {
				if rule.AllowID != nil && !rule.AllowID(id) {
					continue
				}
				p := filepath.Join(root, filepath.FromSlash(col), id+ext)
				st, err := os.Stat(p)
				if err != nil {
					return nil, err
				}
				items = append(items, exportItem{
					collection: col, id: id, name: col + "/" + id + ext, path: p, size: st.Size(),
				})
			}
			if len(items) > 0 {
				out[col] = items
			}
		}
	}
	return out, nil
}

// scanCollection lists the ids of the files that ACTUALLY EXIST, by reading the
// directory. It is jsonstore.Scan generalised to the .jsonl extension.
func scanCollection(root, col, ext string) ([]string, error) {
	entries, err := os.ReadDir(filepath.Join(root, filepath.FromSlash(col)))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	ids := []string{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || name == "_index.json" || !strings.HasSuffix(name, ext) {
			continue
		}
		// A .json filter would also match .jsonl; guard the reverse too.
		if ext == ".json" && strings.HasSuffix(name, ".jsonl") {
			continue
		}
		id := strings.TrimSuffix(name, ext)
		if !entryIDRe.MatchString(id) {
			continue
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// ReplayDirFor resolves where the recordings live. GGD_ARCHIVE_REPLAY_DIR wins,
// then the explicit option, then <DataDir>/replays.
func ReplayDirFor(dataDir, override string) string {
	if env := strings.TrimSpace(os.Getenv("GGD_ARCHIVE_REPLAY_DIR")); env != "" {
		return env
	}
	if strings.TrimSpace(override) != "" {
		return override
	}
	return filepath.Join(dataDir, ColReplays)
}

// selectReplays enumerates the game-server's recordings. They are OPAQUE: this
// package copies bytes and never parses the format.
func selectReplays(opts ExportOptions, rep *ExportReport) ([]exportItem, error) {
	dir := ReplayDirFor(opts.DataDir, opts.ReplayDir)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			rep.note("對戰回放：%s 不存在，本次封存帶 0 個回放（這是 game-server 的目錄，不是平台資料）。", dir)
			return nil, nil
		}
		return nil, err
	}
	items := []exportItem{}
	names := []string{}
	byName := map[string]os.DirEntry{}
	for _, e := range entries {
		if e.IsDir() || !entryIDRe.MatchString(e.Name()) {
			continue
		}
		names = append(names, e.Name())
		byName[e.Name()] = e
	}
	sort.Strings(names)
	for _, name := range names {
		info, err := byName[name].Info()
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			continue
		}
		p := filepath.Join(dir, name)
		if opts.SkipDir != nil && opts.SkipDir(p) {
			continue
		}
		items = append(items, exportItem{
			collection: ColReplays, id: name, name: ColReplays + "/" + name, path: p, size: info.Size(),
		})
	}
	return items, nil
}

// BuildPreview sizes each group without writing anything.
func BuildPreview(opts ExportOptions) (*Preview, error) {
	store, err := jsonstore.New(opts.DataDir)
	if err != nil {
		return nil, err
	}
	pv := &Preview{}
	for _, g := range AllGroups {
		rep := &ExportReport{}
		items, err := selectItems(store, opts, []string{g}, rep)
		if err != nil {
			return nil, err
		}
		row := GroupPreview{Group: g, ZH: GroupZH[g]}
		for col, list := range items {
			r := RuleFor(col)
			if r == nil || r.Group != g {
				continue
			}
			for _, it := range list {
				row.Entries++
				row.Bytes += it.size
			}
		}
		switch g {
		case GroupCore:
			row.Note = "一定帶，無法取消。內含每一位家人的密碼雜湊與未兌換的邀請碼。"
		case GroupReplays:
			row.Note = "這是 game-server 的檔案，放在另一個掛載點。建議用 scp -r data/replays/ 直接搬，比走這裡快也穩。"
		case GroupMatches:
			row.Note = "含玩家顯示名。不帶＝歷史對戰查不到，排行榜不受影響。"
		case GroupAudit:
			row.Note = "管理稽核軌跡。匯入到已有紀錄的主機時一律略過，永不覆寫。"
		case GroupHistory:
			row.Note = "每人的對戰履歷（append-only）。"
		}
		pv.Groups = append(pv.Groups, row)
	}
	return pv, nil
}

// Export streams a sealed archive into w.
//
// It reads the FILESYSTEM, not a running platform: the JSON files are the
// platform's own definition of truth, it needs no credentials, and it works on
// a host whose platform will not boot — which is exactly the situation a
// migration is for. (Same reasoning as opstate.Export.)
func Export(w io.Writer, opts ExportOptions) (*ExportReport, error) {
	if opts.DataDir == "" {
		return nil, errors.New("platformarchive: DataDir is required")
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	groups, err := NormalizeGroups(opts.Groups)
	if err != nil {
		return nil, err
	}
	store, err := jsonstore.New(opts.DataDir)
	if err != nil {
		return nil, err
	}
	host := opts.Hostname
	if host == "" {
		host, _ = os.Hostname()
	}
	tool := opts.Tool
	if tool == "" {
		tool = "platformarchive/1"
	}

	rep := &ExportReport{Groups: groups}
	items, err := selectItems(store, opts, groups, rep)
	if err != nil {
		return nil, err
	}

	cols := make([]string, 0, len(items))
	for col := range items {
		cols = append(cols, col)
	}
	sort.Strings(cols)

	man := &Manifest{
		Kind:           Kind,
		ArchiveVersion: ArchiveVersion,
		ExportedAt:     now().UTC(),
		Source: Source{
			DataDir:         store.Root(),
			Host:            host,
			ContentVersion:  readContentVersion(opts.ContentDir, rep),
			PlatformVersion: opts.PlatformVersion,
			Tool:            tool,
		},
		Scope:   Scope{Selected: groups, Excluded: ExcludedItems()},
		Entries: map[string]int64{},
	}

	zw := zip.NewWriter(w)
	for _, col := range cols {
		rule := RuleFor(col)
		if rule == nil {
			// Unreachable: selectItems only ever produces rule-derived names.
			return nil, fmt.Errorf("platformarchive: internal: no rule for %q", col)
		}
		hasher := newCollectionHasher()
		for _, it := range items[col] {
			if len(man.Entries) >= MaxEntries {
				return nil, fmt.Errorf(
					"platformarchive: this data dir has more than %d files in scope — "+
						"deselect 對戰紀錄 / 對戰回放, or move the replays with scp", MaxEntries)
			}
			f, err := os.Open(it.path) // #nosec G304 -- path built from the rule table + a name that matched entryIDRe.
			if err != nil {
				return nil, err
			}
			// Re-stat through the OPEN handle so the size we declare and the
			// bytes we hash cannot drift if the file changes under us.
			st, err := f.Stat()
			if err != nil {
				_ = f.Close()
				return nil, err
			}
			size := st.Size()
			if err := hasher.addEntry(it.id, size); err != nil {
				_ = f.Close()
				return nil, err
			}
			zf, err := zw.Create(it.name)
			if err != nil {
				_ = f.Close()
				return nil, err
			}
			n, err := io.Copy(io.MultiWriter(zf, hasher), io.LimitReader(f, size))
			_ = f.Close()
			if err != nil {
				return nil, err
			}
			if n != size {
				return nil, fmt.Errorf("platformarchive: %s changed size while being read", it.name)
			}
			man.Entries[it.name] = size
			man.Totals.Entries++
			man.Totals.UncompressedBytes += size
		}
		digest, count, bytes := hasher.sum()
		man.Collections = append(man.Collections, CollectionInfo{
			Name: col, Kind: rule.Kind, Group: rule.Group, ZH: rule.ZH,
			Entries: count, Bytes: bytes, SHA256: digest,
		})
	}
	rep.Collections = man.Collections
	rep.Entries = man.Totals.Entries
	rep.Bytes = man.Totals.UncompressedBytes

	// Say out loud what was deliberately left behind, so "it is not in the
	// archive" is never confused with "I forgot" (opstate/export.go does the
	// same, for the same reason).
	for _, ex := range ExcludedItems() {
		rep.note("未帶走 %s — %s", ex.Name, ex.Reason)
	}
	if man.CountFor(colAccounts) == 0 {
		rep.warn("這包沒有任何帳號文件。匯入到新主機後將沒有人可以登入 —— " +
			"請確認來源 DATA_DIR 正確，且 data/accounts/ 真的有檔案。")
	}
	rep.warn("這個檔案含 %d 個帳號的密碼雜湊與 %d 個邀請碼，等同整個平台的鑰匙。用 scp 或隨身碟傳，"+
		"不要用 email／聊天軟體／雲端硬碟，匯入完成後兩邊都刪掉。",
		man.CountFor(colAccounts), man.CountFor(colInvites))

	if err := man.Seal(); err != nil {
		return nil, err
	}
	data, err := man.Marshal()
	if err != nil {
		return nil, err
	}
	mf, err := zw.Create(ManifestName)
	if err != nil {
		return nil, err
	}
	if _, err := mf.Write(data); err != nil {
		return nil, err
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return rep, nil
}

// contentManifest is the subset of content/manifest.json this package reads.
type contentManifest struct {
	ContentVersion string `json:"contentVersion"`
}

// readContentVersion stamps the archive with the content tree it was exported
// against, so a stale archive is VISIBLE. Best-effort.
func readContentVersion(contentDir string, rep *ExportReport) string {
	if contentDir == "" {
		rep.note("沒有給 CONTENT_DIR — 這包沒有內容版本戳記，匯入端看不出它是否過期。")
		return ""
	}
	// #nosec G304 -- operator-configured CONTENT_DIR joined with a literal.
	raw, err := os.ReadFile(filepath.Join(contentDir, "manifest.json"))
	if err != nil {
		rep.warn("讀不到 %s：%v — 這包沒有內容版本戳記。", filepath.Join(contentDir, "manifest.json"), err)
		return ""
	}
	var m contentManifest
	if err := json.Unmarshal(raw, &m); err != nil {
		rep.warn("內容 manifest 格式錯誤：%v — 這包沒有內容版本戳記。", err)
		return ""
	}
	return m.ContentVersion
}

// ArchiveFileName is the download name: host + UTC timestamp, so two archives
// from two machines never collide in a downloads folder.
func ArchiveFileName(host string, at time.Time) string {
	safe := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return '-'
		}
	}, host)
	if safe == "" {
		safe = "unknown"
	}
	return fmt.Sprintf("ggd-platform-archive-%s-%sZ.zip", safe, at.UTC().Format("20060102-150405"))
}
