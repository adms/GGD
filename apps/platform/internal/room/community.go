package room

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/ggd/platform/internal/httpx"
)

// Omission never enables community content or replaces a host's selection.
type CommunitySettings struct {
	AllowCommunityHeroes *bool     `json:"allowCommunityHeroes,omitempty"`
	CommunityWorkIDs     *[]string `json:"communityWorkIds,omitempty"`
}

var communityWorkID = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)

func (s CommunitySettings) validate() error {
	if s.CommunityWorkIDs == nil {
		return nil
	}
	if len(*s.CommunityWorkIDs) > MaxPlayers {
		return httpx.BadRequest("一個房間最多選用 12 份社群英雄作品。")
	}
	seen := map[string]bool{}
	for _, id := range *s.CommunityWorkIDs {
		if !communityWorkID.MatchString(id) || strings.Contains(id, "..") || seen[id] {
			return httpx.BadRequest("社群作品身分不合法或重複。")
		}
		seen[id] = true
	}
	return nil
}

func (s *CommunitySettings) merge(in CommunitySettings) {
	if in.AllowCommunityHeroes != nil {
		s.AllowCommunityHeroes = in.AllowCommunityHeroes
	}
	if in.CommunityWorkIDs != nil {
		ids := append([]string{}, (*in.CommunityWorkIDs)...)
		s.CommunityWorkIDs = &ids
	}
}

func (s CommunitySettings) redisFields(fields map[string]any) {
	if s.AllowCommunityHeroes != nil {
		fields["allowCommunityHeroes"] = boolToRedis(*s.AllowCommunityHeroes)
	}
	if s.CommunityWorkIDs != nil {
		raw, _ := json.Marshal(*s.CommunityWorkIDs)
		fields["communityWorkIds"] = string(raw)
	}
}

func communitySettingsFromRedis(fields map[string]string) (CommunitySettings, error) {
	result := CommunitySettings{AllowCommunityHeroes: parseOptBool(fields, "allowCommunityHeroes")}
	if raw, ok := fields["communityWorkIds"]; ok {
		var ids []string
		if json.Unmarshal([]byte(raw), &ids) != nil || ids == nil {
			return result, httpx.Err(503, "community_room_corrupt", "房間的社群作品設定損壞，請重建房間。")
		}
		result.CommunityWorkIDs = &ids
	}
	return result, result.validate()
}

func (s CommunitySettings) SelectedCommunityWorks() []string {
	if s.AllowCommunityHeroes == nil || !*s.AllowCommunityHeroes || s.CommunityWorkIDs == nil {
		return nil
	}
	return append([]string{}, (*s.CommunityWorkIDs)...)
}
