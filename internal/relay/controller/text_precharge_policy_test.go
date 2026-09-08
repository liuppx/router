package controller

import (
	"github.com/yeying-community/router/common/config"
	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/billing"
	relaymeta "github.com/yeying-community/router/internal/relay/meta"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
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

func TestResolveTextPrechargePolicyUsesSelectedChannelProvider(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&adminmodel.ProviderModel{}); err != nil {
		t.Fatalf("AutoMigrate provider models: %v", err)
	}
	for _, row := range []adminmodel.ProviderModel{
		{
			Provider: "openai",
			Model:    "shared-model",
			Specification: adminmodel.MarshalProviderModelSpecification(&adminmodel.ProviderModelSpecification{
				Billing: &adminmodel.ProviderModelBillingSpecification{
					Version: 1, PrechargePolicy: billing.PrechargeFixedReserve, MinimumReserve: 100,
				},
			}),
		},
		{
			Provider: "anthropic",
			Model:    "shared-model",
			Specification: adminmodel.MarshalProviderModelSpecification(&adminmodel.ProviderModelSpecification{
				Billing: &adminmodel.ProviderModelBillingSpecification{
					Version: 2, PrechargePolicy: billing.PrechargeFixedReserve, MinimumReserve: 900,
				},
			}),
		},
	} {
		if err := db.Create(&row).Error; err != nil {
			t.Fatalf("seed provider model: %v", err)
		}
	}
	previousDB := adminmodel.DB
	adminmodel.DB = db
	t.Cleanup(func() {
		adminmodel.DB = previousDB
	})

	resolved, err := resolveTextPrechargePolicy(&relaymeta.Meta{
		OriginModelName: "public-model",
		ActualModelName: "shared-model",
		ChannelModelConfigs: []adminmodel.ChannelModel{{
			Model: "public-model", UpstreamModel: "shared-model", Provider: "anthropic", Selected: true,
		}},
	}, adminmodel.ResolvedModelPricing{Provider: "openai"})
	if err != nil {
		t.Fatalf("resolveTextPrechargePolicy: %v", err)
	}
	if resolved.Source != "model_specification" || resolved.Version != "billing-v2" || resolved.Policy.ReserveTokens(1, 1) != 900 {
		t.Fatalf("resolved policy = %+v, want anthropic selected policy", resolved)
	}
}
