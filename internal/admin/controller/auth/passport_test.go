package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"regexp"
	"testing"
	"time"

	"github.com/yeying-community/router/common/config"
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

func TestPassportScopeIncluded(t *testing.T) {
	if !passportScopeIncluded([]string{"identity.basic", "identity.email"}, "identity.email") {
		t.Fatal("expected identity.email scope")
	}
	if passportScopeIncluded([]string{"identity.basic", "identity.wallet"}, "identity.email") {
		t.Fatal("did not expect identity.email scope")
	}
}

func TestValidatePassportExchangeIdentity(t *testing.T) {
	verified := true
	valid := passportExchangeResult{
		SubjectID: "subject-1",
		Scopes:    routerPassportScopes(true),
	}
	valid.Claims.Email = "user@example.com"
	valid.Claims.EmailVerified = &verified

	tests := []struct {
		name     string
		mutate   func(*passportExchangeResult)
		wantErr  bool
		contains string
	}{
		{name: "valid"},
		{name: "missing email scope", mutate: func(result *passportExchangeResult) {
			result.Scopes = []string{"identity.basic", "identity.wallet"}
		}, wantErr: true, contains: "未授权"},
		{name: "email not verified", mutate: func(result *passportExchangeResult) {
			unverified := false
			result.Claims.EmailVerified = &unverified
		}, wantErr: true, contains: "已验证"},
		{name: "empty email", mutate: func(result *passportExchangeResult) {
			result.Claims.Email = " "
		}, wantErr: true, contains: "已验证"},
		{name: "missing subject", mutate: func(result *passportExchangeResult) {
			result.SubjectID = ""
		}, wantErr: true, contains: "身份信息"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			result := valid
			result.Scopes = append([]string(nil), valid.Scopes...)
			if test.mutate != nil {
				test.mutate(&result)
			}
			err := validatePassportExchangeIdentity(&result, true)
			if test.wantErr && err == nil {
				t.Fatal("expected validation error")
			}
			if !test.wantErr && err != nil {
				t.Fatalf("unexpected validation error: %v", err)
			}
			if test.contains != "" && (err == nil || !regexp.MustCompile(test.contains).MatchString(err.Error())) {
				t.Fatalf("error = %v, want text %q", err, test.contains)
			}
		})
	}

	withoutEmail := valid
	withoutEmail.Scopes = routerPassportScopes(false)
	withoutEmail.Claims.Email = ""
	withoutEmail.Claims.EmailVerified = nil
	if err := validatePassportExchangeIdentity(&withoutEmail, false); err != nil {
		t.Fatalf("existing configured email should not require email claims: %v", err)
	}
}

func TestWalletChallengeWeb3IncludesRequiredPassportMetadata(t *testing.T) {
	originalNodeURL := config.PassportNodeURL
	originalAppID := config.PassportAppID
	originalServerAddress := config.ServerAddress
	t.Cleanup(func() {
		config.PassportNodeURL = originalNodeURL
		config.PassportAppID = originalAppID
		config.ServerAddress = originalServerAddress
	})
	config.PassportNodeURL = "http://127.0.0.1:8100/"
	config.PassportAppID = "router-app"
	config.ServerAddress = "http://localhost:3011/"

	requiredScopes := routerPassportScopes(true)
	data, err := walletChallengeWeb3Data("0x1", "challenge", "nonce", requiredScopes, time.Unix(1, 0), time.Unix(2, 0))
	if err != nil {
		t.Fatalf("build challenge response: %v", err)
	}
	if data["appId"] != "router-app" || data["audience"] != "http://localhost:3011" || data["passportEndpoint"] != "http://127.0.0.1:8100" {
		t.Fatalf("unexpected Passport metadata: %+v", data)
	}
	scopes, ok := data["scope"].([]string)
	if !ok {
		t.Fatalf("unexpected challenge scope: %#v", data["scope"])
	}
	for _, scope := range requiredScopes {
		if !passportScopeIncluded(scopes, scope) {
			t.Fatalf("challenge scope missing %q: %v", scope, scopes)
		}
	}
}
