package controller

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/internal/admin/cache"
	"github.com/yeying-community/router/internal/admin/model"
)

const (
	modelRankingScopeMe     = "me"
	modelRankingScopeGlobal = "global"

	modelRankingSampleSufficient   = "sufficient"
	modelRankingSampleInsufficient = "insufficient"

	publicGlobalMinModelRequests = int64(5)
	publicGlobalMinModelUsers    = int64(2)
)

const modelRankingCacheTTL = 30 * time.Second

var modelRankingCache = cache.NewTTL(32)

type ModelRankingItem struct {
	Rank                   int      `json:"rank"`
	Model                  string   `json:"model"`
	Provider               string   `json:"provider"`
	Tags                   []string `json:"tags"`
	Published              bool     `json:"published"`
	SampleState            string   `json:"sample_state"`
	Suppressed             bool     `json:"suppressed"`
	RequestCount           int64    `json:"request_count"`
	ShareRate              float64  `json:"share_rate"`
	PromptTokens           int64    `json:"prompt_tokens"`
	OutputTokens           int64    `json:"output_tokens"`
	TotalTokens            int64    `json:"total_tokens"`
	SpendQuota             *int64   `json:"spend_quota,omitempty"`
	LastUsedAt             int64    `json:"last_used_at"`
	HealthLevel            string   `json:"health_level"`
	HealthScore            int      `json:"health_score"`
	PassRate               float64  `json:"pass_rate"`
	AvgLatencyMs           int64    `json:"avg_latency_ms"`
	LastSignalAt           int64    `json:"last_signal_at"`
	ChannelCount           int      `json:"channel_count"`
	SupportedEndpointCount int      `json:"supported_endpoint_count"`
}

type ModelRankingPayload struct {
	Scope                  string             `json:"scope"`
	Period                 string             `json:"period"`
	StartAt                int64              `json:"start_at"`
	EndAt                  int64              `json:"end_at"`
	GeneratedAt            int64              `json:"generated_at"`
	TotalRequestCount      int64              `json:"total_request_count"`
	TotalTokens            int64              `json:"total_tokens"`
	PublicMinRequestCount  int64              `json:"public_min_request_count"`
	PublicMinDistinctUsers int64              `json:"public_min_distinct_users"`
	Items                  []ModelRankingItem `json:"items"`
}

type modelRankingCandidate struct {
	metric     model.ModelUsageMetric
	status     UserModelStatusItem
	published  bool
	suppressed bool
}

func normalizeModelRankingScope(raw string, defaultScope string) (string, bool) {
	scope := strings.TrimSpace(strings.ToLower(raw))
	if scope == "" {
		scope = defaultScope
	}
	switch scope {
	case modelRankingScopeMe, modelRankingScopeGlobal:
		return scope, true
	default:
		return "", false
	}
}

func normalizeModelRankingPeriod(raw string) (string, bool) {
	period := strings.TrimSpace(strings.ToLower(raw))
	if period == "" {
		return model.ModelUsagePeriodLast7Days, true
	}
	switch period {
	case model.ModelUsagePeriodLast24Hours,
		model.ModelUsagePeriodLast7Days,
		model.ModelUsagePeriodLast30Days:
		return period, true
	default:
		return "", false
	}
}

func modelStatusByName(payload UserModelStatusPayload) map[string]UserModelStatusItem {
	result := make(map[string]UserModelStatusItem, len(payload.Models))
	for _, item := range payload.Models {
		modelName := strings.TrimSpace(item.Model)
		if modelName != "" {
			result[modelName] = item
		}
	}
	return result
}

func publishedModelNames(payload UserModelStatusPayload) []string {
	result := make([]string, 0, len(payload.Models))
	for _, item := range payload.Models {
		if modelName := strings.TrimSpace(item.Model); modelName != "" {
			result = append(result, modelName)
		}
	}
	return result
}

func buildModelRankingPayload(
	statusPayload UserModelStatusPayload,
	usageByModel map[string]model.ModelUsageMetric,
	window model.ModelUsageWindow,
	scope string,
	isAdmin bool,
	generatedAt int64,
) ModelRankingPayload {
	statusByModel := modelStatusByName(statusPayload)
	candidates := make([]modelRankingCandidate, 0, len(usageByModel))
	for modelName, metric := range usageByModel {
		modelName = strings.TrimSpace(modelName)
		if modelName == "" || metric.RequestCount <= 0 {
			continue
		}
		status, published := statusByModel[modelName]
		suppressed := scope == modelRankingScopeGlobal && !isAdmin &&
			(metric.RequestCount < publicGlobalMinModelRequests || metric.DistinctUserCount < publicGlobalMinModelUsers)
		candidates = append(candidates, modelRankingCandidate{
			metric: metric, status: status, published: published, suppressed: suppressed,
		})
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		left, right := candidates[i], candidates[j]
		if left.suppressed != right.suppressed {
			return !left.suppressed
		}
		if !left.suppressed && left.metric.RequestCount != right.metric.RequestCount {
			return left.metric.RequestCount > right.metric.RequestCount
		}
		if !left.suppressed && left.metric.TotalTokens != right.metric.TotalTokens {
			return left.metric.TotalTokens > right.metric.TotalTokens
		}
		return strings.TrimSpace(left.metric.Model) < strings.TrimSpace(right.metric.Model)
	})

	payload := ModelRankingPayload{
		Scope:                  scope,
		Period:                 window.Period,
		StartAt:                window.StartAt,
		EndAt:                  window.EndAt,
		GeneratedAt:            generatedAt,
		PublicMinRequestCount:  publicGlobalMinModelRequests,
		PublicMinDistinctUsers: publicGlobalMinModelUsers,
		Items:                  make([]ModelRankingItem, 0, len(candidates)),
	}
	for _, candidate := range candidates {
		if candidate.suppressed {
			continue
		}
		payload.TotalRequestCount += candidate.metric.RequestCount
		payload.TotalTokens += candidate.metric.TotalTokens
	}
	rank := 0
	for _, candidate := range candidates {
		metric := candidate.metric
		status := candidate.status
		provider := strings.TrimSpace(status.Provider)
		if provider == "" {
			provider = strings.TrimSpace(metric.Provider)
		}
		item := ModelRankingItem{
			Model:                  strings.TrimSpace(metric.Model),
			Provider:               provider,
			Tags:                   status.Tags,
			Published:              candidate.published,
			SampleState:            modelRankingSampleSufficient,
			RequestCount:           metric.RequestCount,
			PromptTokens:           metric.PromptTokens,
			OutputTokens:           metric.OutputTokens,
			TotalTokens:            metric.TotalTokens,
			LastUsedAt:             metric.LastUsedAt,
			HealthLevel:            status.HealthLevel,
			HealthScore:            status.HealthScore,
			PassRate:               status.PassRate,
			AvgLatencyMs:           status.AvgLatencyMs,
			LastSignalAt:           status.LastSignalAt,
			ChannelCount:           status.ChannelCount,
			SupportedEndpointCount: len(status.SupportedEndpoints),
		}
		if item.HealthLevel == "" {
			item.HealthLevel = userModelHealthLevelUnknown
		}
		if candidate.suppressed {
			item.SampleState = modelRankingSampleInsufficient
			item.Suppressed = true
			item.RequestCount = 0
			item.PromptTokens = 0
			item.OutputTokens = 0
			item.TotalTokens = 0
			item.LastUsedAt = 0
		} else {
			rank++
			item.Rank = rank
			if payload.TotalRequestCount > 0 {
				item.ShareRate = float64(metric.RequestCount) / float64(payload.TotalRequestCount)
			}
		}
		if isAdmin {
			spendQuota := metric.SpendQuota
			item.SpendQuota = &spendQuota
		}
		payload.Items = append(payload.Items, item)
	}
	return payload
}

func GetUserModelRanking(c *gin.Context) {
	isAdmin := c.GetInt(ctxkey.Role) >= model.RoleAdminUser
	defaultScope := modelRankingScopeMe
	if isAdmin {
		defaultScope = modelRankingScopeGlobal
	}
	scope, ok := normalizeModelRankingScope(c.Query("scope"), defaultScope)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "模型排行范围无效"})
		return
	}
	period, ok := normalizeModelRankingPeriod(c.Query("period"))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "模型排行周期无效"})
		return
	}
	userID := ""
	if scope == modelRankingScopeMe {
		userID = strings.TrimSpace(c.GetString(ctxkey.Id))
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "用户身份无效"})
			return
		}
	}
	window := model.ResolveModelUsageWindow(period, time.Now())
	cacheKey := strings.Join([]string{"model-ranking", scope, window.Period, map[bool]string{true: "admin", false: "public"}[isAdmin]}, "|")
	if scope == modelRankingScopeGlobal {
		if cached, exists := modelRankingCache.Get(cacheKey); exists {
			c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": cached})
			return
		}
	}

	statusPayload, err := buildUserModelStatusPayload(c)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
		return
	}
	query := model.ModelUsageMetricQuery{Window: window}
	if scope == modelRankingScopeMe {
		query.UserID = userID
	} else {
		query.Models = publishedModelNames(statusPayload)
	}
	usageByModel := make(map[string]model.ModelUsageMetric)
	if scope != modelRankingScopeGlobal || len(query.Models) > 0 {
		usageByModel, err = model.LoadModelUsageMetrics(query)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": err.Error()})
			return
		}
	}
	payload := buildModelRankingPayload(statusPayload, usageByModel, window, scope, isAdmin, time.Now().Unix())
	if scope == modelRankingScopeGlobal {
		modelRankingCache.Set(cacheKey, payload, modelRankingCacheTTL)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": payload})
}
