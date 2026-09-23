package personalprovider

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newPersonalProviderControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.PersonalProviderConnection{}, &model.PersonalModelRoute{}, &model.Log{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := model.DB
	previousLogDB := model.LOG_DB
	previousSecret := config.JWTSecret
	previousFallbacks := config.JWTFallbackSecrets
	model.DB = db
	model.LOG_DB = db
	config.JWTSecret = "personal-provider-controller-test-secret"
	config.JWTFallbackSecrets = nil
	t.Cleanup(func() {
		model.DB = previousDB
		model.LOG_DB = previousLogDB
		config.JWTSecret = previousSecret
		config.JWTFallbackSecrets = previousFallbacks
	})
	return db
}

func newPersonalProviderContext(t *testing.T, method string, path string, userID string, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	var requestBody *bytes.Reader
	if body == nil {
		requestBody = bytes.NewReader(nil)
	} else {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		requestBody = bytes.NewReader(encoded)
	}
	c.Request = httptest.NewRequest(method, path, requestBody)
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(ctxkey.Id, userID)
	return c, recorder
}

func decodePersonalProviderResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	payload := map[string]any{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response %q: %v", recorder.Body.String(), err)
	}
	return payload
}

func connectionPayload(name string, key string) map[string]any {
	return map[string]any{
		"name":     name,
		"protocol": "openai",
		"base_url": "",
		"api_key":  key,
		"models":   []string{"gpt-5.1"},
		"priority": 10,
		"status":   model.PersonalProviderStatusEnabled,
	}
}

func TestCreateConnectionNeverReturnsCredential(t *testing.T) {
	db := newPersonalProviderControllerTestDB(t)
	c, recorder := newPersonalProviderContext(t, http.MethodPost, "/connections", "user-a", connectionPayload("personal OpenAI", "sk-super-secret"))

	CreateConnection(c)

	payload := decodePersonalProviderResponse(t, recorder)
	if success, _ := payload["success"].(bool); !success {
		t.Fatalf("create response = %#v", payload)
	}
	if bytes.Contains(recorder.Body.Bytes(), []byte("sk-super-secret")) || bytes.Contains(recorder.Body.Bytes(), []byte("credential_encrypted")) {
		t.Fatalf("credential leaked in response: %s", recorder.Body.String())
	}
	data, ok := payload["data"].(map[string]any)
	if !ok || data["credential_configured"] != true {
		t.Fatalf("connection output = %#v", payload["data"])
	}
	var row model.PersonalProviderConnection
	if err := db.Where("user_id = ?", "user-a").First(&row).Error; err != nil {
		t.Fatalf("load stored connection: %v", err)
	}
	if row.CredentialEncrypted == "sk-super-secret" || row.CredentialEncrypted == "" {
		t.Fatalf("credential was not encrypted: %q", row.CredentialEncrypted)
	}
}

func TestUpdateConnectionWithoutAPIKeyKeepsCredential(t *testing.T) {
	db := newPersonalProviderControllerTestDB(t)
	row := &model.PersonalProviderConnection{
		UserId: "user-a", Name: "old name", Protocol: "openai", BaseURL: "",
		Models: []string{"gpt-5.1"}, Priority: 1,
	}
	if err := model.CreatePersonalProviderConnection(row, "sk-original"); err != nil {
		t.Fatalf("create connection: %v", err)
	}
	var before model.PersonalProviderConnection
	if err := db.First(&before, "id = ?", row.Id).Error; err != nil {
		t.Fatalf("load before update: %v", err)
	}
	payload := connectionPayload("new name", "")
	c, recorder := newPersonalProviderContext(t, http.MethodPut, "/connections/"+row.Id, "user-a", payload)
	c.Params = gin.Params{{Key: "id", Value: row.Id}}

	UpdateConnection(c)

	response := decodePersonalProviderResponse(t, recorder)
	if success, _ := response["success"].(bool); !success {
		t.Fatalf("update response = %#v", response)
	}
	var after model.PersonalProviderConnection
	if err := db.First(&after, "id = ?", row.Id).Error; err != nil {
		t.Fatalf("load after update: %v", err)
	}
	if after.CredentialEncrypted != before.CredentialEncrypted {
		t.Fatal("empty API key unexpectedly rotated the stored credential")
	}
}

func TestOtherUserCannotReadOrDeleteConnection(t *testing.T) {
	db := newPersonalProviderControllerTestDB(t)
	row := &model.PersonalProviderConnection{
		UserId: "user-a", Name: "private connection", Protocol: "openai", BaseURL: "",
		Models: []string{"gpt-5.1"}, Priority: 1,
	}
	if err := model.CreatePersonalProviderConnection(row, "sk-owner-only"); err != nil {
		t.Fatalf("create connection: %v", err)
	}

	getContext, getRecorder := newPersonalProviderContext(t, http.MethodGet, "/connections/"+row.Id, "user-b", nil)
	getContext.Params = gin.Params{{Key: "id", Value: row.Id}}
	GetConnection(getContext)
	getPayload := decodePersonalProviderResponse(t, getRecorder)
	if success, _ := getPayload["success"].(bool); success || getPayload["code"] != "personal_provider_not_found" {
		t.Fatalf("cross-user get response = %#v", getPayload)
	}

	deleteContext, deleteRecorder := newPersonalProviderContext(t, http.MethodDelete, "/connections/"+row.Id, "user-b", nil)
	deleteContext.Params = gin.Params{{Key: "id", Value: row.Id}}
	DeleteConnection(deleteContext)
	deletePayload := decodePersonalProviderResponse(t, deleteRecorder)
	if success, _ := deletePayload["success"].(bool); success || deletePayload["code"] != "personal_provider_not_found" {
		t.Fatalf("cross-user delete response = %#v", deletePayload)
	}
	var count int64
	if err := db.Model(&model.PersonalProviderConnection{}).Where("id = ?", row.Id).Count(&count).Error; err != nil {
		t.Fatalf("count connection: %v", err)
	}
	if count != 1 {
		t.Fatalf("cross-user delete removed owner connection, count=%d", count)
	}
}

func TestCreateConnectionRejectsUnsupportedProtocol(t *testing.T) {
	newPersonalProviderControllerTestDB(t)
	payload := connectionPayload("unsupported", "sk-secret")
	payload["protocol"] = "unsupported"
	c, recorder := newPersonalProviderContext(t, http.MethodPost, "/connections", "user-a", payload)

	CreateConnection(c)

	response := decodePersonalProviderResponse(t, recorder)
	if success, _ := response["success"].(bool); success {
		t.Fatalf("unsupported protocol unexpectedly succeeded: %#v", response)
	}
}

func TestRoutingQuotaCountsPersonalChannelID(t *testing.T) {
	db := newPersonalProviderControllerTestDB(t)
	now := time.Now().UTC()
	rows := []model.Log{
		{Id: "personal-current", UserId: "user-a", ChannelId: "personal:connection-a", CreatedAt: now.Unix()},
		{Id: "community-current", UserId: "user-a", ChannelId: "channel-a", CreatedAt: now.Unix()},
		{Id: "personal-other-user", UserId: "user-b", ChannelId: "personal:connection-b", CreatedAt: now.Unix()},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("create logs: %v", err)
	}
	c, recorder := newPersonalProviderContext(t, http.MethodGet, "/routing-quota", "user-a", nil)

	RoutingQuota(c)

	response := decodePersonalProviderResponse(t, recorder)
	if success, _ := response["success"].(bool); !success {
		t.Fatalf("routing quota response = %#v", response)
	}
	data, ok := response["data"].(map[string]any)
	if !ok || data["used_requests"] != float64(1) {
		t.Fatalf("routing quota data = %#v, want one personal request", response["data"])
	}
}
