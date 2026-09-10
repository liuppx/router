package common

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestJCSCanonical(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"null", "null", "null"},
		{"bool true", "true", "true"},
		{"bool false", "false", "false"},
		{"string", `"hello"`, `"hello"`},
		{"integer", "42", "42"},
		{"empty object", `{}`, `{}`},
		{"empty array", `[]`, `[]`},
		{"sorted object", `{"b":1,"a":2}`, `{"a":2,"b":1}`},
		{"nested", `{"z":{"b":1,"a":2},"y":[3,2,1]}`, `{"y":[3,2,1],"z":{"a":2,"b":1}}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var val any
			if err := json.Unmarshal([]byte(tc.input), &val); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			got, err := jcsCanonical(val)
			if err != nil {
				t.Fatalf("canonicalize: %v", err)
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestVerifyIdentityPresentation(t *testing.T) {
	// Generate Ed25519 key pair
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	pubB64 := base64.RawURLEncoding.EncodeToString(pub)
	holder := "did:yeying:wid_test1234567890abcdefghijklm"
	controllerID := "controller-1"
	now := time.Now().UTC()
	issuedAt := now.Format(time.RFC3339)
	expiresAt := now.Add(5 * time.Minute).Format(time.RFC3339)

	identityDoc := map[string]any{
		"version": 1,
		"id":      holder,
		"controllers": []any{
			map[string]any{
				"controllerId": controllerID,
				"kind":         "wallet_key",
				"publicKey":    pubB64,
				"algorithm":    "Ed25519",
				"purposes":     []any{"authentication", "assertion", "manage"},
				"status":       "active",
			},
		},
	}
	docCanonical, err := jcsCanonical(identityDoc)
	if err != nil {
		t.Fatalf("canonicalize identity doc: %v", err)
	}
	identityDoc["proof"] = map[string]any{
		"type":               "YeyingIdentityDocumentProofV1",
		"verificationMethod": holder + "#" + controllerID,
		"purpose":            "manage",
		"proofValue":         base64.RawURLEncoding.EncodeToString(ed25519.Sign(priv, []byte(docCanonical))),
	}

	unsigned := map[string]any{
		"version":          1,
		"holder":           holder,
		"audience":         "https://app.example.com",
		"nonce":            "test-nonce-123",
		"issuedAt":         issuedAt,
		"expiresAt":        expiresAt,
		"scopes":           []any{"identity.basic", "identity.wallet"},
		"identityDocument": identityDoc,
	}

	canonical, err := jcsCanonical(unsigned)
	if err != nil {
		t.Fatalf("canonicalize: %v", err)
	}
	sig := ed25519.Sign(priv, []byte(canonical))
	sigB64 := base64.RawURLEncoding.EncodeToString(sig)

	full := map[string]any{
		"version":          unsigned["version"],
		"holder":           unsigned["holder"],
		"audience":         unsigned["audience"],
		"nonce":            unsigned["nonce"],
		"issuedAt":         unsigned["issuedAt"],
		"expiresAt":        unsigned["expiresAt"],
		"scopes":           unsigned["scopes"],
		"identityDocument": unsigned["identityDocument"],
		"proof": map[string]any{
			"type":               "YeyingIdentityPresentationProofV1",
			"verificationMethod": holder + "#" + controllerID,
			"purpose":            "authentication",
			"proofValue":         sigB64,
		},
	}

	presJSON, err := json.Marshal(full)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// Valid presentation
	pres, err := VerifyIdentityPresentation(presJSON, "https://app.example.com", "test-nonce-123")
	if err != nil {
		t.Fatalf("verify failed: %v", err)
	}
	if pres.Holder != holder {
		t.Fatalf("holder mismatch: %s != %s", pres.Holder, holder)
	}

	// Wrong audience
	_, err = VerifyIdentityPresentation(presJSON, "https://wrong.example.com", "test-nonce-123")
	if err == nil {
		t.Fatal("expected audience mismatch error")
	}

	// Wrong nonce
	_, err = VerifyIdentityPresentation(presJSON, "https://app.example.com", "wrong-nonce")
	if err == nil {
		t.Fatal("expected nonce mismatch error")
	}

	// Tampered presentation
	full["nonce"] = "tampered"
	tamperedJSON, _ := json.Marshal(full)
	_, err = VerifyIdentityPresentation(tamperedJSON, "https://app.example.com", "tampered")
	if err == nil {
		t.Fatal("expected proof invalid error for tampered presentation")
	}
}

func TestVerifyIdentityPresentationCredentials(t *testing.T) {
	issuerPub, issuerPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate issuer key: %v", err)
	}
	trustDir := t.TempDir()
	issuer := "did:web:node.example.com"
	kid := issuer + "#identity-issuer-1"
	metadataBytes, _ := json.Marshal(map[string]any{"issuer": issuer})
	jwksBytes, _ := json.Marshal(map[string]any{"keys": []any{map[string]any{
		"kty": "OKP",
		"crv": "Ed25519",
		"kid": kid,
		"x":   base64.RawURLEncoding.EncodeToString(issuerPub),
	}}})
	manifestBytes, _ := json.Marshal(map[string]any{
		"issuer":         issuer,
		"metadataSha256": testSHA256Hex(metadataBytes),
		"jwksSha256":     testSHA256Hex(jwksBytes),
	})
	if err := os.WriteFile(trustDir+"/issuer-metadata.json", metadataBytes, 0o600); err != nil {
		t.Fatalf("write metadata: %v", err)
	}
	if err := os.WriteFile(trustDir+"/jwks.json", jwksBytes, 0o600); err != nil {
		t.Fatalf("write jwks: %v", err)
	}
	if err := os.WriteFile(trustDir+"/manifest.json", manifestBytes, 0o600); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	holder := "did:yeying:wid_test1234567890abcdefghijklm"
	credential := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"iss": issuer,
		"sub": holder,
		"jti": "cred-1",
		"nbf": time.Now().Add(-time.Minute).Unix(),
		"exp": time.Now().Add(time.Hour).Unix(),
		"vc": map[string]any{
			"type": []string{"VerifiableCredential", "EmailCredential"},
			"credentialSubject": map[string]any{
				"id":    holder,
				"email": "user@example.com",
			},
		},
	})
	credential.Header["kid"] = kid
	token, err := credential.SignedString(issuerPriv)
	if err != nil {
		t.Fatalf("sign credential: %v", err)
	}

	pres := &IdentityPresentation{
		Version:     1,
		Holder:      holder,
		Scopes:      []string{"identity.basic", "identity.email"},
		Credentials: []string{token},
	}
	verified, err := VerifyIdentityPresentationCredentials(pres, IdentityCredentialVerificationOptions{
		TrustDir:                trustDir,
		RequiredScopes:          []string{"identity.basic", "identity.email"},
		RequiredCredentialTypes: []string{"EmailCredential"},
	})
	if err != nil {
		t.Fatalf("verify credential failed: %v", err)
	}
	if verified["EmailCredential"].Subject["email"] != "user@example.com" {
		t.Fatalf("email subject mismatch: %#v", verified["EmailCredential"].Subject)
	}

	_, err = VerifyIdentityPresentationCredentials(pres, IdentityCredentialVerificationOptions{
		TrustDir:                "",
		RequiredScopes:          []string{"identity.basic", "identity.email"},
		RequiredCredentialTypes: []string{"EmailCredential"},
	})
	if err == nil || err.Error() != "identity_trust_directory_not_configured" {
		t.Fatalf("expected missing trust dir error, got %v", err)
	}

	_, err = VerifyIdentityPresentationCredentials(pres, IdentityCredentialVerificationOptions{
		TrustDir:                trustDir,
		RequiredScopes:          []string{"identity.basic", "identity.wallet"},
		RequiredCredentialTypes: []string{"EmailCredential"},
	})
	if err == nil || err.Error() != "identity_presentation_scope_mismatch" {
		t.Fatalf("expected scope mismatch, got %v", err)
	}

	pres.Credentials = nil
	_, err = VerifyIdentityPresentationCredentials(pres, IdentityCredentialVerificationOptions{
		TrustDir:                trustDir,
		RequiredScopes:          []string{"identity.basic", "identity.email"},
		RequiredCredentialTypes: []string{"EmailCredential"},
	})
	if err == nil || err.Error() != "identity_credential_required:EmailCredential" {
		t.Fatalf("expected required credential error, got %v", err)
	}
}

func testSHA256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
