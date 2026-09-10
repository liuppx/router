package billing

import (
	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"testing"
)

func TestResolvePrechargePolicyUsesModelSpecAndFallback(t *testing.T) {
	resolved := ResolvePrechargePolicy(&adminmodel.ProviderModelSpecification{Version: 1, Billing: &adminmodel.ProviderModelBillingSpecification{Version: 2, PrechargePolicy: PrechargeFixedReserve, MinimumReserve: 900}}, 500)
	if resolved.Source != "model_specification" || resolved.Version != "billing-v2" || resolved.Policy.MinimumReserve != 900 {
		t.Fatalf("resolved=%+v", resolved)
	}
	fallback := ResolvePrechargePolicy(nil, 500)
	if fallback.Source != "global_fallback" || fallback.Policy.MinimumReserve != 500 || fallback.Policy.Type != PrechargeTokenizerEstimate {
		t.Fatalf("fallback=%+v", fallback)
	}
}
