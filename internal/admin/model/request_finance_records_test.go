package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestFinanceRecordsBackfillFromConsumeLogs(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-records?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}); err != nil {
		t.Fatalf("migrate logs: %v", err)
	}
	if err := db.Create(&Log{Id: "log-1", Type: LogTypeConsume, UserId: "user-1", ChannelId: "channel-1", BillingChargeAmount: 42, BillingProcurementCostStatus: ProcurementCostAttributionStatusPending}).Error; err != nil {
		t.Fatalf("create log: %v", err)
	}
	if err := migrateRequestFinanceRecordsWithDB(db); err != nil {
		t.Fatalf("backfill records: %v", err)
	}
	log2 := &Log{Id: "log-2", Type: LogTypeConsume, UserId: "user-2", BillingChargeAmount: 77, PromptTokens: 3, CompletionTokens: 4}
	if err := db.Create(log2).Error; err != nil {
		t.Fatalf("create second log: %v", err)
	}
	if err := RecordFinanceRecordsForLog(db, log2); err != nil {
		t.Fatalf("record normalized records: %v", err)
	}
	if err := CheckFinanceRecordConsistency(db, "log-2"); err != nil {
		t.Fatalf("consistency check: %v", err)
	}
	var settlement BillingSettlement
	if err := db.First(&settlement, "request_log_id = ?", "log-1").Error; err != nil {
		t.Fatalf("load settlement: %v", err)
	}
	if settlement.ChargeAmount != 42 || settlement.UserID != "user-1" {
		t.Fatalf("settlement = %+v", settlement)
	}
	var attribution ProcurementAttribution
	if err := db.First(&attribution, "request_log_id = ?", "log-1").Error; err != nil {
		t.Fatalf("load attribution: %v", err)
	}
	if attribution.ChannelID != "channel-1" || attribution.Status != ProcurementCostAttributionStatusPending {
		t.Fatalf("attribution = %+v", attribution)
	}
	if err := migrateRequestFinanceRecordsWithDB(db); err != nil {
		t.Fatalf("repeat backfill records: %v", err)
	}
}

func TestLegacyProcurementRetryHelpersUseNormalizedRecords(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-retry-helpers?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&Log{}, &ProcurementAttribution{}); err != nil {
		t.Fatalf("migrate records: %v", err)
	}
	log := Log{Id: "retry-log", Type: LogTypeConsume, CreatedAt: 100, BillingProcurementCostStatus: ProcurementCostAttributionStatusNone}
	if err := db.Create(&log).Error; err != nil {
		t.Fatalf("create log: %v", err)
	}
	if err := db.Create(&ProcurementAttribution{RequestLogID: log.Id, CreatedAt: log.CreatedAt, Status: ProcurementCostAttributionStatusRetry}).Error; err != nil {
		t.Fatalf("create attribution: %v", err)
	}

	rows, err := ListProcurementRetryLogs(db, 10, 200)
	if err != nil {
		t.Fatalf("list retry logs: %v", err)
	}
	if len(rows) != 1 || rows[0].Id != log.Id {
		t.Fatalf("retry logs = %+v", rows)
	}
	if _, err := GetProcurementRetryLog(db, log.Id); err != nil {
		t.Fatalf("get retry log: %v", err)
	}

	if err := MarkProcurementRetryFailureWithDB(db, log.Id, "upstream timeout", 123); err != nil {
		t.Fatalf("mark retry failure: %v", err)
	}
	var attribution ProcurementAttribution
	if err := db.First(&attribution, "request_log_id = ?", log.Id).Error; err != nil {
		t.Fatalf("load attribution: %v", err)
	}
	if attribution.RetryCount != 1 || attribution.LastRetryAt != 123 || attribution.LastError != "upstream timeout" {
		t.Fatalf("attribution = %+v", attribution)
	}
	if err := ClearProcurementRetryFailureWithDB(db, log.Id); err != nil {
		t.Fatalf("clear retry failure: %v", err)
	}
	if err := db.First(&attribution, "request_log_id = ?", log.Id).Error; err != nil {
		t.Fatalf("reload attribution: %v", err)
	}
	if attribution.LastError != "" {
		t.Fatalf("last error = %q", attribution.LastError)
	}
}
