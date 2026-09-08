package controller

import (
	"github.com/yeying-community/router/common/config"
	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/billing"
	"testing"
)

func TestTextPrechargePolicyFallbackKeepsLegacyReserve(t *testing.T) {
	resolved := billing.ResolvePrechargePolicy(nil, config.PreConsumedQuota)
	if resolved.Source != "global_fallback" || resolved.Policy.Type != billing.PrechargeTokenizerEstimate {
		t.Fatalf("fallback resolution = %+v", resolved)
	}
	if got := resolved.Policy.ReserveTokens(120, 80); got != config.PreConsumedQuota+200 {
		t.Fatalf("fallback reserve = %d, want %d", got, config.PreConsumedQuota+200)
	}
}

func TestTextPrechargePolicyUsesPublishedBillingVersion(t *testing.T) {
	spec := &adminmodel.ProviderModelSpecification{Version: 1, Billing: &adminmodel.ProviderModelBillingSpecification{
		Version: 7, PrechargePolicy: billing.PrechargeFixedReserve, MinimumReserve: 1234,
	}}
	resolved := billing.ResolvePrechargePolicy(spec, config.PreConsumedQuota)
	if resolved.Version != "billing-v7" || resolved.Policy.ReserveTokens(1000, 1000) != 1234 {
		t.Fatalf("published resolution = %+v", resolved)
	}
}
