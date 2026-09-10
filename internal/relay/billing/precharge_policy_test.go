package billing

import (
	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"testing"
)

func TestNormalizePrechargePolicyDefaultsAndRejectsUnknown(t *testing.T) {
	got, err := NormalizePrechargePolicy(PrechargePolicy{}, 500)
	if err != nil || got.Type != PrechargeTokenizerEstimate || got.MinimumReserve != 500 || got.InputSafetyFactor != 1 {
		t.Fatalf("normalized policy = %+v, err=%v", got, err)
	}
	if _, err := NormalizePrechargePolicy(PrechargePolicy{Type: "bogus"}, 0); err == nil {
		t.Fatal("unknown policy should fail")
	}
}

func TestPrechargePolicyReserveTokens(t *testing.T) {
	tests := []struct {
		name string
		p    PrechargePolicy
		want int64
	}{
		{"fixed", PrechargePolicy{Type: PrechargeFixedReserve, MinimumReserve: 500}, 500},
		{"tokenizer", PrechargePolicy{Type: PrechargeTokenizerEstimate, MinimumReserve: 500, InputSafetyFactor: 1.1}, 662},
		{"max output", PrechargePolicy{Type: PrechargeMaxOutputReserve, MinimumReserve: 500}, 550},
		{"heuristic", PrechargePolicy{Type: PrechargeHeuristicEstimate, MinimumReserve: 100, OutputReserveTokens: 64}, 150},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.p.ReserveTokens(101, 50); got != tt.want {
				t.Fatalf("ReserveTokens() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestPolicyChangeCreatesNewResolutionVersionWithoutChangingOldSnapshot(t *testing.T) {
	old := ResolvePrechargePolicy(&adminmodel.ProviderModelSpecification{Version: 1, Billing: &adminmodel.ProviderModelBillingSpecification{Version: 1, PrechargePolicy: PrechargeFixedReserve, MinimumReserve: 500}}, 100)
	next := ResolvePrechargePolicy(&adminmodel.ProviderModelSpecification{Version: 1, Billing: &adminmodel.ProviderModelBillingSpecification{Version: 2, PrechargePolicy: PrechargeMaxOutputReserve, MinimumReserve: 700}}, 100)
	if old.Version != "billing-v1" || old.Policy.Type != PrechargeFixedReserve || old.Policy.ReserveTokens(100, 200) != 500 {
		t.Fatalf("old snapshot changed: %+v", old)
	}
	if next.Version != "billing-v2" || next.Policy.Type != PrechargeMaxOutputReserve || next.Policy.ReserveTokens(100, 200) != 900 {
		t.Fatalf("new snapshot incorrect: %+v", next)
	}
}
