package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newPersonalProviderRoutingTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.PersonalProviderConnection{}, &model.PersonalModelRoute{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := model.DB
	previousSecret := config.JWTSecret
	previousFallbacks := config.JWTFallbackSecrets
	model.DB = db
	config.JWTSecret = "personal-provider-routing-test-secret"
	config.JWTFallbackSecrets = nil
	t.Cleanup(func() {
		model.DB = previousDB
		config.JWTSecret = previousSecret
		config.JWTFallbackSecrets = previousFallbacks
	})
	return db
}

func newPersonalProviderRelayContext(t *testing.T, modelName string, policy string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/public/chat/completions", bytes.NewBufferString(`{"model":"`+modelName+`","messages":[{"role":"user","content":"hello"}]}`))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(ctxkey.Id, "user-a")
	c.Set(ctxkey.RequestModel, modelName)
	c.Set(ctxkey.PersonalRoutePolicy, policy)
	c.Set(ctxkey.TokenRemainQuota, int64(0))
	c.Set(ctxkey.TokenUnlimitedQuota, false)
	return c, recorder
}

func TestDistributePersonalOnlyUsesPrivateConnectionWithoutCommunityEntitlement(t *testing.T) {
	newPersonalProviderRoutingTestDB(t)
	connection := &model.PersonalProviderConnection{
		UserId: "user-a", Name: "private OpenAI", Protocol: "openai", BaseURL: "https://api.example.test/v1",
		Models: []string{"private-model"}, Priority: 20,
	}
	if err := model.CreatePersonalProviderConnection(connection, "sk-personal"); err != nil {
		t.Fatalf("create private connection: %v", err)
	}
	c, recorder := newPersonalProviderRelayContext(t, "private-model", model.PersonalRoutePolicyPersonalOnly)

	Distribute()(c)

	if recorder.Code >= http.StatusBadRequest {
		t.Fatalf("distribute status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if got := c.GetString(ctxkey.ChannelId); got != model.PersonalProviderChannelPrefix+connection.Id {
		t.Fatalf("channel ID = %q, want personal connection", got)
	}
	if got := c.GetString(ctxkey.Group); got != "" {
		t.Fatalf("personal-only request unexpectedly resolved community group %q", got)
	}
	if got := c.GetString(ctxkey.PersonalProviderID); got != connection.Id {
		t.Fatalf("personal provider ID = %q, want %q", got, connection.Id)
	}
}

func TestTokenMonetaryQuotaExhaustedUsesTokenAuthSnapshot(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	if tokenMonetaryQuotaExhausted(c) {
		t.Fatal("missing token snapshot must not block request")
	}
	c.Set(ctxkey.TokenRemainQuota, int64(0))
	c.Set(ctxkey.TokenUnlimitedQuota, false)
	if !tokenMonetaryQuotaExhausted(c) {
		t.Fatal("zero finite monetary quota must block a community selection")
	}
	c.Set(ctxkey.TokenUnlimitedQuota, true)
	if tokenMonetaryQuotaExhausted(c) {
		t.Fatal("unlimited monetary quota must not block request")
	}
}

func TestDistributePersonalOnlyRejectsMissingConnectionBeforeCommunityLookup(t *testing.T) {
	newPersonalProviderRoutingTestDB(t)
	c, recorder := newPersonalProviderRelayContext(t, "private-model", model.PersonalRoutePolicyPersonalOnly)

	Distribute()(c)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), "没有可用的个人供应商连接") {
		t.Fatalf("missing connection response = %s", recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "no such table") {
		t.Fatalf("personal-only request attempted community entitlement lookup: %s", recorder.Body.String())
	}
}
