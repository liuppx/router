package model

import (
	"math"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestLoadChannelRuntimeMetricsUsesRealTrafficAndIsolatesPersonalOwner(t *testing.T) {
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
		{Id: "managed-success", UserId: "user-a", CreatedAt: 110, Type: LogTypeConsume, ChannelId: "managed-1", ElapsedTime: 100, PromptTokens: 10, CompletionTokens: 5, Quota: 20},
		{Id: "managed-failure", UserId: "user-a", CreatedAt: 120, Type: LogTypeRelayFailure, ChannelId: "managed-1", ElapsedTime: 300},
		{Id: "managed-abort", UserId: "user-a", CreatedAt: 130, Type: LogTypeRelayFailure, ChannelId: "managed-1", ElapsedTime: 900, RelayErrorType: "client_abort"},
		{Id: "personal-owner", UserId: "user-a", CreatedAt: 140, Type: LogTypeConsume, ChannelId: "personal:personal-1", PersonalProviderId: "personal-1", ElapsedTime: 80},
		{Id: "personal-other-user", UserId: "user-b", CreatedAt: 150, Type: LogTypeConsume, ChannelId: "personal:personal-1", PersonalProviderId: "personal-1", ElapsedTime: 40},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed logs: %v", err)
	}

	metrics, err := LoadChannelRuntimeMetrics(ChannelRuntimeMetricQuery{
		Window:     ChannelMetricWindow{Period: ChannelMetricPeriodLastHour, StartAt: 100, EndAt: 200, IntervalSeconds: 50},
		ChannelIDs: []string{"managed-1"}, PersonalProviderIDs: []string{"personal-1"}, UserID: "user-a",
	})
	if err != nil {
		t.Fatalf("LoadChannelRuntimeMetrics: %v", err)
	}
	managed := metrics["managed-1"]
	if managed.SuccessCount != 1 || managed.FailureCount != 1 || managed.RequestCount != 2 {
		t.Fatalf("managed counts = %d/%d/%d, want 1/1/2", managed.SuccessCount, managed.FailureCount, managed.RequestCount)
	}
	if math.Abs(managed.SuccessRate-0.5) > 0.0001 || managed.AvgLatencyMs != 200 {
		t.Fatalf("managed rate/latency = %f/%d, want 0.5/200", managed.SuccessRate, managed.AvgLatencyMs)
	}
	if managed.LastObservedAt != 120 {
		t.Fatalf("managed last observed = %d, want 120 with client abort excluded", managed.LastObservedAt)
	}
	if managed.PromptTokens != 10 || managed.OutputTokens != 5 || managed.TotalTokens != 15 || managed.SpendQuota != 20 {
		t.Fatalf("managed token/quota metrics = %#v", managed)
	}
	personal := metrics[PersonalProviderChannelPrefix+"personal-1"]
	if personal.SuccessCount != 1 || personal.RequestCount != 1 || personal.AvgLatencyMs != 80 {
		t.Fatalf("personal metrics = %#v, want only user-a traffic", personal)
	}
}
