package model

import (
	"fmt"
	"strings"
	"time"
)

const (
	ModelUsagePeriodLast24Hours = "last_24_hours"
	ModelUsagePeriodLast7Days   = "last_7_days"
	ModelUsagePeriodLast30Days  = "last_30_days"
)

// ModelUsageWindow is intentionally separate from channel health windows:
// model usage expresses successful product adoption, while model health keeps
// its fixed five-hour traffic/probe window.
type ModelUsageWindow struct {
	Period  string `json:"period"`
	StartAt int64  `json:"start_at"`
	EndAt   int64  `json:"end_at"`
}

type ModelUsageMetric struct {
	Model             string `json:"model"`
	Provider          string `json:"provider"`
	RequestCount      int64  `json:"request_count"`
	DistinctUserCount int64  `json:"distinct_user_count"`
	PromptTokens      int64  `json:"prompt_tokens"`
	OutputTokens      int64  `json:"output_tokens"`
	TotalTokens       int64  `json:"total_tokens"`
	SpendQuota        int64  `json:"spend_quota"`
	LastUsedAt        int64  `json:"last_used_at"`
}

type ModelUsageMetricQuery struct {
	Window ModelUsageWindow
	UserID string
	Models []string
}

type modelUsageMetricRow struct {
	ModelName         string `gorm:"column:model_name"`
	Provider          string `gorm:"column:provider"`
	RequestCount      int64  `gorm:"column:request_count"`
	DistinctUserCount int64  `gorm:"column:distinct_user_count"`
	PromptTokens      int64  `gorm:"column:prompt_tokens"`
	OutputTokens      int64  `gorm:"column:output_tokens"`
	SpendQuota        int64  `gorm:"column:spend_quota"`
	LastUsedAt        int64  `gorm:"column:last_used_at"`
}

const modelUsageVisibleNameExpression = "COALESCE(NULLIF(TRIM(request_model_name), ''), NULLIF(TRIM(model_name), ''), NULLIF(TRIM(actual_model_name), ''))"

func ResolveModelUsageWindow(raw string, now time.Time) ModelUsageWindow {
	if now.IsZero() {
		now = time.Now()
	}
	period := strings.TrimSpace(strings.ToLower(raw))
	window := ModelUsageWindow{
		Period: ModelUsagePeriodLast7Days,
		EndAt:  now.Unix(),
	}
	switch period {
	case ModelUsagePeriodLast24Hours, "24h", "day":
		window.Period = ModelUsagePeriodLast24Hours
		window.StartAt = now.Add(-24*time.Hour).Unix() + 1
	case ModelUsagePeriodLast30Days, "30d", "month":
		window.Period = ModelUsagePeriodLast30Days
		window.StartAt = now.Add(-30*24*time.Hour).Unix() + 1
	default:
		window.StartAt = now.Add(-7*24*time.Hour).Unix() + 1
	}
	return window
}

// LoadModelUsageMetrics aggregates successful consume logs by the model name
// requested by the user. Relay failures deliberately do not count as product
// preference; they remain part of the independent model-health calculation.
func LoadModelUsageMetrics(query ModelUsageMetricQuery) (map[string]ModelUsageMetric, error) {
	result := make(map[string]ModelUsageMetric)
	if LOG_DB == nil {
		return result, nil
	}
	if query.Window.StartAt <= 0 || query.Window.EndAt < query.Window.StartAt {
		return nil, fmt.Errorf("模型用量时间范围无效")
	}

	models := normalizeTrimmedValuesPreserveOrder(query.Models)
	dbQuery := LOG_DB.Table(EventLogsTableName).
		Select(fmt.Sprintf(`
			%s AS model_name,
			COALESCE(MAX(NULLIF(TRIM(provider), '')), '') AS provider,
			COUNT(1) AS request_count,
			COUNT(DISTINCT user_id) AS distinct_user_count,
			COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
			COALESCE(SUM(completion_tokens), 0) AS output_tokens,
			COALESCE(SUM(quota), 0) AS spend_quota,
			COALESCE(MAX(created_at), 0) AS last_used_at
		`, modelUsageVisibleNameExpression)).
		Where("type = ?", LogTypeConsume).
		Where("created_at BETWEEN ? AND ?", query.Window.StartAt, query.Window.EndAt).
		Where(modelUsageVisibleNameExpression + " IS NOT NULL")
	if userID := strings.TrimSpace(query.UserID); userID != "" {
		dbQuery = dbQuery.Where("user_id = ?", userID)
	}
	if len(models) > 0 {
		dbQuery = dbQuery.Where(modelUsageVisibleNameExpression+" IN ?", models)
	}

	rows := make([]modelUsageMetricRow, 0)
	if err := dbQuery.
		Group(modelUsageVisibleNameExpression).
		Order("request_count DESC, model_name ASC").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		modelName := strings.TrimSpace(row.ModelName)
		if modelName == "" {
			continue
		}
		result[modelName] = ModelUsageMetric{
			Model:             modelName,
			Provider:          strings.TrimSpace(row.Provider),
			RequestCount:      row.RequestCount,
			DistinctUserCount: row.DistinctUserCount,
			PromptTokens:      row.PromptTokens,
			OutputTokens:      row.OutputTokens,
			TotalTokens:       row.PromptTokens + row.OutputTokens,
			SpendQuota:        row.SpendQuota,
			LastUsedAt:        row.LastUsedAt,
		}
	}
	return result, nil
}
