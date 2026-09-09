package middleware

import (
	"testing"

	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/routing"
)

func TestPickChannelByPolicyWeightedRandomUsesTopPriorityTier(t *testing.T) {
	weight := uint(100)
	channels := []*adminmodel.Channel{
		{Id: "weighted", Weight: &weight},
		{Id: "lower-priority", Priority: int64Ptr(2)},
	}
	selected := pickChannelByPolicy(channels, routing.ProviderRoutingPolicy{SelectionMethod: routing.SelectionWeightedRandom})
	if selected == nil || selected.Id != "weighted" {
		t.Fatalf("selected = %#v, want top priority channel", selected)
	}
}

func int64Ptr(value int64) *int64 { return &value }
