package submissions

import (
	"testing"
	"time"

	"github.com/ggd/platform/internal/data/jsonstore"
)

func newSvc(t *testing.T) *Service {
	t.Helper()
	store, err := jsonstore.New(t.TempDir())
	if err != nil {
		t.Fatalf("jsonstore: %v", err)
	}
	s := New(store)
	n := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	s.SetNow(func() time.Time { n = n.Add(time.Second); return n })
	s.SetGeneratorOwned(notOwned{})
	// ⭐ GH#1022 —— 這一批夾具的 payload 是 `{"a":1}`（⛔ 不是一份 package），而它們
	//   驗的是裁決／promote 的機制，⛔ 不是 digest。⇒ 明確把重算關掉
	//   （nil ⇒ 視為 on ⇒ 全部 503）。重算那條路的守衛在 digest_test.go。
	s.SetDigestRecompute(func() bool { return false })
	return s
}

func mat(id, digest string) Material {
	// ⭐ GH#932 —— 夾具帶 `Target`：一份**不宣告落點**的候選現在 promote 不了
	//   （⭐ 那正是新閘要的行為，⛔ 而它在落地當下就把這幾條舊夾具擋下來了）。
	return Material{
		ID: id, AccountID: "acct-1", Kind: "ability", Digest: digest, Payload: `{"a":1}`,
		Target: &Target{Collection: "abilities", ID: "手編的技能"},
	}
}

// notOwned 是一個**永遠說「不是產物」**的擁有權來源（測試用）。
// ⚠️ ⭐ 它刻意回 `ok=true` —— ⛔ 「查得到而不是產物」與「查不到」是**兩件事**，
//
//	而只有前者可以 promote。
type notOwned struct{}

func (notOwned) IsGeneratorOwned(string, string) (bool, bool) { return false, true }

// ⭐⭐ 承重：**核准之後把內容換掉，它就不再看得見**。
//
// ⚠️ 這是這整個套件存在的理由 —— 繞過審核最便宜的一招就是
// 「先送一份乾淨的、核准之後再把內容換掉」。
// ⛔ 一個只驗 status 的實作對這條路是**全綠**的。
//
// MUTATION（落地前跑過）：`Discoverable` 的第二個條件拿掉（只留 status 檢查）
// → 🔴（換過內容之後仍然 Discoverable=true）。
func TestApprovedThenSwappedIsNotDiscoverable(t *testing.T) {
	s := newSvc(t)

	if _, err := s.Submit(mat("sub-1", "sha-clean")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	v, err := s.Decide("sub-1", StatusApproved, "", "admin-1")
	if err != nil {
		t.Fatalf("decide: %v", err)
	}
	// 儀器：先證明「核准過的**真的**看得見」—— 否則下面永遠是 false 也會綠。
	if !v.Discoverable {
		t.Fatalf("儀器壞了：剛核准的投稿應該看得見，got %+v", v)
	}

	// ⭐ 內容換掉（同一個 id，不同的指紋）——⛔ 而**沒有人再審一次**。
	after, err := s.Submit(mat("sub-1", "sha-EVIL"))
	if err != nil {
		t.Fatalf("resubmit: %v", err)
	}
	if after.Discoverable {
		t.Fatalf("⛔⛔ 核准之後換掉內容，它**還是看得見** —— 審核被繞過了：%+v", after)
	}
	// ⭐ 而裁決檔**刻意留著** —— 這樣才說得出「它核准過，但核准的是別的內容」。
	if after.Status != StatusApproved {
		t.Fatalf("裁決不該被銷毀（證據要留著），got status=%q", after.Status)
	}
}

// ⭐ 反方向：沒有人審過的東西，⛔ 一個都不可以出現在公開清單裡。
func TestPendingIsNeverDiscoverable(t *testing.T) {
	s := newSvc(t)
	if _, err := s.Submit(mat("sub-2", "sha-x")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	list, err := s.List(func(v View) bool { return v.Discoverable })
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("⛔ 沒有人審過的內容出現在公開清單裡：%+v", list)
	}
	// 否決的也一樣。
	if _, err := s.Decide("sub-2", StatusRejected, "測試", "admin-1"); err != nil {
		t.Fatalf("decide: %v", err)
	}
	got, _ := s.Get("sub-2")
	if got.Discoverable {
		t.Fatalf("⛔ 被否決的內容看得見：%+v", got)
	}
}

// ⭐ 兩個寫入端**分署** —— 材料那一半不可以帶著裁決欄位，反之亦然
// （owner 2026-08-27：「批核材料跟批核結果分署不同資料夾」）。
func TestTwoWritersTwoCollections(t *testing.T) {
	s := newSvc(t)
	if _, err := s.Submit(mat("sub-3", "sha-y")); err != nil {
		t.Fatalf("submit: %v", err)
	}
	if _, err := s.Decide("sub-3", StatusApproved, "", "admin-1"); err != nil {
		t.Fatalf("decide: %v", err)
	}

	var m Material
	if err := s.store.Get(CollectionMaterial, "sub-3", &m); err != nil {
		t.Fatalf("material: %v", err)
	}
	var v Verdict
	if err := s.store.Get(CollectionVerdict, "sub-3", &v); err != nil {
		t.Fatalf("verdict: %v", err)
	}
	// ⭐ 欄位集合刻意不相交 ⇒ 一邊的 bug 或一次併發，吃不掉另一邊。
	if m.Digest == "" || v.ApprovedDigest == "" {
		t.Fatalf("兩半都要有自己的指紋：material=%q verdict=%q", m.Digest, v.ApprovedDigest)
	}
	if v.ApprovedDigest != m.Digest {
		t.Fatalf("剛核准時兩邊的指紋要相等")
	}
}

// ⭐ 誤打守衛：一個跑迴圈的腳本不可以把審核佇列灌爆。
func TestPendingQuotaPerAccount(t *testing.T) {
	s := newSvc(t)
	for i := 0; i < MaxPerAccount; i++ {
		id := "sub-q" + string(rune('a'+i%26)) + string(rune('a'+i/26))
		if _, err := s.Submit(mat(id, "sha-"+id)); err != nil {
			t.Fatalf("submit %d: %v", i, err)
		}
	}
	if _, err := s.Submit(mat("sub-over", "sha-over")); err == nil {
		t.Fatalf("⛔ 第 %d 份等審投稿應該被擋下來", MaxPerAccount+1)
	}
}
