package submissions

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestCommunityResolverRequiresCurrentManualPublication(t *testing.T) {
	s, bridge := heroFixture(t)
	for version, inspection := range bridge.inspections {
		inspection.Project = json.RawMessage(`{"projectId":"hero-proof","brief":{"name":"完整英雄"}}`)
		bridge.inspections[version] = inspection
	}
	first := freezeHero(t, s, "v1")
	if _, err := s.ResolvePublished([]string{"hero-proof"}); err == nil {
		t.Fatal("unreviewed candidate selectable")
	}
	firstControl := publishHero(t, s, first, "publish-v1")
	pins, err := s.ResolvePublished([]string{"hero-proof"})
	if err != nil || len(pins) != 1 || pins[0].SubmissionID != first.ID || pins[0].PackageDigest != first.Version.PackageDigest {
		t.Fatalf("wrong fixed pointer: %v %+v", err, pins)
	}
	second := freezeHero(t, s, "v2")
	if next, err := s.ResolvePublished([]string{"hero-proof"}); err != nil || next[0].SubmissionID != first.ID {
		t.Fatal("pending candidate replaced published version")
	}
	publishHero(t, s, second, "publish-v2")
	if next, err := s.ResolvePublished([]string{"hero-proof"}); err != nil || next[0].SubmissionID != second.ID {
		t.Fatal("new rooms did not select new published version")
	}
	if pins[0].SubmissionID != firstControl.Published.SubmissionID {
		t.Fatal("old room pin mutated")
	}
	if _, err := s.ResolvePublished([]string{"hero-proof", "hero-proof"}); err == nil {
		t.Fatal("duplicate work accepted")
	}
	if _, err := s.Unpublish("hero-proof", "withdraw", "下架驗收", "admin", controlOf(t, s).Revision); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ResolvePublished([]string{"hero-proof"}); err == nil {
		t.Fatal("withdrawn work revived from history")
	}
}

// A transport fixture supplies release identity; durable submissions, approval,
// publication pointers and withdrawal use the actual service.
type rosterBridge struct {
	*workflowBridge
	target json.RawMessage
}

func (b *rosterBridge) Target(context.Context) (json.RawMessage, error) { return b.target, nil }
func (b *rosterBridge) Build(context.Context, []byte) ([]byte, error)   { panic("unused") }

func TestOfficialRosterIncludes37AndPinsOnlyCurrentCompatiblePublications(t *testing.T) {
	s, b := heroFixture(t)
	s.bridge = &rosterBridge{b, json.RawMessage(`{"schema":"ggd-content-target-profile@1","gameVersion":"game","base":{"contentVersion":"content"},"migrationFingerprint":"migration","authoringProcessor":{"fingerprint":"processor"}}`)}
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) {
		return HeroIntakePolicy{Enabled: true, MaxPendingPerPlayer: 50, QuotaPerPlayerPerDay: 100, MaxBytes: 262144}, nil
	})
	for n := 0; n < 37; n++ {
		id := fmt.Sprintf("hero-%02d", n)
		b.inspections[id] = HeroInspection{Schema: "ggd-hero-package-inspection@1", PackageDigest: heroHash(id), Project: json.RawMessage(fmt.Sprintf(`{"projectId":%q,"brief":{"name":%q}}`, id, id)), Manifest: json.RawMessage(`{"base":{"gameRevision":"game","contentVersion":"content"},"migrationFingerprint":"migration","authoringProcessor":{"fingerprint":"processor"}}`), Icons: json.RawMessage(`[]`), Diagnostics: json.RawMessage(`[]`)}
		if _, err := s.SaveDraft("alice", id, 0, heroDraft(id), nil); err != nil {
			t.Fatal(err)
		}
		snap, err := s.Submit(context.Background(), "alice", id, "submit-"+id, []byte(id), false)
		if err != nil {
			t.Fatal(err)
		}
		control, err := s.Control(id)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = s.Publish(context.Background(), snap.ID, "publish-"+id, "publish", "checked", "admin", control.Revision); err != nil {
			t.Fatal(err)
		}
	}
	pins, err := s.ResolveRoster(context.Background())
	if err != nil || len(pins) != 37 {
		t.Fatalf("37 published heroes missing: %d %v", len(pins), err)
	}
	// Saving a draft does not change the active version, even when intake closes.
	s.SetIntakePolicy(func() (HeroIntakePolicy, error) { return HeroIntakePolicy{}, nil })
	if _, err = s.SaveDraft("alice", "hero-00", 1, heroDraft("hero-00"), nil); err != nil {
		t.Fatal(err)
	}
	next, err := s.ResolveRoster(context.Background())
	if err != nil || len(next) != 37 || next[0] != pins[0] {
		t.Fatal("draft or intake changed active version", err)
	}
	control, err := s.Control("hero-00")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.Unpublish("hero-00", "down", "checked", "admin", control.Revision); err != nil {
		t.Fatal(err)
	}
	next, err = s.ResolveRoster(context.Background())
	if err != nil || len(next) != 36 {
		t.Fatal("withdrawn hero remained selectable", err)
	}
	// Historical pins survive and are not mutated by new room resolution.
	if pins[0].WorkID != "hero-00" {
		t.Fatal("previous match pin changed")
	}
	// ⭐⭐ GH#1157（owner 2026-09-09：「74 名一旦上架，下一次部署就會全部靜靜消失 => 開票修阿」）
	//
	// ⚠️ 這一段在 2026-09-10 之前斷言的是「**只改 gameVersion** ⇒ 37 名全部掉出名單」——
	// ⛔ 而 `gameVersion` 來自 `GGD_BUILD_STAMP`，也就是說那條斷言逐字描述的是
	//   **每一次部署都讓已上架的英雄消失**。⭐ 那不是相容性，那是這張票要修的缺陷。
	//
	// ⇒ ⭐ 出貨預設 `migration` 之後，這裡改成問**兩個方向**（第〇·六守則：預設改了就測新的預設）。

	// ① ⭐ 只有 gameVersion 變（＝一次部署）⇒ **一名都不可以掉**
	s.bridge.(*rosterBridge).target = json.RawMessage(`{"schema":"ggd-content-target-profile@1","gameVersion":"next-game","base":{"contentVersion":"content"},"migrationFingerprint":"migration","authoringProcessor":{"fingerprint":"processor"}}`)
	if next, err = s.ResolveRoster(context.Background()); err != nil || len(next) != 36 {
		t.Fatalf("⛔ 一次部署（只有 gameVersion 變）讓已上架英雄掉出名單：剩 %d，期望 36 —— GH#1157", len(next))
	}

	// ② ⭐ 反方向：`migrationFingerprint` 真的變了（資料需要轉換）⇒ **必須全部擋下**
	//    ⛔ 少了這一列，這一票就變成「把閘關掉」而不是「把它問對問題」。
	s.bridge.(*rosterBridge).target = json.RawMessage(`{"schema":"ggd-content-target-profile@1","gameVersion":"next-game","base":{"contentVersion":"content"},"migrationFingerprint":"migration-v2","authoringProcessor":{"fingerprint":"processor"}}`)
	if next, err = s.ResolveRoster(context.Background()); err != nil || len(next) != 0 {
		t.Fatalf("⛔ 遷移指紋變了卻仍然進場：%d 名 —— 那不是放寬，那是沒有閘", len(next))
	}
	s.bridge.(*rosterBridge).target = json.RawMessage(`{}`)
	if _, err = s.ResolveRoster(context.Background()); err == nil {
		t.Fatal("missing target silently accepted")
	}
}
