package jsonstore

import (
	"encoding/json"
	"errors"
	"sync"
	"testing"
)

func TestUpdateSerializesCompareAndWrite(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := store.Update("proof", "counter", func(raw json.RawMessage) (any, error) {
				var n int
				if len(raw) > 0 {
					if err := json.Unmarshal(raw, &n); err != nil {
						return nil, err
					}
				}
				return n + 1, nil
			}); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	var n int
	if err := store.Get("proof", "counter", &n); err != nil {
		t.Fatal(err)
	}
	if n != 40 {
		t.Fatalf("lost update: %d", n)
	}
	conflict := errors.New("compare failed")
	if err := store.Update("proof", "counter", func(json.RawMessage) (any, error) { return 999, conflict }); !errors.Is(err, conflict) {
		t.Fatal(err)
	}
	if err := store.Get("proof", "counter", &n); err != nil || n != 40 {
		t.Fatalf("failed compare wrote data: %d %v", n, err)
	}
}
