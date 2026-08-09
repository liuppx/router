package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"regexp"
	"testing"
)

func TestPassportPKCEChallenge(t *testing.T) {
	verifier := "dBjftJeZ4CVP5v4KFtSxEf83rKKnt4QQNTABtIJgF85MkiSyPtnvUTFnjd_Mv0Eo"
	wantSum := sha256.Sum256([]byte(verifier))
	want := base64.RawURLEncoding.EncodeToString(wantSum[:])
	if got := passportPKCEChallenge(verifier); got != want {
		t.Fatalf("PKCE challenge = %q, want %q", got, want)
	}
}

func TestPassportRandomURLValue(t *testing.T) {
	value, err := passportRandomURLValue(64)
	if err != nil {
		t.Fatalf("generate random URL value: %v", err)
	}
	if len(value) < 43 || !regexp.MustCompile(`^[A-Za-z0-9_-]+$`).MatchString(value) {
		t.Fatalf("unexpected URL-safe random value: %q", value)
	}
}
