package routeobs

import (
	"encoding/json"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/relay/routing"
)

func TestFinalizedRouteDecisionJSONKeepsInitialAndRecordsFinalChannel(t *testing.T) {
	c, _ := gin.CreateTestContext(nil)
	c.Set(ctxkey.ProviderRoutingPolicy, routing.ProviderRoutingPolicy{
		ProviderScope: routing.ProviderScope{Mode: routing.ProviderScopeAllowList, Providers: []string{"anthropic"}},
		ProviderOrder: []string{"anthropic", "openai"},
		RetryScope:    routing.RetryScopeOrderedProviders, SelectionMethod: routing.SelectionWeightedRandom,
	})
	SetRouteDecision(c, RouteDecision{
		Source:              "automatic",
		GroupID:             " group-1 ",
		Model:               " gpt-5 ",
		Endpoint:            " /v1/chat/completions ",
		CandidateChannelIDs: []string{" channel-1 ", "channel-2", "channel-1"},
		FilteredCandidates: []FilteredCandidate{
			{ChannelID: " channel-3 ", Reason: " endpoint_unsupported "},
			{ChannelID: "channel-3", Reason: "endpoint_unsupported"},
		},
		SelectedPriority: 10,
		SelectionMode:    "priority_random",
		InitialChannelID: " channel-1 ",
	})
	c.Set(ctxkey.ChannelId, "channel-2")
	c.Set(ctxkey.ChannelName, "fallback")

	var got RouteDecision
	if err := json.Unmarshal([]byte(FinalizedRouteDecisionJSON(c)), &got); err != nil {
		t.Fatalf("unmarshal finalized route decision: %v", err)
	}
	if got.GroupID != "group-1" || got.CandidateCount != 2 || got.InitialChannelID != "channel-1" {
		t.Fatalf("unexpected initial route decision: %+v", got)
	}
	if got.FinalChannelID != "channel-2" || got.FinalChannelName != "fallback" {
		t.Fatalf("unexpected final route decision: %+v", got)
	}
	if len(got.FilteredCandidates) != 1 || got.FilteredCandidates[0].ChannelID != "channel-3" {
		t.Fatalf("unexpected filtered candidates: %+v", got.FilteredCandidates)
	}
	if got.ProviderScope.Mode != routing.ProviderScopeAllowList || got.ProviderOrder[0] != "anthropic" || got.RetryScope != routing.RetryScopeOrderedProviders || got.SelectionMethod != routing.SelectionWeightedRandom {
		t.Fatalf("unexpected routing policy: %+v", got)
	}
}
