package common

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type IdentityCredentialVerificationOptions struct {
	TrustDir                string
	RequiredScopes          []string
	RequiredCredentialTypes []string
}

type VerifiedIdentityCredential struct {
	Type    string
	Claims  jwt.MapClaims
	Subject map[string]any
}

type identityTrustBundle struct {
	Issuer string
	JWKS   map[string]any
}

// VerifyIdentityPresentationCredentials validates the JWT-VC credentials carried
// by a verified Wallet Identity presentation against the local Node trust bundle.
func VerifyIdentityPresentationCredentials(pres *IdentityPresentation, opts IdentityCredentialVerificationOptions) (map[string]VerifiedIdentityCredential, error) {
	if pres == nil || !isWalletIdentityDID(pres.Holder) {
		return nil, errors.New("identity_presentation_invalid")
	}
	for _, scope := range opts.RequiredScopes {
		if !identityContainsString(pres.Scopes, scope) {
			return nil, errors.New("identity_presentation_scope_mismatch")
		}
	}
	bundle, err := loadIdentityTrustBundle(opts.TrustDir)
	if err != nil {
		return nil, err
	}
	verified := make(map[string]VerifiedIdentityCredential)
	for _, token := range pres.Credentials {
		credential, err := verifyIdentityCredential(token, pres.Holder, bundle)
		if err != nil {
			return nil, err
		}
		if credential.Type != "" {
			verified[credential.Type] = credential
		}
	}
	for _, credentialType := range opts.RequiredCredentialTypes {
		if _, ok := verified[credentialType]; !ok {
			return nil, fmt.Errorf("identity_credential_required:%s", credentialType)
		}
	}
	return verified, nil
}

func verifyIdentityCredential(token string, expectedDID string, bundle identityTrustBundle) (VerifiedIdentityCredential, error) {
	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(strings.TrimSpace(token), claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodEdDSA.Alg() {
			return nil, errors.New("identity_credential_alg_invalid")
		}
		return identityPublicKeyFromJWKS(bundle.JWKS, identityStringValue(token.Header["kid"]), true)
	})
	if err != nil || parsed == nil || !parsed.Valid {
		return VerifiedIdentityCredential{}, errors.New("identity_credential_invalid")
	}
	if identityStringValue(claims["iss"]) != bundle.Issuer || identityStringValue(claims["sub"]) != expectedDID {
		return VerifiedIdentityCredential{}, errors.New("identity_credential_subject_mismatch")
	}
	if identityStringValue(claims["jti"]) == "" || !identityCredentialTimeValid(claims, time.Now()) {
		return VerifiedIdentityCredential{}, errors.New("identity_credential_expired")
	}
	vc, _ := claims["vc"].(map[string]any)
	credentialType := identityCredentialTypeFromVC(vc)
	if credentialType == "" {
		return VerifiedIdentityCredential{}, errors.New("identity_credential_type_mismatch")
	}
	subject, _ := vc["credentialSubject"].(map[string]any)
	if identityStringValue(subject["id"]) != expectedDID {
		return VerifiedIdentityCredential{}, errors.New("identity_credential_subject_mismatch")
	}
	return VerifiedIdentityCredential{Type: credentialType, Claims: claims, Subject: subject}, nil
}

func loadIdentityTrustBundle(trustDir string) (identityTrustBundle, error) {
	directory := strings.TrimSpace(trustDir)
	if directory == "" {
		return identityTrustBundle{}, errors.New("identity_trust_directory_not_configured")
	}
	metadataPath := filepath.Join(directory, "issuer-metadata.json")
	jwksPath := filepath.Join(directory, "jwks.json")
	manifestPath := filepath.Join(directory, "manifest.json")
	metadataBytes, err := os.ReadFile(metadataPath)
	if err != nil {
		return identityTrustBundle{}, errors.New("identity_trust_bundle_unavailable")
	}
	jwksBytes, err := os.ReadFile(jwksPath)
	if err != nil {
		return identityTrustBundle{}, errors.New("identity_trust_bundle_unavailable")
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		return identityTrustBundle{}, errors.New("identity_trust_bundle_unavailable")
	}
	var metadata map[string]any
	var jwks map[string]any
	var manifest map[string]any
	if json.Unmarshal(metadataBytes, &metadata) != nil || json.Unmarshal(jwksBytes, &jwks) != nil || json.Unmarshal(manifestBytes, &manifest) != nil {
		return identityTrustBundle{}, errors.New("identity_trust_bundle_invalid")
	}
	if identitySHA256Hex(metadataBytes) != identityStringValue(manifest["metadataSha256"]) || identitySHA256Hex(jwksBytes) != identityStringValue(manifest["jwksSha256"]) {
		return identityTrustBundle{}, errors.New("identity_trust_bundle_checksum_mismatch")
	}
	issuer := identityStringValue(metadata["issuer"])
	if issuer == "" || issuer != identityStringValue(manifest["issuer"]) {
		return identityTrustBundle{}, errors.New("identity_issuer_invalid")
	}
	if _, err := identityPublicKeyFromJWKS(jwks, "", false); err != nil {
		return identityTrustBundle{}, err
	}
	return identityTrustBundle{Issuer: issuer, JWKS: jwks}, nil
}

func identityPublicKeyFromJWKS(jwks map[string]any, kid string, requireKID bool) (ed25519.PublicKey, error) {
	keys, _ := jwks["keys"].([]any)
	for _, item := range keys {
		key, ok := item.(map[string]any)
		if !ok || identityStringValue(key["kty"]) != "OKP" || identityStringValue(key["crv"]) != "Ed25519" {
			continue
		}
		if kid != "" && identityStringValue(key["kid"]) != kid {
			continue
		}
		if requireKID && kid == "" {
			return nil, errors.New("identity_issuer_jwks_invalid")
		}
		x, err := identityBase64URLDecode(identityStringValue(key["x"]))
		if err != nil || len(x) != ed25519.PublicKeySize {
			return nil, errors.New("identity_issuer_jwks_invalid")
		}
		return ed25519.PublicKey(x), nil
	}
	return nil, errors.New("identity_issuer_jwks_invalid")
}

func identityCredentialTypeFromVC(vc map[string]any) string {
	if vc == nil {
		return ""
	}
	types := identityStringSlice(vc["type"])
	if !identityContainsString(types, "VerifiableCredential") {
		return ""
	}
	for _, value := range types {
		if value != "VerifiableCredential" {
			return value
		}
	}
	return ""
}

func identityCredentialTimeValid(claims jwt.MapClaims, now time.Time) bool {
	expiresAt, err := claims.GetExpirationTime()
	if err != nil || expiresAt == nil || !expiresAt.Time.After(now) {
		return false
	}
	notBefore, err := claims.GetNotBefore()
	if err != nil {
		return false
	}
	if notBefore != nil && notBefore.Time.After(now) {
		return false
	}
	return true
}

func identityStringSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if value := identityStringValue(item); value != "" {
				result = append(result, value)
			}
		}
		return result
	case string:
		return strings.Fields(typed)
	default:
		return nil
	}
}

func identityContainsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func identityStringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case fmt.Stringer:
		return strings.TrimSpace(typed.String())
	default:
		return ""
	}
}

func identityBase64URLDecode(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("empty base64url value")
	}
	if decoded, err := base64.RawURLEncoding.DecodeString(value); err == nil {
		return decoded, nil
	}
	return base64.URLEncoding.DecodeString(value)
}

func identitySHA256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func isWalletIdentityDID(did string) bool {
	did = strings.TrimSpace(did)
	return strings.HasPrefix(did, "did:yeying:wid_") && len(did) >= len("did:yeying:wid_")+22
}
