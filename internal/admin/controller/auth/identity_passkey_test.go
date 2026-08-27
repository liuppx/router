package auth

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

// Wallet identity assertion tests live in common/identity_verify_test.go.

func TestIdentityCredentialExtractsAvatarURL(t *testing.T) {
	token := testIdentityCredential(t, "AvatarCredential", map[string]any{
		"id":        "did:yeying:wid_test",
		"avatarUri": "https://avatar.example/alice.png",
	})
	avatarURL := identityPresentationAvatarURL([]string{token})
	if avatarURL != "https://avatar.example/alice.png" {
		t.Fatalf("avatarURL = %q", avatarURL)
	}
}

func TestExtractAvatarURLFromNodeCredentials(t *testing.T) {
	token := testIdentityCredential(t, "AvatarCredential", map[string]any{
		"id":        "did:yeying:wid_test",
		"avatarUri": "https://avatar.example/alice.png",
	})
	credentials := []struct {
		Type         string `json:"type"`
		CredentialID string `json:"credentialId"`
		Credential   string `json:"credential"`
	}{
		{Type: "AvatarCredential", CredentialID: "avatar-1", Credential: token},
	}
	avatarURL := extractAvatarURLFromCredentials(credentials)
	if avatarURL != "https://avatar.example/alice.png" {
		t.Fatalf("avatarURL = %q", avatarURL)
	}
}

func testIdentityCredential(t *testing.T, credentialType string, subject map[string]any) string {
	t.Helper()
	payload := map[string]any{
		"vc": map[string]any{
			"type":              []string{"VerifiableCredential", credentialType},
			"credentialSubject": subject,
		},
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return "header." + base64.RawURLEncoding.EncodeToString(payloadJSON) + ".signature"
}
