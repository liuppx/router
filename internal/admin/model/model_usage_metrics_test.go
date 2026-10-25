package model

import (
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestResolveModelUsageWindow(t *testing.T) {
	now := time.Unix(10_000_000, 0)
	tests := []struct {
		period string
		want   string
		span   int64
	}{
		{period: ModelUsagePeriodLast24Hours, want: ModelUsagePeriodLast24Hours, span: 24 * 60 * 60},
		{period: ModelUsagePeriodLast7Days, want: ModelUsagePeriodLast7Days, span: 7 * 24 * 60 * 60},
		{period: ModelUsagePeriodLast30Days, want: ModelUsagePeriodLast30Days, span: 30 * 24 * 60 * 60},
		{period: "invalid", want: ModelUsagePeriodLast7Days, span: 7 * 24 * 60 * 60},
	}
	for _, tt := range tests {
		t.Run(tt.period, func(t *testing.T) {
			window := ResolveModelUsageWindow(tt.period, now)
			if window.Period != tt.want {
				t.Fatalf("period = %q, want %q", window.Period, tt.want)
			}
			if window.EndAt-window.StartAt+1 != tt.span {
				t.Fatalf("span = %d, want %d", window.EndAt-window.StartAt+1, tt.span)
			}
		})
	}
}

func TestLoadModelUsageMetricsAggregatesSuccessfulRequestsAndIsolatesUser(t *testing.T) {
	previousLogDB := LOG_DB
	t.Cleanup(func() { LOG_DB = previousLogDB })
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	LOG_DB = db
	if err := db.AutoMigrate(&Log{}); err != nil {
		t.Fatalf("migrate logs: %v", err)
	}
	rows := []Log{
		{Id: "user-a-first", UserId: "user-a", CreatedAt: 110, Type: LogTypeConsume, RequestModelName: "gpt-5.4", ModelName: "gpt-5.4-upstream", Provider: "openai", PromptTokens: 10, CompletionTokens: 5, Quota: 20},
		{Id: "user-a-fallback-name", UserId: "user-a", CreatedAt: 120, Type: LogTypeConsume, ModelName: "claude-sonnet-4-6", Provider: "anthropic", PromptTokens: 3, CompletionTokens: 7, Quota: 30},
		{Id: "user-b", UserId: "user-b", CreatedAt: 130, Type: LogTypeConsume, RequestModelName: "gpt-5.4", Provider: "openai", PromptTokens: 4, CompletionTokens: 6, Quota: 40},
		{Id: "failed", UserId: "user-a", CreatedAt: 140, Type: LogTypeRelayFailure, RequestModelName: "gpt-5.4", Provider: "openai"},
		{Id: "outside", UserId: "user-a", CreatedAt: 210, Type: LogTypeConsume, RequestModelName: "gpt-5.4", Provider: "openai"},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed logs: %v", err)
	}

	window := ModelUsageWindow{Period: ModelUsagePeriodLast7Days, StartAt: 100, EndAt: 200}
	global, err := LoadModelUsageMetrics(ModelUsageMetricQuery{Window: window})
	if err != nil {
		t.Fatalf("LoadModelUsageMetrics global: %v", err)
	}
	gpt := global["gpt-5.4"]
	if gpt.RequestCount != 2 || gpt.DistinctUserCount != 2 || gpt.TotalTokens != 25 || gpt.SpendQuota != 60 || gpt.LastUsedAt != 130 {
		t.Fatalf("global gpt metrics = %#v", gpt)
	}
	claude := global["claude-sonnet-4-6"]
	if claude.RequestCount != 1 || claude.TotalTokens != 10 || claude.Provider != "anthropic" {
		t.Fatalf("global claude metrics = %#v", claude)
	}

	personal, err := LoadModelUsageMetrics(ModelUsageMetricQuery{Window: window, UserID: "user-a"})
	if err != nil {
		t.Fatalf("LoadModelUsageMetrics personal: %v", err)
	}
	if personal["gpt-5.4"].RequestCount != 1 || personal["gpt-5.4"].TotalTokens != 15 {
		t.Fatalf("personal gpt metrics = %#v", personal["gpt-5.4"])
	}
	if personal["gpt-5.4"].DistinctUserCount != 1 {
		t.Fatalf("personal distinct users = %d, want 1", personal["gpt-5.4"].DistinctUserCount)
	}
}

func TestLoadModelUsageMetricsFiltersModels(t *testing.T) {
	previousLogDB := LOG_DB
	t.Cleanup(func() { LOG_DB = previousLogDB })
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	LOG_DB = db
	if err := db.AutoMigrate(&Log{}); err != nil {
		t.Fatalf("migrate logs: %v", err)
	}
	if err := db.Create(&[]Log{
		{Id: "gpt", UserId: "user-a", CreatedAt: 110, Type: LogTypeConsume, RequestModelName: "gpt-5.4"},
		{Id: "claude", UserId: "user-a", CreatedAt: 120, Type: LogTypeConsume, RequestModelName: "claude-sonnet-4-6"},
	}).Error; err != nil {
		t.Fatalf("seed logs: %v", err)
	}
	metrics, err := LoadModelUsageMetrics(ModelUsageMetricQuery{
		Window: ModelUsageWindow{Period: ModelUsagePeriodLast7Days, StartAt: 100, EndAt: 200},
		Models: []string{"gpt-5.4"},
	})
	if err != nil {
		t.Fatalf("LoadModelUsageMetrics: %v", err)
	}
	if len(metrics) != 1 || metrics["gpt-5.4"].RequestCount != 1 {
		t.Fatalf("filtered metrics = %#v", metrics)
	}
}
