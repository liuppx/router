package model

import "testing"

func TestProviderCatalogExpansionIncludesReviewedProviders(t *testing.T) {
	seeds := mustLoadProviderMigrationSeeds(t)
	modelsByProvider := make(map[string]map[string]ProviderModelDetail, len(seeds))
	for _, seed := range seeds {
		models := make(map[string]ProviderModelDetail, len(seed.ModelDetails))
		for _, detail := range seed.ModelDetails {
			models[detail.Model] = detail
		}
		modelsByProvider[seed.Provider] = models
	}

	for provider, modelName := range map[string]string{
		"moonshot":          "kimi-k2.5",
		"amazon-nova":       "nova-2-lite-v1",
		"meta":              "llama-4-maverick",
		"black-forest-labs": "flux-kontext-pro",
		"perplexity":        "sonar-pro",
		"voyageai":          "voyage-4",
		"deepgram":          "nova-3",
		"assemblyai":        "universal-3",
	} {
		models, ok := modelsByProvider[provider]
		if !ok {
			t.Fatalf("expected provider catalog to include %s", provider)
		}
		if _, ok := models[modelName]; !ok {
			t.Fatalf("expected %s catalog to include %s", provider, modelName)
		}
	}

	if modelsByProvider["moonshot"]["kimi-k2.5"].InputPrice != 0 {
		t.Fatal("Kimi must not receive an OpenRouter price as an official provider default")
	}
	if modelsByProvider["perplexity"]["sonar-pro"].InputPrice != 0 {
		t.Fatal("Perplexity token-only price must not omit its search-request pricing")
	}
	if !ProviderModelTagsContain(modelsByProvider["deepgram"]["nova-3"].Tags, ProviderModelTagNativeAdapterRequired) {
		t.Fatal("Deepgram model must require a native adapter")
	}
}

func TestNativeAdapterRequiredModelsDoNotReceiveFallbackEndpoints(t *testing.T) {
	db := newProviderMigrationTestDB(t)
	if err := upsertProviderMigrationProvidersWithDB(db, "deepgram", "assemblyai", "voyageai"); err != nil {
		t.Fatalf("seed catalog expansion providers: %v", err)
	}
	endpoints, err := LoadProviderModelEndpointMapByModelsWithDB(db, "deepgram", []string{"nova-3"})
	if err != nil {
		t.Fatalf("load Deepgram endpoint map: %v", err)
	}
	if got := endpoints["nova-3"]; len(got) != 0 {
		t.Fatalf("Deepgram nova-3 endpoints=%#v, want no Router endpoint before native adapter", got)
	}
	endpoints, err = LoadProviderModelEndpointMapByModelsWithDB(db, "voyageai", []string{"rerank-3"})
	if err != nil {
		t.Fatalf("load Voyage endpoint map: %v", err)
	}
	if got := endpoints["rerank-3"]; len(got) != 0 {
		t.Fatalf("Voyage rerank-3 endpoints=%#v, want no Router endpoint before native adapter", got)
	}
}
