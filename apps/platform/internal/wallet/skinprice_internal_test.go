package wallet

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// GH#1177 追加 —— 造型定價規則的**跨語言對表**（Go 那一半）。
// TS 的 resolveSkinPrice 跑同一份 packages/shared/src/content/skinPricing.cases.json
// （skinTierPrices.test.ts ①）⇒ 一邊改了規則而另一邊沒改 ⇒ 那一邊紅。
// 造型文件走 LoadCatalog 用的同一個 json 解碼（缺席 ≠ 0 / ≠ ""）。
func TestSkinPricingMatchesTheSharedCases(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "shared", "src", "content", "skinPricing.cases.json"))
	require.NoError(t, err)
	var fixture struct {
		Tiers map[string]int `json:"tiers"`
		Cases []struct {
			Name  string          `json:"name"`
			Skin  json.RawMessage `json:"skin"`
			Want  *int            `json:"want"`
			Error string          `json:"error"`
		} `json:"cases"`
	}
	require.NoError(t, json.Unmarshal(raw, &fixture))
	require.Greater(t, len(fixture.Cases), 5, "對表空了 ⇒ 這一條在空轉")
	for _, c := range fixture.Cases {
		var sk SkinDef
		require.NoError(t, json.Unmarshal(c.Skin, &sk), c.Name)
		price, err := resolveSkinPrice(sk, fixture.Tiers)
		if c.Error != "" {
			var rule skinPriceError
			require.True(t, errors.As(err, &rule), "%s：該擋而沒擋（拿到 %d）", c.Name, price)
			require.Equal(t, c.Error, string(rule), c.Name)
			continue
		}
		require.NoError(t, err, c.Name)
		require.NotNil(t, c.Want, c.Name)
		require.Equal(t, *c.Want, price, c.Name)
	}
}
