package routing

import "testing"

func TestParseRequestPolicy(t *testing.T) {
	policy, err := ParseRequestPolicy([]byte(`{"provider":{"provider_scope":{"mode":"allow_list","providers":[" Anthropic ","openai","anthropic"]},"provider_order":["anthropic","openai"],"retry_scope":"ordered_providers","selection_method":"priority"}}`))
	if err != nil {
		t.Fatalf("ParseRequestPolicy: %v", err)
	}
	if policy.ProviderScope.Mode != ProviderScopeAllowList || len(policy.ProviderScope.Providers) != 2 || policy.ProviderScope.Providers[0] != "anthropic" {
		t.Fatalf("provider scope = %+v", policy.ProviderScope)
	}
	if policy.RetryScope != RetryScopeOrderedProviders || policy.SelectionMethod != SelectionPriority {
		t.Fatalf("policy = %+v", policy)
	}
}

func TestParseRequestPolicyRejectsConflictingFields(t *testing.T) {
	if _, err := ParseRequestPolicy([]byte(`{"routing":{},"provider":{}}`)); err == nil {
		t.Fatal("expected conflicting policy error")
	}
}

func TestParseRequestPolicyRejectsInvalidValues(t *testing.T) {
	if _, err := ParseRequestPolicy([]byte(`{"routing":{"retry_scope":"cross_everything"}}`)); err == nil {
		t.Fatal("expected invalid retry scope error")
	}
}
