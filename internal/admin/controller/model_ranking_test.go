package controller

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/admin/model"
)

func TestBuildModelRankingPayloadSuppressesSmallPublicGlobalSamples(t *testing.T) {
	status := UserModelStatusPayload{Models: []UserModelStatusItem{
		{Model: "gpt-5.4", Provider: "openai", HealthLevel: userModelHealthLevelHealthy, HealthScore: 96, PassRate: 0.99, AvgLatencyMs: 800, ChannelCount: 3, SupportedEndpoints: []string{"/v1/responses"}},
		{Model: "claude-sonnet-4-6", Provider: "anthropic", HealthLevel: userModelHealthLevelWarning, HealthScore: 78},
	}}
	usage := map[string]model.ModelUsageMetric{
		"gpt-5.4":           {Model: "gpt-5.4", RequestCount: 10, DistinctUserCount: 3, TotalTokens: 100, SpendQuota: 50},
		"claude-sonnet-4-6": {Model: "claude-sonnet-4-6", RequestCount: 4, DistinctUserCount: 1, TotalTokens: 40, SpendQuota: 20},
	}
	window := model.ModelUsageWindow{Period: model.ModelUsagePeriodLast7Days, StartAt: 100, EndAt: 200}
	payload := buildModelRankingPayload(status, usage, window, modelRankingScopeGlobal, false, 300)
	if payload.TotalRequestCount != 10 || payload.TotalTokens != 100 {
		t.Fatalf("public totals = %d/%d, want 10/100", payload.TotalRequestCount, payload.TotalTokens)
	}
	if len(payload.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(payload.Items))
	}
	if payload.Items[0].Model != "gpt-5.4" || payload.Items[0].Rank != 1 || payload.Items[0].RequestCount != 10 || payload.Items[0].ShareRate != 1 {
		t.Fatalf("public first item = %#v", payload.Items[0])
	}
	if !payload.Items[1].Suppressed || payload.Items[1].SampleState != modelRankingSampleInsufficient || payload.Items[1].RequestCount != 0 || payload.Items[1].Rank != 0 {
		t.Fatalf("public suppressed item = %#v", payload.Items[1])
	}
	if payload.Items[0].SpendQuota != nil || payload.Items[1].SpendQuota != nil {
		t.Fatalf("public items exposed admin spend: %#v", payload.Items)
	}
}

func TestBuildModelRankingPayloadKeepsFullAdminMetrics(t *testing.T) {
	status := UserModelStatusPayload{Models: []UserModelStatusItem{
		{Model: "gpt-5.4", Provider: "openai", HealthLevel: userModelHealthLevelHealthy},
		{Model: "claude-sonnet-4-6", Provider: "anthropic", HealthLevel: userModelHealthLevelWarning},
	}}
	usage := map[string]model.ModelUsageMetric{
		"gpt-5.4":           {Model: "gpt-5.4", RequestCount: 10, DistinctUserCount: 3, TotalTokens: 100, SpendQuota: 50},
		"claude-sonnet-4-6": {Model: "claude-sonnet-4-6", RequestCount: 4, DistinctUserCount: 1, TotalTokens: 40, SpendQuota: 20},
	}
	payload := buildModelRankingPayload(status, usage, model.ModelUsageWindow{Period: model.ModelUsagePeriodLast7Days, StartAt: 100, EndAt: 200}, modelRankingScopeGlobal, true, 300)
	if payload.TotalRequestCount != 14 || payload.TotalTokens != 140 {
		t.Fatalf("admin totals = %d/%d, want 14/140", payload.TotalRequestCount, payload.TotalTokens)
	}
	if payload.Items[1].Rank != 2 || payload.Items[1].Suppressed || payload.Items[1].RequestCount != 4 {
		t.Fatalf("admin second item = %#v", payload.Items[1])
	}
	if payload.Items[1].SpendQuota == nil || *payload.Items[1].SpendQuota != 20 {
		t.Fatalf("admin spend = %#v, want 20", payload.Items[1].SpendQuota)
	}
}

func TestBuildModelRankingPayloadIncludesPersonalHistoricalModel(t *testing.T) {
	usage := map[string]model.ModelUsageMetric{
		"retired-model": {Model: "retired-model", Provider: "custom", RequestCount: 2, DistinctUserCount: 1, TotalTokens: 20, LastUsedAt: 150},
	}
	payload := buildModelRankingPayload(UserModelStatusPayload{}, usage, model.ModelUsageWindow{Period: model.ModelUsagePeriodLast7Days, StartAt: 100, EndAt: 200}, modelRankingScopeMe, false, 300)
	if len(payload.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(payload.Items))
	}
	item := payload.Items[0]
	if item.Published || item.HealthLevel != userModelHealthLevelUnknown || item.Provider != "custom" || item.Rank != 1 {
		t.Fatalf("historical item = %#v", item)
	}
}

func TestNormalizeModelRankingScope(t *testing.T) {
	if got, ok := normalizeModelRankingScope("", modelRankingScopeGlobal); !ok || got != modelRankingScopeGlobal {
		t.Fatalf("default scope = %q/%t", got, ok)
	}
	if _, ok := normalizeModelRankingScope("users", modelRankingScopeMe); ok {
		t.Fatal("invalid scope accepted")
	}
}

func TestNormalizeModelRankingPeriod(t *testing.T) {
	if got, ok := normalizeModelRankingPeriod(""); !ok || got != model.ModelUsagePeriodLast7Days {
		t.Fatalf("default period = %q/%t", got, ok)
	}
	if got, ok := normalizeModelRankingPeriod(" LAST_30_DAYS "); !ok || got != model.ModelUsagePeriodLast30Days {
		t.Fatalf("normalized period = %q/%t", got, ok)
	}
	if _, ok := normalizeModelRankingPeriod("year"); ok {
		t.Fatal("invalid period accepted")
	}
}

func TestGetUserModelRankingRejectsInvalidInputBeforeQuerying(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name       string
		query      string
		userID     string
		wantStatus int
		wantMsg    string
	}{
		{name: "scope", query: "?scope=users", userID: "user-1", wantStatus: http.StatusBadRequest, wantMsg: "模型排行范围无效"},
		{name: "period", query: "?period=year", userID: "user-1", wantStatus: http.StatusBadRequest, wantMsg: "模型排行周期无效"},
		{name: "missing user", query: "?scope=me", wantStatus: http.StatusUnauthorized, wantMsg: "用户身份无效"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			router := gin.New()
			router.GET("/ranking", func(c *gin.Context) {
				c.Set(ctxkey.Role, model.RoleCommonUser)
				if tt.userID != "" {
					c.Set(ctxkey.Id, tt.userID)
				}
				GetUserModelRanking(c)
			})
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/ranking"+tt.query, nil)
			router.ServeHTTP(recorder, request)
			if recorder.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, tt.wantStatus, recorder.Body.String())
			}
			var body struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
			}
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if body.Success || body.Message != tt.wantMsg {
				t.Fatalf("response = %#v, want success=false message=%q", body, tt.wantMsg)
			}
		})
	}
}
