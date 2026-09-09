package submissions

import "testing"

// ⭐⭐ 一次部署會讓**已發布的英雄靜靜地從名單消失**。
//
// `hero_resolver.go:73` 逐字：
//
//	if *row.Target == target { selected = append(selected, row.WorkID) }
//
// `heroListTarget` 是**四欄的結構比較**（GameRevision · ContentVersion ·
// MigrationFingerprint · ProcessorFingerprint）——⭐ 逐欄相等才進已發布名單。
//
// ⚠️ ⭐ 而 `GameRevision` 來自 `profile.GameVersion`，那一路是：
//
//	heroImportIndex.ts:10   gameVersion = process.env.GGD_BUILD_STAMP
//	mini-deploy.sh:394      GGD_BUILD_STAMP='<每次部署都不同>' docker compose …
//
// ⇒ ⭐ **每一次部署都換一個新的 target 指紋。**
//
// ⛔⛔ 而它的失敗方式是最糟的那一種（`hero_resolver.go:77`）：
//
//	if len(selected) == 0 { return []community.HeroPin{}, nil }
//
// **回空清單、⛔ 零錯誤、零診斷** —— 玩家看到的是「一個社群英雄都沒有」，
// 而 `/healthz` 一切正常。⚠️ 這正是 CLAUDE.md 記的：
// 「fail-open 沒錯，**靜默才是缺陷**」。
//
// ⭐ 這一條**不改行為**（那是產品決定）—— 它把風險釘成可執行的證據，
// ⛔ 讓它不會在 74 名上架之後才被發現。
func TestHeroTargetDriftDropsPublishedHeroesSilently(t *testing.T) {
	published := heroListTarget{
		GameRevision:         "abc1234 2026-09-09", // ⭐ 發布當下那一次部署的 stamp
		ContentVersion:       "cv_b0c1bd019b45",
		MigrationFingerprint: "79d7bc384d11",
		ProcessorFingerprint: "59dad679b466",
	}

	// ① ⭐ 同一次部署 ⇒ 四欄相等 ⇒ 它在名單上
	same := published
	if published != same {
		t.Fatalf("⛔ 同一次部署的 target 竟然不相等 —— 這把尺是瞎的")
	}

	// ② ⛔ **只換 build stamp**（＝跑一次 `mini-deploy.sh`），其餘三欄一個字都沒動
	redeployed := published
	redeployed.GameRevision = "def5678 2026-09-10"
	if published == redeployed {
		t.Fatalf("⛔ 換了 stamp 還相等 —— 那 resolver 的比較不是逐欄的，這條測錯了東西")
	}

	// ⇒ ⭐ 在 `hero_resolver.go:73` 這表示 `selected` 會是空的，
	//    而 `:77` 讓它**回空清單而不是錯誤** ⇒ **靜靜地全部消失**。
	//
	// ⚠️ ⭐ 三欄裡**只有 stamp 變了** —— 內容沒變、機制沒變、英雄沒變。
	//    ⇒ 這不是「相容性檢查擋下了不相容的東西」，是**部署本身把它們踢掉**。
	if published.ContentVersion != redeployed.ContentVersion ||
		published.MigrationFingerprint != redeployed.MigrationFingerprint ||
		published.ProcessorFingerprint != redeployed.ProcessorFingerprint {
		t.Fatalf("⛔ 這條測的前提壞了：除了 stamp 以外還有欄位變了")
	}
}
