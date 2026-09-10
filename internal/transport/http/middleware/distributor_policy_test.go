package middleware

import (
	"testing"

	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/routing"
)

func TestApplyProviderRoutingPolicy(t *testing.T) {
	channels := []*adminmodel.Channel{
		{Id: "openai-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "openai", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
		{Id: "anthropic-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "anthropic", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
	}
	filtered, policyFiltered := applyProviderRoutingPolicy(channels, "shared", routing.ProviderRoutingPolicy{
		ProviderScope: routing.ProviderScope{Mode: routing.ProviderScopeAllowList, Providers: []string{"anthropic"}},
		ProviderOrder: []string{"anthropic", "openai"},
	})
	if len(filtered) != 1 || filtered[0].Id != "anthropic-1" {
		t.Fatalf("filtered channels = %#v", filtered)
	}
	if len(policyFiltered) != 1 || policyFiltered[0].ChannelID != "openai-1" || policyFiltered[0].Reason != "provider_scope" {
		t.Fatalf("policy filtered = %#v", policyFiltered)
	}
}

func TestApplyProviderRoutingPolicyOrdersProviders(t *testing.T) {
	channels := []*adminmodel.Channel{
		{Id: "openai-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "openai", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
		{Id: "anthropic-1", ChannelModels: []adminmodel.ChannelModel{{Model: "shared", Provider: "anthropic", Selected: true, PublishEnabled: true, PublishStatus: adminmodel.ChannelModelPublishStatusPublished}}},
	}
	ordered, _ := applyProviderRoutingPolicy(channels, "shared", routing.ProviderRoutingPolicy{
		ProviderScope: routing.ProviderScope{Mode: routing.ProviderScopeAny},
		ProviderOrder: []string{"anthropic", "openai"},
	})
	if len(ordered) != 2 || ordered[0].Id != "anthropic-1" {
		t.Fatalf("ordered channels = %#v", ordered)
	}
}
