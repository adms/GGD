// Package keyedmutex provides sharded keyed mutexes. Keys hash onto a fixed
// set of mutex shards; multi-key locking dedupes and orders shards to stay
// deadlock-free.
package keyedmutex

import (
	"hash/fnv"
	"sort"
	"sync"
)

const shardCount = 256

// M is a set of sharded mutexes addressable by string key.
type M struct {
	shards [shardCount]sync.Mutex
}

// New returns a fresh keyed mutex set.
func New() *M { return &M{} }

func shardOf(key string) int {
	h := fnv.New32a()
	_, _ = h.Write([]byte(key))
	return int(h.Sum32() % shardCount)
}

// Lock locks the shard for key and returns its unlock func.
func (m *M) Lock(key string) func() {
	i := shardOf(key)
	m.shards[i].Lock()
	return m.shards[i].Unlock
}

// LockMany locks the shards for all keys in deterministic shard order
// (deduped), so overlapping multi-key lockers cannot deadlock. Returns a
// single unlock func.
func (m *M) LockMany(keys ...string) func() {
	seen := map[int]bool{}
	idx := make([]int, 0, len(keys))
	for _, k := range keys {
		i := shardOf(k)
		if !seen[i] {
			seen[i] = true
			idx = append(idx, i)
		}
	}
	sort.Ints(idx)
	for _, i := range idx {
		m.shards[i].Lock()
	}
	return func() {
		for j := len(idx) - 1; j >= 0; j-- {
			m.shards[idx[j]].Unlock()
		}
	}
}
