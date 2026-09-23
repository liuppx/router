package model

import (
	"testing"

	"github.com/yeying-community/router/common/config"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPersonalProviderCredentialEncryptionRoundTrip(t *testing.T) {
	previousSecret := config.JWTSecret
	previousFallbacks := config.JWTFallbackSecrets
	config.JWTSecret = "current-test-secret"
	config.JWTFallbackSecrets = nil
	t.Cleanup(func() {
		config.JWTSecret = previousSecret
		config.JWTFallbackSecrets = previousFallbacks
	})

	encrypted, err := encryptPersonalProviderCredential(" sk-personal-secret ")
	if err != nil {
		t.Fatalf("encryptPersonalProviderCredential() error = %v", err)
	}
	if encrypted == "sk-personal-secret" {
		t.Fatal("credential was stored as plaintext")
	}
	decrypted, err := decryptPersonalProviderCredential(encrypted)
	if err != nil {
		t.Fatalf("decryptPersonalProviderCredential() error = %v", err)
	}
	if decrypted != "sk-personal-secret" {
		t.Fatalf("decrypted credential = %q, want %q", decrypted, "sk-personal-secret")
	}
}

func TestListPersonalProviderModelsOnlyReturnsEnabledConnectionModels(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&PersonalProviderConnection{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	rows := []PersonalProviderConnection{
		{Id: "p1", UserId: "u1", Name: "enabled", Status: PersonalProviderStatusEnabled, ModelsJSON: `["gpt-5.1","gpt-5.1"]`},
		{Id: "p2", UserId: "u1", Name: "disabled", Status: PersonalProviderStatusDisabled, ModelsJSON: `["claude-opus"]`},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed connections: %v", err)
	}
	models, err := ListPersonalProviderModels("u1")
	if err != nil {
		t.Fatalf("ListPersonalProviderModels() error = %v", err)
	}
	if len(models) != 1 || models[0] != "gpt-5.1" {
		t.Fatalf("models = %#v, want [gpt-5.1]", models)
	}
}

func TestMergePersonalProviderModelsIntoEntitlementsKeepsPrivateSourceSeparate(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&PersonalProviderConnection{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	if err := db.Create(&PersonalProviderConnection{
		Id: "p1", UserId: "u1", Name: "My OpenAI", Status: PersonalProviderStatusEnabled,
		ModelsJSON: `["gpt-5.1","private-model"]`,
	}).Error; err != nil {
		t.Fatalf("seed connection: %v", err)
	}
	payload := UserEntitlementModelsPayload{
		Models: []string{"gpt-5.1"},
		Items: []UserAvailableModel{{
			Model: "gpt-5.1", Provider: "openai", ProviderLabel: "OpenAI",
			Sources: []UserEntitlementModelSource{{SourceType: UserEntitlementSourcePackage, SourceID: "pkg", GroupID: "group"}},
		}},
	}
	merged, err := MergePersonalProviderModelsIntoEntitlements("u1", payload)
	if err != nil {
		t.Fatalf("MergePersonalProviderModelsIntoEntitlements() error = %v", err)
	}
	if len(merged.Models) != 2 || merged.Models[0] != "gpt-5.1" || merged.Models[1] != "private-model" {
		t.Fatalf("models = %#v, want [gpt-5.1 private-model]", merged.Models)
	}
	var privateItem *UserAvailableModel
	for index := range merged.Items {
		if merged.Items[index].Model == "private-model" {
			privateItem = &merged.Items[index]
		}
	}
	if privateItem == nil || privateItem.Provider != PersonalProviderSourceType || len(privateItem.Sources) != 1 {
		t.Fatalf("private model item = %#v", privateItem)
	}
	if privateItem.Sources[0].GroupID != "" || privateItem.Sources[0].SourceID != "p1" {
		t.Fatalf("private source = %#v, must not carry a community group", privateItem.Sources[0])
	}
}

func TestPersonalProviderCredentialUsesFallbackSecret(t *testing.T) {
	previousSecret := config.JWTSecret
	previousFallbacks := config.JWTFallbackSecrets
	config.JWTSecret = "old-secret"
	config.JWTFallbackSecrets = nil
	encrypted, err := encryptPersonalProviderCredential("sk-rotated")
	if err != nil {
		t.Fatalf("encryptPersonalProviderCredential() error = %v", err)
	}
	config.JWTSecret = "new-secret"
	config.JWTFallbackSecrets = []string{"old-secret"}
	t.Cleanup(func() {
		config.JWTSecret = previousSecret
		config.JWTFallbackSecrets = previousFallbacks
	})
	decrypted, err := decryptPersonalProviderCredential(encrypted)
	if err != nil || decrypted != "sk-rotated" {
		t.Fatalf("fallback decrypt = %q, %v", decrypted, err)
	}
}

func TestNormalizePersonalRoutePolicy(t *testing.T) {
	tests := map[string]string{
		"":                   PersonalRoutePolicyPersonalFirst,
		"community_fallback": PersonalRoutePolicyPersonalFirst,
		"personal_only":      PersonalRoutePolicyPersonalOnly,
		"community_only":     PersonalRoutePolicyCommunityOnly,
		"community_first":    PersonalRoutePolicyCommunityFirst,
	}
	for input, want := range tests {
		if got := NormalizePersonalRoutePolicy(input); got != want {
			t.Errorf("NormalizePersonalRoutePolicy(%q) = %q, want %q", input, got, want)
		}
	}
}
