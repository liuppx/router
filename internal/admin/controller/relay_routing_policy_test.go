package controller

import (
	"testing"

	"github.com/yeying-community/router/internal/relay/routing"
)

func TestRetryProviderAllowed(t *testing.T) {
	if retryProviderAllowed(routing.ProviderRoutingPolicy{RetryScope: routing.RetryScopeSameProvider}, "anthropic", "anthropic", "openai") {
		t.Fatal("same_provider must reject another provider")
	}
	if !retryProviderAllowed(routing.ProviderRoutingPolicy{RetryScope: routing.RetryScopeSameProvider}, "anthropic", "anthropic", "anthropic") {
		t.Fatal("same_provider must allow same provider")
	}
	policy := routing.ProviderRoutingPolicy{RetryScope: routing.RetryScopeOrderedProviders, ProviderOrder: []string{"anthropic", "openai"}}
	if !retryProviderAllowed(policy, "anthropic", "anthropic", "openai") {
		t.Fatal("ordered_providers must allow the next provider")
	}
	if retryProviderAllowed(policy, "openai", "openai", "anthropic") {
		t.Fatal("ordered_providers must not move backwards")
	}
}
