package model

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	BillingSettlementsTableName      = "billing_settlements"
	ProcurementAttributionsTableName = "procurement_attributions"
)

// BillingSettlement owns the immutable pricing and usage snapshot for one
// request. RequestLogID is the stable migration key from event_logs.
type BillingSettlement struct {
	RequestLogID             string  `gorm:"type:char(36);primaryKey"`
	UserID                   string  `gorm:"type:char(36);index"`
	CreatedAt                int64   `gorm:"bigint;index"`
	Source                   string  `gorm:"type:varchar(32);index;default:''"`
	SourceID                 string  `gorm:"type:char(36);index;default:''"`
	SourceName               string  `gorm:"type:varchar(255);default:''"`
	SourceDetail             string  `gorm:"type:varchar(255);default:''"`
	PriceUnit                string  `gorm:"type:varchar(64);default:''"`
	Currency                 string  `gorm:"type:varchar(16);default:''"`
	PricingSource            string  `gorm:"type:varchar(64);default:''"`
	UsageSource              string  `gorm:"type:varchar(64);default:''"`
	EstimateSource           string  `gorm:"type:varchar(64);default:''"`
	EstimateEstimator        string  `gorm:"type:varchar(64);default:''"`
	EstimatePrecision        string  `gorm:"type:varchar(32);default:''"`
	SettlementMode           string  `gorm:"type:varchar(64);default:''"`
	SettlementTruthMode      string  `gorm:"type:varchar(64);default:''"`
	EffectiveRatio           float64 `gorm:"type:double precision;default:0"`
	GroupChannelRatio        float64 `gorm:"type:double precision;default:0"`
	ModelChannelRatio        float64 `gorm:"type:double precision;default:0"`
	ChargeRate               float64 `gorm:"type:double precision;default:0"`
	InputQuantity            float64 `gorm:"type:double precision;default:0"`
	OutputQuantity           float64 `gorm:"type:double precision;default:0"`
	CacheReadQuantity        float64 `gorm:"type:double precision;default:0"`
	CacheWriteQuantity       float64 `gorm:"type:double precision;default:0"`
	InputAmount              float64 `gorm:"type:double precision;default:0"`
	OutputAmount             float64 `gorm:"type:double precision;default:0"`
	CacheReadAmount          float64 `gorm:"type:double precision;default:0"`
	CacheWriteAmount         float64 `gorm:"type:double precision;default:0"`
	Amount                   float64 `gorm:"type:double precision;default:0"`
	ChargeAmount             int64   `gorm:"bigint;default:0"`
	OfficialAnchorAmount     float64 `gorm:"type:double precision;default:0"`
	OfficialAnchorCurrency   string  `gorm:"type:varchar(16);default:''"`
	OfficialAnchorBaseAmount float64 `gorm:"type:double precision;default:0"`
	SellBaseAmount           float64 `gorm:"type:double precision;default:0"`
	CostFloorBaseAmount      float64 `gorm:"type:double precision;default:0"`
	SelectedSellBaseAmount   float64 `gorm:"type:double precision;default:0"`
	PricingDecisionReason    string  `gorm:"type:varchar(64);default:''"`
	CostFloorTriggered       bool    `gorm:"default:false"`
	PricingRuleVersion       string  `gorm:"type:varchar(64);default:''"`
	Decision                 string  `gorm:"type:text"`
	EstimatedPromptTokens    int     `gorm:"default:0"`
	EstimatedOutputTokens    int     `gorm:"default:0"`
	EstimatedChargeAmount    int64   `gorm:"bigint;default:0"`
	PromptTokens             int     `gorm:"default:0"`
	CompletionTokens         int     `gorm:"default:0"`
	PromptTokenDelta         int     `gorm:"default:0"`
	OutputTokenDelta         int     `gorm:"default:0"`
	ChargeDeltaAmount        int64   `gorm:"bigint;default:0"`
}

func (BillingSettlement) TableName() string { return BillingSettlementsTableName }

// ProcurementAttribution owns procurement cost calculation and retry state.
type ProcurementAttribution struct {
	RequestLogID          string  `gorm:"type:char(36);primaryKey"`
	ChannelID             string  `gorm:"type:varchar(64);index"`
	CreatedAt             int64   `gorm:"bigint;index"`
	CostBaseAmount        float64 `gorm:"type:double precision;default:0"`
	CostSource            string  `gorm:"type:varchar(32);default:''"`
	CostConfidence        string  `gorm:"type:varchar(64);default:''"`
	Status                string  `gorm:"type:varchar(32);index;default:''"`
	GrossProfitBaseAmount float64 `gorm:"type:double precision;default:0"`
	GrossMargin           float64 `gorm:"type:double precision;default:0"`
	CostRuleVersion       string  `gorm:"type:varchar(64);default:''"`
	RetryCount            int     `gorm:"default:0"`
	LastRetryAt           int64   `gorm:"bigint;default:0"`
	LastError             string  `gorm:"type:text"`
}

func (ProcurementAttribution) TableName() string { return ProcurementAttributionsTableName }

func migrateRequestFinanceRecordsWithDB(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if err := db.AutoMigrate(&BillingSettlement{}, &ProcurementAttribution{}); err != nil {
		return err
	}
	return db.Where("type = ?", LogTypeConsume).FindInBatches(&[]Log{}, 500, func(batch *gorm.DB, _ int) error {
		var rows []Log
		if err := batch.Find(&rows).Error; err != nil {
			return err
		}
		settlements := make([]BillingSettlement, 0, len(rows))
		attributions := make([]ProcurementAttribution, 0, len(rows))
		for i := range rows {
			settlements = append(settlements, billingSettlementFromLog(&rows[i]))
			attributions = append(attributions, procurementAttributionFromLog(&rows[i]))
		}
		if len(settlements) > 0 {
			if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&settlements).Error; err != nil {
				return err
			}
		}
		if len(attributions) > 0 {
			if err := db.Clauses(clause.OnConflict{DoNothing: true}).Create(&attributions).Error; err != nil {
				return err
			}
		}
		return nil
	}).Error
}

func billingSettlementFromLog(row *Log) BillingSettlement {
	if row == nil {
		return BillingSettlement{}
	}
	return BillingSettlement{
		RequestLogID: row.Id, UserID: row.UserId, CreatedAt: row.CreatedAt,
		Source: row.BillingSource, SourceID: row.BillingSourceID, SourceName: row.BillingSourceName, SourceDetail: row.BillingSourceDetail,
		PriceUnit: row.BillingPriceUnit, Currency: row.BillingCurrency, PricingSource: row.BillingPricingSource, UsageSource: row.BillingUsageSource,
		EstimateSource: row.BillingEstimateSource, EstimateEstimator: row.BillingEstimateEstimator, EstimatePrecision: row.BillingEstimatePrecision,
		SettlementMode: row.BillingSettlementMode, SettlementTruthMode: row.BillingSettlementTruthMode,
		EffectiveRatio: row.BillingEffectiveRatio, GroupChannelRatio: row.BillingGroupChannelRatio, ModelChannelRatio: row.BillingModelChannelRatio, ChargeRate: row.BillingChargeRate,
		InputQuantity: row.BillingInputQuantity, OutputQuantity: row.BillingOutputQuantity, CacheReadQuantity: row.BillingCacheReadQuantity, CacheWriteQuantity: row.BillingCacheWriteQuantity,
		InputAmount: row.BillingInputAmount, OutputAmount: row.BillingOutputAmount, CacheReadAmount: row.BillingCacheReadAmount, CacheWriteAmount: row.BillingCacheWriteAmount,
		Amount: row.BillingAmount, ChargeAmount: row.BillingChargeAmount,
		OfficialAnchorAmount: row.BillingOfficialAnchorAmount, OfficialAnchorCurrency: row.BillingOfficialAnchorCurrency, OfficialAnchorBaseAmount: row.BillingOfficialAnchorBaseAmount,
		SellBaseAmount: row.BillingSellBaseAmount, CostFloorBaseAmount: row.BillingCostFloorBaseAmount, SelectedSellBaseAmount: row.BillingSelectedSellBaseAmount,
		PricingDecisionReason: row.BillingPricingDecisionReason, CostFloorTriggered: row.BillingCostFloorTriggered, PricingRuleVersion: row.BillingPricingRuleVersion, Decision: row.BillingDecision,
		EstimatedPromptTokens: row.EstimatedPromptTokens, EstimatedOutputTokens: row.EstimatedOutputTokens, EstimatedChargeAmount: row.EstimatedChargeAmount,
		PromptTokens: row.PromptTokens, CompletionTokens: row.CompletionTokens, PromptTokenDelta: row.BillingPromptTokenDelta, OutputTokenDelta: row.BillingOutputTokenDelta, ChargeDeltaAmount: row.BillingChargeDeltaAmount,
	}
}

func procurementAttributionFromLog(row *Log) ProcurementAttribution {
	if row == nil {
		return ProcurementAttribution{}
	}
	return ProcurementAttribution{
		RequestLogID: row.Id, ChannelID: row.ChannelId, CreatedAt: row.CreatedAt,
		CostBaseAmount: row.BillingProcurementCostBaseAmount, CostSource: row.BillingProcurementCostSource,
		CostConfidence: row.BillingProcurementCostConfidence, Status: row.BillingProcurementCostStatus,
		GrossProfitBaseAmount: row.BillingGrossProfitBaseAmount, GrossMargin: row.BillingGrossMargin,
		CostRuleVersion: row.BillingCostRuleVersion, RetryCount: row.BillingProcurementRetryCount,
		LastRetryAt: row.BillingProcurementLastRetryAt, LastError: row.BillingProcurementLastError,
	}
}

// ListProcurementRetryLogs reads retry state from the normalized attribution
// table while returning the legacy request log needed by existing billing code.
func ListProcurementRetryLogs(db *gorm.DB, limit int, maxCreatedAt int64) ([]Log, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	if limit <= 0 {
		limit = 20
	}
	query := db.Table(ProcurementAttributionsTableName+" pa").
		Select("el.*").
		Joins("JOIN "+EventLogsTableName+" el ON el.id = pa.request_log_id").
		Where("el.type = ? AND pa.status = ?", LogTypeConsume, ProcurementCostAttributionStatusRetry)
	if maxCreatedAt > 0 {
		query = query.Where("pa.created_at <= ?", maxCreatedAt)
	}
	rows := make([]Log, 0, limit)
	if err := query.Order("pa.last_retry_at ASC, pa.created_at ASC, pa.request_log_id ASC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func GetProcurementRetryLog(db *gorm.DB, logID string) (*Log, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	id := strings.TrimSpace(logID)
	if id == "" {
		return nil, fmt.Errorf("log id is required")
	}
	row := &Log{}
	err := db.Table(EventLogsTableName+" el").
		Select("el.*").
		Joins("JOIN "+ProcurementAttributionsTableName+" pa ON pa.request_log_id = el.id").
		Where("el.id = ? AND el.type = ? AND pa.status = ?", id, LogTypeConsume, ProcurementCostAttributionStatusRetry).
		First(row).Error
	return row, err
}

func updateProcurementAttribution(db *gorm.DB, logID string, updates map[string]any) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	id := strings.TrimSpace(logID)
	if id == "" || len(updates) == 0 {
		return nil
	}
	if !db.Migrator().HasTable(&ProcurementAttribution{}) {
		return nil
	}
	return db.Model(&ProcurementAttribution{}).Where("request_log_id = ?", id).Updates(updates).Error
}

func MarkProcurementRetryFailure(logID, message string, retriedAt int64) error {
	return updateProcurementAttribution(LOG_DB, logID, map[string]any{
		"status": ProcurementCostAttributionStatusRetry, "retry_count": gorm.Expr("retry_count + 1"), "last_retry_at": retriedAt, "last_error": message,
	})
}

func ClearProcurementRetryFailure(logID string) error {
	return updateProcurementAttribution(LOG_DB, logID, map[string]any{"last_error": ""})
}

// RecordFinanceRecordsForLog writes the normalized records for newly created
// consume logs. It is intentionally best-effort during the compatibility
// window; event_logs remains the rollback source until the final cleanup.
func RecordFinanceRecordsForLog(db *gorm.DB, row *Log) error {
	if db == nil || row == nil || strings.TrimSpace(row.Id) == "" || row.Type != LogTypeConsume {
		return nil
	}
	if !db.Migrator().HasTable(&BillingSettlement{}) || !db.Migrator().HasTable(&ProcurementAttribution{}) {
		return nil
	}
	settlement := billingSettlementFromLog(row)
	if err := db.Clauses(clause.OnConflict{UpdateAll: true}).Create(&settlement).Error; err != nil {
		return err
	}
	attribution := procurementAttributionFromLog(row)
	return db.Clauses(clause.OnConflict{UpdateAll: true}).Create(&attribution).Error
}

func CheckFinanceRecordConsistency(db *gorm.DB, logID string) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	id := strings.TrimSpace(logID)
	if id == "" {
		return fmt.Errorf("log id is required")
	}
	var logRow Log
	if err := db.First(&logRow, "id = ?", id).Error; err != nil {
		return err
	}
	var settlement BillingSettlement
	if err := db.First(&settlement, "request_log_id = ?", id).Error; err != nil {
		return err
	}
	if settlement.ChargeAmount != logRow.BillingChargeAmount || settlement.PromptTokens != logRow.PromptTokens || settlement.CompletionTokens != logRow.CompletionTokens {
		return fmt.Errorf("billing settlement mismatch for log %s", id)
	}
	return nil
}
