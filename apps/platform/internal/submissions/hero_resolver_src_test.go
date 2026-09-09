package submissions

import (
	"os"
	"testing"
)

func readResolverSource(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("hero_resolver.go")
	if err != nil {
		t.Fatalf("⛔ 讀不到 hero_resolver.go：%v", err)
	}
	return string(b)
}
