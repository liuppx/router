package routing

import (
	"encoding/json"
	"fmt"
	"strings"
)

type ProviderScopeMode string

const (
	ProviderScopeAny       ProviderScopeMode = "any"
	ProviderScopeAllowList ProviderScopeMode = "allow_list"
	ProviderScopeDenyList  ProviderScopeMode = "deny_list"
)

type RetryScope string

const (
	RetryScopeNone             RetryScope = "none"
	RetryScopeSameProvider     RetryScope = "same_provider"
	RetryScopeOrderedProviders RetryScope = "ordered_providers"
	RetryScopeAllEligible      RetryScope = "all_eligible"
)

type SelectionMethod string

const (
	SelectionPriority       SelectionMethod = "priority"
	SelectionWeightedRandom SelectionMethod = "weighted_random"
	SelectionLatency        SelectionMethod = "latency"
	SelectionPrice          SelectionMethod = "price"
	SelectionSuccessRate    SelectionMethod = "success_rate"
)

type ProviderScope struct {
	Mode      ProviderScopeMode `json:"mode,omitempty"`
	Providers []string          `json:"providers,omitempty"`
}

type ProviderRoutingPolicy struct {
	ProviderScope   ProviderScope   `json:"provider_scope,omitempty"`
	ProviderOrder   []string        `json:"provider_order,omitempty"`
	RetryScope      RetryScope      `json:"retry_scope,omitempty"`
	SelectionMethod SelectionMethod `json:"selection_method,omitempty"`
}

type requestRouting struct {
	Routing  *ProviderRoutingPolicy `json:"routing"`
	Provider *ProviderRoutingPolicy `json:"provider"`
}

func DefaultPolicy() ProviderRoutingPolicy {
	return ProviderRoutingPolicy{
		ProviderScope:   ProviderScope{Mode: ProviderScopeAny},
		RetryScope:      RetryScopeSameProvider,
		SelectionMethod: SelectionPriority,
	}
}

func ParseRequestPolicy(raw []byte) (ProviderRoutingPolicy, error) {
	policy := DefaultPolicy()
	if len(raw) == 0 {
		return policy, nil
	}
	var request requestRouting
	if err := json.Unmarshal(raw, &request); err != nil {
		return policy, fmt.Errorf("parse routing policy request: %w", err)
	}
	if request.Routing != nil && request.Provider != nil {
		return policy, fmt.Errorf("routing and provider policies cannot both be set")
	}
	if request.Routing != nil {
		policy = *request.Routing
	} else if request.Provider != nil {
		policy = *request.Provider
	}
	normalize(&policy)
	if err := Validate(policy); err != nil {
		return DefaultPolicy(), err
	}
	return policy, nil
}

func Validate(policy ProviderRoutingPolicy) error {
	switch policy.ProviderScope.Mode {
	case "", ProviderScopeAny, ProviderScopeAllowList, ProviderScopeDenyList:
	default:
		return fmt.Errorf("invalid provider_scope.mode %q", policy.ProviderScope.Mode)
	}
	if policy.ProviderScope.Mode != ProviderScopeAny && len(policy.ProviderScope.Providers) == 0 {
		return fmt.Errorf("provider_scope.providers is required for mode %q", policy.ProviderScope.Mode)
	}
	switch policy.RetryScope {
	case "", RetryScopeNone, RetryScopeSameProvider, RetryScopeOrderedProviders, RetryScopeAllEligible:
	default:
		return fmt.Errorf("invalid retry_scope %q", policy.RetryScope)
	}
	switch policy.SelectionMethod {
	case "", SelectionPriority, SelectionWeightedRandom:
	default:
		return fmt.Errorf("unsupported selection_method %q", policy.SelectionMethod)
	}
	return nil
}

func normalize(policy *ProviderRoutingPolicy) {
	if policy == nil {
		return
	}
	policy.ProviderScope.Mode = ProviderScopeMode(strings.ToLower(strings.TrimSpace(string(policy.ProviderScope.Mode))))
	if policy.ProviderScope.Mode == "" {
		policy.ProviderScope.Mode = ProviderScopeAny
	}
	policy.RetryScope = RetryScope(strings.ToLower(strings.TrimSpace(string(policy.RetryScope))))
	if policy.RetryScope == "" {
		policy.RetryScope = RetryScopeSameProvider
	}
	policy.SelectionMethod = SelectionMethod(strings.ToLower(strings.TrimSpace(string(policy.SelectionMethod))))
	if policy.SelectionMethod == "" {
		policy.SelectionMethod = SelectionPriority
	}
	policy.ProviderScope.Providers = normalizeValues(policy.ProviderScope.Providers)
	policy.ProviderOrder = normalizeValues(policy.ProviderOrder)
}

func normalizeValues(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		normalized := strings.ToLower(strings.TrimSpace(value))
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	return result
}
